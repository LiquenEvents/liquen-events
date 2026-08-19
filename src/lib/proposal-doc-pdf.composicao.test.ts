import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdf, renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { SITE } from "./site";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COMPOSIÇÃO — O QUE SE VÊ NA FOLHA, MEDIDO NA FOLHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro prende os defeitos de COMPOSIÇÃO que o relatório `IDEIAS-PDF.md`
 * mediu num lote de dezasseis PDFs gerados a sério: texto desenhado por cima
 * das fotografias da capa, um título de mood board 74,3 pontos FORA do papel,
 * um nome de casal cortado a acabar num «&», uma rubrica de orçamento órfã na
 * folha seguinte por quatro pontos, e uma ressalva sobre dinheiro deitada fora.
 *
 * Nenhum deles era apanhado pela suite: não são regressões, são buracos.
 *
 * ── COMO SE MEDE ──────────────────────────────────────────────────────────
 * Como no `proposal-doc-pdf.paginacao.test.ts`: grava-se o que o desenho PEDE
 * — cada `drawText` com a sua página, o seu `x`, o seu `y` e o seu tamanho —,
 * porque as fontes vão embutidas em subconjunto e os bytes do ficheiro deixam
 * de ser legíveis. A LARGURA de cada linha calcula-se com a mesma fonte com que
 * foi desenhada, que é o que permite dizer «isto acaba fora do papel».
 */

vi.setConfig({ testTimeout: 30_000 });

const M = 68;
const W = 841.89;
const H = 595.28;

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  /** A largura a que a linha foi MESMO desenhada — medida com a fonte dela. */
  largura: number;
  tamanho: number;
}

function instrumentar() {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawTextOriginal = PDFPage.prototype.drawText;

  PDFDocument.prototype.addPage = function (...args: Parameters<typeof addPageOriginal>) {
    const p = addPageOriginal.apply(this, args) as PDFPage;
    paginas.push(p);
    return p;
  };
  PDFPage.prototype.drawText = function (
    texto: string,
    opts?: Parameters<typeof drawTextOriginal>[1],
  ) {
    const s = String(texto);
    const tamanho = opts?.size ?? 10;
    let largura = 0;
    try {
      largura = opts?.font?.widthOfTextAtSize(s, tamanho) ?? 0;
    } catch {
      largura = 0;
    }
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: s,
      largura,
      tamanho,
    });
    return drawTextOriginal.call(this, texto, opts);
  };

  return {
    escritas,
    restaurar() {
      PDFDocument.prototype.addPage = addPageOriginal;
      PDFPage.prototype.drawText = drawTextOriginal;
    },
  };
}

async function desenhar(doc: ProposalDoc, idioma?: "pt" | "en"): Promise<Escrita[]> {
  const espia = instrumentar();
  try {
    if (idioma) await renderProposalDocPdf(doc, idioma);
    else await renderProposalDocPdf(doc);
  } finally {
    espia.restaurar();
  }
  return espia.escritas;
}

/** Uma proposta de decoração normal, com capa, mood board e quadro. */
function proposta(over: Record<string, unknown> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha, Évora",
    guests: "80 pax",
    serviceGroups: [],
    moodBoards: [],
    coverImages: [],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "4.800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer" as const,
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/* ═══════════════════════════════════════════════════════════════════════════
   O ACABAMENTO DO DOCUMENTO
   ═══════════════════════════════════════════════════════════════════════════ */

describe("as propriedades do documento", () => {
  /**
   * O autor do ficheiro era «pdf-lib» — a biblioteca que o desenha. É o que
   * aparece nas propriedades do documento, no gestor de ficheiros e no
   * separador do browser de quem abre o anexo.
   */
  it("dizem quem fez a proposta e sobre quem ela é — e não a biblioteca", async () => {
    const bytes = await renderProposalDocPdf(proposta());
    // `updateMetadata: false` é obrigatório para LER: a pdf-lib reescreve o
    // «Producer» com o nome dela própria a cada `load`, e sem isto o teste
    // media a leitura em vez do ficheiro.
    const lido = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(lido.getAuthor()).toBe(SITE.name);
    expect(lido.getProducer()).toBe(SITE.name);
    expect(lido.getCreator()).toBe(SITE.name);
    expect(lido.getTitle()).toContain("Maria & Zé");
    expect(lido.getSubject()).toContain("Monte da Oliveirinha");
    expect(lido.getKeywords()).toContain(SITE.name);
  });

  /** A língua do documento é a língua em que ele foi escrito. */
  it("dizem a língua do documento", async () => {
    const pt = await PDFDocument.load(await renderProposalDocPdf(proposta()));
    const en = await PDFDocument.load(await renderProposalDocPdf(proposta(), "en"));
    expect(pt.catalog.get(pt.catalog.context.obj("Lang"))?.toString()).toContain("pt-PT");
    expect(en.catalog.get(en.catalog.context.obj("Lang"))?.toString()).toContain("en-GB");
  });
});

describe("o rodapé", () => {
  /**
   * Escrevia «01». Quem imprime não sabe se recebeu o documento todo — falta o
   * denominador, e o denominador só se sabe no fim (ver a segunda passagem).
   */
  it("diz em que folha se está E quantas há", async () => {
    const escritas = await desenhar(proposta());
    const folhas = escritas.filter((e) => /^\d\d de \d\d$/.test(e.texto));
    expect(folhas.length, "nenhuma folha diz «NN de NN»").toBeGreaterThan(0);
    const total = folhas[0].texto.split(" de ")[1];
    // O denominador é o mesmo em todas as folhas, e é o número de folhas do
    // documento — contado a partir da capa, que é como se conta na mão.
    for (const f of folhas) expect(f.texto.endsWith(` de ${total}`)).toBe(true);
    const doc = await PDFDocument.load(await renderProposalDocPdf(proposta()));
    expect(Number(total)).toBe(doc.getPageCount());
  });

  it("numa proposta inglesa diz «of», e não «de»", async () => {
    const escritas = await desenhar(proposta(), "en");
    expect(escritas.some((e) => /^\d\d of \d\d$/.test(e.texto))).toBe(true);
    expect(escritas.some((e) => /^\d\d de \d\d$/.test(e.texto))).toBe(false);
  });
});

describe("o texto espaçado", () => {
  /**
   * «LÍQUEN EVENTS» e «INSPIRAÇÃO» eram desenhados GLIFO A GLIFO — treze
   * operadores de texto por palavra, em todas as páginas. Passam a ser uma
   * corrida de texto com o espaçamento do PDF (`Tc`).
   */
  it("é uma escrita só, e não uma letra de cada vez", async () => {
    const escritas = await desenhar(
      proposta({ moodBoards: [{ title: "Cerimónia", images: [], layout: "filas" }] }),
    );
    expect(escritas.some((e) => e.texto === "LÍQUEN EVENTS")).toBe(true);
    // E não há nenhuma escrita de uma letra só a fazer de palavra.
    const soltas = escritas.filter((e) => [...e.texto].length === 1 && /\p{L}/u.test(e.texto));
    expect(soltas.map((e) => e.texto)).toEqual([]);
  });
});
