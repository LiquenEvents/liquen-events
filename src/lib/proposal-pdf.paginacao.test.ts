import { describe, it, expect } from "vitest";
import { PDFDocument, PDFArray, PDFRawStream, decodePDFRawStream, type PDFObject } from "pdf-lib";
import type { Proposal } from "@/lib/orcamento/types";
import { renderProposalPdf } from "./proposal-pdf";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PROPOSTA QUE NÃO CABIA NA FOLHA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro lê o TEXTO impresso e as coordenadas em que foi posto — o molde
 * está no `proposal-doc-pdf.dinheiro.test.ts`. Os testes que já existiam
 * contavam bytes («começa por %PDF») e por construção não podiam ver o defeito
 * que aqui se prende: o documento continuava a ser um PDF válido de uma página,
 * com metade do orçamento desenhado em coordenadas que nenhum leitor mostra.
 *
 * As fontes são as PADRÃO do pdf-lib (Helvetica): os `Tj` trazem os bytes na
 * codificação WinAnsi, e desfazer isso é uma tabela, não um `ToUnicode`.
 */

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
  pagina: number;
  x: number;
  y: number;
  texto: string;
}

async function desenhadas(bytes: Uint8Array): Promise<{ paginas: number; itens: Desenhada[] }> {
  const pdf = await PDFDocument.load(bytes);
  const itens: Desenhada[] = [];
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
      itens.push({ pagina: i, x: Number(m[1]), y: Number(m[2]), texto });
    }
  }
  return { paginas: pdf.getPageCount(), itens };
}

const euros = (s: string) => Number(s.replace(/[^\d,-]/g, "").replace(",", "."));

/** Uma proposta de decoração com `n` rubricas — o caso normal de um casamento. */
function proposta(n: number, over: Partial<Proposal> = {}): Proposal {
  const lineItems = Array.from({ length: n }, (_, i) => ({
    description: `Rubrica de decoração número ${i + 1}`,
    qty: 1,
    unitPrice: 100,
  }));
  const subtotal = n * 100;
  return {
    id: "p-1",
    quoteId: "q-1",
    clientName: "Rita & Tomás",
    clientEmail: "rita@example.com",
    currency: "EUR",
    lineItems,
    vatRate: 0.23,
    subtotal,
    vat: subtotal * 0.23,
    total: subtotal * 1.23,
    validUntil: "2026-09-01",
    notes: "Obrigado pela confiança.",
    status: "enviada",
    createdAt: "2026-07-02T10:00:00.000Z",
    ...over,
  };
}

/**
 * ── O DEFEITO ─────────────────────────────────────────────────────────────
 *
 * O documento desenhava-se numa página fixa e nunca perguntava se ainda havia
 * folha: o `y` descia para lá do rodapé e depois para lá do zero, e o pdf-lib
 * desenha na mesma. Com 26 rubricas o «TOTAL» já saía em cima do rodapé; com 40
 * (o esquema aceita até 200) saía a y = −162 — o casal recebia uma proposta com
 * dez rubricas em falta, sem subtotal, sem IVA, sem total, sem validade e sem
 * notas, e nada assinalava a perda.
 */
describe("a tabela do orçamento muda de página em vez de sair da folha", () => {
  it("BUG-GUARD: com 40 rubricas, o TOTAL continua a estar impresso na folha", async () => {
    const { paginas, itens } = await desenhadas(await renderProposalPdf(proposta(40)));

    expect(paginas).toBeGreaterThan(1);

    // O último «TOTAL» é o do bloco de totais; os anteriores são o cabeçalho da
    // coluna, repetido em cada folha.
    const textos = itens.map((d) => d.texto);
    const i = textos.lastIndexOf("TOTAL");
    expect(i, "o «TOTAL» do orçamento não está impresso em lado nenhum").toBeGreaterThanOrEqual(0);
    expect(euros(itens[i + 1].texto)).toBe(4920);

    // O IVA e o subtotal também, e na ordem em que se lêem.
    expect(textos.indexOf("Subtotal")).toBeLessThan(textos.indexOf("IVA (23%)"));
    expect(textos.indexOf("IVA (23%)")).toBeLessThan(i);

    // E a validade e as notas, que iam atrás do total.
    expect(textos).toContain("Proposta válida até 01/09/2026.");
    expect(textos).toContain("NOTAS");
  });

  it("nenhuma rubrica se perde pelo caminho", async () => {
    const { itens } = await desenhadas(await renderProposalPdf(proposta(40)));
    const textos = itens.map((d) => d.texto);
    for (let n = 1; n <= 40; n += 1) {
      expect(textos, `a rubrica ${n} não está impressa`).toContain(
        `Rubrica de decoração número ${n}`,
      );
    }
  });

  it("nada é desenhado por baixo do rodapé, nem em coordenadas negativas", async () => {
    const { itens } = await desenhadas(await renderProposalPdf(proposta(40)));
    for (const d of itens) {
      expect(d.y, `«${d.texto.slice(0, 40)}» está fora da folha`).toBeGreaterThanOrEqual(44);
      expect(d.y).toBeLessThanOrEqual(841.89);
    }
  });

  it("cada página fecha com o rodapé, e a de continuação repete os cabeçalhos", async () => {
    const { paginas, itens } = await desenhadas(await renderProposalPdf(proposta(40)));
    for (let p = 0; p < paginas; p += 1) {
      const daPagina = itens.filter((d) => d.pagina === p).map((d) => d.texto);
      expect(
        daPagina.some((t) => t.includes("Portugal")),
        `página ${p + 1} sem rodapé`,
      ).toBe(true);
    }
    // A tabela continua na segunda folha: as colunas voltam a ter nome.
    const segunda = itens.filter((d) => d.pagina === 1).map((d) => d.texto);
    expect(segunda).toContain("DESCRIÇÃO");
    expect(segunda).toContain("UNIT.");
    expect(segunda).toContain("Ref. p-1");
  });

  it("uma proposta curta continua a caber numa página só", async () => {
    // O salto de página não pode passar a acontecer onde nunca fez falta.
    const { paginas, itens } = await desenhadas(await renderProposalPdf(proposta(4)));
    expect(paginas).toBe(1);
    const textos = itens.map((d) => d.texto);
    expect(euros(itens[textos.lastIndexOf("TOTAL") + 1].texto)).toBe(492);
  });
});

/**
 * ── A DATA DE EMISSÃO ─────────────────────────────────────────────────────
 *
 * `toLocaleDateString("pt-PT")` sem fuso usa o da máquina que gera o PDF — UTC,
 * no alojamento. Uma proposta criada às 23:30 de 2 de julho saía datada de
 * 02/07 quando em Lisboa já era dia 3. É dessa data que se contam os dias de
 * validade que o documento promete umas linhas abaixo.
 */
describe("a data da proposta é o dia de Portugal", () => {
  it("às 23:30 de UTC no Verão, a folha já diz o dia seguinte", async () => {
    const { itens } = await desenhadas(
      await renderProposalPdf(proposta(2, { createdAt: "2026-07-02T23:30:00.000Z" })),
    );
    const textos = itens.map((d) => d.texto);
    expect(textos).toContain("03/07/2026");
    expect(textos).not.toContain("02/07/2026");
  });

  it("no Inverno, em que Lisboa é UTC, o dia fica onde estava", async () => {
    const { itens } = await desenhadas(
      await renderProposalPdf(proposta(2, { createdAt: "2026-01-15T23:30:00.000Z" })),
    );
    expect(itens.map((d) => d.texto)).toContain("15/01/2026");
  });
});
