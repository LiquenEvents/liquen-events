import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REPOSIÇÃO DE UMA CÓPIA DE SEGURANÇA — testes.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto escreve por cima do histórico de um negócio a sério. Os testes seguem
 * essa ordem de prioridades:
 *
 *   1. O PERCURSO REAL, ponta a ponta e sem atalhos: exportar → apagar tudo →
 *      repor → exportar outra vez → comparar. É a única prova de que a
 *      conversão de ida e volta (o `mapper` de cada store) não perde nada pelo
 *      caminho — e foi ela que apanhou o `created_at` que os `toRow` não
 *      escrevem.
 *   2. O CONTADOR DE FATURAS. Tem secção própria: repor um contador abaixo do
 *      número mais alto já emitido reemite números de fatura que já saíram, e
 *      num livro fiscal português isso é um problema legal.
 *   3. OS CASOS MAUS: ficheiro de outra aplicação, truncado, com um conjunto
 *      da forma errada, com ids repetidos, de uma versão futura.
 *   4. O ENSAIO NÃO ESCREVE. Verificado contando as escritas no cliente falso.
 *
 * A base de dados é um Supabase FALSO em memória (`fakeSupabase`), o que faz
 * correr o caminho de produção verdadeiro — os stores, os `mapper`, o
 * `SupabaseBackend` — em vez do fallback de ficheiro. Também conta cada
 * `delete`/`insert`/`upsert`, o que torna "o ensaio não escreveu nada" uma
 * asserção e não uma esperança.
 */

// ── Supabase falso (em memória) ─────────────────────────────────────────────

type Row = Record<string, unknown>;

const db = vi.hoisted(() => ({
  tables: new Map<string, Row[]>(),
  writes: [] as string[],
  /** Tabelas que devem falhar, e em que operação. */
  fail: new Map<string, "read" | "write" | "all">(),
  configured: true,
}));

function shouldFail(table: string, op: "read" | "write"): boolean {
  const mode = db.fail.get(table);
  return mode === "all" || mode === op;
}

function rowsOf(table: string): Row[] {
  if (!db.tables.has(table)) db.tables.set(table, []);
  return db.tables.get(table)!;
}

/**
 * Um construtor de consultas mínimo mas fiel ao que o código usa: `select`
 * (com `order`/`eq`/`maybeSingle`/`limit`), `insert`, `delete().not()` e
 * `upsert`. É `thenable`, como o do supabase-js, para poder ser esperado tanto
 * directamente como depois de `.order(...)`.
 */
function fakeSupabase() {
  const client = {
    from(table: string) {
      const api = {
        select() {
          const q: Record<string, unknown> = {};
          let filtered: Row[] | null = null;
          const builder = {
            order(column: string, opts?: { ascending?: boolean }) {
              q.order = { column, ascending: opts?.ascending !== false };
              return builder;
            },
            limit() {
              return builder;
            },
            eq(column: string, value: unknown) {
              filtered = (filtered ?? rowsOf(table)).filter((r) => r[column] === value);
              return builder;
            },
            async maybeSingle() {
              if (shouldFail(table, "read"))
                return { data: null, error: new Error(`${table} em baixo`) };
              return { data: (filtered ?? rowsOf(table))[0] ?? null, error: null };
            },
            then(resolve: (v: { data: Row[] | null; error: unknown }) => unknown) {
              if (shouldFail(table, "read")) {
                return Promise.resolve(
                  resolve({ data: null, error: new Error(`${table} em baixo`) }),
                );
              }
              let data = [...(filtered ?? rowsOf(table))];
              const order = q.order as { column: string; ascending: boolean } | undefined;
              if (order) {
                data.sort((a, b) => {
                  const x = String(a[order.column] ?? "");
                  const y = String(b[order.column] ?? "");
                  return order.ascending ? x.localeCompare(y) : y.localeCompare(x);
                });
              }
              data = data.map((r) => ({ ...r }));
              return Promise.resolve(resolve({ data, error: null }));
            },
          };
          return builder;
        },
        async insert(payload: Row | Row[]) {
          if (shouldFail(table, "write")) return { error: new Error(`${table} recusa escritas`) };
          const list = Array.isArray(payload) ? payload : [payload];
          db.writes.push(`insert:${table}:${list.length}`);
          rowsOf(table).push(...list.map((r) => ({ ...r })));
          return { error: null };
        },
        async upsert(payload: Row | Row[]) {
          if (shouldFail(table, "write")) return { error: new Error(`${table} recusa escritas`) };
          const list = Array.isArray(payload) ? payload : [payload];
          db.writes.push(`upsert:${table}:${list.length}`);
          const key = table === "invoice_counters" ? "year" : "id";
          for (const r of list) {
            const existing = rowsOf(table).find((x) => x[key] === r[key]);
            if (existing) Object.assign(existing, r);
            else rowsOf(table).push({ ...r });
          }
          return { error: null };
        },
        delete() {
          const run = async () => {
            if (shouldFail(table, "write")) return { error: new Error(`${table} recusa escritas`) };
            db.writes.push(`delete:${table}`);
            db.tables.set(table, []);
            return { error: null };
          };
          return {
            not: () => run(),
            eq: () => run(),
            then: (resolve: (v: unknown) => unknown) => run().then(resolve),
          };
        },
      };
      return api;
    },
  };
  return client;
}

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => (db.configured ? (fakeSupabase() as never) : null),
  isDatabaseConfigured: () => db.configured,
}));
vi.mock("@/lib/logger", () => ({
  log: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  validateBackupFile,
  planRestore,
  applyRestore,
  RESTORE_TARGETS,
  RESTORE_EXCEPTIONS,
  type ValidBackup,
} from "./backup-restore";
import {
  planInvoiceCounters,
  parseInvoiceNumber,
  highestIssuedByYear,
  BACKUP_SCHEMA_VERSION,
} from "./backup-restore-types";
import { buildBackupPayload } from "@/app/api/backup/route";

// ── Um negócio pequeno mas completo, para o percurso ponta a ponta ──────────

const ONTEM = "2026-03-01T09:00:00.000Z";

/** Um registo representativo de CADA conjunto, com os campos que o `mapper`
 *  tem de saber levar e trazer (datas de criação incluídas — foi aí que a
 *  primeira versão desta funcionalidade perdia dados). */
function seedBusiness(): void {
  db.tables.clear();
  rowsOf("quotes").push({
    id: "LIQ-AAA-1",
    status: "aceite",
    name: "Ana Dias",
    email: "ana@exemplo.pt",
    created_at: ONTEM,
    data: {
      id: "LIQ-AAA-1",
      status: "aceite",
      name: "Ana Dias",
      email: "ana@exemplo.pt",
      submittedAt: ONTEM,
      quotedPrice: 12500,
      notes: "Casamento em Évora",
      guests: 120,
    },
  });
  rowsOf("proposals").push({
    id: "11111111-1111-4111-8111-111111111111",
    quote_id: "LIQ-AAA-1",
    client_name: "Ana Dias",
    client_email: "ana@exemplo.pt",
    currency: "EUR",
    line_items: [{ description: "Decoração", qty: 1, unitPrice: 10000 }],
    vat_rate: 0.23,
    subtotal: 10000,
    vat: 2300,
    total: 12300,
    valid_until: "2026-04-30",
    notes: null,
    status: "aceite",
    created_at: ONTEM,
    sent_at: ONTEM,
    responded_at: ONTEM,
  });
  rowsOf("invoices").push({
    id: "inv-1",
    number: "FT 2026/0007",
    quote_id: "LIQ-AAA-1",
    client_name: "Ana Dias",
    client_email: "ana@exemplo.pt",
    kind: "sinal",
    amount: 3690,
    vat_rate: 0.23,
    issued_at: "2026-03-01",
    due_at: "2026-03-15",
    paid_at: "2026-03-02",
    status: "paga",
    note: null,
  });
  rowsOf("contracts").push({
    id: "ct-1",
    quote_id: "LIQ-AAA-1",
    proposal_id: "11111111-1111-4111-8111-111111111111",
    client_name: "Ana Dias",
    client_email: "ana@exemplo.pt",
    terms_version: "2026-01",
    terms_snapshot: "Condições acordadas…",
    status: "aceite",
    created_at: ONTEM,
    accepted_at: ONTEM,
    accepted_name: "Ana Dias",
    accepted_ip: "1.2.3.4",
  });
  rowsOf("suppliers").push({
    id: "sup-1",
    name: "Flores do Alentejo",
    category: "Flores",
    email: "flores@exemplo.pt",
    phone: null,
    location: "Évora",
    notes: null,
    created_at: ONTEM,
  });
  rowsOf("tasks").push({
    id: "task-1",
    title: "Confirmar catering",
    done: false,
    priority: "alta",
    due_date: "2026-04-01",
    quote_id: "LIQ-AAA-1",
    client_name: "Ana Dias",
    assignee: "Catarina",
    area: "Produção",
    created_at: ONTEM,
  });
  rowsOf("calendar_events").push({
    id: "cal-1",
    event_date: "2026-05-16",
    title: "Casamento Ana",
    kind: "evento",
    event_time: "16:00",
    note: null,
    created_at: ONTEM,
  });
  rowsOf("inventory_items").push({
    id: "item-1",
    name: "Castiçais de latão",
    category: "Castiçais e Velas",
    quantity: 24,
    unit: "un",
    condition: "bom",
    location: "Atelier",
    notes: null,
    updated_at: ONTEM,
  });
  rowsOf("proposal_themes").push({
    id: "theme-1",
    name: "Terracotta",
    notes: "tons quentes",
    cover_path: "theme-1/capa.jpg",
    photo_order: ["theme-1/capa.jpg"],
    created_at: ONTEM,
    updated_at: ONTEM,
  });
  rowsOf("message_links").push({
    id: "<msg-1@exemplo.pt>",
    quote_id: "LIQ-AAA-1",
    proposal_id: null,
    labels: ["importante"],
    pinned: true,
    archived_at: null,
    created_at: ONTEM,
  });
  rowsOf("overview_settings").push({
    id: "notas",
    value: "Reunião de equipa à segunda",
    revision: 3,
    updated_at: ONTEM,
  });
  rowsOf("email_templates").push({
    id: "proposta-enviada",
    name: "Proposta enviada",
    subject: "A sua proposta",
    body: "<p>Olá {nome}</p>",
    updated_at: ONTEM,
  });
  rowsOf("invoice_counters").push({ year: 2026, n: 7 });
}

/** Só os conjuntos de dados de uma cópia (sem os metadados do envelope). */
function datasetsOf(payload: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const t of RESTORE_TARGETS) out[t.key] = payload[t.key];
  out.invoiceCounters = payload.invoiceCounters;
  return out;
}

function wipeEverything(): void {
  for (const key of [...db.tables.keys()]) db.tables.set(key, []);
}

/** Atalho: valida e devolve o ficheiro, rebentando se não passar (nos testes
 *  em que a validação não é o assunto). */
function mustValidate(payload: unknown): ValidBackup {
  const result = validateBackupFile(payload);
  if (!result.ok) throw new Error(`validação falhou: ${result.errors.join(" | ")}`);
  return result.file;
}

beforeEach(() => {
  db.tables.clear();
  db.writes.length = 0;
  db.fail.clear();
  db.configured = true;
  vi.clearAllMocks();
});

// ════════════════════════════════════════════════════════════════════════════
// 1. O PERCURSO REAL: exportar → apagar → repor → confirmar que voltou igual
// ════════════════════════════════════════════════════════════════════════════

describe("percurso completo: exportar → apagar → repor", () => {
  it("uma base APAGADA volta byte a byte ao que era, conjunto a conjunto", async () => {
    seedBusiness();
    const antes = await buildBackupPayload();
    expect(antes.incomplete).toEqual([]);

    wipeEverything();
    const vazio = await buildBackupPayload();
    for (const t of RESTORE_TARGETS) {
      // Os modelos de email são a excepção: a exportação leva-os SEMPRE, mesmo
      // os que ainda estão na versão de origem (`listTemplatesWithDefaults`),
      // por isso uma tabela vazia continua a exportar os quatro modelos-base.
      // A Visão Geral é a outra: `readOverviewSettings` devolve sempre os dois
      // campos, inventando com revisão 0 os que ainda não existem.
      if (t.key === "emailTemplates" || t.key === "overviewSettings") continue;
      expect(vazio[t.key], `${t.key} devia estar vazio depois do apagão`).toEqual([]);
    }

    const file = mustValidate(antes);
    const plan = await planRestore(file);
    expect(plan.unreadable).toEqual([]);
    const result = await applyRestore(file, plan);
    expect(result.failed, "nenhum conjunto podia falhar").toEqual([]);
    expect(result.countersFailed).toEqual([]);

    const depois = await buildBackupPayload();
    expect(datasetsOf(depois)).toEqual(datasetsOf(antes));
  });

  it("cada conjunto volta com TODOS os campos — incluindo as datas de criação que o `toRow` não escreve", async () => {
    seedBusiness();
    const antes = await buildBackupPayload();
    wipeEverything();
    const file = mustValidate(antes);
    await applyRestore(file, await planRestore(file));
    const depois = await buildBackupPayload();

    // Estas quatro são as que a base de dados preenche sozinha com `now()`
    // quando a aplicação cria um registo — numa reposição isso seria a data
    // errada, e sem `extraColumns` todo o histórico ficava datado de hoje.
    expect((depois.proposals as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    expect((depois.suppliers as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    expect((depois.tasks as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    expect((depois.calendarEvents as { createdAt: string }[])[0].createdAt).toBe(ONTEM);
    // E os pedidos mantêm a ordem de chegada (created_at é a coluna de ordenação).
    expect(rowsOf("quotes")[0].created_at).toBe(ONTEM);
  });

  it("REPÕE POR SUBSTITUIÇÃO: o que está na base e não está na cópia desaparece", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();

    // Depois da cópia, o negócio continuou: mais uma tarefa e mais uma fatura.
    rowsOf("tasks").push({
      id: "task-2",
      title: "Tarefa criada DEPOIS da cópia",
      done: false,
      priority: "normal",
      created_at: "2026-04-01T10:00:00.000Z",
    });

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const tarefas = plan.datasets.find((d) => d.key === "tasks")!;
    expect(tarefas.current).toBe(2);
    expect(tarefas.incoming).toBe(1);
    expect(tarefas.removed, "a tarefa nova conta como registo que desaparece").toBe(1);
    expect(tarefas.replaced).toBe(1);
    expect(tarefas.created).toBe(0);

    await applyRestore(file, plan);
    const depois = await buildBackupPayload();
    expect((depois.tasks as { id: string }[]).map((t) => t.id)).toEqual(["task-1"]);
  });

  it("repor numa base VAZIA cria tudo de novo (o cenário de desastre)", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    wipeEverything();

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    expect(plan.totals.current).toBe(0);
    expect(plan.totals.removed).toBe(0);
    expect(plan.totals.created).toBe(plan.totals.incoming);
    // Sem dados no destino não há aviso de "o destino não está vazio".
    expect(plan.warnings.some((w) => w.message.includes("O destino NÃO está vazio"))).toBe(false);

    const result = await applyRestore(file, plan);
    expect(result.applied.map((a) => a.key).sort()).toEqual(
      RESTORE_TARGETS.map((t) => t.key).sort(),
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 2. O ENSAIO NÃO ESCREVE NADA
// ════════════════════════════════════════════════════════════════════════════

describe("ensaio (dry run)", () => {
  it("planear NÃO escreve nada — nem um insert, nem um delete, nem um contador", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    wipeEverything();
    seedBusiness();
    db.writes.length = 0;

    const file = mustValidate(copia);
    const plan = await planRestore(file);

    expect(db.writes, "o ensaio escreveu na base de dados").toEqual([]);
    expect(plan.totals.incoming).toBeGreaterThan(0);
  });

  it("diz, por conjunto, quantos entram, quantos lá estão, quantos são substituídos e quantos desaparecem", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    // Muda o destino: um fornecedor diferente e mais um.
    db.tables.set("suppliers", [
      {
        id: "sup-1",
        name: "Flores do Alentejo (renomeado)",
        category: "Flores",
        created_at: ONTEM,
      },
      { id: "sup-9", name: "Outro fornecedor", category: "Som", created_at: ONTEM },
    ]);

    const plan = await planRestore(mustValidate(copia));
    const s = plan.datasets.find((d) => d.key === "suppliers")!;
    expect(s).toMatchObject({ incoming: 1, current: 2, created: 0, replaced: 1, removed: 1 });
    expect(s.label).toBe("Fornecedores");
  });

  it("um conjunto ilegível BLOQUEIA a reposição e aparece pelo nome", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    db.fail.set("invoices", "read");

    const plan = await planRestore(mustValidate(copia));
    expect(plan.unreadable.map((u) => u.key)).toEqual(["invoices"]);
    expect(plan.unreadable[0].label).toBe("Faturas");
    expect(plan.datasets.find((d) => d.key === "invoices")!.skipped).toBeTruthy();
    expect(plan.warnings.some((w) => w.level === "critico" && w.message.includes("Faturas"))).toBe(
      true,
    );
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 3. AVISOS: destino com dados, e sobretudo cópia MAIS VELHA do que os dados
// ════════════════════════════════════════════════════════════════════════════

describe("avisos", () => {
  it("avisa alto quando o destino NÃO está vazio", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const plan = await planRestore(mustValidate(copia));
    const aviso = plan.warnings.find((w) => w.message.includes("O destino NÃO está vazio"));
    expect(aviso?.level).toBe("critico");
  });

  it("GRITA quando a cópia é MAIS ANTIGA do que os dados, e conta os registos que se perdem", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    // O negócio andou um mês para a frente depois desta cópia.
    (copia as Record<string, unknown>).exportedAt = "2026-03-02T00:00:00.000Z";
    rowsOf("tasks").push({
      id: "task-abril",
      title: "Trabalho de Abril",
      done: false,
      priority: "normal",
      created_at: "2026-04-02T00:00:00.000Z",
    });
    rowsOf("suppliers").push({
      id: "sup-abril",
      name: "Fornecedor de Abril",
      category: "Som",
      created_at: "2026-04-03T00:00:00.000Z",
    });
    // A contagem declarada deixa de bater certo se não a acertarmos.
    (copia.counts as Record<string, number>).tasks = 1;

    const plan = await planRestore(mustValidate(copia));
    const aviso = plan.warnings.find((w) => w.message.includes("MAIS ANTIGA"));
    expect(aviso?.level).toBe("critico");
    expect(aviso?.message).toContain("2026-04-03");
    expect(aviso?.message).toContain("Tarefas (1)");
    expect(aviso?.message).toContain("Fornecedores (1)");
    expect(plan.totals.newerThanBackup).toBe(2);
  });

  it("uma cópia MAIS RECENTE do que os dados não dispara o aviso de cópia velha", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const plan = await planRestore(mustValidate(copia));
    expect(plan.warnings.some((w) => w.message.includes("MAIS ANTIGA"))).toBe(false);
  });

  it("diz sempre, por escrito, que as FOTOS não vêm na cópia", async () => {
    seedBusiness();
    const plan = await planRestore(mustValidate(await buildBackupPayload()));
    expect(plan.photosNotice).toMatch(/FOTOS/);
    expect(plan.photosNotice).toMatch(/proposal-assets/);
    expect(plan.photosNotice).toMatch(/theme-assets/);
    expect(plan.warnings.some((w) => w.message === plan.photosNotice)).toBe(true);
  });

  it("conjuntos EM FALTA no ficheiro não são tocados, e são nomeados", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete copia.themes;
    delete (copia.counts as Record<string, number>).themes;

    const file = mustValidate(copia);
    expect(file.missing).toContain("themes");
    const plan = await planRestore(file);
    const temas = plan.datasets.find((d) => d.key === "themes")!;
    expect(temas.skipped).toBe("a cópia não traz este conjunto");
    expect(plan.warnings.some((w) => w.message.includes("Temas"))).toBe(true);

    db.writes.length = 0;
    await applyRestore(file, plan);
    expect(db.writes.some((w) => w.includes("proposal_themes"))).toBe(false);
    expect(rowsOf("proposal_themes")).toHaveLength(1);
  });

  it("um conjunto que o ficheiro admite estar INCOMPLETO não é reposto (não se troca dados bons por um vazio de avaria)", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.invoices = [];
    (copia.counts as Record<string, number>).invoices = 0;
    copia.incomplete = ["invoices"];

    const file = mustValidate(copia);
    expect(file.incomplete).toEqual(["invoices"]);
    const plan = await planRestore(file);
    expect(plan.datasets.find((d) => d.key === "invoices")!.skipped).toBe(
      "a cópia declara este conjunto como incompleto",
    );
    const aviso = plan.warnings.find((w) => w.message.includes("INCOMPLETA"));
    expect(aviso?.level).toBe("critico");
    expect(aviso?.message).toContain("Faturas");

    await applyRestore(file, plan);
    expect(rowsOf("invoices"), "as faturas boas não podiam ter sido apagadas").toHaveLength(1);
  });

  it("avisa quando a cópia traz propostas com o documento do Estúdio, que a tabela não sabe guardar", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.proposals as Record<string, unknown>[])[0].doc = { pages: [] };
    const plan = await planRestore(mustValidate(copia));
    expect(plan.warnings.some((w) => w.message.includes("Estúdio"))).toBe(true);
  });

  it("avisa quando a própria cópia tem referências penduradas", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.proposals as Record<string, unknown>[])[0].quoteId = "LIQ-QUE-NAO-EXISTE";
    const plan = await planRestore(mustValidate(copia));
    expect(plan.warnings.some((w) => w.message.includes("Referências sem destino"))).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 4. O CONTADOR DE FATURAS NUNCA ANDA PARA TRÁS
// ════════════════════════════════════════════════════════════════════════════

describe("numeração fiscal: o contador nunca recua", () => {
  it("lê o número de sequência de uma fatura, e só de uma fatura nossa", () => {
    expect(parseInvoiceNumber("FT 2026/0042")).toEqual({ year: 2026, n: 42 });
    expect(parseInvoiceNumber("ft 2026/7")).toEqual({ year: 2026, n: 7 });
    expect(parseInvoiceNumber("2026/0042")).toBeNull();
    expect(parseInvoiceNumber("Recibo 12")).toBeNull();
    expect(parseInvoiceNumber(undefined)).toBeNull();
    expect(parseInvoiceNumber(42 as unknown as string)).toBeNull();
  });

  it("encontra o número mais alto por ano", () => {
    const m = highestIssuedByYear([
      { number: "FT 2025/0100" },
      { number: "FT 2026/0007" },
      { number: "FT 2026/0042" },
      { number: "à mão" },
    ]);
    expect(m.get(2025)).toBe(100);
    expect(m.get(2026)).toBe(42);
  });

  it("⚠️ O CASO QUE MOTIVA TUDO: a cópia é velha e a base já emitiu mais faturas", () => {
    // A cópia é de quando o contador ia em 30. Desde então emitiu-se até
    // FT 2026/0042 e essas faturas foram para clientes. Repor "30" faria a
    // próxima emissão devolver FT 2026/0031 — um número já usado.
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 30 }],
      fileInvoices: [{ number: "FT 2026/0030" }],
      currentCounters: [{ year: 2026, n: 42 }],
      currentInvoices: [{ number: "FT 2026/0042" }],
    });
    expect(plan.willBe).toBe(42);
    expect(plan.raised).toBe(true);
    expect(plan.inFile).toBe(30);
    expect(plan.highestIssued).toBe(42);
  });

  it("as faturas ACTUAIS contam mesmo quando vão ser apagadas — o número já saiu desta casa", () => {
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 5 }],
      fileInvoices: [],
      // O contador da base perdeu-se (tabela recriada), mas as faturas lá estão.
      currentCounters: [],
      currentInvoices: [{ number: "FT 2026/0099" }],
    });
    expect(plan.willBe).toBe(99);
    expect(plan.raised).toBe(true);
  });

  it("as faturas DA CÓPIA também elevam o contador (uma cópia com o contador em atraso)", () => {
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 3 }],
      fileInvoices: [{ number: "FT 2026/0011" }],
      currentCounters: [],
      currentInvoices: [],
    });
    expect(plan.willBe).toBe(11);
    expect(plan.raised).toBe(true);
  });

  it("quando o ficheiro já é o valor mais alto, nada é elevado", () => {
    const [plan] = planInvoiceCounters({
      fileCounters: [{ year: 2026, n: 50 }],
      fileInvoices: [{ number: "FT 2026/0050" }],
      currentCounters: [{ year: 2026, n: 20 }],
      currentInvoices: [{ number: "FT 2026/0020" }],
    });
    expect(plan.willBe).toBe(50);
    expect(plan.raised).toBe(false);
  });

  it("cada ano é tratado à parte (o reset anual da numeração)", () => {
    const plans = planInvoiceCounters({
      fileCounters: [{ year: 2025, n: 120 }],
      fileInvoices: [],
      currentCounters: [{ year: 2026, n: 4 }],
      currentInvoices: [{ number: "FT 2026/0009" }],
    });
    expect(plans.map((p) => [p.year, p.willBe])).toEqual([
      [2025, 120],
      [2026, 9],
    ]);
  });

  it("INVARIANTE: o valor final nunca é inferior a nenhuma das entradas (100 combinações)", () => {
    for (let i = 0; i < 100; i++) {
      const a = Math.floor(Math.random() * 200);
      const b = Math.floor(Math.random() * 200);
      const c = Math.floor(Math.random() * 200);
      const d = Math.floor(Math.random() * 200);
      const [plan] = planInvoiceCounters({
        fileCounters: [{ year: 2026, n: a }],
        fileInvoices: [{ number: `FT 2026/${String(b).padStart(4, "0")}` }],
        currentCounters: [{ year: 2026, n: c }],
        currentInvoices: [{ number: `FT 2026/${String(d).padStart(4, "0")}` }],
      });
      expect(plan.willBe, `a=${a} b=${b} c=${c} d=${d}`).toBe(Math.max(a, b, c, d));
      expect(plan.willBe).toBeGreaterThanOrEqual(a);
      expect(plan.willBe).toBeGreaterThanOrEqual(b);
      expect(plan.willBe).toBeGreaterThanOrEqual(c);
      expect(plan.willBe).toBeGreaterThanOrEqual(d);
    }
  });

  it("a reposição GRAVA mesmo o contador elevado, e diz que o elevou", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    // A cópia é velha: contador em 7. A base já vai em 42.
    db.tables.set("invoice_counters", [{ year: 2026, n: 42 }]);
    rowsOf("invoices").push({
      id: "inv-42",
      number: "FT 2026/0042",
      quote_id: "LIQ-AAA-1",
      client_name: "Ana",
      client_email: "ana@exemplo.pt",
      kind: "saldo",
      amount: 100,
      vat_rate: 0.23,
      issued_at: "2026-04-01",
      status: "emitida",
    });

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const c2026 = plan.counters.find((c) => c.year === 2026)!;
    expect(c2026.willBe).toBe(42);
    expect(c2026.raised).toBe(true);
    expect(plan.warnings.some((w) => w.message.includes("Numeração fiscal"))).toBe(true);

    await applyRestore(file, plan);
    expect(rowsOf("invoice_counters")).toEqual([{ year: 2026, n: 42 }]);
  });

  it("o contador é gravado MESMO QUE as faturas falhem — a garantia não depende de outro conjunto", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    // O contador da base está ATRASADO em relação à cópia: só uma escrita
    // verdadeira o põe em 7. Assim este teste distingue "gravou" de "já lá
    // estava" — sem isto, passava mesmo que a reposição não tocasse no contador.
    db.tables.set("invoice_counters", [{ year: 2026, n: 2 }]);

    const file = mustValidate(copia);
    const plan = await planRestore(file);
    expect(plan.counters.find((c) => c.year === 2026)!.willBe).toBe(7);
    db.fail.set("invoices", "write");

    const result = await applyRestore(file, plan);
    expect(result.failed.map((f) => f.key)).toEqual(["invoices"]);
    expect(result.failed[0].label).toBe("Faturas");
    expect(result.countersFailed).toEqual([]);
    expect(rowsOf("invoice_counters"), "o contador tinha de ter sido gravado à mesma").toEqual([
      { year: 2026, n: 7 },
    ]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 5. OS CASOS MAUS — validar TUDO antes de escrever o que quer que seja
// ════════════════════════════════════════════════════════════════════════════

describe("validação do ficheiro", () => {
  it("aceita uma cópia verdadeira desta aplicação", async () => {
    seedBusiness();
    const result = validateBackupFile(await buildBackupPayload());
    expect(result.ok).toBe(true);
  });

  it("recusa um ficheiro de OUTRA aplicação", () => {
    const result = validateBackupFile({
      version: 3,
      users: [{ id: 1 }],
      orders: [],
      exportedAt: new Date().toISOString(),
    });
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors[0]).toMatch(/não parece uma cópia de segurança da Líquen/i);
  });

  it("recusa o que nem sequer é um objeto", () => {
    for (const junk of [null, 42, "texto", [1, 2, 3]]) {
      const result = validateBackupFile(junk);
      expect(result.ok, String(junk)).toBe(false);
    }
  });

  it("recusa um ficheiro TRUNCADO — as contagens declaradas não batem certo", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.quotes as unknown[]).pop(); // ficheiro cortado a meio da cópia
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/Pedidos.*truncado ou alterado/);
  });

  it("recusa um ficheiro a que falta um conjunto BASE (cópia cortada)", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete copia.quotes;
    delete copia.proposals;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/faltam conjuntos base/);
  });

  it("recusa um conjunto com a FORMA errada, dizendo o conjunto e a linha", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.invoices as Record<string, unknown>[])[0].status = "meio-paga";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/"Faturas" \(invoices\) registo 0: status/);
  });

  it("recusa um conjunto que nem sequer é uma lista", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.contracts = { id: "ct-1" };
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/"Contratos aceites" \(contracts\) não é uma lista/);
  });

  it("recusa identificadores repetidos dentro do mesmo conjunto", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    const tarefas = copia.tasks as Record<string, unknown>[];
    tarefas.push({ ...tarefas[0] });
    (copia.counts as Record<string, number>).tasks = tarefas.length;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/identificador repetido/);
  });

  it("recusa uma cópia de uma versão FUTURA do formato", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.schemaVersion = BACKUP_SCHEMA_VERSION + 1;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/só sabe repor até/);
  });

  it("recusa uma cópia sem versão e sem data de exportação", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    delete copia.schemaVersion;
    copia.exportedAt = "ontem à tarde";
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/schemaVersion/);
    expect(result.errors.join(" ")).toMatch(/data de exportação/);
  });

  it("recusa contadores de numeração com a forma errada", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    copia.invoiceCounters = [{ year: "dois mil e vinte e seis", n: -3 }];
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("impossível");
    expect(result.errors.join(" ")).toMatch(/Contadores de numeração/);
  });

  it("NENHUMA escrita acontece quando a validação falha", async () => {
    seedBusiness();
    const copia = (await buildBackupPayload()) as Record<string, unknown>;
    (copia.invoices as Record<string, unknown>[])[0].amount = -1;
    db.writes.length = 0;
    const result = validateBackupFile(copia);
    expect(result.ok).toBe(false);
    expect(db.writes).toEqual([]);
  });

  it("guarda os campos que não conhece (uma cópia mais antiga não é recusada por trazer menos)", () => {
    const antiga = {
      schemaVersion: 1,
      exportedAt: "2025-01-01T00:00:00.000Z",
      quotes: [
        {
          id: "LIQ-OLD-1",
          status: "pendente",
          name: "Zé",
          email: "ze@exemplo.pt",
          submittedAt: "2025-01-01T00:00:00.000Z",
          campoQueJaNaoExiste: "guardado à mesma",
        },
      ],
      proposals: [],
      suppliers: [],
      tasks: [],
      calendarEvents: [],
    };
    const result = validateBackupFile(antiga);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("impossível");
    expect(result.file.rows.get("quotes")![0].campoQueJaNaoExiste).toBe("guardado à mesma");
    expect(result.file.missing).toContain("invoices");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// 6. NADA FALHA EM SILÊNCIO
// ════════════════════════════════════════════════════════════════════════════

describe("nada falha em silêncio", () => {
  it("um conjunto que não se consegue escrever sai PELO NOME e não trava os outros", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const file = mustValidate(copia);
    const plan = await planRestore(file);
    db.fail.set("contracts", "write");

    const result = await applyRestore(file, plan);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ key: "contracts", label: "Contratos aceites" });
    expect(result.failed[0].error).toBeTruthy();
    // Os outros conjuntos foram todos repostos.
    expect(result.applied.map((a) => a.key)).toContain("invoices");
    expect(result.applied.map((a) => a.key)).toContain("quotes");
  });

  it("um conjunto que o plano marcou como SALTADO não é escrito, mesmo trazendo registos", async () => {
    // O caso: a leitura do estado actual das faturas falhou, por isso o plano
    // marcou-as como saltadas — mas o ficheiro TRAZ faturas. A rota já recusa
    // repor nesta situação; esta é a segunda tranca, dentro do `applyRestore`.
    // Sem ela, apagavam-se as faturas de que nem se sabe o que são.
    seedBusiness();
    const copia = await buildBackupPayload();
    const file = mustValidate(copia);
    expect(file.rows.get("invoices"), "o ficheiro tem mesmo faturas").toHaveLength(1);

    db.fail.set("invoices", "read");
    const plan = await planRestore(file);
    expect(plan.datasets.find((d) => d.key === "invoices")!.skipped).toBeTruthy();

    db.writes.length = 0;
    const result = await applyRestore(file, plan);
    expect(db.writes.filter((w) => w.includes(":invoices"))).toEqual([]);
    expect(result.applied.map((a) => a.key)).not.toContain("invoices");
  });

  it("cada conjunto reposto declara quantos apagou e quantos escreveu", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const file = mustValidate(copia);
    const plan = await planRestore(file);
    const result = await applyRestore(file, plan);
    for (const outcome of result.applied) {
      const planned = plan.datasets.find((d) => d.key === outcome.key)!;
      expect(outcome.deleted, outcome.key).toBe(planned.current);
      expect(outcome.inserted, outcome.key).toBe(planned.incoming);
    }
  });

  it("sem base de dados em PRODUÇÃO recusa-se a escrever, em vez de gravar num ficheiro que o próximo deploy apaga", async () => {
    db.configured = false;
    vi.stubEnv("NODE_ENV", "production");
    try {
      // Plano e ficheiro à mão: sem tocar em `planRestore`, que aqui leria o
      // disco. O que se testa é a recusa de `replaceAll`, e só ela.
      const file: ValidBackup = {
        exportedAt: ONTEM,
        schemaVersion: 2,
        rows: new Map([
          [
            "tasks",
            [{ id: "task-1", title: "x", done: false, priority: "normal", createdAt: ONTEM }],
          ],
        ]),
        counters: [],
        missing: [],
        incomplete: [],
      };
      const plan = {
        datasets: [{ key: "tasks", label: "Tarefas", current: 0, incoming: 1 }],
        counters: [],
      } as unknown as Awaited<ReturnType<typeof planRestore>>;

      const result = await applyRestore(file, plan);
      expect(result.applied).toEqual([]);
      expect(result.failed).toHaveLength(1);
      expect(result.failed[0].label).toBe("Tarefas");
      expect(result.failed[0].error).toMatch(/Persistence unavailable/);
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("todo o conjunto exportado é reposto ou tem uma excepção escrita por extenso", async () => {
    seedBusiness();
    const copia = await buildBackupPayload();
    const keys = Object.keys(copia.counts);
    const known = new Set([
      ...RESTORE_TARGETS.map((t) => t.key),
      ...Object.keys(RESTORE_EXCEPTIONS),
    ]);
    const orfaos = keys.filter((k) => !known.has(k));
    expect(
      orfaos,
      `Conjuntos exportados que ninguém decidiu como repor: ${orfaos.join(", ")}`,
    ).toEqual([]);
  });
});
