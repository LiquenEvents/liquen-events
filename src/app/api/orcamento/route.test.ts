import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const store = vi.hoisted(() => ({
  create: vi.fn(async () => {}),
  list: vi.fn(async () => [{ id: "LIQ-1" }]),
  // A mesma lista sem as colecções que só o pedido aberto mostra — o que
  // `resumirQuote` faz (provado em quotes-store.test.ts). Aqui interessa a
  // LIGAÇÃO: qual dos dois leitores é que a rota escolhe.
  resumos: vi.fn(async () => [{ id: "LIQ-1" }]),
}));
const authed = vi.hoisted(() => ({ ok: false }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));

vi.mock("@/lib/quotes-store", () => ({
  createQuote: store.create,
  listQuotes: store.list,
  listQuoteSummaries: store.resumos,
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

function req(method: "POST" | "GET", body?: unknown, query = ""): NextRequest {
  return new Request(`https://liquen.test/api/orcamento${query}`, {
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

  /**
   * O caso que deu origem a isto: a proposta da Catarina Martins saiu com
   * cinco pontos de decoração, e a resposta dela foi «pode me atualizar o
   * orçamento apenas para» três. Escolher no PEDIDO evita a ida e volta — mas
   * só se a escolha sobreviver ao caminho todo até à equipa.
   */
  describe("pontos de decoração", () => {
    const comDecor = {
      ...validForm,
      eventType: "casamentos",
      decorPoints: ["cocktail", "seating", "mesas"],
    };

    it("chegam ao pedido gravado", async () => {
      await POST(req("POST", { form: comDecor }));
      expect(store.create).toHaveBeenCalledTimes(1);
      // O duplo `as` é por causa do duplo do `createQuote`, declarado sem
      // argumentos — o TypeScript não sabe que a rota lhe passa o pedido.
      const [gravado] = store.create.mock.calls[0] as unknown as [{ decorPoints?: string[] }];
      expect(gravado.decorPoints).toEqual(["cocktail", "seating", "mesas"]);
    });

    it("aparecem no email à equipa, na ordem do dia", async () => {
      // É o que decide se vale a pena ligar já: um pedido só das mesas do
      // jantar e um pedido da cerimónia inteira não são o mesmo trabalho.
      await POST(req("POST", { form: comDecor }));
      const equipa = sendMailMock.mock.calls[0][0];
      expect(equipa.text ?? "").toContain("Decoração: Cocktail · Mesas do jantar · Seating plan");
    });

    it("são devolvidos ao casal no email de confirmação", async () => {
      // A preocupação do João era o automático soar impessoal. Repetir de
      // volta o que a pessoa escolheu é o que faz parecer que alguém leu.
      await POST(req("POST", { form: comDecor }));
      const cliente = sendMailMock.mock.calls[1][0];
      expect(cliente.text ?? "").toContain("Cocktail");
      expect(cliente.text ?? "").toContain("Seating plan");
    });

    it("um identificador inventado não passa para os emails", async () => {
      await POST(req("POST", { form: { ...comDecor, decorPoints: ["<script>", "bar"] } }));
      for (const [args] of sendMailMock.mock.calls) {
        expect(args.html).not.toContain("<script>");
        expect(args.text ?? "").not.toContain("<script>");
      }
      expect(sendMailMock.mock.calls[0][0].text ?? "").toContain("Decoração: Bar");
    });

    it("um pedido sem escolhas não ganha uma linha vazia", async () => {
      // Quem não marcou nada não pode ver "Decoração:" seguido de nada — é
      // pior do que não ter a linha.
      await POST(req("POST", { form: validForm }));
      for (const [args] of sendMailMock.mock.calls) {
        expect(args.text ?? "").not.toMatch(/Decora[çc][ãa]o:\s*$/m);
      }
    });
  });

  /**
   * "AINDA A DEFINIR" NÃO PODE SER TUDO O QUE A EQUIPA SABE.
   *
   * Um casamento de 40 pessoas e um de 300 não são o mesmo trabalho nem o
   * mesmo orçamento. Quem ainda não fechou a lista sabe quase sempre a ordem
   * de grandeza, e é isso que o intervalo guarda.
   */
  describe("estimativa de convidados", () => {
    const semNumero = { ...validForm, guests: 0, guestsRange: "100-150" };

    it("aparece no email à equipa quando não há número", async () => {
      await POST(req("POST", { form: semNumero }));
      expect(sendMailMock.mock.calls[0][0].text ?? "").toContain("Convidados: ~ 100 a 150");
    });

    it("é devolvida ao cliente na confirmação", async () => {
      await POST(req("POST", { form: semNumero }));
      expect(sendMailMock.mock.calls[1][0].text ?? "").toContain("100 a 150");
    });

    it("o NÚMERO manda quando existe — os dois nunca convivem", async () => {
      // Enviar os dois deixava a equipa sem saber qual acreditar.
      await POST(req("POST", { form: { ...validForm, guests: 250, guestsRange: "100-150" } }));
      const equipa = sendMailMock.mock.calls[0][0].text ?? "";
      expect(equipa).toContain("Convidados: 250");
      expect(equipa).not.toContain("100 a 150");
    });

    it("um intervalo inventado não passa para o email", async () => {
      await POST(req("POST", { form: { ...validForm, guests: 0, guestsRange: "<script>" } }));
      for (const [args] of sendMailMock.mock.calls) {
        expect(args.text ?? "").not.toContain("<script>");
      }
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A CERIMÓNIA E O ESPAÇO — as duas perguntas que mudam o trabalho
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Uma cerimónia religiosa é um SEGUNDO sítio para decorar no mesmo dia, com
   * as suas regras e uma deslocação a meio; ao ar livre há sempre uma montagem
   * alternativa a preparar para o caso de chover. Nenhuma das duas coisas se
   * consegue orçamentar sem a resposta, e nenhuma das duas se lembra de
   * perguntar ao telefone.
   *
   * O que estes testes guardam é o caminho todo: o que o cliente escolhe tem de
   * chegar ao pedido gravado, ao email da equipa e de volta ao próprio cliente.
   */
  describe("tipo de cerimónia e tipo de espaço", () => {
    const comAmbos = {
      ...validForm,
      eventType: "casamentos",
      ceremonyType: "civil-religiosa",
      spaceType: "exterior",
    };

    it("chegam ao pedido gravado", async () => {
      await POST(req("POST", { form: comAmbos }));
      const [gravado] = store.create.mock.calls[0] as unknown as [
        { ceremonyType?: string; spaceType?: string },
      ];
      expect(gravado.ceremonyType).toBe("civil-religiosa");
      expect(gravado.spaceType).toBe("exterior");
    });

    it("aparecem no email à equipa, com o rótulo e não com o identificador", async () => {
      await POST(req("POST", { form: comAmbos }));
      const equipa = sendMailMock.mock.calls[0][0];
      expect(equipa.text ?? "").toContain("Cerimónia: Civil e religiosa");
      expect(equipa.text ?? "").toContain("Espaço: Exterior");
      // O identificador é interno: nunca deve ser o que ela lê.
      expect(equipa.text ?? "").not.toContain("civil-religiosa");
    });

    it("são devolvidos ao cliente na confirmação", async () => {
      await POST(req("POST", { form: comAmbos }));
      const cliente = sendMailMock.mock.calls[1][0];
      expect(cliente.text ?? "").toContain("Civil e religiosa");
      expect(cliente.text ?? "").toContain("Exterior");
    });

    it("um identificador inventado não passa para os emails", async () => {
      await POST(
        req("POST", {
          form: { ...comAmbos, ceremonyType: "<script>", spaceType: "<script>" },
        }),
      );
      for (const [args] of sendMailMock.mock.calls) {
        expect(args.html).not.toContain("<script>");
        expect(args.text ?? "").not.toContain("<script>");
      }
    });

    it("quem não respondeu não ganha uma linha vazia", async () => {
      await POST(req("POST", { form: validForm }));
      for (const [args] of sendMailMock.mock.calls) {
        expect(args.text ?? "").not.toMatch(/Cerim[óo]nia:\s*$/m);
        expect(args.text ?? "").not.toMatch(/Espa[çc]o:\s*$/m);
      }
    });
  });

  it("não mete o 'Como nos conheceu' no email", async () => {
    // Ela fotografou a linha `Como nos conheceu  ref:www.google.com` e pediu
    // para a tirar. O campo não é escrito por ninguém — é apanhado pelo
    // LeadSourceCapture e traz notação de máquina (`ref:<domínio>` ou uma
    // lista de UTMs). Continua a ser gravado, para o back office; deixou é de
    // ser desenhado no email.
    await POST(req("POST", { form: { ...validForm, referralSource: "ref:www.google.com" } }));
    for (const [args] of sendMailMock.mock.calls) {
      expect(args.html).not.toContain("Como nos conheceu");
      expect(args.html).not.toContain("ref:www.google.com");
      expect(args.text ?? "").not.toContain("Como nos conheceu");
      expect(args.text ?? "").not.toContain("ref:www.google.com");
    }
    // E continua a ser guardado — é dali que sai a agregação "de onde vêm os
    // pedidos" no back office. Tirar do email não pode virar tirar dos dados.
    expect(store.create).toHaveBeenCalledWith(
      expect.objectContaining({ referralSource: "ref:www.google.com" }),
    );
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

  /**
   * ── `?resumo=1` ─────────────────────────────────────────────────────────
   *
   * O painel relê esta rota ao voltar ao separador, ao devolver o foco e de
   * dois em dois minutos. Sem o resumo, a lista INTEIRA voltava a
   * descarregar-se aí — e a poupança do primeiro carregamento durava até à
   * primeira mudança de separador, que é o mesmo que não existir.
   *
   * Sem o parâmetro nada muda: é isso que deixa os testes de ponta a ponta e
   * qualquer outro leitor continuarem a receber tudo.
   */
  it("por omissão lê a lista INTEIRA, como sempre leu", async () => {
    authed.ok = true;
    await GET(req("GET"));
    expect(store.list).toHaveBeenCalled();
    expect(store.resumos).not.toHaveBeenCalled();
  });

  it("com ?resumo=1 lê os resumos, e não a lista inteira", async () => {
    authed.ok = true;
    const res = await GET(req("GET", undefined, "?resumo=1"));
    expect(res.status).toBe(200);
    expect(store.resumos).toHaveBeenCalled();
    expect(store.list).not.toHaveBeenCalled();
  });
});
