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
import { resolveValidUntil, withProposalDefaults, type ProposalDoc } from "./proposal-doc";

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
    /**
     * Ponto nos milhares e vírgula nos cêntimos, em todos os números da folha.
     *
     * Isto era `toContain("30.750,00 €")`, com um espaço NORMAL antes do
     * símbolo, e passava porque o número grande saía tal e qual do texto que
     * ela escreveu no estúdio. Agora é composto por nós — a folha fecha sempre
     * na escada, e o número grande é o «Total a pagar» —, e o `Intl` põe ali um
     * espaço INSEPARÁVEL, que é o que se quer: um valor não deve largar o seu
     * «€» no fim de uma linha. O que este teste guarda é o separador de
     * milhares, e continua a guardá-lo.
     */
    expect(texto).toMatch(/30\.750,00\s€/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BLOCO DE TOTAIS — OS SEIS NÚMEROS, E O DOCUMENTO A FECHAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A proposta da Mariana e do João diz, por esta ordem:
 *
 *     Valor Total                   7890 € + Iva
 *     Serviço de coordenação         950,50€ + Iva
 *     Deslocação da Equipa Líquen    250,00 €
 *
 * e mais nada. É essa folha que a Tara e o Marty receberam — o «Valor Total»
 * dos itens, os adicionais por baixo, e o casal a somar de cabeça. O que eles
 * leram foi «Valor Total 2.950,79 €» na página 11 e, na 14, um sinal e um saldo
 * que somavam 3.025,80 €: três números em três unidades, e nem sequer a fechar
 * (2.950,79 + 75,00 = 3.025,79).
 *
 * O quadro dela fica; o que se acrescenta é o fecho, na ordem que ela pediu —
 * subtotal, adicionais (a somar), TOTAL, IVA, total a pagar. Cada linha diz a
 * unidade em que está, e as somas fecham ao cêntimo nos dois modos de IVA.
 */
describe("o bloco de totais do orçamento", () => {
  const comExtras = {
    // 7890 + 950,50 + 250 = 9090,50 — é o que se cobra, e é o que o campo do
    // total guarda (ver `somaDosServicosEAdicionais`).
    totalAmount: 9090.5,
    totalText: "9.090,50 € + IVA",
    totalVatMode: "acrescer" as const,
    budgetItems: ["Design Floral e Decor Jantar", "Decor Mesa Buffet", "Bouquet da Noiva"],
    budgetExtras: [
      { label: "Serviço de coordenação", valueText: "950,50 € + IVA" },
      { label: "Deslocação da Equipa Líquen", valueText: "250,00 €" },
    ],
  };

  it("as seis linhas saem pela ordem dela", async () => {
    const texto = await textoDoPdf(proposta(comExtras));
    const ordem = [
      "Subtotal dos serviços",
      "Serviço de coordenação",
      "Deslocação da Equipa Líquen",
      "TOTAL (sem IVA)",
      "IVA (23%)",
      "Total a pagar",
    ];
    let cursor = -1;
    for (const rotulo of ordem) {
      const i = texto.indexOf(rotulo, cursor + 1);
      expect(i, `«${rotulo}» não está na folha, ou está fora de ordem`).toBeGreaterThan(cursor);
      cursor = i;
    }
  });

  it("o subtotal é o dos itens, e os adicionais somam-lhe até ao TOTAL", async () => {
    const texto = await textoDoPdf(proposta(comExtras));
    // 9.090,50 − 950,50 − 250 = 7.890,00 de serviços.
    expect(texto).toMatch(/Subtotal dos serviços\s*7\.?890,00/);
    // O «+» é a indicação explícita de que a parcela SOMA — sem ele, um valor
    // por baixo de um subtotal tanto pode somar como descontar.
    expect(texto).toMatch(/Serviço de coordenação\s*\+\s*950,50/);
    expect(texto).toMatch(/Deslocação da Equipa Líquen\s*\+\s*250,00/);
    expect(texto).toMatch(/TOTAL \(sem IVA\)\s*9\.?090,50/);
  });

  it("o «Total a pagar» é o que o casal transfere, e fecha com o IVA", async () => {
    const texto = await textoDoPdf(proposta(comExtras));
    // 9.090,50 × 23% = 2.090,82; 9.090,50 + 2.090,82 = 11.181,32.
    expect(texto).toMatch(/IVA \(23%\)\s*2\.?090,82/);
    expect(texto).toMatch(/Total a pagar\s*11\.?181,32/);
  });

  /**
   * ── DEFEITO 5 — A DUPLA CONVERSÃO, MEDIDA NO PDF DA CLIENTE ──────────────
   *
   * Os números da proposta da Tara e do Marty, tal e qual: total 2.460,00 € de
   * base, uma deslocação de 75,00 €, IVA incluído. O «Valor Total» saía
   * 2.950,79 € — bruto ÷ 1,23 para tirar a deslocação, e o resto × 1,23 outra
   * vez para imprimir — quando 3.025,80 − 75,00 = 2.950,80. Um cêntimo, e com
   * ele o documento a não fechar.
   */
  it("BUG-GUARD: os números da Tara e do Marty fecham ao cêntimo", async () => {
    const texto = await textoDoPdf(
      proposta({
        totalAmount: 3025.8,
        totalText: "3.025,80 €",
        totalVatMode: "incluido",
        budgetItems: ["Decoração Cerimónia", "Decoração Copo d'Água"],
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
      }),
    );
    // A deslocação vale 60,98 € de base (75 ÷ 1,23) e o subtotal é o que sobra.
    expect(texto).toMatch(/Subtotal dos serviços\s*2\.?399,02/);
    expect(texto).toMatch(/Deslocação da Equipa Líquen \(75,00 €\)\s*\+\s*60,98/);
    // 2.399,02 + 60,98 = 2.460,00 exacto. O 2.950,79 não pode existir em lado
    // nenhum da folha.
    expect(texto).toMatch(/TOTAL \(sem IVA\)\s*2\.?460,00/);
    expect(texto).not.toContain("2950,79");
    expect(texto).not.toContain("2.950,79");
    // E o número grande é, ao cêntimo, o que o sinal e o saldo somam.
    expect(texto).toMatch(/Total a pagar\s*3\.?025,80/);
    expect(texto).toMatch(/Sinal 30%\s*907,74/);
    expect(texto).toMatch(/Saldo 70%\s*2\.?118,06/);
  });

  it("cada adicional continua a valer o que ela lhe escreveu", async () => {
    const texto = await textoDoPdf(proposta(comExtras));
    // Em «acresce», o que ela escreveu já é base: os números saem intactos, e é
    // o bloco inteiro que diz o IVA uma vez só.
    expect(texto).toMatch(/Serviço de coordenação\s*\+\s*950,50/);
    expect(texto).toMatch(/Deslocação da Equipa Líquen\s*\+\s*250,00/);
    // O que ela escreveu não se perde quando o número impresso é outro: numa
    // proposta que se lê COM IVA, a deslocação de 75,00 € vale 60,98 € de base,
    // e a folha diz as duas coisas.
    const comIva = await textoDoPdf(
      proposta({
        totalAmount: 3025.8,
        totalText: "3.025,80 €",
        totalVatMode: "incluido",
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
      }),
    );
    expect(comIva).toContain("Deslocação da Equipa Líquen (75,00 €)");
  });

  /**
   * ── SEM ADICIONAIS, A MESMA ESCADA ─────────────────────────────────────────
   *
   * Este teste dizia o contrário: `not.toContain("Total a pagar")`. Fixava a
   * folha antiga — um número grande sozinho, com a unidade escrita ao lado em
   * texto livre. Mudou por pedido dela, com a proposta da Mariana e do João à
   * frente: «quero sempre que nas propostas apareça assim na parte do
   * orçamento». O que o casal tem de conseguir ler sem fazer contas é o que
   * vai transferir, e isso não pode depender de a proposta ter ou não uma
   * deslocação.
   *
   * O «Subtotal dos serviços» continua de fora, e continua a ser de propósito:
   * sem adicionais ele É o TOTAL, e o mesmo número duas vezes em linhas
   * seguidas com rótulos diferentes ensina a desconfiar da conta.
   */
  it("sem adicionais nenhuns, a escada é a mesma: TOTAL, IVA e Total a pagar", async () => {
    const texto = await textoDoPdf(proposta({ totalAmount: 7890, totalVatMode: "acrescer" }));
    // 7.890,00 × 23% = 1.814,70; 7.890,00 + 1.814,70 = 9.704,70.
    expect(texto).toMatch(/TOTAL \(sem IVA\)\s*7\.?890,00/);
    expect(texto).toMatch(/IVA \(23%\)\s*1\.?814,70/);
    expect(texto).toMatch(/Total a pagar\s*9\.?704,70/);
    // O subtotal não: seria o mesmo 7.890,00 na linha de cima.
    expect(texto).not.toContain("Subtotal dos serviços");
  });

  it("a escada sai na ordem dela também sem adicionais", async () => {
    const texto = await textoDoPdf(proposta({ totalAmount: 7890, totalVatMode: "acrescer" }));
    let cursor = -1;
    for (const rotulo of ["TOTAL (sem IVA)", "IVA (23%)", "Total a pagar"]) {
      const i = texto.indexOf(rotulo, cursor + 1);
      expect(i, `«${rotulo}» não está na folha, ou está fora de ordem`).toBeGreaterThan(cursor);
      cursor = i;
    }
  });

  /**
   * O ramo de baixo continua a existir, e é ele que trata as propostas que
   * ainda não têm euros: sem número, não se inventa uma escada de zeros.
   */
  it("com o total por definir, não se desenha uma escada de zeros", async () => {
    const texto = await textoDoPdf(
      proposta({ totalAmount: 0, totalText: "a definir", totalEstimatedText: "" }),
    );
    expect(texto).not.toContain("TOTAL (sem IVA)");
    expect(texto).not.toContain("Total a pagar");
    expect(texto).toContain("a definir");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «+ IVA» TEM DE CHEGAR AO PDF (3.2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O documento da Tara e do Marty tinha o editor em «+ IVA (acresce)» e imprimiu
 * o valor sozinho, sem anotação nenhuma — e um número sem «+ IVA» ao lado lê-se
 * como preço final. São 23% de diferença naquilo que o casal pensa que vai
 * transferir.
 */
describe("a definição de IVA do estúdio chega ao papel", () => {
  /**
   * ── A ANOTAÇÃO DEIXOU DE SER A DEFESA, PASSOU A SÊ-LO A ESCADA ────────────
   *
   * Estes dois testes exigiam o «+ IVA» colado ao número grande. Era a defesa
   * possível enquanto o número grande era TUDO o que a folha dizia. Agora não
   * é: a folha diz «TOTAL (sem IVA)», diz o imposto em euros e diz o «Total a
   * pagar». A defesa que aqui se prende é a mesma de sempre — nenhum número
   * desta folha pode ser lido como preço final quando não é —, e passou a ter
   * uma forma melhor: em vez de uma etiqueta ao lado, a conta escrita.
   *
   * O `comIvaDito` continua vivo e continua preso, no único sítio onde ainda
   * governa: a proposta SEM euros para somar (o total escrito à mão, «a
   * definir», uma proposta a meio), que cai no ramo do número em texto livre.
   */
  it("em «acresce», o casal vê o imposto em euros e não uma etiqueta ao lado", async () => {
    const texto = await textoDoPdf(
      proposta({ totalAmount: 7890, totalVatMode: "acrescer", totalText: "7.890,00 €" }),
    );
    expect(texto).toMatch(/TOTAL \(sem IVA\)\s*7\.?890,00/);
    expect(texto).toMatch(/IVA \(23%\)\s*1\.?814,70/);
    expect(texto).toMatch(/Total a pagar\s*9\.?704,70/);
  });

  it("sem número para somar, a anotação «+ IVA» continua a ser a defesa", async () => {
    const texto = await textoDoPdf(
      proposta({
        totalAmount: 0,
        totalText: "a combinar",
        totalEstimatedText: "",
        totalVatMode: "acrescer",
      }),
    );
    expect(texto).toMatch(/a combinar \+ IVA/);
    expect(texto).not.toContain("+ IVA + IVA");
  });

  it("em «IVA incluído» o bloco diz quanto do total é imposto", async () => {
    const texto = await textoDoPdf(
      proposta({
        totalAmount: 12300,
        totalText: "12.300,00 €",
        totalVatMode: "incluido",
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "300,00 €" }],
      }),
    );
    // 12.300 ÷ 1,23 = 10.000 de base, 2.300 de IVA.
    expect(texto).toMatch(/TOTAL \(sem IVA\)\s*10\.?000,00/);
    expect(texto).toMatch(/IVA \(23%\)\s*2\.?300,00/);
    expect(texto).toMatch(/Total a pagar\s*12\.?300,00/);
    // E o número já traz o imposto: não pode aparecer um «+ IVA» a dizer o
    // contrário.
    expect(texto).not.toContain("12.300,00 € + IVA");
  });

  it("uma taxa reduzida sai escrita, e não um «23%» à letra", async () => {
    const texto = await textoDoPdf(
      proposta({
        vatRate: 0.06,
        totalAmount: 10000,
        totalVatMode: "acrescer",
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "500,00 €" }],
      }),
    );
    expect(texto).toMatch(/IVA \(6%\)\s*600,00/);
    expect(texto).not.toContain("IVA (23%)");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SINAL + SALDO = O TOTAL APRESENTADO (3.4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A conta que o casal faz é esta, e tem de dar. Na proposta da Tara e do Marty
 * dava — sobre um número que a folha do orçamento não mostrava em lado nenhum.
 */
describe("o sinal e o saldo fecham o total apresentado", () => {
  const casos = [
    {
      nome: "com adicionais, em «acresce»",
      over: {
        totalAmount: 9090.5,
        totalText: "9.090,50 € + IVA",
        totalVatMode: "acrescer" as const,
        budgetExtras: [
          { label: "Serviço de coordenação", valueText: "950,50 € + IVA" },
          { label: "Deslocação da Equipa Líquen", valueText: "250,00 €" },
        ],
      },
      aPagar: /11\.?181,32/,
      sinal: /Sinal 30%\s*3\.?354,40/,
      saldo: /Saldo 70%\s*7\.?826,92/,
    },
    {
      nome: "com adicionais, em «IVA incluído»",
      over: {
        totalAmount: 3025.8,
        totalText: "3.025,80 €",
        totalVatMode: "incluido" as const,
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
      },
      aPagar: /3\.?025,80/,
      sinal: /Sinal 30%\s*907,74/,
      saldo: /Saldo 70%\s*2\.?118,06/,
    },
  ];

  for (const caso of casos) {
    it(`${caso.nome}: as duas parcelas somam o total a pagar`, async () => {
      const texto = await textoDoPdf(proposta(caso.over));
      expect(texto).toMatch(caso.sinal);
      expect(texto).toMatch(caso.saldo);
      expect(texto).toMatch(new RegExp(`Total a pagar\\s*${caso.aPagar.source}`));
    });
  }

  it("a base do sinal está dita por palavras, e é a mesma da folha do orçamento", async () => {
    const texto = await textoDoPdf(
      proposta({
        totalAmount: 3025.8,
        totalText: "3.025,80 €",
        totalVatMode: "incluido",
        budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
      }),
    );
    // Sem esta frase, os 907,74 € e os 2.118,06 € da última folha eram dois
    // números sem origem — e a origem não estava impressa em lado nenhum.
    expect(texto).toMatch(/Calculados sobre o total a pagar — 3\.?025,80\s€, com IVA incluído\./);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DATA DE VALIDADE — POR EXTENSO, E A 60 DIAS DA EMISSÃO (bloco 4)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Esta proposta é válida até 11 de out. de 2026» num documento que três linhas
 * abaixo escreve «29 de maio de 2027» são duas mãos a escrever o mesmo papel. A
 * data estava certa — 60 dias a contar da emissão —, o formato é que não era o
 * da casa.
 */
describe("a data de validade", () => {
  it("sai por extenso, como o resto do documento", async () => {
    const texto = await textoDoPdf(proposta({ validUntil: "2026-10-11" }));
    expect(texto).toContain("Esta proposta é válida até 11 de outubro de 2026.");
    expect(texto).not.toContain("out. de 2026");
  });

  it("são os 60 dias configurados, contados da emissão", async () => {
    // Sem `validUntil` explícita, a data sai de hoje + `validUntilDays`. 60 é a
    // omissão da casa (DEFAULT_VALID_DAYS), e é o que a folha promete.
    /**
     * ── «HOJE» É O DIA QUE PORTUGAL ESTÁ A VIVER, TAMBÉM AQUI ──────────────
     *
     * Isto contava a partir de `new Date().toISOString()`, que é o dia de
     * GREENWICH — e o código que está a ser medido conta de propósito pelo
     * relógio de Lisboa (ver `hojeNoEstudio`, com a nota da factura do sinal
     * datada do dia anterior). No Verão, das 23:00 às 00:00 UTC, os dois
     * discordam num dia: a suite ficava vermelha durante uma hora por noite,
     * sobre código certo. Um vermelho que aparece e desaparece sozinho é um
     * vermelho que se aprende a ignorar — e é o mesmo defeito, do outro lado.
     *
     * O dia de Lisboa calcula-se aqui à parte, sem chamar a função que se está
     * a medir: `en-CA` dá `yyyy-mm-dd`, e a soma faz-se em UTC sobre esses três
     * campos, onde o dia tem sempre 24 horas.
     */
    const emLisboa = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Lisbon",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const [ano, mes, dia] = emLisboa.split("-").map(Number);
    const limite = new Date(Date.UTC(ano, mes - 1, dia + 60));
    const iso = limite.toISOString().slice(0, 10);
    expect(iso).toBe(resolveValidUntil(proposta()));

    const texto = await textoDoPdf(proposta());
    const meses = [
      "janeiro",
      "fevereiro",
      "março",
      "abril",
      "maio",
      "junho",
      "julho",
      "agosto",
      "setembro",
      "outubro",
      "novembro",
      "dezembro",
    ];
    const esperado = `${limite.getUTCDate()} de ${meses[limite.getUTCMonth()]} de ${limite.getUTCFullYear()}`;
    expect(texto).toContain(`Esta proposta é válida até ${esperado}.`);
  });
});

/**
 * ── O VALOR QUE VEM EM TEXTO, ESCRITO POR ELA ──────────────────────────────
 *
 * Nem tudo o que traz um «€» nesta folha é um número nosso. O valor de cada
 * ADICIONAL («Deslocação da equipa», «Wedding Coordinator») é texto livre — o
 * que ela escreveu no estúdio, guardado tal e qual — e sai impresso entre
 * parênteses ao lado do rótulo, a dois centímetros dos números que nós
 * formatamos.
 *
 * Esse texto não passa por formatador nenhum: passa pelo `milharesComPonto`,
 * que só sabia trocar o espaço inquebrável do `Intl` pelo ponto. E o `Intl`
 * NÃO PÕE espaço nenhum abaixo de cinco dígitos — portanto «7890,00 €»,
 * escrito à mão ou colado de uma proposta antiga, chegava ao papel exactamente
 * assim, ao lado de um «+ 6.414,63 €» que nós tínhamos escrito bem.
 *
 * Corrige-se no DESENHO e não em quem grava: as propostas já guardadas têm o
 * texto antigo lá dentro, e um casal que reabra a sua proposta de janeiro tem
 * de a ver bem escrita sem que ninguém volte a gravá-la.
 *
 * Os espaços aqui são NORMAIS de propósito — é texto de teclado, não saída do
 * `Intl`. É essa a forma em que ela o escreve.
 */
describe("o valor escrito à mão sai como o resto da folha", () => {
  /**
   * O modo «IVA incluído» é o que faz o valor CRU dela aparecer entre
   * parênteses: o que a folha soma é a BASE (o adicional entra líquido), e o
   * que ela escreveu vai ao lado, a dizer o que aquele valor era.
   */
  const comAdicional = (valueText: string) =>
    proposta({
      totalVatMode: "incluido",
      totalText: "10.000,00 €",
      budgetExtras: [{ label: "Deslocação da equipa", valueText }],
    });

  it("um adicional de 7 890 € escrito sem separador imprime-se com ponto", async () => {
    const texto = await textoDoPdf(comAdicional("7890,00 €"));
    expect(texto).toContain("Deslocação da equipa (7.890,00 €)");
    expect(texto).not.toContain("(7890,00");
  });

  /**
   * Ela nem sempre escreve os cêntimos — «7890 €» é como um valor de
   * deslocação aparece escrito à pressa. O separador entra na mesma.
   */
  it("um valor sem cêntimos leva o ponto na mesma", async () => {
    const texto = await textoDoPdf(comAdicional("7890 €"));
    expect(texto).toContain("Deslocação da equipa (7.890 €)");
    expect(texto).not.toContain("(7890 €)");
  });

  it("um valor que ela já escreveu bem não é mexido", async () => {
    const texto = await textoDoPdf(comAdicional("12.300,00 €"));
    expect(texto).toContain("Deslocação da equipa (12.300,00 €)");
  });

  /** Três dígitos não levam separador — e o que não é dinheiro não é tocado. */
  it("999 € fica como está, e uma frase sem euros também", async () => {
    const texto = await textoDoPdf(comAdicional("999,00 €"));
    expect(texto).toContain("Deslocação da equipa (999,00 €)");
    expect(texto).not.toContain(".999,00");

    const semNumero = await textoDoPdf(comAdicional("a definir"));
    expect(semNumero).toContain("Deslocação da equipa");
  });
});
