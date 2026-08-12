import { describe, it, expect } from "vitest";
import {
  LADO_MINIMO_DA_FOTO,
  OCUPACAO_MINIMA,
  PAGINA_H,
  PAGINA_M,
  PAGINA_W,
  caixasDoMoodboard,
  layoutSugerido,
  ocupacaoDoMoodboard,
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
   * saía 267 pontos para fora da página).
   *
   * O que sobra, sobra — mas sobra METADE EM CIMA E METADE EM BAIXO. Encostado
   * ao topo, o branco ia todo para o fim da folha: na página das «Lapelas
   * Noivo» da proposta da Tara e do Marty eram 226 pontos, oito centímetros de
   * folha vazia entre a última fotografia e o rodapé, e foi disso que ela se
   * queixou. Centrar é uma TRANSLAÇÃO: nenhuma caixa muda de tamanho nem de
   * forma, e nenhuma sai da mancha.
   */
  it("o bloco fica ao meio da folha, com o mesmo ar em cima e em baixo", () => {
    const caixas = caixasDoMoodboard("filas", VARIADAS);
    const topo = Math.max(...caixas.map((c) => c.y + c.h));
    const base = Math.min(...caixas.map((c) => c.y));
    expect(AREA.topo - topo).toBeCloseTo(base - AREA.base, 4);
    expect(base).toBeGreaterThanOrEqual(AREA.base - 0.01);
    expect(topo).toBeLessThanOrEqual(AREA.topo + 0.01);
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOLHA QUE FICAVA VAZIA — a regra dos 40%
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «A página das Lapelas Noivo tem cinco fotos pequenas no terço superior e dois
 * terços de folha vazios.» Medido nessa página, com as fotos reais da proposta
 * da Tara e do Marty: 31,8% da mancha e 226 pontos de branco por baixo.
 *
 * A regra dela: o bloco ocupa a área CENTRAL da folha, com margens equilibradas
 * em cima e em baixo, e uma página abaixo de 40% de ocupação aumenta as
 * imagens. Estes testes são as duas metades disso — e a terceira, que é a que
 * mais importa: aumentar NUNCA é esticar.
 */
describe("a ocupação da folha", () => {
  /** As cinco fotos das «Lapelas Noivo»: quatro deitadas e uma ao alto. */
  const LAPELAS = [1.49, 1.49, 1.5, 0.8, 1.5];

  it("uma fila só de cinco fotos deitadas deixava a folha a um terço — agora não", () => {
    const antes = caixasDoMoodboard("fila-unica", LAPELAS);
    // A conta que a página fazia antes desta regra: uma fila enche a largura e
    // a altura é o que sobrar — cinco fotos deitadas dão uma tira baixa.
    const umaFila = (705.89 - 4 * 8) / LAPELAS.reduce((s, a) => s + a, 0);
    expect(umaFila / (AREA.topo - AREA.base)).toBeLessThan(OCUPACAO_MINIMA);
    expect(ocupacaoDoMoodboard(antes)).toBeGreaterThanOrEqual(OCUPACAO_MINIMA);
  });

  it("nenhuma disposição fica abaixo dos 40% quando é possível subir", () => {
    for (const layout of LAYOUTS) {
      if (layout === "texto-e-imagem") continue; // a metade vazia é o texto
      for (let n = 2; n <= VARIADAS.length; n++) {
        const aspectos = VARIADAS.slice(0, n);
        for (const semRecorte of [false, true]) {
          const ocupacao = ocupacaoDoMoodboard(
            caixasDoMoodboard(layout, aspectos, 8, semRecorte),
            8,
          );
          expect(
            ocupacao,
            `${layout}/${n}${semRecorte ? " sem recorte" : ""}: ${(ocupacao * 100).toFixed(1)}%`,
          ).toBeGreaterThanOrEqual(OCUPACAO_MINIMA);
        }
      }
    }
  });

  /**
   * AUMENTAR NÃO É ESTICAR. É a linha que não se pode passar: há uma frente
   * inteira neste módulo para nenhuma fotografia ser recortada, e uma página
   * mais cheia à custa de fotos deformadas seria o mesmo defeito outra vez.
   */
  it("cresce sem mexer na forma de nenhuma fotografia", () => {
    for (const layout of ["filas", "fila-unica"] as const) {
      const caixas = caixasDoMoodboard(layout, LAPELAS, 8, true);
      caixas.forEach((c, i) => expect(c.w / c.h, `${layout}/${i}`).toBeCloseTo(LAPELAS[i], 2));
    }
  });

  it("uma foto só não cresce à força — já está no tamanho que a folha lhe dá", () => {
    // Uma vertical sozinha ocupa 32% da mancha e não há nada a fazer: crescer
    // em largura pedia altura que a folha não tem. O que não pode é a regra
    // inventar uma segunda cópia da foto para encher a página.
    const caixas = caixasDoMoodboard("destaque", [0.67], 8, true);
    expect(caixas).toHaveLength(1);
    expect(caixas[0].h).toBeCloseTo(AREA.topo - AREA.base, 4);
  });

  /**
   * Encher a folha, sozinho, é um objectivo que se satisfaz mal: com nove
   * panorâmicas 12:5, o arranjo que mais enche (95,8%) é uma fotografia enorme
   * com uma tira de oito selos de 33,8 pt por baixo. A trava do lado mínimo
   * está lá para isso.
   */
  it("não enche a folha à custa de uma tira de selos", () => {
    const panoramicas = Array.from({ length: 9 }, () => 2.4);
    const caixas = caixasDoMoodboard("filas", panoramicas, 8, true);
    const menor = Math.min(...caixas.map((c) => Math.min(c.w, c.h)));
    expect(menor).toBeGreaterThan(LADO_MINIMO_DA_FOTO);
    expect(ocupacaoDoMoodboard(caixas)).toBeGreaterThanOrEqual(OCUPACAO_MINIMA);
  });

  it("a página que já estava cheia não é recomposta", () => {
    // Dez fotos em duas filas — a página das mesas de jantar da proposta feita
    // à mão — está nos 67%: a escolha da disposição é dela e fica como está.
    const duasFilas = caixasDoMoodboard("filas", VARIADAS);
    expect(ocupacaoDoMoodboard(duasFilas)).toBeGreaterThan(0.6);
    const cima = duasFilas.slice(0, 5);
    const baixo = duasFilas.slice(5);
    for (const fila of [cima, baixo]) {
      for (const c of fila) expect(c.h).toBeCloseTo(fila[0].h, 6);
    }
    expect(cima[0].y).toBeGreaterThan(baixo[0].y);
  });
});
