import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { adicionarLinha, removerLinha } from "@/lib/proposal-budget";
import { marcarExtra, nomesDosExtras, opcionaisDe, totaisDasVersoes } from "./versoes-da-proposta";

const doc = (over: Partial<ProposalDoc>): ProposalDoc => over as ProposalDoc;

describe("os dois totais", () => {
  it("a base é o total menos os extras assinalados", () => {
    const d = doc({
      budgetItems: ["Cerimónia", "Copo de água", "Arco floral"],
      budgetAmounts: [4000, 3000, 1500],
      budgetOpcional: [false, false, true],
    });
    const t = totaisDasVersoes(d, 8500)!;
    expect(t.comExtras).toBe(8500);
    expect(t.base).toBe(7000);
    expect(t.extras).toBe(1500);
    expect(t.linhasExtra).toBe(1);
  });

  it("sem marcas nenhumas não há duas versões", () => {
    // Uma proposta como as de sempre não ganha um segundo total nem uma
    // palavra a mais no PDF por isto existir.
    const d = doc({ budgetItems: ["Cerimónia"], budgetAmounts: [4000] });
    expect(totaisDasVersoes(d, 4000)).toBeNull();
  });

  it("conta os extras sem preço em vez de os ignorar em silêncio", () => {
    // Sem preço, a subtracção não desce — a base sai igual ao total, e dois
    // números iguais lado a lado leem-se como um engano de quem escreveu.
    const d = doc({
      budgetItems: ["Cerimónia", "Fogo de artifício"],
      budgetAmounts: [4000, null],
      budgetOpcional: [false, true],
    });
    const t = totaisDasVersoes(d, 4000)!;
    expect(t.base).toBe(4000);
    expect(t.extrasSemPreco).toBe(1);
  });

  it("extras acima do total não dão uma base negativa", () => {
    // É um engano de quem escreveu (o aviso de desalinhamento apanha-o), mas
    // um total negativo em PDF seria pior do que o engano.
    const d = doc({
      budgetItems: ["Extra caro"],
      budgetAmounts: [9000],
      budgetOpcional: [true],
    });
    expect(totaisDasVersoes(d, 5000)!.base).toBe(0);
  });

  it("soma cêntimos sem os espalhar", () => {
    const d = doc({
      budgetItems: ["a", "b"],
      budgetAmounts: [1000.1, 2000.2],
      budgetOpcional: [true, true],
    });
    expect(totaisDasVersoes(d, 3500.35)!.extras).toBe(3000.3);
  });
});

describe("as marcas", () => {
  it("acompanham sempre o comprimento das linhas", () => {
    // Um documento antigo não tem o array; um a que se acrescentou uma linha
    // tem-no mais curto. Em nenhum dos casos pode o índice 3 ler a marca da 4.
    expect(opcionaisDe(doc({ budgetItems: ["a", "b"] }))).toEqual([false, false]);
    expect(opcionaisDe(doc({ budgetItems: ["a", "b"], budgetOpcional: [true] }))).toEqual([
      true,
      false,
    ]);
    expect(opcionaisDe(doc({ budgetItems: ["a"], budgetOpcional: [true, true, true] }))).toEqual([
      true,
    ]);
  });

  it("os nomes dos extras saem por ordem e sem os vazios", () => {
    const d = doc({
      budgetItems: ["Cerimónia", "  ", "Arco floral"],
      budgetOpcional: [false, true, true],
    });
    expect(nomesDosExtras(d)).toEqual(["Arco floral"]);
  });

  it("marcar uma linha não mexe nas outras", () => {
    const d = doc({ budgetItems: ["a", "b", "c"], budgetOpcional: [true, false, false] });
    expect(marcarExtra(d, 2, true).budgetOpcional).toEqual([true, false, true]);
  });
});

describe("os arrays paralelos sobrevivem às linhas", () => {
  it("apagar uma linha leva o custo, a escala e a marca dela", () => {
    // Este é o defeito que isto vem fechar: com só os preços tratados, apagar a
    // linha 2 deixava custos e marcas uma posição à frente. Não dava erro
    // nenhum — dava números errados com bom aspecto.
    const d = doc({
      budgetItems: ["um", "dois", "três"],
      budgetAmounts: [10, 20, 30],
      budgetCosts: [1, 2, 3],
      budgetOpcional: [false, false, true],
    });
    const depois = removerLinha(d, 1);
    expect(depois.budgetItems).toEqual(["um", "três"]);
    expect(depois.budgetAmounts).toEqual([10, 30]);
    expect(depois.budgetCosts).toEqual([1, 3]);
    // A marca continua na linha "três", que é onde ela foi posta.
    expect(depois.budgetOpcional).toEqual([false, true]);
  });

  it("uma linha nova nasce sem custo e sem marca", () => {
    const d = doc({
      budgetItems: ["um"],
      budgetAmounts: [10],
      budgetCosts: [1],
      budgetOpcional: [true],
    });
    const depois = adicionarLinha(d, "dois");
    expect(depois.budgetCosts).toEqual([1, null]);
    expect(depois.budgetOpcional).toEqual([true, false]);
  });

  it("um documento que nunca teve custos não passa a ter", () => {
    // Escrever um array de nulls por causa de uma remoção mudava o que se
    // serializa — e o documento gravado deixava de ser igual ao de antes.
    const depois = removerLinha(doc({ budgetItems: ["um", "dois"], budgetAmounts: [10, 20] }), 0);
    expect("budgetCosts" in depois).toBe(false);
    expect("budgetOpcional" in depois).toBe(false);
  });
});
