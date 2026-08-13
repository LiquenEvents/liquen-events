import { describe, it, expect } from "vitest";
import {
  aplicarOrdem,
  chaveDeRubrica,
  eAOrdemEscrita,
  ordemDeSaida,
  ordemDosCapitulos,
  ORDEM_EXPLICITA,
  porOrdemDosCapitulos,
} from "./proposal-ordem";
import type { ProposalDoc } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REGRA DA ORDEM, LIDA DOS DOIS LADOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O comportamento IMPRESSO está preso em `proposal-doc-pdf.ordem.test.ts`, que
 * gera um PDF e volta a lê-lo. O que se prende aqui é a regra em si — a mesma
 * que o estúdio passou a chamar para desenhar as listas no ecrã.
 *
 * Enquanto a regra viveu dentro do gerador (`server-only`), o editor não a
 * podia ler: o ecrã mostrava a ordem de escrita e o PDF imprimia a dos
 * Serviços. Ela reportou a divergência duas vezes.
 */

const SERVICOS: Pick<ProposalDoc, "serviceGroups"> = {
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
};

/** A ordem do orçamento da proposta da Tara e do Marty, tal como saiu. */
const ORCAMENTO = ["Decor Cerimónia", "Decor Cocktail", "Decor Jantar", "Complementos dos Noivos"];

describe("chaveDeRubrica", () => {
  it("três nomes do mesmo capítulo dão a mesma chave", () => {
    // É isto que permite casar a lista de serviços com o quadro do orçamento e
    // com o título do mood board — na folha dela o mesmo sítio tem três nomes.
    const chaves = ["Decor Cerimónia", "Decoração Cerimónia", "Cerimónia"].map(chaveDeRubrica);
    expect(new Set(chaves).size).toBe(1);
    expect(chaves[0]).toBe("cerimonia");
  });

  it("capítulos diferentes não colidem", () => {
    expect(chaveDeRubrica("Decor Cocktail")).not.toBe(chaveDeRubrica("Decor Jantar"));
  });

  it("um nome só com palavras sem peso não vale como chave", () => {
    // «Design Floral» sozinho não distingue nada: casaria com tudo.
    expect(chaveDeRubrica("Design Floral")).toBe("");
    expect(chaveDeRubrica("   ")).toBe("");
  });
});

describe("ordemDeSaida", () => {
  it("o orçamento segue a ordem dos serviços", () => {
    const ordem = ordemDeSaida({ ...SERVICOS }, ORCAMENTO, (s) => s);
    expect(aplicarOrdem(ORCAMENTO, ordem)).toEqual([
      "Decor Cerimónia",
      "Complementos dos Noivos",
      "Decor Cocktail",
      "Decor Jantar",
    ]);
  });

  /**
   * ── O INTERRUPTOR ────────────────────────────────────────────────────────
   * A partir do momento em que ela arruma à mão, a sugestão cala-se. Sem isto,
   * arrastar um mood board era pô-lo no sítio e vê-lo voltar ao lugar «certo» —
   * um editor que desfaz o que se acaba de fazer.
   */
  it("num documento arrumado à mão, a ordem escrita vale sozinha", () => {
    const ordem = ordemDeSaida(
      { ...SERVICOS, ordemExplicita: ORDEM_EXPLICITA },
      ORCAMENTO,
      (s) => s,
    );
    expect(eAOrdemEscrita(ordem)).toBe(true);
    expect(aplicarOrdem(ORCAMENTO, ordem)).toEqual(ORCAMENTO);
  });

  it("sem serviços escritos não há ordem nenhuma a impor", () => {
    const ordem = ordemDeSaida({ serviceGroups: [] }, ORCAMENTO, (s) => s);
    expect(eAOrdemEscrita(ordem)).toBe(true);
  });

  it("uma lista de um item, ou vazia, sai como está", () => {
    expect(ordemDeSaida({ ...SERVICOS }, ["Decor Jantar"], (s) => s)).toEqual([0]);
    expect(ordemDeSaida({ ...SERVICOS }, [], (s) => s)).toEqual([]);
  });
});

describe("as três travas", () => {
  const ordem = ordemDosCapitulos(SERVICOS);

  it("sem correspondência, herda o lugar de quem vem antes — e fica colado", () => {
    // «Corredor Nupcial» não é rubrica do orçamento: viaja com a Cerimónia a
    // que pertence, em vez de ir parar ao fim do documento.
    const boards = ["Decor Cerimónia", "Corredor Nupcial", "Decor Cocktail"];
    const saida = aplicarOrdem(
      boards,
      porOrdemDosCapitulos(boards, (s) => s, ordem),
    );
    expect(saida).toEqual(["Decor Cerimónia", "Corredor Nupcial", "Decor Cocktail"]);
  });

  it("um documento onde nada casa sai exactamente como está escrito", () => {
    const nada = ["Transporte", "Seguro", "Estacionamento"];
    expect(eAOrdemEscrita(porOrdemDosCapitulos(nada, (s) => s, ordem))).toBe(true);
  });

  it("a ordenação é estável: empates ficam pela ordem escrita", () => {
    // Duas linhas do mesmo capítulo mantêm-se pela ordem em que ela as
    // escreveu — reordená-las entre si seria mexer sem razão nenhuma.
    const duas = ["Decor Jantar — mesas", "Decor Jantar — bolo"];
    expect(eAOrdemEscrita(porOrdemDosCapitulos(duas, (s) => s, ordem))).toBe(true);
  });
});

describe("aplicarOrdem", () => {
  it("os arrays paralelos viajam com a mesma permutação", () => {
    // Os preços são um array paralelo às linhas. Aplicar a ordem a um e não ao
    // outro trocava os preços de sítio — um erro que só se vê quando o cliente
    // pergunta.
    const ordem = ordemDeSaida({ ...SERVICOS }, ORCAMENTO, (s) => s);
    const precos = [820, 460, 1250, 320];
    expect(aplicarOrdem(ORCAMENTO, ordem)).toEqual([
      "Decor Cerimónia",
      "Complementos dos Noivos",
      "Decor Cocktail",
      "Decor Jantar",
    ]);
    expect(aplicarOrdem(precos, ordem)).toEqual([820, 320, 460, 1250]);
  });
});
