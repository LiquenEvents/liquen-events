import { describe, it, expect, beforeEach, vi } from "vitest";
import { MAX_PROPOSAL_DOC_BYTES, withProposalDefaults, type ProposalDoc } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM MODELO PARCIAL LEVA A TRADUÇÃO ATRÁS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o argumento que decidiu o modelo de dados. Um modelo do tipo «grupo» guarda
 * um `ServiceGroup` ISOLADO, fora do documento; um do tipo «moodboard» guarda um
 * `MoodBoard` isolado. Com as traduções coladas ao campo, vão de graça.
 *
 * Com a alternativa que parecia mais limpa — um mapa lateral no documento,
 * indexado pela chave do campo —, guardar um grupo como modelo PERDIA a
 * tradução, e ninguém dava por isso até abrir o modelo três casamentos depois.
 *
 * Trabalho de código: nenhum. Teste: obrigatório, senão a garantia vive só na
 * cabeça de quem escolheu.
 */

const guardado = new Map<string, unknown>();
vi.mock("server-only", () => ({}));
vi.mock("./app-state", () => ({
  getState: async (chave: string) => guardado.get(chave) ?? null,
  setState: async (chave: string, valor: unknown) => {
    guardado.set(chave, valor);
  },
}));

const { guardarModelo, listarModelos, MAX_BYTES } = await import("./proposal-templates");

beforeEach(() => {
  guardado.clear();
});

describe("modelos parciais bilingues", () => {
  it("um modelo de GRUPO guarda e devolve as traduções das linhas", async () => {
    await guardarModelo({
      id: "m1",
      nome: "Decoração standard",
      tipo: "grupo",
      criadoEm: "2026-08-13T00:00:00.000Z",
      grupo: {
        title: "Decoração Floral de Casamento",
        titleEn: "Wedding Floral Design",
        items: [
          { label: "Decor Cerimónia", labelEn: "Ceremony Decor" },
          { label: "Decor Jantar", labelEn: "Dinner Decor", desc: "Mesas", descEn: "Tables" },
        ],
      },
    });
    const [m] = await listarModelos();
    expect(m.grupo?.titleEn).toBe("Wedding Floral Design");
    expect(m.grupo?.items[0].labelEn).toBe("Ceremony Decor");
    expect(m.grupo?.items[1].descEn).toBe("Tables");
  });

  it("um modelo de MOOD BOARD guarda e devolve o título, o subtítulo e a nota em inglês", async () => {
    await guardarModelo({
      id: "m2",
      nome: "Cerimónia no claustro",
      tipo: "moodboard",
      criadoEm: "2026-08-13T00:00:00.000Z",
      moodboard: {
        title: "Decoração Cerimónia",
        titleEn: "Ceremony Decoration",
        subtitulo: "Arco e corredor",
        subtituloEn: "Arch and aisle",
        annotation: "Hortênsias verdes",
        annotationEn: "Green hydrangeas",
        images: ["t1/foto.jpg"],
      },
    });
    const [m] = await listarModelos();
    expect(m.moodboard?.titleEn).toBe("Ceremony Decoration");
    expect(m.moodboard?.subtituloEn).toBe("Arch and aisle");
    expect(m.moodboard?.annotationEn).toBe("Green hydrangeas");
  });

  it("um grupo bilingue é umas centenas de bytes — longe do tecto da lista", async () => {
    const grupo = {
      title: "Decoração Floral de Casamento",
      titleEn: "Wedding Floral Design",
      items: Array.from({ length: 12 }, (_, i) => ({
        label: `Decor Cerimónia ${i}`,
        labelEn: `Ceremony Decor ${i}`,
      })),
    };
    expect(JSON.stringify(grupo).length).toBeLessThan(MAX_BYTES / 100);
  });
});

/**
 * ── E O DOCUMENTO INTEIRO CONTINUA A CABER ────────────────────────────────
 *
 * A prosa de uma proposta cheia é ~13 KB de um documento de 18,5 KB no pior
 * caso (números medidos, em `proposal-doc.ts`). Duplicar SÓ a prosa acrescenta
 * uns KB contra um tecto de 512. O número é medido aqui, e não estimado, porque
 * um documento que passe o tecto deixa de poder ser gravado — e a mensagem que
 * ela veria seria «erro ao guardar».
 */
describe("o tamanho de uma proposta bilingue", () => {
  it("uma proposta cheia com tudo traduzido fica muito abaixo do tecto", () => {
    const linhas = Array.from({ length: 30 }, (_, i) => `Decoração Cerimónia ${i}`);
    const doc: ProposalDoc = withProposalDefaults({
      template: "decoracao",
      ref: "PO Decoração Casamento Tara e Marty · 12 de setembro de 2026",
      clientNames: "Tara & Marty",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Quinta do Hespanhol",
      guests: "250 pax",
      coverImages: ["capa/1.jpg", "capa/2.jpg"],
      serviceGroups: Array.from({ length: 6 }, (_, g) => ({
        letter: `${g})`,
        title: `Decoração Floral de Casamento ${g}`,
        titleEn: `Wedding Floral Design ${g}`,
        items: Array.from({ length: 10 }, (_, i) => ({
          label: `Decor Cerimónia ${i}`,
          labelEn: `Ceremony Decor ${i}`,
          desc: "Uma descrição do que a linha inclui, com algum detalhe.",
          descEn: "A description of what the line includes, with some detail.",
        })),
      })),
      moodBoards: Array.from({ length: 8 }, (_, b) => ({
        title: `Decoração Cerimónia ${b}`,
        titleEn: `Ceremony Decoration ${b}`,
        subtitulo: "Arco e corredor nupcial",
        subtituloEn: "Arch and bridal aisle",
        annotation: "Runner floral com hortênsias verdes, cravo verde e lisianthus branco.",
        annotationEn: "Floral runner with green hydrangeas, green carnation and white lisianthus.",
        images: Array.from({ length: 10 }, (_, i) => `board-${b}/foto-${i}.jpg`),
      })),
      budgetItems: linhas,
      budgetItemsEn: linhas.map((_, i) => `Ceremony Decoration ${i}`),
      budgetAmounts: linhas.map(() => 900),
      budgetExtras: Array.from({ length: 5 }, (_, i) => ({
        label: `Deslocação da equipa Líquen ${i}`,
        labelEn: `Líquen team travel ${i}`,
        valueText: "150,00 €",
      })),
      totalLabel: "Valor Total Decoração",
      totalLabelEn: "Decoration Total",
      totalText: "27.000,00 € + IVA",
      totalAmount: 27000,
      totalVatMode: "acrescer",
    } as Parameters<typeof withProposalDefaults>[0]);

    const bytes = JSON.stringify(doc).length;
    // Medido: à volta de 40 KB — cerca de 8% do tecto.
    expect(bytes).toBeLessThan(MAX_PROPOSAL_DOC_BYTES / 4);
  });
});
