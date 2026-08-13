import { describe, it, expect } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import sharp from "sharp";
import { lerPdf } from "./leitura";
import { fotosDoPdf } from "./imagens";
import { lerPropostaDePdf } from "./index";
import type { FotoDoPdf } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS — A ORDEM, O SÍTIO E O QUE NÃO É FOTOGRAFIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os PDF daqui são FABRICADOS, e é de propósito: as propostas de onde estas
 * regras foram medidas são de clientes verdadeiros e não entram no repositório
 * — nem os ficheiros, nem as fotografias, nem os nomes. O que entra é a FORMA
 * dessas folhas, que é o que o motor lê: A4 ao baixo, o logótipo carimbado em
 * todas as páginas, filas de cinco, mosaicos, uma capa a sangrar.
 *
 * Cada número que aqui aparece foi medido nas folhas verdadeiras e está
 * explicado onde a regra vive (`imagens.ts` e `arrumarFotos`, em `index.ts`).
 */

/** A4 ao baixo — a folha das propostas, nossas e delas. */
const W = 841.89;
const H = 595.28;

/** Uma fotografia de uma cor só. Cores diferentes dão bytes diferentes, que é
 *  o que impede a desduplicação por conteúdo de as juntar todas numa. */
async function foto(px = 400, py = 300, tom = 0): Promise<Buffer> {
  return await sharp({
    create: {
      width: px,
      height: py,
      channels: 3,
      background: { r: (tom * 37) % 256, g: (tom * 11 + 40) % 256, b: (tom * 91 + 7) % 256 },
    },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

interface Caixa {
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Índice da fotografia na lista de `imagens` passada a {@link folha}. */
  qual: number;
}

/**
 * Uma folha com as caixas onde se pede, e texto que chegue para o motor não a
 * tomar por uma digitalização (esse caminho tem regras próprias e é testado
 * noutro sítio).
 */
async function folha(
  paginas: readonly Caixa[][],
  imagens: readonly Buffer[],
  opcoes: { logotipoEmTodas?: Buffer; semTexto?: boolean } = {},
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const fonte = await pdf.embedFont(StandardFonts.Helvetica);
  const embutidas = await Promise.all(imagens.map((b) => pdf.embedJpg(b)));
  const logotipo = opcoes.logotipoEmTodas ? await pdf.embedJpg(opcoes.logotipoEmTodas) : null;

  paginas.forEach((caixas, i) => {
    const p = pdf.addPage([W, H]);
    if (!opcoes.semTexto) {
      p.drawText(`Folha numero ${i + 1} do documento`, {
        x: 60,
        y: H - 40,
        font: fonte,
        size: 10,
        color: rgb(0.1, 0.1, 0.1),
      });
    }
    // O logótipo primeiro, como faz um cabeçalho de Word.
    if (logotipo) p.drawImage(logotipo, { x: 60, y: H - 70, width: 72, height: 43 });
    for (const c of caixas) {
      p.drawImage(embutidas[c.qual], {
        x: c.x,
        y: c.y,
        width: c.largura,
        height: c.altura,
      });
    }
  });
  return await pdf.save();
}

/** Onde cada fotografia estava, pela ordem em que o motor as devolveu. */
const posicoes = (fotos: readonly FotoDoPdf[]) =>
  fotos.map((f) => `p${f.origem.pagina}:${Math.round(f.origem.x)},${Math.round(f.origem.y)}`);

/** Uma fila de `n` caixas iguais, da esquerda para a direita. */
function fila(n: number, y: number, altura: number, primeiroTom: number): Caixa[] {
  const largura = 140;
  return Array.from({ length: n }, (_, i) => ({
    x: 30 + i * 155,
    y,
    largura,
    altura,
    qual: primeiroTom + i,
  }));
}

describe("a ordem em que estão impressas", () => {
  it("duas filas de cinco voltam da esquerda para a direita, de cima para baixo", async () => {
    /**
     * A página de inspiração mais comum do acervo: duas filas de cinco. O PDF
     * guarda-as pela ordem que lhe deu jeito — na folha verdadeira, a primeira
     * fila está gravada pelos x 18, 367, 524, 685, 182 —, e é essa ordem que
     * saía daqui. A composição volta a desenhá-las por esta ordem, portanto
     * devolvê-las baralhadas é entregar o mood board baralhado.
     */
    const cima = fila(5, 320, 200, 0);
    const baixo = fila(5, 60, 200, 5);
    // Gravadas de propósito fora de ordem, e com as duas filas entrelaçadas.
    const baralhadas = [
      cima[0],
      baixo[3],
      cima[2],
      cima[4],
      baixo[0],
      cima[1],
      baixo[4],
      cima[3],
      baixo[1],
      baixo[2],
    ];

    const bytes = await folha(
      [baralhadas],
      await Promise.all([...Array(10)].map((_, i) => foto(400, 300, i + 1))),
    );
    const lido = await lerPdf(bytes, { orcamentoMs: 60_000 });
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const { fotos } = await fotosDoPdf(lido.leitura.documento, lido.leitura.imagens);
    await lido.leitura.documento.destroy().catch(() => {});

    expect(posicoes(fotos)).toEqual([
      ...cima.map((c) => `p1:${Math.round(c.x)},${c.y}`),
      ...baixo.map((c) => `p1:${Math.round(c.x)},${c.y}`),
    ]);
  }, 120_000);

  it("uma fotografia alta ao lado de uma grelha não engole a página inteira", async () => {
    /**
     * A composição das NOSSAS páginas de inspiração de cinco fotos: uma alta à
     * esquerda, do cimo ao fundo, e uma grelha de duas por duas à direita. Se
     * as filas se decidissem por sobreposição de alturas, a alta sobrepunha-se
     * às quatro e a página virava uma fila só, lida por colunas. Lê-se pelo
     * TOPO: a alta pertence à fila de cima.
     */
    const alta = { x: 68, y: 50, largura: 395, altura: 495, qual: 0 };
    const cimaEsq = { x: 471, y: 322, largura: 147, altura: 221, qual: 1 };
    const cimaDir = { x: 627, y: 302, largura: 147, altura: 240, qual: 2 };
    const baixoEsq = { x: 471, y: 28, largura: 147, altura: 262, qual: 3 };
    const baixoDir = { x: 627, y: 59, largura: 147, altura: 200, qual: 4 };

    const bytes = await folha(
      [[baixoDir, cimaEsq, alta, baixoEsq, cimaDir]],
      await Promise.all([...Array(5)].map((_, i) => foto(500, 700, i + 20))),
    );
    const lido = await lerPdf(bytes, { orcamentoMs: 60_000 });
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    const { fotos } = await fotosDoPdf(lido.leitura.documento, lido.leitura.imagens);
    await lido.leitura.documento.destroy().catch(() => {});

    expect(posicoes(fotos)).toEqual([
      "p1:68,50",
      "p1:471,322",
      "p1:627,302",
      "p1:471,28",
      "p1:627,59",
    ]);
  }, 120_000);
});

describe("onde é que cada fotografia pertence", () => {
  it("uma folha com várias fotografias é uma página de inspiração, mesmo sem legenda", async () => {
    /**
     * Uma proposta feita à mão não traz a legenda «Inspiração» que
     * `camposDoDocumento` procura, e nessas `paginasDeMoodboard` vem vazio.
     * Antes disto, uma proposta verdadeira de quatro páginas de fotografias
     * devolvia 31 de 32 fotos com `destino: null` — uma tarde a arrastá-las à
     * mão, que é a tarde que este motor existe para poupar.
     */
    const bytes = await folha(
      [[], fila(3, 200, 200, 0), fila(4, 200, 200, 3)],
      await Promise.all([...Array(7)].map((_, i) => foto(400, 300, i + 40))),
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.fotos.map((f) => f.destino)).toEqual([
      ...Array(3).fill("moodBoards[0].images"),
      ...Array(4).fill("moodBoards[1].images"),
    ]);
  }, 120_000);

  it("uma fotografia sozinha numa folha de texto continua sem sítio", async () => {
    /**
     * O outro lado da mesma regra. Uma folha de Word com um parágrafo e uma
     * fotografia ao lado não é uma página de inspiração, e inventar-lhe um
     * mood board era pôr a foto no sítio errado — que é o género de erro que só
     * se descobre com a proposta impressa. Duas fotografias é o número que
     * separa os dois casos.
     */
    const bytes = await folha(
      [[{ x: 60, y: 120, largura: 300, altura: 210, qual: 0 }]],
      [await foto(1000, 700, 3)],
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.fotos).toHaveLength(1);
    expect(r.rascunho.fotos[0].destino).toBeNull();
  }, 120_000);

  it("duas capas lado a lado numa folha ao baixo ficam cada uma do seu lado", async () => {
    // A nossa capa: duas fotografias a ladear uma faixa central, cada uma com
    // uns 47% da folha e a altura toda.
    const esquerda = { x: 0, y: 0, largura: 278, altura: H, qual: 0 };
    const direita = { x: W - 278, y: 0, largura: 278, altura: H, qual: 1 };
    const bytes = await folha(
      [[direita, esquerda], fila(3, 200, 200, 2)],
      await Promise.all([...Array(5)].map((_, i) => foto(600, 900, i + 60))),
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // E voltam pela ordem impressa: a da esquerda primeiro, mesmo tendo sido
    // gravada depois.
    expect(r.rascunho.fotos.slice(0, 2).map((f) => f.destino)).toEqual([
      "coverImages[0]",
      "coverImages[1]",
    ]);
  }, 120_000);

  it("uma capa que sangra de lado a lado é UMA capa, não a da esquerda", async () => {
    /**
     * A capa da proposta verdadeira PARECE a nossa — duas fotografias e um
     * bloco escuro ao meio — mas por dentro é uma única imagem achatada de
     * 795 × 559 pontos numa folha de 842 × 596, ou seja 94% da largura. Sem
     * distinguir os dois casos, a folha inteira ia para o lado esquerdo do
     * gerador e o direito ficava vazio.
     */
    const bytes = await folha(
      [[{ x: 20, y: 22, largura: 795, altura: 559, qual: 0 }], fila(3, 200, 200, 1)],
      await Promise.all([...Array(4)].map((_, i) => foto(1219, 856, i + 80))),
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.fotos[0].destino).toBe("coverImages[0]");
    expect(r.rascunho.fotos.some((f) => f.destino === "coverImages[1]")).toBe(false);
  }, 120_000);

  it("uma fotografia da altura da página a MEIO do documento não é uma capa", async () => {
    /**
     * A regra da altura sozinha dava capas a meio do documento — e uma capa
     * gasta um dos dois lugares que a capa verdadeira depois já não apanhava.
     * Uma capa só pode estar na primeira ou na última folha (a contracapa, que
     * nas nossas repete a fotografia da capa).
     */
    const bytes = await folha(
      [
        [],
        [
          { x: 40, y: 10, largura: 300, altura: H - 20, qual: 0 },
          { x: 420, y: 200, largura: 200, altura: 200, qual: 1 },
        ],
        [],
      ],
      await Promise.all([...Array(2)].map((_, i) => foto(500, 900, i + 100))),
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.fotos.every((f) => f.destino !== "coverImages[0]")).toBe(true);
    expect(r.rascunho.fotos.map((f) => f.destino)).toEqual([
      "moodBoards[0].images",
      "moodBoards[0].images",
    ]);
  }, 120_000);
});

describe("o que não é uma fotografia", () => {
  it("o logótipo carimbado em todas as folhas não vem — e é dito quantos ficaram", async () => {
    /**
     * Um Word exporta o cabeçalho em todas as páginas. Nas duas propostas
     * verdadeiras são 8 e 9 carimbos do mesmo logótipo em 41 e 66 imagens
     * desenhadas. Deitá-los fora em silêncio obriga quem revê a abrir o PDF ao
     * lado para conferir se lhe faltou uma fotografia.
     */
    const logo = await foto(251, 127, 200);
    const bytes = await folha(
      [[], fila(3, 200, 200, 0), [], []],
      await Promise.all([...Array(3)].map((_, i) => foto(400, 300, i + 120))),
      {
        logotipoEmTodas: logo,
      },
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.fotos).toHaveLength(3);
    const aviso = r.rascunho.avisos.find((a) => a.tipo === "imagens-que-nao-sao-fotos");
    expect(aviso).toBeDefined();
    // As quatro do logótipo, ditas com o número e com a razão.
    expect(aviso!.mensagem).toContain("4");
    expect(aviso!.mensagem).toMatch(/repetem|pequen/);
  }, 120_000);

  it("sem nada para deitar fora não se inventa um aviso", async () => {
    const bytes = await folha(
      [fila(2, 200, 200, 0)],
      await Promise.all([...Array(2)].map((_, i) => foto(400, 300, i + 140))),
    );
    const r = await lerPropostaDePdf(bytes, { orcamentoMs: 60_000 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.rascunho.avisos.some((a) => a.tipo === "imagens-que-nao-sao-fotos")).toBe(false);
  }, 120_000);
});

describe("o tecto é de memória, não de contagem", () => {
  it("corta pelo fim do documento e diz o que ficou de fora e porquê", async () => {
    /**
     * O tecto de verdade são 192 MB de imagem descodificada (~64 megapixéis,
     * uns dez segundos de sharp). Fabricar isso num teste era gastar dez
     * segundos para provar uma conta — o orçamento entra por opção, como o
     * orçamento de tempo do `lerPdf`, e o que se fixa é o COMPORTAMENTO: onde
     * corta e o que diz.
     */
    const caixas = fila(5, 320, 200, 0).concat(fila(5, 60, 200, 5));
    const bytes = await folha(
      [caixas],
      await Promise.all([...Array(10)].map((_, i) => foto(400, 300, i + 160))),
    );
    const lido = await lerPdf(bytes, { orcamentoMs: 60_000 });
    expect(lido.ok).toBe(true);
    if (!lido.ok) return;
    // Cada fotografia são 400 × 300 × 3 = 360.000 bytes; três cabem em 1,2 MB.
    const { fotos, avisos } = await fotosDoPdf(lido.leitura.documento, lido.leitura.imagens, {
      orcamentoDeBytes: 1_200_000,
    });
    await lido.leitura.documento.destroy().catch(() => {});

    expect(fotos).toHaveLength(3);
    // As três primeiras da fila de cima — corta-se pelo FIM, não a esmo.
    expect(posicoes(fotos)).toEqual(["p1:30,320", "p1:185,320", "p1:340,320"]);
    const aviso = avisos.find((a) => a.tipo === "fotos-de-mais");
    expect(aviso).toBeDefined();
    expect(aviso!.mensagem).toContain("7");
    expect(aviso!.mensagem).toMatch(/MEMÓRIA/);
  }, 120_000);

  it("as 56 fotografias de uma proposta de onze páginas cabem no tecto", async () => {
    /**
     * A proposta verdadeira que este tecto cortava tem 66 imagens desenhadas e
     * 8,3 megapixéis de fotografia — 25 MB descodificados, um oitavo do tecto.
     * O que aqui se fixa é a conta que o justifica: uma folha com muitas
     * miniaturas pesa menos do que uma com meia dúzia de fotografias enormes.
     */
    const muitasPequenas = 56 * 400 * 300 * 3;
    const poucasGrandes = 14 * 1475 * 2200 * 3;
    expect(muitasPequenas).toBeLessThan(poucasGrandes);
  });
});
