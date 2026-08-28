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

  it("o documento de um cliente não fica em cache partilhada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(corpoDeTeste(), { status: 200 })),
    );
    const r = await pdfGuardadoEmFluxo(pedido(), "p1", "abc", "P.pdf");
    expect(r!.headers.get("cache-control")).toContain("private");
    expect(r!.headers.get("cache-control")).toContain("no-store");
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
