import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

// ── Mock the data layer; keep the route logic + money math real ──
const invoicesDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));
const proposalsDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));

/**
 * Os pedidos, em memória. Dar uma factura por paga passou a EMPURRAR o estado
 * do pedido para «Ganho» (ver `@/lib/orcamento/estado-do-pedido`) — sem este
 * duplo, a rota ia bater no repositório a sério a meio de um teste de unidade.
 */
const pedidos = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));

const authState = vi.hoisted(() => ({ authed: true }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));

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
  getInvoice: vi.fn(async (id: string) => invoicesDb.store.get(id) ?? null),
  updateInvoice: vi.fn(async (id: string, patch: Record<string, unknown>) => {
    const cur = invoicesDb.store.get(id);
    if (!cur) return null;
    const next = { ...cur, ...patch };
    invoicesDb.store.set(id, next);
    return next;
  }),
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    [...invoicesDb.store.values()].filter((i) => i.quoteId === quoteId),
  ),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    invoicesDb.store.set(i.id as string, i);
  }),
  deleteInvoice: vi.fn(async (id: string) => {
    invoicesDb.store.delete(id);
  }),
  newInvoiceId: vi.fn(() => `inv-${invoicesDb.store.size + 1}`),
  nextInvoiceNumber: vi.fn(async () => "FT 2026/0002"),
  // Real 30/70 split (saldo by subtraction), mirroring @/lib/money.
  splitThirtySeventy: (total: number) => {
    const sinal = Math.round(total * 0.3 * 100) / 100;
    return { sinal, saldo: Math.round((total - sinal) * 100) / 100 };
  },
}));

vi.mock("@/lib/proposals-store", () => ({
  getProposalByQuote: vi.fn(async (quoteId: string) => proposalsDb.store.get(quoteId) ?? null),
}));

// A matemática do dinheiro é REAL: este ficheiro testa o VALOR do saldo, e
// um duplo que só traz `round2` deixa `splitSinal`/`saldoAPartirDoSinal`
// indefinidos — a rota rebenta e o teste lê-se como "não emitiu saldo".
vi.mock("@/lib/money", async () => await vi.importActual("@/lib/money"));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { PATCH, DELETE } from "./route";
import { createInvoice, listInvoicesForQuote, deleteInvoice } from "@/lib/invoices-store";

function patchReq(
  id: string,
  body: unknown,
): { req: NextRequest; params: Promise<{ id: string }> } {
  const req = new Request(`https://liquen.test/api/faturas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ id }) };
}

// Raw-body variant so we can send malformed JSON / non-object bodies.
function rawPatchReq(
  id: string,
  raw: string,
): { req: NextRequest; params: Promise<{ id: string }> } {
  const req = new Request(`https://liquen.test/api/faturas/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: raw,
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ id }) };
}

function seedSinal(id: string, over: Record<string, unknown> = {}) {
  // O pedido a que a factura pertence, no estado em que estaria: a proposta
  // seguiu, o cliente ainda não está marcado como ganho no quadro.
  pedidos.store.set(`q-${id}`, { id: `q-${id}`, name: "Cliente Teste", status: "cotado" });
  invoicesDb.store.set(id, {
    id,
    number: "FT 2026/0001",
    quoteId: `q-${id}`,
    clientName: "Cliente Teste",
    clientEmail: "cliente@example.com",
    kind: "sinal",
    amount: 3750, // 30% de 12500
    vatRate: 0.23,
    issuedAt: "2026-07-01",
    status: "emitida",
    ...over,
  });
}

function delReq(id: string): { req: NextRequest; params: Promise<{ id: string }> } {
  const req = new Request(`https://liquen.test/api/faturas/${id}`, {
    method: "DELETE",
  }) as unknown as NextRequest;
  return { req, params: Promise.resolve({ id }) };
}

beforeEach(() => {
  invoicesDb.store.clear();
  proposalsDb.store.clear();
  pedidos.store.clear();
  authState.authed = true;
  vi.clearAllMocks();
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * DINHEIRO RECEBIDO É O SINAL MAIS FORTE DE TODOS
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Marcar uma factura como paga não tocava no pedido. É a acção que menos
 * ambiguidade tem em todo o back office — entrou dinheiro — e era a que menos
 * consequências tinha no quadro: ela dava o sinal por recebido, a data ficava
 * reservada, e o pedido continuava a dizer «Proposta enviada».
 *
 * A regra está guardada nos testes de `@/lib/orcamento/estado-do-pedido`; o que
 * estes prendem é a ligação, e sobretudo o que ela NÃO faz ao voltar atrás.
 */
describe("PATCH /api/faturas/[id] — o estado do pedido segue o dinheiro", () => {
  it("dar o sinal por pago passa o pedido a «Ganho»", async () => {
    seedSinal("f1");
    const { req, params } = patchReq("f1", { status: "paga" });
    await PATCH(req, { params });
    expect(pedidos.store.get("q-f1")).toMatchObject({ status: "aceite" });
  });

  it("deixa no histórico a fatura e o valor que causaram a mudança", async () => {
    seedSinal("f1");
    const { req, params } = patchReq("f1", { status: "paga" });
    await PATCH(req, { params });
    const log = (pedidos.store.get("q-f1")?.activityLog ?? []) as {
      actor?: string;
      summary: string;
    }[];
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("Sistema");
    expect(log[0].summary).toContain("FT 2026/0001");
  });

  /**
   * O não-recuo, do lado que mais custa: uma factura anulada por engano de
   * digitação não pode desfechar um casamento no quadro. Se o trabalho se
   * perdeu mesmo, quem o marca como perdido é uma pessoa.
   */
  it("reverter ou anular a fatura NÃO puxa o pedido para trás", async () => {
    seedSinal("f1");
    await PATCH(patchReq("f1", { status: "paga" }).req, {
      params: Promise.resolve({ id: "f1" }),
    });
    expect(pedidos.store.get("q-f1")).toMatchObject({ status: "aceite" });

    for (const estado of ["emitida", "anulada"]) {
      await PATCH(patchReq("f1", { status: estado }).req, {
        params: Promise.resolve({ id: "f1" }),
      });
      expect(pedidos.store.get("q-f1")).toMatchObject({ status: "aceite" });
    }
  });

  it("uma edição que não seja o pagamento não mexe no pedido", async () => {
    seedSinal("f1");
    const { req, params } = patchReq("f1", { note: "a rever com a cliente" });
    await PATCH(req, { params });
    expect(pedidos.store.get("q-f1")).toMatchObject({ status: "cotado" });
  });

  it("regravar uma fatura JÁ paga não volta a escrever no histórico", async () => {
    seedSinal("f1", { status: "paga", paidAt: "2026-07-02" });
    const { req, params } = patchReq("f1", { status: "paga" });
    await PATCH(req, { params });
    expect(pedidos.store.get("q-f1")?.activityLog).toBeUndefined();
  });
});

describe("PATCH /api/faturas/[id] — auto-saldo on sinal paid", () => {
  /**
   * A PERCENTAGEM DO SINAL VEM DA PROPOSTA.
   *
   * Era 30% escrito em dois sítios: `splitThirtySeventy` e um `sinal / 3 × 7`
   * à mão, aqui nesta rota. Uma proposta a dizer 40% com uma factura a sair a
   * 30% é pior do que não poder mudar a percentagem de todo — e o erro só se
   * descobre quando o cliente recebe o saldo errado.
   */
  it("o saldo segue a percentagem da proposta, não os 30% de sempre", async () => {
    // 40% de 12.500 são 5.000; o saldo tem de ser 7.500.
    seedSinal("s40", { amount: 5000 });
    proposalsDb.store.set("q-s40", { total: 12500, doc: { depositPercent: 40 } });

    const { req, params } = patchReq("s40", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect((await res.json()).saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 7500 });
  });

  it("sem proposta, deriva do sinal pela percentagem da casa", async () => {
    // É o caminho que antes estava escrito como `sinal / 3 × 7`.
    seedSinal("s-sem", { amount: 3750 });
    const { req, params } = patchReq("s-sem", { status: "paga" });
    const res = await PATCH(req, { params });
    expect((await res.json()).saldoAutoIssued).toMatchObject({ amount: 8750 });
  });

  it("marking a sinal paga auto-issues a saldo (kind + amount from the proposal total)", async () => {
    seedSinal("s1");
    proposalsDb.store.set("q-s1", { total: 12500 });

    const { req, params } = patchReq("s1", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();

    // The updated sinal is returned, with the created saldo attached for the UI.
    expect(json).toMatchObject({ id: "s1", kind: "sinal", status: "paga" });
    expect(json.saldoAutoIssued).toMatchObject({
      kind: "saldo",
      amount: 8750, // 70% de 12500
      vatRate: 0.23,
      status: "emitida",
      quoteId: "q-s1",
      note: "Saldo 70% — remanescente após sinal",
    });
    // dueAt defaults to +30 days from issuedAt.
    expect(json.saldoAutoIssued.dueAt).toBeTruthy();
    expect(json.saldoAutoIssued.dueAt).not.toBe(json.saldoAutoIssued.issuedAt);

    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("falls back to deriving the saldo from the sinal amount when no proposal exists", async () => {
    seedSinal("s2"); // no proposal seeded → saldo = 3750 / 3 * 7
    const { req, params } = patchReq("s2", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 8750 });
  });

  it("carries the sinal's own vatRate into the auto-saldo, not a hardcoded 0.23 (FIX 4)", async () => {
    // Proposta a 6% ⇒ o sinal foi faturado a 0.06; o saldo tem de espelhar isso.
    seedSinal("s-vat", { vatRate: 0.06 });
    const { req, params } = patchReq("s-vat", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", vatRate: 0.06 });
  });

  it("defaults the auto-saldo vatRate to 0.23 when the sinal has none", async () => {
    seedSinal("s-novat", { vatRate: undefined });
    const { req, params } = patchReq("s-novat", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", vatRate: 0.23 });
  });

  it("is idempotent: no second saldo when one already exists for the quote", async () => {
    seedSinal("s3");
    // A saldo already sits in the ledger for this quote.
    invoicesDb.store.set("existing-saldo", {
      id: "existing-saldo",
      quoteId: "q-s3",
      kind: "saldo",
      amount: 8750,
      status: "emitida",
    });

    const { req, params } = patchReq("s3", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();

    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("derives the saldo from the billed sinal, ignoring a differing newest-proposal total (#41)", async () => {
    seedSinal("s7"); // sinal €3750
    // Proposta revista APÓS o aceite: total maior ⇒ o saldo 70% da proposta seria
    // €14000. Não deve ser usado — a fonte de verdade é o sinal já faturado.
    proposalsDb.store.set("q-s7", { total: 20000 });

    const { req, params } = patchReq("s7", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    // 3750 / 3 * 7 = 8750, e NÃO 14000 (70% de 20000).
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 8750 });
  });

  it("bills the EXACT saldo (total − sinal) for a non-integer proposal total — no lost cent", async () => {
    // Total de cêntimo ímpar: €10000,01 ⇒ sinal €3000,00, saldo exacto €7000,01.
    // O fallback sinal/3×7 daria €7000,00 (1 cêntimo a menos); como a proposta é
    // coerente com o sinal faturado, o saldo tem de fechar o total ao cêntimo.
    seedSinal("s-odd", { amount: 3000 }); // 30% de 10000,01
    proposalsDb.store.set("q-s-odd", { total: 10000.01 });

    const { req, params } = patchReq("s-odd", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 7000.01 });
    // sinal 3000,00 + saldo 7000,01 = 10000,01 (o total acordado), ao cêntimo.
    expect(Math.round((3000 + json.saldoAutoIssued.amount) * 100)).toBe(1_000_001);
  });

  it("annuls an unpaid auto-saldo when the sinal is reverted from paga (#41)", async () => {
    seedSinal("s8", { status: "paga", paidAt: "2026-07-05" });
    // Saldo órfão auto-emitido, ainda por pagar.
    invoicesDb.store.set("saldo-8", {
      id: "saldo-8",
      quoteId: "q-s8",
      kind: "saldo",
      amount: 8750,
      status: "emitida",
    });

    const { req, params } = patchReq("s8", { status: "emitida" }); // paga → emitida
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json).toMatchObject({ id: "s8", status: "emitida" });
    // O saldo órfão foi anulado (não fica a estrangular o livro).
    expect(json.saldoAnnulled).toMatchObject({ id: "saldo-8", kind: "saldo", status: "anulada" });
    expect(invoicesDb.store.get("saldo-8")?.status).toBe("anulada");
  });

  it("annuls an unpaid auto-saldo when the sinal is ANULLED from paga (paga→anulada) (#41)", async () => {
    seedSinal("s8b", { status: "paga", paidAt: "2026-07-05" });
    invoicesDb.store.set("saldo-8b", {
      id: "saldo-8b",
      quoteId: "q-s8b",
      kind: "saldo",
      amount: 8750,
      status: "emitida",
    });
    const { req, params } = patchReq("s8b", { status: "anulada" }); // paga → anulada
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAnnulled).toMatchObject({ id: "saldo-8b", status: "anulada" });
    expect(invoicesDb.store.get("saldo-8b")?.status).toBe("anulada");
    // Anular o sinal também limpa o seu paidAt.
    expect(invoicesDb.store.get("s8b")?.paidAt).toBeUndefined();
  });

  it("does NOT annul any saldo when a sinal is annulled directly from emitida (no paga→ transition)", async () => {
    seedSinal("s8c", { status: "emitida" });
    invoicesDb.store.set("saldo-8c", {
      id: "saldo-8c",
      quoteId: "q-s8c",
      kind: "saldo",
      amount: 8750,
      status: "emitida",
    });
    const { req, params } = patchReq("s8c", { status: "anulada" }); // emitida → anulada
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAnnulled).toBeUndefined();
    expect(invoicesDb.store.get("saldo-8c")?.status).toBe("emitida");
  });

  it("does NOT annul a saldo that is already paga when the sinal is reverted (#41)", async () => {
    seedSinal("s9", { status: "paga", paidAt: "2026-07-05" });
    invoicesDb.store.set("saldo-9", {
      id: "saldo-9",
      quoteId: "q-s9",
      kind: "saldo",
      amount: 8750,
      status: "paga", // dinheiro real entrou — não se toca
    });

    const { req, params } = patchReq("s9", { status: "emitida" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAnnulled).toBeUndefined();
    expect(invoicesDb.store.get("saldo-9")?.status).toBe("paga");
  });

  it("re-issues a fresh saldo after an orphan was annulled (guard ignores anulada) (#41)", async () => {
    seedSinal("s10");
    // Um saldo anulado (órfão de uma reversão anterior) NÃO deve bloquear a
    // reemissão quando o sinal corrigido volta a ser pago.
    invoicesDb.store.set("saldo-10", {
      id: "saldo-10",
      quoteId: "q-s10",
      kind: "saldo",
      amount: 8750,
      status: "anulada",
    });

    const { req, params } = patchReq("s10", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toMatchObject({ kind: "saldo", amount: 8750 });
    expect(createInvoice).toHaveBeenCalledTimes(1);
  });

  it("does NOT auto-issue for a non-sinal invoice", async () => {
    seedSinal("t1", { kind: "total" });
    const { req, params } = patchReq("t1", { status: "paga" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
    // We never even look up the quote's ledger for a non-transition.
    expect(listInvoicesForQuote).not.toHaveBeenCalled();
  });

  it("does NOT auto-issue when the sinal was already paga (no transition)", async () => {
    seedSinal("s4", { status: "paga", paidAt: "2026-07-05" });
    // A re-PATCH that keeps it paga (e.g. editing the note) must not re-trigger.
    const { req, params } = patchReq("s4", { status: "paga", note: "edição" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("does NOT auto-issue for edits that don't move the sinal to paga", async () => {
    seedSinal("s5");
    const { req, params } = patchReq("s5", { note: "só uma nota" });
    const res = await PATCH(req, { params });
    const json = await res.json();
    expect(json.saldoAutoIssued).toBeUndefined();
    expect(createInvoice).not.toHaveBeenCalled();
  });

  it("marking paga still succeeds even if saldo creation throws (best-effort)", async () => {
    seedSinal("s6");
    proposalsDb.store.set("q-s6", { total: 12500 });
    vi.mocked(createInvoice).mockRejectedValueOnce(new Error("db down"));

    const { req, params } = patchReq("s6", { status: "paga" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    // The sinal is still marked paid; no saldo attached because creation failed.
    expect(json).toMatchObject({ id: "s6", status: "paga" });
    expect(json.saldoAutoIssued).toBeUndefined();
  });
});

describe("PATCH /api/faturas/[id] — input validation (400s, never 500 / bad data)", () => {
  it("rejects malformed JSON with 400 (not 500)", async () => {
    seedSinal("v1");
    const { req, params } = rawPatchReq("v1", "{ not json");
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
    // The invoice is untouched.
    expect(invoicesDb.store.get("v1")?.status).toBe("emitida");
  });

  it("rejects a non-object body (null) with 400 instead of 500", async () => {
    // Regression: the old `\"status\" in body` threw a TypeError on a non-object
    // body, surfacing as a 500. It must now be a clean 400.
    seedSinal("v2");
    const { req, params } = rawPatchReq("v2", "null");
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Corpo do pedido inválido.");
  });

  it("rejects an unknown status with 400 (message preserved)", async () => {
    seedSinal("v3");
    const { req, params } = patchReq("v3", { status: "pago_talvez" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("Estado inválido");
    expect(invoicesDb.store.get("v3")?.status).toBe("emitida");
  });

  it("rejects a wrong-typed date field with 400", async () => {
    seedSinal("v4");
    const { req, params } = patchReq("v4", { paidAt: 20260101 });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(400);
  });

  it("404s before parsing the body when the invoice does not exist", async () => {
    const { req, params } = rawPatchReq("missing", "not even json");
    const res = await PATCH(req, { params });
    expect(res.status).toBe(404);
  });

  it("still clears a date by sending an empty string (behavior preserved)", async () => {
    seedSinal("v5", { dueAt: "2026-08-01" });
    const { req, params } = patchReq("v5", { dueAt: "" });
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect(invoicesDb.store.get("v5")?.dueAt).toBeUndefined();
  });

  it("accepts an empty patch body ({}) and leaves the invoice unchanged", async () => {
    seedSinal("v6");
    const { req, params } = patchReq("v6", {});
    const res = await PATCH(req, { params });
    expect(res.status).toBe(200);
    expect(invoicesDb.store.get("v6")?.status).toBe("emitida");
  });
});

describe("DELETE /api/faturas/[id] — apagar só faturas anuladas", () => {
  it("returns 401 without auth (and never touches the store)", async () => {
    authState.authed = false;
    seedSinal("d0", { status: "anulada" });
    const { req, params } = delReq("d0");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(401);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it("returns 404 when the invoice does not exist", async () => {
    const { req, params } = delReq("missing");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(404);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it("returns 409 when the invoice is not anulada (fiscal guard)", async () => {
    seedSinal("d1"); // status emitida
    const { req, params } = delReq("d1");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toBe("Só é possível apagar faturas anuladas. Anula a fatura primeiro.");
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it("refuses to delete a paga invoice too (only anulada is deletable)", async () => {
    seedSinal("d2", { status: "paga", paidAt: "2026-07-05" });
    const { req, params } = delReq("d2");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(409);
    expect(deleteInvoice).not.toHaveBeenCalled();
  });

  it("deletes an anulada invoice: 200 + deleteInvoice called", async () => {
    seedSinal("d3", { status: "anulada" });
    const { req, params } = delReq("d3");
    const res = await DELETE(req, { params });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
    expect(deleteInvoice).toHaveBeenCalledTimes(1);
    expect(deleteInvoice).toHaveBeenCalledWith("d3");
    expect(invoicesDb.store.has("d3")).toBe(false);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * AS DATAS DO LIVRO SÃO O DIA DE LISBOA, NÃO O DE GREENWICH
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * `new Date().toISOString()` é UTC. No Verão em Portugal (UTC+1), entre a
 * meia-noite e a uma da manhã dá o dia ANTERIOR — e aqui isso carimba o dia em
 * que o dinheiro entrou, a data de emissão do saldo (documento fiscal) e o seu
 * vencimento.
 *
 * A hora fica FIXA, e o processo em UTC como o alojamento onde isto corre.
 */
describe("PATCH /api/faturas/[id] — as datas de um pagamento à meia-noite", () => {
  it("dar por paga às 00:30 de agosto carimba HOJE, e o saldo nasce com o mesmo dia", async () => {
    process.env.TZ = "UTC";
    vi.useFakeTimers();
    // 14 de agosto de 2026, 00:30 em Lisboa (UTC+1) — 13 de agosto, 23:30 UTC.
    vi.setSystemTime(new Date("2026-08-13T23:30:00Z"));
    try {
      seedSinal("s-noite");
      proposalsDb.store.set("q-s-noite", { total: 12500 });
      const { req, params } = patchReq("s-noite", { status: "paga" });
      const res = await PATCH(req, { params });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.paidAt).toBe("2026-08-14");
      expect(json.saldoAutoIssued).toMatchObject({
        issuedAt: "2026-08-14",
        // O vencimento conta-se a partir do dia da emissão: 30 dias depois.
        dueAt: "2026-09-13",
      });
    } finally {
      vi.useRealTimers();
      delete process.env.TZ;
    }
  });
});
