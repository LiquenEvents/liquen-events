import { describe, it, expect } from "vitest";
import {
  ESCALOES_OMISSAO,
  escaloesValidos,
  rotuloDeslocacao,
  sugerirDeslocacao,
} from "./deslocacao";

describe("sugerir a deslocação", () => {
  it("Évora não paga deslocação — é a isenção que a cláusula já dizia", () => {
    expect(sugerirDeslocacao("Évora")!.valor).toBe(0);
    expect(sugerirDeslocacao("Arraiolos")!.valor).toBe(0);
  });

  it("os três sítios do exemplo dela levam valores diferentes", () => {
    const palmela = sugerirDeslocacao("Palmela")!;
    const alenquer = sugerirDeslocacao("Alenquer")!;
    const evora = sugerirDeslocacao("Évora")!;
    expect(evora.valor).toBe(0);
    expect(palmela.valor).toBeGreaterThan(0);
    expect(alenquer.valor).toBeGreaterThan(palmela.valor);
  });

  it("mostra de onde veio o número", () => {
    const s = sugerirDeslocacao("Faro")!;
    expect(s.km).toBeGreaterThan(150);
    expect(s.escalao.valor).toBe(s.valor);
  });

  it("a partir de 200 km conta-se com dormir fora", () => {
    expect(sugerirDeslocacao("Palmela")!.provavelAlojamento).toBe(false);
    expect(sugerirDeslocacao("Porto")!.provavelAlojamento).toBe(true);
  });

  it("sem sítio reconhecível NÃO sugere zero", () => {
    // Zero para um casamento no Gerês é dinheiro perdido com a assinatura dela
    // em baixo. Melhor não sugerir nada e deixar o campo a pedir atenção.
    expect(sugerirDeslocacao("Portugal")).toBeNull();
    expect(sugerirDeslocacao("")).toBeNull();
    expect(sugerirDeslocacao(null)).toBeNull();
  });

  it("as ilhas não têm estrada, logo não têm escalão", () => {
    expect(sugerirDeslocacao("Funchal")).toBeNull();
  });
});

describe("escalões definidos por ela", () => {
  it("respeita a lista dela em vez da de omissão", () => {
    const meus = [
      { ateKm: 50, valor: 0 },
      { ateKm: Number.POSITIVE_INFINITY, valor: 999 },
    ];
    expect(sugerirDeslocacao("Lisboa", meus)!.valor).toBe(999);
  });

  it("uma lista mal ordenada não dá o valor errado", () => {
    const desordenados = [
      { ateKm: 1000, valor: 500 },
      { ateKm: 50, valor: 10 },
    ];
    // Évora está a 0 km: sem ordenar, o primeiro que "cobre" seria o de 1000.
    expect(sugerirDeslocacao("Évora", desordenados)!.valor).toBe(10);
  });

  it("deita fora escalões impossíveis em vez de os usar", () => {
    const sujos = [
      { ateKm: 0, valor: 10 },
      { ateKm: 100, valor: -5 },
      { ateKm: 100, valor: 50 },
    ];
    expect(escaloesValidos(sujos)).toEqual([{ ateKm: 100, valor: 50 }]);
  });

  it("sem escalões nenhuns não inventa um valor", () => {
    expect(sugerirDeslocacao("Lisboa", [])).toBeNull();
  });

  it("uma lista sem tecto aplica o último — o lado seguro do erro", () => {
    const semTecto = [
      { ateKm: 10, valor: 0 },
      { ateKm: 20, valor: 50 },
    ];
    expect(sugerirDeslocacao("Porto", semTecto)!.valor).toBe(50);
  });
});

describe("a linha que entra na proposta", () => {
  it("escreve-se em euros e com IVA a acrescer, como as outras", () => {
    const s = sugerirDeslocacao("Lisboa", ESCALOES_OMISSAO)!;
    const linha = rotuloDeslocacao(s);
    expect(linha.label).toBe("Deslocação");
    expect(linha.valueText).toMatch(/€/);
    expect(linha.valueText).toMatch(/\+ IVA$/);
  });
});
