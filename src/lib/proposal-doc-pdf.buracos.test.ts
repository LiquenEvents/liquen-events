import { describe, it, expect, vi } from "vitest";
import sharp from "sharp";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults } from "./proposal-doc";
import { alturaDaLegenda, caixasDoMoodboard } from "./proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTO QUE NÃO ABRE NÃO DEIXA UM BURACO NA PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «No PDF, o layout compacta as fotos existentes e IGNORA por
 * completo as caixas vazias.»
 *
 * O que acontecia: a composição era feita para TODAS as fotos escolhidas. Uma
 * cujos bytes não abrissem entrava com o aspecto por omissão, recebia uma caixa
 * como as outras, e o desenho falhava lá dentro. A moldura já não era desenhada
 * — o buraco do tamanho de uma fotografia, a meio da fila, ficava. Numa página
 * de inspiração isso não se lê como uma avaria: lê-se como descuido.
 *
 * A regra passou a ser outra: quem não se consegue MEDIR não entra na
 * composição. As que ficam ocupam a página inteira, como se a outra nunca
 * tivesse sido escolhida — e a que ficou de fora é contada, para o estúdio
 * avisar antes de a proposta seguir.
 *
 * A prova é a mais dura que há: as caixas desenhadas têm de ser, ao ponto, as
 * que a geometria dá para as fotos que sobraram.
 */

vi.setConfig({ testTimeout: 30_000 });

/** Uma fotografia a sério, com a forma pedida. */
async function foto(largura: number, altura: number): Promise<string> {
  const bytes = await sharp({
    create: {
      width: largura,
      height: altura,
      channels: 3,
      background: { r: 120, g: 140, b: 120 },
    },
  })
    .jpeg()
    .toBuffer();
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

/** Bytes que parecem uma foto e não abrem — o caso que fazia o buraco. */
const ESTRAGADA = `data:image/jpeg;base64,${Buffer.from("isto não é um jpeg").toString("base64")}`;

/** Regista as caixas onde o desenho pousou uma imagem, por página. */
function espiarImagens() {
  const paginas: PDFPage[] = [];
  const pousadas: { pagina: number; x: number; y: number; w: number; h: number }[] = [];
  /** Em que página caiu cada texto — é assim que se encontra o mood board. */
  const escritas: { pagina: number; texto: string }[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawImageOriginal = PDFPage.prototype.drawImage;
  const drawTextOriginal = PDFPage.prototype.drawText;

  PDFDocument.prototype.addPage = function (...args: Parameters<typeof addPageOriginal>) {
    const p = addPageOriginal.apply(this, args) as PDFPage;
    paginas.push(p);
    return p;
  };
  PDFPage.prototype.drawImage = function (
    imagem: Parameters<typeof drawImageOriginal>[0],
    opts?: Parameters<typeof drawImageOriginal>[1],
  ) {
    pousadas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      w: (opts?.width as number) ?? 0,
      h: (opts?.height as number) ?? 0,
    });
    return drawImageOriginal.call(this, imagem, opts);
  };
  PDFPage.prototype.drawText = function (
    texto: string,
    opts?: Parameters<typeof drawTextOriginal>[1],
  ) {
    escritas.push({ pagina: paginas.indexOf(this), texto: String(texto) });
    return drawTextOriginal.call(this, texto, opts);
  };
  return {
    pousadas,
    escritas,
    restaurar() {
      PDFDocument.prototype.addPage = addPageOriginal;
      PDFPage.prototype.drawImage = drawImageOriginal;
      PDFPage.prototype.drawText = drawTextOriginal;
    },
  };
}

const documento = (imagens: string[]) =>
  withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Herdade da Cortesia",
    guests: "120 pax",
    serviceGroups: [],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "3000,00 € + IVA",
    // A capa fica vazia de propósito: assim as ÚNICAS imagens pousadas no
    // documento são as do mood board (o logótipo é desenhado à parte, com
    // `drawImage` também — por isso a página é a que interessa, ver abaixo).
    coverImages: [],
    moodBoards: [{ title: "Cerimónia", layout: "filas", images: imagens }],
  });

/**
 * As fotografias do mood board: as imagens pousadas NA PÁGINA DO BOARD (a que
 * traz o título), tirando o logótipo do cabeçalho, que é estreito.
 */
function fotosDoBoard(espia: ReturnType<typeof espiarImagens>) {
  const pagina = espia.escritas.find((e) => e.texto === "Cerimónia")?.pagina;
  expect(pagina, "o PDF não desenhou a página do mood board").toBeTypeOf("number");
  return espia.pousadas.filter((c) => c.pagina === pagina && c.w > 100);
}

describe("as caixas vazias não chegam ao PDF", () => {
  it("uma foto que não abre sai da composição, e as outras ocupam a página toda", async () => {
    const boas = await Promise.all([foto(300, 200), foto(300, 200), foto(300, 200)]);
    const espia = espiarImagens();
    let relatorio;
    try {
      // A estragada vai ao MEIO: é a posição em que o buraco se vê melhor.
      relatorio = await renderProposalDocPdfWithReport(
        documento([boas[0], ESTRAGADA, boas[1], boas[2]]),
      );
    } finally {
      espia.restaurar();
    }

    const desenhadas = fotosDoBoard(espia);

    // Três fotos, três caixas — e a que não abriu foi contada, não esquecida.
    expect(desenhadas).toHaveLength(3);
    expect(relatorio!.undrawnImages).toBe(1);

    // E as caixas são EXACTAMENTE as de uma página de três fotos: a composição
    // não guardou lugar nenhum para a que ficou de fora.
    const esperadas = caixasDoMoodboard("filas", [1.5, 1.5, 1.5], alturaDaLegenda(0), false);
    expect(desenhadas).toHaveLength(esperadas.length);
    desenhadas.forEach((c, i) => {
      expect(c.x).toBeCloseTo(esperadas[i].x, 3);
      expect(c.y).toBeCloseTo(esperadas[i].y, 3);
      expect(c.w).toBeCloseTo(esperadas[i].w, 3);
      expect(c.h).toBeCloseTo(esperadas[i].h, 3);
    });
  });

  /** Sem nada estragado, nada muda — o caso normal continua a ser o normal. */
  it("com todas as fotos boas, a página é a de sempre", async () => {
    const boas = await Promise.all([foto(300, 200), foto(300, 200), foto(300, 200)]);
    const espia = espiarImagens();
    let relatorio;
    try {
      relatorio = await renderProposalDocPdfWithReport(documento(boas));
    } finally {
      espia.restaurar();
    }
    expect(fotosDoBoard(espia)).toHaveLength(3);
    expect(relatorio!.undrawnImages).toBe(0);
  });
});
