import { describe, expect, it, vi, beforeAll } from "vitest";
import { PDFDocument, PDFPage, PDFName, PDFDict, PDFRawStream, PDFNumber } from "pdf-lib";
import sharp from "sharp";
import { withProposalDefaults, resolveValidUntil, type ProposalDoc } from "@/lib/proposal-doc";
import { textosDaProposta } from "@/lib/proposal-doc-textos";
import { PAGINA_H, PAGINA_W } from "@/lib/proposal-geometria";
import { SITE } from "@/lib/site";
import { renderEditorialPdf } from "./montar";
import { textosEditoriais } from "./textos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O PDF EDITORIAL, PARTE 1 — capa, índice, «A proposta», separadores,
 * citação e contracapa
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que se guarda aqui é o que ela pediu por escrito e o que não se vê a olho
 * numa página: os números do índice são os das páginas verdadeiras, nada sai
 * da folha, os textos da casa saem tal e qual, e não há transparência por cima
 * das fotografias (é ela que dá o «cor-de-rosa» em alguns leitores).
 *
 * As fotografias são fabricadas aqui, com cores lisas e formas diferentes —
 * nenhuma foto de cliente entra num teste.
 */

vi.setConfig({ testTimeout: 90_000 });

async function foto(w: number, h: number, cor: string): Promise<string> {
  const b = await sharp({ create: { width: w, height: h, channels: 3, background: cor } })
    .jpeg({ quality: 80 })
    .toBuffer();
  return b.toString("base64");
}

let DEITADA = "";
let AO_ALTO = "";
let OUTRA = "";

beforeAll(async () => {
  DEITADA = await foto(1600, 1000, "#7a8a6a");
  AO_ALTO = await foto(800, 1200, "#c9a37a");
  OUTRA = await foto(1200, 1200, "#5a6a7a");
});

function docDeTeste(p: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "TESTE",
    clientNames: "TESTE Ana Sousa & TESTE Rui Matos",
    eventType: "Casamento",
    eventDate: "8 de julho de 2028",
    location: "Évora · Exterior",
    guests: "120 pax",
    ceremony: "Civil",
    coverImages: [DEITADA, AO_ALTO],
    serviceGroups: [
      { title: "Decoração Cerimónia", items: [{ label: "Altar" }] },
      { title: "Decoração Cocktail", items: [{ label: "Bar" }] },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: [AO_ALTO, DEITADA, OUTRA] },
      { title: "Decor Cocktail", images: [OUTRA, AO_ALTO] },
      { title: "Mesas de Jantar", images: [DEITADA, DEITADA, AO_ALTO, OUTRA, AO_ALTO] },
    ],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    validUntil: "2026-11-27",
    ...p,
  } as ProposalDoc);
}

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  largura: number;
  tamanho: number;
  texto: string;
}

/** Desenha e devolve tudo o que foi escrito, com a página e a posição. */
async function desenhar(doc: ProposalDoc, idioma: "pt" | "en" = "pt") {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const addPage = PDFDocument.prototype.addPage;
  const drawText = PDFPage.prototype.drawText;
  PDFDocument.prototype.addPage = function (...a: Parameters<typeof addPage>) {
    const p = addPage.apply(this, a) as PDFPage;
    paginas.push(p);
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
  try {
    const r = await renderEditorialPdf(doc, idioma);
    return { ...r, escritas, paginas: paginas.length };
  } finally {
    PDFDocument.prototype.addPage = addPage;
    PDFPage.prototype.drawText = drawText;
  }
}

const naPagina = (e: Escrita[], n: number) =>
  e
    .filter((x) => x.pagina === n)
    .map((x) => x.texto)
    .join(" | ");

describe("o plano das páginas", () => {
  it("capa, índice, «A proposta», um separador por capítulo, a citação e a contracapa", async () => {
    const { paginas, escritas } = await desenhar(docDeTeste());
    // 3 capítulos (Cerimónia, Cocktail, Jantar) → 1+1+1+3+1+1.
    expect(paginas).toBe(8);
    expect(naPagina(escritas, 4)).toContain("Cerimónia");
    expect(naPagina(escritas, 5)).toContain("Cocktail");
    // A citação vem a seguir ao capítulo do meio, como no exemplo.
    expect(naPagina(escritas, 6)).toContain("eternizamos memórias.»");
    expect(naPagina(escritas, 7)).toContain("Jantar");
  });

  it("o índice diz a página VERDADEIRA de cada capítulo", async () => {
    const { escritas } = await desenhar(docDeTeste());
    const indice = escritas.filter((e) => e.pagina === 2);
    const linhaDe = (titulo: string) => {
      const t = indice.find((e) => e.texto === titulo);
      expect(t, titulo).toBeDefined();
      // O número da página está na mesma linha, à direita.
      return indice.find((e) => Math.abs(e.y - t!.y) < 0.5 && e.x > t!.x && /^\d\d$/.test(e.texto))
        ?.texto;
    };
    expect(linhaDe("A proposta")).toBe("03");
    expect(linhaDe("Inspiração · Cerimónia")).toBe("04");
    expect(linhaDe("Inspiração · Cocktail")).toBe("05");
    // A citação (página 6) não entra no índice: o Jantar é a 7.
    expect(linhaDe("Inspiração · Jantar")).toBe("07");
  });

  it("o separador diz o número do capítulo no índice", async () => {
    const { escritas } = await desenhar(docDeTeste());
    expect(naPagina(escritas, 4)).toContain("02 · INSPIRAÇÃO");
    expect(naPagina(escritas, 7)).toContain("04 · INSPIRAÇÃO");
  });

  it("sem temas: sem separadores nem citação — e sem falhar", async () => {
    const { paginas } = await desenhar(docDeTeste({ moodBoards: [] }));
    expect(paginas).toBe(4);
  });

  it("sem fotografia nenhuma, sai na mesma (fundo liso)", async () => {
    const r = await desenhar(docDeTeste({ coverImages: ["", ""], moodBoards: [] }));
    expect(r.paginas).toBe(4);
    expect(r.undrawnImages).toBe(0);
  });
});

describe("o rodapé", () => {
  it("só nas páginas de texto, com o número da página", async () => {
    const { escritas } = await desenhar(docDeTeste());
    const linha = "Proposta de decoração · TESTE Ana Sousa & TESTE Rui Matos · 8 de julho de 2028";
    const comRodape = escritas.filter((e) => e.texto === linha).map((e) => e.pagina);
    expect(comRodape).toEqual([2, 3]);
    // O número fica na mesma linha, com dois algarismos.
    for (const n of [2, 3]) {
      const texto = escritas.find((e) => e.pagina === n && e.texto === linha)!;
      const numero = escritas.find(
        (e) => e.pagina === n && Math.abs(e.y - texto.y) < 0.5 && e.texto === `0${n}`,
      );
      expect(numero, `página ${n}`).toBeDefined();
    }
  });
});

describe("os textos da casa saem tal e qual", () => {
  it("a capa, o agradecimento, o lema, os contactos e a validade", async () => {
    const t = textosDaProposta("pt");
    const doc = docDeTeste();
    const { escritas, paginas } = await desenhar(doc);
    expect(naPagina(escritas, 1)).toContain("PROPOSTA · DECORAÇÃO");
    const contracapa = naPagina(escritas, paginas);
    expect(contracapa).toContain(t.obrigada);
    expect(contracapa.replace(/ \| /g, " ")).toContain(t.agradecimento);
    expect(contracapa).toContain(SITE.slogan);
    expect(contracapa).toContain(`${SITE.email} · ${SITE.phoneDisplay}`);
    expect(contracapa).toContain(t.passoValidade(t.data(resolveValidUntil(doc))));
  });

  it("em inglês, os rótulos do desenho são os ingleses", async () => {
    const te = textosEditoriais("en");
    const { escritas, paginas } = await desenhar(docDeTeste(), "en");
    const tudo = escritas.map((e) => e.texto).join(" | ");
    expect(tudo).toContain(te.tituloIndice);
    expect(tudo).toContain("Inspiration · Ceremony");
    expect(tudo).not.toContain("Conteúdo da proposta");
    expect(naPagina(escritas, paginas)).toContain(textosDaProposta("en").obrigada);
  });
});

describe("nada sai da folha", () => {
  const dentro = (e: Escrita) => {
    // O espaçamento entre letras não entra na largura do pdf-lib. Conta-se o
    // do desenho: 0,2 em por letra nas maiúsculas espaçadas (sobretítulos,
    // rótulos), 0,02 no resto (o rodapé).
    const espaco = /\p{Ll}/u.test(e.texto) ? 0.02 : 0.2;
    const folga = espaco * e.tamanho * [...e.texto].length;
    return e.x >= 0 && e.y >= 0 && e.x + e.largura + folga <= PAGINA_W + 0.5 && e.y <= PAGINA_H;
  };

  it("com nomes e local compridos", async () => {
    const { escritas, truncations } = await desenhar(
      docDeTeste({
        clientNames:
          "TESTE Maria Inês de Albuquerque Sousa Coutinho Vasconcelos & TESTE João Pedro Barros e Cunha de Menezes Albergaria",
        location:
          "Quinta da Herdade do Monte Alto das Oliveiras Velhas · Montemor-o-Novo · Exterior",
      }),
    );
    const fora = escritas.filter((e) => !dentro(e));
    expect(fora).toEqual([]);
    // Os nomes encolhem antes de cortar; se cortarem, o relatório di-lo.
    for (const c of truncations) expect(c.dropped).toBeGreaterThan(0);
  });

  it("os nomes não descem até à faixa dos dados da capa", async () => {
    const { escritas } = await desenhar(
      docDeTeste({
        clientNames:
          "TESTE Maria Inês de Albuquerque Sousa Coutinho Vasconcelos & TESTE João Pedro Barros e Cunha de Menezes Albergaria",
      }),
    );
    const capa = escritas.filter((e) => e.pagina === 1);
    const evento = capa.find((e) => e.texto === "EVENTO")!;
    const nomes = capa.filter((e) => e.tamanho > 25);
    expect(nomes.length).toBeGreaterThan(0);
    // A linha mais baixa dos nomes fica acima do fio da faixa (que está acima
    // dos rótulos), com margem.
    const maisBaixa = Math.min(...nomes.map((e) => e.y));
    expect(maisBaixa).toBeGreaterThan(evento.y + 40);
  });
});

describe("sem transparência por cima das fotografias", () => {
  it("nenhuma imagem tem máscara, a não ser o logótipo, e não há opacidade parcial", async () => {
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
    // Só o logótipo e o símbolo do rodapé têm recorte (são formas, não
    // rectângulos) — nenhuma fotografia.
    expect(comMascara).toBe(2);
    expect(opacidades).toBe(0);
  });
});
