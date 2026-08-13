import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { ConflictError, MENSAGEM_DE_CONFLITO } from "./repository";
import { respostaDeConflito, respostaDeMigracaoEmFalta } from "./resposta-de-conflito";

/**
 * Uma colisão não pode acabar em silêncio NEM em erro cru.
 *
 * O silêncio já foi tratado do lado da gravação (o `touch` dos mappers). Falta
 * a outra metade: quando a repetição do `updateWith` não resolve, o
 * `ConflictError` sobe até à rota — e uma rota que o apanhe no `catch` genérico
 * responde 500 "Erro interno". Para quem está do outro lado isso é indistinto
 * de uma avaria: ela tenta outra vez, e à segunda a gravação passa e apaga
 * mesmo o trabalho da colega. O 500 não só não explica como CONVIDA ao erro.
 */

describe("respostaDeConflito", () => {
  it("devolve null para o que não é conflito — o catch de topo continua dono do resto", () => {
    expect(respostaDeConflito(new Error("qualquer avaria"))).toBeNull();
    expect(respostaDeConflito(null)).toBeNull();
  });

  it("responde 409 com uma frase dizível e a versão do servidor ao lado da da pessoa", async () => {
    const err = new ConflictError("f1", {
      table: "invoices",
      current: { id: "f1", status: "paga", note: "Pago por transferência" },
      attempted: { id: "f1", status: "emitida", note: "Falta confirmar" },
    });
    const res = respostaDeConflito(err);
    expect(res).not.toBeNull();
    expect(res!.status).toBe(409);

    const corpo = await res!.json();
    expect(corpo.error).toBe(MENSAGEM_DE_CONFLITO);
    // A versão do servidor, para o ecrã poder mostrar as duas lado a lado —
    // o mesmo contrato que `/api/visao-geral` já cumpre com o StaleWriteError.
    expect(corpo.current).toEqual({ id: "f1", status: "paga", note: "Pago por transferência" });
    // E o que a pessoa estava a gravar volta com a resposta: recusar a escrita
    // não pode ser o sítio onde o trabalho dela desaparece.
    expect(corpo.submetido).toEqual({ id: "f1", status: "emitida", note: "Falta confirmar" });
  });
});

describe("respostaDeMigracaoEmFalta", () => {
  it("a coluna que ainda não existe é uma instalação por acabar, não uma avaria", async () => {
    // O que o Postgres/PostgREST devolve quando o `db/schema.sql` novo ainda
    // não foi corrido e a escrita tenta gravar `updated_at`.
    const err = Object.assign(new Error("column invoices.updated_at does not exist"), {
      code: "42703",
    });
    const res = respostaDeMigracaoEmFalta(err, "As faturas");
    expect(res).not.toBeNull();
    expect(res!.status).toBe(503);
    const corpo = await res!.json();
    // A frase tem de conter a resolução, não só o sintoma.
    expect(corpo.error).toMatch(/db\/schema\.sql/);
    expect(corpo.error).toMatch(/As faturas/);
  });

  it("devolve null para tudo o resto", () => {
    expect(respostaDeMigracaoEmFalta(new Error("timeout"), "As faturas")).toBeNull();
  });
});

// ── A rota que trata do dinheiro é a que não pode falhar isto ─────────────
const authed = vi.hoisted(() => ({ ok: true }));
const store = vi.hoisted(() => ({
  get: vi.fn(),
  update: vi.fn(),
  listForQuote: vi.fn(async () => []),
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/invoices-store", async () => {
  const real = await vi.importActual<typeof import("./invoices-store")>("./invoices-store");
  return {
    ...real,
    getInvoice: store.get,
    updateInvoice: store.update,
    listInvoicesForQuote: store.listForQuote,
    createInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    nextInvoiceNumber: vi.fn(async () => "FT 2026/0002"),
  };
});

beforeEach(() => {
  authed.ok = true;
  vi.clearAllMocks();
});

describe("/api/faturas/[id] PATCH numa colisão", () => {
  it("responde 409 com as duas versões, não 500 «Erro interno»", async () => {
    const { PATCH } = await import("@/app/api/faturas/[id]/route");

    const noServidor: Record<string, unknown> = {
      id: "f1",
      number: "FT 2026/0001",
      quoteId: "Q1",
      clientName: "Ana",
      clientEmail: "a@x.pt",
      kind: "sinal",
      amount: 300,
      vatRate: 0.23,
      issuedAt: "2026-01-01",
      status: "paga",
      paidAt: "2026-01-02",
    };
    store.get.mockResolvedValue({ ...noServidor, status: "emitida", paidAt: undefined });
    store.update.mockRejectedValue(
      new ConflictError("f1", {
        table: "invoices",
        current: noServidor,
        attempted: { ...noServidor, status: "emitida", note: "nota nova" },
      }),
    );

    const req = new Request("https://liquen.test/api/faturas/f1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "nota nova" }),
    }) as unknown as NextRequest;

    const res = await PATCH(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(409);
    const corpo = await res.json();
    expect(corpo.error).toMatch(/outra pessoa/i);
    expect(corpo.current.status).toBe("paga");
    expect(corpo.submetido.note).toBe("nota nova");
  });

  it("com o db/schema.sql por correr responde 503 com a resolução, não 500", async () => {
    const { PATCH } = await import("@/app/api/faturas/[id]/route");
    store.get.mockResolvedValue({ id: "f1", status: "emitida", kind: "sinal", quoteId: "Q1" });
    store.update.mockRejectedValue(
      Object.assign(new Error("column invoices.updated_at does not exist"), { code: "42703" }),
    );

    const req = new Request("https://liquen.test/api/faturas/f1", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: "nota" }),
    }) as unknown as NextRequest;

    const res = await PATCH(req, { params: Promise.resolve({ id: "f1" }) });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });
});
