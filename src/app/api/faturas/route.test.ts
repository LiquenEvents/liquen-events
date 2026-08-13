import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mock the data layer; keep the route logic + money math real ──
// An in-memory ledger that persists across the request so the duplicate-sinal
// guard (listInvoicesForQuote → reject) can be exercised end-to-end.
const ledger = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
  idSeq: 0,
  numSeq: 0,
}));

/**
 * Os pedidos, em memória. Emitir uma factura passou a EMPURRAR o estado do
 * pedido (ver `@/lib/orcamento/estado-do-pedido`): sem este duplo, a rota ia
 * bater no repositório a sério a meio de um teste de unidade.
 */
const pedidos = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/quotes-store", () => ({
  updateQuoteWith: vi.fn(
    async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
      const actual = pedidos.store.get(id);
      if (!actual) return null;
      const proximo = mutar(actual);
      pedidos.store.set(id, proximo);
      return proximo;
    },
  ),
}));
vi.mock("@/lib/invoices-store", () => ({
  listInvoices: vi.fn(async () => ledger.rows),
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    ledger.rows.filter((r) => r.quoteId === quoteId),
  ),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    ledger.rows.push(i);
  }),
  nextInvoiceNumber: vi.fn(async () => `FT 2026/${String(++ledger.numSeq).padStart(4, "0")}`),
  newInvoiceId: vi.fn(() => `inv-${++ledger.idSeq}`),
  // Real 30/70 split (saldo by subtraction), mirroring @/lib/money.
  splitThirtySeventy: (total: number) => {
    const sinal = Math.round(total * 0.3 * 100) / 100;
    return { sinal, saldo: Math.round((total - sinal) * 100) / 100 };
  },
  // Mirror the real recogniser so the route's 409 backstop branch is exercised.
  isUniqueViolation: (err: unknown) =>
    !!err && typeof err === "object" && (err as { code?: string }).code === "23505",
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";
import { createInvoice, nextInvoiceNumber } from "@/lib/invoices-store";
import { updateQuoteWith } from "@/lib/quotes-store";

function req(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/faturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

// Raw-body variant so we can send malformed JSON / non-object bodies.
function rawReq(raw: string): NextRequest {
  return new Request("https://liquen.test/api/faturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw,
  }) as unknown as NextRequest;
}

function seedInvoice(over: Record<string, unknown>) {
  ledger.rows.push({
    id: `seed-${ledger.rows.length + 1}`,
    number: "FT 2026/0001",
    quoteId: "q-1",
    clientName: "Cliente",
    kind: "sinal",
    amount: 3000,
    status: "emitida",
    ...over,
  });
}

beforeEach(() => {
  ledger.rows = [];
  ledger.idSeq = 0;
  ledger.numSeq = 0;
  pedidos.store.clear();
  pedidos.store.set("q-1", { id: "q-1", name: "Ana", status: "cotado" });
  vi.clearAllMocks();
});

describe("POST /api/faturas — split path duplicate-sinal guard", () => {
  it("issues the sinal + saldo pair when the event has no prior invoices", async () => {
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices).toHaveLength(2);
    expect(json.invoices.map((i: { kind: string }) => i.kind)).toEqual(["sinal", "saldo"]);
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });

  it("rejects with 409 when a non-anulada sinal already exists (no double-issue)", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal");
    expect(json.error).toContain("FT 2026/0001"); // surfaces the existing number
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects with 409 when a non-anulada saldo already exists", async () => {
    seedInvoice({ kind: "saldo", number: "FT 2026/0002", status: "emitida" });
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de saldo");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("still issues when the only prior sinal is anulada (guard ignores anulada)", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "anulada" });
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });

  it("does not block the split when no quoteId is provided (guard is per-event)", async () => {
    // A prior sinal on some quote must not leak into an unlinked manual split.
    seedInvoice({ kind: "sinal", quoteId: "q-1", status: "emitida" });
    const res = await POST(req({ split: true, clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(2);
  });

  it("rejects a split with a non-positive total (400 Total inválido, nothing created)", async () => {
    for (const total of [0, -100]) {
      vi.clearAllMocks();
      const res = await POST(req({ split: true, clientName: "Ana", total }));
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toBe("Total inválido");
      expect(createInvoice).not.toHaveBeenCalled();
    }
  });

  it("assigns two DISTINCT consecutive numbers to the sinal and saldo", async () => {
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    const json = await res.json();
    const [sinal, saldo] = json.invoices;
    expect(sinal.number).toBe("FT 2026/0001");
    expect(saldo.number).toBe("FT 2026/0002");
    expect(sinal.number).not.toBe(saldo.number);
    expect(sinal.amount).toBe(3000);
    expect(saldo.amount).toBe(7000);
    expect(nextInvoiceNumber).toHaveBeenCalledTimes(2);
  });

  it("clamps a huge split total to the 1e8 ceiling before splitting", async () => {
    const res = await POST(req({ split: true, clientName: "Ana", total: 999_999_999 }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices[0].amount).toBe(30_000_000); // 30% of the 1e8 clamp
    expect(json.invoices[1].amount).toBe(70_000_000);
  });

  it("maps a Postgres unique-violation on the split insert to 409 (race backstop, not 500)", async () => {
    vi.mocked(createInvoice).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal/saldo");
  });
});

describe("POST /api/faturas — single-invoice duplicate-sinal/saldo guard (FIX 1)", () => {
  it("rejects a single Tipo=Sinal when a non-anulada sinal already exists", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal");
    expect(json.error).toContain("FT 2026/0001"); // surfaces the existing number
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a single Tipo=Saldo when a non-anulada saldo already exists", async () => {
    seedInvoice({ kind: "saldo", number: "FT 2026/0007", status: "paga" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 7000, kind: "saldo" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de saldo");
    expect(json.error).toContain("FT 2026/0007");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("issues a single sinal when the only prior one is anulada (guard ignores anulada)", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "anulada" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("never blocks a single Tipo=Total even when a sinal/saldo exists", async () => {
    seedInvoice({ kind: "sinal", number: "FT 2026/0001", status: "emitida" });
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 9000, kind: "total" }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("does not block a single sinal when no quoteId is provided (guard is per-event)", async () => {
    seedInvoice({ kind: "sinal", quoteId: "q-1", status: "emitida" });
    const res = await POST(req({ clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("rejects a negative single amount (clamped to 0 → 400 Valor inválido)", async () => {
    const res = await POST(req({ clientName: "Ana", amount: -500, kind: "total" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Valor inválido");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("defaults vatRate to 0.23 when absent and carries a provided rate", async () => {
    const a = await POST(req({ clientName: "Ana", amount: 1000, kind: "total" }));
    expect((await a.json()).invoices[0].vatRate).toBe(0.23);

    const b = await POST(req({ clientName: "Ana", amount: 1000, kind: "total", vatRate: 0.06 }));
    expect((await b.json()).invoices[0].vatRate).toBe(0.06);
  });

  it("clamps a huge single amount to the 1e8 ceiling", async () => {
    const res = await POST(req({ clientName: "Ana", amount: 5_000_000_000, kind: "total" }));
    const json = await res.json();
    expect(json.invoices[0].amount).toBe(100_000_000);
  });

  it("maps a unique-violation on a single sinal insert to 409 (not 500)", async () => {
    vi.mocked(createInvoice).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "sinal" }));
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain("Já existe uma fatura de sinal");
  });

  it("a unique-violation on a single TOTAL insert is NOT masked as 409 (re-thrown → 500)", async () => {
    // O backstop 409 só se aplica a sinal/saldo (têm índice único). Um total não
    // tem, por isso um erro de unicidade improvável não deve ser mascarado.
    vi.mocked(createInvoice).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }));
    expect(res.status).toBe(500);
  });
});

describe("POST /api/faturas — input validation (400s, never 500 / bad data)", () => {
  it("rejects malformed JSON with 400 (not 500)", async () => {
    const res = await POST(rawReq("{ not valid json"));
    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a non-object body (null) with 400", async () => {
    const res = await POST(rawReq("null"));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Corpo do pedido inválido.");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects a primitive body (a bare string) with 400", async () => {
    const res = await POST(rawReq('"hello"'));
    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects an array body with 400", async () => {
    const res = await POST(rawReq("[1,2,3]"));
    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects an unknown kind with 400 (instead of silently defaulting)", async () => {
    const res = await POST(req({ clientName: "Ana", amount: 3000, kind: "garbage" }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Tipo de fatura inválido.");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects an out-of-range vatRate with 400", async () => {
    const res = await POST(req({ clientName: "Ana", amount: 3000, vatRate: 5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Taxa de IVA inválida.");
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("rejects an object where a scalar text field is expected (no [object Object] in the book)", async () => {
    const res = await POST(req({ clientName: { evil: true }, amount: 3000 }));
    expect(res.status).toBe(400);
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("still 400s the empty-client case via the route guard (message preserved)", async () => {
    const res = await POST(req({ amount: 3000 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Cliente obrigatório");
  });

  it("keeps accepting a numeric string amount (coercion preserved)", async () => {
    const res = await POST(req({ clientName: "Ana", amount: "3000", kind: "total" }));
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices[0].amount).toBe(3000);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * EMITIR A FACTURA PASSA O PEDIDO A «GANHO»
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Esta rota não tocava no pedido. Ela emitia o sinal daqui — que é a reserva da
 * data, o momento em que o trabalho fica mesmo dela — e o quadro continuava a
 * dizer «Proposta enviada». O negócio ganho, e a única vista que serve para
 * saber o que falta fazer a não saber.
 *
 * A regra em si está guardada nos testes de `@/lib/orcamento/estado-do-pedido`.
 * O que ESTES testes prendem é a ligação: que esta rota a chama, com o
 * acontecimento certo, depois de a factura estar mesmo no livro.
 */
describe("POST /api/faturas — o estado do pedido segue a emissão", () => {
  it("o par sinal + saldo dá o pedido por ganho", async () => {
    const res = await POST(req({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }));
    expect(res.status).toBe(201);
    expect(pedidos.store.get("q-1")).toMatchObject({ status: "aceite" });
  });

  it("uma fatura avulsa também o dá por ganho", async () => {
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }));
    expect(res.status).toBe(201);
    expect(pedidos.store.get("q-1")).toMatchObject({ status: "aceite" });
  });

  /** Ela vê a coluna mudar sozinha; tem de poder ir ver porquê. */
  it("deixa no histórico o número da fatura que causou a mudança", async () => {
    await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }));
    const log = (pedidos.store.get("q-1")?.activityLog ?? []) as {
      actor?: string;
      summary: string;
    }[];
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("Sistema");
    expect(log[0].summary).toContain("FT 2026/");
  });

  /**
   * Um trabalho perdido é uma decisão de uma pessoa, e uma factura de
   * cancelamento não o ressuscita no quadro.
   */
  it("não tira de «Perdido» um pedido que alguém deu por perdido", async () => {
    pedidos.store.set("q-1", { id: "q-1", name: "Ana", status: "rejeitado" });
    await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 500, kind: "total" }));
    expect(pedidos.store.get("q-1")).toMatchObject({ status: "rejeitado" });
  });

  /**
   * A factura fica emitida mesmo que o pedido já não exista (foi apagado à
   * mão depois de o link ter saído) ou que a gravação do estado rebente. Uma
   * factura EMITIDA não pode virar "Erro ao criar a fatura" por causa da cor
   * de uma coluna: ela lê "erro", tenta outra vez, e leva com o 409 da guarda
   * de duplicação.
   */
  it("a fatura sai na mesma quando o pedido já não existe", async () => {
    const res = await POST(
      req({ quoteId: "fantasma", clientName: "Ana", amount: 3000, kind: "total" }),
    );
    expect(res.status).toBe(201);
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("uma fatura sem pedido associado não tenta mexer em pedido nenhum", async () => {
    const res = await POST(req({ clientName: "Ana", amount: 3000, kind: "total" }));
    expect(res.status).toBe(201);
    expect(updateQuoteWith).not.toHaveBeenCalled();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANDO A NUMERAÇÃO NÃO ESTÁ DISPONÍVEL, ISSO TEM DE SE PERCEBER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `nextInvoiceNumber` recusa emitir em dois casos, ambos fiscais: com Supabase
 * configurado e a RPC atómica em baixo (migração por correr), e em produção sem
 * Supabase nenhum (o contador viveria num ficheiro que o deploy apaga e a
 * numeração recomeçaria em 0001, repetindo números já emitidos).
 *
 * A recusa estava a sair daqui como «Erro ao criar a fatura», 500. Isso é o
 * pior dos dois mundos: impede-se a emissão — que é a decisão certa — e não se
 * diz porquê, portanto ela tenta outra vez, e outra, e acaba a escrever a
 * alguém. A recusa só vale se trouxer o que fazer a seguir.
 */
describe("POST /api/faturas — a numeração fiscal indisponível é uma resposta, não um erro", () => {
  it("responde 503 com a frase que diz o que falta", async () => {
    vi.mocked(nextInvoiceNumber).mockRejectedValueOnce(
      new Error(
        "Numeração de faturas indisponível: sem base de dados, o contador não sobrevive a um deploy e a numeração fiscal repetir-se-ia. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no alojamento antes de emitir.",
      ),
    );
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/Numeração de faturas indisponível/);
  });

  it("e não cria factura nenhuma", async () => {
    vi.mocked(nextInvoiceNumber).mockRejectedValueOnce(
      new Error("Numeração de faturas indisponível: o contador atómico falhou."),
    );
    await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }));
    expect(createInvoice).not.toHaveBeenCalled();
  });

  /** Qualquer outra avaria continua a ser um 500 genérico: não se põe o texto
   *  interno de um erro desconhecido à frente de quem está a trabalhar. */
  it("uma avaria qualquer continua a ser 500", async () => {
    vi.mocked(nextInvoiceNumber).mockRejectedValueOnce(new Error("ligação perdida"));
    const res = await POST(req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }));
    expect(res.status).toBe(500);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * A DATA DE EMISSÃO É O DIA DE LISBOA, NÃO O DE GREENWICH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `new Date().toISOString()` é UTC. No Verão em Portugal (UTC+1), entre a
 * meia-noite e a uma da manhã isso dá o dia ANTERIOR — e esta é a data que sai
 * impressa no documento fiscal e que decide o período de IVA.
 *
 * A hora fica FIXA (e o processo em UTC, como o alojamento onde isto corre):
 * um teste que só falhasse durante essa hora não guardava nada.
 */
describe("POST /api/faturas — a data de emissão por omissão", () => {
  it("à 00:30 de um dia de agosto emite com a data de HOJE em Lisboa", async () => {
    process.env.TZ = "UTC";
    vi.useFakeTimers();
    // 14 de agosto de 2026, 00:30 em Lisboa (UTC+1) — 13 de agosto, 23:30 UTC.
    vi.setSystemTime(new Date("2026-08-13T23:30:00Z"));
    try {
      const res = await POST(
        req({ quoteId: "q-1", clientName: "Ana", amount: 3000, kind: "total" }),
      );
      expect(res.status).toBe(201);
      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ issuedAt: "2026-08-14" }),
      );
    } finally {
      vi.useRealTimers();
      delete process.env.TZ;
    }
  });

  it("uma data escrita à mão continua a mandar", async () => {
    process.env.TZ = "UTC";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T23:30:00Z"));
    try {
      await POST(
        req({
          quoteId: "q-1",
          clientName: "Ana",
          amount: 3000,
          kind: "total",
          issuedAt: "2026-07-01",
        }),
      );
      expect(createInvoice).toHaveBeenCalledWith(
        expect.objectContaining({ issuedAt: "2026-07-01" }),
      );
    } finally {
      vi.useRealTimers();
      delete process.env.TZ;
    }
  });
});
