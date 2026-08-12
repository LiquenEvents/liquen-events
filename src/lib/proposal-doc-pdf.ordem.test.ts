import { describe, it, expect } from "vitest";
import { renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { lerPropostaDePdf } from "@/lib/proposta-de-pdf";
import { documentoDeCampos } from "@/lib/proposta-de-pdf/tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MESMO CASAL A LER DUAS ORDENS NO MESMO DOCUMENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre a proposta da Tara e do Marty: na lista de Serviços
 * (pág. 02) a ordem é Cerimónia → Complementos → Cocktail → Jantar; no
 * Orçamento (pág. 11) é Cerimónia → Cocktail → Jantar → Complementos. As mesmas
 * quatro rubricas, o mesmo documento, duas ordens.
 *
 * Divergem porque são listas escritas à mão em editores separados (o porquê
 * inteiro está em `proposal-doc-pdf.ts`, no bloco «UMA SÓ ORDEM PARA O
 * DOCUMENTO INTEIRO»). O que estes testes fixam é o comportamento que daí
 * resulta — e, sobretudo, as travas: sem correspondência não se mexe, na dúvida
 * não se mexe, e o que se mexe fica escrito no relatório.
 *
 * A ordem IMPRESSA lê-se do PDF gerado com o mesmo motor de leitura que o
 * estúdio usa para importar propostas antigas. É a única medida honesta: não é
 * o que o gerador acha que desenhou, é o que lá está.
 */

function proposta(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Tara e Marty 12.09.2026",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Quinta do Hespanhol",
    guests: "80 pax",
    coverImages: ["", ""],
    // A ordem DELA, na página que o casal lê primeiro.
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          { label: "Decor Cerimónia" },
          { label: "Complementos dos Noivos" },
          { label: "Decor Cocktail" },
          { label: "Decor Jantar" },
        ],
      },
    ],
    moodBoards: [],
    // A ordem que saía no quadro do orçamento.
    budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar", "Complementos dos Noivos"],
    budgetAmounts: [820, 460, 1250, 320],
    totalLabel: "Valor Total Decoração",
    totalText: "2.850,00 € + IVA",
    totalAmount: 2850,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** O que está IMPRESSO no PDF, lido de volta pelo motor do estúdio. */
async function impresso(doc: ProposalDoc) {
  const { bytes, reordenacoes } = await renderProposalDocPdfWithReport(doc);
  const r = await lerPropostaDePdf(bytes);
  if (!r.ok) throw new Error(`o motor recusou o nosso próprio PDF: ${r.porque}`);
  return { lido: documentoDeCampos(r.rascunho.campos), reordenacoes };
}

describe("uma só ordem para o documento inteiro", () => {
  it("o orçamento sai pela ordem dos serviços", async () => {
    const { lido, reordenacoes } = await impresso(proposta());
    expect(lido.budgetItems).toEqual([
      "Decor Cerimónia",
      "Complementos dos Noivos",
      "Decor Cocktail",
      "Decor Jantar",
    ]);
    // E DIZ que o fez, com as duas ordens à frente uma da outra.
    expect(reordenacoes).toHaveLength(1);
    expect(reordenacoes[0].onde).toBe("Orçamento");
    expect(reordenacoes[0].de[1]).toBe("Decor Cocktail");
    expect(reordenacoes[0].para[1]).toBe("Complementos dos Noivos");
  });

  /**
   * A marca de «extra» é um array PARALELO às linhas. Reordenar um sem o outro
   * trocava as marcas de sítio — a única maneira de isto poder mentir sobre
   * dinheiro, e por isso tem teste próprio.
   */
  it("a marca de «extra» viaja com a linha", async () => {
    const doc = proposta({ budgetOpcional: [false, false, false, true] });
    const { lido } = await impresso(doc);
    expect(lido.budgetItems?.[1]).toBe("Complementos dos Noivos");
    // O «extra» estava na quarta linha escrita (Complementos) e tem de sair na
    // linha dos Complementos, onde quer que ela agora fique.
    expect(lido.budgetOpcional?.[1]).toBe(true);
    expect(lido.budgetOpcional?.[0]).not.toBe(true);
  });

  /**
   * ── O DOCUMENTO ARRUMADO À MÃO ─────────────────────────────────────────
   *
   * A sugestão existe porque as três listas são editores separados e se
   * desalinham sozinhas. A partir do momento em que ela as arruma — arrastando
   * um mood board, ou com o botão que fixa a ordem no estúdio — a sugestão
   * passa a estorvar: punha o board no sítio e a página seguinte devolvia-o ao
   * lugar «certo».
   *
   * Com `ordemExplicita`, o gerador imprime o que está escrito e não anuncia
   * reordenação nenhuma, porque não fez nenhuma.
   */
  it("com a ordem arrumada à mão, o PDF imprime o que está escrito", async () => {
    const doc = proposta({ ordemExplicita: "arrumada-a-mao" });
    const { lido, reordenacoes } = await impresso(doc);
    expect(reordenacoes).toEqual([]);
    expect(lido.budgetItems).toEqual([
      "Decor Cerimónia",
      "Decor Cocktail",
      "Decor Jantar",
      "Complementos dos Noivos",
    ]);
  });

  /**
   * O caso que mais assusta: uma proposta cujas listas não se conhecem. Nada
   * casa, nada se mexe — sai exactamente como estava escrita.
   */
  it("sem correspondência nenhuma, a ordem escrita é a ordem impressa", async () => {
    const doc = proposta({
      serviceGroups: [
        {
          letter: "a)",
          title: "Montagem e Desmontagem",
          items: [{ label: "Montagem no dia" }, { label: "Desmontagem" }],
        },
      ],
    });
    const { lido, reordenacoes } = await impresso(doc);
    expect(reordenacoes).toEqual([]);
    expect(lido.budgetItems).toEqual([
      "Decor Cerimónia",
      "Decor Cocktail",
      "Decor Jantar",
      "Complementos dos Noivos",
    ]);
  });

  it("já estando de acordo, não há reordenação nenhuma a anunciar", async () => {
    const doc = proposta({
      budgetItems: ["Decor Cerimónia", "Complementos dos Noivos", "Decor Cocktail", "Decor Jantar"],
      budgetAmounts: [820, 320, 460, 1250],
    });
    const { reordenacoes } = await impresso(doc);
    expect(reordenacoes).toEqual([]);
  });

  /**
   * Os mood boards são a TERCEIRA lista, e a mais delicada: as páginas de
   * inspiração que não são rubricas do orçamento («Corredor Nupcial»,
   * «Lapelas Noivo») não podem ir parar ao fim do documento. Herdam o lugar da
   * rubrica anterior — viajam com o capítulo a que ela as colou.
   */
  it("os mood boards seguem a mesma ordem, e os que não são rubricas viajam com o vizinho", async () => {
    const doc = proposta({
      moodBoards: [
        { title: "Decoração Cerimónia", images: [] },
        { title: "Corredor Nupcial", images: [] },
        { title: "Lapelas Noivo", images: [] },
        { title: "Decoração Cocktail", images: [] },
        { title: "Decoração Jantar", images: [] },
        { title: "Complementos dos Noivos", images: [] },
      ],
    });
    const { reordenacoes } = await impresso(doc);
    const boards = reordenacoes.find((r) => r.onde === "Mood boards");
    expect(boards?.para).toEqual([
      "Decoração Cerimónia",
      "Corredor Nupcial",
      "Lapelas Noivo",
      "Complementos dos Noivos",
      "Decoração Cocktail",
      "Decoração Jantar",
    ]);
  });

  /**
   * Na dúvida, não se mexe: uma linha do orçamento igualmente próxima de dois
   * serviços não vai para nenhum dos dois. «Decor Jantar» tanto pode ser o
   * jantar dos adultos como o das crianças, e um palpite numa proposta que vai
   * para um casal vale menos do que a ordem que ela escreveu.
   */
  it("uma correspondência ambígua não move nada", async () => {
    const doc = proposta({
      serviceGroups: [
        {
          letter: "a)",
          title: "Decoração Floral de Casamento",
          items: [
            { label: "Decor Jantar Adultos" },
            { label: "Decor Jantar Crianças" },
            { label: "Decor Cocktail" },
          ],
        },
      ],
      budgetItems: ["Decor Jantar", "Decor Cocktail"],
      budgetAmounts: [1250, 460],
    });
    const { lido, reordenacoes } = await impresso(doc);
    // «Decor Jantar» não casa em segurança com nenhum dos dois, portanto fica
    // onde estava — e leva o «Decor Cocktail» com ele, que já vinha a seguir.
    expect(reordenacoes).toEqual([]);
    expect(lido.budgetItems).toEqual(["Decor Jantar", "Decor Cocktail"]);
  });
});
