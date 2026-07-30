import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
import { renderProposalDocPdf, renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, MOOD_BOARD_MAX_IMAGES, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * Smoke/golden do documento-proposta multi-página (landscape). Sem imagens reais
 * (mood boards vazios caem no placeholder do collage, sem tocar no sharp), o que
 * mantém o teste rápido e determinístico. Carregamos os bytes com
 * `PDFDocument.load`, confirmamos `%PDF-` e uma contagem de páginas plausível, e
 * exercitamos os dois templates do estúdio: "decoracao" e "organizacao".
 *
 * A exceção é a capa: aí o que interessa é o LADO onde cada foto sai impressa,
 * por isso esse teste desenha uma imagem a sério e lê a posição no conteúdo da
 * página (ver `coverPhotoXs`).
 */

/** Dimensões da página do documento (A4 paisagem), iguais às do gerador. */
const PAGE_W = 841.89;
const PAGE_H = 595.28;

/** Conteúdo (operadores) de uma página, já descomprimido. */
function pageContent(pdf: PDFDocument, index: number): string {
  const page = pdf.getPage(index);
  const contents = page.node.Contents();
  const parts: (PDFObject | undefined)[] =
    contents instanceof PDFArray ? contents.asArray() : [contents];
  let out = "";
  for (const part of parts) {
    const stream = page.node.context.lookup(part);
    if (stream instanceof PDFRawStream) {
      out += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
    }
  }
  return out;
}

/** pdf-lib escreve, antes de cada imagem, três matrizes: translação, rotação e
 *  escala (largura/altura de desenho). */
const PLACEMENT =
  /1 0 0 1 (-?[\d.]+) (-?[\d.]+) cm\s+1 0 0 1 0 0 cm\s+(-?[\d.]+) 0 0 (-?[\d.]+) 0 0 cm/g;

/** Os X onde foram desenhadas as fotos de CAPA — as únicas imagens que ocupam a
 *  altura toda da página, o que as distingue do logótipo e do resto. */
function coverPhotoXs(content: string): number[] {
  const xs: number[] = [];
  for (const m of content.matchAll(PLACEMENT)) {
    if (Math.abs(Number(m[4]) - PAGE_H) < 1) xs.push(Number(m[1]));
  }
  return xs;
}

/** Cada imagem embutida no PDF: bytes do stream, dimensões em pixéis e, para os
 *  JPEG, se é baseline ou progressivo. */
interface EmbeddedImage {
  bytes: Buffer;
  width: number;
  height: number;
  jpeg: boolean;
}
function embeddedImages(pdf: PDFDocument): EmbeddedImage[] {
  const out: EmbeddedImage[] = [];
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (String(obj.dict.get(PDFName.of("Subtype"))) !== "/Image") continue;
    out.push({
      bytes: Buffer.from(obj.contents),
      width: Number(String(obj.dict.get(PDFName.of("Width")))),
      height: Number(String(obj.dict.get(PDFName.of("Height")))),
      jpeg: String(obj.dict.get(PDFName.of("Filter"))) === "/DCTDecode",
    });
  }
  return out;
}

/** Marcador SOF: C0/C1 = baseline, C2 = progressivo. */
function hasProgressiveMarker(buf: Buffer): boolean {
  for (let i = 0; i < buf.length - 1; i++) {
    if (buf[i] === 0xff && buf[i + 1] === 0xc2) return true;
  }
  return false;
}

/** Uma fotografia GRANDE e realista: o preset com que a biblioteca de temas
 *  guarda as fotos (3000 px de lado maior, q0.92 → 2 a 3 MB). Ruído de baixa
 *  frequência ampliado comprime como fotografia, não como uma mancha lisa. */
async function bigPhoto(seed: number, portrait = false): Promise<Buffer> {
  const sw = 500;
  const sh = 340;
  const raw = Buffer.alloc(sw * sh * 3);
  let s = (seed * 2654435761) & 0x7fffffff;
  for (let i = 0; i < raw.length; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    raw[i] = (s >> 16) & 0xff;
  }
  return sharp(raw, { raw: { width: sw, height: sh, channels: 3 } })
    .resize(portrait ? 2000 : 3000, portrait ? 3000 : 2000, { kernel: "lanczos3" })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Uma foto minúscula, em retrato como as fotos de capa reais. */
async function photoB64(): Promise<string> {
  const bytes = await sharp({
    create: { width: 120, height: 240, channels: 3, background: { r: 90, g: 110, b: 90 } },
  })
    .jpeg()
    .toBuffer();
  return bytes.toString("base64");
}

/** Doc mínimo do template Decoração (total agrupado + mood boards). */
function decoracaoDoc(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Maria & Zé 12.09.2026",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha, Évora",
    guests: "80 pax",
    ceremony: "Civil, simbólica",
    time: "16h00",
    weddingPlanners: "Equipa AMARA",
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [
          { label: "Cerimónia", desc: "Arco floral e passadeira com pétalas naturais." },
          { label: "Copo d'água", desc: "Centros de mesa e iluminação ambiente." },
        ],
      },
    ],
    moodBoards: [
      { title: "Decoração Cerimónia", images: [], annotation: "Paleta em tons de musgo." },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'água"],
    budgetExtras: [
      { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
      { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
    ],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    coverImages: [],
  });
}

/** Doc mínimo do template Organização (cronograma + valores por linha). */
function organizacaoDoc(): ProposalDoc {
  return withProposalDefaults({
    template: "organizacao",
    ref: "Proposta Organização Casamento 12.09.2026",
    headerTitle: "Proposta de orçamento para Organização de Casamento",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Évora",
    guests: "80 pax",
    serviceGroups: [
      {
        title: "Coordenação",
        items: [{ label: "Reunião inicial" }, { label: "Gestão de fornecedores" }],
      },
    ],
    moodBoards: [],
    cronograma: [
      { title: "6-12 meses antes", items: ["Definição de conceito", "Seleção de espaço"] },
      { title: "1 mês antes", items: ["Confirmação de convidados"] },
    ],
    budgetItems: [],
    budgetRows: [
      { item: "Coordenação", price: "5.000,00 €" },
      { item: "Fornecedores", price: "7.500,00 €" },
    ],
    totalLabel: "Total Estimado",
    totalText: "",
    totalEstimatedText: "12.500,00 €",
    budgetNote: "Os valores são estimativas e podem ser ajustados.",
    coverImages: [],
  });
}

describe("renderProposalDocPdf", () => {
  it("renders the Decoração template across multiple pages", async () => {
    const bytes = await renderProposalDocPdf(decoracaoDoc());
    expect(bytes.length).toBeGreaterThan(1000);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    // cover + apresentação/serviços + mood board + orçamento + condições + … .
    expect(parsed.getPageCount()).toBeGreaterThan(3);
  });

  it("renders the Organização template (cronograma + budget rows)", async () => {
    const bytes = await renderProposalDocPdf(organizacaoDoc());
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    const parsed = await PDFDocument.load(bytes);
    expect(parsed.getPageCount()).toBeGreaterThan(3);
  });

  it("BUG-GUARD: a foto do slot 1 é impressa à DIREITA (e a do slot 0 à esquerda)", async () => {
    // O bug: escolher UMA foto para a capa da direita imprimia-a à esquerda,
    // porque o array da capa era compactado e a foto passava a estar no índice
    // 0. Com as duas posições fixas ("" = vazia), o lado é sempre o escolhido.
    const photo = await photoB64();

    const onlyRight = await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: ["", photo] });
    const xsRight = coverPhotoXs(pageContent(await PDFDocument.load(onlyRight), 0));
    expect(xsRight).toHaveLength(1);
    expect(xsRight[0]).toBeGreaterThan(PAGE_W / 2);

    const onlyLeft = await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: [photo, ""] });
    const xsLeft = coverPhotoXs(pageContent(await PDFDocument.load(onlyLeft), 0));
    expect(xsLeft).toHaveLength(1);
    expect(xsLeft[0]).toBeLessThan(PAGE_W / 2);

    // Com as duas preenchidas, uma de cada lado.
    const both = await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: [photo, photo] });
    const xsBoth = coverPhotoXs(pageContent(await PDFDocument.load(both), 0));
    expect(xsBoth).toHaveLength(2);
    expect(xsBoth[0]).toBeLessThan(PAGE_W / 2);
    expect(xsBoth[1]).toBeGreaterThan(PAGE_W / 2);
  });

  it("renders budget extras (deslocação, coordenação) without throwing", async () => {
    const doc = decoracaoDoc();
    doc.budgetExtras = [
      { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
      { label: "Valor Tecidos suspensos", valueText: "4.742,50 € + IVA" },
      { label: "Mobiliário e atoalhado (opção A)", valueText: "4.169,78 € + IVA" },
      { label: "", valueText: "" }, // blank line is filtered out, never crashes
    ];
    const bytes = await renderProposalDocPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });

  it("PESO: fotos grandes entram no PDF ao tamanho a que são DESENHADAS", async () => {
    // O documento gerado tem de ser uma ORDEM DE GRANDEZA mais leve do que a
    // soma das fotos que lhe deram origem — senão a Catarina descarrega dezenas
    // de MB e o leitor de PDF engasga-se a fazer scroll.
    const [a, b] = await Promise.all([bigPhoto(1, true), bigPhoto(2, true)]);
    const [c, d] = await Promise.all([bigPhoto(3), bigPhoto(4)]);
    const b64 = (buf: Buffer) => buf.toString("base64");
    // 2 na capa + 4 em cada um de dois mood boards = 10 colocações.
    const placed = [a, b, a, b, c, d, c, d, a, c];
    const sumInputs = placed.reduce((acc, buf) => acc + buf.length, 0);
    expect(sumInputs).toBeGreaterThan(8 * 1024 * 1024); // fotos mesmo grandes

    const doc = {
      ...decoracaoDoc(),
      coverImages: [b64(a), b64(b)],
      moodBoards: [
        {
          title: "Decoração Cerimónia",
          images: [a, b, c, d].map(b64),
          annotation: "Tons de musgo.",
        },
        { title: "Copo d'água", images: [c, d, a, c].map(b64) },
      ],
    };
    const bytes = await renderProposalDocPdf(doc);

    expect(bytes.length * 10).toBeLessThan(sumInputs);
    // …e continua a ser um PDF válido, com as páginas todas.
    const parsed = await PDFDocument.load(bytes);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(parsed.getPageCount()).toBeGreaterThan(3);
    // Nenhuma imagem embutida passa dos pixéis que a sua caixa justifica.
    const images = embeddedImages(parsed);
    expect(images.length).toBeGreaterThan(0);
    for (const im of images) expect(Math.max(im.width, im.height)).toBeLessThanOrEqual(2200);
  }, 30_000);

  it("FLUIDEZ: nenhuma imagem do PDF é um JPEG progressivo", async () => {
    // Progressivo dentro de DCTDecode obriga o leitor a várias passagens sobre a
    // imagem toda de cada vez que a página entra no ecrã (e o Acrobat nunca o
    // suportou em DCTDecode) — é o que tornava o scroll "travado".
    const photo = await photoB64();
    const doc = {
      ...decoracaoDoc(),
      coverImages: [photo, photo],
      moodBoards: [{ title: "Cerimónia", images: [photo, photo, photo] }],
    };
    const parsed = await PDFDocument.load(await renderProposalDocPdf(doc));
    const jpegs = embeddedImages(parsed).filter((im) => im.jpeg);
    expect(jpegs.length).toBeGreaterThan(0);
    for (const im of jpegs) expect(hasProgressiveMarker(im.bytes)).toBe(false);
  });

  it("a MESMA foto usada várias vezes é escrita UMA vez no ficheiro", async () => {
    // A capa é desenhada duas vezes (página 1 e contracapa) e a mesma foto pode
    // ir para os dois lados: sem cache de conteúdo eram QUATRO cópias da mesma
    // fotografia dentro do PDF.
    const photo = await photoB64();
    const parsed = await PDFDocument.load(
      await renderProposalDocPdf({ ...decoracaoDoc(), coverImages: [photo, photo] }),
    );
    const covers = embeddedImages(parsed).filter((im) => im.jpeg && im.height > 1000);
    expect(covers).toHaveLength(1);
    // …e continua a ser desenhada nos dois lados das duas capas.
    const front = coverPhotoXs(pageContent(parsed, 0));
    const back = coverPhotoXs(pageContent(parsed, parsed.getPageCount() - 1));
    expect(front).toHaveLength(2);
    expect(back).toHaveLength(2);
  });

  it("does NOT throw on client text Helvetica can't encode (emoji/CJK)", async () => {
    const doc = decoracaoDoc();
    doc.clientNames = "Festa 🎉 dos 李明";
    doc.serviceGroups[0].items[0] = { label: "Cerimónia 💐", desc: "Detalhe 🌿 com nome 李明." };
    const bytes = await renderProposalDocPdf(doc);
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
    expect(bytes.length).toBeGreaterThan(1000);
  });
});

/**
 * O QUE O DESENHO CORTA TEM DE SER DITO.
 *
 * O gerador tem limites de composição — 6 fotos por mood board, 5 linhas de
 * descrição, 2 linhas por campo do evento, 2 linhas no nome da capa — e até
 * aqui o que passava desses limites desaparecia em silêncio absoluto: as fotos
 * tinham sido carregadas pela Catarina, descarregadas do armazenamento com
 * sucesso, e simplesmente não eram desenhadas. Nem entravam na contagem de
 * "fotos em falta" que a avisa antes de a proposta seguir para o cliente,
 * porque essa só conta as que não RESOLVERAM.
 *
 * Estes testes fixam o relatório que agora acompanha os bytes. Fixam também o
 * DESENHO: o limite de 6 é uma decisão de composição e continua a valer — o
 * que muda é que deixa de ser mudo.
 */

/** Quantas imagens são DESENHADAS numa página (operador `Do`). */
function imageDraws(content: string): number {
  return [...content.matchAll(/\/Image-\d+ Do/g)].length;
}

/** Fotos desenhadas no collage: a página do mood board é a única página de
 *  CONTEÚDO com fotografias (as outras só desenham o logótipo do cabeçalho, e
 *  as capas ficam de fora da procura). Procurada e não fixada num índice porque
 *  a Apresentação pagina conforme o texto que leva. */
function collagePhotos(pdf: PDFDocument): number {
  let most = 0;
  for (let i = 1; i < pdf.getPageCount() - 1; i++) {
    most = Math.max(most, imageDraws(pageContent(pdf, i)) - 1);
  }
  return most;
}

/** Fotos pequenas mas TODAS DIFERENTES: iguais seriam embutidas uma só vez
 *  (cache por conteúdo) e não se via quantas foram mesmo desenhadas. */
async function distinctPhotos(n: number): Promise<string[]> {
  return Promise.all(
    Array.from({ length: n }, async (_, i) => {
      const bytes = await sharp({
        create: {
          width: 90,
          height: 90,
          channels: 3,
          background: { r: 20 + i * 20, g: 90, b: 70 },
        },
      })
        .jpeg()
        .toBuffer();
      return bytes.toString("base64");
    }),
  );
}

describe("relatório de conteúdo CORTADO pelo desenho", () => {
  it("uma proposta que cabe toda no desenho não inventa avisos", async () => {
    // Se o aviso disparasse por tudo e por nada, ela deixava de o ler.
    const { truncations } = await renderProposalDocPdfWithReport(decoracaoDoc());
    expect(truncations).toEqual([]);
  });

  it("mood board com 9 fotos: desenha 6 e DIZ que 3 ficaram de fora", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Decoração Cerimónia", images: await distinctPhotos(9) }],
    };
    const { bytes, truncations } = await renderProposalDocPdfWithReport(doc);
    expect(truncations).toContainEqual({
      where: "Mood board «Decoração Cerimónia»",
      dropped: 3,
      unit: "fotos",
    });
    // O desenho NÃO mudou para caber mais: continuam a ser 6 na página.
    const parsed = await PDFDocument.load(bytes);
    expect(collagePhotos(parsed)).toBe(MOOD_BOARD_MAX_IMAGES);
  }, 30_000);

  it("um mood board que cabe todo não é relatado", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Cerimónia", images: await distinctPhotos(MOOD_BOARD_MAX_IMAGES) }],
    };
    const { bytes, truncations } = await renderProposalDocPdfWithReport(doc);
    expect(truncations).toEqual([]);
    const parsed = await PDFDocument.load(bytes);
    expect(collagePhotos(parsed)).toBe(MOOD_BOARD_MAX_IMAGES);
  }, 30_000);

  it("sem título, o mood board é identificado pela POSIÇÃO (como no estúdio)", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [
        { title: "", images: await distinctPhotos(8) },
        { title: "Copo d'água", images: await distinctPhotos(7) },
      ],
    };
    const { truncations } = await renderProposalDocPdfWithReport(doc);
    expect(truncations).toContainEqual({ where: "Mood board 1", dropped: 2, unit: "fotos" });
    expect(truncations).toContainEqual({
      where: "Mood board «Copo d'água»",
      dropped: 1,
      unit: "fotos",
    });
  }, 30_000);

  it("a descrição do mood board que passa das 5 linhas é contada", async () => {
    const annotation = Array.from({ length: 120 }, (_, i) => `hortênsia verde ${i}`).join(", ");
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Cerimónia", images: await distinctPhotos(2), annotation }],
    };
    const { truncations } = await renderProposalDocPdfWithReport(doc);
    const corte = truncations.find((t) => t.where === "Descrição do mood board «Cerimónia»");
    expect(corte?.unit).toBe("linhas");
    expect(corte?.dropped).toBeGreaterThan(0);
  }, 30_000);

  it("um campo do evento com nome comprido é cortado a 2 linhas — e dito", async () => {
    // Um local a sério, com nome comprido: pede 3 linhas, a faixa desenha 2.
    const doc = {
      ...decoracaoDoc(),
      location:
        "Herdade da Quinta do Casal Novo de São Lourenço do Barrocal, Reguengos de Monsaraz, Alentejo",
    };
    const { truncations } = await renderProposalDocPdfWithReport(doc);
    expect(truncations).toContainEqual({ where: "Campo «Local»", dropped: 1, unit: "linhas" });
  });

  it("o nome do casal cortado na CAPA é dito (é a primeira coisa que o cliente vê)", async () => {
    // Com fotos na capa, o nome vive na banda central estreita: um nome de
    // casal a sério pede três linhas a 26pt e a capa desenha duas.
    const photo = await photoB64();
    const doc = {
      ...decoracaoDoc(),
      clientNames: "Maria Madalena Rebocho & José Francisco Themudo",
      coverImages: [photo, photo],
    };
    const { truncations } = await renderProposalDocPdfWithReport(doc);
    const corte = truncations.find((t) => t.where === "Nome na capa");
    expect(corte).toBeDefined();
    expect(corte?.unit).toBe("linhas");
    expect(corte?.dropped).toBeGreaterThan(0);
  });

  it("o nome que cabe em duas linhas na capa não é relatado", async () => {
    const photo = await photoB64();
    const { truncations } = await renderProposalDocPdfWithReport({
      ...decoracaoDoc(),
      clientNames: "Maria Madalena & José Francisco",
      coverImages: [photo, photo],
    });
    expect(truncations.filter((t) => t.where === "Nome na capa")).toEqual([]);
  });

  it("renderProposalDocPdf continua a devolver só os bytes", async () => {
    const bytes = await renderProposalDocPdf(decoracaoDoc());
    expect(Buffer.from(bytes.subarray(0, 5)).toString("latin1")).toBe("%PDF-");
  });
});
