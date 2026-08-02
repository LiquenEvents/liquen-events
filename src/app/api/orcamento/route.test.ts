import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const store = vi.hoisted(() => ({
  create: vi.fn(async () => {}),
  list: vi.fn(async () => [{ id: "LIQ-1" }]),
}));
const authed = vi.hoisted(() => ({ ok: false }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));

vi.mock("@/lib/quotes-store", () => ({
  createQuote: store.create,
  listQuotes: store.list,
  generateQuoteId: () => "LIQ-TEST-0000000000000000",
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  // The confirmation send points replyTo at the monitored inbox.
  MAIL_TO: "equipa@liquen-events.test",
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

import { POST, GET } from "./route";
import { sendMail } from "@/lib/mail";

const sendMailMock = vi.mocked(sendMail);

function req(method: "POST" | "GET", body?: unknown): NextRequest {
  return new Request("https://liquen.test/api/orcamento", {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

const validForm = { name: "Ana Silva", email: "ana@example.com", phone: "", guests: 50 };

beforeEach(() => {
  rl.result = { ok: true };
  authed.ok = false;
  vi.clearAllMocks();
});

describe("POST /api/orcamento", () => {
  it("creates a quote and returns its reference id", async () => {
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok");
    expect(json.id).toMatch(/^LIQ-/);
    expect(store.create).toHaveBeenCalledTimes(1);
  });

  it("sends a confirmation email to the client, after the team notification", async () => {
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ replyTo: validForm.email });
    expect(sendMailMock.mock.calls[1][0]).toMatchObject({ to: validForm.email });
  });

  it("carries the wordmark INSIDE both emails, never as a hosted URL", async () => {
    await POST(req("POST", { form: validForm }));
    for (const [args] of sendMailMock.mock.calls) {
      // A hosted <img> 404s until production is promoted — and by then the
      // messages already in people's inboxes show a broken image, because the
      // fetch happens when they open it, not when we send it.
      expect(args.html).not.toContain("/email/logo-liquen-email.png");
      expect(args.html).toContain("cid:liquen-logo");
      const logo = args.attachments?.find((a) => a.cid === "liquen-logo");
      expect(logo, "every email must attach the inline logo it references").toBeTruthy();
      expect(logo!.content.length).toBeGreaterThan(1000);
    }
  });

  it("o aviso à equipa diz LOGO NO ASSUNTO que é um pedido de orçamento", async () => {
    // A queixa que originou isto: ela fotografou a caixa de correio e o
    // assunto era "Casamentos · 18 set 2027 · 250 pax — Catar...". Lia-se como
    // uma marcação já feita. Numa lista de mensagens, o que a mensagem É tem
    // de vir antes dos dados que servem para a triar.
    await POST(req("POST", { form: { ...validForm, category: "casamentos" } }));
    const equipa = sendMailMock.mock.calls[0][0];
    expect(
      equipa.subject.toLowerCase().startsWith("pedido de orçamento"),
      `o assunto era "${equipa.subject}"`,
    ).toBe(true);
  });

  it("a pré-visualização da caixa de correio não começa pela referência", async () => {
    // Alguns clientes de correio mostram a versão em texto simples na linha de
    // pré-visualização. Começava por "NOVO PEDIDO DE ORÇAMENTO / Referência:
    // LIQ-..." — duas linhas gastas a repetir o assunto e a mostrar o dado
    // menos útil que este email tem. A referência serve para procurar depois,
    // não para decidir agora, e por isso desceu para o fim.
    await POST(req("POST", { form: validForm }));
    const equipa = sendMailMock.mock.calls[0][0];
    const primeiraLinha = (equipa.text ?? "").split("\n")[0];
    expect(primeiraLinha).toContain(validForm.name);
    expect(primeiraLinha).not.toMatch(/refer[êe]ncia/i);
    expect(primeiraLinha).not.toMatch(/^LIQ-/);
    // E continua a estar lá, no fim — sem ela não se procura o pedido no back
    // office.
    expect(equipa.text).toMatch(/Referência: LIQ-/);
  });

  it("silently drops a honeypot hit without persisting or emailing", async () => {
    const res = await POST(req("POST", { form: validForm, website: "i-am-a-bot" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("ok"); // indistinguishable from success, to the bot
    expect(store.create).not.toHaveBeenCalled();
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload (name too short) with 400", async () => {
    const res = await POST(req("POST", { form: { name: "A", email: "bad" } }));
    expect(res.status).toBe(400);
    expect(store.create).not.toHaveBeenCalled();
  });

  it("returns 429 when throttled", async () => {
    rl.result = { ok: false, retryAfter: 10 };
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(429);
  });
});

describe("GET /api/orcamento", () => {
  it("requires authentication (401 for the public)", async () => {
    authed.ok = false;
    const res = await GET(req("GET"));
    expect(res.status).toBe(401);
  });

  it("returns the quote list for an authenticated admin", async () => {
    authed.ok = true;
    const res = await GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([{ id: "LIQ-1" }]);
  });
});
