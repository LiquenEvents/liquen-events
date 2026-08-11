import { describe, it, expect } from "vitest";
import {
  PAGINA_H,
  PAGINA_M,
  PAGINA_W,
  caixasDoMoodboard,
  layoutSugerido,
  type CaixaPdf,
} from "./proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE FAZ AS PÁGINAS ANTIGAS: CADA FOTO COM A FORMA QUE TEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A proposta da Mariana e do João tem dez fotos numa página, em duas filas.
 * Dentro de cada fila todas têm a MESMA ALTURA e larguras diferentes — e é isso
 * que dá o ritmo. O gerador recortava tudo a células iguais, e o resultado lia-se
 * como uma tabela.
 *
 * Estes testes verificam as duas metades da frase «orgânico mas ordenado», que
 * é fácil de dizer e fácil de partir: **as formas variam** (o aspecto de cada
 * foto é respeitado) e **as linhas são rigorosas** (dentro de uma fila, mesma
 * altura e mesma base; a fila cheia de margem a margem).
 */

const AREA = {
  esq: PAGINA_M,
  dir: PAGINA_W - PAGINA_M,
  topo: PAGINA_H - PAGINA_M - 112,
  base: PAGINA_M + 8,
};

/** Fotos com formas bem diferentes — verticais e deitadas, como as reais. */
const VARIADAS = [1.5, 0.75, 1.33, 0.8, 1.78, 1.0, 0.67, 1.5, 1.2, 0.9];

function dentroDaArea(c: CaixaPdf) {
  const folga = 0.01;
  return (
    c.x >= AREA.esq - folga &&
    c.x + c.w <= AREA.dir + folga &&
    c.y >= AREA.base - folga &&
    c.y + c.h <= AREA.topo + folga &&
    c.w > 0 &&
    c.h > 0
  );
}

function sobrepoem(a: CaixaPdf, b: CaixaPdf) {
  const folga = 0.01;
  return (
    a.x + a.w > b.x + folga &&
    b.x + b.w > a.x + folga &&
    a.y + a.h > b.y + folga &&
    b.y + b.h > a.y + folga
  );
}

const LAYOUTS = ["filas", "fila-unica", "mosaico", "destaque", "texto-e-imagem"] as const;

describe("as caixas de um mood board", () => {
  it("dá uma caixa por foto, dentro da página e sem sobreposições", () => {
    for (const layout of LAYOUTS) {
      // O «texto e imagem» é, por definição, uma foto só.
      const fotos = layout === "texto-e-imagem" ? VARIADAS.slice(0, 1) : VARIADAS;
      for (let n = 1; n <= fotos.length; n++) {
        const aspectos = fotos.slice(0, n);
        const caixas = caixasDoMoodboard(layout, aspectos);
        expect(caixas, `${layout} com ${n} fotos`).toHaveLength(n);
        for (const c of caixas) {
          expect(dentroDaArea(c), `${layout}/${n}: caixa fora da mancha ${JSON.stringify(c)}`).toBe(
            true,
          );
        }
        for (let i = 0; i < caixas.length; i++) {
          for (let j = i + 1; j < caixas.length; j++) {
            expect(sobrepoem(caixas[i], caixas[j]), `${layout}/${n}: ${i} sobre ${j}`).toBe(false);
          }
        }
      }
    }
  });

  /**
   * A metade «orgânica»: uma foto vertical sai vertical. Era isto que a grelha
   * de células iguais deitava fora, e é a diferença entre uma página de
   * inspiração e uma folha de contactos.
   */
  it("respeita a forma de cada foto nas filas", () => {
    const caixas = caixasDoMoodboard("filas", VARIADAS);
    caixas.forEach((c, i) => {
      expect(c.w / c.h).toBeCloseTo(VARIADAS[i], 2);
    });
  });

  /**
   * A metade «ordenada»: dentro de uma fila, todas as fotos assentam na mesma
   * linha e têm a mesma altura. É o que se vê na página das mesas de jantar, e
   * é o que distingue isto de fotografias espalhadas.
   */
  it("dentro de uma fila, mesma altura e mesma base", () => {
    const caixas = caixasDoMoodboard("filas", VARIADAS); // 10 fotos ⇒ 2 filas de 5
    const cima = caixas.slice(0, 5);
    const baixo = caixas.slice(5);
    for (const fila of [cima, baixo]) {
      for (const c of fila) {
        expect(c.h).toBeCloseTo(fila[0].h, 6);
        expect(c.y).toBeCloseTo(fila[0].y, 6);
      }
    }
    // E as duas filas são filas diferentes — se ficassem à mesma altura, isto
    // não eram filas, era uma só.
    expect(cima[0].y).toBeGreaterThan(baixo[0].y);
  });

  it("cada fila vai de margem a margem", () => {
    const caixas = caixasDoMoodboard("filas", VARIADAS);
    for (const fila of [caixas.slice(0, 5), caixas.slice(5)]) {
      expect(fila[0].x).toBeCloseTo(AREA.esq, 6);
      const ultima = fila[fila.length - 1];
      expect(ultima.x + ultima.w).toBeCloseTo(AREA.dir, 6);
    }
  });

  /**
   * A altura NÃO se estica para encher a página, e é de propósito: a largura de
   * cada foto é `aspecto × altura`, portanto esticar a altura esticava também a
   * largura e as filas passavam a mancha (foi assim que a primeira versão disto
   * saía 267 pontos para fora da página). O bloco encosta ao topo e o que sobrar
   * fica em branco em baixo — é o que a página das mesas de jantar da proposta
   * antiga faz, e fica melhor assim do que esticada.
   */
  it("o bloco encosta ao topo e nunca passa a base", () => {
    const caixas = caixasDoMoodboard("filas", VARIADAS);
    expect(Math.max(...caixas.map((c) => c.y + c.h))).toBeCloseTo(AREA.topo, 4);
    expect(Math.min(...caixas.map((c) => c.y))).toBeGreaterThanOrEqual(AREA.base - 0.01);
  });

  /**
   * Quando as fotos são tantas que o bloco não cabe, encolhe-se TUDO pelo mesmo
   * factor — nenhuma foto pode mudar de forma para caber — e a mancha, ficando
   * mais estreita, centra-se em vez de encostar a uma margem.
   */
  it("não cabendo, encolhe por igual e centra-se", () => {
    const muitas = Array.from({ length: 18 }, (_, i) => VARIADAS[i % VARIADAS.length]);
    const caixas = caixasDoMoodboard("fila-unica", muitas);
    caixas.forEach((c, i) => expect(c.w / c.h).toBeCloseTo(muitas[i], 2));
    const esq = Math.min(...caixas.map((c) => c.x));
    const dir = Math.max(...caixas.map((c) => c.x + c.w));
    expect(esq - AREA.esq).toBeCloseTo(AREA.dir - dir, 4);
  });

  /**
   * O mosaico é o único que corta as fotos, e é deliberado: é a composição da
   * página do Decor Mesa Buffet, onde o que manda é o desenho da página. O que
   * NÃO pode é sair desalinhado — as arestas têm de cair todas na mesma grelha
   * fina, senão lê-se como um erro em vez de uma composição.
   */
  it("no mosaico, as arestas caem todas na mesma grelha", () => {
    const caixas = caixasDoMoodboard("mosaico", VARIADAS.slice(0, 6));
    const passoX = (PAGINA_W - 2 * PAGINA_M + 8) / 12;
    const naGrelha = (v: number, passo: number, origem: number) => {
      const k = (v - origem) / passo;
      return Math.abs(k - Math.round(k)) < 0.001;
    };
    for (const c of caixas) {
      expect(naGrelha(c.x, passoX, AREA.esq), `x=${c.x} fora da grelha`).toBe(true);
    }
  });

  it("é sempre igual para as mesmas fotos — a pré-visualização não pode mentir", () => {
    const a = caixasDoMoodboard("mosaico", VARIADAS.slice(0, 7));
    const b = caixasDoMoodboard("mosaico", VARIADAS.slice(0, 7));
    expect(a).toEqual(b);
  });

  /**
   * A descrição do mood board fica por baixo das fotos e pode ocupar até cinco
   * linhas. O espaço que ela pede sai das FOTOS, nunca da página: um bloco que
   * descesse por cima da anotação escrevia as duas coisas uma em cima da outra.
   *
   * Com dez fotos o bloco é baixo e cabe nos dois casos — daí a segunda metade
   * do teste, com fotos que cheguem para o obrigar a encolher. A primeira versão
   * disto comparava só o caso que cabia e passava sem provar nada.
   */
  it("a anotação mais alta encolhe o bloco, não o empurra para fora", () => {
    for (const nota of [8, 60]) {
      for (const c of caixasDoMoodboard("filas", VARIADAS, nota)) {
        expect(c.y).toBeGreaterThanOrEqual(PAGINA_M + nota - 0.01);
      }
    }
    // Um caso que NÃO cabe, para se ver a anotação a encolher mesmo: duas fotos
    // ao alto numa fila só ficam altíssimas — a fila enche a largura, e com
    // fotos verticais isso pede muito mais altura do que a página tem.
    const alturaCom = (nota: number) => {
      const c = caixasDoMoodboard("fila-unica", [0.67, 0.75], nota);
      return Math.max(...c.map((b) => b.y + b.h)) - Math.min(...c.map((b) => b.y));
    };
    expect(alturaCom(60)).toBeLessThan(alturaCom(8));
  });

  it("sugere um layout para qualquer número de fotos", () => {
    for (let n = 1; n <= 12; n++) {
      const layout = layoutSugerido(n);
      expect(LAYOUTS).toContain(layout);
      // A sugestão tem de servir mesmo: uma sugestão que não desenha as fotos
      // todas seria pior do que não sugerir nada.
      const aspectos = Array.from({ length: n }, (_, i) => VARIADAS[i % VARIADAS.length]);
      if (layout !== "texto-e-imagem") {
        expect(caixasDoMoodboard(layout, aspectos)).toHaveLength(n);
      }
    }
  });
});
