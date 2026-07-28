import { describe, it, expect } from "vitest";
import { normalizedThemeName, themeNameTakenError } from "./theme-types";

/**
 * A normalização de nomes é o que impede a biblioteca de encher de temas
 * quase iguais ("Itália" e "Italia" lado a lado no seletor da proposta). Vive
 * no módulo client-safe para o formulário poder avisar com a MESMA regra que
 * as rotas aplicam — por isso é aqui que ela é fixada.
 */
describe("normalizedThemeName", () => {
  it("iguala nomes que a equipa lê como o mesmo tema", () => {
    expect(normalizedThemeName("Itália")).toBe(normalizedThemeName("Italia"));
    expect(normalizedThemeName("  TERRACOTTA ")).toBe(normalizedThemeName("Terracotta"));
    expect(normalizedThemeName("Branco  &  Verde")).toBe(normalizedThemeName("branco & verde"));
    expect(normalizedThemeName("Provença")).toBe(normalizedThemeName("provenca"));
  });

  it("mantém distintos os temas que são mesmo distintos", () => {
    expect(normalizedThemeName("Itália")).not.toBe(normalizedThemeName("Itália Antiga"));
    expect(normalizedThemeName("Terracotta")).not.toBe(normalizedThemeName("Terracota"));
  });
});

describe("themeNameTakenError", () => {
  it('nomeia o nome recusado e diz "equivalente" (a comparação ignora acentos)', () => {
    expect(themeNameTakenError("Italia")).toBe(
      'Já existe um tema com um nome equivalente a "Italia".',
    );
  });
});
