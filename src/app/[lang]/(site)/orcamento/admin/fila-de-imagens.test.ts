import { describe, it, expect, beforeEach } from "vitest";
import { pedirVezDeImagemPesada, limparFilaDeImagens } from "./fila-de-imagens";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FILA EXISTE PARA A PRIMEIRA FOTOGRAFIA NÃO ESPERAR PELAS OUTRAS 23
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido no estúdio de propostas a 1,6 Mbps, 24 células sem miniatura: 24
 * originais pedidos ao mesmo tempo (1099 KB cada, 26,4 MB), a primeira
 * fotografia pintada aos **34,0 s** e a grelha visível completa aos **67,6 s**.
 * Com a fila, os mesmos ficheiros: **13,3 MB** (as de fora do ecrã nunca são
 * pedidas) e a grelha visível aos **49,4 s**.
 *
 * O que estes casos fixam é a única propriedade de que isso depende: que o
 * número de downloads em voo tem um TECTO, e que a vez volta sempre à fila.
 */
beforeEach(() => limparFilaDeImagens());

describe("a fila das imagens pesadas", () => {
  it("deixa arrancar três e segura as restantes", () => {
    const arrancaram: number[] = [];
    for (let i = 0; i < 8; i++) pedirVezDeImagemPesada(() => arrancaram.push(i));
    expect(arrancaram).toEqual([0, 1, 2]);
  });

  it("a vez larga passa à seguinte, pela ordem da grelha", () => {
    const arrancaram: number[] = [];
    const largar = Array.from({ length: 6 }, (_, i) =>
      pedirVezDeImagemPesada(() => arrancaram.push(i)),
    );
    expect(arrancaram).toEqual([0, 1, 2]);
    largar[0]();
    expect(arrancaram).toEqual([0, 1, 2, 3]);
    largar[1]();
    largar[2]();
    expect(arrancaram).toEqual([0, 1, 2, 3, 4, 5]);
  });

  /**
   * Largar duas vezes é o caso NORMAL, não o estranho: o `onLoad` da imagem e a
   * desmontagem da célula chegam os dois. Se cada um descontasse do contador, o
   * tecto subia sozinho e a fila deixava de valer nada.
   */
  it("largar a mesma vez duas vezes não abre uma vaga a mais", () => {
    const arrancaram: number[] = [];
    const largar = Array.from({ length: 6 }, (_, i) =>
      pedirVezDeImagemPesada(() => arrancaram.push(i)),
    );
    largar[0]();
    largar[0]();
    expect(arrancaram).toEqual([0, 1, 2, 3]);
  });

  /**
   * Uma célula que sai do ecrã antes de lhe tocar a vez sai da fila — e não
   * gasta a vaga de quem ficou. Sem isto, percorrer a página depressa deixava a
   * fila cheia de células que já ninguém está a ver.
   */
  it("desistir antes da vez não gasta vaga nenhuma", () => {
    const arrancaram: number[] = [];
    const largar = Array.from({ length: 6 }, (_, i) =>
      pedirVezDeImagemPesada(() => arrancaram.push(i)),
    );
    largar[3]();
    largar[0]();
    // A 3 saiu da fila: a vaga vai para a 4, não fica perdida nem duplicada.
    expect(arrancaram).toEqual([0, 1, 2, 4]);
  });
});
