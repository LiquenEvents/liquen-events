import { describe, it, expect } from "vitest";
import {
  LADO_MINIMO_DA_FOTO,
  PAGINA_H,
  PAGINA_M,
  PAGINA_W,
  caixasDoCollage,
  caixasDoMoodboard,
  perdaNaCapa,
  perdaNoRecorte,
  perdasDoMoodboard,
  type CaixaPdf,
  type LayoutDeMoodboard,
} from "./proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO DE CADA FOTOGRAFIA É DEITADO FORA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «O sistema corta as imagens e depois não dá para ver a imagem toda, e é
 * importante porque tem decoração para os clientes verem.» Uma foto de um
 * portão coberto de flores, cortada a meio, deixa de mostrar o trabalho — que é
 * a única coisa que a proposta existe para mostrar.
 *
 * Foi medido antes de se mexer em nada, por disposição, com 1 a 10 fotos e com
 * as formas que saem de uma máquina e de um telemóvel. A média/máximo da ÁREA
 * perdida no recorte:
 *
 *   disposição       antes (média → máximo)       depois
 *   ─────────────────────────────────────────────────────
 *   filas             0% → 0%                     0% → 0%   (já estava certa)
 *   fila única        0% → 0%                     0% → 0%   (já estava certa)
 *   mosaico          13–72% → 79%                 0% → 0%
 *   destaque          3–69% → 72%                 0% → 0%
 *   texto e imagem    0–24% (e as fotos 2..n      0% → 0%
 *                     nem sequer eram desenhadas)
 *
 * Estes testes são a rede: uma alteração futura à geometria que volte a cortar
 * 40% de uma fotografia chumba aqui, com o nome da disposição e o número à
 * frente.
 */

/** As formas que aparecem mesmo: telemóvel ao alto, máquina, quadrado do
 *  Instagram, e o panorama de uma sala decorada de ponta a ponta. */
const FORMAS: Record<string, number> = {
  "vertical 2:3": 2 / 3,
  "vertical 3:4": 0.75,
  quadrada: 1,
  "deitada 4:3": 4 / 3,
  "deitada 3:2": 1.5,
  "panorâmica 16:9": 16 / 9,
  "panorâmica 12:5": 2.4,
};
/** Um mood board verdadeiro é uma mistura, e é o caso que mais interessa. */
const VARIADAS = [1.5, 0.75, 1.33, 0.8, 1.78, 1.0, 0.67, 1.5, 1.2, 0.9];

const LAYOUTS: LayoutDeMoodboard[] = [
  "filas",
  "fila-unica",
  "mosaico",
  "destaque",
  "texto-e-imagem",
];

const AREA = {
  esq: PAGINA_M,
  dir: PAGINA_W - PAGINA_M,
  topo: PAGINA_H - PAGINA_M - 112,
  base: PAGINA_M + 8,
};
const RESPIRO = 8;

/** Todos os casos que interessam: cada forma sozinha (dez fotos iguais é o que
 *  acontece quando ela descarrega um álbum inteiro) e a mistura. */
function casos(n: number): [string, number[]][] {
  return [
    ...Object.entries(FORMAS).map(([nome, asp]): [string, number[]] => [
      nome,
      Array.from({ length: n }, () => asp),
    ]),
    ["variadas", VARIADAS.slice(0, n)],
  ];
}

describe("a área que o recorte deita fora", () => {
  it("com a forma da foto, nenhuma disposição corta seja o que for", () => {
    for (const layout of LAYOUTS) {
      for (let n = 1; n <= 10; n++) {
        for (const [nome, aspectos] of casos(n)) {
          const perdas = perdasDoMoodboard(layout, aspectos, 8, true);
          expect(perdas, `${layout}/${n} ${nome}: falta caixa`).toHaveLength(n);
          const pior = Math.max(...perdas);
          expect(pior, `${layout}/${n} ${nome}: perde ${(pior * 100).toFixed(1)}%`).toBeLessThan(
            0.005,
          );
        }
      }
    }
  });

  /**
   * O que era, para o ganho ficar escrito e não se poder desfazer sem se dar
   * por isso. Se um dia estes números descerem, é porque o arranjo de origem
   * melhorou — e aí actualiza-se a tabela lá em cima com a medição nova.
   */
  it("sem a escolha nova, o destaque e o mosaico cortam como cortavam", () => {
    const piorDe = (layout: LayoutDeMoodboard, n: number, asp: number) =>
      Math.max(
        ...perdasDoMoodboard(
          layout,
          Array.from({ length: n }, () => asp),
        ),
      );
    // Uma fotografia ao alto no arranjo em destaque: dois terços fora da página.
    expect(piorDe("destaque", 1, 2 / 3)).toBeGreaterThan(0.6);
    expect(piorDe("destaque", 10, 2 / 3)).toBeGreaterThan(0.6);
    // E uma panorâmica no mosaico: quatro quintos.
    expect(piorDe("mosaico", 3, 2.4)).toBeGreaterThan(0.7);
  });

  /**
   * A CAPA CONTINUA A CORTAR, E NÃO HÁ MANEIRA DE NÃO CORTAR.
   *
   * As duas tiras correm de topo a fundo da folha e têm aspecto 0,47:1 — quase
   * 1:2. Nenhuma fotografia normal tem essa forma, e encolher a tira punha uma
   * barra de fundo entre a foto e a aresta da folha, que é pior do que o
   * recorte. O que se pode fazer é DIZER quanto custa cada escolha: uma foto ao
   * alto perde 30%, uma deitada perde 69%. Com o número à frente, escolher uma
   * vertical para a capa deixa de ser sorte.
   */
  it("diz o que cada forma perde na tira da capa", () => {
    expect(perdaNaCapa(2 / 3)).toBeCloseTo(0.3, 2);
    expect(perdaNaCapa(1)).toBeCloseTo(0.533, 2);
    expect(perdaNaCapa(1.5)).toBeCloseTo(0.689, 2);
    expect(perdaNaCapa(16 / 9)).toBeCloseTo(0.737, 2);
    // A vertical é sempre a melhor escolha para a capa — é isto que o aviso do
    // estúdio tem de deixar claro.
    expect(perdaNaCapa(2 / 3)).toBeLessThan(perdaNaCapa(1.5));
  });

  it("a perda é a fracção da área, e é simétrica", () => {
    expect(perdaNoRecorte(1.5, 1.5)).toBe(0);
    // Meter uma foto 2:1 numa caixa 1:1 deita fora metade.
    expect(perdaNoRecorte(2, 1)).toBeCloseTo(0.5, 6);
    expect(perdaNoRecorte(1, 2)).toBeCloseTo(0.5, 6);
  });

  /**
   * ── A FOTOGRAFIA DE FORMA ABSURDA É A QUE MAIS PERDE, E ERA A ÚNICA CALADA ─
   *
   * A composição aperta o aspecto de cada foto ao intervalo [0,35; 4]
   * (`aspetoSeguro`), e faz bem: sem isso uma panorâmica de 10:1 esmagava a
   * fila inteira numa tira de dois centímetros. Mas a MEDIÇÃO da perda usava o
   * mesmo aspecto apertado dos dois lados da conta — comparava uma foto de 4:1
   * que não existe com a caixa de 4:1 que a composição lhe deu — e respondia
   * ZERO. O desenho não aperta nada: `drawCoverImage` recorta a fotografia
   * verdadeira para encher a caixa, e 60% da panorâmica fica de fora da folha.
   *
   * O aviso existe para ela poder trocar a foto antes de a proposta seguir. A
   * perda maior de todas era a única sobre a qual ele se calava.
   */
  it("mede a forma verdadeira da foto, mesmo a que a composição teve de apertar", () => {
    // 10:1 numa caixa de 4:1 (o máximo que a composição dá): fica 40% da foto.
    expect(perdaNoRecorte(10, 4)).toBeCloseTo(0.6, 6);
    // E um alto de 1:10 numa caixa de 0,35: sobra pouco mais de um terço.
    expect(perdaNoRecorte(0.1, 0.35)).toBeCloseTo(0.714, 3);
    // Na página, com a forma da foto ligada — o arranjo não corta NENHUMA das
    // outras, e diz o que corta nesta.
    expect(perdasDoMoodboard("filas", [10, 1.5, 1.5], 8, true)).toEqual([0.6, 0, 0]);
    // Na tira da capa, uma panorâmica destas perde quase tudo: 95%, não 88%.
    expect(perdaNaCapa(10)).toBeCloseTo(0.953, 3);
    expect(perdaNaCapa(0.1)).toBeCloseTo(0.786, 3);
    // O que não é forma nenhuma continua a valer o 3:2 por omissão — sem saber
    // a forma não se pode afirmar perda nenhuma.
    expect(perdaNoRecorte(Number.NaN, 1.5)).toBe(0);
    expect(perdaNoRecorte(0, 1.5)).toBe(0);
  });
});

/**
 * O efeito da proposta feita à mão é orgânico E ordenado. Fotos com formas
 * diferentes não podem produzir uma página desalinhada — se para não cortar for
 * preciso deixar espaço, que seja espaço com ritmo e não sobras.
 */
describe("sem recorte, e ainda assim alinhado", () => {
  const dentroDaArea = (c: CaixaPdf) =>
    c.x >= AREA.esq - 0.01 &&
    c.x + c.w <= AREA.dir + 0.01 &&
    c.y >= AREA.base - 0.01 &&
    c.y + c.h <= AREA.topo + 0.01 &&
    c.w > 0 &&
    c.h > 0;

  const sobrepoem = (a: CaixaPdf, b: CaixaPdf) =>
    a.x + a.w > b.x + 0.01 &&
    b.x + b.w > a.x + 0.01 &&
    a.y + a.h > b.y + 0.01 &&
    b.y + b.h > a.y + 0.01;

  it("uma caixa por foto, dentro da mancha e sem sobreposições", () => {
    for (const layout of LAYOUTS) {
      for (let n = 1; n <= 10; n++) {
        for (const [nome, aspectos] of casos(n)) {
          const caixas = caixasDoMoodboard(layout, aspectos, 8, true);
          expect(caixas, `${layout}/${n} ${nome}`).toHaveLength(n);
          for (const c of caixas) {
            expect(dentroDaArea(c), `${layout}/${n} ${nome}: ${JSON.stringify(c)}`).toBe(true);
          }
          for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
              expect(sobrepoem(caixas[i], caixas[j]), `${layout}/${n} ${nome}: ${i}×${j}`).toBe(
                false,
              );
            }
          }
        }
      }
    }
  });

  /**
   * A prova de que continuam a ser linhas e colunas: cada aresta ou é a aresta
   * do bloco, ou é a aresta de outra fotografia mais um respiro. Nenhuma cai a
   * meio caminho — é isso que separa uma composição de fotografias espalhadas.
   */
  it("cada aresta ou é do bloco, ou é a de outra foto mais um respiro", () => {
    const perto = (a: number, b: number) => Math.abs(a - b) < 0.05;
    for (const layout of ["mosaico", "destaque"] as LayoutDeMoodboard[]) {
      for (let n = 2; n <= 10; n++) {
        for (const [nome, aspectos] of casos(n)) {
          const caixas = caixasDoMoodboard(layout, aspectos, 8, true);
          const esq = Math.min(...caixas.map((c) => c.x));
          const topo = Math.max(...caixas.map((c) => c.y + c.h));
          for (const c of caixas) {
            const encostada =
              perto(c.x, esq) || caixas.some((o) => perto(o.x + o.w + RESPIRO, c.x));
            expect(encostada, `${layout}/${n} ${nome}: x=${c.x.toFixed(2)} solto`).toBe(true);
            const alinhada =
              perto(c.y + c.h, topo) || caixas.some((o) => perto(o.y - RESPIRO, c.y + c.h));
            expect(alinhada, `${layout}/${n} ${nome}: topo=${(c.y + c.h).toFixed(2)} solto`).toBe(
              true,
            );
          }
        }
      }
    }
  });

  /**
   * Não cortar não pode custar fotografias do tamanho de um selo: 36 pontos são
   * 1,3 cm numa A4, e abaixo disso a decoração deixa de se ver — que era o
   * problema de origem, outra vez, por outro caminho. Foi por isto que o
   * mosaico passou a experimentar todas as maneiras de partir e a ficar com a
   * que deixa a menor fotografia o maior possível.
   *
   * Ficam de fora os dois arranjos onde é ELA que manda no número de fotos por
   * linha: a «fila única» com oito panorâmicas dá uma tira de 34 pt, e isso é a
   * resposta certa ao que foi pedido — o estúdio é que tem de o mostrar. O
   * mesmo para o «texto e imagem», que é para UMA foto ao lado de um parágrafo
   * (é o que `layoutSugerido` propõe) e empilhar lá dez faz miniaturas por
   * construção. Onde a geometria escolhe, a geometria responde.
   */
  it("nenhuma fotografia fica do tamanho de um selo", () => {
    for (const layout of ["filas", "mosaico", "destaque"] as LayoutDeMoodboard[]) {
      for (let n = 1; n <= 10; n++) {
        for (const [nome, aspectos] of casos(n)) {
          const caixas = caixasDoMoodboard(layout, aspectos, 8, true);
          const menor = Math.min(...caixas.map((c) => Math.min(c.w, c.h)));
          expect(
            menor,
            `${layout}/${n} ${nome}: menor lado ${menor.toFixed(1)} pt`,
          ).toBeGreaterThan(LADO_MINIMO_DA_FOTO);
        }
      }
    }
  });

  it("as mesmas fotos dão sempre a mesma página", () => {
    for (const layout of LAYOUTS) {
      const a = caixasDoMoodboard(layout, VARIADAS.slice(0, 7), 8, true);
      const b = caixasDoMoodboard(layout, VARIADAS.slice(0, 7), 8, true);
      expect(a, layout).toEqual(b);
    }
  });

  /**
   * A anotação por baixo do collage pode ocupar cinco linhas, e o espaço que
   * pede sai das FOTOS e nunca da página — um bloco que descesse por cima da
   * anotação escrevia as duas coisas uma em cima da outra.
   */
  it("a anotação alta encolhe o bloco, não o empurra para fora", () => {
    for (const layout of LAYOUTS) {
      for (const c of caixasDoMoodboard(layout, VARIADAS.slice(0, 6), 60, true)) {
        expect(c.y, layout).toBeGreaterThanOrEqual(PAGINA_M + 60 - 0.01);
      }
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA PROPOSTA JÁ ENVIADA NÃO PODE MUDAR DE ASPECTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O PDF não é um ficheiro guardado: é redesenhado a partir do documento sempre
 * que o casal abre o link. Um documento sem `enquadramento` — que são todos os
 * que foram escritos antes deste campo existir — tem de sair exactamente como
 * saía, ao ponto.
 */
describe("os documentos antigos saem como sempre saíram", () => {
  it("o destaque sem a escolha nova é o collage de sempre", () => {
    for (let n = 1; n <= 10; n++) {
      expect(caixasDoMoodboard("destaque", VARIADAS.slice(0, n)), `n=${n}`).toEqual(
        caixasDoCollage(n),
      );
    }
  });

  /**
   * A caixa é a mesma ao ponto — mesma coluna, mesma largura, mesma altura, e
   * o mesmo recorte (ou a falta dele) que sempre teve. O que mudou foi a
   * ALTURA A QUE ELA ESTÁ: o bloco de imagens de um mood board passou a ficar
   * ao meio da mancha, com margens equilibradas em cima e em baixo, em vez de
   * encostado ao topo com o branco todo em baixo. Ver `OCUPACAO_MINIMA`.
   */
  it("o «texto e imagem» com uma foto é a caixa de sempre, agora ao centro", () => {
    const a = { x: PAGINA_M, w: PAGINA_W - 2 * PAGINA_M, h: AREA.topo - AREA.base };
    for (const asp of Object.values(FORMAS)) {
      const w = a.w * 0.42;
      const h = Math.min(a.h, w / asp);
      expect(caixasDoMoodboard("texto-e-imagem", [asp])).toEqual([
        { x: a.x + a.w - w, y: AREA.base + (a.h - h) / 2, w, h },
      ]);
    }
  });

  it("as filas não mudam com a escolha nova — já davam a forma da foto", () => {
    for (const layout of ["filas", "fila-unica"] as LayoutDeMoodboard[]) {
      for (let n = 1; n <= 10; n++) {
        expect(caixasDoMoodboard(layout, VARIADAS.slice(0, n), 8, true), `${layout}/${n}`).toEqual(
          caixasDoMoodboard(layout, VARIADAS.slice(0, n)),
        );
      }
    }
  });

  /**
   * A única mudança que atinge documentos antigos, e é uma perda que se
   * corrige: com este arranjo e mais do que uma foto, o gerador desenhava a
   * primeira e deixava cair as outras — em silêncio, sem aviso no estúdio. Uma
   * foto que ela escolheu não pode desaparecer sem uma palavra.
   */
  it("o «texto e imagem» com várias fotos deixou de as perder", () => {
    for (let n = 1; n <= 10; n++) {
      expect(caixasDoMoodboard("texto-e-imagem", VARIADAS.slice(0, n)), `n=${n}`).toHaveLength(n);
    }
  });
});
