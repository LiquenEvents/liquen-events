import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import { SITE } from "@/lib/site";

const authed = vi.hoisted(() => ({ ok: false }));
const quotes = vi.hoisted(() => ({
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          name: "Ana",
          email: "ana@x.pt",
          date: "2026-09-01",
          guests: 50,
          location: "Lisboa",
          status: quotes.estado,
        }
      : null,
  ),
  /** O estado GRAVADO do pedido — a decisão da transição lê-o daqui. */
  estado: "pendente" as string,
  /**
   * A rota grava com `updateQuoteWith` (e não `updateQuote`) porque a decisão
   * do estado tem de ser tomada sobre o pedido FRESCO — entre o `getQuote` do
   * princípio e a gravação há um PDF desenhado e um email enviado. O duplo
   * corre a mutação sobre o pedido gravado e guarda o resultado.
   */
  update: vi.fn(
    async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
      quotes.gravado = mutar({ id, name: "Ana", email: "ana@x.pt", status: quotes.estado });
      return quotes.gravado;
    },
  ),
  gravado: null as Record<string, unknown> | null,
}));
const proposals = vi.hoisted(() => ({
  create: vi.fn(async (_p?: unknown) => {}),
  listForQuote: vi.fn(async () => [{ id: "p-existing", quoteId: "LIQ-1" }]),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));
/**
 * O token do link de aceitação, aqui de mentira — mas COM o identificador que
 * lhe passaram lá dentro. Um duplo que devolvesse sempre a mesma corda deixava
 * a rota mintar o link para o pedido em vez de para a proposta sem ninguém dar
 * por isso: o email saía, o teste ficava verde, e o casal carregava num 404.
 */
const token = vi.hoisted(() => ({ create: vi.fn((proposalId: string) => `tok:${proposalId}`) }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: quotes.get, updateQuoteWith: quotes.update }));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: proposals.create,
  listProposalsForQuote: proposals.listForQuote,
}));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: token.create }));
vi.mock("@/lib/proposal-pdf", () => ({
  renderProposalPdf: vi.fn(async () => new Uint8Array([1, 2, 3])),
}));

import { GET, POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(method: "GET" | "POST", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/proposta", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validItems = { lineItems: [{ description: "Decoração", qty: 1, unitPrice: 1000 }] };

beforeEach(() => {
  authed.ok = false;
  quotes.estado = "pendente";
  quotes.gravado = null;
  vi.clearAllMocks();
});

describe("GET /api/orcamento/[id]/proposta", () => {
  it("rejects the unauthenticated with 401", async () => {
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(proposals.listForQuote).not.toHaveBeenCalled();
  });

  it("lists proposals for the quote for an admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "p-existing", quoteId: "LIQ-1" }]);
  });
});

describe("POST /api/orcamento/[id]/proposta", () => {
  it("rejects the unauthenticated with 401 and creates nothing", async () => {
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("returns 404 when the quote does not exist", async () => {
    authed.ok = true;
    const res = await POST(req("POST", validItems), ctx("nope"));
    expect(res.status).toBe(404);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("rejects a proposal with no valid line items (400)", async () => {
    authed.ok = true;
    // Zero-qty lines are filtered out → empty → 400.
    const res = await POST(
      req("POST", { lineItems: [{ description: "X", qty: 0, unitPrice: 100 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(400);
    expect(proposals.create).not.toHaveBeenCalled();
  });

  it("creates + persists the proposal, emails the client, and advances the quote to cotado", async () => {
    authed.ok = true;
    const res = await POST(
      req("POST", { lineItems: [{ description: "Decoração", qty: 2, unitPrice: 1000 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    // subtotal 2000, vat 0.23 → total 2460.
    expect(json.total).toBeCloseTo(2460, 5);
    expect(json.emailed).toBe(true);
    // Persisted as "enviada" before the email goes out.
    expect(proposals.create).toHaveBeenCalledTimes(1);
    expect(proposals.create.mock.calls[0][0]).toMatchObject({
      quoteId: "LIQ-1",
      status: "enviada",
      clientEmail: "ana@x.pt",
    });
    expect(mail.send).toHaveBeenCalledTimes(1);
    // Quote status advances (best-effort) to cotado with the quoted total.
    // 2460 era o total COM IVA; o campo é o "Preço final (sem IVA)", portanto
    // grava-se o subtotal (2000). Ver a nota na rota.
    expect(quotes.gravado).toMatchObject({ status: "cotado", quotedPrice: 2000 });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O LINK DO EMAIL ABRE A PROPOSTA QUE ACABOU DE SER CRIADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * É a única coisa que o email leva além do PDF, e já falhou duas vezes: uma a
   * abrir 404, outra a ser recusado com «esta proposta já não está disponível».
   * O token assina UM identificador — o da proposta —, e o pedido tem outro ao
   * lado (`LIQ-1`) que se parece com ele em tudo menos no que interessa.
   */
  it("manda no email um link assinado com o id da proposta acabada de criar", async () => {
    authed.ok = true;
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    const { id: idDaProposta } = await res.json();
    const enviado = mail.send.mock.calls[0][0] as { html: string; text: string };
    const link = `${SITE.url}/proposta/tok:${idDaProposta}`;
    expect(enviado.html).toContain(link);
    expect(enviado.text).toContain(link);
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * REENVIAR UMA PROPOSTA NÃO DESFAZ UM NEGÓCIO GANHO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A rota escrevia `status: "cotado"` a seco. Rever a proposta DEPOIS do
   * aceite é coisa que acontece (o cálculo do saldo tem uma nota inteira sobre
   * isso) — e bastava reenviar o documento com uma linha corrigida para o
   * casamento fechado voltar a «Proposta enviada» no quadro, com o sinal já
   * emitido e pago. Um estado que anda para trás sozinho é a maneira mais
   * rápida de ela deixar de confiar na coluna.
   */
  it("não faz recuar um pedido já ganho, mas grava o preço novo na mesma", async () => {
    authed.ok = true;
    quotes.estado = "aceite";
    const res = await POST(
      req("POST", { lineItems: [{ description: "Decoração revista", qty: 1, unitPrice: 2500 }] }),
      ctx("LIQ-1"),
    );
    expect(res.status).toBe(200);
    expect(quotes.gravado).toMatchObject({ status: "aceite", quotedPrice: 2500 });
  });

  /**
   * Ela vê a coluna mudar sozinha; sem uma linha no histórico não tem onde ir
   * ver porquê. A entrada é assinada pelo «Sistema» para se distinguir, na
   * mesma lista, do que foi ela a mudar à mão.
   */
  it("deixa no histórico a linha que explica a mudança automática", async () => {
    authed.ok = true;
    quotes.estado = "pendente";
    await POST(req("POST", validItems), ctx("LIQ-1"));
    const log = (quotes.gravado?.activityLog ?? []) as { actor?: string; summary: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("Sistema");
    expect(log[0].summary).toContain("Proposta enviada");
  });

  it("returns 503 (does not send an un-acceptable proposal) when persistence fails", async () => {
    authed.ok = true;
    proposals.create.mockRejectedValueOnce(new Error("db down"));
    const res = await POST(req("POST", validItems), ctx("LIQ-1"));
    expect(res.status).toBe(503);
    expect(mail.send).not.toHaveBeenCalled();
  });
});
