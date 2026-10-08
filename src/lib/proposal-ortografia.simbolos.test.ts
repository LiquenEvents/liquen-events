import { describe, it, expect } from "vitest";
import { simbolosQueNaoSaem, tirarSimbolos } from "./proposal-ortografia";
import type { ProposalDoc } from "./proposal-doc";

/** Achado n.º 32: um emoji no título desaparecia do PDF sem aviso. */
describe("proposal-ortografia — o que não sai no PDF", () => {
  const doc = (title: string, label = "Arco") =>
    ({
      ref: "PO",
      serviceGroups: [{ letter: "a)", title, items: [{ label }] }],
    }) as unknown as Partial<ProposalDoc>;

  it("encontra o emoji no título do grupo", () => {
    const [s, ...resto] = simbolosQueNaoSaem(doc("Decoração Floral 💐"));
    expect(resto).toEqual([]);
    expect(s.simbolos).toEqual(["💐"]);
  });

  it("junta o que se cola ao emoji: cor, tom de pele, família, bandeira", () => {
    const [s] = simbolosQueNaoSaem(doc("❤️ 👍🏽 👨‍👩‍👧 🇵🇹"));
    expect(s.simbolos).toEqual(["❤️", "👍🏽", "👨‍👩‍👧", "🇵🇹"]);
  });

  it("©, ® e ™ imprimem — não são aviso", () => {
    expect(simbolosQueNaoSaem(doc("Líquen® Events™ ©"))).toEqual([]);
  });

  it("sem emojis, nada a dizer", () => {
    expect(simbolosQueNaoSaem(doc("Decoração Floral — Cerimónia"))).toEqual([]);
  });

  it("«Tirar» deixa o texto como o PDF o vai mostrar, sem espaço a mais", () => {
    const d = doc("Decoração 💐 Floral 🌿");
    const [s] = simbolosQueNaoSaem(d);
    const limpo = tirarSimbolos(d, s);
    expect(limpo.serviceGroups?.[0].title).toBe("Decoração Floral");
    expect(simbolosQueNaoSaem(limpo)).toEqual([]);
  });
});
