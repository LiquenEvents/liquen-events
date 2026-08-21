import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO CURTO DA PROPOSTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que a cliente recebeu, num email a sério, foram cinco linhas disto:
 *
 *     …/proposta/eyJ0eXAiOiJwcm9wb3NhbCIsInBpZCI6IjI0ZTY0MjVhLTdmYjktNDdhMi1i…
 *
 * No HTML arruma-se — o endereço vive no `href`. No TEXTO SIMPLES não há `href`
 * nenhum onde o esconder, e é o texto simples que os filtros de spam leem
 * primeiro.
 *
 * O que estes testes prendem, por ordem de importância:
 *
 *  1. uma proposta tem UM endereço curto, não um por cada vez que alguém abre
 *     a pré-visualização — senão o estado enche-se de códigos e nenhum se pode
 *     cortar sem cortar os outros;
 *  2. quando o armazenamento não responde, sai o token assinado e o envio
 *     acontece na mesma — um email de proposta não pode falhar por causa disto;
 *  3. um código cortado ou expirado não abre, e não se cunha outro por cima.
 */

/** A gaveta de mentira: um `Map`, com um interruptor para a pôr em baixo. */
const gaveta = new Map<string, unknown>();
const st = { emBaixo: false, semDurar: false };

vi.mock("./app-state", () => ({
  getState: vi.fn(async (chave: string) => {
    if (st.emBaixo) throw new Error("app_state em baixo");
    return gaveta.get(chave) ?? null;
  }),
  setState: vi.fn(async (chave: string, valor: unknown) => {
    if (st.emBaixo) throw new Error("app_state em baixo");
    gaveta.set(chave, valor);
    return { gravado: true, duradouro: !st.semDurar, onde: "teste" };
  }),
}));

const {
  codigoNovo,
  pareceCodigoCurto,
  criarLigacaoCurta,
  lerLigacaoCurta,
  enderecoDaProposta,
  COMPRIMENTO_DO_CODIGO,
} = await import("./proposta-link-curto");
const { createProposalToken } = await import("./proposal-token");
const { SITE } = await import("./site");

/** Daqui a muito tempo — o prazo normal de um link. */
const AMANHA = () => new Date(Date.now() + 86_400_000);

beforeEach(() => {
  gaveta.clear();
  st.emBaixo = false;
  st.semDurar = false;
});

describe("o código", () => {
  it("tem o comprimento anunciado e só letras que não se confundem", () => {
    for (let i = 0; i < 200; i += 1) {
      const c = codigoNovo();
      expect(c).toHaveLength(COMPRIMENTO_DO_CODIGO);
      // Crockford: sem `i`, `l`, `o` nem `u`. O primeiro par confunde-se com o
      // um e com o zero ao telefone; o `u` sai para nenhum código soletrar uma
      // palavra que ela não queira ler em voz alta.
      expect(c).toMatch(/^[0-9a-hjkmnp-tv-z]+$/);
    }
  });

  it("não se repete", () => {
    const vistos = new Set(Array.from({ length: 500 }, () => codigoNovo()));
    expect(vistos.size).toBe(500);
  });

  it("um token assinado NUNCA passa por código curto — é o que separa as duas portas", () => {
    expect(pareceCodigoCurto(createProposalToken("p1"))).toBe(false);
    expect(pareceCodigoCurto("")).toBe(false);
    expect(pareceCodigoCurto("abc")).toBe(false);
    expect(pareceCodigoCurto("ABCDEFGH01234567")).toBe(false); // maiúsculas não
    expect(pareceCodigoCurto(codigoNovo())).toBe(true);
  });
});

describe("criar e ler", () => {
  it("o que se guarda é o que se lê", async () => {
    const codigo = await criarLigacaoCurta("prop-1", "ped-1", AMANHA());
    expect(codigo).not.toBeNull();
    expect(await lerLigacaoCurta(codigo!)).toEqual({ propostaId: "prop-1" });
  });

  it("um código que ninguém emitiu não abre nada", async () => {
    expect(await lerLigacaoCurta(codigoNovo())).toBeNull();
  });

  it("um código expirado não abre — e não diz que expirou", async () => {
    const codigo = await criarLigacaoCurta("prop-1", "ped-1", new Date(Date.now() - 1000));
    // A mesma resposta de um código inventado, de propósito: distinguir só
    // ajudaria quem estivesse a adivinhar endereços.
    expect(await lerLigacaoCurta(codigo!)).toBeNull();
  });

  it("um código cortado não abre", async () => {
    const codigo = await criarLigacaoCurta("prop-1", "ped-1", AMANHA());
    const chave = `ligacao-proposta:${codigo}`;
    gaveta.set(chave, { ...(gaveta.get(chave) as object), revogadaEm: new Date().toISOString() });
    expect(await lerLigacaoCurta(codigo!)).toBeNull();
  });

  it("sem sítio DURADOURO onde guardar, prefere não haver código", async () => {
    // Um link que desaparece com o processo é pior do que um link comprido: o
    // casal carrega nele daí a uma semana e não abre nada.
    st.semDurar = true;
    expect(await criarLigacaoCurta("prop-1", "ped-1", AMANHA())).toBeNull();
  });

  it("uma proposta sem identificador não gera código nenhum", async () => {
    expect(await criarLigacaoCurta("  ", "ped-1", AMANHA())).toBeNull();
  });
});

describe("o endereço que vai no email", () => {
  it("é curto", async () => {
    const url = await enderecoDaProposta("prop-1", "ped-1");
    expect(url.startsWith(`${SITE.url}/proposta/`)).toBe(true);
    const cauda = url.slice(`${SITE.url}/proposta/`.length);
    expect(pareceCodigoCurto(cauda)).toBe(true);
    expect(await lerLigacaoCurta(cauda)).toEqual({ propostaId: "prop-1" });
  });

  /**
   * A REGRESSÃO QUE ISTO TRANCA.
   *
   * O estúdio pede o endereço em cada pré-visualização do email. Cunhar um
   * código novo de cada vez deixava uma proposta com uma dúzia de endereços
   * válidos — todos a apontar ao mesmo sítio, e nenhum possível de cortar sem
   * deixar os outros abertos. Uma proposta, um endereço.
   */
  it("e é SEMPRE o mesmo para a mesma proposta", async () => {
    const um = await enderecoDaProposta("prop-1", "ped-1");
    const dois = await enderecoDaProposta("prop-1", "ped-1");
    const tres = await enderecoDaProposta("prop-1", "ped-1");
    expect(dois).toBe(um);
    expect(tres).toBe(um);
    // E nada de gavetas a mais: uma para o código, uma para o caminho inverso.
    expect([...gaveta.keys()].filter((k) => k.startsWith("ligacao-proposta:"))).toHaveLength(1);
  });

  it("propostas diferentes têm endereços diferentes", async () => {
    expect(await enderecoDaProposta("prop-1", "ped-1")).not.toBe(
      await enderecoDaProposta("prop-2", "ped-1"),
    );
  });

  /**
   * O ARMAZENAMENTO EM BAIXO NÃO PODE PARAR UM ENVIO.
   *
   * O casal fica com um link comprido, que é feio. A alternativa era ficar sem
   * link nenhum, que é um negócio parado.
   */
  it("com o armazenamento em baixo, sai o token assinado e o envio acontece", async () => {
    st.emBaixo = true;
    const url = await enderecoDaProposta("prop-1", "ped-1");
    const cauda = url.slice(`${SITE.url}/proposta/`.length);
    expect(pareceCodigoCurto(cauda)).toBe(false);
    expect(cauda.length).toBeGreaterThan(50);
  });

  it("um código cortado não volta a nascer sozinho no envio seguinte", async () => {
    const url = await enderecoDaProposta("prop-1", "ped-1");
    const codigo = url.slice(`${SITE.url}/proposta/`.length);
    const chave = `ligacao-proposta:${codigo}`;
    gaveta.set(chave, { ...(gaveta.get(chave) as object), revogadaEm: new Date().toISOString() });

    // Cunha-se outro — o que NÃO acontece é o cortado voltar a abrir.
    const segundo = await enderecoDaProposta("prop-1", "ped-1");
    expect(segundo).not.toBe(url);
    expect(await lerLigacaoCurta(codigo)).toBeNull();
  });
});
