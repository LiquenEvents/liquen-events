import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const authed = vi.hoisted(() => ({ ok: true }));
interface Enviado {
  to: string;
  subject: string;
  html: string;
  text: string;
}
const correio = vi.hoisted(() => ({
  enviar: vi.fn(async (_args: unknown) => ({ sent: true })),
  MAIL_TO: "liquen.alentejo@gmail.com",
}));
/** O que o correio recebeu na chamada `n`, já com forma. */
const enviadoNa = (n: number): Enviado => correio.enviar.mock.calls[n]![0] as Enviado;
const dados = vi.hoisted(() => ({
  valores: {
    cliente_nome: "Marta",
    cliente_nome_completo: "Marta Gaspar",
    evento_data: "",
    remetente_nome: "Catarina Gaspar",
  } as Record<string, string>,
  emailDoCliente: "marta@exemplo.pt",
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/mail", () => ({ sendMail: correio.enviar, MAIL_TO: correio.MAIL_TO }));
vi.mock("@/lib/email-assinatura", () => ({
  ASSINATURA_NOME: "Catarina Gaspar",
  emailAoCliente: ({ html, texto }: { html: string; texto: string }) => ({
    html: `<moldura>${html}</moldura>`,
    text: texto,
    attachments: [],
  }),
}));
vi.mock("@/lib/email-modelos-previsualizacao", () => ({
  valoresDoPedidoReal: vi.fn(async (id: string) =>
    id === "q1"
      ? { valores: dados.valores, idioma: "pt", emailDoCliente: dados.emailDoCliente }
      : null,
  ),
}));

const { POST } = await import("./route");

const req = (body: unknown): NextRequest =>
  new Request("https://liquen.test/api/email-templates/teste", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NextRequest;

const modelo = {
  nome: "Registo formal",
  subject: "Proposta {{cliente_nome}}",
  body: "<p>Olá {{cliente_nome}},</p>{{#se_nao evento_data}}<p>Aguardamos a data.</p>{{/se_nao}}",
  pedido: "q1",
};

beforeEach(() => {
  authed.ok = true;
  correio.enviar.mockClear();
});

describe("envio de teste", () => {
  it("por omissão vai para a caixa da casa", async () => {
    const r = await POST(req(modelo));
    expect(r.status).toBe(200);
    expect(enviadoNa(0).to).toBe(correio.MAIL_TO);
  });

  it("o assunto leva sempre «[TESTE]» à frente", async () => {
    await POST(req(modelo));
    expect(enviadoNa(0).subject).toBe("[TESTE] Proposta Marta");
  });

  it("RECUSA enviar para o cliente do pedido que se está a ver", async () => {
    const r = await POST(req({ ...modelo, para: "MARTA@Exemplo.PT" }));
    expect(r.status).toBe(400);
    expect((await r.json()).error).toMatch(/endereço do cliente/i);
    expect(correio.enviar).not.toHaveBeenCalled();
  });

  it("usa os dados REAIS do pedido — inclusive o bloco da data em falta", async () => {
    await POST(req(modelo));
    const enviado = enviadoNa(0);
    expect(enviado.html).toContain("Olá Marta,");
    expect(enviado.html).toContain("Aguardamos a data.");
    expect(enviado.html).not.toContain("{{");
  });

  it("um endereço mal escrito não chega ao correio", async () => {
    const r = await POST(req({ ...modelo, para: "não-é-um-email" }));
    expect(r.status).toBe(400);
    expect(correio.enviar).not.toHaveBeenCalled();
  });

  it("sem sessão não envia nada", async () => {
    authed.ok = false;
    expect((await POST(req(modelo))).status).toBe(401);
    expect(correio.enviar).not.toHaveBeenCalled();
  });

  it("um modelo com uma variável a descoberto é recusado antes de sair", async () => {
    const r = await POST(req({ ...modelo, body: "<p>Olá {{validade_data}}</p>" }));
    expect(r.status).toBe(400);
    expect(correio.enviar).not.toHaveBeenCalled();
  });
});
