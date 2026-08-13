import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enderecoDoDeepL,
  haTraducaoAutomatica,
  motorConfigurado,
  motorDeepL,
} from "./proposal-traducao-deepl";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOTOR, ATRÁS DA FRONTEIRA — E SEM TOCAR NA REDE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O serviço é o DeepL. Estes testes não falam com ele: o `fetch` entra por
 * parâmetro e o que corre aqui é um duplo. A prova contra o servidor verdadeiro
 * fica para o `deploy` — dentro deste contentor o `api-free.deepl.com` está
 * bloqueado, e uma suite que dependa da rede é uma suite que falha por a rede
 * estar em baixo.
 *
 * ── A CHAVE NÃO APARECE AQUI ──────────────────────────────────────────────
 * Nem inteira, nem em prefixo, nem em comentário. As chaves destes testes são
 * inventadas e só têm de ter a FORMA que decide o endereço.
 */

const CHAVE_GRATUITA = "chave-de-teste:fx";
const CHAVE_PAGA = "chave-de-teste-sem-sufixo";

/** Um `fetch` de mentira que responde o que lhe mandarem responder. */
function fetchFalso(responder: (url: string, init?: RequestInit) => Response) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    responder(String(input), init),
  ) as unknown as typeof fetch;
}

const respostaComTextos = (textos: string[]) =>
  ({
    ok: true,
    status: 200,
    json: async () => ({ translations: textos.map((text) => ({ text })) }),
  }) as unknown as Response;

const respostaComEstado = (status: number) =>
  ({ ok: false, status, json: async () => ({}) }) as unknown as Response;

describe("o endereço sai do SUFIXO da chave", () => {
  it("uma chave `:fx` é do plano gratuito", () => {
    // Pelo sufixo e não por uma variável de ambiente a mais: uma variável a mais
    // é uma variável para pôr errada, e o sintoma seria um 403 que ninguém
    // relaciona com o endereço.
    expect(enderecoDoDeepL(CHAVE_GRATUITA)).toBe("https://api-free.deepl.com/v2/translate");
  });

  it("uma chave sem `:fx` fala com o serviço pago", () => {
    expect(enderecoDoDeepL(CHAVE_PAGA)).toBe("https://api.deepl.com/v2/translate");
  });
});

describe("motorDeepL", () => {
  it("manda os textos EM LOTE e devolve-os pela mesma ordem", async () => {
    // Um pedido por campo eram dezenas de idas à rede numa proposta cheia — e a
    // ordem teria de ser reconstruída à mão, que é exactamente onde uma
    // tradução acaba no campo errado.
    const buscar = fetchFalso(() =>
      respostaComTextos(["Ceremony Decor", "Cocktail Decor", "Dinner Decor"]),
    );
    const motor = motorDeepL(CHAVE_GRATUITA, buscar);
    const saida = await motor(["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"]);
    expect(saida).toEqual(["Ceremony Decor", "Cocktail Decor", "Dinner Decor"]);
    expect(buscar).toHaveBeenCalledTimes(1);
  });

  it("fala português europeu para inglês britânico, com a chave no cabeçalho", async () => {
    const buscar = fetchFalso(() => respostaComTextos(["Ceremony Decor"]));
    await motorDeepL(CHAVE_GRATUITA, buscar)(["Decor Cerimónia"]);
    const [[url, init]] = (buscar as unknown as { mock: { calls: [string, RequestInit][] } }).mock
      .calls;
    expect(url).toBe("https://api-free.deepl.com/v2/translate");
    const cabecalhos = init.headers as Record<string, string>;
    expect(cabecalhos.Authorization).toBe(`DeepL-Auth-Key ${CHAVE_GRATUITA}`);
    const corpo = JSON.parse(String(init.body));
    expect(corpo.source_lang).toBe("PT");
    // «EN» sozinho está descontinuado, e a Líquen é europeia.
    expect(corpo.target_lang).toBe("EN-GB");
    expect(corpo.text).toEqual(["Decor Cerimónia"]);
    // Os campos da proposta são texto simples: sem `tag_handling`, um «<» que
    // ela escreva não passa a ser uma etiqueta.
    expect(corpo.tag_handling).toBeUndefined();
  });

  it("uma resposta com um número de textos diferente é recusada", async () => {
    // A fronteira já recusa o desalinhamento; recusá-lo TAMBÉM aqui é dizer o
    // que se passou com o nome certo, em vez de deixar a contagem falhar mais
    // à frente sem se saber de onde veio.
    const buscar = fetchFalso(() => respostaComTextos(["Ceremony Decor"]));
    await expect(
      motorDeepL(CHAVE_GRATUITA, buscar)(["Decor Cerimónia", "Decor Cocktail"]),
    ).rejects.toThrow(/1 traduç(ão|ões) para 2 textos/i);
  });

  it("uma lista vazia nem chega a pedir nada", async () => {
    const buscar = fetchFalso(() => respostaComTextos([]));
    expect(await motorDeepL(CHAVE_GRATUITA, buscar)([])).toEqual([]);
    expect(buscar).not.toHaveBeenCalled();
  });

  describe("o que o painel lê quando corre mal", () => {
    it("456 — a quota do mês acabou, dito em português", async () => {
      const buscar = fetchFalso(() => respostaComEstado(456));
      await expect(motorDeepL(CHAVE_GRATUITA, buscar)(["Decor"])).rejects.toThrow(/quota/i);
    });

    it("403 — a chave foi recusada", async () => {
      const buscar = fetchFalso(() => respostaComEstado(403));
      await expect(motorDeepL(CHAVE_GRATUITA, buscar)(["Decor"])).rejects.toThrow(/recusad/i);
    });

    it("429 — pedidos a mais, tenta daqui a pouco", async () => {
      const buscar = fetchFalso(() => respostaComEstado(429));
      await expect(motorDeepL(CHAVE_GRATUITA, buscar)(["Decor"])).rejects.toThrow(/pedidos/i);
    });

    it("um estado que não conhecemos diz o número e não inventa uma explicação", async () => {
      const buscar = fetchFalso(() => respostaComEstado(500));
      await expect(motorDeepL(CHAVE_GRATUITA, buscar)(["Decor"])).rejects.toThrow(/500/);
    });

    /**
     * ────────────────────────────────────────────────────────────────────────
     * A CHAVE NÃO SAI NA MENSAGEM — E ESTE TESTE OLHA MESMO PARA ELA
     * ────────────────────────────────────────────────────────────────────────
     *
     * A primeira versão deste teste dizia
     * `rejects.toThrow(expect.not.stringContaining("fx"))`, e não afirmava nada:
     * o `toThrow` recebe um texto, uma expressão regular, um erro ou um
     * construtor — um comparador assimétrico não é nenhuma dessas coisas, e o
     * teste passava com a chave inteira dentro da mensagem. Foi apanhado a
     * sabotar o módulo de propósito: acrescentei `(chave ${chave})` ao erro e os
     * catorze testes continuaram verdes.
     *
     * Portanto agora apanha-se o erro e lê-se a mensagem, em TODOS os caminhos
     * que atiram — não só no 403. E procura-se a chave inteira e o sufixo: um
     * prefixo de chave num registo é uma chave meio publicada, e o registo do
     * servidor é lido por gente que não é a dona da chave.
     */
    it("a mensagem do erro NUNCA leva a chave lá dentro, venha o erro de onde vier", async () => {
      const falhas: Array<[string, () => Promise<unknown>]> = [
        [
          "456",
          () =>
            motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => respostaComEstado(456)),
            )(["D"]),
        ],
        [
          "403",
          () =>
            motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => respostaComEstado(403)),
            )(["D"]),
        ],
        [
          "429",
          () =>
            motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => respostaComEstado(429)),
            )(["D"]),
        ],
        [
          "500",
          () =>
            motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => respostaComEstado(500)),
            )(["D"]),
        ],
        [
          "lote desalinhado",
          () =>
            motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => respostaComTextos([])),
            )(["D"]),
        ],
      ];

      for (const [caminho, correr] of falhas) {
        const erro = await correr().then(
          () => null,
          (e: unknown) => e as Error,
        );
        expect(erro, `o caminho ${caminho} tinha de atirar`).not.toBeNull();
        const mensagem = String(erro?.message ?? "");
        expect(mensagem, `a chave saiu na mensagem do ${caminho}`).not.toContain(CHAVE_GRATUITA);
        expect(mensagem, `o sufixo da chave saiu na mensagem do ${caminho}`).not.toContain(":fx");
      }
    });
  });
});

describe("sem chave, a fronteira comporta-se como antes de haver serviço", () => {
  const antes = process.env.DEEPL_API_KEY;
  beforeEach(() => {
    delete process.env.DEEPL_API_KEY;
  });
  afterEach(() => {
    if (antes === undefined) delete process.env.DEEPL_API_KEY;
    else process.env.DEEPL_API_KEY = antes;
  });

  it("não há motor nenhum, e diz-se", () => {
    expect(motorConfigurado()).toBeNull();
    expect(haTraducaoAutomatica()).toBe(false);
  });

  it("uma chave só com espaços vale o mesmo que não haver chave", () => {
    process.env.DEEPL_API_KEY = "   ";
    expect(motorConfigurado()).toBeNull();
  });

  it("com chave, há motor", () => {
    process.env.DEEPL_API_KEY = CHAVE_GRATUITA;
    expect(motorConfigurado()).not.toBeNull();
    expect(haTraducaoAutomatica()).toBe(true);
  });
});
