import { describe, expect, it, vi, beforeAll } from "vitest";
import { PDFDocument, PDFPage, PDFName, PDFDict, PDFRawStream, PDFNumber } from "pdf-lib";
import sharp from "sharp";
import { withProposalDefaults, resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { blocosFixosNaLingua, textosDaProposta } from "@/lib/proposal-doc-textos";
import { PAGINA_H, PAGINA_W } from "@/lib/proposal-geometria";
import { SITE } from "@/lib/site";
import { renderEditorialPdf } from "./montar";
import { textosEditoriais } from "./textos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PDF EDITORIAL — a proposta inteira
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que ela pediu por escrito, depois de gerar a proposta «Margarida &
 * Duarte» e encontrar 8 páginas onde o exemplo tem 26:
 *
 *   · todas as secções do exemplo, pela mesma ordem;
 *   · cada tema com TODAS as suas fotografias, o título e a nota;
 *   · as condições sempre, iguais às do gerador antigo, com ou sem orçamento;
 *   · o índice com «Investimento» e «Condições» nas páginas reais;
 *   · nenhuma transparência por cima das fotografias.
 *
 * As fotografias são fabricadas aqui — nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 180_000 });

async function foto(w: number, h: number, cor: string): Promise<string> {
  const b = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return b.toString("base64");
}

let DEITADA = "";
let AO_ALTO = "";
let QUADRADA = "";
const fotos = (n: number) =>
  Array.from({ length: n }, (_, i) => [DEITADA, AO_ALTO, QUADRADA][i % 3]);

beforeAll(async () => {
  DEITADA = await foto(1800, 1200, "#7a8a6a");
  AO_ALTO = await foto(900, 1350, "#c9a37a");
  QUADRADA = await foto(1200, 1200, "#5a6a7a");
});

/** A proposta do exemplo: os mesmos valores, com nomes TESTE. */
function docDeTeste(p: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana Sousa & TESTE Rui Matos",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora · Exterior",
    guests: "50 a 100",
    ceremony: "Civil",
    coverImages: [DEITADA, AO_ALTO],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral e Decoração",
        items: [
          { label: "Decoração Cerimónia" },
          { label: "Decoração Cocktail" },
          { label: "Decoração Mesas Jantar" },
        ],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: fotos(3) },
      { title: "Decor Cocktail", images: fotos(5) },
      { title: "Mesas de Jantar", images: fotos(8), annotation: "TESTE nota do jantar." },
    ],
    budgetItems: ["Decoração Cerimónia", "Decoração Cocktail", "Decoração Mesas Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "3.200,00 € + IVA",
    totalAmount: 3200,
    totalVatMode: "acrescer",
    vatRate: 0.23,
    depositPercent: 30,
    budgetExtras: [{ label: "Deslocação equipa Líquen", valueText: "460,00 €" }],
    budgetExtrasSomam: true,
    validUntil: "2026-11-27",
    ...p,
  } as ProposalDoc);
}

/** Sem orçamento nenhum: sem linhas, sem total. */
const semOrcamento: Partial<ProposalDoc> = {
  budgetItems: [],
  totalText: "",
  totalAmount: undefined,
  budgetExtras: [],
};

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  largura: number;
  tamanho: number;
  texto: string;
}

/** Desenha e devolve tudo o que foi escrito e quantas imagens cada página leva. */
async function desenhar(doc: ProposalDoc, idioma: "pt" | "en" = "pt") {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const imagens: number[] = [];
  const addPage = PDFDocument.prototype.addPage;
  const drawText = PDFPage.prototype.drawText;
  const drawImage = PDFPage.prototype.drawImage;
  PDFDocument.prototype.addPage = function (...a: Parameters<typeof addPage>) {
    const p = addPage.apply(this, a) as PDFPage;
    paginas.push(p);
    imagens.push(0);
    return p;
  };
  PDFPage.prototype.drawText = function (texto: string, o?: Parameters<typeof drawText>[1]) {
    const tamanho = o?.size ?? 12;
    escritas.push({
      pagina: paginas.indexOf(this) + 1,
      x: o?.x ?? 0,
      y: o?.y ?? 0,
      tamanho,
      largura: o?.font ? o.font.widthOfTextAtSize(texto, tamanho) : 0,
      texto,
    });
    return drawText.call(this, texto, o);
  };
  PDFPage.prototype.drawImage = function (...a: Parameters<typeof drawImage>) {
    imagens[paginas.indexOf(this)]++;
    return drawImage.apply(this, a);
  };
  try {
    const r = await renderEditorialPdf(doc, idioma);
    return { ...r, escritas, imagens, paginas: paginas.length };
  } finally {
    PDFDocument.prototype.addPage = addPage;
    PDFPage.prototype.drawText = drawText;
    PDFPage.prototype.drawImage = drawImage;
  }
}

/** Todo o texto de uma página numa só linha, com os espaços normalizados. */
const naPagina = (e: Escrita[], n: number) =>
  e
    .filter((x) => x.pagina === n)
    .map((x) => x.texto)
    .join(" ")
    .replace(/[\s  ]+/g, " ");
const tudo = (e: Escrita[]) =>
  e
    .map((x) => x.texto)
    .join(" ")
    .replace(/[\s  ]+/g, " ");

describe("a sequência do exemplo, pela mesma ordem", () => {
  it("capa, índice, proposta, serviços, paleta, capítulos, citação, investimento, condições, contracapa", async () => {
    const { paginas, escritas } = await desenhar(docDeTeste());
    const t = textosDaProposta("pt");
    const te = textosEditoriais("pt");
    const esperado: [number, string][] = [
      [1, "PROPOSTA · DECORAÇÃO"],
      [2, te.tituloIndice],
      [3, "Uma decoração pensada para o dia de TESTE e TESTE"],
      [4, "Três serviços de decoração floral e decoração"],
      [5, te.tituloAmbiente],
      [6, "02 · INSPIRAÇÃO Cerimónia"],
      [7, "Decoração Cerimónia"],
      [8, "03 · INSPIRAÇÃO Cocktail"],
      [9, "Decor Cocktail"],
      [10, "eternizamos memórias.»"],
      [11, "04 · INSPIRAÇÃO Jantar"],
      [12, "TESTE nota do jantar."],
      [13, "05 Investimento"],
      [14, te.tituloOrcamento],
      [15, "4.501,80 €"],
      [16, te.tituloNotas],
      [17, te.tituloCondicoesGerais],
      [18, te.tituloPagamento],
      [19, t.obrigada],
    ];
    expect(paginas).toBe(19);
    for (const [n, texto] of esperado)
      expect(naPagina(escritas, n), `página ${n}`).toContain(texto);
  });

  it("o índice diz a página VERDADEIRA de cada secção, investimento e condições incluídos", async () => {
    const { escritas } = await desenhar(docDeTeste());
    const indice = escritas.filter((e) => e.pagina === 2);
    const paginaDe = (titulo: string) => {
      const t = indice.find((e) => e.texto === titulo);
      expect(t, titulo).toBeDefined();
      return indice.find((e) => Math.abs(e.y - t!.y) < 0.5 && e.x > t!.x && /^\d\d$/.test(e.texto))
        ?.texto;
    };
    expect(paginaDe("A proposta")).toBe("03");
    expect(paginaDe("Inspiração · Cerimónia")).toBe("06");
    expect(paginaDe("Inspiração · Cocktail")).toBe("08");
    expect(paginaDe("Inspiração · Jantar")).toBe("11");
    expect(paginaDe("Investimento")).toBe("13");
    expect(paginaDe("Condições")).toBe("16");
  });
});

describe("os temas: todas as fotografias, o título e a nota", () => {
  it.each([0, 1, 2, 3, 4, 5, 8, 12])("um tema com %i fotografias desenha-as todas", async (n) => {
    const doc = docDeTeste({
      moodBoards: [{ title: "Corredor", images: fotos(n), annotation: "TESTE nota" }],
    });
    const { escritas, imagens } = await desenhar(doc);
    const pagina = escritas.find((e) => e.texto === "Corredor")!.pagina;
    // A página do tema leva exactamente as suas fotografias.
    expect(imagens[pagina - 1]).toBe(n);
    expect(naPagina(escritas, pagina)).toContain("TESTE nota");
  });

  it("acima de doze, reparte por duas páginas — a segunda diz «Mais ideias…»", async () => {
    const doc = docDeTeste({ moodBoards: [{ title: "Corredor", images: fotos(13) }] });
    const { escritas, imagens } = await desenhar(doc);
    const paginas = [
      ...new Set(escritas.filter((e) => e.texto === "Corredor").map((e) => e.pagina)),
    ];
    expect(paginas).toHaveLength(2);
    expect(paginas.reduce((s, p) => s + imagens[p - 1], 0)).toBe(13);
    expect(naPagina(escritas, paginas[1])).toContain("Mais ideias…");
  });

  it("uma nota muito longa encolhe e não passa do mosaico", async () => {
    const longa = "TESTE uma nota muito comprida, escrita à mão no estúdio. ".repeat(14);
    const doc = docDeTeste({
      moodBoards: [{ title: "Corredor", images: fotos(8), annotation: longa }],
    });
    const { escritas } = await desenhar(doc);
    const pagina = escritas.find((e) => e.texto === "Corredor")!.pagina;
    // O mosaico ocupa a metade de cima (395 px) — nada da nota passa abaixo dela.
    const fundoDoMosaico = PAGINA_H - (395 * PAGINA_W) / 1123;
    for (const e of escritas.filter((x) => x.pagina === pagina)) {
      expect(e.y, e.texto).toBeGreaterThan(fundoDoMosaico);
    }
  });
});

describe("as condições: sempre, e palavra por palavra", () => {
  it.each([
    ["com orçamento", {}],
    ["SEM orçamento", semOrcamento],
  ])("%s, cada ponto dos blocos fixos está no PDF tal e qual", async (_, extra) => {
    const doc = docDeTeste(extra);
    const fixos = blocosFixosNaLingua(doc, "pt");
    const { escritas } = await desenhar(doc);
    const texto = tudo(escritas);
    const pontos = [
      ...fixos.notasImportantes,
      ...fixos.incluido,
      ...fixos.naoIncluido,
      ...fixos.observacoesGerais,
      ...fixos.condicoesGerais,
      ...fixos.faseamento,
      ...fixos.cancelamento,
    ];
    expect(pontos.length).toBeGreaterThan(10);
    for (const p of pontos) expect(texto).toContain(p.replace(/\s+/g, " "));
    expect(texto).toContain(SITE.email);
    expect(texto).toContain(SITE.phoneDisplay);
  });

  it("sem orçamento, não há «Investimento» no índice e as condições continuam lá", async () => {
    const { escritas } = await desenhar(docDeTeste(semOrcamento));
    const indice = naPagina(escritas, 2);
    expect(indice).not.toContain("Investimento");
    expect(indice).toContain("Condições");
  });
});

describe("os números do orçamento são os do gerador antigo", () => {
  it("os sete valores do exemplo", async () => {
    const texto = tudo((await desenhar(docDeTeste())).escritas);
    for (const v of [
      "3.200,00 €",
      "+ 460,00 €",
      "3.660,00 €",
      "841,80 €",
      "4.501,80 €",
      "1.350,54 €",
      "3.151,26 €",
    ]) {
      expect(texto).toContain(v);
    }
  });
});

describe("o rodapé", () => {
  it("«LÍQUEN EVENTS», o nome da proposta e o número, nas páginas de texto", async () => {
    const { escritas } = await desenhar(docDeTeste());
    // Nas páginas com painel de fotografia o rodapé é mais estreito e o nome
    // da proposta acaba em «…», como no exemplo — conta o princípio.
    const comRodape = escritas
      .filter((e) => e.y < 45 && e.texto.startsWith("Proposta de decoração · TESTE"))
      .map((e) => e.pagina);
    // Índice, proposta, serviços, paleta, orçamento, total, três de condições.
    expect(comRodape).toEqual(expect.arrayContaining([2, 3, 4, 5, 14, 15, 16, 17, 18]));
    for (const n of comRodape) {
      const marca = escritas.find((e) => e.pagina === n && e.texto === "LÍQUEN EVENTS" && e.y < 45);
      expect(marca, `marca na página ${n}`).toBeDefined();
    }
  });
});

describe("os textos da casa", () => {
  it("a contracapa sai como no gerador antigo", async () => {
    const t = textosDaProposta("pt");
    const doc = docDeTeste();
    const { escritas, paginas } = await desenhar(doc);
    const contracapa = naPagina(escritas, paginas);
    expect(contracapa).toContain(t.obrigada);
    expect(contracapa).toContain(t.agradecimento);
    expect(contracapa).toContain(SITE.slogan);
    expect(contracapa).toContain(t.passoValidade(t.data(resolveValidUntil(doc))));
  });

  it("em inglês, os rótulos do desenho são os ingleses", async () => {
    const te = textosEditoriais("en");
    const { escritas } = await desenhar(docDeTeste(), "en");
    const texto = tudo(escritas);
    expect(texto).toContain(te.tituloIndice);
    expect(texto).toContain("Inspiration · Ceremony");
    expect(texto).toContain(te.tituloPagamento);
    expect(texto).not.toContain("Conteúdo da proposta");
  });
});

describe("nada sai da folha nem desce ao rodapé", () => {
  it("com nomes e local compridos", async () => {
    const { escritas, truncations } = await desenhar(
      docDeTeste({
        clientNames:
          "TESTE Maria Inês de Albuquerque Sousa Coutinho Vasconcelos & TESTE João Pedro Barros e Cunha de Menezes Albergaria",
        location:
          "Quinta da Herdade do Monte Alto das Oliveiras Velhas · Montemor-o-Novo · Exterior",
      }),
    );
    const fora = escritas.filter((e) => {
      const espaco = /\p{Ll}/u.test(e.texto) ? 0.02 : 0.2;
      const folga = espaco * e.tamanho * [...e.texto].length;
      return e.x < 0 || e.y < 0 || e.x + e.largura + folga > PAGINA_W + 0.5 || e.y > PAGINA_H;
    });
    expect(fora).toEqual([]);
    for (const c of truncations) expect(c.dropped).toBeGreaterThan(0);
  });
});

describe("sem transparência por cima das fotografias", () => {
  it("só o logótipo tem máscara, e não há opacidade parcial", async () => {
    const { bytes } = await desenhar(docDeTeste());
    const pdf = await PDFDocument.load(bytes);
    let comMascara = 0;
    let opacidades = 0;
    for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
      const dict = obj instanceof PDFRawStream ? obj.dict : obj instanceof PDFDict ? obj : null;
      if (!dict) continue;
      if (
        dict.get(PDFName.of("Subtype")) === PDFName.of("Image") &&
        dict.has(PDFName.of("SMask"))
      ) {
        comMascara++;
      }
      for (const k of ["ca", "CA"]) {
        const v = dict.get(PDFName.of(k));
        if (v instanceof PDFNumber && v.asNumber() < 1) opacidades++;
      }
    }
    expect(comMascara).toBe(1);
    expect(opacidades).toBe(0);
  });
});
