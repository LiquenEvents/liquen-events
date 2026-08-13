import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SINAL FICOU EMITIDO — E O ECRÃ DIZIA QUE NÃO TINHA ACONTECIDO NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ramo 30/70 faz dois `createInvoice` seguidos. O primeiro (o sinal) grava; se
 * o segundo (o saldo) rebentar por outra coisa que não uma violação de
 * unicidade, o erro sobe ao `catch` de topo e a rota respondia
 * 500 "Erro ao criar a fatura" — com o sinal JÁ no livro e o seu número fiscal
 * gasto.
 *
 * A sequência que isto provocava, do lado dela:
 *   1. carrega em "Emitir", lê "Erro ao criar a fatura" e conclui, com razão,
 *      que não se emitiu nada;
 *   2. tenta outra vez;
 *   3. agora a guarda de duplicação responde 409 "Já existe uma fatura de sinal
 *      para este evento".
 * O ecrã diz-lhe ao mesmo tempo que falhou e que já existe. Nenhuma das duas
 * frases lhe diz o que é verdade: o sinal está emitido, o saldo não.
 *
 * A regra que estes testes prendem: assim que o sinal está gravado, a resposta
 * deixa de poder ser uma falha. É um SUCESSO COM AVISO, e o aviso nomeia o que
 * ficou emitido e o que não ficou.
 */
const db = vi.hoisted(() => ({
  store: new Map<string, Record<string, unknown>>(),
  idSeq: 0,
  numSeq: 0,
}));
const proposalsDb = vi.hoisted(() => ({ store: new Map<string, Record<string, unknown>>() }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));

/**
 * Emitir uma factura passou a EMPURRAR o estado do pedido (ver
 * `@/lib/orcamento/estado-do-pedido`). Este ficheiro testa outra coisa — o que
 * a rota RESPONDE quando o sinal grava e o saldo não — mas sem um duplo do
 * armazenamento dos pedidos ia bater no repositório a sério. Devolver `null`
 * (pedido inexistente) é o caminho inofensivo: a transição é melhor esforço e
 * não pode alterar nenhuma das respostas que aqui se prendem.
 */
vi.mock("@/lib/quotes-store", () => ({ updateQuoteWith: vi.fn(async () => null) }));

vi.mock("@/lib/invoices-store", () => ({
  listInvoices: vi.fn(async () => [...db.store.values()]),
  listInvoicesForQuote: vi.fn(async (quoteId: string) =>
    [...db.store.values()].filter((i) => i.quoteId === quoteId),
  ),
  createInvoice: vi.fn(async (i: Record<string, unknown>) => {
    db.store.set(i.id as string, i);
  }),
  newInvoiceId: vi.fn(() => `inv-${++db.idSeq}`),
  nextInvoiceNumber: vi.fn(async () => `FT 2026/${String(++db.numSeq).padStart(4, "0")}`),
  isUniqueViolation: (err: unknown) =>
    !!err && typeof err === "object" && (err as { code?: string }).code === "23505",
}));

vi.mock("@/lib/proposals-store", () => ({
  getProposalByQuote: vi.fn(async (quoteId: string) => proposalsDb.store.get(quoteId) ?? null),
}));

vi.mock("@/lib/money", async () => await vi.importActual("@/lib/money"));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "@/app/api/faturas/route";
import { createInvoice } from "@/lib/invoices-store";

function postReq(body: unknown): NextRequest {
  return new Request("https://liquen.test/api/faturas", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;
}

/** O sinal grava; o saldo rebenta por uma razão que NÃO é duplicação. */
function saldoRebentaDepoisDoSinal() {
  vi.mocked(createInvoice)
    .mockImplementationOnce(async (i) => {
      db.store.set(i.id, i as unknown as Record<string, unknown>);
    })
    .mockImplementationOnce(async () => {
      throw new Error("ligação perdida a meio");
    });
}

beforeEach(() => {
  db.store.clear();
  db.idSeq = 0;
  db.numSeq = 0;
  proposalsDb.store.clear();
  vi.clearAllMocks();
});

describe("30/70 — o sinal grava e o saldo rebenta", () => {
  it("não devolve 500: o sinal está no livro, portanto a emissão correu (em parte)", async () => {
    saldoRebentaDepoisDoSinal();
    const res = await POST(
      postReq({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }),
    );

    expect(
      res.status,
      "um 500 diz «não aconteceu nada», e o sinal está gravado com o número gasto",
    ).not.toBe(500);
    expect(res.status).toBe(201);
    // E o sinal está mesmo lá — não é uma resposta optimista.
    const doEvento = [...db.store.values()].filter((i) => i.quoteId === "q-1");
    expect(doEvento.map((i) => i.kind)).toEqual(["sinal"]);
  });

  it("devolve só o sinal, e um aviso que nomeia o que ficou e o que não ficou", async () => {
    saldoRebentaDepoisDoSinal();
    const res = await POST(
      postReq({ split: true, quoteId: "q-1", clientName: "Ana", total: 10000 }),
    );
    const json = await res.json();

    expect(json.invoices).toHaveLength(1);
    expect(json.invoices[0].kind).toBe("sinal");
    // O aviso tem de trazer o NÚMERO do sinal: é por ele que ela vê no livro
    // que não deve voltar a emitir o sinal, só o saldo.
    expect(json.aviso).toContain(json.invoices[0].number);
    expect(json.aviso).toMatch(/sinal/i);
    expect(json.aviso).toMatch(/saldo/i);
    expect(
      json.error,
      "um `error` no corpo fá-la-ia concluir que não se emitiu nada",
    ).toBeUndefined();
  });

  it("uma violação de unicidade LOGO NO SINAL continua a ser duplicação (409)", async () => {
    // Contraste: o backstop de corrida não muda enquanto nada ficou gravado.
    vi.mocked(createInvoice).mockRejectedValueOnce(
      Object.assign(new Error("dup"), { code: "23505" }),
    );
    const res = await POST(
      postReq({ split: true, quoteId: "q-2", clientName: "Ana", total: 10000 }),
    );
    expect(res.status).toBe(409);
    expect([...db.store.values()].filter((i) => i.quoteId === "q-2")).toHaveLength(0);
  });

  it("uma duplicação NO SALDO, com o sinal já gravado, também é aviso e não erro", async () => {
    // Uma emissão concorrente criou o saldo entre a guarda e este insert. Um 409
    // aqui diria "já existe" sobre um pedido em que ACABOU de se emitir o sinal —
    // e ela ficava sem saber que o número do sinal é dela e está gasto.
    vi.mocked(createInvoice)
      .mockImplementationOnce(async (i) => {
        db.store.set(i.id, i as unknown as Record<string, unknown>);
      })
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "23505" }));

    const res = await POST(
      postReq({ split: true, quoteId: "q-4", clientName: "Ana", total: 10000 }),
    );
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.invoices.map((i: { kind: string }) => i.kind)).toEqual(["sinal"]);
    expect(json.aviso).toContain(json.invoices[0].number);
    // A frase distingue "já existia" de "não foi emitida": a acção seguinte dela
    // não é a mesma nos dois casos.
    expect(json.aviso).toMatch(/já existi/i);
  });

  it("quando é o SINAL a falhar (nada gravado), continua a ser um 500 honesto", async () => {
    vi.mocked(createInvoice).mockRejectedValueOnce(new Error("ligação perdida"));
    const res = await POST(
      postReq({ split: true, quoteId: "q-3", clientName: "Ana", total: 10000 }),
    );
    expect(res.status).toBe(500);
    expect([...db.store.values()].filter((i) => i.quoteId === "q-3")).toHaveLength(0);
  });
});
