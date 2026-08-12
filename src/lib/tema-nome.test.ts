import { describe, it, expect } from "vitest";
import { arrumarNomeDeTema, arrumosDeNomes, nomePrecisaDeArrumo } from "./tema-nome";

describe("arrumarNomeDeTema", () => {
  it("põe em caixa de título o que está em minúsculas", () => {
    // Os casos reais da biblioteca de hoje.
    expect(arrumarNomeDeTema("bouquets campestres")).toBe("Bouquets Campestres");
    expect(arrumarNomeDeTema("lapelas")).toBe("Lapelas");
  });

  it("deixa as preposições em minúsculas no meio, mas não no início", () => {
    expect(arrumarNomeDeTema("bouquets branco e amarelo")).toBe("Bouquets Branco e Amarelo");
    expect(arrumarNomeDeTema("decor corredor e altar igreja")).toBe(
      "Decor Corredor e Altar Igreja",
    );
    // No início é palavra do nome, não ligação.
    expect(arrumarNomeDeTema("de manhã")).toBe("De Manhã");
  });

  it("devolve os acentos que faltam", () => {
    expect(arrumarNomeDeTema("Cerimonia Simbólica")).toBe("Cerimónia Simbólica");
    expect(arrumarNomeDeTema("Classico intemporal")).toBe("Clássico Intemporal");
  });

  it("corrige o «Seatings Plans», que põe o plural na palavra errada", () => {
    expect(arrumarNomeDeTema("Seatings Plans")).toBe("Seating Plans");
    expect(arrumarNomeDeTema("seatings plans")).toBe("Seating Plans");
    expect(arrumarNomeDeTema("SEATINGS PLANS")).toBe("Seating Plans");
  });

  it("colapsa os espaços a mais, incluindo o do fim que ninguém vê", () => {
    expect(arrumarNomeDeTema("  Bouquets   Campestres ")).toBe("Bouquets Campestres");
  });

  it("não mexe no que já está bem", () => {
    for (const bom of ["Bouquets Branco e Amarelo", "Seating Plans", "Entrada Igrejas"]) {
      expect(arrumarNomeDeTema(bom)).toBe(bom);
    }
  });

  it("mantém as siglas em capitulares", () => {
    expect(arrumarNomeDeTema("mesa de dj")).toBe("Mesa de DJ");
  });

  it("aguenta o vazio e o lixo sem rebentar", () => {
    expect(arrumarNomeDeTema("")).toBe("");
    expect(arrumarNomeDeTema("   ")).toBe("");
    expect(arrumarNomeDeTema(undefined as unknown as string)).toBe("");
  });

  it("é idempotente: arrumar o arrumado não mexe mais", () => {
    for (const nome of ["bouquets campestres", "Cerimonia Simbólica", "Seatings Plans"]) {
      const uma = arrumarNomeDeTema(nome);
      expect(arrumarNomeDeTema(uma)).toBe(uma);
    }
  });
});

describe("nomePrecisaDeArrumo", () => {
  it("só diz que sim quando há mesmo o que propor", () => {
    expect(nomePrecisaDeArrumo("bouquets campestres")).toBe(true);
    expect(nomePrecisaDeArrumo("Bouquets Campestres")).toBe(false);
    expect(nomePrecisaDeArrumo("")).toBe(false);
  });
});

describe("arrumosDeNomes", () => {
  it("mostra o antes e o depois, e cala-se sobre o que já está bem", () => {
    const r = arrumosDeNomes([
      "bouquets campestres",
      "Bouquets Branco e Amarelo",
      "Seatings Plans",
      "Cerimonia Simbólica",
    ]);
    expect(r).toEqual([
      { antes: "bouquets campestres", depois: "Bouquets Campestres" },
      { antes: "Seatings Plans", depois: "Seating Plans" },
      { antes: "Cerimonia Simbólica", depois: "Cerimónia Simbólica" },
    ]);
  });
});
