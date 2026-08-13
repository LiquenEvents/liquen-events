import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { abaixoDoLimite, custosDe, margemTotal, margensPorLinha } from "./margem";

const doc = (over: Partial<ProposalDoc>): ProposalDoc => over as ProposalDoc;

describe("custos por linha", () => {
  it("acompanham sempre o comprimento das linhas", () => {
    // Um documento antigo não tem `budgetCosts` nenhum, e um documento a que se
    // acrescentou uma linha tem-no mais curto. Nos dois casos o array lido tem
    // de ter exactamente o tamanho das linhas, senão o índice 3 é o preço da
    // linha 4 e a margem sai de outra linha qualquer.
    expect(custosDe(doc({ budgetItems: ["a", "b", "c"] }))).toEqual([null, null, null]);
    expect(custosDe(doc({ budgetItems: ["a", "b", "c"], budgetCosts: [10] }))).toEqual([
      10,
      null,
      null,
    ]);
    expect(custosDe(doc({ budgetItems: ["a"], budgetCosts: [10, 20, 30] }))).toEqual([10]);
  });

  it("ignora o que não é um número", () => {
    const d = doc({ budgetItems: ["a", "b"], budgetCosts: [Number.NaN, 5] });
    expect(custosDe(d)).toEqual([null, 5]);
  });
});

describe("margem por linha", () => {
  it("dá euros e percentagem sobre o PREÇO", () => {
    const d = doc({ budgetItems: ["Flores"], budgetAmounts: [1000], budgetCosts: [400] });
    const [l] = margensPorLinha(d);
    expect(l.margem).toBe(600);
    // 60% do que se cobra fica cá dentro. Sobre o custo daria 150% (markup) —
    // confundir os dois é a forma clássica de descontar até ao prejuízo.
    expect(l.percentagem).toBe(60);
  });

  it("cala-se quando falta o preço ou o custo", () => {
    const d = doc({
      budgetItems: ["sem custo", "sem preço"],
      budgetAmounts: [1000, null],
      budgetCosts: [null, 300],
    });
    expect(margensPorLinha(d).map((l) => l.margem)).toEqual([null, null]);
  });

  it("uma linha que custa e não cobra é -100%, não é infinito", () => {
    const d = doc({ budgetItems: ["oferta"], budgetAmounts: [0], budgetCosts: [250] });
    expect(margensPorLinha(d)[0].percentagem).toBe(-100);
  });

  it("uma linha negativa aparece como negativa, sem ser escondida", () => {
    const d = doc({ budgetItems: ["mau negócio"], budgetAmounts: [100], budgetCosts: [150] });
    const [l] = margensPorLinha(d);
    expect(l.margem).toBe(-50);
    expect(l.percentagem).toBe(-50);
  });
});

describe("margem do conjunto", () => {
  it("só conta as linhas que têm preço E custo", () => {
    // Somar o preço de todas e dividir pelos custos de algumas dava uma margem
    // inventada, e sempre generosa.
    const d = doc({
      budgetItems: ["com custo", "sem custo"],
      budgetAmounts: [1000, 5000],
      budgetCosts: [600, null],
    });
    const m = margemTotal(d)!;
    expect(m.precoComparavel).toBe(1000);
    expect(m.custo).toBe(600);
    expect(m.percentagem).toBe(40);
    expect(m.parcial).toBe(true);
    expect(m.linhasComCusto).toBe(1);
    expect(m.linhasTotais).toBe(2);
  });

  it("não é parcial quando todas as linhas têm custo", () => {
    const d = doc({
      budgetItems: ["a", "b"],
      budgetAmounts: [1000, 1000],
      budgetCosts: [500, 300],
    });
    const m = margemTotal(d)!;
    expect(m.parcial).toBe(false);
    expect(m.margem).toBe(1200);
    expect(m.percentagem).toBe(60);
  });

  it("sem um único custo não há nada a dizer", () => {
    expect(margemTotal(doc({ budgetItems: ["a"], budgetAmounts: [1000] }))).toBeNull();
    expect(margemTotal(doc({ budgetItems: [] }))).toBeNull();
  });
});

describe("o limite", () => {
  it("avisa por baixo do limite e cala-se por cima", () => {
    const magra = margemTotal(
      doc({ budgetItems: ["a"], budgetAmounts: [1000], budgetCosts: [800] }),
    );
    const gorda = margemTotal(
      doc({ budgetItems: ["a"], budgetAmounts: [1000], budgetCosts: [300] }),
    );
    expect(abaixoDoLimite(magra, 35)).toBe(true);
    expect(abaixoDoLimite(gorda, 35)).toBe(false);
  });

  it("sem margem devolve null — não diz que está tudo bem", () => {
    // A diferença importa: `false` seria "verifiquei e está acima do limite".
    expect(abaixoDoLimite(null, 35)).toBeNull();
  });
});
