import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { ProposalDoc } from "./proposal-doc";
import { boardsQueSaem, folhasAproximadas, paginasDaProposta } from "./proposal-paginas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONTAGEM TEM DE BATER CERTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Todas" mostra 7 páginas quando o PDF tem cerca de 14».
 *
 * Não era um contador partido — eram duas coisas diferentes com o mesmo nome:
 * a vista mostrava só os mood boards. O que se prende aqui é que passe a haver
 * UMA lista, com a ordem do gerador, e que o número que dela sai seja o mesmo
 * que o «PDF com cerca de N páginas» diz.
 */

const BASE = {
  template: "decoracao",
  ref: "PO",
  clientNames: "Maria & Zé",
  serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
  moodBoards: [],
  budgetItems: [],
  coverImages: ["a.jpg", "b.jpg"],
  totalAmount: 3000,
  cronograma: [],
} as unknown as ProposalDoc;

const comBoards = (n: number) =>
  ({
    ...BASE,
    moodBoards: Array.from({ length: n }, (_, i) => ({
      title: `Board ${i + 1}`,
      images: [`foto-${i}.jpg`],
    })),
  }) as unknown as ProposalDoc;

describe("as páginas de uma proposta", () => {
  it("uma proposta sem inspiração tem a espinha toda, e por ordem", () => {
    expect(paginasDaProposta(BASE).map((p) => p.especie)).toEqual([
      "capa",
      "apresentacao",
      "orcamento",
      "condicoes",
      "observacoes",
      "contracapa",
    ]);
  });

  /**
   * O NÚMERO QUE ELA VÊ.
   *
   * Sete folhas fixas mais uma por página de inspiração — medido a sério, com
   * PDFs de 0, 1 e 3 boards (7, 8 e 10 folhas). É o mesmo número que o estúdio
   * mostra antes de gerar, e a partir de agora sai daqui.
   */
  it.each([
    [0, 7],
    [1, 8],
    [3, 10],
    [7, 14],
  ])("com %i mood boards, o PDF tem cerca de %i folhas", (boards, folhas) => {
    expect(folhasAproximadas(comBoards(boards))).toBe(folhas);
  });

  it("os sete que ela viu eram os mood boards, e não o documento", () => {
    // O defeito, dito ao contrário: com sete boards a vista antiga mostrava
    // sete de catorze. Agora as duas contagens são a mesma lista.
    const doc = comBoards(7);
    expect(paginasDaProposta(doc).filter((p) => p.especie === "moodboard")).toHaveLength(7);
    // Treze secções: capa, apresentação, sete inspirações, orçamento,
    // condições, observações e contracapa. As catorze FOLHAS são estas treze
    // com a apresentação a ocupar duas.
    expect(paginasDaProposta(doc)).toHaveLength(13);
    expect(folhasAproximadas(doc)).toBe(14);
  });

  it("um board sem fotografias não produz página nenhuma", () => {
    // O gerador salta-o de propósito: nunca mostrar a um cliente uma folha
    // vazia. Desenhá-lo na vista era prometer uma página que não existe.
    const doc = {
      ...BASE,
      moodBoards: [
        { title: "Por fazer", images: [] },
        { title: "Feito", images: ["f.jpg"] },
      ],
    } as unknown as ProposalDoc;
    expect(boardsQueSaem(doc)).toEqual([1]);
    expect(paginasDaProposta(doc).filter((p) => p.especie === "moodboard")).toHaveLength(1);
  });

  it("o cronograma só tem página quando tem tarefas escritas", () => {
    const semTarefas = {
      ...BASE,
      cronograma: [{ title: "6-12 meses antes", items: ["", "  "] }],
    } as unknown as ProposalDoc;
    expect(paginasDaProposta(semTarefas).some((p) => p.especie === "cronograma")).toBe(false);

    const comTarefas = {
      ...BASE,
      cronograma: [{ title: "6-12 meses antes", items: ["Escolher a quinta"] }],
    } as unknown as ProposalDoc;
    expect(paginasDaProposta(comTarefas).some((p) => p.especie === "cronograma")).toBe(true);
  });

  /**
   * CADA PÁGINA SABE DE ONDE VEIO.
   *
   * Palavras dela: «hoje vê-se um problema na página 5 e tem de se procurar
   * onde ele nasce». Sem isto, a miniatura é uma imagem bonita e nada mais.
   */
  it("cada página diz que secção do formulário a produz", () => {
    for (const p of paginasDaProposta(comBoards(2))) {
      expect(p.seccao, `${p.especie} sem secção`).toBeTruthy();
    }
  });

  it("e uma página de inspiração diz QUAL board é, pelo índice real", () => {
    const doc = {
      ...BASE,
      moodBoards: [
        { title: "Vazio", images: [] },
        { title: "Bouquets", images: ["f.jpg"] },
      ],
    } as unknown as ProposalDoc;
    const pagina = paginasDaProposta(doc).find((p) => p.especie === "moodboard");
    // O índice é o do documento, e não a posição na lista de páginas: é por ele
    // que o clique abre o board certo.
    expect(pagina?.bi).toBe(1);
    expect(pagina?.titulo).toBe("Bouquets");
  });

  it("um board sem título ainda assim se nomeia", () => {
    const doc = {
      ...BASE,
      moodBoards: [{ title: "  ", images: ["f.jpg"] }],
    } as unknown as ProposalDoc;
    expect(paginasDaProposta(doc).find((p) => p.especie === "moodboard")?.titulo).toBe(
      "Inspiração 1",
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ESPINHA É A DO GERADOR, E NÃO UMA SEGUNDA OPINIÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este módulo enumera as secções que o PDF desenha. Se alguém acrescentar uma
 * secção ao gerador e não a acrescentar aqui, a vista de conjunto volta
 * silenciosamente a mostrar menos do que existe — que é exactamente o defeito
 * que isto veio fechar.
 *
 * Não se pode comparar folha a folha sem desenhar o PDF. Compara-se o que se
 * pode: os cabeçalhos numerados que o gerador escreve.
 */
describe("a lista não fica para trás do gerador", () => {
  const fonte = readFileSync(
    fileURLToPath(new URL("./proposal-doc-pdf.ts", import.meta.url)),
    "utf8",
  );

  it("as secções numeradas do PDF têm todas página aqui", () => {
    // `sectionHeader(p, t.sobretituloX, numerada(t.tituloX), …)` — o nome da
    // secção sai do sobretítulo.
    const noGerador = [...fonte.matchAll(/t\.sobretitulo([A-Za-z]+)/g)].map((m) => m[1]);
    const unicos = [...new Set(noGerador)];
    expect(unicos.length, "o gerador deixou de ter secções numeradas?").toBeGreaterThan(3);

    // A correspondência entre o nome no gerador e a espécie aqui.
    const equivalencias: Record<string, string> = {
      Apresentacao: "apresentacao",
      Servicos: "apresentacao",
      Inspiracao: "moodboard",
      Cronograma: "cronograma",
      Orcamento: "orcamento",
      Condicoes: "condicoes",
    };
    for (const nome of unicos) {
      expect(
        equivalencias[nome],
        `O gerador desenha uma secção «${nome}» que a lista de páginas não conhece. ` +
          `Acrescenta-a ao \`paginasDaProposta\` — senão a vista de conjunto volta a ` +
          `mostrar menos páginas do que o PDF tem.`,
      ).toBeTruthy();
    }
  });
});
