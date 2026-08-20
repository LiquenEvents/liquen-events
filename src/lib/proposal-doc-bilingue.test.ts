import { describe, it, expect } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import type { CampoDeTexto } from "./proposal-ortografia";
import {
  camposComVersaoInglesa,
  camposPorTraduzir,
  docNaLingua,
  docTemIngles,
  escreverEn,
  lerEn,
  porTraduzirPorSeccao,
  temVersaoInglesa,
} from "./proposal-doc-bilingue";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROSA DELA NAS DUAS LÍNGUAS — O QUE ESTE FICHEIRO PINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O INVARIANTE, que é o que torna tudo o resto seguro: `docNaLingua` nunca
 * acrescenta, nunca remove e nunca reordena nada — só troca strings no sítio.
 *
 * Não é uma elegância. A ordem por que o orçamento e os mood boards saem
 * impressos é calculada por NOMES (`proposal-ordem.ts`, `chaveDeRubrica`), e é
 * calculada sobre o documento PORTUGUÊS. Isso só é legítimo enquanto os índices
 * dos dois documentos forem os mesmos. Se esta função alguma vez encolher um
 * array ou trocar duas posições, a ordem calculada em português passa a ser
 * aplicada a outra coisa — e o PDF inglês sai com o orçamento por outra ordem,
 * sem erro nenhum, invisível para quem confere (que lê o português).
 */

function proposta(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Tara e Marty · 12 de setembro de 2026",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Quinta do Hespanhol",
    guests: "80 pax",
    coverImages: ["", ""],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          { label: "Decor Cerimónia", desc: "Arco e corredor" },
          { label: "Complementos dos Noivos" },
        ],
      },
      { letter: "b)", title: "Montagens", items: [{ label: "Montagem e desmontagem" }] },
    ],
    moodBoards: [
      {
        title: "Decoração Cerimónia",
        subtitulo: "Arco e corredor nupcial",
        annotation: "Runner floral com hortênsias verdes",
        images: ["a.jpg", "b.jpg"],
      },
      { title: "Complementos dos Noivos", images: ["c.jpg"] },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"],
    budgetAmounts: [820, 460, 1250],
    budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "150,00 €" }],
    totalLabel: "Valor Total Decoração",
    totalText: "2.530,00 € + IVA",
    totalAmount: 2530,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** A FORMA do documento — quantos de cada coisa, e por que ordem. É o que o
 *  invariante estrutural compara. */
function forma(doc: ProposalDoc) {
  return {
    grupos: doc.serviceGroups.length,
    itensPorGrupo: doc.serviceGroups.map((g) => g.items.length),
    boards: doc.moodBoards.length,
    fotosPorBoard: doc.moodBoards.map((b) => b.images.length),
    fotosDosBoards: doc.moodBoards.map((b) => [...b.images]),
    linhas: doc.budgetItems.length,
    precos: doc.budgetAmounts,
    extras: (doc.budgetExtras ?? []).length,
    valoresDosExtras: (doc.budgetExtras ?? []).map((e) => e.valueText),
    capas: doc.coverImages.length,
    condicoes: doc.condicoesGerais.length,
  };
}

describe("docNaLingua", () => {
  it("em português devolve o MESMO objecto, por identidade", () => {
    const doc = proposta({
      serviceGroups: [{ title: "Decoração", titleEn: "Decoration", items: [] }],
    });
    expect(docNaLingua(doc, "pt")).toBe(doc);
  });

  it("em inglês, um documento sem um único campo …En sai com a prosa toda igual", () => {
    const doc = proposta();
    const en = docNaLingua(doc, "en");
    expect(en.serviceGroups[0].title).toBe("Decoração Floral de Casamento");
    expect(en.moodBoards[0].annotation).toBe("Runner floral com hortênsias verdes");
    expect(en.budgetItems).toEqual(["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"]);
    expect(en.totalLabel).toBe("Valor Total Decoração");
  });

  it("INVARIANTE: em inglês não acrescenta, não remove e não reordena nada", () => {
    const doc = proposta({
      serviceGroups: [
        {
          title: "Decoração Floral de Casamento",
          titleEn: "Wedding Floral Design",
          items: [
            { label: "Decor Cerimónia", labelEn: "Ceremony Decor", desc: "Arco", descEn: "Arch" },
            { label: "Complementos dos Noivos" },
          ],
        },
        { title: "Montagens", titleEn: "Set-up", items: [{ label: "Montagem" }] },
      ],
      moodBoards: [
        {
          title: "Decoração Cerimónia",
          titleEn: "Ceremony Decoration",
          subtitulo: "Arco",
          subtituloEn: "Arch",
          annotation: "Hortênsias",
          annotationEn: "Hydrangeas",
          images: ["a.jpg", "b.jpg"],
        },
        { title: "Complementos", images: ["c.jpg"] },
      ],
      budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"],
      budgetItemsEn: ["Ceremony Decor", null, "Dinner Decor"],
      budgetExtras: [
        { label: "Deslocação", labelEn: "Travel", valueText: "150,00 €" },
        { label: "Coordenação", valueText: "300,00 €" },
      ],
    });
    expect(forma(docNaLingua(doc, "en"))).toEqual(forma(doc));
  });

  it("INVARIANTE: a ORDEM das rubricas e dos mood boards é a mesma nas duas línguas", () => {
    // O nome de uma rubrica traduzida deixa de casar com o nome do serviço
    // português. Se a projecção reordenasse fosse o que fosse, era aqui que se
    // via — e no PDF do casal inglês, que é onde não se vê.
    const doc = proposta({
      budgetItems: ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"],
      budgetItemsEn: ["Ceremony Decor", "Cocktail Decor", "Dinner Decor"],
    });
    const en = docNaLingua(doc, "en");
    // Cada posição continua a ser a mesma rubrica, traduzida no sítio.
    expect(en.budgetItems).toEqual(["Ceremony Decor", "Cocktail Decor", "Dinner Decor"]);
    expect(en.moodBoards.map((b) => b.images[0])).toEqual(doc.moodBoards.map((b) => b.images[0]));
  });

  it("uma tradução escrita entra no lugar do português", () => {
    const doc = proposta({
      totalLabel: "Investimento em flor e decor",
      totalLabelEn: "Flowers and decor investment",
      budgetNote: "Os valores são estimativas",
      budgetNoteEn: "Values are estimates",
    });
    const en = docNaLingua(doc, "en");
    expect(en.totalLabel).toBe("Flowers and decor investment");
    expect(en.budgetNote).toBe("Values are estimates");
  });

  it("uma caixa inglesa VAZIA cai para o português, sem marca nenhuma", () => {
    const doc = proposta({
      serviceGroups: [{ title: "Decoração Floral", titleEn: "   ", items: [] }],
    });
    expect(docNaLingua(doc, "en").serviceGroups[0].title).toBe("Decoração Floral");
  });

  it("uma tradução IGUAL ao português sai igual — é a decisão «ficar em português»", () => {
    const doc = proposta({
      moodBoards: [{ title: "Lisianthus", titleEn: "Lisianthus", images: ["a.jpg"] }],
    });
    expect(docNaLingua(doc, "en").moodBoards[0].title).toBe("Lisianthus");
    expect(camposPorTraduzir(doc).some((c) => c.campo.tipo === "boardTitulo")).toBe(false);
  });

  it("um budgetItemsEn desalinhado nunca rebenta, e a rubrica i só usa a tradução i", () => {
    const curto = proposta({
      budgetItems: ["Um", "Dois", "Três"],
      budgetItemsEn: ["One"],
    });
    expect(docNaLingua(curto, "en").budgetItems).toEqual(["One", "Dois", "Três"]);

    const comprido = proposta({
      budgetItems: ["Um", "Dois"],
      budgetItemsEn: ["One", "Two", "Three", "Four"],
    });
    expect(docNaLingua(comprido, "en").budgetItems).toEqual(["One", "Two"]);

    const buracos = proposta({
      budgetItems: ["Um", "Dois", "Três"],
      budgetItemsEn: [null, "", "Three"],
    });
    expect(docNaLingua(buracos, "en").budgetItems).toEqual(["Um", "Dois", "Three"]);
  });

  it("não toca nos campos que o nosso código escreve nem no dinheiro", () => {
    const doc = proposta();
    const en = docNaLingua(doc, "en");
    expect(en.eventType).toBe(doc.eventType);
    expect(en.eventDate).toBe(doc.eventDate);
    expect(en.ref).toBe(doc.ref);
    expect(en.clientNames).toBe(doc.clientNames);
    expect(en.location).toBe(doc.location);
    expect(en.totalText).toBe(doc.totalText);
    expect((en.budgetExtras ?? [])[0].valueText).toBe((doc.budgetExtras ?? [])[0].valueText);
  });

  it("as notas internas e os custos atravessam a projecção sem mudar", () => {
    const doc = proposta({
      notasInternas: "Cliente da AMARA, cuidado com o prazo.",
      budgetCosts: [300, null, 700],
    });
    const en = docNaLingua(doc, "en");
    expect(en.notasInternas).toBe(doc.notasInternas);
    expect(en.budgetCosts).toEqual(doc.budgetCosts);
  });
});

describe("temVersaoInglesa", () => {
  /** Todos os `tipo` de {@link CampoDeTexto}, à letra. O `switch` sem `default`
   *  já garante em compilação que nenhum fica de fora; isto fecha o círculo do
   *  outro lado — se alguém acrescentar um caso e o esquecer aqui, o teste
   *  deixa de cobrir o inventário inteiro. */
  const TODOS: CampoDeTexto[] = [
    { tipo: "ref" },
    { tipo: "headerTitle" },
    { tipo: "servico" },
    { tipo: "eventType" },
    { tipo: "totalLabel" },
    { tipo: "budgetNote" },
    { tipo: "grupoTitulo", gi: 0 },
    { tipo: "itemRotulo", gi: 0, ii: 0 },
    { tipo: "itemDesc", gi: 0, ii: 0 },
    { tipo: "boardTitulo", bi: 0 },
    { tipo: "boardSubtitulo", bi: 0 },
    { tipo: "boardNota", bi: 0 },
    { tipo: "linhaDeOrcamento", i: 0 },
    { tipo: "extraRotulo", i: 0 },
  ];

  it("responde a todos os campos do inventário, sem rebentar", () => {
    for (const c of TODOS) expect(typeof temVersaoInglesa(c)).toBe("boolean");
  });

  it("a referência e o tipo de evento NÃO têm segunda caixa — já são traduzidos por reconhecimento", () => {
    expect(temVersaoInglesa({ tipo: "ref" })).toBe(false);
    expect(temVersaoInglesa({ tipo: "eventType" })).toBe(false);
  });

  it("a prosa dela tem", () => {
    expect(temVersaoInglesa({ tipo: "grupoTitulo", gi: 0 })).toBe(true);
    expect(temVersaoInglesa({ tipo: "itemRotulo", gi: 0, ii: 0 })).toBe(true);
    expect(temVersaoInglesa({ tipo: "boardNota", bi: 0 })).toBe(true);
    expect(temVersaoInglesa({ tipo: "linhaDeOrcamento", i: 0 })).toBe(true);
  });
});

describe("lerEn / escreverEn", () => {
  it("escreve e volta a ler, campo a campo", () => {
    let doc: ProposalDoc = proposta();
    const casos: Array<[CampoDeTexto, string]> = [
      [{ tipo: "grupoTitulo", gi: 1 }, "Set-up"],
      [{ tipo: "itemRotulo", gi: 0, ii: 1 }, "Couple's extras"],
      [{ tipo: "itemDesc", gi: 0, ii: 0 }, "Arch and aisle"],
      [{ tipo: "boardTitulo", bi: 0 }, "Ceremony Decoration"],
      [{ tipo: "boardSubtitulo", bi: 0 }, "Arch and bridal aisle"],
      [{ tipo: "boardNota", bi: 0 }, "Floral runner"],
      [{ tipo: "linhaDeOrcamento", i: 2 }, "Dinner Decor"],
      [{ tipo: "extraRotulo", i: 0 }, "Líquen team travel"],
      [{ tipo: "totalLabel" }, "Decoration Total"],
      [{ tipo: "budgetNote" }, "Estimates"],
    ];
    for (const [campo, texto] of casos) doc = escreverEn(doc, campo, texto);
    for (const [campo, texto] of casos) expect(lerEn(doc, campo)).toBe(texto);
  });

  it("escrever uma rubrica não estraga as que estão à volta", () => {
    const doc = escreverEn(proposta(), { tipo: "linhaDeOrcamento", i: 2 }, "Dinner Decor");
    expect(doc.budgetItemsEn).toEqual([null, null, "Dinner Decor"]);
    expect(doc.budgetItems).toEqual(["Decor Cerimónia", "Decor Cocktail", "Decor Jantar"]);
  });

  it("escrever inglês não mexe no português", () => {
    const antes = proposta();
    const depois = escreverEn(antes, { tipo: "grupoTitulo", gi: 0 }, "Wedding Floral Design");
    expect(depois.serviceGroups[0].title).toBe(antes.serviceGroups[0].title);
    expect(depois.serviceGroups[0].titleEn).toBe("Wedding Floral Design");
  });
});

describe("camposPorTraduzir", () => {
  it("conta o que tem português escrito e não tem inglês", () => {
    const doc = proposta({
      serviceGroups: [
        {
          title: "Decoração Floral",
          titleEn: "Floral Design",
          items: [{ label: "Decor Cerimónia" }],
        },
      ],
      moodBoards: [],
      budgetItems: [],
      budgetExtras: [],
      totalLabel: "Valor Total Decoração",
    });
    const faltam = camposPorTraduzir(doc).map((c) => c.campo.tipo);
    expect(faltam).toContain("itemRotulo");
    expect(faltam).toContain("totalLabel");
    expect(faltam).not.toContain("grupoTitulo");
  });

  it("um campo VAZIO não conta — não existe no documento", () => {
    const doc = proposta({ moodBoards: [{ title: "", images: ["a.jpg"] }] });
    expect(camposPorTraduzir(doc).some((c) => c.campo.tipo === "boardTitulo")).toBe(false);
  });

  it("uma caixa inglesa em branco conta como falta, tal como a ausente", () => {
    const doc = proposta({
      serviceGroups: [{ title: "Decoração Floral", titleEn: "  ", items: [] }],
    });
    expect(camposPorTraduzir(doc).some((c) => c.campo.tipo === "grupoTitulo")).toBe(true);
  });

  it("traz o rótulo do ecrã e o texto português, para o painel os poder mostrar", () => {
    const doc = proposta({
      serviceGroups: [{ title: "Decoração Floral de Casamento", items: [] }],
      moodBoards: [],
      budgetItems: [],
      budgetExtras: [],
    });
    const achado = camposPorTraduzir(doc).find((c) => c.campo.tipo === "grupoTitulo");
    expect(achado?.rotulo).toBe("Serviços · grupo 1");
    expect(achado?.texto).toBe("Decoração Floral de Casamento");
  });

  it("nunca lista a referência nem o tipo de evento", () => {
    const tipos = camposPorTraduzir(proposta()).map((c) => c.campo.tipo);
    expect(tipos).not.toContain("ref");
    expect(tipos).not.toContain("eventType");
  });
});

describe("docTemIngles", () => {
  it("é falso num documento que nunca foi traduzido", () => {
    expect(docTemIngles(proposta())).toBe(false);
  });

  it("é verdadeiro com uma única tradução escrita — é o que abre o interruptor noutro computador", () => {
    expect(docTemIngles(proposta({ budgetItemsEn: [null, "Cocktail Decor", null] }))).toBe(true);
    expect(docTemIngles(proposta({ moodBoards: [{ title: "X", titleEn: "X", images: [] }] }))).toBe(
      true,
    );
  });

  it("uma caixa inglesa em branco não conta como documento bilingue", () => {
    expect(docTemIngles(proposta({ totalLabelEn: "   " }))).toBe(false);
  });
});

describe("camposComVersaoInglesa", () => {
  it("é o inventário dos campos que ganham segunda caixa, e nenhum a mais", () => {
    const tipos = new Set(camposComVersaoInglesa(proposta()).map((c) => c.campo.tipo));
    expect(tipos.has("ref")).toBe(false);
    expect(tipos.has("eventType")).toBe(false);
    expect(tipos.has("grupoTitulo")).toBe(true);
    expect(tipos.has("linhaDeOrcamento")).toBe(true);
  });
});

/**
 * A CONTAGEM POR SECÇÃO — para o índice do estúdio.
 *
 * O painel «Por traduzir» lista tudo, mas vive no passo do envio. A meio de
 * escrever a pergunta é outra: «desta secção, o que é que ainda falta?».
 */
describe("porTraduzirPorSeccao", () => {
  it("conta cada campo na secção onde ele se resolve", () => {
    const doc = proposta({
      serviceGroups: [
        { title: "Decoração Floral", items: [{ label: "Arco" }, { label: "Igreja" }] },
      ],
      budgetItems: ["Decor Cerimónia"],
      moodBoards: [{ title: "Cerimónia", images: [] }],
    });
    // Serviços: o título do grupo + as duas rubricas. Orçamento: a linha.
    // Mood boards: o título do board. Total: o rótulo do total e o adicional,
    // que o fixture traz — e que caem na secção do total, como no estúdio.
    expect(porTraduzirPorSeccao(doc)).toEqual({
      servicos: 3,
      orcamento: 1,
      moodboards: 1,
      total: 2,
    });
  });

  it("o que já tem inglês não entra na conta", () => {
    const doc = proposta({
      serviceGroups: [{ title: "Decoração", titleEn: "Decoration", items: [] }],
      budgetItems: [],
      moodBoards: [],
    });
    expect(porTraduzirPorSeccao(doc).servicos ?? 0).toBe(0);
    // CONTROLO POSITIVO: sem a caixa inglesa, o MESMO documento contava um.
    const semEn = proposta({
      serviceGroups: [{ title: "Decoração", items: [] }],
      budgetItems: [],
      moodBoards: [],
    });
    expect(porTraduzirPorSeccao(semEn).servicos).toBe(1);
  });

  it("uma secção sem faltas não aparece de todo", () => {
    // Um `0` no índice ao lado de cinco secções é uma fila de zeros a dizer que
    // não há nada a fazer.
    const doc = proposta({ serviceGroups: [], budgetItems: [], moodBoards: [] });
    expect(Object.keys(porTraduzirPorSeccao(doc))).not.toContain("servicos");
  });
});
