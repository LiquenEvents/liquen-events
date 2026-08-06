import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { diferencas, resumo } from "./diferencas";

const doc = (over: Partial<ProposalDoc>): ProposalDoc => over as ProposalDoc;

/** As frases todas, juntas, que é como elas aparecem no ecrã. */
const frases = (a: ProposalDoc, b: ProposalDoc) => diferencas(a, b).map((m) => m.texto);

describe("o total", () => {
  it("vem primeiro, porque é o que se pergunta primeiro", () => {
    const m = diferencas(
      doc({ totalAmount: 8000, budgetItems: ["Flores"], budgetAmounts: [1000] }),
      doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [2500] }),
    );
    expect(m[0].onde).toBe("Total");
    expect(m[0].texto).toContain("8000");
    expect(m[0].texto).toContain("9500");
  });

  it("cêntimos de arredondamento não são uma alteração", () => {
    // Recalcular a escala por convidados escreve 1234.5600000000001 onde estava
    // 1234.56. Anunciar isso como "o total mudou" é mentir à cara dela.
    const m = diferencas(doc({ totalAmount: 1234.56 }), doc({ totalAmount: 1234.5600000001 }));
    expect(m).toEqual([]);
  });
});

describe("as linhas do orçamento", () => {
  it("distingue entrar, sair e mudar de preço", () => {
    const antes = doc({
      budgetItems: ["Flores", "Wedding Coordinator", "Iluminação"],
      budgetAmounts: [800, 1200, 400],
    });
    const depois = doc({
      budgetItems: ["Flores", "Iluminação", "Arco"],
      budgetAmounts: [950, 400, 300],
    });
    const t = frases(antes, depois);
    expect(t.some((x) => x.includes("Flores") && x.includes("800") && x.includes("950"))).toBe(
      true,
    );
    expect(t.some((x) => x.startsWith('Entrou "Arco"'))).toBe(true);
    expect(t.some((x) => x === 'Saiu "Wedding Coordinator"')).toBe(true);
    // A que não mexeu não aparece: uma lista que repete o que ficou igual
    // obriga a lê-la toda para descobrir o que mudou.
    expect(t.some((x) => x.includes("Iluminação"))).toBe(false);
  });

  it("um preço que aparece não se conta como um preço que muda", () => {
    const t = frases(
      doc({ budgetItems: ["Flores"], budgetAmounts: [] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
    );
    // Sem o `€` literal: o `Intl` põe um espaço INSEPARÁVEL antes do símbolo, e
    // uma comparação com o espaço normal falha por uma diferença invisível.
    expect(t).toHaveLength(1);
    expect(t[0]).toContain("passou a ter preço");
    expect(t[0]).toContain("800,00");
  });

  it("um preço que desaparece diz quanto era", () => {
    const t = frases(
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [] }),
    );
    expect(t[0]).toContain("ficou sem preço");
    expect(t[0]).toContain("800");
  });

  it("mudar só a caixa do nome não é entrar e sair", () => {
    const t = frases(
      doc({ budgetItems: ["flores"], budgetAmounts: [800] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
    );
    expect(t).toEqual([]);
  });

  it("uma linha repetida não se anuncia duas vezes", () => {
    // Duas linhas "Extras" com preços diferentes davam, com a comparação por
    // nome, um "entrou" e um "saiu" para a mesma coisa.
    const t = frases(
      doc({ budgetItems: ["Extras", "Extras"], budgetAmounts: [100, 200] }),
      doc({ budgetItems: ["Extras", "Extras"], budgetAmounts: [100, 200] }),
    );
    expect(t).toEqual([]);
  });

  it("linhas em branco não contam", () => {
    const t = frases(
      doc({ budgetItems: ["Flores", "  "], budgetAmounts: [800] }),
      doc({ budgetItems: ["Flores"], budgetAmounts: [800] }),
    );
    expect(t).toEqual([]);
  });
});

describe("os grupos de serviços", () => {
  it("diz o que entrou e o que saiu, sem se enganar com acentos", () => {
    const antes = doc({
      serviceGroups: [
        { title: "Decoração Cerimónia", items: [] },
        { title: "Organização", items: [] },
      ],
    });
    const depois = doc({
      serviceGroups: [
        { title: "decoracao cerimonia", items: [] },
        { title: "Mesa dos noivos", items: [] },
      ],
    });
    const t = frases(antes, depois);
    expect(t).toContain('Entrou o grupo "Mesa dos noivos"');
    expect(t).toContain('Saiu o grupo "Organização"');
    expect(t.some((x) => x.toLowerCase().includes("cerim"))).toBe(false);
  });
});

describe("o evento", () => {
  it("conta a data, o local, os convidados e os nomes", () => {
    const t = frases(
      doc({
        eventDate: "3 de julho de 2027",
        location: "Évora",
        guests: "150 pax",
        clientNames: "Ana e João",
      }),
      doc({
        eventDate: "10 de julho de 2027",
        location: "Estremoz",
        guests: "180 pax",
        clientNames: "Ana e João",
      }),
    );
    expect(t).toHaveLength(3);
    expect(t[0]).toBe('A data passou de "3 de julho de 2027" para "10 de julho de 2027"');
    expect(t.some((x) => x.includes("Estremoz"))).toBe(true);
    expect(t.some((x) => x.includes("180 pax"))).toBe(true);
  });

  it("um campo que se preenche pela primeira vez lê-se como tal", () => {
    const t = frases(doc({ location: "" }), doc({ location: "Évora" }));
    expect(t).toEqual(['O local passou a ser "Évora"']);
  });

  it("um campo que se esvazia diz o que lá estava", () => {
    const t = frases(doc({ location: "Évora" }), doc({ location: "" }));
    expect(t[0]).toContain("ficou por preencher");
    expect(t[0]).toContain("Évora");
  });
});

describe("o que NÃO se compara", () => {
  it("custos e notas internas mudam sem gerar frase nenhuma", () => {
    // Não é esquecimento: são reais, mas não fazem parte do que ela tem de
    // explicar ao telefone, e enchiam a lista por cima do que faz.
    const t = frases(
      doc({
        budgetItems: ["Flores"],
        budgetAmounts: [800],
        budgetCosts: [300],
        notasInternas: "a",
      }),
      doc({
        budgetItems: ["Flores"],
        budgetAmounts: [800],
        budgetCosts: [500],
        notasInternas: "b",
      }),
    );
    expect(t).toEqual([]);
  });
});

describe("o resumo", () => {
  it("quando o dinheiro mudou, é do dinheiro que fala", () => {
    const m = diferencas(
      doc({ totalAmount: 8000, budgetItems: ["a"], budgetAmounts: [1] }),
      doc({ totalAmount: 9000, budgetItems: ["b"], budgetAmounts: [2] }),
    );
    expect(resumo(m)).toContain("9000");
  });

  it("uma alteração só lê-se por extenso", () => {
    const m = diferencas(doc({ location: "Évora" }), doc({ location: "Estremoz" }));
    expect(resumo(m)).toBe('O local passou de "Évora" para "Estremoz"');
  });

  it("várias alterações contam-se", () => {
    const m = diferencas(
      doc({ location: "Évora", guests: "150 pax" }),
      doc({ location: "Estremoz", guests: "180 pax" }),
    );
    expect(resumo(m)).toBe("2 alterações");
  });

  it("duas versões iguais dizem-no", () => {
    expect(resumo([])).toBe("Sem alterações");
  });
});
