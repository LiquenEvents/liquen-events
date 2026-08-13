import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  enderecoDoDeepL,
  enderecoDosGlossarios,
  esquecerGlossarios,
  GLOSSARIO_DA_CASA,
  haTraducaoAutomatica,
  motorConfigurado,
  motorDeepL,
  NOME_DO_GLOSSARIO,
  nomeDoGlossario,
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

/** Só os pedidos de TRADUÇÃO, com o corpo já lido. Os de glossário vão para o
 *  mesmo `fetch` e não têm nada que contar aqui. */
function pedidosDeTraducao(
  buscar: typeof fetch,
): { url: string; corpo: Record<string, unknown>; init: RequestInit }[] {
  const calls = (buscar as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
  return calls
    .filter(([url]) => url.endsWith("/translate"))
    .map(([url, init]) => ({
      url,
      init,
      corpo: JSON.parse(String(init.body)) as Record<string, unknown>,
    }));
}

/** Um `fetch` que traduz sempre, pondo «EN: » à frente — e conta os pedidos. */
function fetchQueTraduz(quando: (n: number, textos: string[]) => Response | null = () => null) {
  let n = 0;
  return fetchFalso((url, init) => {
    if (!url.endsWith("/translate")) return respostaComEstado(404);
    const textos = (JSON.parse(String(init?.body)) as { text: string[] }).text;
    const combinada = quando(n++, textos);
    return combinada ?? respostaComTextos(textos.map((t) => `EN: ${t}`));
  });
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GLOSSÁRIO DA CASA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas propostas da mesma casa não podem falar línguas diferentes: «Decoração
 * Cerimónia» tem de dar sempre a mesma coisa em inglês, na proposta de Maio e
 * na de Novembro. E «Quinta» não pode virar «Farm».
 *
 * Isto NÃO é a tabela caseira que o cabeçalho da fronteira proíbe: não
 * traduzimos nada aqui. A lista é mandada ao SERVIÇO, que a aplica dentro da
 * tradução dele — a gramática, a concordância e o resto da frase continuam a ser
 * dele. É a diferença entre dizer ao tradutor como a casa chama às coisas e
 * fazer de conta que somos o tradutor.
 */
describe("o glossário da casa", () => {
  const termo = (pt: string) =>
    GLOSSARIO_DA_CASA.find(([de]) => de.toLowerCase() === pt.toLowerCase());

  it("tem os termos do sector que não podem sair traduzidos à letra", () => {
    // A lista veio do que aparece MESMO nestas propostas (ver `orcamento/data.ts`
    // e as propostas de exemplo dos testes) cruzada com o vocabulário obrigatório
    // do sector. «Copo d'água» à letra é «water glass»; «cortejo» é «parade».
    for (const [pt, en] of [
      ["copo d'água", /reception/i],
      ["cerimónia civil", /civil ceremony/i],
      ["cortejo", /processional/i],
      ["mood board", /mood board/i],
      ["tablescape", /tablescape/i],
      ["welcome drinks", /welcome drinks/i],
      ["styling", /styling/i],
      ["passadeira", /aisle/i],
      ["cenografia", /set design/i],
    ] as const) {
      const achado = termo(pt);
      expect(achado, `falta «${pt}» no glossário`).toBeDefined();
      expect(achado![1]).toMatch(en);
    }
  });

  it("os nomes de sítio ficam como estão — é a defesa contra «Quinta» → «Farm»", () => {
    for (const nome of ["Quinta", "Herdade", "Monte", "Líquen"]) {
      const achado = termo(nome);
      expect(achado, `falta «${nome}» no glossário`).toBeDefined();
      expect(achado![1]).toBe(achado![0]);
    }
  });

  it("nenhuma entrada tem tabulações nem mudanças de linha", () => {
    // O formato é TSV. Uma tabulação dentro de um termo parte a linha em três
    // colunas e o serviço recusa o glossário inteiro — ou pior, aceita-o torto.
    for (const [pt, en] of GLOSSARIO_DA_CASA) {
      expect(pt.trim(), "um lado vazio não é uma entrada").not.toBe("");
      expect(en.trim()).not.toBe("");
      expect(`${pt}${en}`).not.toMatch(/[\t\r\n]/);
    }
  });

  it("nenhum termo português está repetido", () => {
    // Duas entradas para o mesmo termo é o serviço a escolher uma delas, e a
    // consistência era exactamente o que se veio aqui buscar.
    const vistos = GLOSSARIO_DA_CASA.map(([pt]) => pt.toLowerCase());
    expect(new Set(vistos).size).toBe(vistos.length);
  });

  /**
   * ── O NOME LEVA UMA MARCA DA LISTA, E NÃO É ENFEITE ──────────────────────
   *
   * Um glossário do DeepL não se edita: cria-se. Se a lista mudar aqui e o nome
   * ficar igual, o servidor continua a encontrar o glossário VELHO na conta e a
   * casa passa a ter duas propostas com vocabulários diferentes — que é o
   * defeito que o glossário existe para não haver. A marca sai da própria lista,
   * portanto ninguém se pode esquecer de a mudar.
   */
  it("mudar uma entrada muda o nome do glossário", () => {
    const a = nomeDoGlossario([["quinta", "quinta"]]);
    const b = nomeDoGlossario([["quinta", "farm"]]);
    expect(a).not.toBe(b);
    expect(NOME_DO_GLOSSARIO).toBe(nomeDoGlossario(GLOSSARIO_DA_CASA));
  });

  it("o nome não leva nada da chave lá dentro", () => {
    expect(NOME_DO_GLOSSARIO).not.toContain(":fx");
    expect(NOME_DO_GLOSSARIO).not.toContain(CHAVE_GRATUITA);
  });
});

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
  // Cada teste começa sem nada sabido sobre o glossário: o identificador fica
  // guardado por servidor, e um teste a herdar o glossário de outro seria um
  // teste a provar o que não correu.
  beforeEach(() => esquecerGlossarios());

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
    expect(pedidosDeTraducao(buscar)).toHaveLength(1);
  });

  it("fala português europeu para inglês britânico, com a chave no cabeçalho", async () => {
    const buscar = fetchFalso(() => respostaComTextos(["Ceremony Decor"]));
    await motorDeepL(CHAVE_GRATUITA, buscar)(["Decor Cerimónia"]);
    const [{ url, init }] = pedidosDeTraducao(buscar);
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UM LOTE GRANDE PARTE-SE — E A ORDEM É O QUE NÃO SE PODE PERDER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O DeepL aceita 50 textos por pedido. Uma proposta cheia — meia dúzia de
   * grupos com descrições, os mood boards, as rubricas todas — passa disso com
   * facilidade, e o pedido inteiro voltaria recusado. Parte-se em lotes, pela
   * ordem, e as respostas voltam a juntar-se pela ordem: é a mesma disciplina
   * que a fronteira exige, aplicada dentro de uma chamada só.
   */
  describe("lotes grandes", () => {
    const muitos = (n: number) => Array.from({ length: n }, (_, i) => `Rubrica ${i + 1}`);

    it("120 textos vão em três pedidos de 50, 50 e 20 — e voltam pela ordem", async () => {
      const buscar = fetchQueTraduz();
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(muitos(120));
      const pedidos = pedidosDeTraducao(buscar);
      expect(pedidos.map((p) => (p.corpo.text as string[]).length)).toEqual([50, 50, 20]);
      expect(saida).toHaveLength(120);
      expect(saida[0]).toBe("EN: Rubrica 1");
      expect(saida[49]).toBe("EN: Rubrica 50");
      expect(saida[50]).toBe("EN: Rubrica 51");
      expect(saida[119]).toBe("EN: Rubrica 120");
    });

    it("um lote com muitos caracteres parte-se também", async () => {
      // O tecto do DeepL não é só o número de textos: o corpo do pedido tem
      // limite. Dois textos de 15 000 caracteres não cabem no mesmo.
      const buscar = fetchQueTraduz();
      await motorDeepL(CHAVE_GRATUITA, buscar)(["a".repeat(15_000), "b".repeat(15_000)]);
      expect(pedidosDeTraducao(buscar)).toHaveLength(2);
    });

    it("um texto sozinho maior do que o tecto vai à mesma — não se perde", async () => {
      // Cortá-lo seria devolver meia frase; deixá-lo de fora seria devolver
      // menos textos do que os pedidos, que é o desalinhamento. Vai sozinho e o
      // serviço que decida.
      const buscar = fetchQueTraduz();
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(["x".repeat(40_000), "curto"]);
      expect(saida).toHaveLength(2);
      expect(saida[1]).toBe("EN: curto");
      expect(pedidosDeTraducao(buscar)).toHaveLength(2);
    });

    /**
     * ── UMA FALHA A MEIO NÃO DEITA FORA O QUE JÁ VEIO ────────────────────────
     *
     * O lote que falhou volta VAZIO nas suas posições, e a fronteira já sabe o
     * que fazer com uma posição vazia: fica por traduzir, cai para o português
     * no papel, e continua a contar como falta no painel «Por traduzir». Ou
     * seja: sabe-se exactamente quais ficaram por traduzir, e a carregada
     * seguinte manda só esses — o que já veio não se paga duas vezes.
     *
     * O alinhamento não corre risco nenhum: cada lote é um pedido seu, com o seu
     * próprio array de textos e o seu próprio array de respostas.
     */
    it("um lote que falha volta vazio; os outros voltam traduzidos", async () => {
      const buscar = fetchQueTraduz((n) => (n === 1 ? respostaComEstado(500) : null));
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(muitos(120));
      expect(saida).toHaveLength(120);
      expect(saida[0]).toBe("EN: Rubrica 1");
      expect(saida.slice(50, 100).every((t) => t === "")).toBe(true);
      expect(saida[100]).toBe("EN: Rubrica 101");
    });

    it("um lote que vem desalinhado só se perde a si próprio", async () => {
      const buscar = fetchQueTraduz((n, textos) =>
        n === 0 ? respostaComTextos(textos.slice(0, 3)) : null,
      );
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(muitos(60));
      expect(saida.slice(0, 50).every((t) => t === "")).toBe(true);
      expect(saida[50]).toBe("EN: Rubrica 51");
    });

    it("se NENHUM lote passar, atira — para o painel poder dizer porquê", async () => {
      // Devolver 120 vazios seria «traduzi zero campos» sem uma palavra sobre o
      // que se passou. A frase é a única coisa que ela tem para agir.
      const buscar = fetchQueTraduz(() => respostaComEstado(500));
      await expect(motorDeepL(CHAVE_GRATUITA, buscar)(muitos(120))).rejects.toThrow(/500/);
    });

    it("a quota acabada pára os lotes seguintes em vez de os gastar", async () => {
      // 456 é definitivo: os lotes a seguir iam falhar exactamente da mesma
      // maneira. Insistir seria bater cinco vezes à porta fechada.
      const buscar = fetchQueTraduz(() => respostaComEstado(456));
      await expect(motorDeepL(CHAVE_GRATUITA, buscar)(muitos(120))).rejects.toThrow(/quota/i);
      expect(pedidosDeTraducao(buscar)).toHaveLength(1);
    });
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O GLOSSÁRIO, NA PRÁTICA — E O QUE ACONTECE QUANDO NÃO DÁ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Custo em pedidos: DOIS, uma vez por servidor (um `GET` a listar, um `POST` a
   * criar) — e nenhum deles gasta caracteres da quota, que é o que se paga. A
   * partir daí o identificador fica guardado e as traduções seguintes não voltam
   * a perguntar nada.
   *
   * E se não der? Traduz-se à mesma, sem glossário. Uma tradução inteira a
   * falhar porque a conta não aceitou uma lista de quarenta palavras seria trocar
   * um problema de vocabulário por um problema de serviço.
   */
  describe("o glossário do serviço", () => {
    beforeEach(() => esquecerGlossarios());
    afterEach(() => esquecerGlossarios());

    type Glossario = { glossary_id: string; name: string; ready?: boolean };
    const respostaJson = (corpo: unknown) =>
      ({ ok: true, status: 200, json: async () => corpo }) as unknown as Response;

    function servidor(
      opcoes: {
        lista?: Glossario[] | "recusa" | "rebenta";
        criacao?: "recusa";
        traduzir?: (n: number, corpo: Record<string, unknown>) => Response | null;
      } = {},
    ) {
      let n = 0;
      return fetchFalso((url, init) => {
        const metodo = (init?.method ?? "GET").toUpperCase();
        if (url.endsWith("/glossaries")) {
          if (metodo === "GET") {
            if (opcoes.lista === "recusa") return respostaComEstado(500);
            if (opcoes.lista === "rebenta") throw new Error("sem rede");
            return respostaJson({ glossaries: opcoes.lista ?? [] });
          }
          if (opcoes.criacao === "recusa") return respostaComEstado(400);
          return respostaJson({ glossary_id: "gl-novo", name: NOME_DO_GLOSSARIO, ready: true });
        }
        const corpo = JSON.parse(String(init?.body)) as Record<string, unknown>;
        const forcado = opcoes.traduzir?.(n++, corpo);
        return forcado ?? respostaComTextos((corpo.text as string[]).map((t) => `EN: ${t}`));
      });
    }

    const pedidosDeGlossario = (buscar: typeof fetch) =>
      (buscar as unknown as { mock: { calls: [string, RequestInit | undefined][] } }).mock.calls
        .filter(([url]) => url.endsWith("/glossaries"))
        .map(([url, init]) => ({ url, metodo: (init?.method ?? "GET").toUpperCase(), init }));

    it("à primeira tradução procura o glossário, cria-o, e usa-o", async () => {
      const buscar = servidor();
      await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(pedidosDeGlossario(buscar).map((p) => p.metodo)).toEqual(["GET", "POST"]);
      expect(pedidosDeTraducao(buscar)[0].corpo.glossary_id).toBe("gl-novo");
    });

    it("o glossário vai em TSV, de `pt` para `en`, com o nome da casa", async () => {
      const buscar = servidor();
      await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      const criacao = pedidosDeGlossario(buscar).find((p) => p.metodo === "POST")!;
      expect(criacao.url).toBe("https://api-free.deepl.com/v2/glossaries");
      const corpo = JSON.parse(String(criacao.init!.body)) as Record<string, string>;
      expect(corpo.name).toBe(NOME_DO_GLOSSARIO);
      // Os glossários falam em códigos de duas letras: não há `EN-GB` aqui.
      expect(corpo.source_lang).toBe("pt");
      expect(corpo.target_lang).toBe("en");
      expect(corpo.entries_format).toBe("tsv");
      expect(corpo.entries).toContain("Quinta\tQuinta");
      // E o cabeçalho é o mesmo dos outros pedidos.
      expect((criacao.init!.headers as Record<string, string>).Authorization).toBe(
        `DeepL-Auth-Key ${CHAVE_GRATUITA}`,
      );
    });

    it("se o glossário já existir na conta, usa-se esse e não se cria outro", async () => {
      const buscar = servidor({
        lista: [{ glossary_id: "gl-antigo", name: NOME_DO_GLOSSARIO, ready: true }],
      });
      await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(pedidosDeGlossario(buscar).map((p) => p.metodo)).toEqual(["GET"]);
      expect(pedidosDeTraducao(buscar)[0].corpo.glossary_id).toBe("gl-antigo");
    });

    it("um glossário com outro nome não serve — a lista mudou, o nome mudou", async () => {
      const buscar = servidor({
        lista: [{ glossary_id: "gl-de-outra-versao", name: "liquen-velho", ready: true }],
      });
      await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(pedidosDeTraducao(buscar)[0].corpo.glossary_id).toBe("gl-novo");
    });

    it("um glossário que o serviço ainda não preparou não se usa já", async () => {
      const buscar = servidor({
        lista: [{ glossary_id: "gl-a-cozer", name: NOME_DO_GLOSSARIO, ready: false }],
      });
      await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(pedidosDeTraducao(buscar)[0].corpo.glossary_id).toBeUndefined();
      // E não se guarda a resposta: à próxima já lá está pronto.
      expect(pedidosDeGlossario(buscar).map((p) => p.metodo)).toEqual(["GET"]);
      await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cocktail"]);
      expect(pedidosDeGlossario(buscar).map((p) => p.metodo)).toEqual(["GET", "GET"]);
    });

    it("a segunda tradução não volta a perguntar pelo glossário", async () => {
      const buscar = servidor();
      const motor = motorDeepL(CHAVE_GRATUITA, buscar);
      await motor(["Decoração Cerimónia"]);
      await motor(["Decoração Cocktail"]);
      expect(pedidosDeGlossario(buscar)).toHaveLength(2); // o GET e o POST da primeira
      expect(pedidosDeTraducao(buscar)).toHaveLength(2);
      expect(pedidosDeTraducao(buscar)[1].corpo.glossary_id).toBe("gl-novo");
    });

    it("uma lista vazia de textos não vai buscar glossário nenhum", async () => {
      const buscar = servidor();
      expect(await motorDeepL(CHAVE_GRATUITA, buscar)([])).toEqual([]);
      expect(pedidosDeGlossario(buscar)).toHaveLength(0);
    });

    it("o serviço a recusar a LISTA não estraga a tradução", async () => {
      const buscar = servidor({ lista: "recusa" });
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(saida).toEqual(["EN: Decoração Cerimónia"]);
      expect(pedidosDeTraducao(buscar)[0].corpo.glossary_id).toBeUndefined();
      // E não se tenta criar às cegas: se a conta não deixa listar, também não
      // deixa criar, e era um segundo pedido a bater na mesma porta.
      expect(pedidosDeGlossario(buscar).map((p) => p.metodo)).toEqual(["GET"]);
    });

    it("o serviço a recusar a CRIAÇÃO não estraga a tradução", async () => {
      // Um plano sem glossários, um par de línguas que o serviço não suporte, um
      // tecto de glossários atingido — nenhum desses pode deixar a proposta por
      // traduzir.
      const buscar = servidor({ criacao: "recusa" });
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(saida).toEqual(["EN: Decoração Cerimónia"]);
      expect(pedidosDeTraducao(buscar)[0].corpo.glossary_id).toBeUndefined();
    });

    it("a rede a cair a meio do glossário não estraga a tradução", async () => {
      const buscar = servidor({ lista: "rebenta" });
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(saida).toEqual(["EN: Decoração Cerimónia"]);
    });

    /**
     * ── O GLOSSÁRIO QUE DESAPARECEU DA CONTA ────────────────────────────────
     *
     * Alguém apaga o glossário no painel do DeepL; o identificador que temos
     * guardado deixa de existir e o serviço responde 400 a TODAS as traduções.
     * Sem isto, a tradução ficava partida até o servidor reiniciar — e a causa
     * («apaguei uma coisa no site do DeepL») não estaria ao alcance de ninguém.
     */
    it("um glossário que já não existe: repete-se o pedido sem ele", async () => {
      const buscar = servidor({
        lista: [{ glossary_id: "gl-apagado", name: NOME_DO_GLOSSARIO, ready: true }],
        traduzir: (_n, corpo) => (corpo.glossary_id ? respostaComEstado(400) : null),
      });
      const saida = await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
      expect(saida).toEqual(["EN: Decoração Cerimónia"]);
      const pedidos = pedidosDeTraducao(buscar);
      expect(pedidos).toHaveLength(2);
      expect(pedidos[1].corpo.glossary_id).toBeUndefined();
    });

    it("e os lotes seguintes já vão sem ele — não se insiste lote a lote", async () => {
      const buscar = servidor({
        lista: [{ glossary_id: "gl-apagado", name: NOME_DO_GLOSSARIO, ready: true }],
        traduzir: (_n, corpo) => (corpo.glossary_id ? respostaComEstado(400) : null),
      });
      const saida = await motorDeepL(
        CHAVE_GRATUITA,
        buscar,
      )(Array.from({ length: 120 }, (_, i) => `Rubrica ${i + 1}`));
      expect(saida).toHaveLength(120);
      expect(saida.every((t) => t.startsWith("EN: "))).toBe(true);
      // 3 lotes + a repetição do primeiro, e mais nenhuma.
      expect(pedidosDeTraducao(buscar)).toHaveLength(4);
    });

    it("o endereço dos glossários acompanha o da tradução", () => {
      expect(enderecoDosGlossarios(CHAVE_GRATUITA)).toBe(
        "https://api-free.deepl.com/v2/glossaries",
      );
      expect(enderecoDosGlossarios(CHAVE_PAGA)).toBe("https://api.deepl.com/v2/glossaries");
    });
  });

  /**
   * ── O REGISTO: PORQUE É QUE NÃO VAI AQUI `formality` ──────────────────────
   *
   * Ver o cabeçalho do módulo. Em resumo: o DeepL só aceita `formality` para os
   * idiomas de destino que têm tratamento formal gramatical — alemão, francês,
   * espanhol, italiano, neerlandês, polaco, português, japonês, russo. O inglês
   * não é um deles. Mandá-lo é, na melhor das hipóteses, um parâmetro ignorado;
   * na pior, um 400 que fazia a proposta inteira ficar por traduzir por causa de
   * um pedido de cortesia. O registo de um casal britânico decide-se no
   * vocabulário — é para isso que o glossário está ali em cima.
   */
  it("`formality` não vai no pedido — o DeepL não o aceita para inglês", async () => {
    const buscar = fetchQueTraduz();
    await motorDeepL(CHAVE_GRATUITA, buscar)(["Decoração Cerimónia"]);
    expect(pedidosDeTraducao(buscar)[0].corpo.formality).toBeUndefined();
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
        // ── Caminhos que nasceram com os lotes e com o glossário ──────────
        [
          "todos os lotes falharam",
          () => {
            esquecerGlossarios();
            return motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => respostaComEstado(500)),
            )(Array.from({ length: 120 }, (_, i) => `D${i}`));
          },
        ],
        [
          "o `fetch` a rebentar",
          () => {
            esquecerGlossarios();
            return motorDeepL(
              CHAVE_GRATUITA,
              fetchFalso(() => {
                // Uma mensagem de rede com o endereço lá dentro é o sítio mais
                // provável para a chave escorregar, se algum dia alguém a puser
                // na query string em vez do cabeçalho.
                throw new Error(`falhou o pedido a ${enderecoDoDeepL(CHAVE_GRATUITA)}`);
              }),
            )(["D"]);
          },
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
