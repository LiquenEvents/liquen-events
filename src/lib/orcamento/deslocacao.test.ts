import { describe, it, expect } from "vitest";
import {
  PARAMETROS_OMISSAO,
  custoPorKm,
  explicarCustoKm,
  rotuloDeslocacao,
  sugerirDeslocacao,
} from "./deslocacao";

describe("o preço por quilómetro", () => {
  it("soma combustível, portagens e desgaste", () => {
    const c = custoPorKm({
      consumoLPor100Km: 10,
      precoLitro: 1.5,
      portagensPorKm: 0.1,
      desgastePorKm: 0.05,
      franquiaKm: 0,
      idaEVolta: true,
    });
    // 10 l/100 km a 1,50 €/l = 0,15 €/km de combustível.
    expect(c.combustivel).toBe(0.15);
    expect(c.total).toBe(0.3);
  });

  it("o total não é a soma dos três já arredondados", () => {
    // Arredondar três vezes e somar dava um cêntimo a mais por quilómetro, e a
    // 300 km isso são três euros vindos do nada.
    const p = {
      consumoLPor100Km: 8.7,
      precoLitro: 1.679,
      portagensPorKm: 0.087,
      desgastePorKm: 0.094,
      franquiaKm: 0,
      idaEVolta: true,
    };
    const c = custoPorKm(p);
    const exacto = (p.consumoLPor100Km / 100) * p.precoLitro + p.portagensPorKm + p.desgastePorKm;
    expect(c.total).toBe(Math.round(exacto * 100) / 100);
  });

  it("números negativos não descontam nada", () => {
    const c = custoPorKm({ ...PARAMETROS_OMISSAO, portagensPorKm: -5 });
    expect(c.portagens).toBe(0);
    expect(c.total).toBeGreaterThan(0);
  });
});

describe("a conta da viagem", () => {
  it("cobra ida e volta, não só a ida", () => {
    const s = sugerirDeslocacao("Lisboa")!;
    expect(s.kmCobrados).toBe(s.kmSoIda * 2);
    expect(s.valor).toBe(Math.round(s.kmCobrados * s.custoKm.total));
  });

  it("com ida e volta desligada, cobra a distância uma vez", () => {
    const s = sugerirDeslocacao("Lisboa", { idaEVolta: false })!;
    expect(s.kmCobrados).toBe(s.kmSoIda);
  });

  it("mostra a conta, para se poder responder a 'porquê este valor?'", () => {
    const s = sugerirDeslocacao("Lisboa")!;
    expect(s.formula).toContain("ida e volta");
    expect(s.formula).toContain("/km");
    expect(explicarCustoKm()).toContain("combustível");
    expect(explicarCustoKm()).toContain("portagens");
    expect(explicarCustoKm()).toContain("desgaste");
  });

  it("mais longe custa mais — sem degraus nem patamares", () => {
    const palmela = sugerirDeslocacao("Palmela")!;
    const alenquer = sugerirDeslocacao("Alenquer")!;
    const porto = sugerirDeslocacao("Porto")!;
    // O que ela disse: Palmela, Alenquer e Évora implicam custos diferentes.
    // Com uma conta por quilómetro isso acontece por construção.
    expect(alenquer.valor).toBeGreaterThan(palmela.valor);
    expect(porto.valor).toBeGreaterThan(alenquer.valor);
    expect(sugerirDeslocacao("Évora")!.valor).toBe(0);
  });
});

describe("a isenção do distrito de Évora", () => {
  it("dentro da franquia não se cobra, e diz-se que é por regra", () => {
    // É o que as condições gerais prometem por escrito. Zero aqui não é um
    // engano de cálculo, e o ecrã tem de os poder distinguir.
    const evora = sugerirDeslocacao("Évora")!;
    expect(evora.valor).toBe(0);
    expect(evora.isento).toBe(true);
    expect(evora.formula).toContain("sem deslocação a cobrar");

    expect(sugerirDeslocacao("Arraiolos")!.isento).toBe(true);
  });

  it("fora da franquia cobra-se, e não é isenção", () => {
    const lisboa = sugerirDeslocacao("Lisboa")!;
    expect(lisboa.isento).toBe(false);
    expect(lisboa.valor).toBeGreaterThan(0);
  });

  it("a franquia é dela para mudar", () => {
    // Sem franquia nenhuma, ir a Arraiolos passa a ter conta.
    const semFranquia = sugerirDeslocacao("Arraiolos", { franquiaKm: 0 })!;
    expect(semFranquia.isento).toBe(false);
    expect(semFranquia.valor).toBeGreaterThan(0);
  });
});

describe("o preço do combustível muda o valor", () => {
  it("gasóleo mais caro dá uma deslocação mais cara", () => {
    const barato = sugerirDeslocacao("Porto", { precoLitro: 1.4 })!;
    const caro = sugerirDeslocacao("Porto", { precoLitro: 2.1 })!;
    expect(caro.valor).toBeGreaterThan(barato.valor);
  });

  it("uma carrinha que bebe mais também", () => {
    const economica = sugerirDeslocacao("Porto", { consumoLPor100Km: 6 })!;
    const bebedora = sugerirDeslocacao("Porto", { consumoLPor100Km: 14 })!;
    expect(bebedora.valor).toBeGreaterThan(economica.valor);
  });
});

describe("quando não se sabe onde é", () => {
  it("NÃO sugere zero", () => {
    // Zero para um casamento no Gerês é dinheiro perdido com a assinatura dela
    // em baixo. Melhor não sugerir nada e deixar o campo a pedir atenção.
    expect(sugerirDeslocacao("Portugal")).toBeNull();
    expect(sugerirDeslocacao("")).toBeNull();
    expect(sugerirDeslocacao(null)).toBeNull();
  });

  it("as ilhas não se fazem de carrinha", () => {
    expect(sugerirDeslocacao("Funchal")).toBeNull();
  });
});

describe("dormir fora", () => {
  it("assinala-se a partir de 200 km, sem entrar na conta", () => {
    expect(sugerirDeslocacao("Palmela")!.provavelAlojamento).toBe(false);
    const porto = sugerirDeslocacao("Porto")!;
    expect(porto.provavelAlojamento).toBe(true);
    // O alojamento é uma decisão à parte: não está somado ao valor.
    expect(porto.valor).toBe(Math.round(porto.kmCobrados * porto.custoKm.total));
  });
});

describe("a linha que entra na proposta", () => {
  it("escreve-se em euros e com IVA a acrescer, como as outras", () => {
    const linha = rotuloDeslocacao(sugerirDeslocacao("Lisboa")!);
    expect(linha.label).toBe("Deslocação");
    expect(linha.valueText).toMatch(/€/);
    expect(linha.valueText).toMatch(/\+ IVA$/);
  });
});
