import { describe, it, expect, vi } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { PDFDocument, PDFPage, type PDFFont, type PDFImage } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import type { IdiomaDaProposta } from "./proposal-doc-textos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NADA ACABA FORA DO PAPEL — A SONDA DE TRANSBORDOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O QUE ESTA SONDA APANHOU E OS OUTROS TESTES NÃO ───────────────────────
 *
 * O que já estava preso era onde o texto COMEÇA: «nada do corpo começa na
 * metade direita da folha» (`paginacao.test.ts`) compara o `x` de cada escrita
 * com a margem. Um `x` dentro da mancha não diz nada sobre onde a linha ACABA —
 * e é aí que os defeitos vivem, porque o desenho tem sítios onde o texto é
 * escrito SEM largura máxima e sem quebra.
 *
 * Medido, num guião equivalente a este corrido sobre os PDF gerados (o
 * `medicao/transbordos.py` do relatório, com o pymupdf a ler os ficheiros):
 *
 *     p3  x 68.0 → 848.2   «Decoração Floral Integral da Cerimónia…»
 *                          passa a margem direita em 74,3 pt — e passa O PAPEL,
 *                          que tem 841,89
 *     p1  x 155.6 → 686.3  «Casamento civil com cerimónia simbólica…»
 *                          desenhado por cima das fotografias da capa
 *
 * Nenhum dos 236 testes dos módulos do PDF apanhava isto. Não eram regressões:
 * eram buracos de cobertura.
 *
 * ── PORQUE É QUE SE MEDE AQUI E NÃO NO FICHEIRO GERADO ────────────────────
 *
 * O guião do relatório lê os PDF com o `pymupdf` — que não existe nesta suite
 * e traria uma dependência nova só para isto. Não é preciso: a largura de uma
 * linha é `font.widthOfTextAtSize(texto, corpo)`, exactamente a mesma conta que
 * o desenho faz para quebrar, e as caixas das fotografias são os argumentos do
 * `drawImage`. Intercepta-se o que o desenho PEDE — é o mesmo método do
 * `paginacao.test.ts`, e é informação mais fiável do que a que se lê de volta
 * (as fontes vão em subconjunto e os glifos deixam de ser legíveis).
 *
 * ── A LISTA DE CONHECIDOS ─────────────────────────────────────────────────
 *
 * Dois defeitos do relatório (D2 e D3) vivem na COMPOSIÇÃO e ainda não têm
 * correcção. Estão em {@link CONHECIDOS}, um a um, com o nome de quem os
 * desenha. A regra deste ficheiro é «nada de NOVO»: um transbordo que não
 * esteja nessa lista deita o teste abaixo. Cada entrada sai da lista no dia em
 * que a composição a corrigir — e a partir daí não pode voltar.
 */

vi.setConfig({ testTimeout: 60_000 });

/** A geometria da página, a mesma do desenho (`proposal-doc-pdf.ts`). */
const W = 841.89;
const H = 595.28;
const M = 68;
/** O rodapé é o elemento mais baixo de uma página (`M - 26`). */
const CHAO_DO_RODAPE = M - 27;

/**
 * A folga com que se compara.
 *
 * Meio ponto — um vigésimo de milímetro. Não é para dar licença a nada: é para
 * a soma das larguras dos glifos não acusar um transbordo por causa do último
 * bit de um `double` numa linha que acaba exactamente na margem.
 */
const FOLGA = 0.5;

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  corpo: number;
  /** A largura REAL, medida com a fonte com que foi desenhada. É isto que diz
   *  onde a linha ACABA, que é o que nenhum outro teste olhava. */
  largura: number;
}

interface Caixa {
  pagina: number;
  x: number;
  y: number;
  largura: number;
  altura: number;
}

interface Transbordo {
  /** «capa» ou «conteúdo» — a capa tem regras próprias (ver abaixo). */
  onde: string;
  texto: string;
  porque: string;
  quanto: number;
}

/** Desenha o documento e devolve tudo o que foi escrito e todas as fotos. */
async function desenhoDe(
  doc: ProposalDoc,
  idioma: IdiomaDaProposta,
): Promise<{ escritas: Escrita[]; imagens: Caixa[]; paginas: number }> {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const imagens: Caixa[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawTextOriginal = PDFPage.prototype.drawText;
  const drawImageOriginal = PDFPage.prototype.drawImage;

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
      corpo,
      largura: fonte ? fonte.widthOfTextAtSize(String(texto), corpo) : 0,
    });
    return drawTextOriginal.call(this, texto, opts);
  };
  PDFPage.prototype.drawImage = function (
    imagem: PDFImage,
    opts?: Parameters<typeof drawImageOriginal>[1],
  ) {
    imagens.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      largura: opts?.width ?? 0,
      altura: opts?.height ?? 0,
    });
    return drawImageOriginal.call(this, imagem, opts);
  };

  try {
    await renderProposalDocPdf(doc, idioma);
    return { escritas, imagens, paginas: paginas.length };
  } finally {
    PDFDocument.prototype.addPage = addPageOriginal;
    PDFPage.prototype.drawText = drawTextOriginal;
    PDFPage.prototype.drawImage = drawImageOriginal;
  }
}

/**
 * ── UMA LINHA É O QUE SE LÊ, NÃO O QUE SE CHAMA ───────────────────────────
 *
 * Os textos espaçados do documento — os «olhos» (LÍQUEN EVENTS, INSPIRAÇÃO) e
 * a linha do tipo/data da capa — são desenhados GLIFO A GLIFO, um `drawText`
 * por letra com um `tracking` de 1,4 a 3,2 pt entre eles. Sem juntar isso de
 * volta, um transbordo de uma frase inteira aparecia aqui como trinta e três
 * achados de uma letra cada, e nenhum deles se conseguia nomear.
 *
 * Junta-se o que está na MESMA página, à MESMA altura, com menos de quatro
 * pontos de intervalo — folgado para o maior tracking do documento (3,2) e
 * apertado para os doze pontos que separam o nome de uma rubrica do seu preço,
 * que são duas coisas e têm de continuar a ser duas.
 */
function linhasDe(escritas: Escrita[]): Escrita[] {
  const ordenadas = [...escritas].sort((a, b) => a.pagina - b.pagina || b.y - a.y || a.x - b.x);
  const juntas: Escrita[] = [];
  for (const e of ordenadas) {
    const anterior = juntas[juntas.length - 1];
    const colada =
      anterior &&
      anterior.pagina === e.pagina &&
      Math.abs(anterior.y - e.y) < 0.6 &&
      e.x >= anterior.x &&
      e.x <= anterior.x + anterior.largura + 4;
    if (!colada) {
      juntas.push({ ...e });
      continue;
    }
    anterior.texto += e.texto;
    anterior.largura = e.x + e.largura - anterior.x;
    anterior.corpo = Math.max(anterior.corpo, e.corpo);
  }
  return juntas;
}

/**
 * A caixa de uma linha de texto.
 *
 * O `y` de um `drawText` é a LINHA DE BASE, não o fundo da caixa. Uma altura
 * de `0,8 × corpo` acima e `0,25 × corpo` abaixo é a proporção normal de uma
 * face de texto e chega para o que aqui se pergunta — se uma linha cai por
 * cima de uma fotografia. Não se usa para as margens, que são medidas em `x`.
 */
function caixaDaEscrita(e: Escrita) {
  return {
    x0: e.x,
    x1: e.x + e.largura,
    y0: e.y - e.corpo * 0.25,
    y1: e.y + e.corpo * 0.8,
  };
}

/**
 * Todos os transbordos de um documento.
 *
 * Três perguntas, e a primeira é a que não tem excepções em página nenhuma:
 *
 *  1. **O PAPEL.** Nada é desenhado para fora da folha — de nenhum lado, em
 *     nenhuma página. Uma linha que passa o papel não é uma questão de gosto:
 *     é texto que ninguém vai ler, nem no ecrã nem impresso.
 *  2. **A MARGEM**, nas páginas de conteúdo. A capa e a contracapa ficam de
 *     fora: são desenhadas a sangrar de propósito (painel escuro de topo a
 *     fundo, fotografias encostadas ao corte) e o texto delas é centrado no
 *     painel, não na mancha.
 *  3. **POR CIMA DE UMA FOTOGRAFIA.** Onde há foto, o texto é ilegível — e é
 *     o defeito mais feio do relatório, porque acontece na primeira página.
 */
function transbordosDe(
  d: { escritas: Escrita[]; imagens: Caixa[]; paginas: number },
  paginasDeCapa: Set<number>,
): Transbordo[] {
  const achados: Transbordo[] = [];
  for (const e of linhasDe(d.escritas)) {
    if (!e.texto.trim()) continue;
    const capa = paginasDeCapa.has(e.pagina);
    const onde = capa ? "capa" : "conteúdo";
    const b = caixaDaEscrita(e);

    // 1. O papel.
    if (b.x1 > W + FOLGA) {
      achados.push({ onde, texto: e.texto, porque: "sai pela direita do PAPEL", quanto: b.x1 - W });
    } else if (!capa && b.x1 > W - M + FOLGA) {
      // 2. A margem (só nas páginas de conteúdo).
      achados.push({
        onde,
        texto: e.texto,
        porque: "acaba para lá da margem direita",
        quanto: b.x1 - (W - M),
      });
    }
    if (b.x0 < -FOLGA) {
      achados.push({ onde, texto: e.texto, porque: "sai pela esquerda do PAPEL", quanto: -b.x0 });
    } else if (!capa && b.x0 < M - FOLGA) {
      achados.push({
        onde,
        texto: e.texto,
        porque: "começa antes da margem esquerda",
        quanto: M - b.x0,
      });
    }
    if (!capa && e.y < CHAO_DO_RODAPE) {
      achados.push({
        onde,
        texto: e.texto,
        porque: "é desenhado por baixo do rodapé",
        quanto: CHAO_DO_RODAPE - e.y,
      });
    }
    if (e.y > H + FOLGA || e.y < -FOLGA) {
      achados.push({
        onde,
        texto: e.texto,
        porque: "sai por cima ou por baixo do PAPEL",
        quanto: 0,
      });
    }

    // 3. Por cima de uma fotografia.
    for (const im of d.imagens) {
      if (im.pagina !== e.pagina) continue;
      // O logótipo é uma imagem como as outras e assenta sobre cor chapada —
      // não é uma fotografia, e o texto nunca lhe cai em cima (é desenhado
      // ao lado). Distingue-se pelo tamanho: as fotografias desta folha têm
      // sempre mais de 120 pt de lado.
      if (im.largura < 120 || im.altura < 120) continue;
      if (
        b.x0 < im.x + im.largura - FOLGA &&
        b.x1 > im.x + FOLGA &&
        b.y0 < im.y + im.altura - FOLGA &&
        b.y1 > im.y + FOLGA
      ) {
        achados.push({
          onde,
          texto: e.texto,
          porque: "é desenhado POR CIMA de uma fotografia",
          quanto: 0,
        });
        break;
      }
    }
  }
  return achados;
}

/** As fotos maiores do repositório — as mesmas ordens de grandeza das dela. */
function fotos(quantas: number): string[] {
  const dir = path.join(process.cwd(), "public", "imagens");
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|JPG)$/.test(f))
    .map((f) => ({ nome: f, bytes: statSync(path.join(dir, f)).size }))
    .sort((a, b) => b.bytes - a.bytes)
    .slice(0, quantas)
    .map(
      (f) => `data:image/jpeg;base64,${readFileSync(path.join(dir, f.nome)).toString("base64")}`,
    );
}

const FOTOS = fotos(4);

const base = {
  template: "decoracao" as const,
  ref: "PO Decoração Casamento Maria & Zé 12.09.2026",
  clientNames: "Maria & Zé",
  eventType: "Casamento",
  eventDate: "12 de setembro de 2026",
  location: "Monte da Oliveirinha, Évora",
  guests: "80 pax",
  ceremony: "Civil, simbólica",
  time: "16h00",
  servico: "Decor e decoração Floral",
  totalLabel: "Valor Total Decoração",
};

const grupo = (letra: string, titulo: string, n: number) => ({
  letter: letra,
  title: titulo,
  items: Array.from({ length: n }, (_, i) => ({
    label: ["Cerimónia", "Copo d'água", "Jantar", "Espaço", "Mesa dos noivos"][i % 5],
    desc: "Arco floral com flor natural da época, passadeira com pétalas, e composições baixas nas mesas de apoio ao serviço.",
  })),
});

/** Uma proposta com a forma das verdadeiras. */
const curta = () =>
  withProposalDefaults({
    ...base,
    coverImages: [FOTOS[0], FOTOS[1]],
    serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 3)],
    moodBoards: [{ title: "Decoração Cerimónia", images: [FOTOS[2], FOTOS[3]] }],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
    budgetAmounts: [1800, 1400, 1600],
    budgetExtras: [
      { label: "Deslocação da equipa Líquen", valueText: "896,00 €" },
      { label: "Wedding Coordinator", valueText: "895,00 € + IVA" },
    ],
    totalText: "4800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer" as const,
  } as Parameters<typeof withProposalDefaults>[0]);

/** A mesma proposta com valores de seis dígitos e rubricas compridas — é onde
 *  a coluna da direita e a do nome se disputam a largura. */
const numerosGrandes = () =>
  withProposalDefaults({
    ...base,
    coverImages: ["", ""],
    serviceGroups: [grupo("a)", "Decoração Floral de Casamento", 5)],
    moodBoards: [],
    budgetItems: [
      "Decoração Floral da Cerimónia ao pôr do sol junto ao lago, com passadeira e composições laterais",
      "Decor Copo d'água",
    ],
    budgetAmounts: [1_500_000, 33_893.5],
    budgetExtras: [
      { label: "Deslocação da equipa Líquen (ida e volta, 3 carrinhas)", valueText: "12.550,00 €" },
      { label: "Wedding Coordinator", valueText: "18.900,00 € + IVA" },
    ],
    budgetExtrasSomam: true,
    totalText: "1533893,50 € + IVA",
    totalAmount: 1_533_893.5,
    totalVatMode: "acrescer" as const,
  } as Parameters<typeof withProposalDefaults>[0]);

/** O modelo de Organização: cronograma e coluna de preços por linha. */
const organizacao = () =>
  withProposalDefaults({
    ...base,
    template: "organizacao" as const,
    ref: "Organização Casamento Rita & Tomás",
    clientNames: "Rita & Tomás",
    coverImages: ["", ""],
    serviceGroups: [grupo("a)", "Coordenação e Planeamento", 3)],
    moodBoards: [],
    budgetItems: [],
    budgetRows: [
      { item: "Planeamento integral", price: "7.890,00 €" },
      {
        item: "Coordenação integral do dia do casamento, com equipa no local desde a montagem",
        price: "12.500,00 € + IVA (a confirmar)",
      },
    ],
    // O modelo de Organização escreve o total no `totalEstimatedText`; o
    // `totalText` fica vazio, como no estúdio.
    totalText: "",
    totalEstimatedText: "20.390,00 €",
    totalAmount: 20390,
    totalVatMode: "acrescer" as const,
  } as Parameters<typeof withProposalDefaults>[0]);

/**
 * O documento dos casos-limite — nomes, local e títulos no comprimento em que
 * o relatório os mediu. É este que acende os {@link CONHECIDOS}.
 */
const limites = () =>
  withProposalDefaults({
    ...base,
    ref: "PO Decoração Casamento Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard 12.09.2026",
    clientNames: "Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard",
    location:
      "Herdade da Fonte Santa de Vale de Água, Estrada Nacional 380, Reguengos de Monsaraz, Alentejo Central, Portugal",
    eventType: "Casamento civil com cerimónia simbólica ao pôr do sol no lago",
    guests: "180 pax (140 adultos, 25 crianças, 15 fornecedores)",
    coverImages: [FOTOS[0], FOTOS[1]],
    serviceGroups: [
      grupo("a)", "Decoração Floral de Casamento — Cerimónia, Copo d'Água e Jantar", 2),
    ],
    moodBoards: [
      {
        title: "Decoração Floral Integral da Cerimónia, do Copo d'Água e do Jantar da Herdade",
        subtitulo: "Ramo de Noiva (a definir com a Noiva) — inclui alfazema e olival",
        images: [FOTOS[2], FOTOS[3]],
        annotation:
          "A paleta segue os tons de creme, verde-oliva e terracota que a Maria escolheu na primeira reunião; as flores em destaque podem variar consoante a época e a disponibilidade do mercado no dia da montagem.",
      },
    ],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'água"],
    budgetAmounts: [7400, 2100],
    totalText: "9500,00 € + IVA",
    totalAmount: 9500,
    totalVatMode: "acrescer" as const,
  } as Parameters<typeof withProposalDefaults>[0]);

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRANSBORDOS QUE JÁ EXISTEM, UM A UM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto NÃO é uma lista de coisas aceites: é a fotografia do que estava mal no
 * dia em que esta sonda nasceu, para ela poder entrar sem esperar pelas
 * correcções — que vivem todas na composição (`proposal-doc-pdf.ts`) e são
 * outra frente de trabalho.
 *
 * O que a lista garante é o essencial: nenhum transbordo NOVO passa. Cada
 * entrada sai daqui quando a composição a corrigir, e a partir desse dia o
 * defeito não pode voltar sem que este ficheiro fique vermelho.
 *
 * · **D2** — o tipo de evento, a data e o local são escritos no painel da capa
 *   centrados, SEM largura máxima e sem quebra, e escorrem para os dois lados
 *   por cima das fotografias. Correcção: A2 do relatório (a mesma regra de
 *   largura que o nome do casal já tem).
 * · **D3** — o título e o subtítulo de um mood board são desenhados a 24 pt sem
 *   quebra e sem encolhimento; com 124 caracteres passam a margem E o papel.
 *   Correcção: A3 do relatório.
 */
const CONHECIDOS: { porque: string; onde: string; comeca: string; defeito: string }[] = [
  {
    defeito: "D2 — o tipo/data da capa, centrado sem largura máxima",
    porque: "é desenhado POR CIMA de uma fotografia",
    onde: "capa",
    comeca: "Casamento civil",
  },
  {
    defeito: "D2 — o local da capa, centrado sem largura máxima",
    porque: "é desenhado POR CIMA de uma fotografia",
    onde: "capa",
    comeca: "Herdade da Fonte Santa",
  },
  {
    defeito: "D3 — o título do mood board, a 24 pt sem quebra",
    porque: "sai pela direita do PAPEL",
    onde: "conteúdo",
    comeca: "Decoração Floral Integral",
  },
];

const conhecido = (t: Transbordo) =>
  CONHECIDOS.some(
    (c) => c.porque === t.porque && c.onde === t.onde && t.texto.startsWith(c.comeca),
  );

const emPalavras = (t: Transbordo) =>
  `[${t.onde}] «${t.texto.slice(0, 60)}» ${t.porque}${t.quanto > 0 ? ` (${t.quanto.toFixed(1)} pt)` : ""}`;

describe("nada é desenhado fora do papel, da mancha, nem por cima de uma foto", () => {
  /** A capa é a página 0; a contracapa é a última. As duas sangram. */
  const capasDe = (paginas: number) => new Set([0, paginas - 1]);

  for (const [nome, fabricar, idioma] of [
    ["uma proposta como as verdadeiras", curta, "pt"],
    ["a mesma, em inglês", curta, "en"],
    ["valores de sete dígitos e rubricas compridas", numerosGrandes, "pt"],
    ["o modelo de Organização", organizacao, "pt"],
    ["o modelo de Organização, em inglês", organizacao, "en"],
  ] as const) {
    it(`${nome} sai inteira dentro da mancha`, async () => {
      const d = await desenhoDe(fabricar(), idioma);
      const achados = transbordosDe(d, capasDe(d.paginas));
      expect(achados.map(emPalavras), "transbordos").toEqual([]);
    });
  }

  /**
   * O documento dos casos-limite. Aqui a exigência é outra e é a que permite a
   * sonda existir hoje: nada de NOVO. Os conhecidos estão escritos em
   * {@link CONHECIDOS} com o defeito e a correcção que os apaga.
   */
  it("nos casos-limite, nenhum transbordo NOVO — só os que já estavam escritos", async () => {
    const d = await desenhoDe(limites(), "pt");
    const novos = transbordosDe(d, capasDe(d.paginas)).filter((t) => !conhecido(t));
    expect(novos.map(emPalavras), "transbordos que ainda não estavam na lista").toEqual([]);
  });

  /**
   * ── E A LISTA NÃO PODE MENTIR ──────────────────────────────────────────
   *
   * Uma entrada que já não acontece é pior do que nenhuma: fica ali a dar
   * licença a um defeito que já foi corrigido, e no dia em que ele voltar o
   * teste cala-se. Por isso cada entrada tem de continuar a acontecer — e este
   * teste é o que avisa, no dia da correcção, que ela pode sair daqui.
   *
   * Se este teste ficar vermelho, é uma BOA notícia: o transbordo que ele nomeia
   * foi corrigido na composição. A acção é apagar essa entrada de
   * {@link CONHECIDOS}, e a partir daí o defeito não pode voltar em silêncio.
   */
  it("cada transbordo conhecido ou ainda acontece, ou já pode sair da lista", async () => {
    const d = await desenhoDe(limites(), "pt");
    const achados = transbordosDe(d, capasDe(d.paginas));
    const corrigidos = CONHECIDOS.filter(
      (c) =>
        !achados.some(
          (t) => t.porque === c.porque && t.onde === c.onde && t.texto.startsWith(c.comeca),
        ),
    );
    expect(
      corrigidos.map((c) => `${c.defeito} — já não acontece: apague-o de CONHECIDOS`),
      "entradas de CONHECIDOS que já não correspondem a nada",
    ).toEqual([]);
  });

  /**
   * A sonda tem de conseguir VER um transbordo — senão o verde de cima não
   * quer dizer nada. Desenha-se uma linha propositadamente para fora e
   * exige-se que ela apareça.
   */
  it("a sonda apanha mesmo um transbordo (a rede é verificada)", () => {
    const escrita: Escrita = {
      pagina: 1,
      x: 700,
      y: 300,
      texto: "uma linha que passa o papel",
      corpo: 24,
      largura: 200,
    };
    const achados = transbordosDe(
      { escritas: [escrita], imagens: [], paginas: 3 },
      new Set([0, 2]),
    );
    expect(achados.map((t) => t.porque)).toContain("sai pela direita do PAPEL");
  });
});
