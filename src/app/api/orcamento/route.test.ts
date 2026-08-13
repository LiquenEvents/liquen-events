import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

const store = vi.hoisted(() => ({
  create: vi.fn(async () => {}),
  list: vi.fn(async () => [{ id: "LIQ-1" }]),
  // A mesma lista sem as colecções que só o pedido aberto mostra — o que
  // `resumirQuote` faz (provado em quotes-store.test.ts). Aqui interessa a
  // LIGAÇÃO: qual dos dois leitores é que a rota escolhe.
  resumos: vi.fn(async () => [{ id: "LIQ-1" }]),
  // A verificação de idempotência. Estava a faltar no duplo, e só não rebentava
  // porque nenhum teste mandava `submissionId` — o vitest só se queixa de um
  // export em falta quando alguém lhe toca.
  get: vi.fn(async () => null as unknown),
}));
const authed = vi.hoisted(() => ({ ok: false }));
const rl = vi.hoisted(() => ({ result: { ok: true } as { ok: boolean; retryAfter?: number } }));

vi.mock("@/lib/quotes-store", () => ({
  createQuote: store.create,
  listQuotes: store.list,
  listQuoteSummaries: store.resumos,
  getQuote: store.get,
  generateQuoteId: () => "LIQ-TEST-0000000000000000",
  quoteIdFor: (s: string) => `LIQ-IDEM-${s}`,
}));
vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  // The confirmation send points replyTo at the monitored inbox.
  MAIL_TO: "equipa@liquen-events.test",
}));
vi.mock("@/lib/push", () => ({ sendPushToAll: vi.fn(async () => ({ sent: 0 })) }));
vi.mock("@/lib/meta/capi", () => ({
  enviarEventos: vi.fn(async () => ({ enviado: true, recebidos: 1 })),
  ipDoPedido: () => "1.2.3.4",
}));
vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(async () => rl.result),
  clientIp: () => "test-ip",
  sweep: () => {},
}));

/**
 * O `after` do Next atira fora de um contexto de pedido, por isso é substituído
 * por um que GUARDA as tarefas em vez de as correr. Não é conveniência: é o que
 * permite provar que o correio, a Meta e o push ficaram mesmo DE FORA da
 * resposta — antes de `correrDepois()` nada disso aconteceu, e é essa a
 * propriedade que fecha o oráculo de tempo. O resto do `next/server`
 * (NextResponse) fica o verdadeiro.
 */
const depois = vi.hoisted(() => ({ tarefas: [] as (() => unknown)[], semContexto: false }));
vi.mock("next/server", async (original) => {
  const real = await original<typeof import("next/server")>();
  return {
    ...real,
    after: (fn: () => unknown) => {
      // O `after` verdadeiro lança exactamente assim quando é chamado fora de um
      // pedido. É a única forma de a rota ficar sem sítio onde pousar o trabalho.
      if (depois.semContexto) throw new Error("`after` was called outside a request scope.");
      depois.tarefas.push(fn);
    },
  };
});
async function correrDepois() {
  for (const t of depois.tarefas.splice(0)) await t();
}

import { POST, GET } from "./route";
import { sendMail } from "@/lib/mail";
import { sendPushToAll } from "@/lib/push";
import { enviarEventos } from "@/lib/meta/capi";

const sendMailMock = vi.mocked(sendMail);
const pushMock = vi.mocked(sendPushToAll);
const metaMock = vi.mocked(enviarEventos);

function req(method: "POST" | "GET", body?: unknown, query = "", lang?: "pt" | "en"): NextRequest {
  return new Request(`https://liquen.test/api/orcamento${query}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(lang ? { cookie: `liquen-lang=${lang}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  }) as unknown as NextRequest;
}

/**
 * O `Request` cru não tem `.cookies` — quem o tem é o `NextRequest`. A rota lê a
 * língua por aí (com `?.`, para não rebentar quando não existe), portanto os
 * testes que se interessam pela língua têm de a pôr onde a rota a procura.
 */
function pedidoNaLingua(body: unknown, lang: "pt" | "en"): NextRequest {
  const r = req("POST", body, "", lang);
  Object.defineProperty(r, "cookies", {
    value: { get: (n: string) => (n === "liquen-lang" ? { value: lang } : undefined) },
  });
  return r;
}

const validForm = { name: "Ana Silva", email: "ana@example.com", phone: "", guests: 50 };

/** Envia e corre o que ficou para depois da resposta — o caminho completo. */
async function enviarTudo(body: unknown) {
  const res = await POST(req("POST", body));
  await correrDepois();
  return res;
}

beforeEach(() => {
  rl.result = { ok: true };
  authed.ok = false;
  depois.tarefas = [];
  depois.semContexto = false;
  store.get.mockResolvedValue(null);
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
    const res = await enviarTudo({ form: validForm });
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ replyTo: validForm.email });
    expect(sendMailMock.mock.calls[1][0]).toMatchObject({ to: validForm.email });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A RESPOSTA NÃO ESPERA PELO CORREIO, PELA META NEM PELO TELEMÓVEL DA EQUIPA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O pedido está gravado — a pergunta que o ecrã está a fazer («chegou?») já
   * tem resposta. O que vinha a seguir não muda essa resposta e demora o que
   * lhe apetecer: o nodemailer espera 8 s pela ligação, 8 s pela saudação e
   * 20 s pela transferência, e o push não tem limite nenhum. Somado, isso
   * passava dos 25 s em que os três formulários públicos cortam o pedido, e
   * dos 30 s do `maxDuration` — e o desfecho era a pessoa a ler «não foi
   * possível enviar» sobre um pedido gravado e já a caminho da equipa.
   *
   * A propriedade que este teste fecha é de TEMPO, e mede-se assim: antes de
   * `correrDepois()` a resposta já saiu e nada disto aconteceu.
   */
  it("responde sem esperar pela confirmação, pela Meta nem pelo push", async () => {
    const res = await POST(
      req("POST", {
        form: { ...validForm, leadEventId: "evt-1", metaClick: "fbp=1;fbc=2" },
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: "ok" });
    // A gravação é a única coisa que TEM de estar feita antes de responder.
    expect(store.create).toHaveBeenCalledTimes(1);
    expect(sendMailMock, "nenhum email pode prender a resposta").not.toHaveBeenCalled();
    expect(metaMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();

    // E nada disto se perde: fica agendado, e a plataforma mantém a função viva
    // até acabar (`after` → `waitUntil`).
    await correrDepois();
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(metaMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  /**
   * A excepção, e é uma só: quando a gravação falha, o email à equipa deixa de
   * ser um aviso e passa a ser a única cópia do pedido. Aí TEM de sair antes da
   * resposta — é ele que decide entre um «recebemos» verdadeiro e um 503.
   */
  it("quando a gravação falha, o aviso à equipa sai ANTES de responder", async () => {
    store.create.mockRejectedValueOnce(new Error("armazenamento em baixo"));
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(1);
    expect(sendMailMock.mock.calls[0][0]).toMatchObject({ replyTo: validForm.email });
  });

  it("sem sítio onde adiar o trabalho, faz-o à moda antiga — e não devolve 500", async () => {
    // O `after` lança fora de um pedido. A resposta já está DECIDIDA nesse
    // ponto — o pedido está gravado —, portanto nem o trabalho pode
    // desaparecer nem a pessoa pode ler «não foi possível» sobre um pedido
    // que ficou guardado.
    depois.semContexto = true;
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(200);
    expect(sendMailMock).toHaveBeenCalledTimes(2);
    expect(pushMock).toHaveBeenCalledTimes(1);
  });

  it("sem gravação e sem email, diz que não conseguiu — e não um obrigado falso", async () => {
    store.create.mockRejectedValueOnce(new Error("armazenamento em baixo"));
    sendMailMock.mockResolvedValueOnce({ sent: false });
    const res = await POST(req("POST", { form: validForm }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/não foi possível registar/i);
  });

  it("carries the wordmark INSIDE both emails, never as a hosted URL", async () => {
    await enviarTudo({ form: validForm });
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
    await enviarTudo({ form: { ...validForm, category: "casamentos" } });
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
    await enviarTudo({ form: validForm });
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
      await enviarTudo({ form: comDecor });
      expect(store.create).toHaveBeenCalledTimes(1);
      // O duplo `as` é por causa do duplo do `createQuote`, declarado sem
      // argumentos — o TypeScript não sabe que a rota lhe passa o pedido.
      const [gravado] = store.create.mock.calls[0] as unknown as [{ decorPoints?: string[] }];
      expect(gravado.decorPoints).toEqual(["cocktail", "seating", "mesas"]);
    });

    it("aparecem no email à equipa, na ordem do dia", async () => {
      // É o que decide se vale a pena ligar já: um pedido só das mesas do
      // jantar e um pedido da cerimónia inteira não são o mesmo trabalho.
      await enviarTudo({ form: comDecor });
      const equipa = sendMailMock.mock.calls[0][0];
      expect(equipa.text ?? "").toContain("Decoração: Cocktail · Mesas do jantar · Seating plan");
    });

    it("são devolvidos ao casal no email de confirmação", async () => {
      // A preocupação do João era o automático soar impessoal. Repetir de
      // volta o que a pessoa escolheu é o que faz parecer que alguém leu.
      await enviarTudo({ form: comDecor });
      const cliente = sendMailMock.mock.calls[1][0];
      expect(cliente.text ?? "").toContain("Cocktail");
      expect(cliente.text ?? "").toContain("Seating plan");
    });

    it("um identificador inventado não passa para os emails", async () => {
      await enviarTudo({ form: { ...comDecor, decorPoints: ["<script>", "bar"] } });
      for (const [args] of sendMailMock.mock.calls) {
        expect(args.html).not.toContain("<script>");
        expect(args.text ?? "").not.toContain("<script>");
      }
      expect(sendMailMock.mock.calls[0][0].text ?? "").toContain("Decoração: Bar");
    });

    it("um pedido sem escolhas não ganha uma linha vazia", async () => {
      // Quem não marcou nada não pode ver "Decoração:" seguido de nada — é
      // pior do que não ter a linha.
      await enviarTudo({ form: validForm });
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
      await enviarTudo({ form: semNumero });
      expect(sendMailMock.mock.calls[0][0].text ?? "").toContain("Convidados: ~ 100 a 150");
    });

    it("é devolvida ao cliente na confirmação", async () => {
      await enviarTudo({ form: semNumero });
      expect(sendMailMock.mock.calls[1][0].text ?? "").toContain("100 a 150");
    });

    it("o NÚMERO manda quando existe — os dois nunca convivem", async () => {
      // Enviar os dois deixava a equipa sem saber qual acreditar.
      await enviarTudo({ form: { ...validForm, guests: 250, guestsRange: "100-150" } });
      const equipa = sendMailMock.mock.calls[0][0].text ?? "";
      expect(equipa).toContain("Convidados: 250");
      expect(equipa).not.toContain("100 a 150");
    });

    it("um intervalo inventado não passa para o email", async () => {
      await enviarTudo({ form: { ...validForm, guests: 0, guestsRange: "<script>" } });
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
      await enviarTudo({ form: comAmbos });
      const [gravado] = store.create.mock.calls[0] as unknown as [
        { ceremonyType?: string; spaceType?: string },
      ];
      expect(gravado.ceremonyType).toBe("civil-religiosa");
      expect(gravado.spaceType).toBe("exterior");
    });

    it("aparecem no email à equipa, com o rótulo e não com o identificador", async () => {
      await enviarTudo({ form: comAmbos });
      const equipa = sendMailMock.mock.calls[0][0];
      expect(equipa.text ?? "").toContain("Cerimónia: Civil e religiosa");
      expect(equipa.text ?? "").toContain("Espaço: Exterior");
      // O identificador é interno: nunca deve ser o que ela lê.
      expect(equipa.text ?? "").not.toContain("civil-religiosa");
    });

    it("são devolvidos ao cliente na confirmação", async () => {
      await enviarTudo({ form: comAmbos });
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
      await enviarTudo({ form: validForm });
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
    await enviarTudo({ form: { ...validForm, referralSource: "ref:www.google.com" } });
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE A RECUSA DIZ A QUEM ESTÁ DO OUTRO LADO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este `error` vai DIREITO para o ecrã — os três formulários públicos
   * mostram-no tal e qual o receberam. É a única frase que a pessoa tem para
   * perceber o que corrigir, e quem não perceber fecha a página.
   */
  describe("o texto das recusas", () => {
    it("um campo demasiado longo diz QUAL é, e em português", async () => {
      // O «Local / região» não tem tecto nenhum no ecrã: colar uma morada
      // comprida é coisa que se faz sem dar por ela. O que se lia era
      // "Too big: expected string to have <=300 characters" — em inglês, sem
      // dizer de que campo se fala e sem nada à vista para corrigir.
      const res = await POST(req("POST", { form: { ...validForm, location: "x".repeat(400) } }));
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error, `a frase era "${error}"`).not.toMatch(/expected|characters|Too big/i);
      expect(error).toContain("Local / região");
      expect(error).toContain("300");
    });

    it("o mesmo campo, para quem está a ler o site em inglês", async () => {
      // A rota já lê a língua desta pessoa para escolher a língua do email de
      // confirmação. Recusar-lhe o pedido em português — ou em jargão de zod —
      // é a única parte da conversa que não a acompanhava.
      const res = await POST(
        pedidoNaLingua({ form: { ...validForm, location: "x".repeat(400) } }, "en"),
      );
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error).toContain("Location / region");
      expect(error).not.toMatch(/demasiado longo/i);
    });

    it("o nome e o email continuam a ser recusados pelo próprio nome", async () => {
      // O que já estava bem tem de continuar: estas duas frases são as mesmas
      // que o formulário mostra ao lado do campo, e vê-las escritas de duas
      // maneiras faz duvidar de que seja o mesmo erro.
      const semNome = await POST(req("POST", { form: { name: "A", email: "ana@example.com" } }));
      expect((await semNome.json()).error).toBe("Indique o seu nome");
      const emailMau = await POST(req("POST", { form: { ...validForm, email: "nao-e-email" } }));
      expect((await emailMau.json()).error).toBe("E-mail inválido");
    });

    it("um corpo que nem sequer é um pedido não devolve jargão", async () => {
      const res = await POST(req("POST", { qualquer: 1 }));
      expect(res.status).toBe(400);
      const { error } = await res.json();
      expect(error, `a frase era "${error}"`).not.toMatch(/expected|received|undefined/i);
    });

    it("o 429 diz quanto tempo esperar, e não «dentro de momentos»", async () => {
      // O tecto conta por ENDEREÇO, e um endereço não é uma pessoa: o
      // escritório, o espaço com wi-fi partilhado e a rede móvel do operador
      // põem muita gente atrás do mesmo. Quem é recusado por causa do vizinho
      // não fez nada de errado — e «dentro de momentos» tanto podia ser cinco
      // segundos como um minuto inteiro. O servidor sabe quanto falta: é o que
      // já ia no `Retry-After`, e que ninguém lia.
      rl.result = { ok: false, retryAfter: 45 };
      const res = await POST(req("POST", { form: validForm }));
      expect(res.status).toBe(429);
      expect(res.headers.get("Retry-After")).toBe("45");
      const { error } = await res.json();
      expect(error, `a frase era "${error}"`).toContain("45");
      expect(error).not.toMatch(/dentro de momentos/i);
    });
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

/**
 * ══════════════════════════════════════════════════════════════════════════
 * «O SEU PEDIDO PARA O CASAMENTOS» — artigo no singular, nome no plural
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Não é hipótese: saiu assim para clientes verdadeiros (13/08 e 10/08), no
 * assunto do email que ela envia a partir do botão de resposta. O rótulo da
 * taxonomia é um BALDE NO PLURAL («Casamentos») e ia direito para dentro de
 * uma frase escrita no singular.
 *
 * O corpo da confirmação já tinha isto resolvido — prefere a palavra que o
 * PRÓPRIO cliente escreveu — e ninguém reparou que as três frases do email à
 * equipa (WhatsApp, assunto e corpo do `mailto`) tinham o mesmo defeito.
 */
describe("concordância do nome do evento", () => {
  const casamentoSemNome = {
    ...validForm,
    phone: "912345678",
    category: "particulares",
    eventType: "casamentos",
  };

  /** As frases pré-preenchidas viajam codificadas dentro dos `href`. */
  function accoesPreenchidas(html: string): string {
    return [...html.matchAll(/href="((?:mailto:|https:\/\/wa\.me\/)[^"]+)"/g)]
      .map((m) => decodeURIComponent(m[1].replace(/&amp;/g, "&")))
      .join("\n");
  }

  it("o assunto do mailto não sai com «o casamentos»", async () => {
    await enviarTudo({ form: casamentoSemNome });
    const accoes = accoesPreenchidas(sendMailMock.mock.calls[0][0].html);
    expect(accoes).toContain("mailto:");
    expect(accoes).not.toContain("o casamentos");
  });

  it("nem o WhatsApp nem o corpo do mailto dependem do artigo", async () => {
    await enviarTudo({ form: casamentoSemNome });
    const accoes = accoesPreenchidas(sendMailMock.mock.calls[0][0].html);
    expect(accoes).toContain("wa.me");
    // Nenhuma das três frases pode voltar a colar um artigo singular a um
    // rótulo que pode vir no plural.
    expect(accoes).not.toMatch(/pedido para o [a-zà-ú]+s\b/);
    expect(accoes).not.toMatch(/orçamento para o [a-zà-ú]+s\b/);
  });

  /**
   * Quando o cliente escreveu o nome do evento dele, é ESSA a palavra que
   * aparece — a mesma regra que o corpo da confirmação já seguia.
   */
  it("prefere a palavra do próprio cliente ao rótulo da taxonomia", async () => {
    await enviarTudo({
      form: { ...casamentoSemNome, eventName: "Casamento da Ana e do João" },
    });
    const accoes = accoesPreenchidas(sendMailMock.mock.calls[0][0].html);
    expect(accoes).toContain("Casamento da Ana e do João");
  });
});
