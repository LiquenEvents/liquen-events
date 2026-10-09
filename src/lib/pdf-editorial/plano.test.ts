import { beforeAll, describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import sharp from "sharp";
import { withProposalDefaults, type ProposalDoc } from "@/lib/proposal-doc";
import { renderEditorialPdf } from "./montar";
import { listasQueNaoSaem, ordemDoDesenho, planoDaProposta } from "./plano";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PLANO E O PDF DIZEM O MESMO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O estúdio conta e mostra as páginas pelo `plano.ts`; o PDF desenha-as pelo
 * `montar.ts`. Se os dois divergirem, ela vê «a 9.ª de 24» e recebe 26 — o
 * defeito que a contagem antiga tinha («"Todas" mostra 7 páginas quando o PDF
 * tem cerca de 14»). Este teste desenha o PDF a sério e compara página a
 * página: o número, e o que está escrito nos separadores e nos temas.
 *
 * As fotografias são fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 240_000 });

let F = "";
beforeAll(async () => {
  F = (
    await sharp({ create: { width: 600, height: 400, channels: 3, background: "#7a8a6a" } })
      .jpeg({ quality: 70 })
      .toBuffer()
  ).toString("base64");
});
const fotos = (n: number) => Array.from({ length: n }, () => F);

function doc(p: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana & TESTE Rui",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora",
    coverImages: [F],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração",
        items: [{ label: "Decoração Cerimónia" }, { label: "Decoração Cocktail" }],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: fotos(3) },
      { title: "Decor Cocktail", images: fotos(5) },
      { title: "Mesas de Jantar", images: fotos(8) },
    ],
    budgetItems: ["Decoração Cerimónia", "Decoração Cocktail"],
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    validUntil: "2026-11-27",
    ...p,
  } as ProposalDoc);
}

/** O PDF desenhado: quantas páginas e o texto de cada uma. */
async function desenhar(d: ProposalDoc) {
  const paginas: PDFPage[] = [];
  const texto: string[] = [];
  const addPage = PDFDocument.prototype.addPage;
  const drawText = PDFPage.prototype.drawText;
  PDFDocument.prototype.addPage = function (...a: Parameters<typeof addPage>) {
    const p = addPage.apply(this, a) as PDFPage;
    paginas.push(p);
    texto.push("");
    return p;
  };
  PDFPage.prototype.drawText = function (t: string, o?: Parameters<typeof drawText>[1]) {
    texto[paginas.indexOf(this)] += ` ${t}`;
    return drawText.call(this, t, o);
  };
  try {
    await renderEditorialPdf(d, "pt");
    return texto.map((t) => t.replace(/\s+/g, " "));
  } finally {
    PDFDocument.prototype.addPage = addPage;
    PDFPage.prototype.drawText = drawText;
  }
}

/** As páginas do plano e do PDF batem uma a uma. */
async function batem(d: ProposalDoc, folga = 0) {
  const plano = planoDaProposta(d);
  const pdf = await desenhar(d);
  expect(
    Math.abs(plano.length - pdf.length),
    `plano ${plano.length}, PDF ${pdf.length}`,
  ).toBeLessThanOrEqual(folga);
  // Até às condições (que podem transbordar), cada página é a mesma.
  const ate = plano.findIndex((p) => p.tipo === "condicoes");
  for (let i = 0; i < ate; i++) {
    const p = plano[i];
    if (p.tipo === "separador") expect(pdf[i], `página ${i + 1}`).toContain(p.titulo);
    if (p.tipo === "tema" && p.titulo) expect(pdf[i], `página ${i + 1}`).toContain(p.titulo);
  }
  expect(plano[0].tipo).toBe("capa");
  expect(plano[plano.length - 1].tipo).toBe("contracapa");
  return { plano, pdf };
}

describe("o plano das páginas é o do PDF", () => {
  it("uma proposta típica: o mesmo número de páginas, pela mesma ordem", async () => {
    await batem(doc());
  });

  it("sem orçamento: não há investimento, e as condições ficam", async () => {
    const { plano } = await batem(
      doc({ budgetItems: [], totalText: "", totalAmount: undefined, budgetExtras: [] }),
    );
    expect(plano.some((p) => p.tipo === "separador" && p.grupo === null)).toBe(false);
    expect(plano.filter((p) => p.tipo === "condicoes").length).toBeGreaterThanOrEqual(3);
  });

  it("um tema com mais de 12 fotografias ocupa duas páginas", async () => {
    const { plano } = await batem(
      doc({ moodBoards: [{ title: "Mesas de Jantar", images: fotos(20) }] }),
    );
    const temas = plano.filter((p) => p.tipo === "tema");
    expect(temas).toHaveLength(2);
    expect(temas.map((t) => (t.tipo === "tema" ? t.fotos.length : 0))).toEqual([10, 10]);
  });

  it("um tema só com texto tem a sua página; um tema vazio não tem", async () => {
    const { plano } = await batem(
      doc({
        moodBoards: [
          { title: "Decoração Cerimónia", images: fotos(2) },
          { title: "Luzes", images: [], annotation: "TESTE só texto." },
          { title: "", images: [] },
        ],
      }),
    );
    expect(plano.filter((p) => p.tipo === "tema")).toHaveLength(2);
  });

  it("sem fotografias nenhumas: sem paleta e sem citação", async () => {
    const { plano } = await batem(doc({ moodBoards: [] }));
    expect(plano.some((p) => p.tipo === "ambiente" || p.tipo === "citacao")).toBe(false);
  });

  it("muitos serviços partem em páginas de seis cartões", async () => {
    const items = Array.from({ length: 13 }, (_, i) => ({ label: `TESTE serviço ${i + 1}` }));
    const { plano } = await batem(doc({ serviceGroups: [{ letter: "a)", title: "D", items }] }));
    expect(plano.filter((p) => p.tipo === "servicos")).toHaveLength(3);
  });

  it("um orçamento comprido parte o quadro", async () => {
    const budgetItems = Array.from({ length: 30 }, (_, i) => `TESTE rubrica do orçamento ${i + 1}`);
    const { plano } = await batem(doc({ budgetItems }), 1);
    expect(plano.filter((p) => p.tipo === "orcamento").length).toBeGreaterThan(1);
  });

  it("o modelo Organização leva o cronograma", async () => {
    const { plano } = await batem(
      doc({
        template: "organizacao",
        cronograma: [{ title: "Antes", items: ["TESTE visita", "TESTE prova"] }],
        budgetRows: [{ item: "TESTE coordenação", price: "1.000,00 €" }],
        totalEstimatedText: "1.000,00 €",
      } as Partial<ProposalDoc>),
    );
    expect(plano.some((p) => p.tipo === "cronograma")).toBe(true);
  });

  it("condições reescritas muito compridas: no máximo uma página de diferença", async () => {
    const longa =
      "TESTE uma condição comprida que ocupa várias linhas na coluna, escrita para obrigar a lista a passar para a página seguinte sem cortar nada.";
    await batem(doc({ condicoesGerais: Array.from({ length: 40 }, () => longa) }), 1);
  });
});

describe("a fotografia do cartão vai sempre à frente", () => {
  it("a marcada é a primeira a ser desenhada, em qualquer número de fotos", () => {
    expect(ordemDoDesenho({ images: ["a", "b", "c"], principal: 2 })).toEqual([2, 0, 1]);
    expect(ordemDoDesenho({ images: ["a", "b"], principal: 1 })).toEqual([1, 0]);
  });
  it("sem marca, ou com uma marca que já não existe, fica a ordem dela", () => {
    expect(ordemDoDesenho({ images: ["a", "b", "c"] })).toEqual([0, 1, 2]);
    expect(ordemDoDesenho({ images: ["a"], principal: 4 })).toEqual([0]);
  });
});

describe("as listas que não saem", () => {
  it("as condições gerais vazias dizem-se pelo nome", () => {
    const d = doc({ condicoesGerais: [], observacoesGerais: [] } as Partial<ProposalDoc>);
    expect(
      listasQueNaoSaem(d)
        .map((x) => x.nome)
        .join(" "),
    ).toMatch(/Condições/);
  });
  it("com o texto da casa não falta nada", () => {
    expect(listasQueNaoSaem(doc())).toEqual([]);
  });
});
