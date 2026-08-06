import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import {
  CONVIDADOS_POR_MESA_OMISSAO,
  convidadosDoDoc,
  escalasDe,
  formulaDaLinha,
  mesasPara,
  recalcular,
  totalDaLinha,
  unidadesDe,
} from "./escala";

const doc = (over: Partial<ProposalDoc>): ProposalDoc => over as ProposalDoc;

describe("mesas", () => {
  it("arredonda para cima — onze pessoas em mesas de dez são duas mesas", () => {
    // Arredondar para baixo era orçamentar um casamento onde alguém fica de pé.
    expect(mesasPara(11, 10)).toBe(2);
    expect(mesasPara(120, 10)).toBe(12);
    expect(mesasPara(125, 10)).toBe(13);
  });

  it("respeita mesas de outro tamanho", () => {
    expect(mesasPara(120, 8)).toBe(15);
    expect(mesasPara(120, 12)).toBe(10);
  });

  it("sem convidados não há mesas", () => {
    expect(mesasPara(0, 10)).toBe(0);
    expect(mesasPara(-5, 10)).toBe(0);
  });

  it("um tamanho de mesa impossível volta ao de omissão", () => {
    expect(mesasPara(100, 0)).toBe(mesasPara(100, CONVIDADOS_POR_MESA_OMISSAO));
  });
});

describe("o que cada linha multiplica", () => {
  it("por convidado conta pessoas; por mesa conta mesas; fixa conta uma vez", () => {
    expect(unidadesDe({ tipo: "por-convidado", unitario: 12 }, 125, 10)).toBe(125);
    expect(unidadesDe({ tipo: "por-mesa", unitario: 45 }, 125, 10)).toBe(13);
    expect(unidadesDe(null, 125, 10)).toBe(1);
  });

  it("o total é o unitário vezes as unidades", () => {
    expect(totalDaLinha({ tipo: "por-mesa", unitario: 45 }, 125, 10)).toBe(585);
    expect(totalDaLinha({ tipo: "por-convidado", unitario: 12.5 }, 120, 10)).toBe(1500);
  });

  it("uma linha fixa não tem total calculado — o preço dela é escrito à mão", () => {
    expect(totalDaLinha(null, 125, 10)).toBeNull();
  });
});

describe("a fórmula que aparece ao lado", () => {
  it("diz de onde vem o número", () => {
    // Um total que muda sozinho e não explica porquê é um total em que se deixa
    // de confiar à primeira surpresa.
    expect(formulaDaLinha({ tipo: "por-mesa", unitario: 45 }, 125, 10)).toMatch(/^13 mesas × /);
    expect(formulaDaLinha({ tipo: "por-convidado", unitario: 12 }, 125, 10)).toMatch(
      /^125 pessoas × /,
    );
  });

  it("põe o singular quando é uma só", () => {
    expect(formulaDaLinha({ tipo: "por-mesa", unitario: 45 }, 6, 10)).toMatch(/^1 mesa × /);
    expect(formulaDaLinha({ tipo: "por-convidado", unitario: 45 }, 1, 10)).toMatch(/^1 pessoa × /);
  });

  it("as linhas fixas não têm fórmula nenhuma", () => {
    expect(formulaDaLinha(null, 125, 10)).toBe("");
  });
});

describe("recalcular quando os convidados mudam", () => {
  const base = doc({
    budgetItems: ["Arco floral", "Arranjos de mesa", "Menu"],
    budgetAmounts: [800, 540, 1200],
    budgetScales: [
      null,
      { tipo: "por-mesa", unitario: 45 },
      { tipo: "por-convidado", unitario: 12 },
    ],
  });

  it("escreve o resultado no MESMO sítio onde os preços já viviam", () => {
    // É o que mantém a soma, o desvio, a margem e o resumo a funcionar sem
    // saberem que aquele número foi calculado.
    const d = recalcular(base, 125);
    expect(d.budgetAmounts).toEqual([800, 585, 1500]);
  });

  it("não toca nas linhas fixas", () => {
    const d = recalcular(base, 300);
    expect(d.budgetAmounts![0]).toBe(800);
  });

  it("mudar os convidados muda só o que escala", () => {
    const cento = recalcular(base, 100);
    const duzentos = recalcular(base, 200);
    expect(cento.budgetAmounts![1]).toBe(450); // 10 mesas × 45
    expect(duzentos.budgetAmounts![1]).toBe(900); // 20 mesas × 45
    expect(cento.budgetAmounts![0]).toBe(duzentos.budgetAmounts![0]);
  });

  it("respeita as mesas de outro tamanho", () => {
    const d = recalcular({ ...base, convidadosPorMesa: 8 }, 120);
    expect(d.budgetAmounts![1]).toBe(675); // 15 mesas × 45
  });

  it("um documento sem escalas nenhumas fica exactamente como estava", () => {
    const semEscalas = doc({ budgetItems: ["Arco"], budgetAmounts: [800] });
    expect(recalcular(semEscalas, 300)).toBe(semEscalas);
  });

  it("uma escala estragada lê-se como linha fixa, em vez de dar zero", () => {
    // Um documento antigo, ou um rascunho corrompido, não pode transformar um
    // preço de 800 € num zero silencioso.
    const estragado = doc({
      budgetItems: ["Arco"],
      budgetAmounts: [800],
      budgetScales: [{ tipo: "por-lua-cheia" } as never],
    });
    expect(escalasDe(estragado)).toEqual([null]);
    expect(recalcular(estragado, 125).budgetAmounts).toEqual([800]);
  });
});

describe("ler os convidados do documento", () => {
  it('entende "125 pax" e as variantes que ela escreve', () => {
    expect(convidadosDoDoc(doc({ guests: "125 pax" }))).toBe(125);
    expect(convidadosDoDoc(doc({ guests: "125" }))).toBe(125);
    expect(convidadosDoDoc(doc({ guests: "1.250 convidados" }))).toBe(1250);
  });

  it("devolve zero quando não há número — não inventa um", () => {
    expect(convidadosDoDoc(doc({ guests: "a definir" }))).toBe(0);
    expect(convidadosDoDoc(doc({ guests: "" }))).toBe(0);
  });
});
