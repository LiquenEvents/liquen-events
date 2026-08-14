import { describe, it, expect } from "vitest";
import {
  PARAMETROS_OMISSAO,
  custoPorKm,
  explicarCustoKm,
  kmSugerido,
  rotuloDeslocacao,
  sugerirDeslocacao,
} from "./deslocacao";

describe("o preço por quilómetro", () => {
  it("soma combustível, portagens e desgaste", () => {
    // Só as parcelas do custo: a sede e a franquia não entram no preço de um
    // quilómetro, e o tipo do `custoPorKm` passou a dizê-lo.
    const c = custoPorKm({
      consumoLPor100Km: 10,
      precoLitro: 1.5,
      portagensPorKm: 0.1,
      desgastePorKm: 0.05,
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CASA É EM ÉVORA — MAS ISSO É UMA DEFINIÇÃO, NÃO UM FACTO DO CÓDIGO
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("a base de onde se parte", () => {
  it("nasce em Évora, e quem lhe não tocar não vê número nenhum mudar", () => {
    expect(PARAMETROS_OMISSAO.base).toBe("Évora");
    expect(sugerirDeslocacao("Évora")!.isento).toBe(true);
    expect(sugerirDeslocacao("Lisboa")!.kmSoIda).toBe(sugerirDeslocacao("Lisboa", {})!.kmSoIda);
  });

  it("mudar a base muda a conta — é para isso que existe", () => {
    // Com a casa em Faro, ir a Albufeira deixa de ser uma viagem de meio país.
    const deEvora = sugerirDeslocacao("Albufeira")!;
    const deFaro = sugerirDeslocacao("Albufeira", { base: "Faro" })!;
    expect(deFaro.kmSoIda).toBeLessThan(deEvora.kmSoIda);
    expect(deFaro.valor).toBeLessThan(deEvora.valor);
    // E a franquia passa a ser à volta da nova casa, não da antiga.
    expect(sugerirDeslocacao("Faro", { base: "Faro" })!.isento).toBe(true);
    expect(sugerirDeslocacao("Évora", { base: "Faro" })!.isento).toBe(false);
  });

  it("a base escrita à pressa é a mesma base", () => {
    // Ela escreve "evora" no campo da sede; não pode dar uma conta diferente
    // de "Évora".
    expect(sugerirDeslocacao("Lisboa", { base: "evora" })!.valor).toBe(
      sugerirDeslocacao("Lisboa", { base: "Évora" })!.valor,
    );
    expect(sugerirDeslocacao("Lisboa", { base: "  ÉVORA " })!.valor).toBe(
      sugerirDeslocacao("Lisboa", { base: "Évora" })!.valor,
    );
  });

  it("uma base que a tabela não conhece não inventa distância nenhuma", () => {
    // A sede pode mudar para uma terra pequena. Aí o honesto é não sugerir
    // nada e deixar que os quilómetros sejam escritos à mão.
    expect(sugerirDeslocacao("Lisboa", { base: "Peço à Ínsua" })).toBeNull();
    expect(sugerirDeslocacao("Lisboa", { base: "" })).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUALQUER SÍTIO DO PAÍS, E NÃO SÓ OS QUE A TABELA CONHECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A tabela continua a servir para SUGERIR. O que decide é o número que ela
 * escreve — uma distância escrita por quem faz a estrada vale mais do que uma
 * adivinhada a partir do centro de uma vila.
 */
describe("os quilómetros escritos à mão", () => {
  it("dão conta a um destino que a tabela nunca ouviu nomear", () => {
    const s = sugerirDeslocacao("Herdade do Zambujeiro do Mar", {}, { km: 180 })!;
    expect(s).not.toBeNull();
    expect(s.kmSoIda).toBe(180);
    expect(s.kmCobrados).toBe(360);
    expect(s.valor).toBe(Math.round(360 * s.custoKm.total));
  });

  it("ganham à tabela — quem anda a estrada é ela", () => {
    const tabela = sugerirDeslocacao("Lisboa")!;
    const escrito = sugerirDeslocacao("Lisboa", {}, { km: 200 })!;
    expect(tabela.kmSoIda).not.toBe(200);
    expect(escrito.kmSoIda).toBe(200);
    expect(escrito.origemDosKm).toBe("escritos");
    expect(tabela.origemDosKm).toBe("tabela");
  });

  it("tornam a base indiferente — o número já está medido", () => {
    const s = sugerirDeslocacao("Peço à Ínsua", { base: "Terra nenhuma" }, { km: 90 })!;
    expect(s).not.toBeNull();
    expect(s.kmSoIda).toBe(90);
  });

  it("a sugestão para o campo vem da tabela, e diz que não sabe quando não sabe", () => {
    expect(kmSugerido("Lisboa")).toBe(135);
    expect(kmSugerido("Peço à Ínsua")).toBeNull();
    expect(kmSugerido("Funchal")).toBeNull();
    // E respeita a base escolhida.
    expect(kmSugerido("Albufeira", "Faro")!).toBeLessThan(kmSugerido("Albufeira")!);
  });
});

describe("os casos que partem contas", () => {
  it("zero quilómetros é o evento na própria casa — isento, e não desconhecido", () => {
    // Zero e «não sei» eram a mesma coisa no ecrã e não são a mesma coisa na
    // proposta: um é uma regra escrita nas condições, o outro é um buraco.
    const s = sugerirDeslocacao("O quintal cá de casa", {}, { km: 0 })!;
    expect(s).not.toBeNull();
    expect(s.kmSoIda).toBe(0);
    expect(s.valor).toBe(0);
    expect(s.isento).toBe(true);
    expect(s.formula).toContain("sem deslocação a cobrar");
  });

  it("um destino em branco com os quilómetros escritos continua a dar conta", () => {
    const s = sugerirDeslocacao("", {}, { km: 120 })!;
    expect(s).not.toBeNull();
    expect(s.kmSoIda).toBe(120);
    // Sem os quilómetros, um destino em branco continua a não sugerir zero.
    expect(sugerirDeslocacao("")).toBeNull();
    expect(sugerirDeslocacao(null)).toBeNull();
  });

  it("os acentos não estragam nada", () => {
    expect(sugerirDeslocacao("Peço à Ínsua")).toBeNull();
    const s = sugerirDeslocacao("Peço à Ínsua", {}, { km: 310 })!;
    expect(s.valor).toBeGreaterThan(0);
    expect(s.provavelAlojamento).toBe(true);
  });

  it("uma distância enorme continua a ser uma multiplicação, sem tectos escondidos", () => {
    const s = sugerirDeslocacao("Um casamento muito longe", {}, { km: 5000 })!;
    expect(s.kmCobrados).toBe(10_000);
    expect(Number.isFinite(s.valor)).toBe(true);
    expect(s.valor).toBe(Math.round(10_000 * s.custoKm.total));
    expect(s.provavelAlojamento).toBe(true);
  });

  it("o que não é uma distância não passa por uma", () => {
    // Um campo a meio de ser escrito, um sinal trocado, um infinito vindo de
    // uma divisão. Nada disto são quilómetros: volta-se ao que se sabia, que é
    // a tabela — ou a nada, quando nem a tabela sabe.
    for (const lixo of [Number.NaN, -10, Number.POSITIVE_INFINITY]) {
      expect(sugerirDeslocacao("Peço à Ínsua", {}, { km: lixo })).toBeNull();
      expect(sugerirDeslocacao("Lisboa", {}, { km: lixo })!.kmSoIda).toBe(
        sugerirDeslocacao("Lisboa")!.kmSoIda,
      );
    }
  });

  it("o mesmo sítio escrito de duas maneiras dá o mesmo valor", () => {
    expect(sugerirDeslocacao("evora")!.valor).toBe(sugerirDeslocacao("Évora")!.valor);
    expect(sugerirDeslocacao("  LISBOA ")!.valor).toBe(sugerirDeslocacao("Lisboa")!.valor);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA MUDANÇA DESTAS NÃO PODE REESCREVER O PREÇO DE UM ORÇAMENTO JÁ ENVIADO
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("o que já estava calculado fica como estava", () => {
  it("com a base por omissão e sem quilómetros escritos, a conta é a de sempre", () => {
    // Os números pregados de propósito: são os que saíram nas propostas feitas
    // até aqui. Se um refactor os mexer, é aqui que se dá por isso — e não na
    // caixa de correio de um casal.
    expect(sugerirDeslocacao("Lisboa")).toMatchObject({ kmSoIda: 135, valor: 92 });
    expect(sugerirDeslocacao("Porto")).toMatchObject({ kmSoIda: 370, valor: 252 });
    expect(sugerirDeslocacao("Faro")).toMatchObject({ kmSoIda: 215, valor: 146 });
    expect(sugerirDeslocacao("Palmela")).toMatchObject({ kmSoIda: 105, valor: 71 });
    expect(sugerirDeslocacao("Arraiolos")).toMatchObject({ kmSoIda: 20, valor: 0 });
  });

  it("com os quilómetros gravados na proposta, mudar a base não lhes toca", () => {
    // É esta a âncora: a partir do momento em que o número está escrito no
    // documento, mudar a sede é uma decisão sobre as PRÓXIMAS propostas.
    const antes = sugerirDeslocacao("Herdade X", { base: "Évora" }, { km: 240 })!;
    const depois = sugerirDeslocacao("Herdade X", { base: "Porto" }, { km: 240 })!;
    expect(depois.kmSoIda).toBe(antes.kmSoIda);
    expect(depois.valor).toBe(antes.valor);
  });
});
