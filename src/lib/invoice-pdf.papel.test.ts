import { describe, it, expect } from "vitest";
import {
  PDFDocument,
  PDFArray,
  PDFRawStream,
  StandardFonts,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
import { renderInvoicePdf, type InvoiceData } from "./invoice-pdf";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SAI IMPRESSO NA FACTURA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro não conta desenhos: LÊ O TEXTO da folha e as coordenadas em que
 * ele foi posto — o molde está feito no `proposal-doc-pdf.dinheiro.test.ts`, do
 * outro lado da casa. Os dois defeitos que aqui se prendem viviam exactamente
 * no ponto cego dos testes de fumo que já existiam («devolve bytes que começam
 * por %PDF»): as contas certas por dentro e o número errado na folha, e o texto
 * desenhado em coordenadas que a folha não tem.
 *
 * As fontes são as PADRÃO do pdf-lib (Helvetica), por isso os `Tj` trazem os
 * bytes na codificação WinAnsi e desfazer isso é uma tabela, não um `ToUnicode`.
 */

// CP1252 no bloco 0x80–0x9F — os únicos bytes do WinAnsi que não são Latin-1.
const CP1252_ALTO: Record<number, string> = {
  0x80: "€",
  0x82: "‚",
  0x83: "ƒ",
  0x84: "„",
  0x85: "…",
  0x86: "†",
  0x87: "‡",
  0x88: "ˆ",
  0x89: "‰",
  0x8a: "Š",
  0x8b: "‹",
  0x8c: "Œ",
  0x8e: "Ž",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
  0x98: "˜",
  0x99: "™",
  0x9a: "š",
  0x9b: "›",
  0x9c: "œ",
  0x9e: "ž",
  0x9f: "Ÿ",
};

interface Desenhada {
  x: number;
  y: number;
  texto: string;
}

/** Cada pedaço de texto desenhado, com o canto onde foi posto. */
async function desenhadas(bytes: Uint8Array | Buffer): Promise<Desenhada[]> {
  const pdf = await PDFDocument.load(bytes);
  const saida: Desenhada[] = [];
  for (let i = 0; i < pdf.getPageCount(); i += 1) {
    const pagina = pdf.getPage(i);
    const ctx = pagina.node.context;
    const contents = pagina.node.Contents();
    const partes: (PDFObject | undefined)[] =
      contents instanceof PDFArray ? contents.asArray() : [contents];
    let ops = "";
    for (const parte of partes) {
      const stream = ctx.lookup(parte);
      if (stream instanceof PDFRawStream) {
        ops += Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
      }
    }
    const re = /1 0 0 1 ([\d.-]+) ([\d.-]+) Tm[\s\S]*?<([0-9A-Fa-f]*)>\s*Tj/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(ops))) {
      let texto = "";
      for (let k = 0; k + 2 <= m[3].length; k += 2) {
        const b = parseInt(m[3].slice(k, k + 2), 16);
        texto += b >= 0x80 && b <= 0x9f ? (CP1252_ALTO[b] ?? "?") : String.fromCharCode(b);
      }
      saida.push({ x: Number(m[1]), y: Number(m[2]), texto });
    }
  }
  return saida;
}

const soTexto = (ds: Desenhada[]) => ds.map((d) => d.texto);

/** "1000,01 €" / "12 345,67 €" → 1000.01 / 12345.67. */
function euros(s: string): number {
  return Number(s.replace(/[^\d,-]/g, "").replace(",", "."));
}

/** O valor impresso logo a seguir a um rótulo do bloco de totais. */
function valorApos(ds: Desenhada[], rotulo: string): number {
  const i = soTexto(ds).indexOf(rotulo);
  expect(i, `«${rotulo}» não está impresso na folha`).toBeGreaterThanOrEqual(0);
  return euros(ds[i + 1].texto);
}

function fatura(over: Partial<InvoiceData> = {}): InvoiceData {
  return {
    number: "FT 2026/0007",
    date: "2026-07-18",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    description: "",
    amount: 3690,
    vatRate: 0.23,
    kindLabel: "Sinal",
    paid: false,
    ...over,
  };
}

const A4 = { w: 595.28, h: 841.89 };
const MARGIN = 56;

/**
 * ── DEFEITO 1: AS TRÊS PARCELAS NÃO FECHAVAM ──────────────────────────────
 *
 * `base = amount / (1 + vatRate)` e `vat = amount - base`, ambos em vírgula
 * flutuante e sem arredondar, com o `eur()` a arredondar só ao desenhar.
 * Enquanto o valor vem em cêntimos exactos, ninguém dá por nada. Assim que traz
 * uma terceira casa — e traz, porque o `parseMoney` do painel aceita "1000,005"
 * e a rota grava `Number(body.amount)` tal e qual —, a factura passa a dizer:
 *
 *     Base de incidência      813,01 €
 *     IVA (23%)               186,99 €
 *     TOTAL                 1000,01 €      ← e 813,01 + 186,99 = 1000,00
 *
 * Um cêntimo a menos entregue ao Estado, e uma factura cujas parcelas não somam
 * o total. Não é um defeito de ecrã: é o documento que o cliente arquiva.
 */
describe("as três parcelas da factura fecham o total impresso", () => {
  it("BUG-GUARD: 1000,005 € a 23% — a base, o IVA e o total dão exactamente", async () => {
    const ds = await desenhadas(await renderInvoicePdf(fatura({ amount: 1000.005 })));

    const base = valorApos(ds, "Base de incidência");
    const iva = valorApos(ds, "IVA (23%)");
    const total = valorApos(ds, "TOTAL");

    expect(total).toBe(1000.01);
    expect(base).toBe(813.02);
    expect(iva).toBe(186.99);
    expect(base + iva).toBeCloseTo(total, 10);
    // O par antigo, o que não fechava, não pode voltar.
    expect(soTexto(ds)).not.toContain("813,01 €");
  });

  it("fecham para qualquer valor e qualquer taxa", async () => {
    const casos: [number, number][] = [
      [3690, 0.23],
      [1000.005, 0.23],
      [1000.021, 0.23],
      [907.74, 0.23],
      [2118.06, 0.23],
      [1234.567, 0.06],
      [55.555, 0.13],
      [0.01, 0.23],
      [123456.78, 0.23],
    ];
    for (const [amount, vatRate] of casos) {
      const ds = await desenhadas(await renderInvoicePdf(fatura({ amount, vatRate })));
      const base = valorApos(ds, "Base de incidência");
      const iva = valorApos(ds, `IVA (${Math.round(vatRate * 100)}%)`);
      const total = valorApos(ds, "TOTAL");
      expect(base + iva, `${amount} € a ${vatRate * 100}% não fecha`).toBeCloseTo(total, 10);
    }
  });

  it("o valor da linha do documento é o mesmo do TOTAL", async () => {
    // Dois números para a mesma coisa na mesma folha: se divergirem, ninguém
    // sabe qual é o que se paga.
    const ds = await desenhadas(await renderInvoicePdf(fatura({ amount: 1000.005 })));
    const daLinha = ds.find((d) => d.x > 400 && d.texto.includes("€"));
    expect(daLinha && euros(daLinha.texto)).toBe(valorApos(ds, "TOTAL"));
  });
});

/**
 * ── DEFEITO 2: O TEXTO QUE SAÍA DA FOLHA ──────────────────────────────────
 *
 * A descrição era desenhada com um `drawText` só, sem quebra. A rota aceita
 * 2000 caracteres nesse campo — 2000 caracteres a 10 pontos medem uns 11 000
 * pontos numa folha que tem 595 de largura. A frase atravessava a coluna do
 * VALOR e continuava para fora do papel.
 *
 * Hoje nenhum ecrã envia descrição (o PDF cai sempre no texto por omissão), por
 * isso isto é uma armadilha e não um estrago em curso — mas a mesma chamada
 * imprime o NOME do cliente, que vem do pedido, onde o campo aceita 120
 * caracteres. Um nome de casal por extenso passa dos 80 e já saía pela direita.
 */
describe("nada do que se imprime sai da folha", () => {
  const dentroDaFolha = (
    ds: Desenhada[],
    font: { widthOfTextAtSize(s: string, n: number): number },
    size: number,
  ) => {
    for (const d of ds) {
      if (d.x !== MARGIN) continue;
      expect(
        d.x + font.widthOfTextAtSize(d.texto, size),
        `«${d.texto.slice(0, 40)}…» sai da folha`,
      ).toBeLessThanOrEqual(A4.w - MARGIN + 0.5);
    }
  };

  it("uma descrição longa quebra em linhas, e nenhuma toca a coluna do valor", async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const longa =
      "Serviço integral de conceção, produção e montagem da decoração do casamento, " +
      "incluindo arranjos florais da cerimónia e do copo de água, iluminação decorativa " +
      "do jardim e da sala, mobiliário de apoio, transporte, montagem na véspera e " +
      "desmontagem no dia seguinte, com equipa em permanência durante todo o evento.";

    const ds = await desenhadas(await renderInvoicePdf(fatura({ description: longa })));
    const daDescricao = ds.filter((d) => d.x === MARGIN && d.y > 400 && d.y < 640);
    expect(daDescricao.length).toBeGreaterThan(1); // quebrou mesmo

    // A goteira do valor: nada da descrição pode entrar nos 100 pontos da direita.
    for (const d of daDescricao) {
      expect(
        d.x + font.widthOfTextAtSize(d.texto, 10),
        `«${d.texto.slice(0, 40)}…» entra na coluna do valor`,
      ).toBeLessThanOrEqual(A4.w - MARGIN - 100 + 0.5);
    }
    // E a frase chegou inteira ao papel.
    expect(daDescricao.map((d) => d.texto).join(" ")).toContain("desmontagem no dia seguinte");
    // Com o bloco de totais ainda no sítio, e acima do rodapé.
    expect(valorApos(ds, "TOTAL")).toBe(3690);
    for (const d of ds) expect(d.y).toBeGreaterThanOrEqual(MARGIN - 16);
  });

  it("um nome de casal por extenso quebra em vez de fugir pela direita", async () => {
    const doc = await PDFDocument.create();
    const bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const nome =
      "Maria Madalena Ribeiro da Silva Pereira e João Pedro Antunes de Vasconcelos Meireles Costa";

    const ds = await desenhadas(await renderInvoicePdf(fatura({ clientName: nome })));
    const doNome = ds.filter(
      (d) => d.x === MARGIN && nome.includes(d.texto.split(" ")[0]) && d.y > 640,
    );
    expect(doNome.length).toBeGreaterThan(1);
    dentroDaFolha(doNome, bold, 11);
    // Nenhum apelido se perdeu no caminho.
    expect(doNome.map((d) => d.texto).join(" ")).toBe(nome);
  });

  it("os 2000 caracteres que a rota deixa passar cabem TODOS, sem cortar nada", async () => {
    const ds = await desenhadas(
      await renderInvoicePdf(fatura({ description: "decoração ".repeat(200) })),
    );
    expect(soTexto(ds).join("\n")).not.toContain("[…]");
    expect(valorApos(ds, "TOTAL")).toBe(3690);
    expect(soTexto(ds)).toContain("AGUARDA PAGAMENTO");
    for (const d of ds) expect(d.y).toBeGreaterThanOrEqual(MARGIN - 16);
  });

  it("para lá do que a folha aguenta, corta À VISTA — e o TOTAL fica impresso", async () => {
    // Cortar em silêncio seria trocar um defeito por outro. O que não pode
    // acontecer, aconteça o que acontecer ao texto, é o total desaparecer.
    const ds = await desenhadas(
      await renderInvoicePdf(fatura({ description: "decoração ".repeat(900) })),
    );
    expect(soTexto(ds).join("\n")).toContain("[…]");
    expect(valorApos(ds, "TOTAL")).toBe(3690);
    expect(soTexto(ds)).toContain("AGUARDA PAGAMENTO");
    // Nada desenhado abaixo da linha do rodapé, nem por engano em y negativo.
    for (const d of ds) expect(d.y).toBeGreaterThanOrEqual(MARGIN - 16);
  });
});
