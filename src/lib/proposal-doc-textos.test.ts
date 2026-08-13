import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PDFDocument, PDFPage, type PDFFont } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import {
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_NOTAS_IMPORTANTES,
  DIAS_PARA_CONFIRMAR_CONVIDADOS,
  withProposalDefaults,
  type ProposalDoc,
} from "./proposal-doc";
import {
  blocosFixosNaLingua,
  textosDaProposta,
  type IdiomaDaProposta,
  type TextosDoDocumento,
} from "./proposal-doc-textos";
import { TEXTO_DO_MOODBOARD } from "./proposal-geometria";
import { SITE } from "./site";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL — O QUE ESTE FICHEIRO GARANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Três coisas, e são três defeitos diferentes:
 *
 *   1. QUE O PORTUGUÊS NÃO MUDOU. É o caminho por que sai tudo o que já
 *      existia. Desenha-se sem idioma e com «pt» e comparam-se as instruções de
 *      desenho uma a uma — mesmas páginas, mesmas coordenadas, mesmas palavras.
 *
 *   2. QUE NÃO SOBRA PORTUGUÊS NA VERSÃO INGLESA. Um rótulo esquecido não dá
 *      erro nenhum: sai uma proposta meio-inglesa, e quem a lê primeiro é o
 *      cliente. O varrimento percorre o dicionário INTEIRO — chave a chave, e
 *      as entradas novas entram sozinhas — e procura cada frase portuguesa no
 *      texto do PDF inglês.
 *
 *   3. QUE AS PALAVRAS INGLESAS CABEM. Em inglês as palavras têm outro
 *      comprimento: um rótulo que cabia pode transbordar a coluna, passar por
 *      cima de um número, ou empurrar uma secção para outra folha. Mede-se —
 *      cada escrita com a sua fonte, o seu corpo e a sua largura real.
 *
 * O texto sai das instruções de desenho e não dos bytes do PDF: as fontes vão
 * embutidas em subconjunto e os códigos dos glifos deixam de ser legíveis (é o
 * mesmo motivo por que `proposal-doc-pdf.paginacao.test.ts` faz o mesmo).
 */

// Oito documentos inteiros, com fontes embutidas — o relógio por omissão do
// vitest (5 s) não chega, e falharia por máquina carregada e não por composição.
const RELOGIO = 120_000;

const W = 841.89;
const H = 595.28;
const M = 68;

// ── A sonda ────────────────────────────────────────────────────────────────

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  /** A largura REAL do que foi escrito, medida com a fonte com que foi escrito. */
  largura: number;
}

/** Desenha o documento e devolve tudo o que foi escrito, com a largura medida. */
async function desenhar(doc: ProposalDoc, idioma?: IdiomaDaProposta) {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawTextOriginal = PDFPage.prototype.drawText;

  PDFDocument.prototype.addPage = function (...args: Parameters<typeof addPageOriginal>) {
    const p = addPageOriginal.apply(this, args) as PDFPage;
    paginas.push(p);
    return p;
  };
  PDFPage.prototype.drawText = function (
    texto: string,
    opts?: Parameters<typeof drawTextOriginal>[1],
  ) {
    const fonte = opts?.font as PDFFont | undefined;
    const corpo = opts?.size ?? 10;
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: String(texto),
      largura: fonte ? fonte.widthOfTextAtSize(String(texto), corpo) : 0,
    });
    return drawTextOriginal.call(this, texto, opts);
  };

  try {
    const bytes = idioma
      ? await renderProposalDocPdf(doc, idioma)
      : await renderProposalDocPdf(doc);
    return { escritas, paginas: paginas.length, bytes };
  } finally {
    PDFDocument.prototype.addPage = addPageOriginal;
    PDFPage.prototype.drawText = drawTextOriginal;
  }
}

/**
 * O texto do documento, numa só linha, pronto a ser procurado.
 *
 * Duas reconstruções, porque o desenho parte o texto de duas maneiras:
 *
 *   · as legendas em capitulares são desenhadas LETRA A LETRA (é assim que se
 *     lhes dá espaçamento), portanto as escritas de um caráter só, seguidas e à
 *     mesma altura, voltam a colar-se;
 *   · o texto corrido é partido em linhas pelo `wrap`, que separa por espaços —
 *     juntar as escritas com um espaço devolve a frase inteira.
 *
 * Tudo em maiúsculas e com os espaços normalizados: as capitulares e o espaço
 * inquebrável dos euros não podem fazer uma frase escapar ao varrimento.
 */
function textoInteiro(escritas: Escrita[]): string {
  const pedacos: string[] = [];
  let letras: string | null = null;
  let alturaDasLetras = { pagina: -1, y: 0 };
  for (const e of escritas) {
    const solta = [...e.texto].length === 1;
    if (
      solta &&
      letras !== null &&
      alturaDasLetras.pagina === e.pagina &&
      alturaDasLetras.y === e.y
    ) {
      letras += e.texto;
      continue;
    }
    if (letras !== null) pedacos.push(letras);
    if (solta) {
      letras = e.texto;
      alturaDasLetras = { pagina: e.pagina, y: e.y };
    } else {
      letras = null;
      pedacos.push(e.texto);
    }
  }
  if (letras !== null) pedacos.push(letras);
  return normalizar(pedacos.join(" "));
}

/** A forma em que se comparam textos: NFC, sem espaços a mais, em maiúsculas. */
function normalizar(s: string): string {
  return s.normalize("NFC").replace(/\s+/g, " ").trim().toUpperCase();
}

// ── Os documentos de prova ─────────────────────────────────────────────────
//
// O conteúdo escrito por ela é de propósito POBRE em palavras do dicionário:
// se uma rubrica se chamasse «Cerimónia» — que é também o rótulo de um campo —
// o varrimento não saberia distinguir o rótulo esquecido do nome que ela
// escreveu. O que se está a medir é a moldura, não o recheio.

/** A proposta de decoração cheia: extras, linhas opcionais, nota e inspiração. */
function decoracaoCheia(): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Casamento Maria & Zé 12.09.2026",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha",
    guests: "120 pax",
    servico: "Decor e design floral",
    ceremony: "Civil",
    time: "16h00",
    coverImages: [],
    moodBoards: [{ title: "Jantar", images: [FOTO], annotation: "Tons de linho e vidro." }],
    serviceGroups: [
      {
        letter: "a)",
        title: "Design Floral",
        items: [
          { label: "Arco", desc: "Estrutura vestida com folhagem e flor natural." },
          { label: "Mesas", desc: "Composições baixas alternadas com velas." },
        ],
      },
    ],
    budgetItems: ["Decor Jantar", "Decor Bar", "Suspensos"],
    budgetAmounts: [4000, 1500, 1375],
    budgetOpcional: [false, true, true],
    budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "896,00 €" }],
    budgetNote: "Os valores mantêm-se até à data de validade.",
    totalLabel: "Valor Total Decor",
    totalText: "6875,00 € + IVA",
    totalAmount: 6875,
    totalVatMode: "acrescer",
    depositPercent: 30,
    validUntil: DIA_DE_VALIDADE,
  });
}

/** A mesma, com UMA só linha assinalada — a frase muda de número. */
function decoracaoComUmExtra(): ProposalDoc {
  return withProposalDefaults({
    ...decoracaoCheia(),
    budgetOpcional: [false, true, false],
    moodBoards: [],
  });
}

/** Organização SEM valores adicionais: é aqui que sai o «Total Estimado». */
function organizacao(): ProposalDoc {
  return withProposalDefaults({
    template: "organizacao",
    ref: "PO Organização Ana & Rui",
    clientNames: "Ana & Rui",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Herdade do Freixo",
    guests: "80 pax",
    servico: "Planeamento integral",
    coverImages: [],
    moodBoards: [],
    cronograma: [{ title: "6-12 meses antes", items: ["Escolha do espaço e visita."] }],
    serviceGroups: [{ title: "Coordenação", items: [{ label: "Reunião inicial" }] }],
    budgetItems: [],
    budgetRows: [{ item: "Coordenação no dia", price: "[Valor]" }],
    totalLabel: "",
    totalText: "",
    totalEstimatedText: "[Valor Total]",
    validUntil: DIA_DE_VALIDADE,
  });
}

/** Organização COM valores adicionais: é aqui que sai o subtotal estimado. */
function organizacaoComExtras(): ProposalDoc {
  return withProposalDefaults({
    ...organizacao(),
    // Com um total a sério: um adicional por cima de um total por definir dava
    // um subtotal de serviços negativo, e o gerador tem razão em o dizer.
    totalEstimatedText: "12.500,00 €",
    totalAmount: 12500,
    totalVatMode: "incluido",
    budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "300,00 €" }],
  });
}

/** A data de validade escrita no documento — fixa, para a forma da data ser
 *  comparável palavra a palavra nas duas línguas. */
const DIA_DE_VALIDADE = "2026-10-11";

/**
 * Uma fotografia mínima, para a página de inspiração existir.
 *
 * PNG de 2×2 escrito à mão (assinatura, IHDR, IDAT, IEND): o gerador só precisa
 * de bytes que o `pdf-lib` saiba embutir e que o sharp saiba medir.
 */
const FOTO =
  "iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8//8/AzJgYkAFhPgAZfIDPXf2ZL4AAAAASUVORK5CYII=";

// ── O varrimento: o dicionário inteiro, chave a chave ──────────────────────

/**
 * Como se produz uma frase a partir de uma entrada que é FUNÇÃO.
 *
 * O argumento entra como uma marca (`§`) e a frase é depois partida por ela: o
 * que sobra é a parte FIXA, que é a única que tem de estar traduzida. Assim uma
 * entrada nova com um argumento qualquer entra no varrimento sem ninguém ter de
 * lhe escrever um exemplo.
 *
 * A data é a excepção, e tem de ser: nela o argumento não aparece na frase — é
 * a frase. Sem um exemplo verdadeiro, a forma da data inglesa ficava por medir,
 * que é precisamente uma das decisões deste lote.
 */
const MARCA = "§";
const EXEMPLOS: Partial<Record<keyof TextosDoDocumento, unknown>> = {
  data: DIA_DE_VALIDADE,
};

/** Todas as frases de um dicionário, por chave — as fixas e os pedaços fixos
 *  das que levam um valor pelo meio. */
function frasesDe(t: TextosDoDocumento): Map<string, string[]> {
  const fora = new Map<string, string[]>();
  const guardar = (chave: string, valor: unknown) => {
    if (typeof valor === "string") {
      fora.set(chave, [valor]);
      return;
    }
    if (typeof valor === "function") {
      const exemplo = chave in EXEMPLOS ? EXEMPLOS[chave as keyof TextosDoDocumento] : MARCA;
      const frase = String((valor as (v: unknown) => string)(exemplo));
      // Pedaços com menos de quatro caracteres são cola («)», «.», «As») e não
      // distinguem língua nenhuma — procurá-los só daria falsos alarmes.
      fora.set(
        chave,
        frase
          .split(MARCA)
          .map((p) => p.trim())
          .filter((p) => p.length >= 4),
      );
      return;
    }
    // `null` = o texto vive noutro módulo (ver o dicionário). Em português é
    // isso que sai impresso, e é isso que o varrimento tem de procurar.
    if (valor === null) {
      fora.set(chave, [chave === "slogan" ? SITE.slogan : TEXTO_DO_MOODBOARD.sobretitulo.texto]);
      return;
    }
    if (valor && typeof valor === "object") {
      for (const [sub, v] of Object.entries(valor)) guardar(`${chave}.${sub}`, v);
      return;
    }
    throw new Error(`entrada «${chave}» de um tipo que o varrimento não sabe ler`);
  };
  for (const [chave, valor] of Object.entries(t)) guardar(chave, valor);
  return fora;
}

// ── Os desenhos, feitos uma vez ────────────────────────────────────────────

type Desenho = Awaited<ReturnType<typeof desenhar>>;
const emIngles = new Map<string, Desenho>();
const emPortugues = new Map<string, Desenho>();
const DOCUMENTOS: [string, () => ProposalDoc][] = [
  ["decoração cheia", decoracaoCheia],
  ["decoração com um extra", decoracaoComUmExtra],
  ["organização", organizacao],
  ["organização com adicionais", organizacaoComExtras],
];

beforeAll(async () => {
  for (const [nome, fazer] of DOCUMENTOS) {
    emIngles.set(nome, await desenhar(fazer(), "en"));
    emPortugues.set(nome, await desenhar(fazer(), "pt"));
  }
}, RELOGIO);

afterAll(() => {
  emIngles.clear();
  emPortugues.clear();
});

describe("o caminho de omissão continua a ser o português", () => {
  it(
    "sem idioma e com «pt» desenham exactamente o mesmo, palavra a palavra e ponto a ponto",
    { timeout: RELOGIO },
    async () => {
      const doc = decoracaoCheia();
      const semDizer = await desenhar(doc);
      const aDizerPt = await desenhar(doc, "pt");
      expect(semDizer.escritas).toEqual(aDizerPt.escritas);
      expect(semDizer.paginas).toBe(aDizerPt.paginas);
    },
  );

  it("os blocos de texto fixo em português são as MESMAS listas do documento", () => {
    const doc = decoracaoCheia();
    const blocos = blocosFixosNaLingua(doc, "pt");
    // A mesma referência, não uma cópia igual: o caminho de omissão não copia,
    // não normaliza e não compara nada.
    expect(blocos.notasImportantes).toBe(doc.notasImportantes);
    expect(blocos.condicoesGerais).toBe(doc.condicoesGerais);
    expect(blocos.faseamento).toBe(doc.faseamento);
    expect(blocos.cancelamento).toBe(doc.cancelamento);
    expect(blocosFixosNaLingua(doc).notasImportantes).toBe(doc.notasImportantes);
  });

  /**
   * O casal que ainda não tem data também recebe a proposta em inglês, e a
   * cláusula é a mesma cláusula contratual: sem o dado tem de continuar a ser
   * uma frase, na LÍNGUA em que está a ser escrita — nem um travessão, nem o
   * «a definir» português a meio de uma frase inglesa.
   */
  it("sem data e sem número, as condições inglesas também continuam frases", () => {
    // As condições voltam ao molde: o documento de prova traz-nas já
    // preenchidas com a data que aqui deixa de existir.
    const doc = withProposalDefaults({
      ...decoracaoCheia(),
      eventDate: "",
      guests: "",
      condicoesGerais: undefined,
    });
    const texto = blocosFixosNaLingua(doc, "en").condicoesGerais.join("\n");
    expect(texto).toContain(
      "This proposal is only valid for the event date subsequently confirmed in writing.",
    );
    expect(texto).toContain(
      "The quote is valid for the number of guests subsequently confirmed in writing;" +
        " below or above that number the amount of the proposal will have to be revised.",
    );
    expect(texto).not.toContain("{DATA}");
    expect(texto).not.toContain("{CONVIDADOS}");
    expect(texto).not.toContain("—");
    expect(texto).not.toContain("a definir");
  });
});

describe("nada fica por traduzir na versão inglesa", () => {
  it("nenhuma frase portuguesa do dicionário sobrevive no PDF inglês", () => {
    const pt = frasesDe(textosDaProposta("pt"));
    const en = frasesDe(textosDaProposta("en"));
    const encontradas: string[] = [];
    for (const [nome, desenho] of emIngles) {
      const texto = textoInteiro(desenho.escritas);
      for (const [chave, pedacos] of pt) {
        const iguais = JSON.stringify(pedacos) === JSON.stringify(en.get(chave));
        // Palavras que são as mesmas nas duas línguas («Item», «Email»,
        // «extra») não se podem procurar como sobras — são a tradução.
        if (iguais) continue;
        for (const pedaco of pedacos) {
          if (texto.includes(normalizar(pedaco))) {
            encontradas.push(`${nome}: «${pedaco}» (${chave})`);
          }
        }
      }
    }
    expect(encontradas).toEqual([]);
  });

  it("todas as frases inglesas do dicionário chegam mesmo a ser impressas", () => {
    const en = frasesDe(textosDaProposta("en"));
    const tudo = [...emIngles.values()].map((d) => textoInteiro(d.escritas));
    const porImprimir: string[] = [];
    for (const [chave, pedacos] of en) {
      for (const pedaco of pedacos) {
        if (!tudo.some((texto) => texto.includes(normalizar(pedaco)))) {
          porImprimir.push(`${chave}: «${pedaco}»`);
        }
      }
    }
    // Uma entrada que nunca é impressa é uma de duas coisas, e as duas
    // interessam: texto morto no dicionário, ou um documento de prova que
    // deixou de passar pela secção onde ela sai.
    expect(porImprimir).toEqual([]);
  });

  it("o texto padrão da casa sai traduzido, com os marcadores preenchidos", () => {
    const texto = textoInteiro(emIngles.get("decoração cheia")!.escritas);
    // As notas e as condições da casa, na versão inglesa.
    expect(texto).toContain(normalizar("Set-up and dismantling are included in this proposal"));
    expect(texto).toContain(normalizar("VAT at the legal rate in force is added to the amounts"));
    expect(texto).toContain(normalizar("All materials and props used at the event"));
    expect(texto).toContain(normalizar("30% on acceptance"));
    expect(texto).toContain(normalizar("In the event of cancellation of the service"));
    // E nenhuma das portuguesas.
    for (const linha of [...DEFAULT_NOTAS_IMPORTANTES, ...DEFAULT_CONDICOES_GERAIS]) {
      expect(texto).not.toContain(normalizar(linha.slice(0, 40)));
    }
    // Os marcadores: a data e o número de convidados são texto DELA e entram
    // tal e qual na frase inglesa — o que não pode acontecer é sobrar um «{».
    expect(texto).toContain(normalizar("event to be held on 12 de setembro de 2026"));
    expect(texto).toContain(normalizar("valid for the stated number of guests (120 pax)"));
    expect(texto).not.toContain("{DATA}");
    expect(texto).not.toContain("{CONVIDADOS}");
    // E os dias de confirmação continuam a ser a constante, não um número solto.
    expect(texto).toContain(
      normalizar(`confirmed up to ${DIAS_PARA_CONFIRMAR_CONVIDADOS} days before the event`),
    );
  });

  it("o que ela reescreveu à mão sai tal e qual, mesmo em inglês", async () => {
    const dela = "Só usamos flor da época, colhida na semana do casamento.";
    const doc = withProposalDefaults({ ...decoracaoCheia(), notasImportantes: [dela] });
    const texto = textoInteiro((await desenhar(doc, "en")).escritas);
    expect(texto).toContain(normalizar(dela));
    // A moldura à volta dela continua inglesa: é a rubrica que é da casa.
    expect(texto).toContain(normalizar("Important notes"));
    expect(texto).not.toContain(normalizar("Set-up and dismantling are included"));
  });
});

describe("as datas e o dinheiro", () => {
  it("a validade sai «11 October 2026» em inglês e «11 de outubro de 2026» em português", () => {
    expect(textoInteiro(emIngles.get("decoração cheia")!.escritas)).toContain(
      normalizar("This proposal is valid until 11 October 2026."),
    );
    expect(textoInteiro(emPortugues.get("decoração cheia")!.escritas)).toContain(
      normalizar("Esta proposta é válida até 11 de outubro de 2026."),
    );
  });

  it("os euros saem com a pontuação portuguesa NAS DUAS línguas", () => {
    // A decisão está escrita no cabeçalho do dicionário: metade do dinheiro
    // desta folha é texto dela, e duas convenções na mesma coluna leem-se como
    // dois números diferentes.
    const en = textoInteiro(emIngles.get("decoração cheia")!.escritas);
    const pt = textoInteiro(emPortugues.get("decoração cheia")!.escritas);
    for (const valor of ["6.875,00", "1.581,25", "8.456,25", "2.536,88"]) {
      expect(en).toContain(valor);
      expect(pt).toContain(valor);
    }
    // E nunca a pontuação inglesa.
    expect(en).not.toMatch(/\d,\d{3}\.\d{2}/);
  });
});

// ── A largura das palavras ─────────────────────────────────────────────────

/** As páginas de conteúdo: todas menos a capa (a primeira) e a contracapa (a
 *  última), que são desenhadas de bordo a bordo e não têm mancha. */
const deConteudo = (d: Desenho) =>
  d.escritas.filter((e) => e.pagina > 0 && e.pagina < d.paginas - 1);

/** As escritas de uma página, à mesma altura, por ordem de esquerda para a
 *  direita — é assim que se vê se uma passa por cima da seguinte. */
function porLinha(escritas: Escrita[]): Escrita[][] {
  const linhas = new Map<string, Escrita[]>();
  for (const e of escritas) {
    const chave = `${e.pagina}@${e.y.toFixed(1)}`;
    (linhas.get(chave) ?? linhas.set(chave, []).get(chave)!).push(e);
  }
  return [...linhas.values()].map((l) => [...l].sort((a, b) => a.x - b.x));
}

describe("as palavras inglesas cabem na folha", () => {
  for (const lingua of ["pt", "en"] as const) {
    // O português corre as mesmas medições de propósito: é o controlo. Uma
    // regra que o português não cumprisse não estaria a medir transbordos —
    // estaria a medir o desenho de sempre.
    const desenhos = () => (lingua === "en" ? emIngles : emPortugues);

    it(`nada sai da mancha (${lingua})`, () => {
      const fora: string[] = [];
      for (const [nome, d] of desenhos()) {
        for (const e of deConteudo(d)) {
          if (e.x < M - 0.5) fora.push(`${nome}: «${e.texto}» começa em x=${e.x.toFixed(1)}`);
          if (e.x + e.largura > W - M + 0.5) {
            fora.push(`${nome}: «${e.texto}» acaba em x=${(e.x + e.largura).toFixed(1)}`);
          }
          // O rodapé é desenhado em M-26; abaixo disso é fora da folha.
          if (e.y < M - 27) fora.push(`${nome}: «${e.texto}» escrito em y=${e.y.toFixed(1)}`);
          if (e.y > H - M + 12) fora.push(`${nome}: «${e.texto}» escrito em y=${e.y.toFixed(1)}`);
        }
      }
      expect(fora).toEqual([]);
    });

    it(`nada se sobrepõe a nada (${lingua})`, () => {
      const encostados: string[] = [];
      for (const [nome, d] of desenhos()) {
        for (const linha of porLinha(deConteudo(d))) {
          for (let i = 1; i < linha.length; i++) {
            const anterior = linha[i - 1];
            const fim = anterior.x + anterior.largura;
            if (fim > linha[i].x + 0.5) {
              encostados.push(
                `${nome}: «${anterior.texto}» acaba em ${fim.toFixed(1)} e ` +
                  `«${linha[i].texto}» começa em ${linha[i].x.toFixed(1)}`,
              );
            }
          }
        }
      }
      expect(encostados).toEqual([]);
    });
  }

  it("a proposta inglesa ocupa as mesmas folhas que a portuguesa", () => {
    // O que se está a impedir é uma secção a mudar de página só porque as
    // palavras inglesas são mais compridas — a cauda do orçamento cabe atrás do
    // quadro com dez pontos de folga, e é ela que parte primeiro.
    for (const [nome, ingles] of emIngles) {
      expect(`${nome}: ${ingles.paginas}`).toBe(`${nome}: ${emPortugues.get(nome)!.paginas}`);
    }
  });
});
