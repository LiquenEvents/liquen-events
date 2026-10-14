import { describe, expect, it } from "vitest";
import { eUmDosNoivos, nomesDoCasal, quemPedeEOCasal } from "./quem-pede";

describe("quemPedeEOCasal", () => {
  it("o caso dela: a mãe escreve, o casal vai em grande e ela numa linha", () => {
    expect(
      quemPedeEOCasal({ name: "Maria Silva", partnerA: "Luana Silva", partnerB: "Afonso Duarte" }),
    ).toEqual({
      titulo: "Luana Silva & Afonso Duarte",
      feitoPor: "Maria Silva",
      casal: "Luana Silva & Afonso Duarte",
    });
  });

  it("quando escreve um dos noivos, fica o nome de quem escreveu", () => {
    for (const name of ["Luana Silva", "luana", "Luána", "Afonso Duarte", "Luana e Afonso"]) {
      expect(
        quemPedeEOCasal({ name, partnerA: "Luana Silva", partnerB: "Afonso Duarte" }).feitoPor,
      ).toBeNull();
    }
  });

  it("sem casal, é sempre quem escreveu", () => {
    expect(quemPedeEOCasal({ name: "Empresa X" })).toEqual({
      titulo: "Empresa X",
      feitoPor: null,
      casal: "",
    });
  });

  it("sem nome de quem escreveu, vai o casal", () => {
    expect(quemPedeEOCasal({ name: "  ", partnerA: "Ana", partnerB: "Rui" }).titulo).toBe(
      "Ana & Rui",
    );
  });

  it("só um dos noivos dado chega", () => {
    expect(nomesDoCasal("Ana", "")).toBe("Ana");
    expect(eUmDosNoivos("Maria", "Ana")).toBe(false);
  });
});
