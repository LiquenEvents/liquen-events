import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authState = vi.hoisted(() => ({ authed: true }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));
const mail = vi.hoisted(() => ({ sent: true }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authState.authed }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: mail.sent })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "liquen.alentejo@gmail.com",
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { POST } from "./route";
import { sendMail } from "@/lib/mail";

function post(body: unknown, raw = false): NextRequest {
  return new Request("https://liquen.test/api/inbox/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? (body as string) : JSON.stringify(body),
  }) as unknown as NextRequest;
}

beforeEach(() => {
  authState.authed = true;
  rl.result = { ok: true };
  mail.sent = true;
  vi.clearAllMocks();
});

describe("POST /api/inbox/reply", () => {
  it("401 without auth (and never sends)", async () => {
    authState.authed = false;
    const res = await POST(post({ to: "c@x.com", message: "olá" }));
    expect(res.status).toBe(401);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("429 when rate-limited", async () => {
    rl.result = { ok: false, retryAfter: 30 };
    const res = await POST(post({ to: "c@x.com", message: "olá" }));
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("30");
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sends a valid reply and returns 200", async () => {
    const res = await POST(post({ to: "Cliente <c@x.com>", subject: "Oi", message: "olá" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, emailed: true });
    expect(sendMail).toHaveBeenCalledTimes(1);
  });

  it("400 when the recipient is missing/invalid", async () => {
    expect((await POST(post({ message: "olá" }))).status).toBe(400);
    expect((await POST(post({ to: "not-an-email", message: "olá" }))).status).toBe(400);
  });

  it("400 when the message is empty", async () => {
    expect((await POST(post({ to: "c@x.com", message: "" }))).status).toBe(400);
  });

  it("400 on malformed JSON (must not be a 500)", async () => {
    const res = await POST(post("{ not json", true));
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("rejects header-injection newlines in the recipient (400)", async () => {
    const res = await POST(post({ to: "c@x.com\r\nBcc: evil@x.com", message: "olá" }));
    expect(res.status).toBe(400);
    expect(sendMail).not.toHaveBeenCalled();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RESPOSTA TEM DE CAIR DENTRO DA CONVERSA QUE JÁ EXISTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem `In-Reply-To`/`References` o email sai tecnicamente bem e chega — mas
 * chega SOLTO. Do lado do cliente (Gmail, Outlook, o telemóvel) cada resposta
 * do estúdio abre um assunto novo em vez de continuar o que ele escreveu: o
 * histórico da conversa dele fica desfeito em mensagens avulsas, e a resposta
 * aparece longe da pergunta. Quem lê pensa que ninguém respondeu ao que
 * perguntou.
 *
 * Os identificadores vêm da mensagem aberta na caixa (`messageId` e
 * `references` de `InboxItem`) e são, por definição, escritos por quem enviou
 * — input não confiável, e a caminho de um CABEÇALHO. Daí a validação.
 */
function ultimoEnvio() {
  return vi.mocked(sendMail).mock.calls.at(-1)![0];
}

describe("POST /api/inbox/reply — encadeamento da conversa", () => {
  it("liga a resposta à mensagem a que responde (In-Reply-To + References)", async () => {
    const res = await POST(
      post({
        to: "c@x.com",
        message: "olá",
        inReplyTo: "<m3@cliente.pt>",
        references: ["<raiz@cliente.pt>", "<m2@liquen.pt>"],
      }),
    );
    expect(res.status).toBe(200);
    expect(ultimoEnvio().headers).toEqual({
      "In-Reply-To": "<m3@cliente.pt>",
      // A cadeia do RFC 5322 §3.6.4: o que a mensagem já trazia, mais ela
      // própria no fim.
      References: "<raiz@cliente.pt> <m2@liquen.pt> <m3@cliente.pt>",
    });
  });

  it("encadeia na mesma quando a mensagem é a primeira da conversa (sem References)", async () => {
    await POST(post({ to: "c@x.com", message: "olá", inReplyTo: "<m1@cliente.pt>" }));
    expect(ultimoEnvio().headers).toEqual({
      "In-Reply-To": "<m1@cliente.pt>",
      References: "<m1@cliente.pt>",
    });
  });

  it("aceita um Message-ID que venha sem os sinais de menor/maior", async () => {
    await POST(post({ to: "c@x.com", message: "olá", inReplyTo: "m1@cliente.pt" }));
    expect(ultimoEnvio().headers).toMatchObject({ "In-Reply-To": "<m1@cliente.pt>" });
  });

  it("não repete o mesmo identificador na cadeia", async () => {
    await POST(
      post({
        to: "c@x.com",
        message: "olá",
        inReplyTo: "<m1@cliente.pt>",
        references: ["<m1@cliente.pt>"],
      }),
    );
    expect(ultimoEnvio().headers).toMatchObject({ References: "<m1@cliente.pt>" });
  });

  it("envia sem cabeçalhos de conversa quando não há nada a encadear", async () => {
    const res = await POST(post({ to: "c@x.com", message: "olá" }));
    expect(res.status).toBe(200);
    expect(ultimoEnvio().headers).toBeUndefined();
  });

  /**
   * O `messageId` de uma `InboxItem` chega da caixa e pode ser o que o
   * remetente quiser. Um `<a@x>\r\nBcc: toda-a-gente@…>` era exactamente a
   * injecção de cabeçalhos contra a qual o `to` e o `subject` já se defendem —
   * e a resposta continua a ter de sair.
   */
  it("deita fora um identificador com quebras de linha, e envia na mesma", async () => {
    const res = await POST(
      post({
        to: "c@x.com",
        message: "olá",
        inReplyTo: "<a@x>\r\nBcc: evil@x.com",
        references: ["<bom@x>"],
      }),
    );
    expect(res.status).toBe(200);
    const headers = ultimoEnvio().headers ?? {};
    expect(headers["In-Reply-To"]).toBeUndefined();
    expect(headers.References).toBe("<bom@x>");
    expect(JSON.stringify(headers)).not.toContain("Bcc");
  });

  it("ignora identificadores absurdos e o que não é texto", async () => {
    await POST(
      post({
        to: "c@x.com",
        message: "olá",
        references: [`<${"a".repeat(2000)}@x>`, "sem-arroba mas com espaços", "<bom@x>"],
      }),
    );
    expect(ultimoEnvio().headers).toMatchObject({ References: "<bom@x>" });
  });

  /**
   * O `References` de uma conversa longa cresce sem tecto e vai INTEIRO para
   * dentro de um cabeçalho. Corta-se como o `parseReferences` da caixa: a raiz
   * (que é o que agrupa a conversa) e a linhagem imediata; o meio é o que se
   * perde sem perder o fio.
   */
  it("corta uma cadeia enorme mantendo a raiz e o fim", async () => {
    const enormes = Array.from({ length: 500 }, (_, i) => `<m${i}@x>`);
    await POST(
      post({ to: "c@x.com", message: "olá", inReplyTo: "<atual@x>", references: enormes }),
    );
    const ids = (ultimoEnvio().headers!.References as string).split(" ");
    expect(ids.length).toBeLessThanOrEqual(50);
    expect(ids[0]).toBe("<m0@x>");
    expect(ids.at(-1)).toBe("<atual@x>");
  });

  it("um `references` que não é lista não rebenta o envio", async () => {
    const res = await POST(post({ to: "c@x.com", message: "olá", references: "<m1@x>" }));
    expect(res.status).toBe(200);
    expect(sendMail).toHaveBeenCalledTimes(1);
  });
});

/**
 * A resposta escrita à mão na caixa de entrada é o email MAIS pessoal que sai
 * daqui — e era o que levava o rodapé mais pobre: uma linha com o endereço e o
 * telefone. Passa a levar a assinatura da casa, igual à das outras rotas.
 */
describe("POST /api/inbox/reply — assinatura", () => {
  it("assina a resposta, no HTML e no texto simples", async () => {
    await POST(post({ to: "c@x.com", subject: "Re: Oi", message: "Olá, com todo o gosto." }));
    const env = ultimoEnvio();
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).toContain("Manager");
    expect(env.html).toContain("+351 919 259 820");
    expect(env.text).toContain("Catarina Gaspar");
    expect(env.text).toContain("+351 919 259 820");
    // A mensagem que ela escreveu continua lá — a assinatura acrescenta-se, não
    // substitui nada.
    expect(env.text).toContain("Olá, com todo o gosto.");
    expect(env.attachments?.some((a) => a.cid === "liquen-logo")).toBe(true);
    expect(env.html).not.toMatch(/<img[^>]+src="https?:/);
  });

  it("deixou de escrever o rodapé à mão", async () => {
    await POST(post({ to: "c@x.com", message: "olá" }));
    expect(ultimoEnvio().html).not.toContain("Líquen Events · ");
  });
});
