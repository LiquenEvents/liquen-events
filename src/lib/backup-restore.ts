import "server-only";
import { promises as fs } from "fs";
import path from "path";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { getState, setState } from "./app-state";
import { log } from "./logger";
import { MAX_PROPOSAL_DOC_BYTES } from "./proposal-doc";
import { isMissingTable, type Mapper } from "./repository";
import { mapper as quotesMapper, listQuotes } from "./quotes-store";
import { mapper as proposalsMapper, listAllProposals } from "./proposals-store";
import { mapper as suppliersMapper, listSuppliers } from "./suppliers-store";
import { mapper as tasksMapper, listTasks } from "./tasks-store";
import { mapper as calendarMapper, listCalendarEvents } from "./calendar-store";
import { mapper as invoicesMapper, listInvoices } from "./invoices-store";
import { mapper as contractsMapper, listContracts } from "./contracts-store";
import { mapper as inventoryMapper, listItems } from "./inventory-store";
import { mapper as templatesMapper, listTemplates } from "./email-templates-store";
import { mapper as themesMapper, listThemes } from "./themes-store";
import { mapper as linksMapper, listLinks } from "./message-links-store";
import { mapper as overviewMapper, type OverviewField } from "./overview-settings-store";
import {
  BACKUP_SCHEMA_MIN_VERSION,
  BACKUP_SCHEMA_VERSION,
  MAX_RESTORE_ROWS,
  daysBetween,
  planInvoiceCounters,
  type CounterPlan,
  type DatasetFailure,
  type DatasetPlan,
  type RestoreOutcome,
  type RestorePlan,
  type RestoreWarning,
} from "./backup-restore-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REPOSIÇÃO DE UMA CÓPIA DE SEGURANÇA — a outra metade de `/api/backup`.
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Durante muito tempo o back office soube EXPORTAR e não soube repor: o
 * ficheiro dizia, por escrito, "NÃO existe botão de restauro". Isto é o botão.
 *
 * É a operação mais destrutiva do sistema. Escreve por cima de faturas com
 * numeração fiscal, de contratos aceites por clientes e de propostas enviadas.
 * As decisões todas estão do lado da cautela, e cada uma tem um teste:
 *
 *  1. ENSAIO POR OMISSÃO. `planRestore()` lê, calcula e não escreve nada.
 *     Escrever exige uma segunda chamada, com uma frase escrita à mão.
 *  2. VALIDAR TUDO ANTES DE ESCREVER. `validateBackupFile()` percorre o
 *     ficheiro INTEIRO (é nosso? tem versão? cada conjunto tem a forma certa?
 *     as contagens batem certo?) e só devolve `ok` se tudo passar. Nenhuma
 *     escrita acontece antes disso.
 *  3. O CONTADOR DE FATURAS NUNCA RECUA. Ver `planInvoiceCounters` em
 *     `backup-restore-types.ts` — é a única coisa que se funde em vez de
 *     substituir, e a razão está lá escrita.
 *  4. CÓPIA DO ESTADO ACTUAL PRIMEIRO. Quem chama tem de a fazer e de a
 *     entregar (a rota fá-lo com o mesmo `buildBackupPayload` da exportação);
 *     se ela não sair completa, a reposição é RECUSADA.
 *  5. AVISOS ALTOS. Destino com dados, e sobretudo cópia mais VELHA do que o
 *     que lá está — o caminho por onde se apaga um mês de trabalho sem dar
 *     por isso.
 *  7. NADA FALHA EM SILÊNCIO. Conjunto em falta no ficheiro, conjunto marcado
 *     como incompleto, conjunto que não se conseguiu ler, conjunto que não se
 *     conseguiu escrever — tudo sai PELO NOME.
 *
 * ── SUBSTITUIR, não fundir ───────────────────────────────────────────────
 * Cada conjunto é APAGADO e reescrito com o que vem no ficheiro. É uma
 * ferramenta de recuperação de desastre: repõe-se numa base vazia ou partida.
 * Fundir por id daria a ilusão de segurança e deixaria a base num estado que
 * nunca existiu — metade de terça, metade de hoje. A única excepção é o
 * contador de numeração fiscal, pela razão acima.
 *
 * ── A conversão é a do `mapper` de cada store ────────────────────────────
 * Os campos no ficheiro estão como a APLICAÇÃO os usa (`quoteId`,
 * `clientName`), não como as colunas se chamam (`quote_id`). Aqui importam-se
 * os `mapper` verdadeiros e usa-se o `toRow` deles — nunca uma segunda
 * tradução escrita à mão, que envelheceria em silêncio ao lado da primeira.
 *
 * ── O que isto NÃO devolve ───────────────────────────────────────────────
 * As FOTOS. Vivem nos buckets privados de Storage e não cabem no JSON: uma
 * reposição devolve propostas e temas com os CAMINHOS das imagens e sem as
 * imagens. Está dito no plano (`photosNotice`), no ecrã, antes de confirmar.
 */

export {
  BACKUP_SCHEMA_VERSION,
  BACKUP_SCHEMA_MIN_VERSION,
  RESTORE_CONFIRM_PHRASE,
  MAX_RESTORE_ROWS,
  planInvoiceCounters,
  parseInvoiceNumber,
  highestIssuedByYear,
} from "./backup-restore-types";
export type {
  CounterPlan,
  DatasetFailure,
  DatasetPlan,
  RestoreOutcome,
  RestorePlan,
  RestoreWarning,
} from "./backup-restore-types";

// ── Formas dos registos ─────────────────────────────────────────────────────
//
// Estritas onde a base de dados também é estrita: os `check` de db/schema.sql
// são `not valid`, ou seja aplicam-se a partir da PRÓXIMA escrita — um estado
// inventado passaria a validação da aplicação e rebentava a meio do insert,
// que é exactamente o "aplicar metade e falhar a meio" que não pode acontecer.
// Tolerantes no resto (`looseObject` guarda os campos que não declaramos), para
// uma cópia de uma versão anterior não ser recusada por trazer menos.

const id = z.string().trim().min(1).max(300);
/** Texto livre opcional. `nullish` porque uma coluna nula lê-se como null no JSON. */
const text = (max: number) => z.string().max(max).nullish();
const stamp = z.string().max(64).nullish();
const money = z.number().finite().min(0).max(1_000_000_000);

const quoteSchema = z.looseObject({
  id,
  status: z.enum(["pendente", "em_revisao", "cotado", "aceite", "rejeitado"]),
  name: text(300),
  email: text(300),
  submittedAt: stamp,
});

/**
 * O documento do Estúdio de Propostas (`proposals.doc`), tal como vai na cópia.
 *
 * NÃO se valida campo a campo de propósito: o `ProposalDoc` é um modelo grande
 * e em evolução (ver proposal-doc.ts), e copiá-lo para aqui criava uma segunda
 * verdade a envelhecer em silêncio ao lado da primeira — cada campo novo do
 * estúdio passaria a fazer uma cópia de segurança boa ser recusada. Exige-se o
 * que importa a esta rota: ser um objeto e caber no MESMO teto que a aplicação
 * já aplica ao gravar (512 KB; medido: 18,5 KB no documento mais cheio que o
 * gerador desenha). O resto passa tal e qual — `looseObject` guarda as chaves
 * que não declaramos, e é o `toRow` do store que o escreve na coluna.
 */
const proposalDocSchema = z
  .looseObject({})
  .refine((d) => JSON.stringify(d).length <= MAX_PROPOSAL_DOC_BYTES, {
    message: `documento do Estúdio acima do limite de ${MAX_PROPOSAL_DOC_BYTES} bytes`,
  })
  .nullish();

const proposalSchema = z.looseObject({
  id,
  doc: proposalDocSchema,
  quoteId: z.string().max(300).default(""),
  clientName: z.string().max(300).default(""),
  clientEmail: z.string().max(300).default(""),
  currency: z.string().max(10).default("EUR"),
  lineItems: z
    .array(
      z.looseObject({
        description: z.string().max(2000).default(""),
        qty: z.number().finite(),
        unitPrice: z.number().finite(),
      }),
    )
    .default([]),
  vatRate: z.number().finite().min(0).max(10),
  subtotal: money,
  vat: money,
  total: money,
  status: z.enum(["rascunho", "enviada", "aceite", "rejeitada"]),
  createdAt: z.string().max(64),
  validUntil: text(64),
  notes: text(20_000),
  sentAt: stamp,
  respondedAt: stamp,
});

const supplierSchema = z.looseObject({
  id,
  name: z.string().max(300),
  category: z.string().max(120).default("Outro"),
  createdAt: z.string().max(64),
});

const taskSchema = z.looseObject({
  id,
  title: z.string().max(1000),
  done: z.boolean(),
  priority: z.enum(["baixa", "normal", "alta"]),
  createdAt: z.string().max(64),
});

const calendarSchema = z.looseObject({
  id,
  date: z.string().max(64),
  title: z.string().max(1000),
  kind: z.enum(["reuniao", "evento", "bloqueio", "nota"]),
  createdAt: z.string().max(64),
});

const invoiceSchema = z.looseObject({
  id,
  number: z.string().min(1).max(80),
  quoteId: z.string().max(300).default(""),
  clientName: z.string().max(300).default(""),
  clientEmail: z.string().max(300).default(""),
  kind: z.enum(["sinal", "saldo", "total"]),
  amount: money,
  vatRate: z.number().finite().min(0).max(10),
  issuedAt: z.string().max(64),
  status: z.enum(["emitida", "paga", "anulada"]),
  dueAt: text(64),
  paidAt: text(64),
  note: text(5000),
});

const contractSchema = z.looseObject({
  id,
  quoteId: z.string().max(300).default(""),
  proposalId: z.string().max(300).default(""),
  clientName: z.string().max(300).default(""),
  clientEmail: z.string().max(300).default(""),
  termsVersion: z.string().max(120).default(""),
  termsSnapshot: z.string().max(500_000).default(""),
  status: z.enum(["pendente", "aceite"]),
  createdAt: z.string().max(64),
  acceptedAt: stamp,
  acceptedName: text(300),
  acceptedIp: text(120),
});

const inventorySchema = z.looseObject({
  id,
  name: z.string().max(300),
  category: z.string().max(120).default("Outro"),
  quantity: z.number().int().min(0).max(1_000_000),
  condition: z.enum(["novo", "bom", "usado", "danificado"]),
  updatedAt: z.string().max(64),
});

const templateSchema = z.looseObject({
  key: z.string().trim().min(1).max(120),
  name: z.string().max(300).default(""),
  subject: z.string().max(1000).default(""),
  body: z.string().max(500_000).default(""),
  updatedAt: z.string().max(64),
});

const themeSchema = z.looseObject({
  id,
  name: z.string().min(1).max(300),
  notes: text(5000),
  coverPath: text(1000),
  photoOrder: z.array(z.string().max(1000)).max(50_000).optional(),
  createdAt: z.string().max(64),
  updatedAt: z.string().max(64),
});

const messageLinkSchema = z.looseObject({
  messageId: z.string().trim().min(1).max(1000),
  quoteId: text(300),
  proposalId: text(300),
  labels: z.array(z.string().max(200)).max(200).default([]),
  pinned: z.boolean().default(false),
  archivedAt: stamp,
  createdAt: z.string().max(64),
});

const overviewSchema = z.looseObject({
  id: z.enum(["notas", "meta"]),
  value: z.string().max(200_000).default(""),
  revision: z.number().int().min(0),
  updatedAt: z.string().max(64),
});

const counterSchema = z.object({
  year: z.number().int().min(1900).max(9999),
  n: z.number().int().min(0).max(1_000_000),
});

// ── Conjuntos que se sabem repor ────────────────────────────────────────────

/** Um conjunto que a reposição sabe apagar e reescrever. */
export interface RestoreTarget<T = Record<string, unknown>> {
  /** Chave no ficheiro — a MESMA de `BACKUP_DATASETS`. */
  key: string;
  /** Nome em português, para o ecrã. */
  label: string;
  /** Tabela de destino (vem do `mapper`, não de um literal). */
  table: string;
  /** A conversão app → coluna. É a do store, nunca uma cópia. */
  mapper: Mapper<T>;
  /** Forma de cada registo no ficheiro. */
  schema: z.ZodType;
  /** O que está AGORA na base de dados. */
  current: () => Promise<T[]>;
  /** Instante do registo, para saber se a cópia é mais velha do que os dados. */
  stamp: (row: T) => string | undefined;
  /**
   * Colunas que o `toRow` do store NÃO escreve porque, na vida normal da
   * aplicação, é a base de dados que as preenche — e que numa REPOSIÇÃO têm de
   * ir explícitas.
   *
   * O caso concreto: `created_at` de pedidos, propostas, fornecedores, tarefas
   * e agenda tem `default now()`, e o `toRow` desses stores omite-a de
   * propósito (quando a aplicação cria um registo, "agora" É a data certa).
   * Numa reposição "agora" é a data ERRADA: uma proposta de Março passaria a
   * ter sido criada hoje, e o `fromRow` — que lê `created_at` — devolveria
   * essa mentira para sempre. Perder a data de criação de todo o histórico do
   * negócio caladamente é precisamente o defeito que esta funcionalidade
   * existe para não ter. O teste de ida-e-volta por conjunto apanha qualquer
   * coluna que fique de fora.
   */
  extraColumns?: (row: T) => Record<string, unknown>;
  /** Perda conhecida ao repor este conjunto neste ambiente, se houver. */
  lossWarning?: (rows: T[]) => string | null;
  /**
   * Verificação feita ANTES de qualquer escrita: devolve a razão pela qual este
   * conjunto NÃO pode ser reposto nesta base de dados (ou null, se pode).
   *
   * Existe porque `replaceAll` apaga primeiro e insere depois: se as inserções
   * falharem todas — por exemplo porque falta uma coluna que a cópia traz — o
   * conjunto fica APAGADO e vazio, que é o pior resultado possível de uma
   * ferramenta de recuperação. Um conjunto com razão para ser saltado não é
   * tocado sequer: fica como está, e a razão sai no ecrã pelo nome.
   */
  preflight?: (rows: T[]) => Promise<string | null>;
}

// Os `as unknown as` abaixo: o `Mapper<T>` de cada store é tipado com o tipo de
// domínio (Quote, Invoice…) e aqui trabalha-se com objectos já validados pelo
// zod, cuja inferência não coincide campo a campo (os `default()` tornam
// opcionais em obrigatórios). Estreitar isso não daria mais segurança do que a
// validação que acabou de correr — a garantia real é o teste que faz
// exportar → apagar → repor e compara os dois lados.
type AnyRow = Record<string, unknown>;
const asTarget = <T>(t: RestoreTarget<T>): RestoreTarget<AnyRow> =>
  t as unknown as RestoreTarget<AnyRow>;

/**
 * TUDO o que se sabe repor, PELA ORDEM DE ESCRITA.
 *
 * A ordem não é decorativa: `proposals.quote_id` e `message_links.quote_id /
 * proposal_id` são chaves estrangeiras (db/schema.sql). Inserir uma proposta
 * antes do pedido dela rebenta com violação de integridade referencial. Os
 * conjuntos são apagados pela ordem INVERSA, pela mesma razão.
 */
export const RESTORE_TARGETS: readonly RestoreTarget<AnyRow>[] = [
  asTarget({
    key: "quotes",
    label: "Pedidos",
    table: quotesMapper.table,
    mapper: quotesMapper,
    schema: quoteSchema,
    current: listQuotes,
    stamp: (q) => q.lastUpdated ?? q.submittedAt,
    // `quotes.created_at` é `default now()` e o `toRow` não a escreve: sem
    // isto, todos os pedidos repostos ficavam com a data de hoje e a lista
    // deixava de estar por ordem de chegada.
    extraColumns: (q) => ({ created_at: q.submittedAt }),
  }),
  asTarget({
    key: "proposals",
    label: "Propostas",
    table: proposalsMapper.table,
    mapper: proposalsMapper,
    schema: proposalSchema,
    current: listAllProposals,
    stamp: (p) => p.respondedAt ?? p.sentAt ?? p.createdAt,
    // `fromRow` LÊ `created_at`, `toRow` não a escreve: sem isto a data de
    // criação de todas as propostas passava a ser a da reposição.
    extraColumns: (p) => ({ created_at: p.createdAt }),
    // O `doc` do Estúdio JÁ é reposto (coluna `proposals.doc`) — durante muito
    // tempo não era, e aqui vivia um aviso a dizer que se perdia. O que resta é
    // o caso de uma base onde o `alter table` desta versão ainda não correu:
    // sem a coluna, as inserções falham TODAS e o `replaceAll` deixava as
    // propostas apagadas. Por isso pergunta-se antes.
    preflight: (rows) => assertProposalDocColumn(rows),
  }),
  asTarget({
    key: "contracts",
    label: "Contratos aceites",
    table: contractsMapper.table,
    mapper: contractsMapper,
    schema: contractSchema,
    current: listContracts,
    stamp: (c) => c.acceptedAt ?? c.createdAt,
  }),
  asTarget({
    key: "invoices",
    label: "Faturas",
    table: invoicesMapper.table,
    mapper: invoicesMapper,
    schema: invoiceSchema,
    current: listInvoices,
    stamp: (i) => i.issuedAt,
  }),
  asTarget({
    key: "messageLinks",
    label: "Anotações da caixa de entrada",
    table: linksMapper.table,
    mapper: linksMapper,
    schema: messageLinkSchema,
    current: listLinks,
    stamp: (l) => l.createdAt,
  }),
  asTarget({
    key: "suppliers",
    label: "Fornecedores",
    table: suppliersMapper.table,
    mapper: suppliersMapper,
    schema: supplierSchema,
    current: listSuppliers,
    stamp: (s) => s.createdAt,
    extraColumns: (s) => ({ created_at: s.createdAt }),
  }),
  asTarget({
    key: "tasks",
    label: "Tarefas",
    table: tasksMapper.table,
    mapper: tasksMapper,
    schema: taskSchema,
    current: listTasks,
    stamp: (t) => t.createdAt,
    extraColumns: (t) => ({ created_at: t.createdAt }),
  }),
  asTarget({
    key: "calendarEvents",
    label: "Agenda",
    table: calendarMapper.table,
    mapper: calendarMapper,
    schema: calendarSchema,
    current: listCalendarEvents,
    stamp: (e) => e.createdAt,
    extraColumns: (e) => ({ created_at: e.createdAt }),
  }),
  asTarget({
    key: "inventoryItems",
    label: "Inventário",
    table: inventoryMapper.table,
    mapper: inventoryMapper,
    schema: inventorySchema,
    current: listItems,
    stamp: (i) => i.updatedAt,
  }),
  asTarget({
    key: "emailTemplates",
    label: "Modelos de email",
    table: templatesMapper.table,
    mapper: templatesMapper,
    schema: templateSchema,
    // `listTemplates` (os GRAVADOS), não `listTemplatesWithDefaults`: a
    // pergunta aqui é "quantos existem mesmo na tabela", e os modelos por
    // omissão não existem em lado nenhum — contá-los diria que se ia
    // substituir o que nunca foi escrito.
    current: listTemplates,
    stamp: (t) => t.updatedAt,
  }),
  asTarget({
    key: "themes",
    label: "Temas",
    table: themesMapper.table,
    mapper: themesMapper,
    schema: themeSchema,
    current: listThemes,
    stamp: (t) => t.updatedAt,
  }),
  asTarget({
    key: "overviewSettings",
    label: "Visão Geral (notas e meta)",
    table: overviewMapper.table,
    mapper: overviewMapper,
    schema: overviewSchema,
    // A leitura do store devolve os dois campos SEMPRE (inventa os que faltam
    // com revisão 0), o que aqui seria mentira — queremos as linhas que
    // existem mesmo. Lê-se pelo backend, como todos os outros.
    current: () => listOverviewRows() as unknown as Promise<OverviewField[]>,
    stamp: (f) => f.updatedAt,
  }),
];

/**
 * Conjuntos que vão na cópia mas NÃO se repõem por substituição, e a razão.
 * Não é uma lista de esquecimentos: `coverage.test.ts` cruza-a com
 * `BACKUP_DATASETS` e fica vermelho se alguém acrescentar um conjunto novo à
 * exportação sem decidir o que a reposição lhe faz.
 */
export const RESTORE_EXCEPTIONS: Readonly<Record<string, string>> = {
  invoiceCounters:
    "O contador de numeração fiscal NÃO se substitui — só sobe. Repor um valor abaixo do número mais alto já emitido faria a aplicação reemitir números de fatura que já saíram desta casa, o que num livro fiscal português é um problema legal. É reposto pela marca de água mais alta entre o ficheiro, a base de dados e os números encontrados nas faturas de ambos (ver planInvoiceCounters).",
};

const TARGET_BY_KEY = new Map(RESTORE_TARGETS.map((t) => [t.key, t]));

/** Chaves que uma cópia desta aplicação tem SEMPRE tido, em todas as versões
 *  do formato. É por elas que se reconhece que o ficheiro é mesmo nosso. */
const FINGERPRINT_KEYS = ["quotes", "proposals", "suppliers", "tasks", "calendarEvents"] as const;

const PHOTOS_NOTICE =
  "As FOTOS não estão na cópia — vivem nos buckets privados de Storage (proposal-assets, theme-assets). " +
  "A reposição devolve propostas e temas com os CAMINHOS das imagens, mas sem as imagens: até o bucket ser " +
  "reposto à parte, as galerias e as capas dos temas aparecem vazias.";

// ── Leitura directa (conjuntos sem função de leitura própria) ───────────────

/**
 * A coluna `proposals.doc` existe nesta base de dados?
 *
 * Só interessa quando a cópia traz propostas COM documento: se nenhuma traz, o
 * `toRow` nem escreve a coluna e uma base antiga repõe-nas tal como sempre
 * repôs. Quando traz, e a coluna não existe, a reposição das propostas falharia
 * inteira DEPOIS de as apagar — é essa a única coisa que aqui se evita.
 *
 * Falha para o lado seguro: só um erro RECONHECÍVEL de coluna em falta
 * (42703/PGRST204, via `isMissingTable`) trava o conjunto. Qualquer outra
 * avaria é ignorada aqui — a leitura verdadeira do estado actual acontece a
 * seguir e é ela que a reporta, e um sinal ambíguo desta sonda nunca pode
 * impedir uma reposição legítima.
 */
const SEM_COLUNA_DOC =
  "a cópia traz propostas com o documento do Estúdio (`doc`) e esta base de dados ainda não tem a coluna " +
  "`proposals.doc` — corra o db/schema.sql e repita. As propostas ficam INTACTAS (repô-las agora apagava-as " +
  "sem conseguir inserir nenhuma).";

async function assertProposalDocColumn(rows: readonly { doc?: unknown }[]): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null; // desenvolvimento: escreve-se o ficheiro inteiro, sem colunas
  if (!rows.some((p) => p.doc != null)) return null;
  try {
    const { error } = await sb.from(proposalsMapper.table).select("doc").limit(1);
    if (error && isMissingTable(error)) return SEM_COLUNA_DOC;
  } catch (err) {
    if (isMissingTable(err)) return SEM_COLUNA_DOC;
  }
  return null;
}

/** As linhas da Visão Geral que existem MESMO (o store inventa as que faltam). */
async function listOverviewRows(): Promise<AnyRow[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb.from(overviewMapper.table).select("*");
    if (error) throw error;
    return (data ?? []).map((r) => overviewMapper.fromRow(r) as unknown as AnyRow);
  }
  return readDevFile(overviewMapper.fileName);
}

/** Contadores de numeração tal como estão agora. Sem Supabase (desenvolvimento)
 *  vivem em `app_state`, uma chave por ano — só se lêem os anos pedidos. */
export async function readInvoiceCounters(
  years: readonly number[],
): Promise<{ year: number; n: number }[]> {
  const sb = getSupabase();
  if (sb) {
    const { data, error } = await sb
      .from("invoice_counters")
      .select("year, n")
      .order("year", { ascending: true });
    if (error) throw error;
    return (data ?? []).map((r) => ({ year: Number(r.year), n: Number(r.n) }));
  }
  const out: { year: number; n: number }[] = [];
  for (const year of [...new Set(years)].sort((a, b) => a - b)) {
    const n = await getState<number>(`invoice-seq-${year}`);
    if (typeof n === "number" && Number.isFinite(n)) out.push({ year, n });
  }
  return out;
}

async function readDevFile(fileName: string): Promise<AnyRow[]> {
  try {
    const raw = await fs.readFile(path.join(process.cwd(), "data", fileName), "utf-8");
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as AnyRow[]) : [];
  } catch {
    return [];
  }
}

// ── Validação do ficheiro ───────────────────────────────────────────────────

/** Um ficheiro que passou a validação inteira. Só isto entra em `planRestore`. */
export interface ValidBackup {
  exportedAt: string;
  schemaVersion: number;
  /** Registos por conjunto, já validados. Só as chaves que o ficheiro trazia
   *  e que não estão marcadas como incompletas. */
  rows: Map<string, AnyRow[]>;
  counters: { year: number; n: number }[];
  /** Conjuntos que o ficheiro não traz — não serão tocados. */
  missing: string[];
  /** Conjuntos que o próprio ficheiro admite terem falhado a exportação. */
  incomplete: string[];
}

export type ValidationResult = { ok: true; file: ValidBackup } | { ok: false; errors: string[] };

/** Quantos erros de forma se mostram por conjunto antes de resumir. */
const MAX_ERRORS_PER_DATASET = 5;

/**
 * Percorre o ficheiro INTEIRO antes de qualquer escrita: é nosso? tem versão
 * que se saiba ler? cada conjunto é uma lista? cada registo tem a forma certa?
 * as contagens que o próprio ficheiro declara batem certo com o que traz?
 *
 * Um `ok:false` significa que nada, mesmo nada, foi escrito — e a lista de
 * erros diz o conjunto e a linha, não "ficheiro inválido".
 */
export function validateBackupFile(raw: unknown): ValidationResult {
  const errors: string[] = [];

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      ok: false,
      errors: ["O ficheiro não é um objeto JSON — não é uma cópia de segurança."],
    };
  }
  const file = raw as Record<string, unknown>;

  // ── É uma cópia DESTA aplicação? ──
  const missingFingerprint = FINGERPRINT_KEYS.filter((k) => !Array.isArray(file[k]));
  if (missingFingerprint.length === FINGERPRINT_KEYS.length) {
    return {
      ok: false,
      errors: [
        "Isto não parece uma cópia de segurança da Líquen Events: não traz nenhum dos conjuntos base " +
          `(${FINGERPRINT_KEYS.join(", ")}).`,
      ],
    };
  }
  if (missingFingerprint.length > 0) {
    errors.push(
      `Cópia irreconhecível ou truncada: faltam conjuntos base — ${missingFingerprint.join(", ")}.`,
    );
  }

  // ── Tem versão que se saiba ler? ──
  const version = file.schemaVersion;
  if (typeof version !== "number" || !Number.isInteger(version)) {
    errors.push("O ficheiro não declara `schemaVersion` — não se sabe que formato é.");
  } else if (version > BACKUP_SCHEMA_VERSION) {
    errors.push(
      `A cópia é da versão ${version} do formato e esta aplicação só sabe repor até à ${BACKUP_SCHEMA_VERSION}. Atualize a aplicação antes de repor.`,
    );
  } else if (version < BACKUP_SCHEMA_MIN_VERSION) {
    errors.push(`Versão de formato desconhecida (${version}).`);
  }

  const exportedAt = typeof file.exportedAt === "string" ? file.exportedAt : "";
  if (!exportedAt || Number.isNaN(Date.parse(exportedAt))) {
    errors.push("O ficheiro não traz uma data de exportação legível (`exportedAt`).");
  }

  // ── Cada conjunto: lista, forma certa, ids únicos ──
  const declaredCounts =
    file.counts && typeof file.counts === "object" && !Array.isArray(file.counts)
      ? (file.counts as Record<string, unknown>)
      : null;
  const incompleteDeclared = Array.isArray(file.incomplete)
    ? (file.incomplete as unknown[]).filter((k): k is string => typeof k === "string")
    : [];

  const rows = new Map<string, AnyRow[]>();
  const missing: string[] = [];
  let total = 0;

  for (const target of RESTORE_TARGETS) {
    const value = file[target.key];
    if (value === undefined) {
      missing.push(target.key);
      continue;
    }
    if (!Array.isArray(value)) {
      errors.push(`O conjunto "${target.label}" (${target.key}) não é uma lista.`);
      continue;
    }
    total += value.length;
    if (declaredCounts && typeof declaredCounts[target.key] === "number") {
      const declared = declaredCounts[target.key] as number;
      if (declared !== value.length) {
        errors.push(
          `"${target.label}" (${target.key}): o ficheiro diz ter ${declared} registos mas traz ${value.length} — ficheiro truncado ou alterado.`,
        );
      }
    }

    const parsed: AnyRow[] = [];
    const seen = new Set<string>();
    let shapeErrors = 0;
    for (let i = 0; i < value.length; i++) {
      const result = target.schema.safeParse(value[i]);
      if (!result.success) {
        shapeErrors++;
        if (shapeErrors <= MAX_ERRORS_PER_DATASET) {
          const issue = result.error.issues[0];
          const where = issue?.path?.length ? issue.path.join(".") : "(registo)";
          errors.push(
            `"${target.label}" (${target.key}) registo ${i}: ${where} — ${issue?.message}`,
          );
        }
        continue;
      }
      const row = result.data as AnyRow;
      const rowId = String(target.mapper.getId(row as never) ?? "");
      if (seen.has(rowId)) {
        errors.push(
          `"${target.label}" (${target.key}) registo ${i}: identificador repetido "${rowId}" — a cópia está corrompida.`,
        );
        continue;
      }
      seen.add(rowId);
      parsed.push(row);
    }
    if (shapeErrors > MAX_ERRORS_PER_DATASET) {
      errors.push(
        `"${target.label}" (${target.key}): mais ${shapeErrors - MAX_ERRORS_PER_DATASET} registos com a forma errada.`,
      );
    }
    rows.set(target.key, parsed);
  }

  // ── Contadores de numeração ──
  const counters: { year: number; n: number }[] = [];
  const rawCounters = file.invoiceCounters;
  if (rawCounters !== undefined) {
    if (!Array.isArray(rawCounters)) {
      errors.push('O conjunto "Contadores de numeração" (invoiceCounters) não é uma lista.');
    } else {
      const seenYears = new Set<number>();
      for (let i = 0; i < rawCounters.length; i++) {
        const result = counterSchema.safeParse(rawCounters[i]);
        if (!result.success) {
          errors.push(
            `"Contadores de numeração" (invoiceCounters) registo ${i}: ${result.error.issues[0]?.message}`,
          );
          continue;
        }
        if (seenYears.has(result.data.year)) {
          errors.push(
            `"Contadores de numeração" (invoiceCounters): o ano ${result.data.year} aparece duas vezes.`,
          );
          continue;
        }
        seenYears.add(result.data.year);
        counters.push(result.data);
      }
      total += rawCounters.length;
    }
  } else {
    missing.push("invoiceCounters");
  }

  if (total > MAX_RESTORE_ROWS) {
    errors.push(
      `A cópia traz ${total} registos, acima do limite de ${MAX_RESTORE_ROWS} que esta reposição aceita de uma vez.`,
    );
  }

  if (errors.length) return { ok: false, errors };

  // Um conjunto que o próprio ficheiro admite ter falhado a exportação vem
  // VAZIO por avaria, não por não haver nada. Repor esse vazio apagaria dados
  // bons e trocá-los-ia por uma mentira conhecida — fica de fora, pelo nome.
  const incomplete = incompleteDeclared.filter(
    (k) => TARGET_BY_KEY.has(k) || k === "invoiceCounters",
  );
  for (const key of incomplete) rows.delete(key);

  return {
    ok: true,
    file: {
      exportedAt,
      schemaVersion: version as number,
      rows,
      counters: incomplete.includes("invoiceCounters") ? [] : counters,
      missing,
      incomplete,
    },
  };
}

// ── Ensaio (dry run) ────────────────────────────────────────────────────────

/**
 * O que a reposição FARIA. Lê a base de dados inteira e não escreve nada — nem
 * um registo, nem um contador. É esta a resposta ao carregar o ficheiro.
 */
export async function planRestore(file: ValidBackup): Promise<RestorePlan> {
  const now = new Date().toISOString();
  const warnings: RestoreWarning[] = [];
  const unreadable: { key: string; label: string; error: string }[] = [];
  const datasets: DatasetPlan[] = [];

  const exportedMs = Date.parse(file.exportedAt);
  let newestCurrentMs = Number.NEGATIVE_INFINITY;
  let currentInvoices: AnyRow[] = [];
  const newerBreakdown: string[] = [];

  // Leituras em paralelo — nenhuma escreve.
  const reads = await Promise.all(
    RESTORE_TARGETS.map(async (t) => {
      try {
        return { target: t, rows: await t.current(), error: null as unknown };
      } catch (err) {
        log.error("restauro: não foi possível ler o estado actual de um conjunto", err, {
          dataset: t.key,
          table: t.table,
        });
        return { target: t, rows: [] as AnyRow[], error: err };
      }
    }),
  );

  // Sondas de pré-voo, antes de qualquer escrita (e ainda dentro do ensaio):
  // um conjunto que esta base de dados não consegue receber é SALTADO, em vez
  // de ser apagado e não reposto. Ver `RestoreTarget.preflight`.
  const preflightSkips = new Map<string, string>();
  await Promise.all(
    RESTORE_TARGETS.map(async (t) => {
      const incoming = file.rows.get(t.key);
      if (!t.preflight || !incoming) return;
      const reason = await t.preflight(incoming);
      if (reason) preflightSkips.set(t.key, reason);
    }),
  );

  for (const { target, rows: currentRows, error } of reads) {
    if (error) {
      unreadable.push({
        key: target.key,
        label: target.label,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    if (target.key === "invoices") currentInvoices = currentRows;

    const incomingRows = file.rows.get(target.key);
    const skipped = skipReason(target.key, file, error != null) ?? preflightSkips.get(target.key);

    const currentIds = new Set(currentRows.map((r) => String(target.mapper.getId(r as never))));
    const incomingIds = new Set(
      (incomingRows ?? []).map((r) => String(target.mapper.getId(r as never))),
    );

    let newerThanBackup = 0;
    for (const row of currentRows) {
      const at = target.stamp(row);
      const ms = at ? Date.parse(at) : Number.NaN;
      if (Number.isNaN(ms)) continue;
      if (ms > newestCurrentMs) newestCurrentMs = ms;
      if (!Number.isNaN(exportedMs) && ms > exportedMs) newerThanBackup++;
    }
    if (newerThanBackup > 0 && !skipped) {
      newerBreakdown.push(`${target.label} (${newerThanBackup})`);
    }

    let created = 0;
    for (const key of incomingIds) if (!currentIds.has(key)) created++;
    let removed = 0;
    for (const key of currentIds) if (!incomingIds.has(key)) removed++;

    datasets.push({
      key: target.key,
      label: target.label,
      table: target.table,
      incoming: incomingRows?.length ?? 0,
      current: currentRows.length,
      created: skipped ? 0 : created,
      replaced: skipped ? 0 : incomingIds.size - created,
      removed: skipped ? 0 : removed,
      newerThanBackup,
      skipped,
    });

    if (!skipped && incomingRows) {
      const loss = target.lossWarning?.(incomingRows);
      if (loss) warnings.push({ level: "aviso", message: loss });
    }
  }

  // ── Contadores de numeração fiscal ──
  const fileInvoices = file.rows.get("invoices") ?? [];
  const candidateYears = [
    ...file.counters.map((c) => c.year),
    ...fileInvoices.map((i) => Number(String(i.number ?? "").match(/\d{4}/)?.[0] ?? 0)),
    ...currentInvoices.map((i) => Number(String(i.number ?? "").match(/\d{4}/)?.[0] ?? 0)),
    new Date().getFullYear(),
  ].filter((y) => Number.isInteger(y) && y > 1900);

  let currentCounters: { year: number; n: number }[] = [];
  try {
    currentCounters = await readInvoiceCounters(candidateYears);
  } catch (err) {
    log.error("restauro: não foi possível ler os contadores de numeração", err);
    unreadable.push({
      key: "invoiceCounters",
      label: "Contadores de numeração",
      error: err instanceof Error ? err.message : String(err),
    });
  }

  const counters = planInvoiceCounters({
    fileCounters: file.counters,
    fileInvoices: fileInvoices as { number?: unknown }[],
    currentCounters,
    currentInvoices: currentInvoices as { number?: unknown }[],
  });

  // ── Avisos ──
  const totals = datasets.reduce(
    (acc, d) => ({
      incoming: acc.incoming + d.incoming,
      current: acc.current + d.current,
      created: acc.created + d.created,
      replaced: acc.replaced + d.replaced,
      removed: acc.removed + d.removed,
      newerThanBackup: acc.newerThanBackup + (d.skipped ? 0 : d.newerThanBackup),
    }),
    { incoming: 0, current: 0, created: 0, replaced: 0, removed: 0, newerThanBackup: 0 },
  );

  const newestCurrent =
    newestCurrentMs === Number.NEGATIVE_INFINITY ? null : new Date(newestCurrentMs).toISOString();
  const ageDays = daysBetween(file.exportedAt, now);

  if (totals.current > 0) {
    warnings.push({
      level: "critico",
      message:
        `O destino NÃO está vazio: ${totals.current} registos vão ser apagados e substituídos pelos ` +
        `${totals.incoming} da cópia. ${totals.removed} desses registos não existem na cópia e desaparecem para sempre.`,
    });
  }

  if (!Number.isNaN(exportedMs) && newestCurrentMs > exportedMs) {
    const gap = daysBetween(file.exportedAt, newestCurrent!);
    warnings.push({
      level: "critico",
      message:
        `⚠️ ESTA CÓPIA É MAIS ANTIGA DO QUE OS DADOS QUE LÁ ESTÃO. Foi exportada em ` +
        `${file.exportedAt.slice(0, 10)} e a base de dados tem registos de ${newestCurrent!.slice(0, 10)}` +
        `${gap && gap > 0 ? `, ${gap} dia(s) depois` : ""}. ` +
        (totals.newerThanBackup > 0
          ? `${totals.newerThanBackup} registos criados ou alterados DEPOIS desta cópia vão ser apagados: ${newerBreakdown.join(", ")}.`
          : "Confirme que é mesmo esta a cópia que quer repor."),
    });
  }

  if (file.missing.length) {
    const names = file.missing.map((k) => TARGET_BY_KEY.get(k)?.label ?? k);
    warnings.push({
      level: "aviso",
      message: `A cópia não traz estes conjuntos e por isso eles NÃO são tocados (ficam como estão): ${names.join(", ")}.`,
    });
  }

  for (const [key, reason] of preflightSkips) {
    warnings.push({
      level: "critico",
      message: `"${TARGET_BY_KEY.get(key)?.label ?? key}" NÃO vai ser reposto: ${reason}`,
    });
  }

  if (file.incomplete.length) {
    const names = file.incomplete.map((k) => TARGET_BY_KEY.get(k)?.label ?? k);
    warnings.push({
      level: "critico",
      message:
        `A própria cópia admite estar INCOMPLETA nestes conjuntos (falharam a exportação e ficaram vazios): ` +
        `${names.join(", ")}. Não vão ser repostos — repor um vazio por avaria apagaria dados bons.`,
    });
  }

  const raised = counters.filter((c) => c.raised);
  if (raised.length) {
    warnings.push({
      level: "aviso",
      message:
        `Numeração fiscal: o contador de ${raised.map((c) => `${c.year} fica em ${c.willBe} (a cópia dizia ${c.inFile ?? 0})`).join("; ")}. ` +
        `Um contador nunca é reposto abaixo do número de fatura mais alto já emitido — isso reemitiria números já usados.`,
    });
  }

  // Referências penduradas: a cópia é coerente consigo própria?
  const dangling = danglingReferences(file);
  if (dangling.length) {
    warnings.push({
      level: "aviso",
      message: `Referências sem destino dentro da própria cópia: ${dangling.join("; ")}. A base de dados pode recusar essas linhas.`,
    });
  }

  if (unreadable.length) {
    warnings.push({
      level: "critico",
      message:
        `Não foi possível ler o estado actual de: ${unreadable.map((u) => u.label).join(", ")}. ` +
        `A reposição está BLOQUEADA — sem saber o que lá está não há cópia fiável do estado anterior.`,
    });
  }

  warnings.push({ level: "aviso", message: PHOTOS_NOTICE });

  return {
    exportedAt: file.exportedAt,
    schemaVersion: file.schemaVersion,
    ageDays,
    newestCurrent,
    datasets,
    counters,
    warnings,
    totals,
    unreadable,
    photosNotice: PHOTOS_NOTICE,
  };
}

/** Porque é que um conjunto não vai ser reposto (ou undefined, se vai). */
function skipReason(key: string, file: ValidBackup, unreadable: boolean): string | undefined {
  if (unreadable) return "não foi possível ler o estado actual deste conjunto";
  if (file.incomplete.includes(key)) return "a cópia declara este conjunto como incompleto";
  if (!file.rows.has(key)) return "a cópia não traz este conjunto";
  return undefined;
}

/** Ligações da cópia que apontam para registos que a própria cópia não traz. */
function danglingReferences(file: ValidBackup): string[] {
  const out: string[] = [];
  const quoteIds = new Set((file.rows.get("quotes") ?? []).map((q) => String(q.id)));
  const proposalIds = new Set((file.rows.get("proposals") ?? []).map((p) => String(p.id)));

  if (file.rows.has("quotes") && file.rows.has("proposals")) {
    const n = (file.rows.get("proposals") ?? []).filter(
      (p) => p.quoteId && !quoteIds.has(String(p.quoteId)),
    ).length;
    if (n) out.push(`${n} proposta(s) apontam para pedidos que não estão na cópia`);
  }
  if (file.rows.has("messageLinks")) {
    const links = file.rows.get("messageLinks") ?? [];
    const q = file.rows.has("quotes")
      ? links.filter((l) => l.quoteId && !quoteIds.has(String(l.quoteId))).length
      : 0;
    const p = file.rows.has("proposals")
      ? links.filter((l) => l.proposalId && !proposalIds.has(String(l.proposalId))).length
      : 0;
    if (q)
      out.push(
        `${q} anotação(ões) da caixa de entrada apontam para pedidos que não estão na cópia`,
      );
    if (p)
      out.push(
        `${p} anotação(ões) da caixa de entrada apontam para propostas que não estão na cópia`,
      );
  }
  return out;
}

// ── Escrita ─────────────────────────────────────────────────────────────────

export interface ApplyResult {
  applied: RestoreOutcome[];
  failed: DatasetFailure[];
  counters: CounterPlan[];
  countersFailed: DatasetFailure[];
}

/**
 * ESCREVE. Só deve ser chamada depois de `validateBackupFile` ter dito `ok`,
 * de `planRestore` não ter deixado nada em `unreadable` e de quem repõe ter
 * escrito a frase de confirmação — a rota trata dessa sequência, e de fazer a
 * cópia do estado actual antes de chamar isto.
 *
 * Cada conjunto é apagado e reescrito. Um conjunto que falhe NÃO trava os
 * outros (parar a meio deixaria a base num estado ainda pior do que continuar)
 * mas sai em `failed` PELO NOME, e a rota devolve isso ao ecrã.
 */
export async function applyRestore(file: ValidBackup, plan: RestorePlan): Promise<ApplyResult> {
  const applied: RestoreOutcome[] = [];
  const failed: DatasetFailure[] = [];
  const sb = getSupabase();

  for (const target of RESTORE_TARGETS) {
    const rows = file.rows.get(target.key);
    const planned = plan.datasets.find((d) => d.key === target.key);
    if (!rows || planned?.skipped) continue;
    try {
      const deleted = planned?.current ?? 0;
      await replaceAll(sb, target, rows);
      applied.push({ key: target.key, label: target.label, deleted, inserted: rows.length });
    } catch (err) {
      log.error("restauro: conjunto NÃO foi reposto", err, {
        dataset: target.key,
        table: target.table,
      });
      failed.push({
        key: target.key,
        label: target.label,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Os contadores vão SEMPRE, mesmo que as faturas tenham falhado: a garantia
  // "a numeração nunca recua" não pode depender do sucesso de outro conjunto.
  const countersFailed = await applyCounters(sb, plan.counters);

  return { applied, failed, counters: plan.counters, countersFailed };
}

/** Apaga tudo e reescreve. A conversão é a do `mapper` do store, sempre. */
async function replaceAll(
  sb: SupabaseClient | null,
  target: RestoreTarget<AnyRow>,
  rows: AnyRow[],
): Promise<void> {
  if (sb) {
    // PostgREST exige um filtro num delete: `id is not null` é verdade para
    // toda a linha (a coluna é chave primária) e apaga a tabela inteira.
    const del = await sb.from(target.table).delete().not("id", "is", null);
    if (del.error) throw del.error;
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows
        .slice(i, i + CHUNK)
        // `toRow` primeiro (é a tradução oficial do store) e por cima as
        // colunas que ele deixa à base de dados preencher — ver `extraColumns`.
        .map((r) => ({ ...target.mapper.toRow(r as never), ...(target.extraColumns?.(r) ?? {}) }));
      const { error } = await sb.from(target.table).insert(chunk);
      if (error) throw error;
    }
    return;
  }

  // Sem Supabase: o backend de ficheiro do Repository, que guarda os objetos
  // de domínio tal e qual. Em produção isto é RECUSADO — gravar num ficheiro
  // efémero apagaria a base e diria que tinha reposto (a mesma recusa de
  // `FileBackend.assertWritableInProd`).
  if (process.env.NODE_ENV === "production") {
    log.error(
      "restauro: gravação recusada — Supabase não configurado em produção; o fallback para ficheiro é volátil.",
      undefined,
      { file: target.mapper.fileName },
    );
    throw new Error("Persistence unavailable: Supabase not configured in production");
  }
  const file = path.join(process.cwd(), "data", target.mapper.fileName);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(rows, null, 2));
}

/** Grava os contadores no valor planeado e CONFIRMA que ficaram lá. */
async function applyCounters(
  sb: SupabaseClient | null,
  counters: CounterPlan[],
): Promise<DatasetFailure[]> {
  const failed: DatasetFailure[] = [];
  if (!counters.length) return failed;

  if (sb) {
    try {
      const { error } = await sb
        .from("invoice_counters")
        .upsert(counters.map((c) => ({ year: c.year, n: c.willBe })));
      if (error) throw error;
    } catch (err) {
      log.error("restauro: contadores de numeração NÃO foram repostos", err);
      failed.push({
        key: "invoiceCounters",
        label: "Contadores de numeração",
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return failed;
  }

  // Desenvolvimento: o contador vive em `app_state`. `setState` engole os
  // erros (por desenho — é um marcador operacional), por isso lê-se de volta:
  // um contador de faturas que não ficou gravado não pode passar por gravado.
  for (const c of counters) {
    const key = `invoice-seq-${c.year}`;
    await setState(key, c.willBe);
    const readBack = await getState<number>(key);
    if (readBack !== c.willBe) {
      failed.push({
        key: "invoiceCounters",
        label: `Contador de numeração de ${c.year}`,
        error: `ficou em ${readBack ?? "nada"} em vez de ${c.willBe}`,
      });
    }
  }
  return failed;
}
