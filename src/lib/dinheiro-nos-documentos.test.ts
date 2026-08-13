import { describe, it, expect } from "vitest";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";
import { renderInvoicePdf, type InvoiceData } from "./invoice-pdf";
import { renderProposalPdf } from "./proposal-pdf";
import type { Proposal } from "@/lib/orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS PAPÉIS QUE O CLIENTE LÊ ESCREVEM DINHEIRO TODOS DA MESMA MANEIRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `Intl` de pt-PT só agrupa milhares a partir de CINCO dígitos, e agrupa-os
 * com um espaço inquebrável — nunca com o ponto que toda a gente escreve em
 * Portugal. O resultado, numa factura de 24 600 € a 23%, era isto, TUDO na
 * mesma coluna e à distância de duas linhas:
 *
 *     Base de incidência   20 000,00 €     ← espaço
 *     IVA (23%)             4600,00 €      ← nada
 *     TOTAL                24 600,00 €     ← espaço
 *
 * O documento da proposta já resolvia isto para si próprio (`eurDoc`, hoje
 * `eurDocumento` no `money.ts`); a factura e a proposta antiga ficaram para
 * trás. Este ficheiro não olha para o desenho — LÊ O TEXTO impresso, que é a
 * única forma de apanhar um documento com as contas certas por dentro e a
 * pontuação errada na folha.
 *
 * As fontes são as PADRÃO do pdf-lib (Helvetica), por isso os `Tj` trazem os
 * bytes já em WinAnsi e desfazer isso é uma tabela, não um `ToUnicode`.
 */

/** Os únicos bytes do WinAnsi que não são Latin-1 (bloco 0x80–0x9F do CP1252). */
const CP1252_ALTO: Record<number, string> = {
  0x80: "€",
  0x91: "‘",
  0x92: "’",
  0x93: "“",
  0x94: "”",
  0x95: "•",
  0x96: "–",
  0x97: "—",
};

/** Cada pedaço de texto desenhado, na ordem em que foi posto na folha. */
async function textoImpresso(bytes: Uint8Array): Promise<string[]> {
  const pdf = await PDFDocument.load(bytes);
  const saida: string[] = [];
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
    for (const m of ops.matchAll(/<([0-9A-Fa-f]*)>\s*Tj/g)) {
      let texto = "";
      for (let k = 0; k + 2 <= m[1].length; k += 2) {
        const b = parseInt(m[1].slice(k, k + 2), 16);
        texto += b >= 0x80 && b <= 0x9f ? (CP1252_ALTO[b] ?? "?") : String.fromCharCode(b);
      }
      saida.push(texto);
    }
  }
  return saida;
}

/**
 * O espaço antes do «€» é INQUEBRÁVEL, e escreve-se \u00A0 por extenso: à
 * letra, num ficheiro de texto, é indistinguível de um espaço normal — e uma
 * expectativa com o espaço errado documenta o contrário do que se quer.
 */
const EURO = "\u00A0€";

/** Tudo o que na folha tem um «€» — é aí que a pontuação do dinheiro se vê. */
const valores = (linhas: string[]) => linhas.filter((s) => s.includes("€"));

/**
 * O que um valor em euros TEM de parecer neste papel.
 *
 * Milhares por pontos, dois decimais por vírgula, e o espaço inquebrável antes
 * do símbolo (é o que impede o «€» de cair sozinho para a linha seguinte).
 * Repare-se no `{1,3}` inicial: 999 não leva separador nenhum.
 */
const COMO_SE_ESCREVE = /^-?\d{1,3}(\.\d{3})*,\d{2}\u00A0€$/;

function fatura(over: Partial<InvoiceData> = {}): InvoiceData {
  return {
    number: "FT 2026/0007",
    date: "2026-07-18",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    description: "",
    amount: 24600,
    vatRate: 0.23,
    kindLabel: "Sinal",
    paid: false,
    ...over,
  };
}

function proposta(over: Partial<Proposal> = {}): Proposal {
  return {
    id: "p-1",
    quoteId: "q-1",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    currency: "EUR",
    lineItems: [{ description: "Decoração de cerimónia", qty: 1, unitPrice: 7890 }],
    vatRate: 0.23,
    subtotal: 7890,
    vat: 1814.7,
    total: 9704.7,
    status: "enviada",
    createdAt: "2026-07-01T10:00:00.000Z",
    ...over,
  };
}

describe("PDF da factura", () => {
  /**
   * O CASO QUE ELA VIU: base 20 000, IVA 4 600, total 24 600.
   *
   * O IVA é o único dos três com quatro dígitos, e era o único que saía sem
   * separador — no meio dos outros dois, na mesma coluna.
   */
  it("as três parcelas da mesma coluna escrevem-se com a mesma pontuação", async () => {
    const impresso = await textoImpresso(await renderInvoicePdf(fatura({ amount: 24600 })));
    expect(impresso).toContain(`20.000,00${EURO}`);
    expect(impresso).toContain(`4.600,00${EURO}`);
    expect(impresso).toContain(`24.600,00${EURO}`);
    expect(impresso).not.toContain(`4600,00${EURO}`);
  });

  it("todos os valores da folha seguem a mesma regra, seja qual for a grandeza", async () => {
    for (const amount of [999, 4600, 7890, 24600, 1234567, 1234.56]) {
      const impresso = valores(await textoImpresso(await renderInvoicePdf(fatura({ amount }))));
      expect(impresso.length, `${amount} € não imprimiu valor nenhum`).toBeGreaterThan(0);
      for (const v of impresso) {
        expect(v, `«${v}» não é como se escreve dinheiro em Portugal`).toMatch(COMO_SE_ESCREVE);
      }
    }
  });

  /** Três dígitos NÃO levam separador — a regra não é «mete lá um ponto». */
  it("999 € fica sem separador nenhum", async () => {
    const impresso = await textoImpresso(await renderInvoicePdf(fatura({ amount: 999 })));
    expect(impresso).toContain(`999,00${EURO}`);
    expect(impresso.join(" ")).not.toContain(".999");
  });
});

describe("PDF da proposta (o antigo, de uma folha)", () => {
  it("escreve o dinheiro como a factura e como o documento novo", async () => {
    const impresso = valores(
      await textoImpresso(
        await renderProposalPdf(
          proposta({
            lineItems: [{ description: "Decoração", qty: 1, unitPrice: 4600 }],
            subtotal: 4600,
            vat: 1058,
            total: 5658,
          }),
        ),
      ),
    );
    expect(impresso.length).toBeGreaterThan(0);
    for (const v of impresso) {
      expect(v, `«${v}» não é como se escreve dinheiro em Portugal`).toMatch(COMO_SE_ESCREVE);
    }
    expect(impresso).toContain(`4.600,00${EURO}`);
    expect(impresso).toContain(`5.658,00${EURO}`);
  });

  it("1 234 567 € leva os dois pontos e 999 € não leva nenhum", async () => {
    const impresso = await textoImpresso(
      await renderProposalPdf(
        proposta({
          lineItems: [
            { description: "Produção", qty: 1, unitPrice: 1234567 },
            { description: "Extra", qty: 1, unitPrice: 999 },
          ],
          subtotal: 1235566,
          vat: 284180.18,
          total: 1519746.18,
        }),
      ),
    );
    expect(impresso).toContain(`1.234.567,00${EURO}`);
    expect(impresso).toContain(`999,00${EURO}`);
    expect(impresso).toContain(`1.519.746,18${EURO}`);
  });
});
