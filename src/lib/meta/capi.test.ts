import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import {
  cifrar,
  normalizarEmail,
  normalizarTelefone,
  normalizarNome,
  construirUserData,
  construirEvento,
  enviarEventos,
  ipDoPedido,
  eventoDeFecho,
  ENDPOINT,
  VERSAO_API,
} from "./capi";
import { EVENTOS } from "./eventos";

const sha = (v: string) => createHash("sha256").update(v, "utf8").digest("hex");

describe("normalização antes de cifrar", () => {
  it("o email vai em minúsculas e sem espaços", () => {
    expect(normalizarEmail("  Ana@Exemplo.PT ")).toBe("ana@exemplo.pt");
  });

  it("o telefone leva o indicativo de Portugal quando não o traz", () => {
    // Sem isto, a Meta procuraria "919259820" e não encontraria ninguém — o
    // número dela na conta está com indicativo.
    expect(normalizarTelefone("919 259 820")).toBe("351919259820");
    expect(normalizarTelefone("266 000 000")).toBe("351266000000");
  });

  it("um número que já traz indicativo não leva outro", () => {
    expect(normalizarTelefone("+351 919 259 820")).toBe("351919259820");
    expect(normalizarTelefone("00351919259820")).toBe("00351919259820");
  });

  it("um número estrangeiro passa tal como está, só sem símbolos", () => {
    expect(normalizarTelefone("+44 7700 900123")).toBe("447700900123");
  });

  it("o nome perde acentos e maiúsculas", () => {
    expect(normalizarNome(" Inês ")).toBe("ines");
    expect(normalizarNome("GONÇALO")).toBe("goncalo");
  });
});

describe("user_data", () => {
  it("cifra os dados pessoais e NÃO cifra o fbp nem o fbc", () => {
    // É a invariante mais importante deste ficheiro. Cifrar o fbp/fbc não dá
    // erro nenhum: os eventos são aceites e a correspondência fica a zero.
    const fbp = "fb.1.1700000000000.1234567890";
    const fbc = "fb.1.1700000000000.AbCdEf";
    const ud = construirUserData({
      email: "Ana@Exemplo.pt",
      telefone: "919259820",
      nome: "Ana Silva",
      fbp,
      fbc,
      ip: "203.0.113.7",
      agente: "Mozilla/5.0",
    });

    expect(ud.em).toEqual([sha("ana@exemplo.pt")]);
    expect(ud.ph).toEqual([sha("351919259820")]);
    expect(ud.fn).toEqual([sha("ana")]);
    expect(ud.ln).toEqual([sha("silva")]);

    expect(ud.fbp).toBe(fbp);
    expect(ud.fbc).toBe(fbc);
    expect(ud.client_ip_address).toBe("203.0.113.7");
    expect(ud.client_user_agent).toBe("Mozilla/5.0");
    // E, explicitamente, que não são o resumo de si próprios.
    expect(ud.fbp).not.toBe(sha(fbp));
    expect(ud.fbc).not.toBe(sha(fbc));
  });

  it("um nome de uma palavra não inventa apelido", () => {
    const ud = construirUserData({ nome: "Ana" });
    expect(ud.fn).toEqual([sha("ana")]);
    expect(ud).not.toHaveProperty("ln");
  });

  it("omite os campos vazios em vez de os enviar vazios", () => {
    // Enviar `"em": [""]` conta como uma chave de correspondência que nunca
    // corresponde, e baixa a pontuação de qualidade sem trazer nada.
    const ud = construirUserData({ email: "", telefone: "", nome: "", fbp: "", fbc: "" });
    expect(Object.keys(ud)).toEqual([]);
  });

  it("cifrar é SHA-256 em hexadecimal minúsculo", () => {
    expect(cifrar("teste")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("construirEvento", () => {
  it("tem os campos obrigatórios e o event_id que lhe foi dado", () => {
    const e = construirEvento({
      nome: EVENTOS.lead,
      eventId: "abc12345",
      quando: 1_700_000_000,
      url: "https://liquen-events.com/s/comporta",
      fonte: "website",
      pessoa: { email: "ana@exemplo.pt" },
      contexto: "s/comporta",
    });
    expect(e.event_name).toBe("Lead");
    expect(e.event_id).toBe("abc12345");
    expect(e.event_time).toBe(1_700_000_000);
    expect(e.action_source).toBe("website");
    expect(e.event_source_url).toBe("https://liquen-events.com/s/comporta");
    expect(e.custom_data).toMatchObject({ content_name: "s/comporta" });
  });

  it("só põe valor e moeda quando há valor", () => {
    const sem = construirEvento({
      nome: EVENTOS.lead,
      eventId: "abc12345",
      quando: 1,
      fonte: "website",
      pessoa: {},
    });
    expect(sem.custom_data).toBeUndefined();

    const com = construirEvento({
      nome: EVENTOS.purchase,
      eventId: "abc12345",
      quando: 1,
      fonte: "system_generated",
      pessoa: {},
      valor: 18_500.456,
    });
    expect(com.custom_data).toMatchObject({ value: 18_500.46, currency: "EUR" });
  });

  it("o evento de fecho declara system_generated e não website", () => {
    // Declarar `website` seria dizer à Meta que houve uma acção no sítio que
    // não houve: quem mudou o estado do pedido foi o back office.
    const e = construirEvento(
      eventoDeFecho({
        eventId: "fecho-ABC123XY",
        quando: 1_700_000_000,
        valorSemIva: 24_000,
        pessoa: { email: "ana@exemplo.pt" },
        ref: "ABC123XY",
      }),
    );
    expect(e.event_name).toBe("Purchase");
    expect(e.action_source).toBe("system_generated");
    expect(e.custom_data).toMatchObject({ value: 24_000, currency: "EUR" });
  });
});

describe("enviarEventos", () => {
  it("é inerte sem configuração e não abre socket nenhum", async () => {
    const buscar = vi.fn();
    const r = await enviarEventos(
      [{ nome: EVENTOS.lead, eventId: "abc12345", quando: 1, fonte: "website", pessoa: {} }],
      { datasetId: "", token: "", buscar: buscar as unknown as typeof fetch },
    );
    expect(r).toEqual({ enviado: false, motivo: "sem-configuracao" });
    expect(buscar).not.toHaveBeenCalled();
  });

  it("manda o token no cabeçalho e nunca na query", async () => {
    // Na query, o token acabaria no registo de acessos de qualquer
    // intermediário pelo caminho.
    const buscar = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 })));
    await enviarEventos(
      [{ nome: EVENTOS.lead, eventId: "abc12345", quando: 1, fonte: "website", pessoa: {} }],
      { datasetId: "123", token: "SEGREDO", buscar: buscar as unknown as typeof fetch },
    );
    const [url, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT("123"));
    expect(url).not.toContain("SEGREDO");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer SEGREDO");
  });

  it("o endpoint tem a versão fixada", () => {
    expect(ENDPOINT("123")).toBe(`https://graph.facebook.com/${VERSAO_API}/123/events`);
  });

  it("acrescenta o código de teste quando existe", async () => {
    const buscar = vi.fn(async () => new Response("{}"));
    await enviarEventos(
      [{ nome: EVENTOS.lead, eventId: "abc12345", quando: 1, fonte: "website", pessoa: {} }],
      {
        datasetId: "123",
        token: "t",
        codigoDeTeste: "TEST123",
        buscar: buscar as unknown as typeof fetch,
      },
    );
    const [, init] = buscar.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body)).test_event_code).toBe("TEST123");
  });

  it("nunca lança quando a rede falha", async () => {
    const buscar = vi.fn(async () => {
      throw new Error("socket morto");
    });
    const r = await enviarEventos(
      [{ nome: EVENTOS.lead, eventId: "abc12345", quando: 1, fonte: "website", pessoa: {} }],
      { datasetId: "123", token: "t", buscar: buscar as unknown as typeof fetch },
    );
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("erro-de-rede");
  });

  it("reporta a recusa em vez de a esconder", async () => {
    const buscar = vi.fn(async () => new Response("erro do lado deles", { status: 400 }));
    const r = await enviarEventos(
      [{ nome: EVENTOS.lead, eventId: "abc12345", quando: 1, fonte: "website", pessoa: {} }],
      { datasetId: "123", token: "t", buscar: buscar as unknown as typeof fetch },
    );
    expect(r.enviado).toBe(false);
    expect(r.motivo).toBe("recusado");
    expect(r.detalhe).toContain("400");
  });
});

describe("ipDoPedido", () => {
  it("lê o PRIMEIRO valor do x-forwarded-for", () => {
    // Os seguintes são os proxies pelos quais o pedido passou, não o cliente.
    const h = new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" });
    expect(ipDoPedido(h)).toBe("203.0.113.7");
  });

  it("recorre ao x-real-ip quando não há x-forwarded-for", () => {
    expect(ipDoPedido(new Headers({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4");
  });

  it("devolve vazio quando não há cabeçalho nenhum", () => {
    expect(ipDoPedido(new Headers())).toBe("");
  });
});
