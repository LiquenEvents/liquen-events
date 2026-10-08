import { describe, it, expect } from "vitest";
import { casaComAProcura, paraProcura } from "./procura";

/** Achado n.º 10: «evora» não encontrava «Évora»; «912345678» não encontrava
 *  «+351 912 345 678». */
describe("procura", () => {
  it.each([
    ["evora", "Herdade em Évora"],
    ["goncalves", "Zé Conceição-Gonçalves"],
    ["AVILA", "d'Ávila"],
    ["Évora", "evora"],
  ])("«%s» encontra «%s»", (q, v) => {
    expect(casaComAProcura(q, [v])).toBe(true);
  });

  it.each([
    ["912345678", "+351 912 345 678"],
    ["+351 912345678", "912 345 678"],
    ["00351912345678", "912345678"],
    ["345 678", "+351 912 345 678"],
  ])("o telefone «%s» encontra «%s»", (q, v) => {
    expect(casaComAProcura(q, [v])).toBe(true);
  });

  it("poucos algarismos não se lêem como telefone", () => {
    // «2027» (um ano) não se compara só pelos algarismos: os espaços do
    // número contam, e «912 027» não tem «2027» escrito.
    expect(casaComAProcura("2027", ["+351 912 027 000"])).toBe(false);
    expect(casaComAProcura("12", ["Ana"])).toBe(false);
  });

  it("não encontra o que não está lá", () => {
    expect(casaComAProcura("porto", ["Évora", "Lisboa"])).toBe(false);
  });

  it("procura vazia casa com tudo", () => {
    expect(casaComAProcura("  ", ["x"])).toBe(true);
  });

  it("paraProcura tira acentos e maiúsculas", () => {
    expect(paraProcura("ÇÃÉÍ")).toBe("caei");
  });
});
