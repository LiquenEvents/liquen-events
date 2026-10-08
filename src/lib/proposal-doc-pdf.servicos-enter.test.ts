import { describe, it, expect, vi } from "vitest";
import { PDFPage } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";

/**
 * Achado n.º 2 da auditoria (Crítico): uma linha de serviço escrita com
 * «Enter», sem descrição, saía no PDF com a segunda linha desenhada POR CIMA da
 * linha seguinte. A medição contava uma linha; o desenho fazia duas.
 */
vi.setConfig({ testTimeout: 60_000 });

async function escritasDe(doc: ProposalDoc) {
  const escritas: { texto: string; y: number; corpo: number }[] = [];
  const original = PDFPage.prototype.drawText;
  PDFPage.prototype.drawText = function (texto: string, opts?: Parameters<typeof original>[1]) {
    escritas.push({ texto: String(texto), y: opts?.y ?? 0, corpo: opts?.size ?? 10 });
    return original.call(this, texto, opts);
  };
  try {
    await renderProposalDocPdf(doc, "pt");
  } finally {
    PDFPage.prototype.drawText = original;
  }
  return escritas;
}

const comServicos = (items: { label: string; desc?: string }[]) =>
  withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Évora",
    guests: "80 pax",
    serviceGroups: [{ letter: "a)", title: "Decoração", items }],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    coverImages: [],
    moodBoards: [],
  });

describe("PDF — uma linha de serviço só com rótulo também se parte", () => {
  it("o «Enter» não põe a segunda linha por cima da seguinte", async () => {
    const e = await escritasDe(
      comServicos([
        { label: "Arco de flores na cerimónia\ncom segunda linha" },
        { label: "Mesa dos noivos" },
      ]),
    );
    // O `drawText` do pdf-lib desenha um «\n» como linha nova, por baixo —
    // é assim que a segunda linha caía em cima da seguinte. Cada linha tem de
    // ser desenhada por si, à altura que foi medida.
    expect(e.filter((x) => x.texto.includes("\n")).map((x) => x.texto)).toEqual([]);
    const segunda = e.find((x) => x.texto.includes("com segunda linha"));
    const seguinte = e.find((x) => x.texto.includes("Mesa dos noivos"));
    expect(segunda && seguinte).toBeTruthy();
    // Mais abaixo na página = y menor. A seguinte tem de ficar pelo menos uma
    // linha inteira abaixo da segunda linha da anterior.
    expect(segunda!.y - seguinte!.y).toBeGreaterThanOrEqual(seguinte!.corpo);
  });

  it("um rótulo comprido demais quebra em vez de sair da página", async () => {
    const longo = Array.from({ length: 40 }, (_, i) => `palavra${i}`).join(" ");
    const e = await escritasDe(comServicos([{ label: longo }, { label: "Mesa dos noivos" }]));
    const pedacos = e.filter((x) => /palavra\d/.test(x.texto));
    expect(pedacos.length).toBeGreaterThan(1);
    const seguinte = e.find((x) => x.texto.includes("Mesa dos noivos"))!;
    const ultimo = Math.min(...pedacos.map((x) => x.y));
    expect(ultimo - seguinte.y).toBeGreaterThanOrEqual(seguinte.corpo);
  });
});
