import { describe, it, expect } from "vitest";
import {
  PDFDocument,
  PDFName,
  PDFDict,
  PDFArray,
  PDFRawStream,
  decodePDFRawStream,
  type PDFObject,
} from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS NÚMEROS QUE O CASAL LÊ NO PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro não olha para o desenho: LÊ O TEXTO que sai impresso, palavra a
 * palavra. É a única forma de apanhar o que aqui se apanha — um documento em
 * que as contas estão todas certas por dentro e o número escrito na folha está
 * errado. Os outros testes do gerador comparam desenhos (com custos vs sem
 * custos, com notas vs sem notas) e por construção não vêem o CONTEÚDO de uma
 * frase; estes três defeitos viviam exactamente nesse ponto cego.
 *
 * O texto sai em códigos de glifo porque as fontes são subconjuntos embutidos
 * (Carlito, via fontkit). `textoDoPdf` desfaz isso pelo caminho oficial: o mapa
 * `ToUnicode` que o pdf-lib escreve para cada fonte, que é o mesmo que qualquer
 * leitor de PDF usa quando se copia texto de um documento.
 */

/** O `ToUnicode` de uma fonte: código de glifo → o que ele desenha. */
function mapaDeUnicode(stream: PDFRawStream): Map<number, string> {
  const src = Buffer.from(decodePDFRawStream(stream).decode()).toString("latin1");
  const mapa = new Map<number, string>();
  for (const bloco of src.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const par of bloco[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      let texto = "";
      for (let i = 0; i + 4 <= par[2].length; i += 4) {
        texto += String.fromCharCode(parseInt(par[2].slice(i, i + 4), 16));
      }
      mapa.set(parseInt(par[1], 16), texto);
    }
  }
  return mapa;
}

/**
 * O texto de uma página, uma linha desenhada por linha de saída.
 *
 * Segue o estado do operador `Tf` (a fonte em vigor) porque cada fonte tem o SEU
 * subconjunto: o código 0x0007 é uma letra na regular e outra na negrito, e um
 * mapa único misturado daria frases falsas.
 */
function textoDaPagina(pdf: PDFDocument, indice: number): string {
  const pagina = pdf.getPage(indice);
  const ctx = pagina.node.context;

  const fontes = new Map<string, Map<number, string>>();
  const dicionario = pagina.node.Resources()?.lookup(PDFName.of("Font"), PDFDict);
  if (dicionario) {
    for (const [nome, valor] of dicionario.entries()) {
      const fonte = ctx.lookup(valor, PDFDict);
      const toUnicode = fonte?.lookup(PDFName.of("ToUnicode"));
      if (toUnicode instanceof PDFRawStream) fontes.set(nome.asString(), mapaDeUnicode(toUnicode));
    }
  }

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

  let saida = "";
  let emVigor: Map<number, string> | undefined;
  const re = /(\/[^\s/]+)\s+[\d.]+\s+Tf|<([0-9A-Fa-f]*)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) {
    if (m[1]) {
      emVigor = fontes.get(m[1]);
      continue;
    }
    const hex = m[2] ?? "";
    for (let k = 0; k + 4 <= hex.length; k += 4) {
      saida += emVigor?.get(parseInt(hex.slice(k, k + 4), 16)) ?? "?";
    }
    saida += "\n";
  }
  return saida;
}

/** Todo o texto impresso no documento. */
async function textoDoPdf(doc: ProposalDoc): Promise<string> {
  const pdf = await PDFDocument.load(await renderProposalDocPdf(doc));
  let texto = "";
  for (let i = 0; i < pdf.getPageCount(); i += 1) texto += textoDaPagina(pdf, i);
  return texto;
}

/** Uma proposta de decoração real, reduzida ao que faz contas. */
function proposta(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "Decoração Casamento Rita & Tomás · 20 de maio de 2028",
    clientNames: "Rita & Tomás",
    eventType: "Casamento",
    eventDate: "20 de maio de 2028",
    location: "Herdade da Maridona",
    guests: "80 pax",
    coverImages: ["", ""],
    serviceGroups: [],
    moodBoards: [],
    budgetItems: ["Decoração floral", "Iluminação"],
    budgetAmounts: [8000, 2000],
    totalLabel: "Valor Total Decoração",
    totalText: "10.000,00 € + IVA",
    totalAmount: 10000,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/**
 * ── DEFEITO 1 ──────────────────────────────────────────────────────────────
 * A caixa «Sinal (%)» do estúdio é lida pelas rotas que EMITEM as facturas
 * (`depositPercentOf`), mas o PDF escrevia «Sinal 30%» à letra. Ela põe 50%, o
 * PDF diz «Sinal 30% 3.000,00 €» num total de 10.000 €, o casal aceita, e a
 * factura do sinal sai a 5.000 €. O documento e a factura discordam — e quem
 * tem de explicar a diferença é ela.
 */
describe("o sinal impresso é o da proposta, não trinta por cento fixos", () => {
  it("uma proposta de 50% imprime «Sinal 50%» e metade do total", async () => {
    const texto = await textoDoPdf(
      proposta({ depositPercent: 50, totalVatMode: "incluido", totalText: "10.000,00 €" }),
    );

    expect(texto).toContain("Sinal 50%");
    expect(texto).toContain("Saldo 50%");
    // 50% de 10.000 € é 5.000 €, nos dois lados.
    expect(texto).toMatch(/Sinal 50%\s+5\.?000,00/);
    expect(texto).toMatch(/Saldo 50%\s+5\.?000,00/);
    // E em lado nenhum pode sobrar a percentagem da casa.
    expect(texto).not.toContain("Sinal 30%");
    expect(texto).not.toContain("3000,00");
  });

  it("o texto do faseamento acompanha a percentagem escolhida", async () => {
    // «30% na adjudicação; 70% 1 mês antes» é texto FIXO por omissão. Numa
    // proposta de 50% o documento passava a dizer duas coisas diferentes na
    // mesma folha: 50% no quadro dos valores e 30% nas condições.
    const texto = await textoDoPdf(proposta({ depositPercent: 50 }));
    expect(texto).toContain("50% na adjudicação;");
    expect(texto).toContain("50% 1 mês antes;");
    expect(texto).not.toContain("30% na adjudicação;");
  });

  it("sem percentagem escrita continua a ser a da casa", async () => {
    const texto = await textoDoPdf(proposta());
    expect(texto).toContain("Sinal 30%");
    expect(texto).toContain("Saldo 70%");
    expect(texto).toContain("30% na adjudicação;");
  });
});

/**
 * ── DEFEITO 4 ──────────────────────────────────────────────────────────────
 * «Sem os extras assinalados» subtraía os preços das LINHAS (sempre líquidos)
 * ao `totalAmount`, que em «IVA incluído» é o BRUTO. Numa proposta de base
 * 10.000 € (total 12.300 €) com uma linha «Iluminação» de 2.000 € marcada como
 * extra, saía 10.300 € em vez de 9.840 €: 460 € oferecidos ao casal, e é por
 * esse número que ele vai pedir o desconto.
 */
describe("«sem os extras» está na mesma unidade do total grande", () => {
  const comExtra = (over: Partial<ProposalDoc> = {}) =>
    proposta({ budgetOpcional: [false, true], ...over });

  it("em «IVA incluído» o segundo número também é com IVA", async () => {
    const texto = await textoDoPdf(
      comExtra({ totalVatMode: "incluido", totalAmount: 12300, totalText: "12.300,00 €" }),
    );

    // Base 10.000 − 2.000 do extra = 8.000; com IVA, 9.840 €.
    expect(texto).toContain("Sem os extras assinalados");
    expect(texto).toMatch(/9\.?840,00/);
    // O erro era subtrair um valor líquido a um valor bruto.
    expect(texto).not.toMatch(/10[.\u00A0 ]300,00/);
  });

  it("em «acrescer» continua a ser o número líquido de sempre", async () => {
    const texto = await textoDoPdf(comExtra());
    // 10.000 − 2.000 = 8.000, e o rótulo mantém o «+ IVA» do total.
    expect(texto).toMatch(/8\.?000,00\s€ \+ IVA/);
  });

  it("os valores desenhados usam o mesmo separador de milhares do total", async () => {
    // «10 300,00 €» ao lado de «12.300,00 €» na mesma folha é o género de
    // pormenor que faz um casal olhar duas vezes para um documento de dinheiro.
    const texto = await textoDoPdf(
      comExtra({
        totalVatMode: "incluido",
        totalAmount: 30750,
        totalText: "30.750,00 €",
        budgetAmounts: [23000, 2000],
      }),
    );
    expect(texto).not.toMatch(/\d\u00A0\d/);
    expect(texto).toContain("30.750,00 €");
  });
});
