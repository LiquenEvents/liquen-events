import { describe, it, expect } from "vitest";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";
import { renderContractPdf } from "./contract-pdf";
import { termsToPlainText } from "./contract-terms";
import type { Contract } from "./contract-types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DATA QUE FICA ESCRITA NO CONTRATO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro não olha para o desenho: LÊ O TEXTO impresso na folha, como o
 * `proposal-doc-pdf.dinheiro.test.ts` faz do outro lado da casa. É a única
 * forma de apanhar o defeito que aqui se prende — um contrato em que tudo está
 * certo por dentro e a data escrita na folha é a de outro dia.
 *
 * Aqui as fontes são as PADRÃO do pdf-lib (Helvetica), não subconjuntos
 * embebidos: os `Tj` trazem os bytes na codificação WinAnsi, e desfazer isso é
 * uma tabela, não um mapa `ToUnicode`.
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

/** Todo o texto impresso no documento, uma linha desenhada por linha. */
async function textoDoPdf(bytes: Uint8Array | Buffer): Promise<string> {
  const pdf = await PDFDocument.load(bytes);
  let saida = "";
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
      for (let k = 0; k + 2 <= m[1].length; k += 2) {
        const b = parseInt(m[1].slice(k, k + 2), 16);
        saida += b >= 0x80 && b <= 0x9f ? (CP1252_ALTO[b] ?? "?") : String.fromCharCode(b);
      }
      saida += "\n";
    }
  }
  return saida;
}

function contrato(over: Partial<Contract> = {}): Contract {
  return {
    id: "c-1",
    quoteId: "q-1",
    proposalId: "p-1",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    termsVersion: "2026-08",
    termsSnapshot: termsToPlainText(),
    status: "aceite",
    createdAt: "2026-07-01T10:00:00.000Z",
    acceptedAt: "2026-07-02T14:32:00.000Z",
    acceptedName: "Maria Silva",
    acceptedIp: "203.0.113.7",
    ...over,
  };
}

/**
 * ── O DEFEITO ─────────────────────────────────────────────────────────────
 *
 * O `fmtDateTime` chamava `toLocaleString("pt-PT", …)` sem dizer o fuso, e o
 * `Intl` usa então o da MÁQUINA que gerou o PDF — que no alojamento é UTC.
 * Portugal é UTC+1 no Verão, por isso um aceite gravado às 23:32 de 2 de julho
 * saía impresso como «02 de julho de 2026 às 23:32» quando o cliente carregou
 * no botão já a 3 de julho, 00:32.
 *
 * Num contrato, o momento do aceite é a data em que ele passa a vincular. Um
 * dia a menos não é um pormenor de apresentação: é o papel a contar outra
 * história — e é sobre esse papel que se conta o prazo de cancelamento do
 * ponto 4, que fala em dias anteriores ao evento.
 */
describe("as datas do contrato saem no dia de Portugal, não no do servidor", () => {
  it("um aceite depois das 23h de Verão é do DIA SEGUINTE, e é isso que sai impresso", async () => {
    const texto = await textoDoPdf(
      await renderContractPdf(contrato({ acceptedAt: "2026-07-02T23:32:00.000Z" })),
    );
    expect(texto).toContain(
      "Aceite eletronicamente por Maria Silva em 03 de julho de 2026 às 00:32.",
    );
    // O dia de UTC não pode sobrar em lado nenhum da folha.
    expect(texto).not.toContain("02 de julho de 2026 às 23:32");
  });

  it("a data de emissão do cabeçalho segue a mesma regra", async () => {
    const texto = await textoDoPdf(
      await renderContractPdf(
        contrato({
          createdAt: "2026-06-30T23:10:00.000Z",
          acceptedAt: undefined,
          status: "pendente",
        }),
      ),
    );
    expect(texto).toContain("01 de julho de 2026 às 00:10");
    expect(texto).not.toContain("30 de junho de 2026 às 23:10");
  });

  it("no Inverno, em que Lisboa é UTC, a hora fica exactamente onde estava", async () => {
    // Sem esta, a correção podia ser um deslocamento cego de uma hora.
    const texto = await textoDoPdf(
      await renderContractPdf(contrato({ acceptedAt: "2026-01-15T10:00:00.000Z" })),
    );
    expect(texto).toContain("15 de janeiro de 2026 às 10:00");
  });

  it("um aceite ao meio-dia continua a ser o mesmo dia, hora certa", async () => {
    const texto = await textoDoPdf(await renderContractPdf(contrato()));
    // 14:32 UTC = 15:32 em Lisboa, a 2 de julho nos dois fusos.
    expect(texto).toContain("02 de julho de 2026 às 15:32");
  });
});
