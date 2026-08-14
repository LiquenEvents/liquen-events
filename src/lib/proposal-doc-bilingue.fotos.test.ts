import { describe, expect, it, vi } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { docNaLingua, escreverEn, lerEn } from "./proposal-doc-bilingue";
import { camposDoDocumento, type CampoDeTexto } from "./proposal-ortografia";
import { traduzirParaIngles, type MotorDeTraducao } from "./proposal-traducao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MUDAR A LÍNGUA NÃO TOCA NUMA ÚNICA FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O relato que trouxe estes testes: «quando alterou para inglês, deu, mas já
 * estava a alterar fotos». A frase é ambígua e podia querer dizer três coisas —
 * as fotos mudaram, as fotos desapareceram, ou o trabalho das fotos perdeu-se.
 *
 * Este ficheiro fecha a primeira e a segunda no sítio onde elas seriam
 * possíveis: a PROJECÇÃO para inglês (`docNaLingua`, o que o gerador do PDF
 * desenha) e a ESCRITA da tradução no documento (`escreverEn`,
 * `traduzirParaIngles`). O que se prova aqui é uma ausência, e é por isso que
 * os testes são feitos por comparação TOTAL e não campo a campo escolhido a
 * dedo: uma fotografia perdida por um caminho que ninguém se lembrou de
 * verificar continuava a passar.
 *
 * O invariante tem três degraus, do mais forte para o mais fraco:
 *
 *   1. IDENTIDADE — o array `images` de cada mood board é o MESMO objecto. Não
 *      é elegância: é o que faz as comparações por referência do estúdio (a
 *      gravação automática, o histórico do Cmd+Z) não verem trabalho onde não
 *      houve nenhum.
 *   2. CONTEÚDO E ORDEM — os mesmos caminhos, pela mesma ordem, nas capas e em
 *      todos os boards.
 *   3. AS MARCAS À VOLTA — a foto principal, a disposição, o enquadramento e a
 *      identidade da página, que decidem COMO as fotos saem desenhadas. Uma
 *      `principal` deslocada é uma foto trocada na página, mesmo com o array
 *      intacto.
 *
 * A terceira leitura da frase — o trabalho perdido — não se prova aqui: não é
 * um defeito destas funções, que são puras. Vive no estúdio, e está em
 * `ProposalStudio.test.tsx`, em «traduzir com as fotos a meio».
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
    coverImages: ["q1/capa-esquerda.jpg", "q1/capa-direita.jpg"],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        titleEn: "Wedding Floral Design",
        items: [
          {
            label: "Decor Cerimónia",
            labelEn: "Ceremony Decor",
            desc: "Arco e corredor",
            descEn: "Arch and aisle",
          },
        ],
      },
    ],
    moodBoards: [
      {
        title: "Decoração Cerimónia",
        titleEn: "Ceremony Decoration",
        subtitulo: "Arco e corredor nupcial",
        subtituloEn: "Arch and bridal aisle",
        annotation: "Runner floral com hortênsias verdes",
        annotationEn: "Floral runner with green hydrangeas",
        images: ["q1/a.jpg", "q1/b.jpg", "q1/c.jpg", "q1/d.jpg"],
        layout: "mosaico",
        enquadramento: "forma-da-foto",
        principal: 2,
        id: "mb-1",
      },
      {
        title: "Complementos dos Noivos",
        // De propósito SEM tradução: é o campo que cai para o português, e é
        // justamente no caminho do «cai para o português» que uma reconstrução
        // do board perderia as fotos.
        images: ["q1/e.jpg", "q1/f.jpg"],
        principal: 1,
        id: "mb-2",
      },
      // Um board sem uma única foto: o caso em que um `?? []` mal posto passa
      // despercebido porque não há nada para desaparecer.
      { title: "Ainda por escolher", images: [], id: "mb-3" },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Cocktail"],
    budgetItemsEn: ["Ceremony Decor", null],
    budgetExtras: [{ label: "Deslocação", labelEn: "Travel", valueText: "150,00 €" }],
    totalLabel: "Valor Total Decoração",
    totalLabelEn: "Total Decoration Value",
    totalText: "2.530,00 € + IVA",
    totalAmount: 2530,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/**
 * TUDO o que num documento é uma fotografia, ou decide como uma fotografia
 * sai desenhada. É esta a coisa que a língua não pode mexer.
 */
function fotografiaDoDocumento(doc: ProposalDoc) {
  return {
    capas: [...doc.coverImages],
    boards: doc.moodBoards.map((b) => ({
      fotos: [...b.images],
      principal: b.principal,
      layout: b.layout,
      enquadramento: b.enquadramento,
      id: b.id,
      bloqueado: b.bloqueado,
    })),
  };
}

/** Os caminhos das fotos, achatados e por ordem — a lista que tem de sair
 *  igual dos dois lados, sem depender de como está agrupada. */
function caminhos(doc: ProposalDoc): string[] {
  return [...doc.coverImages, ...doc.moodBoards.flatMap((b) => b.images)];
}

describe("docNaLingua e as fotografias", () => {
  it("INVARIANTE: a projecção inglesa deixa as fotos, as capas e as marcas exactamente como estavam", () => {
    const pt = proposta();
    const antes = fotografiaDoDocumento(pt);
    const en = docNaLingua(pt, "en");

    // A prosa MUDOU — senão este teste não estava a olhar para o caminho certo.
    expect(en.moodBoards[0].title).toBe("Ceremony Decoration");
    expect(en.moodBoards[0].annotation).toBe("Floral runner with green hydrangeas");
    // …e a fotografia não.
    expect(fotografiaDoDocumento(en)).toEqual(antes);
    expect(fotografiaDoDocumento(pt)).toEqual(antes);
  });

  it("INVARIANTE: os arrays de fotos nem sequer são recriados — são o MESMO objecto", () => {
    // O degrau mais forte, e o que a gravação automática do estúdio lê: um
    // array novo com o mesmo conteúdo é «documento alterado» para quem compara
    // por referência, e um `images` recriado é um `images` que alguém já
    // reconstruiu — que é onde uma foto se perde.
    const pt = proposta();
    const en = docNaLingua(pt, "en");
    expect(en.coverImages).toBe(pt.coverImages);
    en.moodBoards.forEach((b, i) => {
      expect(b.images).toBe(pt.moodBoards[i].images);
    });
  });

  it("INVARIANTE: nenhum caminho de fotografia entra, sai ou muda de sítio", () => {
    const pt = proposta();
    expect(caminhos(docNaLingua(pt, "en"))).toEqual(caminhos(pt));
  });

  it("um board SEM tradução nenhuma atravessa a projecção intacto, fotos incluídas", () => {
    // O caminho do «cai para o português»: é o `continue` do `docNaLingua`, e
    // um `continue` que reconstruísse o board para não fazer nada seria o
    // defeito mais fácil de escrever e o mais difícil de ver.
    const pt = proposta();
    const en = docNaLingua(pt, "en");
    expect(en.moodBoards[1]).toBe(pt.moodBoards[1]);
    expect(en.moodBoards[2]).toBe(pt.moodBoards[2]);
  });

  it("em português é o MESMO documento — não há por onde uma foto se perder", () => {
    const pt = proposta();
    expect(docNaLingua(pt, "pt")).toBe(pt);
  });

  it("uma capa vazia continua vazia, e continua a ser uma capa", () => {
    // A capa tem duas posições fixas (esquerda e direita). Uma projecção que
    // filtrasse os vazios encolhia o array e passava a foto da direita para a
    // esquerda — uma foto trocada na primeira página da proposta.
    const pt = proposta({ coverImages: ["", "q1/capa-direita.jpg"] });
    expect(docNaLingua(pt, "en").coverImages).toEqual(["", "q1/capa-direita.jpg"]);
  });
});

describe("escreverEn e as fotografias", () => {
  /** Todos os campos de prosa deste documento, um a um. */
  const todosOsCampos = (doc: ProposalDoc): CampoDeTexto[] =>
    camposDoDocumento(doc).map((c) => c.campo);

  it("INVARIANTE: escrever inglês em QUALQUER campo não mexe em fotografia nenhuma", () => {
    // Campo a campo e não só nos dos boards: um `escreverEn` do rótulo do
    // total que reconstruísse os mood boards por distracção passava por
    // qualquer teste que só olhasse para os campos de board.
    const pt = proposta();
    const antes = fotografiaDoDocumento(pt);
    for (const campo of todosOsCampos(pt)) {
      const depois = escreverEn(pt, campo, "TEXTO INGLÊS");
      expect(fotografiaDoDocumento(depois)).toEqual(antes);
      // E as fotos do board tocado continuam a ser o mesmo array.
      depois.moodBoards.forEach((b, i) => {
        expect(b.images).toBe(pt.moodBoards[i].images);
      });
    }
  });

  it("escrever o título inglês de um board mantém-lhe as fotos, a principal e a disposição", () => {
    const pt = proposta();
    const depois = escreverEn(pt, { tipo: "boardTitulo", bi: 0 }, "Ceremony");
    const board = depois.moodBoards[0];
    expect(lerEn(depois, { tipo: "boardTitulo", bi: 0 })).toBe("Ceremony");
    expect(board.images).toEqual(["q1/a.jpg", "q1/b.jpg", "q1/c.jpg", "q1/d.jpg"]);
    expect(board.principal).toBe(2);
    expect(board.layout).toBe("mosaico");
    expect(board.enquadramento).toBe("forma-da-foto");
    expect(board.id).toBe("mb-1");
  });

  it("escrever num board não toca nos OUTROS boards — nem por cópia", () => {
    const pt = proposta();
    const depois = escreverEn(pt, { tipo: "boardNota", bi: 0 }, "Hydrangeas");
    expect(depois.moodBoards[1]).toBe(pt.moodBoards[1]);
    expect(depois.moodBoards[2]).toBe(pt.moodBoards[2]);
  });
});

describe("traduzirParaIngles e as fotografias", () => {
  /** Um motor de mentira: devolve o que lhe mandarem, com uma marca à frente. */
  const motorFalso: MotorDeTraducao = async (textos) => textos.map((t) => `EN: ${t}`);

  it("INVARIANTE: traduzir o documento inteiro não mexe numa única fotografia", async () => {
    const pt = proposta();
    const antes = fotografiaDoDocumento(pt);
    const { doc, escritos } = await traduzirParaIngles(pt, motorFalso);
    // Traduziu mesmo — senão não estava a haver escrita nenhuma para verificar.
    expect(escritos).toBeGreaterThan(0);
    expect(fotografiaDoDocumento(doc)).toEqual(antes);
    expect(caminhos(doc)).toEqual(caminhos(pt));
  });

  it("INVARIANTE: os arrays de fotos saem da tradução como o MESMO objecto", async () => {
    const pt = proposta();
    const { doc } = await traduzirParaIngles(pt, motorFalso);
    expect(doc.coverImages).toBe(pt.coverImages);
    doc.moodBoards.forEach((b, i) => {
      expect(b.images).toBe(pt.moodBoards[i].images);
    });
  });

  it("nenhum caminho de fotografia é MANDADO ao serviço de tradução", async () => {
    // Um caminho traduzido volta traduzido, e uma foto com o caminho mudado é
    // uma foto que deixa de existir — o buraco no PDF que ninguém sabe
    // explicar.
    const espia = vi.fn(motorFalso);
    await traduzirParaIngles(proposta(), espia);
    const mandados = espia.mock.calls[0][0].join(" | ");
    for (const p of caminhos(proposta())) {
      if (p) expect(mandados).not.toContain(p);
    }
  });

  it("um serviço que rebenta a meio devolve o documento INTACTO, por identidade", async () => {
    const pt = proposta();
    const r = await traduzirParaIngles(pt, async () => {
      throw new Error("a rede caiu");
    });
    expect(r.doc).toBe(pt);
    expect(r.escritos).toBe(0);
  });

  it("uma resposta desalinhada não escreve nada — e as fotos ficam onde estavam", async () => {
    const pt = proposta();
    const r = await traduzirParaIngles(pt, async () => ["só um texto"]);
    expect(r.doc).toBe(pt);
    expect(fotografiaDoDocumento(r.doc)).toEqual(fotografiaDoDocumento(pt));
  });

  it("traduzir e DEPOIS projectar para inglês continua a dar as mesmas fotos", async () => {
    // O percurso completo, que é o que sai no PDF do casal: escrever a
    // tradução e desenhar na língua. Os dois passos são seguros um a um; isto
    // pina que a composição também é.
    const pt = proposta();
    const { doc } = await traduzirParaIngles(pt, motorFalso);
    expect(caminhos(docNaLingua(doc, "en"))).toEqual(caminhos(pt));
    expect(fotografiaDoDocumento(docNaLingua(doc, "en"))).toEqual(fotografiaDoDocumento(pt));
  });
});
