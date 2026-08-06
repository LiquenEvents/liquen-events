import { describe, it, expect } from "vitest";
import { cumpreRegra, lerRegra, isEixo, type RegraDoTema } from "./biblioteca-types";

/** Os seis temas reais, tal como a migração os converte (TEMAS-PLANO.md §6). */
const BRANCO_E_AMARELO: RegraDoTema = {
  v: 1,
  eixos: [
    { eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] },
    { eixo: "paleta", modo: "todas", etiquetas: ["paleta:branco", "paleta:amarelo"] },
  ],
};
const BRANCO_E_VERDE: RegraDoTema = {
  v: 1,
  eixos: [
    { eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] },
    { eixo: "paleta", modo: "todas", etiquetas: ["paleta:branco", "paleta:verde"] },
  ],
};
const TERRACOTTA: RegraDoTema = {
  v: 1,
  eixos: [{ eixo: "paleta", modo: "todas", etiquetas: ["paleta:terracotta"] }],
};
const SEATING_PLANS: RegraDoTema = {
  v: 1,
  eixos: [{ eixo: "tipo", modo: "todas", etiquetas: ["tipo:seating-plan"] }],
};

const foto = (...etiquetas: string[]) => new Set(etiquetas);

describe("cumpreRegra", () => {
  it("uma foto com todas as exigências entra no tema", () => {
    expect(
      cumpreRegra(foto("tipo:bouquet", "paleta:branco", "paleta:amarelo"), BRANCO_E_AMARELO),
    ).toBe(true);
  });

  it("faltar UMA exigência chega para ficar de fora", () => {
    expect(cumpreRegra(foto("tipo:bouquet", "paleta:branco"), BRANCO_E_AMARELO)).toBe(false);
    expect(cumpreRegra(foto("paleta:branco", "paleta:amarelo"), BRANCO_E_AMARELO)).toBe(false);
  });

  /**
   * O ERRO QUE ESTE TESTE EXISTE PARA IMPEDIR.
   *
   * Com "qualquer" dentro do eixo (a primeira versão do plano), um bouquet
   * branco e verde satisfazia "branco OU amarelo" e aparecia nos DOIS temas de
   * bouquets — que passavam de 14 e 16 fotos para 30 cada. Só se vê olhando
   * para os dois temas ao mesmo tempo, e é por isso que fica escrito aqui.
   */
  it("os dois temas de bouquets não se contaminam um ao outro", () => {
    const brancoEVerde = foto("tipo:bouquet", "paleta:branco", "paleta:verde");
    expect(cumpreRegra(brancoEVerde, BRANCO_E_VERDE)).toBe(true);
    expect(cumpreRegra(brancoEVerde, BRANCO_E_AMARELO)).toBe(false);

    const brancoEAmarelo = foto("tipo:bouquet", "paleta:branco", "paleta:amarelo");
    expect(cumpreRegra(brancoEAmarelo, BRANCO_E_AMARELO)).toBe(true);
    expect(cumpreRegra(brancoEAmarelo, BRANCO_E_VERDE)).toBe(false);
  });

  it("um eixo ausente NÃO restringe: Terracotta aceita qualquer tipo de peça", () => {
    expect(cumpreRegra(foto("paleta:terracotta", "tipo:bouquet"), TERRACOTTA)).toBe(true);
    expect(cumpreRegra(foto("paleta:terracotta", "tipo:seating-plan"), TERRACOTTA)).toBe(true);
  });

  /** A promessa da reformulação inteira: a mesma foto em dois temas, sem
   *  existir duas vezes. Hoje é impossível. */
  it("um seating plan em terracotta está nos dois temas ao mesmo tempo", () => {
    const capaDaItalia = foto("tipo:seating-plan", "paleta:terracotta", "estilo:mediterranico");
    expect(cumpreRegra(capaDaItalia, SEATING_PLANS)).toBe(true);
    expect(cumpreRegra(capaDaItalia, TERRACOTTA)).toBe(true);
  });

  it('"qualquer" continua disponível quando um tema o quiser', () => {
    const brancoOuVerde: RegraDoTema = {
      v: 1,
      eixos: [{ eixo: "paleta", modo: "qualquer", etiquetas: ["paleta:branco", "paleta:verde"] }],
    };
    expect(cumpreRegra(foto("paleta:branco"), brancoOuVerde)).toBe(true);
    expect(cumpreRegra(foto("paleta:verde"), brancoOuVerde)).toBe(true);
    expect(cumpreRegra(foto("paleta:rosa"), brancoOuVerde)).toBe(false);
  });
});

describe("lerRegra", () => {
  it("lê a forma que a migração escreve", () => {
    const regra = lerRegra({
      v: 1,
      eixos: [{ eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] }],
    });
    expect(regra?.v).toBe(1);
    expect(regra?.eixos).toEqual([{ eixo: "tipo", modo: "todas", etiquetas: ["tipo:bouquet"] }]);
  });

  it("um modo desconhecido cai para 'todas' — o lado que não alarga o tema", () => {
    const regra = lerRegra({ eixos: [{ eixo: "paleta", modo: "seja", etiquetas: ["a", "b"] }] });
    expect(regra?.eixos[0].modo).toBe("todas");
  });

  /**
   * Uma regra partida NÃO pode virar "aceita tudo": um tema que mostrasse a
   * biblioteca inteira por causa de um jsonb estragado é pior do que um tema
   * que não mostra nada, porque parece que está a funcionar.
   */
  it("devolve null ao que não é uma regra utilizável", () => {
    expect(lerRegra(null)).toBeNull();
    expect(lerRegra({})).toBeNull();
    expect(lerRegra({ eixos: [] })).toBeNull();
    expect(lerRegra({ eixos: "tipo:bouquet" })).toBeNull();
    expect(lerRegra({ eixos: [{ eixo: "cor", etiquetas: ["x"] }] })).toBeNull();
    expect(lerRegra({ eixos: [{ eixo: "tipo", etiquetas: [] }] })).toBeNull();
  });

  it("descarta entradas inválidas mas aproveita as boas", () => {
    const regra = lerRegra({
      eixos: [
        { eixo: "inventado", etiquetas: ["x"] },
        { eixo: "paleta", etiquetas: ["paleta:rosa", 42, ""] },
      ],
    });
    expect(regra?.eixos).toEqual([{ eixo: "paleta", modo: "todas", etiquetas: ["paleta:rosa"] }]);
  });
});

describe("isEixo", () => {
  it("só reconhece os três", () => {
    expect(["tipo", "paleta", "estilo"].every(isEixo)).toBe(true);
    expect(isEixo("cor")).toBe(false);
    expect(isEixo(undefined)).toBe(false);
  });
});
