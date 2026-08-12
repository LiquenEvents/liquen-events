import { describe, it, expect } from "vitest";
import {
  filaDesequilibrada,
  fotoPrincipalDe,
  porqueEsteAutomatico,
  layoutDoBoard,
  marcaDepoisDeMexer,
  ordemDasFotos,
  temLugarDeDestaque,
  temPrincipalMarcada,
} from "./proposal-moodboard";
import type { MoodBoard } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FOTOGRAFIA QUE MANDA NA PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Nos layouts "Destaque" uma imagem fica maior, e hoje não se
 * controla qual.»
 *
 * Metade destes testes é sobre a MARCA a acompanhar as fotos quando elas mexem.
 * É a parte que se estraga em silêncio: remove-se a foto de cima, a marca fica
 * a apontar para o índice 2, e a página passa a destacar outra fotografia sem
 * ninguém lhe ter tocado.
 */

const board = (over: Partial<MoodBoard> = {}): MoodBoard => ({
  title: "Decoração Cerimónia",
  images: ["a", "b", "c", "d"],
  layout: "destaque",
  ...over,
});

describe("qual é a foto principal", () => {
  it("sem marca, é a primeira — como sempre foi", () => {
    expect(fotoPrincipalDe(board())).toBe(0);
    expect(temPrincipalMarcada(board())).toBe(false);
    expect(ordemDasFotos(board())).toEqual([0, 1, 2, 3]);
  });

  it("marcada, vem à frente e as outras mantêm a ordem", () => {
    expect(ordemDasFotos(board({ principal: 2 }))).toEqual([2, 0, 1, 3]);
    expect(fotoPrincipalDe(board({ principal: 2 }))).toBe(2);
  });

  it("uma marca fora dos limites vale o mesmo que marca nenhuma", () => {
    // Acontece com fotos removidas depois de marcar. Um índice inválido
    // desenharia uma página com um buraco.
    for (const p of [-1, 4, 99, 1.5, Number.NaN]) {
      expect(fotoPrincipalDe(board({ principal: p })), String(p)).toBe(0);
      expect(temPrincipalMarcada(board({ principal: p })), String(p)).toBe(false);
      expect(ordemDasFotos(board({ principal: p })), String(p)).toEqual([0, 1, 2, 3]);
    }
  });

  /**
   * ── ONDE É QUE «PRINCIPAL» QUER DIZER ALGUMA COISA ───────────────────────
   * Só nas duas disposições que dão a uma caixa muito mais área do que às
   * outras. Nas restantes, marcar prometeria um destaque que a página não dá —
   * e a ordem das fotos, que é dela, seria mexida por nada.
   */
  it("as filas e a fila única não têm lugar de destaque", () => {
    expect(temLugarDeDestaque("destaque")).toBe(true);
    expect(temLugarDeDestaque("mosaico")).toBe(true);
    expect(temLugarDeDestaque("filas")).toBe(false);
    expect(temLugarDeDestaque("fila-unica")).toBe(false);
    expect(temLugarDeDestaque("texto-e-imagem")).toBe(false);
    // E aí a marca não reordena nada.
    expect(ordemDasFotos(board({ layout: "filas", principal: 2 }))).toEqual([0, 1, 2, 3]);
  });

  it("sem layout escrito, vale o que o número de fotos sugere", () => {
    // Um documento antigo não tem `layout`. A sugestão é a mesma que o gerador
    // usa — se fossem duas, o ecrã e a página discordavam.
    const b = board({ layout: undefined, images: ["a", "b"] });
    expect(layoutDoBoard(b)).toBe("destaque");
    expect(temLugarDeDestaque(layoutDoBoard(b))).toBe(true);
  });

  it("um board com uma foto, ou nenhuma, não tem nada a ordenar", () => {
    expect(ordemDasFotos(board({ images: [] }))).toEqual([]);
    expect(ordemDasFotos(board({ images: ["a"], principal: 0 }))).toEqual([0]);
  });
});

describe("a marca acompanha as fotos quando elas mexem", () => {
  const remocao = (ii: number) => (antigo: number) =>
    antigo === ii ? null : antigo > ii ? antigo - 1 : antigo;

  it("remover a foto marcada desmarca — não passa a marca ao vizinho", () => {
    expect(marcaDepoisDeMexer(board({ principal: 2 }), remocao(2))).toBeUndefined();
  });

  it("remover uma foto de cima puxa a marca para trás", () => {
    // Sem isto, «a principal» passava a ser a foto que calhou àquele índice.
    expect(marcaDepoisDeMexer(board({ principal: 2 }), remocao(0))).toBe(1);
  });

  it("remover uma foto de baixo não mexe na marca", () => {
    expect(marcaDepoisDeMexer(board({ principal: 1 }), remocao(3))).toBe(1);
  });

  it("um board sem marca continua sem marca", () => {
    expect(marcaDepoisDeMexer(board(), remocao(0))).toBeUndefined();
  });

  /**
   * A conta da reordenação, escrita como o estúdio a faz: quem sai do sítio
   * `de` para o sítio `para` leva a marca consigo, e as que ficam pelo meio
   * deslizam uma posição — para que lado depende da direcção.
   */
  it("reordenar leva a marca com a foto, e faz deslizar as do meio", () => {
    const reordenar = (de: number, para: number) => (antigo: number) => {
      if (antigo === de) return para;
      if (de < antigo && antigo <= para) return antigo - 1;
      if (para <= antigo && antigo < de) return antigo + 1;
      return antigo;
    };
    // A própria foto marcada a ser movida.
    expect(marcaDepoisDeMexer(board({ principal: 3 }), reordenar(3, 0))).toBe(0);
    // Outra foto a passar por cima da marcada, das duas direcções.
    expect(marcaDepoisDeMexer(board({ principal: 1 }), reordenar(0, 3))).toBe(0);
    expect(marcaDepoisDeMexer(board({ principal: 1 }), reordenar(3, 0))).toBe(2);
    // Um movimento que não atravessa a marcada deixa-a onde está.
    expect(marcaDepoisDeMexer(board({ principal: 0 }), reordenar(2, 3))).toBe(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CAIXA GRANDE É MESMO A DA PRIMEIRA POSIÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `ordemDasFotos` promete uma coisa: que pôr a foto marcada à frente a faz
 * sair maior. Essa promessa depende da geometria — se um dia o «destaque»
 * deixar de dar a maior caixa à posição 0, a marca passa a destacar a foto
 * errada e nada nesta biblioteca daria por isso.
 */
describe("a promessa que a geometria tem de cumprir", () => {
  it("nas duas disposições com destaque, a primeira caixa é a maior", async () => {
    const { caixasDoMoodboard } = await import("./proposal-geometria");
    const aspectos = [1.5, 0.75, 1.33, 1.0, 1.5, 0.8];
    for (const layout of ["destaque", "mosaico"] as const) {
      const caixas = caixasDoMoodboard(layout, aspectos);
      const areas = caixas.map((c) => c.w * c.h);
      const maior = Math.max(...areas);
      expect(areas[0], `${layout}: a primeira caixa tem de ser a maior`).toBeCloseTo(maior, 6);
    }
  });
});

describe("porque é que o automático escolheu aquilo", () => {
  it("diz uma frase por cada caso da regra, e nomeia o número de fotos", () => {
    // A regra é `layoutSugerido` e depende só de quantas fotos há. A frase tem
    // de acompanhar a regra: se um dia mudar uma e não a outra, o ecrã explica
    // uma escolha que não é a que foi feita.
    expect(porqueEsteAutomatico(0)).toMatch(/sem fotos/i);
    expect(porqueEsteAutomatico(1)).toMatch(/uma foto/i);
    expect(porqueEsteAutomatico(3)).toMatch(/^3 fotos/);
    expect(porqueEsteAutomatico(5)).toMatch(/^5 fotos/);
    expect(porqueEsteAutomatico(6)).toMatch(/^6 fotos/);
    expect(porqueEsteAutomatico(9)).toMatch(/^9 fotos/);
  });
});

describe("a última fila desequilibrada", () => {
  /** Caixas de teste: `y` é o fundo e `h` a altura, como no PDF. */
  const fila = (quantas: number, y: number, h = 100) =>
    Array.from({ length: quantas }, () => ({ y, h }));

  it("três em cima e uma em baixo é para avisar", () => {
    const r = filaDesequilibrada([...fila(3, 200), ...fila(1, 80)]);
    // Os dois remédios fecham a página igual: acrescentar duas, ou tirar a que
    // ficou sozinha. Sugere-se o mais barato — tirar uma é um gesto, e chegar
    // às duas que faltam são dois.
    expect(r).toEqual({
      naUltima: 1,
      nasOutras: 3,
      aAcrescentar: 2,
      aRemover: 1,
      sugestao: "remover",
    });
  });

  /** Cinco em cima e uma em baixo: tirar uma continua a ser o gesto curto. */
  it("com filas largas, tirar a que sobra é sempre mais barato", () => {
    const r = filaDesequilibrada([...fila(5, 200), ...fila(1, 80)]);
    expect(r?.sugestao).toBe("remover");
    expect(r?.aAcrescentar).toBe(4);
  });

  /**
   * Quatro em cima e duas em baixo: acrescentar duas ou tirar duas custa o
   * mesmo, e o empate é a favor de acrescentar — há mais fotos na biblioteca
   * do que vontade de tirar uma que já foi escolhida a dedo.
   */
  it("em empate, sugere acrescentar", () => {
    const r = filaDesequilibrada([...fila(4, 200), ...fila(2, 80)]);
    expect(r).toMatchObject({ aAcrescentar: 2, aRemover: 2, sugestao: "acrescentar" });
  });

  it("uma a menos na última fila é o aspecto normal de uma grelha", () => {
    // 3 + 2 não merece aviso nenhum: avisar aqui seria ensinar a ignorar.
    expect(filaDesequilibrada([...fila(3, 200), ...fila(2, 80)])).toBeNull();
  });

  it("filas cheias, ou uma fila só, não têm nada a dizer", () => {
    expect(filaDesequilibrada([...fila(3, 200), ...fila(3, 80)])).toBeNull();
    expect(filaDesequilibrada(fila(5, 200))).toBeNull();
  });

  it("poucas fotos nunca dão aviso", () => {
    expect(filaDesequilibrada([...fila(2, 200), ...fila(1, 80)])).toBeNull();
  });
});
