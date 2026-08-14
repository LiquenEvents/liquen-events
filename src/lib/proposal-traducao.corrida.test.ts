import { describe, expect, it } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { lerEn } from "./proposal-doc-bilingue";
import { aplicarTraducao, traduzirParaIngles, type MotorDeTraducao } from "./proposal-traducao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TRADUÇÃO CHEGA E O DOCUMENTO JÁ NÃO É O MESMO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Traduzir é uma ida à rede. Entre a carregada no botão e a resposta passam
 * segundos, e nesses segundos o estúdio continua vivo debaixo das mãos dela:
 * entram fotos, saem fotos, arrasta-se um mood board, apaga-se um grupo.
 *
 * O relato que trouxe estes testes: «quando alterou para inglês, deu, mas já
 * estava a alterar fotos». A tradução DEU. O que se perdeu foram as fotos.
 *
 * `aplicarTraducao` é a resposta: as traduções escrevem-se no documento COMO
 * ELE ESTÁ, campo a campo, e só onde o português ainda é aquele que foi
 * mandado traduzir. Duas coisas ficam presas aqui:
 *
 *   1. o que ela fez entretanto FICA — fotos incluídas;
 *   2. um campo que mudou de sítio NÃO recebe a tradução do que lá estava
 *      antes. É o perigo verdadeiro da chave posicional: uma frase inglesa
 *      escrita na página errada de uma proposta a caminho de um cliente.
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
    serviceGroups: [],
    moodBoards: [
      { title: "Decoração Cerimónia", images: ["q1/a.jpg", "q1/b.jpg"] },
      { title: "Complementos dos Noivos", images: ["q1/c.jpg"] },
    ],
    budgetItems: [],
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText: "2.530,00 € + IVA",
    totalAmount: 2530,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** Um motor de mentira: devolve o que lhe mandarem, com uma marca à frente. */
const motorFalso: MotorDeTraducao = async (textos) => textos.map((t) => `EN: ${t}`);

describe("aplicarTraducao — escrever num documento que entretanto andou", () => {
  it("O CASO DO RELATO: as fotos que entraram durante a tradução ficam lá", async () => {
    const aoPedir = proposta();
    const { escritas, escritos } = await traduzirParaIngles(aoPedir, motorFalso);
    // Os dois títulos de mood board estão lá dentro — é sobre eles que este
    // teste fala. (O documento traduz mais campos: o rótulo do total, por
    // exemplo. Contá-los à mão era um teste a partir-se ao primeiro campo novo.)
    expect(escritas.map((e) => e.pt)).toEqual(
      expect.arrayContaining(["Decoração Cerimónia", "Complementos dos Noivos"]),
    );

    // Entretanto ela carregou duas fotos para o primeiro board e tirou a única
    // do segundo. É este o documento que existe quando a resposta chega.
    const agora = proposta({
      moodBoards: [
        { title: "Decoração Cerimónia", images: ["q1/a.jpg", "q1/b.jpg", "q1/nova.jpg"] },
        { title: "Complementos dos Noivos", images: [] },
      ],
    });

    const r = aplicarTraducao(agora, escritas);

    // A tradução entrou INTEIRA — nenhum campo mudou debaixo dela.
    expect(r.escritos).toBe(escritos);
    expect(r.ignorados).toEqual([]);
    expect(lerEn(r.doc, { tipo: "boardTitulo", bi: 0 })).toBe("EN: Decoração Cerimónia");
    expect(lerEn(r.doc, { tipo: "boardTitulo", bi: 1 })).toBe("EN: Complementos dos Noivos");
    // …e as fotos são as DE AGORA, não as de quando se carregou no botão.
    expect(r.doc.moodBoards.map((b) => b.images)).toEqual([
      ["q1/a.jpg", "q1/b.jpg", "q1/nova.jpg"],
      [],
    ]);
  });

  it("um mood board ARRASTADO para outro sítio não recebe a tradução do que lá estava", async () => {
    // O perigo da chave posicional: `boardTitulo:0` já é outro board. Escrever
    // ali «EN: Decoração Cerimónia» punha o título inglês da página errada num
    // documento que ninguém volta a conferir em português.
    const aoPedir = proposta();
    const { escritas } = await traduzirParaIngles(aoPedir, motorFalso);

    const trocados = proposta({
      moodBoards: [
        { title: "Complementos dos Noivos", images: ["q1/c.jpg"] },
        { title: "Decoração Cerimónia", images: ["q1/a.jpg", "q1/b.jpg"] },
      ],
    });
    const r = aplicarTraducao(trocados, escritas);

    // Nenhuma tradução foi escrita no board errado.
    expect(lerEn(r.doc, { tipo: "boardTitulo", bi: 0 })).not.toBe("EN: Decoração Cerimónia");
    expect(lerEn(r.doc, { tipo: "boardTitulo", bi: 1 })).not.toBe("EN: Complementos dos Noivos");
    // Cada uma foi ignorada por não encontrar o português com que partiu — e a
    // que casou por acaso (o texto é o mesmo) está no sítio certo.
    expect(r.escritos + r.ignorados.length).toBe(escritas.length);
  });

  it("um campo REESCRITO em português durante a espera não fica com a tradução velha", async () => {
    const aoPedir = proposta();
    const { escritas } = await traduzirParaIngles(aoPedir, motorFalso);

    const reescrito = proposta({
      moodBoards: [
        { title: "Decoração da Capela", images: ["q1/a.jpg", "q1/b.jpg"] },
        { title: "Complementos dos Noivos", images: ["q1/c.jpg"] },
      ],
    });
    const r = aplicarTraducao(reescrito, escritas);

    expect(lerEn(r.doc, { tipo: "boardTitulo", bi: 0 })).toBeUndefined();
    expect(lerEn(r.doc, { tipo: "boardTitulo", bi: 1 })).toBe("EN: Complementos dos Noivos");
    expect(r.ignorados.map((i) => i.pt)).toEqual(["Decoração Cerimónia"]);
    expect(r.escritos).toBe(escritas.length - 1);
  });

  it("um mood board APAGADO durante a espera não faz rebentar nem inventa um board", async () => {
    const aoPedir = proposta();
    const { escritas } = await traduzirParaIngles(aoPedir, motorFalso);
    const semOSegundo = proposta({
      moodBoards: [{ title: "Decoração Cerimónia", images: ["q1/a.jpg", "q1/b.jpg"] }],
    });
    const r = aplicarTraducao(semOSegundo, escritas);
    expect(r.doc.moodBoards).toHaveLength(1);
    expect(r.ignorados.map((i) => i.pt)).toEqual(["Complementos dos Noivos"]);
    expect(r.escritos).toBe(escritas.length - 1);
  });

  it("sem nada para escrever devolve o MESMO documento, por identidade", () => {
    const doc = proposta();
    expect(aplicarTraducao(doc, []).doc).toBe(doc);
    // E também quando tudo é ignorado: não se sujam as comparações por
    // referência de quem grava o rascunho com um documento igual ao anterior.
    const r = aplicarTraducao(doc, [
      { campo: { tipo: "boardTitulo", bi: 0 }, pt: "Outra coisa qualquer", en: "Something else" },
    ]);
    expect(r.doc).toBe(doc);
    expect(r.escritos).toBe(0);
  });

  it("escrever as traduções não mexe numa única fotografia", async () => {
    const doc = proposta();
    const { escritas } = await traduzirParaIngles(doc, motorFalso);
    const r = aplicarTraducao(doc, escritas);
    expect(r.doc.coverImages).toBe(doc.coverImages);
    r.doc.moodBoards.forEach((b, i) => {
      expect(b.images).toBe(doc.moodBoards[i].images);
    });
  });

  it("aplicado ao MESMO documento dá o mesmo que o `doc` que a tradução devolve", async () => {
    // O caminho antigo continua a valer para quem tem um documento parado (o
    // servidor, um teste). O que mudou é quem tem um documento vivo à mão.
    const doc = proposta();
    const r = await traduzirParaIngles(doc, motorFalso);
    expect(aplicarTraducao(doc, r.escritas).doc).toEqual(r.doc);
  });
});
