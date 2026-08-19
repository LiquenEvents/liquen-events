import { describe, it, expect, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdf, renderProposalDocPdfWithReport } from "./proposal-doc-pdf";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { SITE } from "./site";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COMPOSIÇÃO — O QUE SE VÊ NA FOLHA, MEDIDO NA FOLHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro prende os defeitos de COMPOSIÇÃO que o relatório `IDEIAS-PDF.md`
 * mediu num lote de dezasseis PDFs gerados a sério: texto desenhado por cima
 * das fotografias da capa, um título de mood board 74,3 pontos FORA do papel,
 * um nome de casal cortado a acabar num «&», uma rubrica de orçamento órfã na
 * folha seguinte por quatro pontos, e uma ressalva sobre dinheiro deitada fora.
 *
 * Nenhum deles era apanhado pela suite: não são regressões, são buracos.
 *
 * ── COMO SE MEDE ──────────────────────────────────────────────────────────
 * Como no `proposal-doc-pdf.paginacao.test.ts`: grava-se o que o desenho PEDE
 * — cada `drawText` com a sua página, o seu `x`, o seu `y` e o seu tamanho —,
 * porque as fontes vão embutidas em subconjunto e os bytes do ficheiro deixam
 * de ser legíveis. A LARGURA de cada linha calcula-se com a mesma fonte com que
 * foi desenhada, que é o que permite dizer «isto acaba fora do papel».
 */

vi.setConfig({ testTimeout: 30_000 });

const M = 68;
const W = 841.89;
const H = 595.28;

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
  /** A largura a que a linha foi MESMO desenhada — medida com a fonte dela. */
  largura: number;
  tamanho: number;
}

function instrumentar() {
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
    const s = String(texto);
    const tamanho = opts?.size ?? 10;
    let largura = 0;
    try {
      largura = opts?.font?.widthOfTextAtSize(s, tamanho) ?? 0;
    } catch {
      largura = 0;
    }
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: s,
      largura,
      tamanho,
    });
    return drawTextOriginal.call(this, texto, opts);
  };

  return {
    escritas,
    restaurar() {
      PDFDocument.prototype.addPage = addPageOriginal;
      PDFPage.prototype.drawText = drawTextOriginal;
    },
  };
}

async function desenhar(doc: ProposalDoc, idioma?: "pt" | "en"): Promise<Escrita[]> {
  const espia = instrumentar();
  try {
    if (idioma) await renderProposalDocPdf(doc, idioma);
    else await renderProposalDocPdf(doc);
  } finally {
    espia.restaurar();
  }
  return espia.escritas;
}

/** Uma proposta de decoração normal, com capa, mood board e quadro. */
function proposta(over: Record<string, unknown> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Monte da Oliveirinha, Évora",
    guests: "80 pax",
    serviceGroups: [],
    moodBoards: [],
    coverImages: [],
    budgetItems: ["Decor Cerimónia", "Decor Copo d'água", "Decor Jantar"],
    totalLabel: "Valor Total Decoração",
    totalText: "4.800,00 € + IVA",
    totalAmount: 4800,
    totalVatMode: "acrescer" as const,
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/**
 * Uma fotografia mínima, para a capa ter as duas tiras e o painel escuro
 * existir. PNG de 2×2 escrito à mão — o desenho só precisa de bytes que o
 * `pdf-lib` saiba embutir.
 */
const FOTO =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEklEQVR4nGP8//8/AzJgYkAFhPgAZfIDPXf2ZL4AAAAASUVORK5CYII=";

/* ═══════════════════════════════════════════════════════════════════════════
   A CAPA — A PRIMEIRA COISA QUE O CLIENTE VÊ
   ═══════════════════════════════════════════════════════════════════════════

   Medido no relatório, com um nome de 61 caracteres e um local por extenso:

     · a capa imprimia «Maria da Conceição / Gonçalves Ançã &» — o noivo
       desaparecia e a folha acabava num «&»;
     · a linha do tipo/data ia de x=155,6 a x=686,3 e a do local de 162 a 679,9,
       as duas por cima das fotografias, num painel que tem 286 pontos.

   O painel escuro vai de `(W − W×0,34)/2` a `(W + W×0,34)/2`. Como TUDO o que
   a capa escreve é centrado na folha, basta olhar para o `x` de cada escrita:
   se o lado esquerdo cabe, o direito cabe por simetria. */

const NOME_COMPRIDO = "Maria da Conceição Gonçalves Ançã & Jean-François Ålström-Nørgaard";
const PAINEL_ESQUERDO = (W - W * 0.34) / 2;

/** Só o que a capa escreve — a página 0, e sem o rodapé (que ela não tem). */
async function daCapa(over: Record<string, unknown> = {}): Promise<Escrita[]> {
  const escritas = await desenhar(
    proposta({ coverImages: [FOTO, FOTO], clientNames: NOME_COMPRIDO, ...over }),
  );
  return escritas.filter((e) => e.pagina === 0);
}

describe("a capa", () => {
  it("escreve o nome do casal INTEIRO — e nunca acaba num «&»", async () => {
    const escritas = await daCapa();
    const nome = escritas
      .filter((e) => e.tamanho >= 18 && e.y > 200 && e.y < 320)
      .map((e) => e.texto);
    expect(nome.length, "a capa não escreveu o nome").toBeGreaterThan(0);
    expect(nome.join(" ")).toContain("Jean-François");
    for (const linha of nome) {
      expect(linha.trim().endsWith("&"), `a linha «${linha}» acaba num «&»`).toBe(false);
    }
  });

  it("não escreve nada por cima das fotografias — tudo dentro do painel", async () => {
    const escritas = await daCapa({
      eventType: "Casamento civil com cerimónia simbólica ao pôr do sol no lago",
      location:
        "Herdade da Fonte Santa de Vale de Água, Estrada Nacional 380," +
        " Reguengos de Monsaraz, Alentejo Central, Portugal",
    });
    for (const e of escritas) {
      expect(
        e.x,
        `«${e.texto}» começa em x=${e.x.toFixed(1)}, fora do painel (${PAINEL_ESQUERDO.toFixed(1)})`,
      ).toBeGreaterThanOrEqual(PAINEL_ESQUERDO);
    }
  });

  /**
   * O «   ·   » largo entre o tipo e a data é dela, e a quebra come-o (o `wrap`
   * parte por espaços e volta a juntar com um só). A linha que já cabia tem de
   * sair TAL E QUAL — encolher e quebrar é o caminho de excepção.
   */
  it("a linha que já cabia sai exactamente como era", async () => {
    const escritas = await desenhar(proposta({ coverImages: [FOTO, FOTO] }));
    const daPrimeira = escritas.filter((e) => e.pagina === 0).map((e) => e.texto);
    expect(daPrimeira).toContain("Casamento   ·   12 de setembro de 2026");
    expect(daPrimeira).toContain("Monte da Oliveirinha, Évora");
  });

  /** O que ainda assim não couber é anotado — o estúdio tem de saber. */
  it("o que não couber continua a ser anotado no relatório", async () => {
    const { truncations } = await renderProposalDocPdfWithReport(
      proposta({
        coverImages: [FOTO, FOTO],
        clientNames: `${NOME_COMPRIDO} ${NOME_COMPRIDO} ${NOME_COMPRIDO}`,
      }),
    );
    expect(truncations.some((t) => t.where.includes("Nome na capa"))).toBe(true);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   A PÁGINA DE INSPIRAÇÃO
   ═══════════════════════════════════════════════════════════════════════════ */

const TITULO_ENORME =
  "Decoração Floral Integral da Cerimónia, do Copo d'Água, do Jantar e da Festa" +
  " com Flor Natural da Época Colhida no Próprio Dia";

describe("o cabeçalho de um mood board", () => {
  /**
   * Medido pela sonda de transbordos: o título era desenhado a 24 numa linha
   * só, sem medida e sem quebra, e acabava em x=848,2 — 74,3 pontos para lá da
   * margem, e SEIS pontos para lá do papel (a folha tem 841,89).
   */
  it("nunca sai do papel — nem do lado direito da mancha", async () => {
    const escritas = await desenhar(
      proposta({
        moodBoards: [
          {
            title: TITULO_ENORME,
            subtitulo:
              "Ramo de Noiva (a definir com a Noiva), com alfazema, olival," +
              " eucalipto cinerea e rosa de jardim colhida na manhã do evento",
            images: [FOTO, FOTO],
            layout: "filas",
          },
        ],
      }),
    );
    for (const e of escritas) {
      expect(e.x + e.largura, `«${e.texto}» acaba em x=${(e.x + e.largura).toFixed(1)}`).toBeLessThanOrEqual(W - M + 0.5);
    }
  });

  /**
   * E não é só não transbordar: o cabeçalho tem de ficar ACIMA da primeira fila
   * de fotografias — a banda entre o sobretítulo e as fotos é o que ele tem.
   */
  it("fica na banda entre o sobretítulo e as fotografias", async () => {
    const escritas = await desenhar(
      proposta({
        moodBoards: [{ title: TITULO_ENORME, images: [FOTO, FOTO], layout: "filas" }],
      }),
    );
    // A página do mood board é a que tem o sobretítulo «INSPIRAÇÃO».
    const pagina = escritas.find((e) => e.texto === "INSPIRAÇÃO")?.pagina;
    expect(pagina, "não se encontrou a página de inspiração").toBeTypeOf("number");
    const doTitulo = escritas.filter((e) => e.pagina === pagina && e.tamanho >= 12);
    expect(doTitulo.length).toBeGreaterThan(0);
    // TOPO_DAS_FOTOS = H − M − 112. Nada do cabeçalho desce até lá.
    for (const e of doTitulo) expect(e.y).toBeGreaterThanOrEqual(H - M - 112);
  });

  /** O título que já cabia continua exactamente onde estava — a miniatura do
   *  estúdio lê as mesmas linhas de base. */
  it("um título normal não se mexe um ponto", async () => {
    const escritas = await desenhar(
      proposta({
        moodBoards: [
          { title: "Cerimónia", subtitulo: "Ramo de Noiva", images: [FOTO], layout: "filas" },
        ],
      }),
    );
    expect(escritas.find((e) => e.texto === "Cerimónia" && e.tamanho === 24)?.y).toBeCloseTo(
      H - M - 76,
      3,
    );
    expect(escritas.find((e) => e.texto === "Ramo de Noiva")?.y).toBeCloseTo(H - M - 96, 3);
  });
});

describe("a legenda de um mood board", () => {
  /**
   * Com dez linhas escritas saíam cinco, e a última acabava em «… ao casal.
   * Linha» — a meio da frase, sem sinal nenhum de que faltava texto.
   */
  it("quando é cortada, di-lo com «…»", async () => {
    const legenda = Array.from(
      { length: 12 },
      (_, i) =>
        `Linha número ${i + 1} da descrição desta página de inspiração, escrita com o` +
        " comprimento que ela costuma escrever quando quer explicar a paleta ao casal.",
    ).join(" ");
    const escritas = await desenhar(
      proposta({ moodBoards: [{ title: "Paleta", annotation: legenda, images: [FOTO], layout: "filas" }] }),
    );
    const daLegenda = escritas.filter((e) => e.tamanho === 11 && e.texto.length > 20);
    expect(daLegenda.length, "não se encontrou a legenda").toBeGreaterThan(0);
    const ultima = daLegenda.reduce((a, b) => (b.y < a.y ? b : a));
    expect(ultima.texto.endsWith("…"), `a última linha acaba em «${ultima.texto.slice(-24)}»`).toBe(
      true,
    );
  });

  /** E a medida é a do documento (550), e não a folha toda (706). */
  it("não corre a folha de margem a margem", async () => {
    const escritas = await desenhar(
      proposta({
        moodBoards: [
          {
            title: "Paleta",
            annotation:
              "Verdes suaves, brancos quebrados e um toque de terracotta nas velas e nos" +
              " têxteis da mesa, com alfazema e olival colhidos na manhã do evento e um" +
              " ramo de rosa de jardim para a noiva.",
            images: [FOTO],
            layout: "filas",
          },
        ],
      }),
    );
    const daLegenda = escritas.filter((e) => e.tamanho === 11 && e.texto.length > 20);
    expect(daLegenda.length).toBeGreaterThan(1);
    for (const e of daLegenda) expect(e.largura).toBeLessThanOrEqual(550);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   O ACABAMENTO DO DOCUMENTO
   ═══════════════════════════════════════════════════════════════════════════ */

describe("as propriedades do documento", () => {
  /**
   * O autor do ficheiro era «pdf-lib» — a biblioteca que o desenha. É o que
   * aparece nas propriedades do documento, no gestor de ficheiros e no
   * separador do browser de quem abre o anexo.
   */
  it("dizem quem fez a proposta e sobre quem ela é — e não a biblioteca", async () => {
    const bytes = await renderProposalDocPdf(proposta());
    // `updateMetadata: false` é obrigatório para LER: a pdf-lib reescreve o
    // «Producer» com o nome dela própria a cada `load`, e sem isto o teste
    // media a leitura em vez do ficheiro.
    const lido = await PDFDocument.load(bytes, { updateMetadata: false });
    expect(lido.getAuthor()).toBe(SITE.name);
    expect(lido.getProducer()).toBe(SITE.name);
    expect(lido.getCreator()).toBe(SITE.name);
    expect(lido.getTitle()).toContain("Maria & Zé");
    expect(lido.getSubject()).toContain("Monte da Oliveirinha");
    expect(lido.getKeywords()).toContain(SITE.name);
  });

  /** A língua do documento é a língua em que ele foi escrito. */
  it("dizem a língua do documento", async () => {
    const pt = await PDFDocument.load(await renderProposalDocPdf(proposta()));
    const en = await PDFDocument.load(await renderProposalDocPdf(proposta(), "en"));
    expect(pt.catalog.get(pt.catalog.context.obj("Lang"))?.toString()).toContain("pt-PT");
    expect(en.catalog.get(en.catalog.context.obj("Lang"))?.toString()).toContain("en-GB");
  });
});

describe("o rodapé", () => {
  /**
   * Escrevia «01». Quem imprime não sabe se recebeu o documento todo — falta o
   * denominador, e o denominador só se sabe no fim (ver a segunda passagem).
   */
  it("diz em que folha se está E quantas há", async () => {
    const escritas = await desenhar(proposta());
    const folhas = escritas.filter((e) => /^\d\d de \d\d$/.test(e.texto));
    expect(folhas.length, "nenhuma folha diz «NN de NN»").toBeGreaterThan(0);
    const total = folhas[0].texto.split(" de ")[1];
    // O denominador é o mesmo em todas as folhas, e é o número de folhas do
    // documento — contado a partir da capa, que é como se conta na mão.
    for (const f of folhas) expect(f.texto.endsWith(` de ${total}`)).toBe(true);
    const doc = await PDFDocument.load(await renderProposalDocPdf(proposta()));
    expect(Number(total)).toBe(doc.getPageCount());
  });

  it("numa proposta inglesa diz «of», e não «de»", async () => {
    const escritas = await desenhar(proposta(), "en");
    expect(escritas.some((e) => /^\d\d of \d\d$/.test(e.texto))).toBe(true);
    expect(escritas.some((e) => /^\d\d de \d\d$/.test(e.texto))).toBe(false);
  });
});

describe("o texto espaçado", () => {
  /**
   * «LÍQUEN EVENTS» e «INSPIRAÇÃO» eram desenhados GLIFO A GLIFO — treze
   * operadores de texto por palavra, em todas as páginas. Passam a ser uma
   * corrida de texto com o espaçamento do PDF (`Tc`).
   */
  it("é uma escrita só, e não uma letra de cada vez", async () => {
    const escritas = await desenhar(
      proposta({ moodBoards: [{ title: "Cerimónia", images: [], layout: "filas" }] }),
    );
    expect(escritas.some((e) => e.texto === "LÍQUEN EVENTS")).toBe(true);
    // E não há nenhuma escrita de uma letra só a fazer de palavra.
    const soltas = escritas.filter((e) => [...e.texto].length === 1 && /\p{L}/u.test(e.texto));
    expect(soltas.map((e) => e.texto)).toEqual([]);
  });
});
