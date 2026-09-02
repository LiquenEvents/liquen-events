import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { pdfGuardadoEmFluxo } from "./pdf-do-armazenamento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PDF GUARDADO SAI PELO NOSSO ENDEREÇO — E EM FLUXO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que aqui se prende, por ordem de importância:
 *
 *  1. A CHAVE DE SERVIÇO NÃO SAI. Vai no pedido ao armazenamento e não pode
 *     aparecer em cabeçalho nenhum da resposta ao casal.
 *  2. O CORPO NÃO É COPIADO. Se alguém trocar isto por um `arrayBuffer()`, a
 *     função passa a segurar megabytes em memória e deixa de haver fluxo.
 *  3. Falhar é `null`, nunca uma excepção — quem chama tem de poder cair para
 *     o desenho.
 */

const original = { ...process.env };

/** Um corpo que se sabe distinguir, e que sabe dizer se foi lido de uma vez. */
function corpoDeTeste(texto = "%PDF-1.7 fingido") {
  return new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(texto));
      c.close();
    },
  });
}

beforeEach(() => {
  process.env.SUPABASE_URL = "https://exemplo.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "chave-de-servico-de-teste";
});
afterEach(() => {
  process.env = { ...original };
  vi.restoreAllMocks();
});

const pedido = (cabecalhos: Record<string, string> = {}) =>
  new Request("https://liquen-events.com/api/proposta/tok/pdf", { headers: cabecalhos });

describe("o PDF guardado, servido por nós", () => {
  it("CONTROLO POSITIVO: com o objecto lá, responde 200 com o PDF", async () => {
    // Sem isto, uma função que devolvesse sempre `null` passava em todos os
    // casos negativos aqui em baixo sem servir um único ficheiro.
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(corpoDeTeste(), { status: 200, headers: { "content-length": "16" } }),
      ),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "chave", "Proposta.pdf");
    expect(r).not.toBeNull();
    expect(r!.status).toBe(200);
    expect(r!.headers.get("content-type")).toBe("application/pdf");
    expect(await r!.text()).toContain("%PDF");
  });

  it("pede o objecto ao armazenamento com a chave de serviço, uma só vez", async () => {
    // «Uma só vez» é metade da razão de isto existir: o caminho antigo assinava
    // primeiro (um pedido) e só depois é que o telemóvel ia buscar (outro).
    const espia = vi.fn(async () => new Response(corpoDeTeste(), { status: 200 }));
    vi.stubGlobal("fetch", espia);
    await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "Proposta.pdf");
    expect(espia).toHaveBeenCalledTimes(1);
    const [url, opcoes] = espia.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://exemplo.supabase.co/storage/v1/object/proposal-pdfs/p1/abc.pdf");
    expect((opcoes.headers as Record<string, string>).Authorization).toBe(
      "Bearer chave-de-servico-de-teste",
    );
  });

  it("A CHAVE DE SERVIÇO NÃO APARECE EM CABEÇALHO NENHUM DA RESPOSTA", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(corpoDeTeste(), {
            status: 200,
            // O armazenamento a devolver coisas que NÃO se repetem ao cliente.
            headers: {
              "content-length": "16",
              authorization: "Bearer chave-de-servico-de-teste",
              "sb-gateway-version": "1",
            },
          }),
      ),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "Proposta.pdf");
    const tudo = [...r!.headers.entries()].map(([k, v]) => `${k}: ${v}`).join("\n");
    expect(tudo).not.toContain("chave-de-servico-de-teste");
    expect(tudo.toLowerCase()).not.toContain("authorization");
  });

  it("NÃO copia o corpo — o fluxo do armazenamento é o corpo da resposta", async () => {
    /**
     * A prova de que não há buffer: o corpo de origem fica por ler depois de a
     * resposta ser construída. Se alguém puser um `arrayBuffer()` no meio, ele
     * passa a estar consumido e este teste cai.
     */
    const origem = new Response(corpoDeTeste(), { status: 200 });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => origem),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "Proposta.pdf");
    expect(origem.bodyUsed, "o corpo do armazenamento foi lido para memória").toBe(false);
    expect(r!.body).not.toBeNull();
  });

  it("o pedido de pedaço do leitor de PDF segue tal e qual, e a resposta 206 também", async () => {
    const espia = vi.fn(
      async () =>
        new Response(corpoDeTeste(), {
          status: 206,
          headers: { "content-range": "bytes 0-15/2048" },
        }),
    );
    vi.stubGlobal("fetch", espia);
    const r = await pdfGuardadoEmFluxo(pedido({ range: "bytes=0-15" }), "p1", "abc", "P.pdf");
    const [, opcoes] = espia.mock.calls[0] as unknown as [string, RequestInit];
    expect((opcoes.headers as Record<string, string>).Range).toBe("bytes=0-15");
    expect(r!.status).toBe(206);
    expect(r!.headers.get("content-range")).toBe("bytes 0-15/2048");
    expect(r!.headers.get("accept-ranges")).toBe("bytes");
  });

  it("descarrega, com o nome do anexo — os dois caminhos da rota dizem o mesmo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpoDeTeste(), { status: 200 })),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "Proposta-Melanie.pdf");
    expect(r!.headers.get("content-disposition")).toBe(
      'attachment; filename="Proposta-Melanie.pdf"',
    );
  });

  /**
   * ── ESTE CASO GUARDAVA O `no-store`, E ERA ELE O DEFEITO ──────────────────
   *
   * Guardava «private» E «no-store» juntos, como se fossem a mesma promessa.
   * São coisas diferentes: `private` diz «não guardes numa cache PARTILHADA», e
   * é a regra certa; `no-store` diz «não guardes de todo, nem no telemóvel de
   * quem pediu» — e era isso que fazia o segundo clique, o «abrir outra vez» e
   * uma transferência retomada pagarem 0,5 a 4 MB de novo, num 4G.
   *
   * A outra metade desta mesma rota — o caminho do desenho — sempre disse
   * `private, max-age=300, must-revalidate`. As duas metades diziam coisas
   * contrárias sobre o mesmo ficheiro.
   *
   * Fica a regra que interessa (nunca `public`, porque o testemunho vai no
   * endereço) e a proibição do que estava errado.
   */
  it("fica no telemóvel de quem pediu, e em cache partilhada nenhuma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpoDeTeste(), { status: 200 })),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf");
    const cc = r!.headers.get("cache-control") ?? "";

    expect(cc, "o endereço leva o testemunho: nunca `public`").toContain("private");
    expect(cc, "o endereço leva o testemunho: nunca `public`").not.toContain("public");
    expect(
      cc,
      "voltou o `no-store`: o navegador fica proibido de guardar o ficheiro e cada " +
        "reabertura volta a pagar os megabytes todos",
    ).not.toContain("no-store");
    expect(cc).toContain("max-age=300");
    expect(cc, "sem isto, um telemóvel sem rede serve uma versão vencida").toContain(
      "must-revalidate",
    );
    /**
     * E NUNCA `immutable`. Os bytes deste endereço mudam de propósito: uma
     * revisão muda a chave, e o mesmo link salta para a versão mais recente.
     * Com `immutable`, um casal que descarregou a v1 e volta a carregar depois
     * de ela corrigir o preço recebia a v1 sem sequer perguntar.
     */
    expect(cc, "o `immutable` congela uma proposta revista no telemóvel do casal").not.toContain(
      "immutable",
    );
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * REABRIR NÃO CUSTA UMA IDA AO BALDE NEM UM BYTE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «uma pessoa estar ali à espera diz que aquilo não funciona
   * e funciona, só que demora tempo, só que não pode demorar».
   *
   * O caso mais comum de todos é o casal abrir a proposta, fechar, e voltar a
   * abrir para a mostrar a alguém. Isso pagava tudo outra vez.
   */
  it("quem já tem esta versão recebe 304, sem se ir ao armazenamento", async () => {
    const rede = vi.fn(async () => new Response(corpoDeTeste(), { status: 200 }));
    vi.stubGlobal("fetch", rede);
    const req = new Request("https://liquen.test/pdf", {
      headers: { "if-none-match": '"abc"' },
    });

    const r = await pdfGuardadoEmFluxo(req, "p1", "abc", "P.pdf");

    expect(r!.status).toBe(304);
    expect(r!.headers.get("etag")).toBe('"abc"');
    expect(rede, "foi ao armazenamento para responder «já tens»").not.toHaveBeenCalled();
  });

  it("o ETag é a chave do DOCUMENTO, e não o do balde", async () => {
    /**
     * Sem isto, nada do que está acima chega a acontecer em produção.
     *
     * O balde manda o MD5 do objecto. Se for esse que sai daqui, o navegador
     * volta com `If-None-Match: "<md5>"` — que nunca é igual à nossa chave — e
     * a reabertura nunca pode ser barata. A chave é o `sha256` do documento.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(corpoDeTeste(), { status: 200, headers: { etag: '"md5-do-balde"' } }),
      ),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf");
    expect(r!.headers.get("etag")).toBe('"abc"');
  });

  it("um `If-None-Match` de outra versão recebe o ficheiro novo", async () => {
    // A prova de que uma proposta revista continua a ser entregue.
    const rede = vi.fn(async () => new Response(corpoDeTeste(), { status: 200 }));
    vi.stubGlobal("fetch", rede);
    const req = new Request("https://liquen.test/pdf", {
      headers: { "if-none-match": '"chave-velha"' },
    });

    const r = await pdfGuardadoEmFluxo(req, "p1", "abc", "P.pdf");

    expect(r!.status).toBe(200);
    expect(rede).toHaveBeenCalled();
  });

  it("com `Range` não se atalha para 304 — quem retoma quer o pedaço", async () => {
    const rede = vi.fn(async () => new Response(corpoDeTeste(), { status: 206 }));
    vi.stubGlobal("fetch", rede);
    const req = new Request("https://liquen.test/pdf", {
      headers: { "if-none-match": '"abc"', range: "bytes=0-15" },
    });

    const r = await pdfGuardadoEmFluxo(req, "p1", "abc", "P.pdf");

    expect(r!.status).toBe(206);
    expect(rede).toHaveBeenCalled();
  });

  it("um `If-Range` de outra versão anula o pedaço, em vez de costurar duas versões", async () => {
    /**
     * Uma transferência retomada manda o validador que tinha mais o `Range`. Se
     * a proposta foi revista entretanto, servir o pedaço é colar bytes da v2 a
     * bytes da v1 — e o que o casal abre é um PDF corrompido. A regra é
     * ignorar o `Range` e mandar o ficheiro inteiro.
     */
    // Tipado com os argumentos porque é o SEGUNDO que interessa: as opções.
    const rede = vi.fn(
      async (_url: string, _opcoes?: RequestInit) => new Response(corpoDeTeste(), { status: 200 }),
    );
    vi.stubGlobal("fetch", rede);
    const req = new Request("https://liquen.test/pdf", {
      headers: { "if-range": '"chave-velha"', range: "bytes=0-15" },
    });

    await pdfGuardadoEmFluxo(req, "p1", "abc", "P.pdf");

    const opcoes = rede.mock.calls[0]?.[1] as { headers?: Record<string, string> } | undefined;
    expect(
      opcoes?.headers?.Range,
      "o pedaço foi reencaminhado apesar de o validador não bater",
    ).toBeUndefined();
  });

  it("um 304 do armazenamento nunca vira um desenho", async () => {
    /**
     * A armadilha, fechada antes de existir. Hoje não se reencaminha nenhum
     * cabeçalho condicional, portanto o balde nunca responde 304. No dia em que
     * alguém o reencaminhar — e parece uma optimização óbvia — um 304 caía no
     * `!ok`, devolvia `null`, e a rota desenhava o documento inteiro em
     * silêncio: o pedido mais barato passava a ser o mais caro.
     */
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 304 })),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf");

    expect(r, "um 304 do balde devolveu `null` e mandou desenhar").not.toBeNull();
    expect(r!.status).toBe(304);
  });

  it("404 é o caso normal da primeira vez: devolve `null` para se desenhar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, { status: 404 })),
    );
    expect(await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf")).toBeNull();
  });

  it("uma avaria de rede é `null`, nunca uma excepção", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("rede em baixo");
      }),
    );
    await expect(pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf")).resolves.toBeNull();
  });

  it("sem armazenamento configurado, nem se tenta", async () => {
    const espia = vi.fn();
    vi.stubGlobal("fetch", espia);
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf")).toBeNull();
    expect(espia).not.toHaveBeenCalled();
  });

  it("o caminho é saneado — um id com barras não sai do sítio dele", async () => {
    const espia = vi.fn(async () => new Response(corpoDeTeste(), { status: 200 }));
    vi.stubGlobal("fetch", espia);
    await pdfGuardadoEmFluxo(pedido(), "../../outro/p1", "abc", "P.pdf");
    const [url] = espia.mock.calls[0] as unknown as [string];
    expect(url).toBe("https://exemplo.supabase.co/storage/v1/object/proposal-pdfs/outrop1/abc.pdf");
  });
});
