import { describe, it, expect, vi, afterEach } from "vitest";
import sharp from "sharp";
import {
  PDFArray,
  PDFDocument,
  PDFName,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
/**
 * O caminho principal do desenho (`resizeToBox`, sharp) é o real. A encenação
 * serve um só teste: o que acontece quando ESSE caminho falha no servidor
 * implantado e o gerador cai no recurso de embutir os bytes originais — que foi
 * exatamente o que aconteceu na proposta que saiu com molduras vazias.
 */
const st = vi.hoisted(() => ({ sharpResizeAvariado: false }));
vi.mock("@/lib/proposal-image", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/proposal-image")>();
  return {
    ...real,
    resizeToBox: async (...args: Parameters<typeof real.resizeToBox>) =>
      st.sharpResizeAvariado ? null : real.resizeToBox(...args),
  };
});

import { renderProposalDocPdf, renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, MOOD_BOARD_MAX_IMAGES, type ProposalDoc } from "@/lib/proposal-doc";

/**
 * Desenhar um documento inteiro passa dos 5 segundos por omissão do vitest
 * quando a rede toda corre em paralelo — e passava só nesses casos, o que dava
 * um vermelho que desaparecia mal se corresse o ficheiro sozinho. Metade destes
 * testes já trazia `30_000` à mão, um a um; fica um número só, para o ficheiro.
 */
vi.setConfig({ testTimeout: 30_000 });

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
    /**
     * A capa identifica-se pelo ASPECTO, e já não por «tem mais de 1000 px de
     * altura».
     *
     * Essa altura vinha de a caixa da capa pedir 617×1323 px — e vinha-lhe
     * SEMPRE, mesmo quando a foto de origem tinha 120×240, porque o
     * redimensionamento ampliava sem limite. Deixou de ampliar (ver
     * `resizeToBox`: não se inventam pixéis), portanto uma foto pequena entra
     * pequena. O que não muda, e é o que este teste precisa, é a FORMA: o
     * recorte é sempre ao aspecto exacto da caixa, ≈ 0,467.
     */
    const ASPECTO_DA_CAPA = 277.8 / 595.28;
    const covers = embeddedImages(parsed).filter(
      (im) => im.jpeg && Math.abs(im.width / im.height - ASPECTO_DA_CAPA) < 0.02,
    );
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

  /**
   * ════════════════════════════════════════════════════════════════════════
   * UM CAMPO QUE FALTA NÃO PODE SER UM ERRO NO BOTÃO «GERAR»
   * ════════════════════════════════════════════════════════════════════════
   *
   * O `withProposalDefaults` já converte os ARRAYS em falta para `[]`, com a
   * nota escrita ao lado: «a corrupt/old localStorage draft could omit them […]
   * would throw "undefined is not iterable" → generic 500 "erro ao gerar"». Os
   * CAMPOS de dentro desses arrays não tinham a mesma rede.
   *
   * O `label` de um serviço é obrigatório no tipo, e o tipo não manda em nada
   * do que chega aqui: o `doc` vem do corpo de um pedido (a rota valida a `ref`
   * e os nomes, e mais nada), de um rascunho antigo, de uma cópia de segurança
   * restaurada, ou de um documento relido a partir de um PDF. Sem ele, o
   * desenho atirava `TypeError: Cannot read properties of undefined (reading
   * 'trim')` — e o que ela via era isso, dentro de um 500, em inglês.
   */
  it("um serviço sem `label` desenha a proposta em vez de rebentar", async () => {
    const doc = decoracaoDoc();
    // Exactamente o que um rascunho antigo traz: a descrição sem o rótulo.
    doc.serviceGroups[0].items = [
      { desc: "Arco floral e passadeira." } as (typeof doc.serviceGroups)[0]["items"][0],
      {} as (typeof doc.serviceGroups)[0]["items"][0],
    ];
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

  // A lotação subiu de 6 para 10 quando os layouts passaram a ser cinco: a
  // proposta feita à mão chega às dez numa página, em duas filas. O aviso
  // continua a existir e a contar o que fica de fora — é ele que impede uma
  // proposta de seguir com fotos a menos sem ninguém saber.
  it("mood board com 13 fotos: desenha 10 e DIZ que 3 ficaram de fora", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Decoração Cerimónia", images: await distinctPhotos(13) }],
    };
    const { bytes, truncations } = await renderProposalDocPdfWithReport(doc);
    expect(truncations).toContainEqual({
      where: "Mood board «Decoração Cerimónia»",
      dropped: 3,
      unit: "fotos",
    });
    // O desenho não passa da lotação: continuam a ser MOOD_BOARD_MAX_IMAGES.
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
        { title: "", images: await distinctPhotos(12) },
        { title: "Copo d'água", images: await distinctPhotos(11) },
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
    /**
     * A apresentação deixou de ser uma grelha de quatro colunas e passou a ser
     * a lista da folha dela («Local: …», tudo na mesma linha): cada valor
     * ganhou a medida das notas do orçamento — 550 pontos menos o rótulo, à
     * volta de 100 caracteres por linha, quando na coluna cabiam 30.
     *
     * O corte a duas linhas ficou onde estava, e continua a ser DITO: o que
     * mudou é quanto é preciso escrever para lá chegar. Este local tem 280
     * caracteres — três linhas cheias — e é o género de coisa que só aparece
     * quando alguém cola a morada inteira no campo errado.
     */
    const doc = {
      ...decoracaoDoc(),
      location:
        "Herdade da Quinta do Casal Novo de São Lourenço do Barrocal, Estrada Nacional 255, ao quilómetro doze, Reguengos de Monsaraz, distrito de Évora, Alentejo, com entrada pelo portão sul junto à capela antiga e estacionamento na eira, a norte da adega velha da herdade",
    };
    const { truncations } = await renderProposalDocPdfWithReport(doc);
    expect(truncations).toContainEqual({ where: "Campo «Local»", dropped: 1, unit: "linhas" });
  });

  it("o nome do casal cortado na CAPA é dito (é a primeira coisa que o cliente vê)", async () => {
    /**
     * ── O QUE MUDOU, E PORQUÊ ────────────────────────────────────────────
     *
     * Este teste usava «Maria Madalena Rebocho & José Francisco Themudo» —
     * quarenta e sete caracteres — e exigia que a capa o CORTASSE, porque a
     * capa encolhia o nome só até 26 e depois partia-o em duas linhas.
     *
     * Esse era o defeito, e é o que deixou de acontecer: o nome encolhe até 18
     * e cabe em três linhas, e nomes desse tamanho passam a sair inteiros (a
     * capa acabava num «&» com o noivo desaparecido). O que se prende aqui
     * continua a ser o mesmo — que o corte, QUANDO acontece, é DITO — mas
     * agora é preciso um nome que não caiba mesmo.
     */
    const photo = await photoB64();
    const doc = {
      ...decoracaoDoc(),
      clientNames:
        "Maria Madalena Rebocho de Vasconcelos e Sousa Coutinho de Albuquerque " +
        "& José Francisco Themudo de Mendonça Furtado de Mesquita Bourbon",
      coverImages: [photo, photo],
    };
    const { truncations } = await renderProposalDocPdfWithReport(doc);
    const corte = truncations.find((t) => t.where === "Nome na capa");
    expect(corte).toBeDefined();
    expect(corte?.unit).toBe("linhas");
    expect(corte?.dropped).toBeGreaterThan(0);
  });

  /** E o nome que ANTES era cortado sai agora inteiro — é o ponto da mudança. */
  it("um nome de casal a sério cabe na capa inteiro", async () => {
    const photo = await photoB64();
    const { truncations } = await renderProposalDocPdfWithReport({
      ...decoracaoDoc(),
      clientNames: "Maria Madalena Rebocho & José Francisco Themudo",
      coverImages: [photo, photo],
    });
    expect(truncations.find((t) => t.where === "Nome na capa")).toBeUndefined();
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

/**
 * NUNCA UMA MOLDURA VAZIA — E UMA FOTO QUE NÃO SE DESENHA É UMA FOTO EM FALTA.
 *
 * A avaria, tal como chegou do estúdio: uma página de mood board saiu com SEIS
 * molduras e DUAS fotos, e o PDF seguiu assim para o cliente. As quatro fotos em
 * branco vinham da Biblioteca de Temas, e a origem delas era o Pinterest — que
 * serve as imagens em WebP. O `pdf-lib` só sabe embutir JPEG e PNG: quando o
 * caminho do sharp falha e o gerador cai no recurso de embutir os bytes
 * ORIGINAIS, um JPEG ainda sai e um WebP não sai de todo. O contorno, esse, era
 * desenhado sempre — por cima de nada.
 *
 * Três coisas ficam fixadas aqui:
 *  1. um WebP e um JPEG no mesmo mood board são AMBOS desenhados;
 *  2. uma foto que não há maneira de desenhar não deixa moldura nenhuma;
 *  3. …e é CONTADA, para o estúdio ser avisado antes de a proposta seguir.
 */

/** Contorno de célula do collage: rectângulo FECHADO, traçado a 0,5 pt na cor
 *  `LINE`. A hairline do rodapé usa a mesma cor e espessura mas é um traço
 *  aberto (`m … l S`, sem `h`), por isso não entra nesta conta. */
const MOLDURA =
  /0\.886 0\.871 0\.835 RG\s+0\.5 w\s+\[\] 0 d\s+1 0 0 1 [-\d.]+ [-\d.]+ cm\s+1 0 0 1 0 0 cm\s+1 0 0 1 0 0 cm\s+0 0 m\s+0 [-\d.]+ l\s+[-\d.]+ [-\d.]+ l\s+[-\d.]+ 0 l\s+h\s+S/g;

/** A página de mood board: a única página de CONTEÚDO com fotografias (as
 *  outras só desenham o logótipo; as capas ficam de fora da procura). */
function moodBoardPage(pdf: PDFDocument): string {
  let best = "";
  let most = 0;
  for (let i = 1; i < pdf.getPageCount() - 1; i++) {
    const content = pageContent(pdf, i);
    const fotos = imageDraws(content) - 1; // menos o logótipo do cabeçalho
    if (fotos > most) {
      most = fotos;
      best = content;
    }
  }
  return best;
}

/** Quantas molduras de célula foram desenhadas nesta página. */
function frames(content: string): number {
  return [...content.matchAll(MOLDURA)].length;
}

/** Uma foto real em WebP — o formato em que o Pinterest serve as imagens. */
async function webpB64(seed = 40): Promise<string> {
  const bytes = await sharp({
    create: { width: 160, height: 120, channels: 3, background: { r: seed, g: 120, b: 90 } },
  })
    .webp()
    .toBuffer();
  return bytes.toString("base64");
}

/** Uma foto real em JPEG, para acompanhar a WebP no mesmo mood board. */
async function jpegB64(seed = 200): Promise<string> {
  const bytes = await sharp({
    create: { width: 160, height: 120, channels: 3, background: { r: seed, g: 60, b: 60 } },
  })
    .jpeg()
    .toBuffer();
  return bytes.toString("base64");
}

/** Bytes que NÃO são imagem nenhuma: nem o `pdf-lib` os embute nem o sharp os
 *  lê. É a foto que não há maneira de desenhar. */
function lixoB64(): string {
  return Buffer.alloc(96, 0x5a).toString("base64");
}

afterEach(() => {
  st.sharpResizeAvariado = false;
});

describe("uma foto que não se desenha não deixa moldura (e conta como em falta)", () => {
  it("mood board com uma WEBP e uma JPEG: as DUAS são desenhadas", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Decoração Floral", images: [await webpB64(), await jpegB64()] }],
    };
    const { bytes, undrawnImages } = await renderProposalDocPdfWithReport(doc);
    const parsed = await PDFDocument.load(bytes);
    const page = moodBoardPage(parsed);
    expect(imageDraws(page) - 1).toBe(2); // as duas fotos, além do logótipo
    expect(frames(page)).toBe(2); // cada uma com a sua moldura
    expect(undrawnImages).toBe(0);
  }, 30_000);

  it("BUG-GUARD: …e continuam as DUAS a ser desenhadas quando o sharp não redimensiona", async () => {
    // A avaria a sério: no servidor implantado o caminho do `resizeToBox`
    // falhou e o gerador caiu no recurso de embutir os bytes ORIGINAIS. Aí o
    // JPEG entrava e o WebP não — umas fotos apareciam, as outras deixavam a
    // moldura vazia. Agora os bytes que o `pdf-lib` não sabe ler são
    // convertidos para JPEG antes de serem embutidos.
    st.sharpResizeAvariado = true;
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Decoração Floral", images: [await webpB64(), await jpegB64()] }],
    };
    const { bytes, undrawnImages } = await renderProposalDocPdfWithReport(doc);
    const parsed = await PDFDocument.load(bytes);
    const page = moodBoardPage(parsed);
    expect(imageDraws(page) - 1).toBe(2);
    expect(frames(page)).toBe(2);
    expect(undrawnImages).toBe(0);
  }, 30_000);

  it("a foto impossível NÃO deixa moldura — e a boa sai com a dela", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Decoração Floral", images: [await jpegB64(), lixoB64()] }],
    };
    const { bytes } = await renderProposalDocPdfWithReport(doc);
    const parsed = await PDFDocument.load(bytes);
    const page = moodBoardPage(parsed);
    expect(imageDraws(page) - 1).toBe(1);
    // UMA moldura, não duas: um rectângulo vazio num PDF que vai para o
    // cliente é pior do que não haver caixa nenhuma.
    expect(frames(page)).toBe(1);
  }, 30_000);

  it("a foto impossível CONTA como foto em falta", async () => {
    const doc = {
      ...decoracaoDoc(),
      moodBoards: [{ title: "Decoração Floral", images: [await jpegB64(), lixoB64()] }],
    };
    const { undrawnImages, truncations } = await renderProposalDocPdfWithReport(doc);
    expect(undrawnImages).toBe(1);
    // E NÃO como conteúdo cortado: não há aqui escolha de composição nenhuma,
    // é uma avaria — a correcção é recarregar a foto, não editar o documento.
    expect(truncations).toEqual([]);
  }, 30_000);

  it("a MESMA foto impossível em vários sítios conta UMA vez", async () => {
    // A capa é desenhada duas vezes (página 1 e contracapa) e a mesma foto pode
    // ir para os dois lados: contar cada desenho mandava o estúdio procurar
    // quatro fotos onde só há uma.
    const lixo = lixoB64();
    const { undrawnImages } = await renderProposalDocPdfWithReport({
      ...decoracaoDoc(),
      coverImages: [lixo, lixo],
      moodBoards: [{ title: "Decoração Floral", images: [await jpegB64(), lixo] }],
    });
    expect(undrawnImages).toBe(1);
  }, 30_000);

  it("uma proposta inteira que se desenha bem não inventa fotos em falta", async () => {
    const { undrawnImages } = await renderProposalDocPdfWithReport({
      ...decoracaoDoc(),
      coverImages: [await photoB64(), await photoB64()],
      moodBoards: [{ title: "Decoração Floral", images: await distinctPhotos(4) }],
    });
    expect(undrawnImages).toBe(0);
  }, 30_000);
});

describe("os números internos nunca saem no PDF", () => {
  /**
   * O custo por linha e a margem existem para ela decidir se o negócio se faz.
   * Um deles impresso na proposta é o fim da negociação antes de ela começar —
   * e ao contrário de quase tudo o resto, isto não se corrige depois: o email
   * sai uma vez.
   *
   * ── PORQUE É UMA COMPARAÇÃO E NÃO UMA PROCURA ────────────────────────────
   * Procurar "1357" no ficheiro não serve: o texto vai como códigos de glifo
   * hexadecimais (a fonte é subconjunto), e os dígitos que se encontram em
   * texto cru são coordenadas — "0.2468" dava um falso positivo e um teste que
   * falha por engano acaba apagado.
   *
   * O que se compara é o que fica DESENHADO: as duas versões do mesmo
   * documento, uma com custos e outra sem, têm de produzir exactamente as
   * mesmas instruções de desenho. Se um dia alguém puser a margem "só no
   * rodapé para conferir", os fluxos deixam de bater certo e isto acusa.
   */
  it("um documento com custos desenha exactamente o mesmo que um sem custos", async () => {
    const semCustos = {
      ...decoracaoDoc(),
      budgetItems: ["Decoração de cerimónia", "Arranjos de mesa"],
      budgetAmounts: [4321, 8765],
    };
    const comCustos = { ...semCustos, budgetCosts: [1357, 2468] };

    const fluxos = async (doc: Parameters<typeof renderProposalDocPdf>[0]) => {
      const pdf = await PDFDocument.load(await renderProposalDocPdf(doc));
      let texto = "";
      for (let i = 0; i < pdf.getPageCount(); i += 1) texto += pageContent(pdf, i);
      return texto;
    };

    expect(await fluxos(comCustos)).toBe(await fluxos(semCustos));
  });
});

describe("a versão base e a versão com extras", () => {
  /**
   * O casal pede "uma coisa mais simples e outra com tudo". A alternativa a
   * isto eram duas propostas — dois documentos a divergir, e ao fim de duas
   * semanas ninguém saber qual é a que vale.
   */
  const comExtras = () => ({
    ...decoracaoDoc(),
    budgetItems: ["Decoração de cerimónia", "Arranjos de mesa", "Arco floral"],
    budgetAmounts: [4000, 3000, 1500],
    budgetOpcional: [false, false, true],
    totalAmount: 8500,
    totalVatMode: "acrescer" as const,
  });

  const desenho = async (doc: Parameters<typeof renderProposalDocPdf>[0]) => {
    const pdf = await PDFDocument.load(await renderProposalDocPdf(doc));
    let texto = "";
    for (let i = 0; i < pdf.getPageCount(); i += 1) texto += pageContent(pdf, i);
    return texto;
  };

  it("uma proposta SEM extras desenha exactamente o que desenhava antes", async () => {
    // A garantia que interessa primeiro: isto não pode acrescentar uma linha,
    // uma palavra ou um espaço a nenhuma das propostas que já existem.
    const semMarcas = { ...comExtras(), budgetOpcional: undefined };
    const semCampo = { ...comExtras(), budgetOpcional: [false, false, false] };
    expect(await desenho(semCampo)).toBe(await desenho(semMarcas));
  });

  it("com extras assinalados o desenho MUDA — é o que a proposta vem dizer", async () => {
    const semMarcas = { ...comExtras(), budgetOpcional: undefined };
    expect(await desenho(comExtras())).not.toBe(await desenho(semMarcas));
  });

  it("um extra SEM preço não desenha um segundo total", async () => {
    // Sem preço a subtracção não desce, e os dois números sairiam iguais com
    // rótulos diferentes — pior do que não haver segundo número nenhum.
    const semPreco = {
      ...comExtras(),
      budgetAmounts: [4000, 3000, null],
      budgetOpcional: [false, false, true],
    };
    const so = { ...semPreco, budgetOpcional: undefined };
    // O desenho difere só pela palavra "extra" ao lado da linha; o bloco do
    // segundo total não entra. Verifica-se pelo comprimento: um bloco a mais
    // são duas linhas de texto, não meia dúzia de caracteres.
    const [a, b] = [await desenho(semPreco), await desenho(so)];
    expect(a).not.toBe(b);
    expect(Math.abs(a.length - b.length)).toBeLessThan(400);
  });
});

describe("as notas internas nunca saem no PDF", () => {
  /**
   * "Cliente da AMARA, cuidado com o prazo" é uma frase que se escreve para si
   * própria. Chegar ao cliente não é um bug com um erro visível — é uma frase
   * sobre ele, escrita por quem lhe está a vender, dentro do documento que ele
   * abriu com expectativa.
   *
   * Mesma técnica do teste dos custos, e pela mesma razão: compara-se o que
   * fica DESENHADO, porque procurar as palavras no ficheiro não serve (o texto
   * vai como códigos de glifo hexadecimais).
   */
  it("um documento com notas desenha exactamente o mesmo que um sem notas", async () => {
    const semNotas = decoracaoDoc();
    const comNotas = {
      ...semNotas,
      notasInternas: "Cliente da AMARA, cuidado com o prazo. Recusaram em 2025 por preço.",
      notasPorSeccao: {
        orcamento: "Margem apertada, não descer mais.",
        servicos: "Ela quer eucalipto e mais nada.",
      },
    };

    const fluxos = async (doc: Parameters<typeof renderProposalDocPdf>[0]) => {
      const pdf = await PDFDocument.load(await renderProposalDocPdf(doc));
      let texto = "";
      for (let i = 0; i < pdf.getPageCount(); i += 1) texto += pageContent(pdf, i);
      return texto;
    };

    expect(await fluxos(comNotas)).toBe(await fluxos(semNotas));
  });
});
