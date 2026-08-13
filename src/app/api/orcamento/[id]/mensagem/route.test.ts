import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: false }));
const store = vi.hoisted(() => ({
  estado: "pendente" as string,
  get: vi.fn(async (id: string) =>
    id === "LIQ-1"
      ? {
          id: "LIQ-1",
          email: "ana@x.pt",
          status: store.estado,
          messages: [{ at: "t0", body: "old" }],
        }
      : null,
  ),
  update: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: store.get, updateQuote: store.update }));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
function req(body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento/LIQ-1/mensagem", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/mensagem", () => {
  it("rejects the unauthenticated with 401 and sends nothing", async () => {
    const res = await POST(req({ message: "Olá" }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(store.get).not.toHaveBeenCalled();
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("returns 404 for an unknown quote", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Olá" }), ctx("nope"));
    expect(res.status).toBe(404);
    expect(mail.send).not.toHaveBeenCalled();
  });

  /**
   * O ecrã diz «erro ao enviar» a um 500, e isso lê-se como «o correio
   * avariou» — leva a carregar outra vez em Enviar. Um corpo que não é JSON é
   * um pedido errado, e tem de o dizer.
   */
  it("answers 400 (not 500) to a malformed or non-object body, and não envia nada", async () => {
    authed.ok = true;
    const cru = (corpo: string) =>
      new Request("https://liquen.test/api/orcamento/LIQ-1/mensagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: corpo,
      }) as unknown as NextRequest;
    for (const corpo of ["{ isto não é JSON", "null", '"uma string"', "[]"]) {
      const res = await POST(cru(corpo), ctx("LIQ-1"));
      expect(res.status, corpo).toBe(400);
    }
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("rejects an empty (whitespace-only) message with 400", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "   " }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("emails the client and appends the message to the quote's log", async () => {
    authed.ok = true;
    const res = await POST(req({ message: "Nova mensagem" }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(mail.send).toHaveBeenCalledTimes(1);
    expect(mail.send.mock.calls[0][0]).toMatchObject({ to: "ana@x.pt" });
    // The existing message is preserved and the new one appended (not clobbered).
    // `objectContaining` e não igualdade exacta: responder passou também a subir
    // o estado para «Aguardar resposta» (ver o bloco no fim deste ficheiro). O
    // que ESTE teste guarda é o histórico — que a mensagem antiga sobrevive e a
    // nova é acrescentada, nunca substituída.
    expect(store.update).toHaveBeenCalledWith(
      "LIQ-1",
      expect.objectContaining({
        messages: [{ at: "t0", body: "old" }, expect.objectContaining({ body: "Nova mensagem" })],
      }),
    );
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * RESPONDER PÕE O PEDIDO EM «AGUARDAR RESPOSTA»
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Enviar uma mensagem só acrescentava uma linha ao histórico: na lista, o pedido
 * continuava em «Novo», indistinguível de um a que ninguém tinha tocado. A única
 * forma de saber que já se tinha respondido era abrir e ler.
 *
 * O que estes testes guardam não é o valor do campo — é a REGRA: a bola passa
 * para o lado do cliente quando lhe respondemos, e nunca anda para trás.
 */
describe("POST /api/orcamento/[id]/mensagem — o estado segue a conversa", () => {
  it("um pedido novo passa a «Aguardar resposta» quando lhe respondemos", async () => {
    authed.ok = true;
    store.estado = "pendente";
    const res = await POST(req({ message: "Olá! Já vos respondo com a proposta." }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect(store.update).toHaveBeenCalledWith(
      "LIQ-1",
      expect.objectContaining({ status: "em_revisao" }),
    );
  });

  /**
   * Um estado que anda para trás sozinho é a maneira mais rápida de ela deixar
   * de confiar na coluna. Mandar uma nota a um casamento já fechado não o
   * desfecha.
   */
  for (const estado of ["cotado", "aceite", "rejeitado"]) {
    it(`não faz recuar um pedido que já está em «${estado}»`, async () => {
      authed.ok = true;
      store.estado = estado;
      await POST(req({ message: "Uma nota rápida." }), ctx("LIQ-1"));
      const patch = store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
      expect(patch, "o estado nem sequer é tocado").not.toHaveProperty("status");
    });
  }

  it("não reescreve o estado de quem já está a aguardar resposta", async () => {
    authed.ok = true;
    store.estado = "em_revisao";
    await POST(req({ message: "Segue o link das fotografias." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("status");
  });

  /**
   * A mudança passou a deixar rasto. Antes, a coluna mudava e não havia onde ir
   * ver porquê — e uma coluna que muda sem explicação é pior do que uma parada.
   * A entrada é assinada pelo «Sistema» para se distinguir, na mesma lista, do
   * que foi ela a mudar à mão.
   */
  it("deixa no histórico a linha que explica a mudança automática", async () => {
    authed.ok = true;
    store.estado = "pendente";
    await POST(req({ message: "Olá! Já vos respondo com a proposta." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as {
      activityLog?: { actor?: string; summary: string }[];
    };
    expect(patch.activityLog).toHaveLength(1);
    expect(patch.activityLog![0].actor).toBe("Sistema");
    expect(patch.activityLog![0].summary).toBe("Novo → Aguardar resposta · respondemos ao cliente");
  });

  it("sem mudança de estado não escreve linha nenhuma — a lista dela já é longa", async () => {
    authed.ok = true;
    store.estado = "cotado";
    await POST(req({ message: "Uma nota rápida." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(patch).not.toHaveProperty("activityLog");
  });

  it("a mensagem continua a ser guardada em qualquer dos casos", async () => {
    authed.ok = true;
    store.estado = "aceite";
    await POST(req({ message: "Confirmado para as 15h." }), ctx("LIQ-1"));
    const patch = store.update.mock.calls.at(-1)?.[1] as { messages?: unknown[] };
    expect(patch.messages).toHaveLength(2);
  });
});

/**
 * A ASSINATURA DA CASA — a mesma em todo o correio que sai para um cliente.
 *
 * Esta rota escrevia o seu próprio rodapé («Líquen Events · email · telefone»),
 * uma de cinco cópias da mesma linha espalhadas por cinco ficheiros. Passa a
 * vir do `email-assinatura`, que é o único sítio onde os contactos existem.
 */
describe("POST /api/orcamento/[id]/mensagem — assinatura", () => {
  it("assina a mensagem ao cliente, no HTML e no texto simples", async () => {
    authed.ok = true;
    await POST(req({ message: "Olá! Já vos respondo." }), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as {
      html: string;
      text: string;
      attachments?: { cid?: string }[];
    };
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).toContain("Manager");
    expect(env.html).toContain("+351 919 259 820");
    expect(env.text).toContain("Catarina Gaspar");
    expect(env.text).toContain("+351 919 259 820");
    // O logótipo viaja com a mensagem: nada de imagens remotas.
    expect(env.attachments?.some((a) => a.cid === "liquen-logo")).toBe(true);
    expect(env.html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("deixou de escrever o rodapé à mão", async () => {
    authed.ok = true;
    await POST(req({ message: "Olá!" }), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as { html: string };
    expect(env.html).not.toContain("Líquen Events · ");
  });
});
