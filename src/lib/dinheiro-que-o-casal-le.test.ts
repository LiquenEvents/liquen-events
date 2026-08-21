import { describe, it, expect } from "vitest";
import {
  normalizarValor,
  textoTemNumeroQueNaoSeLe,
  somaDosExtrasSemIva,
  totaisDaProposta,
  valorAdicionalParaOEcra,
  ressalvaDoValor,
} from "./proposal-budget";
import { round2 } from "./money";
import type { ProposalDoc } from "./proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DINHEIRO QUE CHEGA AO CASAL — AS REGRAS, NÃO OS SÍTIOS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Da caça exaustiva a bugs, bloco 1. São seis defeitos com uma raiz comum: um
 * número escrito por ela era lido, convertido ou somado de maneira diferente
 * conforme a folha que o ia desenhar.
 *
 * Este ficheiro prende as REGRAS e não os sítios. É o argumento que a própria
 * caça produziu: dos seis defeitos que já tinham acontecido uma vez, quatro
 * voltaram noutro sítio — porque o teste prendia o sítio e a regra ficou solta.
 *
 * Entradas cobertas: A3-001, A3-002, A3-006, A3-008 (leitura dos valores),
 * A3-004 (a unidade da coluna). O A1-001 é da rota, e vive no teste dela; o
 * A3-003 é da página, e vive no `Documento.test.tsx`.
 */

const doc = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    totalAmount: 10000,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    budgetExtrasSomam: true,
    budgetItems: [],
    budgetAmounts: [],
    budgetExtras: [],
    ...over,
  }) as unknown as ProposalDoc;

describe("um valor adicional com DOIS números não se lê — e não se inventa", () => {
  /**
   * A avaria medida: a limpeza deitava fora as LETRAS e com isso COLAVA os
   * dígitos que estavam à volta delas. Cada linha desta tabela é um número que
   * viajava para o PDF, para a página do casal, para o corpo do email, para o
   * sinal e para a factura.
   */
  const inventava: Array<[string, string]> = [
    ["de 800 a 1.200 €", "dava 8.001.200 — oito milhões"],
    ["800 a 1.200 €", "dava 8.001.200"],
    ["entre 800 € e 1.200 €", "dava 8.001.200"],
    ["1.500 € + 23% IVA", "dava 1,50 — perdia 1.498,50"],
    ["2 x 450,00 €", "dava 2.450,00 em vez de 900"],
    ["450,00 € por pessoa (x2)", "dava 450,002"],
    ["75,00 € (Évora, ida e volta 120 km)", "duas vírgulas ⇒ NaN, caía em silêncio"],
  ];

  it.each(inventava)("«%s» não se lê (%s)", (texto) => {
    expect(normalizarValor(texto)).toBeNull();
  });

  it.each(inventava)("«%s» é assinalado — não passa por «a definir»", (texto) => {
    expect(textoTemNumeroQueNaoSeLe(texto)).toBe(true);
  });

  /**
   * O contra-controlo, e é o que impede esta correcção de ser um exagero: tudo
   * o que tem UM número só continua a ler-se exactamente como antes.
   */
  const continuaAler: Array<[string, number]> = [
    ["896,00 €", 896],
    ["1 500 €", 1500],
    ["1.500", 1500],
    ["1500", 1500],
    ["1.500,50", 1500.5],
    ["1.234.567,89 €", 1234567.89],
    ["895,00 € + IVA", 895],
    ["-500,00 €", -500],
    ["0", 0],
  ];
  it.each(continuaAler)("«%s» continua a valer %d", (texto, esperado) => {
    expect(normalizarValor(texto)).toBe(esperado);
  });

  it("«a definir» e «sob consulta» não se lêem E não são assinalados", () => {
    for (const t of ["a definir", "sob consulta", "", "   "]) {
      expect(normalizarValor(t)).toBeNull();
      expect(textoTemNumeroQueNaoSeLe(t)).toBe(false);
    }
  });
});

describe("um valor que não se soma sai pelo nome no aviso", () => {
  it("nomeia a linha, para ela saber qual é que tem de reescrever", () => {
    const t = totaisDaProposta(
      doc({
        budgetExtras: [
          { label: "Deslocação da equipa", valueText: "de 800 a 1.200 €" },
        ] as ProposalDoc["budgetExtras"],
      }),
      30,
    );
    expect(t.fecha).toBe(false);
    expect(t.porQueNaoFecha.join(" ")).toContain("Deslocação da equipa");
  });

  it("um «a definir» deliberado NÃO acende aviso nenhum", () => {
    const t = totaisDaProposta(
      doc({
        budgetExtras: [
          { label: "Transporte", valueText: "a definir" },
        ] as ProposalDoc["budgetExtras"],
      }),
      30,
    );
    expect(t.porQueNaoFecha.join(" ")).not.toContain("Transporte");
  });

  it("o total a pagar negativo é nomeado pela CAUSA, não pelo sintoma", () => {
    // A3-006: um desconto maior do que o valor dos serviços. O aviso já
    // disparava, mas queixava-se do sinal e do saldo («0 + 0 ≠ −2460»).
    const t = totaisDaProposta(
      doc({
        budgetExtras: [
          { label: "Desconto comercial", valueText: "-12.000,00 €" },
        ] as ProposalDoc["budgetExtras"],
      }),
      30,
    );
    expect(t.aPagar).toBeLessThan(0);
    expect(t.porQueNaoFecha.some((m) => m.includes("total a pagar é negativo"))).toBe(true);
  });
});

describe("a coluna dos adicionais está na unidade da escada", () => {
  /**
   * A3-004. O caso é o da proposta real: bruto 3.025,80 lido COM IVA, com uma
   * deslocação de «75,00 €» calada. O que soma são 60,98 € de base — e imprimir
   * 75,00 ao lado de um subtotal de 2.399,02 € punha na folha uma parcela que
   * não somava com as outras:
   *
   *     2.399,02 + 75,00 = 2.474,02   ≠   2.460,00 impresso à frente
   */
  const contexto = { mode: "incluido" as const, vatRate: 0.23 };
  const extra = { label: "Deslocação da Equipa Líquen", valueText: "75,00 €" };

  it("o montante impresso é a BASE, não o número cru", () => {
    const v = valorAdicionalParaOEcra(extra, contexto);
    expect(v.montante).toBe(somaDosExtrasSemIva([extra], contexto));
    expect(v.montante).toBe(60.98);
    expect(v.montante).not.toBe(75);
  });

  it("o que ela escreveu não se perde — vai ao lado do nome", () => {
    const v = valorAdicionalParaOEcra(extra, contexto);
    expect(v.mostraTudo).toBe(true);
    expect(v.escrito).toBe("75,00 €");
  });

  it("quando o cru já É a base, ao lado do nome fica só a ressalva", () => {
    const e = { label: "Deslocação", valueText: "1.550,00 € + IVA (a confirmar)" };
    const v = valorAdicionalParaOEcra(e, { mode: "acrescer", vatRate: 0.23 });
    expect(v.montante).toBe(1550);
    expect(v.mostraTudo).toBe(false);
    expect(v.ressalva).toBe("a confirmar");
  });

  it("a coluna e o subtotal fecham o total, com a base de cada linha", () => {
    const d = doc({
      totalAmount: 3025.8,
      totalVatMode: "incluido",
      budgetExtras: [extra] as ProposalDoc["budgetExtras"],
    });
    const t = totaisDaProposta(d, 30);
    const daColuna = (d.budgetExtras ?? []).map(
      (e) => valorAdicionalParaOEcra(e, { mode: t.modo, vatRate: t.taxa }).montante ?? 0,
    );
    // É esta a soma que o casal faz com os olhos, na folha.
    expect(round2(t.servicos + daColuna.reduce((a, b) => a + b, 0))).toBe(t.total);
  });

  it("um valor ilegível imprime «—» e não um número inventado", () => {
    const v = valorAdicionalParaOEcra(
      { label: "Transporte", valueText: "de 800 a 1.200 €" },
      contexto,
    );
    expect(v.montante).toBeNull();
  });
});

describe("a ressalva é a mesma no PDF e na página", () => {
  it.each([
    [
      "12.500,00 € + IVA (a confirmar consoante a distância final)",
      "a confirmar consoante a distância final",
    ],
    ["950,50 € + IVA", ""],
    ["12.500,00 €", ""],
  ])("«%s» → «%s»", (entrada, esperado) => {
    expect(ressalvaDoValor(entrada)).toBe(esperado);
  });
});
