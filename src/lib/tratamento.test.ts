import { describe, expect, it } from "vitest";
import { generoDoNome, saudacaoDaCarta } from "./tratamento";

describe("a saudação da carta", () => {
  it("nome claramente de mulher: «Estimada»", () => {
    for (const n of [
      "Diana",
      "Maria",
      "Inês",
      "INES",
      "Catarina",
      "Leonor",
      "Melanie",
      "Maria do Carmo",
    ]) {
      expect(saudacaoDaCarta(n, "pt"), n).toBe(`Estimada ${n},`);
    }
  });

  it("nome claramente de homem: «Estimado»", () => {
    // Carlos, José e Luís também aparecem na lista de registos femininos (são
    // segundos nomes de mulheres): o dicionário desempata.
    for (const n of ["João", "José", "Luís", "Rui", "Tomás", "Afonso", "Carlos", "Sébastien"]) {
      expect(saudacaoDaCarta(n, "pt"), n).toBe(`Estimado ${n},`);
    }
  });

  it("na dúvida não se escolhe: «Olá»", () => {
    // Unissexo, do outro género noutro país, um caso isolado da lista de
    // registos (Gavin, do lado feminino), e os que as fontes traziam errados.
    for (const n of [
      "Ariel",
      "Sasha",
      "Alex",
      "Andrea",
      "Noa",
      "Nicola",
      "Gavin",
      "Alfeu",
      "Zayed",
    ]) {
      expect(saudacaoDaCarta(n, "pt"), n).toBe(`Olá ${n},`);
    }
  });

  it("sem nome, «Olá,»", () => {
    expect(saudacaoDaCarta("", "pt")).toBe("Olá,");
    expect(saudacaoDaCarta("   ", "pt")).toBe("Olá,");
  });

  it("em inglês não há género: «Dear»", () => {
    expect(saudacaoDaCarta("Diana", "en")).toBe("Dear Diana,");
    expect(saudacaoDaCarta("João", "en")).toBe("Dear João,");
    expect(saudacaoDaCarta("", "en")).toBe("Hello,");
  });

  it("só a primeira palavra conta", () => {
    expect(generoDoNome("Maria João")).toBe("f");
    expect(generoDoNome("José Maria")).toBe("m");
  });
});
