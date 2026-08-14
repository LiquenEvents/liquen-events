import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MODELOS QUE SÓ SAEM QUANDO ELA MANDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Sinal recebido», «Falta uma semana» e «Agradecimento» são os três modelos
 * que o ecrã dizia serem enviados sozinhos e que não eram enviados de todo.
 * Passam a ter um botão no Dossier do evento — e é tudo o que passam a ter:
 * **nada aqui envia email nenhum sem um gesto explícito dela.** Não há
 * agendador, não há `cron`, e o próprio POST só envia quando lhe pedem
 * `enviar: true`; por omissão PRÉ-VISUALIZA. Um email automático na altura
 * errada é pior do que não existir.
 */

const authed = vi.hoisted(() => ({ ok: false }));
const quotes = vi.hoisted(() => ({
  actual: null as Record<string, unknown> | null,
  get: vi.fn(async (id: string) => (id === "LIQ-1" ? quotes.actual : null)),
  update: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
    ...quotes.actual,
    ...patch,
  })),
}));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts?: unknown) => ({ sent: true })) }));
const modelo = vi.hoisted(() => ({ get: vi.fn(async (_chave: string) => null as unknown) }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/quotes-store", () => ({ getQuote: quotes.get, updateQuote: quotes.update }));
vi.mock("@/lib/mail", () => ({
  sendMail: mail.send,
  // Escapa MESMO, como o verdadeiro: é a única forma de um teste aqui ver a
  // diferença entre um valor escapado e um valor cru.
  esc: (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  MAIL_TO: "team@example.com",
}));
vi.mock("@/lib/portal-token", () => ({ createPortalToken: vi.fn((id: string) => `ptok:${id}`) }));
vi.mock("@/lib/email-templates-store", async (original) => {
  const real = await original<typeof import("@/lib/email-templates-store")>();
  return { ...real, getTemplate: modelo.get };
});

import { POST } from "./route";

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const req = (corpo: unknown): NextRequest =>
  new Request("https://liquen.test/api/orcamento/LIQ-1/modelo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as NextRequest;

const PEDIDO = {
  id: "LIQ-1",
  name: "Ana Maria Sousa",
  email: "ana@x.pt",
  date: "2026-09-12",
  location: "Herdade da Malhadinha",
  status: "aceite",
  payments: [{ id: "p1", kind: "sinal", amount: 1500, date: "2026-02-01", paid: true }],
};

beforeEach(() => {
  authed.ok = false;
  quotes.actual = structuredClone(PEDIDO);
  vi.clearAllMocks();
  modelo.get.mockResolvedValue(null);
});

describe("POST /api/orcamento/[id]/modelo — a barreira", () => {
  it("recusa quem não tem sessão, e não envia nada", async () => {
    const res = await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    expect(res.status).toBe(401);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("404 num pedido que não existe", async () => {
    authed.ok = true;
    const res = await POST(req({ chave: "agradecimento" }), ctx("nope"));
    expect(res.status).toBe(404);
  });

  /**
   * O «proposta-enviada» leva o link de aceitação e o PDF em anexo, e os dois
   * só existem no instante em que a proposta é gerada. Um botão que o mandasse
   * à parte anunciava ao cliente uma proposta que não vinha — ou mandava-lhe o
   * link de uma proposta antiga.
   */
  it("recusa o modelo da proposta — esse sai com a proposta, não à parte", async () => {
    authed.ok = true;
    const res = await POST(req({ chave: "proposta-enviada", enviar: true }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/proposta/i);
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("recusa uma chave inventada", async () => {
    authed.ok = true;
    const res = await POST(req({ chave: "../../etc/passwd" }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect(mail.send).not.toHaveBeenCalled();
  });
});

describe("POST /api/orcamento/[id]/modelo — pré-visualizar antes de enviar", () => {
  it("por omissão NÃO envia: mostra destinatário, assunto e texto", async () => {
    authed.ok = true;
    const res = await POST(req({ chave: "agradecimento" }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.destinatario).toBe("ana@x.pt");
    expect(data.assunto).toBe("Obrigado por nos ter escolhido");
    expect(data.texto).toContain("Ana");
    // O gesto é dela e só dela.
    expect(mail.send).not.toHaveBeenCalled();
  });

  it("a pré-visualização não traz etiquetas nem o rodapé do modelo", async () => {
    authed.ok = true;
    const data = await (await POST(req({ chave: "agradecimento" }), ctx("LIQ-1"))).json();
    expect(data.texto).not.toMatch(/[<>]/);
    expect(data.texto).not.toContain("Líquen Events · Portugal");
  });

  /**
   * «Falta uma semana para {data_evento}» num pedido sem data sairia «Falta uma
   * semana para ». Recusa-se, e a frase diz o modelo, o dado e o que fazer —
   * ela está com o dedo no botão e preencher a data é um gesto.
   */
  it("um marcador sem valor recusa com uma frase útil, em vez de deixar o buraco", async () => {
    authed.ok = true;
    quotes.actual = { ...PEDIDO, date: "" };
    const data = await (await POST(req({ chave: "semana-evento" }), ctx("LIQ-1"))).json();
    expect(data.ok).toBe(false);
    expect(data.motivo).toContain("{data_evento}");
    expect(data.motivo).toMatch(/não foi enviado/i);
    expect(data.assunto).toBeUndefined();
  });

  it("um modelo guardado VAZIO recusa, em vez de mandar um email em branco", async () => {
    authed.ok = true;
    modelo.get.mockResolvedValue({
      key: "agradecimento",
      name: "Agradecimento pós-evento",
      subject: "Obrigado",
      body: "<div>\n  <p>   </p>\n</div>",
      updatedAt: "",
    });
    const data = await (await POST(req({ chave: "agradecimento" }), ctx("LIQ-1"))).json();
    expect(data.ok).toBe(false);
    expect(data.motivo).toMatch(/vazio/i);
  });
});

describe("POST /api/orcamento/[id]/modelo — o envio", () => {
  it("com `enviar` envia mesmo, com a assinatura da casa e sem rodapé a dobrar", async () => {
    authed.ok = true;
    const res = await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(true);
    const env = mail.send.mock.calls.at(-1)![0] as {
      to: string;
      subject: string;
      html: string;
      text: string;
      attachments?: unknown[];
    };
    expect(env.to).toBe("ana@x.pt");
    expect(env.subject).toBe("Obrigado por nos ter escolhido");
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).not.toContain("Líquen Events · Portugal");
    expect(env.text).toContain("Catarina Gaspar");
    // O logótipo da assinatura viaja com a mensagem (`cid:`), senão sai uma
    // cruz vermelha na caixa do cliente.
    expect(env.attachments?.length).toBeGreaterThan(0);
  });

  it("o {valor} do sinal é o sinal PAGO, escrito como se escreve em Portugal", async () => {
    authed.ok = true;
    await POST(req({ chave: "sinal-recebido", enviar: true }), ctx("LIQ-1"));
    const env = mail.send.mock.calls.at(-1)![0] as { html: string };
    expect(env.html).toContain("1.500,00 €");
  });

  it("sem sinal pago, o modelo do sinal recusa — não sai «recebemos »", async () => {
    authed.ok = true;
    quotes.actual = { ...PEDIDO, payments: [] };
    const res = await POST(req({ chave: "sinal-recebido", enviar: true }), ctx("LIQ-1"));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain("{valor}");
    expect(mail.send).not.toHaveBeenCalled();
  });

  /** Um pedido que entrou por telefonema não tem email. Não se tenta enviar, e
   *  a resposta diz porquê — a mesma regra do mensageiro e da proposta. */
  it("sem email de cliente não tenta enviar, e diz o que falta", async () => {
    authed.ok = true;
    quotes.actual = { ...PEDIDO, email: "" };
    const res = await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.emailed).toBe(false);
    expect(data.emailError).toMatch(/email/i);
    expect(mail.send).not.toHaveBeenCalled();
  });

  /** O que ficou registado tem de ser o que o cliente LEU — em texto, sem
   *  etiquetas, e só quando o email saiu mesmo. */
  it("o email enviado fica no histórico do pedido, em texto legível", async () => {
    authed.ok = true;
    await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    const patch = quotes.update.mock.calls.at(-1)![1] as { messages: { body: string }[] };
    const ultima = patch.messages.at(-1)!.body;
    expect(ultima).toContain("Ana");
    expect(ultima).not.toMatch(/[<>]/);
  });

  it("um email que não saiu não entra no histórico como se tivesse saído", async () => {
    authed.ok = true;
    quotes.actual = { ...PEDIDO, email: "" };
    await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    expect(quotes.update).not.toHaveBeenCalled();
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * UMA FALHA DE ENVIO NÃO É «ERRO AO PREPARAR O EMAIL»
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * O `sendMail` só promete não atirar quando o SMTP está POR CONFIGURAR (é o que
 * está escrito no `mail.ts`). Tudo o resto ATIRA: a ligação a expirar (corta aos
 * 8 s), as credenciais recusadas, a caixa do cliente cheia. A excepção subia ao
 * `catch` de topo e a rota respondia:
 *
 *     500  {"error":"Erro ao preparar o email"}
 *
 * Uma frase falsa sobre a única parte que tinha corrido bem — o modelo foi lido,
 * os marcadores resolvidos, o corpo montado — e que a manda procurar o defeito
 * no texto dela. Pior: um erro que parece do modelo lê-se como «não saiu nada»,
 * e ela carrega outra vez; num servidor lento (o caso mais provável) o primeiro
 * email pode ter saído na mesma e o cliente recebe o mesmo agradecimento duas
 * vezes.
 *
 * A regra de não gravar um envio falhado mantém-se, e é a desta rota: aqui o
 * texto continua inteiro no modelo, e uma linha no histórico sobre um email que
 * ninguém recebeu é uma mentira que dura para sempre.
 */
describe("POST /api/orcamento/[id]/modelo — o servidor de correio a recusar", () => {
  it("responde 200 com a verdade, e não 500 sobre a preparação", async () => {
    authed.ok = true;
    mail.send.mockRejectedValueOnce(new Error("connect ECONNREFUSED 1.2.3.4:465"));

    const res = await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(String(body.emailError)).toMatch(/correio/i);
    expect(String(body.emailError), "tem de dizer que o cliente NÃO recebeu").toMatch(/NÃO/);
    expect(String(body.emailError), "não pode acusar o modelo, que estava bom").not.toMatch(
      /preparar/i,
    );
  });

  it("e continua a não gravar nada no histórico — ninguém recebeu", async () => {
    authed.ok = true;
    mail.send.mockRejectedValueOnce(new Error("Invalid login: 535 auth failed"));
    await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    expect(quotes.update).not.toHaveBeenCalled();
  });

  it("com o SMTP por configurar, a frase é a outra — a de instalação", async () => {
    authed.ok = true;
    mail.send.mockResolvedValueOnce({ sent: false });
    const res = await POST(req({ chave: "agradecimento", enviar: true }), ctx("LIQ-1"));
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(String(body.emailError)).toMatch(/não está configurado/i);
  });
});
