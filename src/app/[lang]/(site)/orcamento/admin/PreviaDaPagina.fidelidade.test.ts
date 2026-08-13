import { describe, expect, it, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { DESCIDA, estiloDaLinha } from "./PreviaDaPagina";
import { renderProposalDocPdf } from "@/lib/proposal-doc-pdf";
import { withProposalDefaults } from "@/lib/proposal-doc";
import { PAGINA_H, PAGINA_M, PAGINA_W, TEXTO_DO_MOODBOARD as TXT } from "@/lib/proposal-geometria";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MINIATURA CONTRA A PÁGINA A SÉRIO — AS DUAS MEDIDAS, LADO A LADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «A miniatura tem de corresponder à página real do PDF: mesma proporção,
 * mesmas margens, mesma disposição, mesma tipografia em escala. Se não for
 * fiel, não dá confiança e é pior do que não existir.»
 *
 * A comparação é a que ela pediu — gerar o PDF e pôr cada página ao lado da
 * respectiva miniatura —, feita em NÚMEROS e não a olho: desenha-se o
 * documento a sério, aponta-se onde cada `drawText` caiu na folha, e pergunta-
 * -se à miniatura onde é que ela põe a mesma linha. Tudo convertido para a
 * mesma unidade: percentagem da página.
 *
 * Uma comparação de imagens dizia «diferentes» e não dizia ONDE; esta diz «o
 * título está 5,7% acima», que é a frase com que se corrige o defeito. E não
 * precisa de fontes instaladas nem de um rasterizador na máquina de testes.
 *
 * ── O QUE ISTO APANHOU ────────────────────────────────────────────────────
 * Antes de `TEXTO_DO_MOODBOARD` existir, a miniatura tinha os seus próprios
 * números: o título 5,7% acima do sítio (34 pontos, quase em cima do
 * sobretítulo), a legenda a 3,4% do fundo quando o documento a escreve a 13,4%,
 * e nenhum sobretítulo. Nada disto se via sem sobrepor as duas folhas.
 *
 * A tolerância é de meio ponto percentual — três pixéis numa miniatura de 240
 * px. Abaixo disso fica a diferença que sobra por o CSS ancorar caixas onde o
 * PDF ancora linhas de base; essa não se elimina, mede-se.
 */

// Desenha um documento inteiro, com as fontes embutidas.
vi.setConfig({ testTimeout: 30_000 });

/** Meio ponto percentual da folha. */
const TOLERANCIA = 0.5;

interface Escrita {
  pagina: number;
  x: number;
  y: number;
  texto: string;
}

/** Grava todos os `drawText` do desenho, com a página onde caíram. */
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
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: String(texto),
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

const TITULO = "Cerimónia";
const SUBTITULO = "Ramo de Noiva (a definir com a Noiva)";
const LEGENDA =
  "Verdes suaves, brancos quebrados e um toque de terracotta nas velas e nos têxteis da mesa.";

/** A página de mood board de um documento desenhado a sério. */
async function paginaDoMoodBoard(): Promise<Escrita[]> {
  const espia = instrumentar();
  try {
    await renderProposalDocPdf(
      withProposalDefaults({
        template: "decoracao",
        ref: "PO Decoração Casamento",
        clientNames: "Tara & Marty",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Herdade da Cortesia, Reguengos de Monsaraz",
        guests: "120 pax",
        serviceGroups: [],
        budgetItems: [],
        moodBoards: [
          {
            title: TITULO,
            subtitulo: SUBTITULO,
            annotation: LEGENDA,
            layout: "filas",
            // Uma referência que não resolve: a página é composta na mesma e o
            // que aqui se mede é o TEXTO. As caixas das fotografias têm o seu
            // próprio teste, contra a mesma `caixasDoMoodboard`.
            images: ["sem-foto.jpg"],
          },
        ],
        totalLabel: "Valor Total Decoração",
        totalText: "3000,00 € + IVA",
        coverImages: [],
      }),
    );
  } finally {
    espia.restaurar();
  }
  const pagina = espia.escritas.find((e) => e.texto === TITULO)?.pagina;
  expect(pagina, "o PDF não desenhou nenhuma página com este mood board").toBeTypeOf("number");
  return espia.escritas.filter((e) => e.pagina === pagina);
}

/**
 * A LINHA DE BASE que a miniatura vai desenhar, em percentagem da altura da
 * folha.
 *
 * O CSS ancora o FUNDO da caixa de texto e o PDF ancora a linha de base, por
 * isso a miniatura desce a caixa uma descida de letra ({@link DESCIDA}) para as
 * duas coincidirem no ecrã. Para comparar com o documento, essa descida é
 * somada outra vez — senão comparavam-se duas coisas diferentes e a diferença
 * lida seria a do desenho, não a do defeito.
 */
const naPrevia = (linha: { base: number; tamanho: number }) =>
  Number.parseFloat(estiloDaLinha(linha).bottom) + ((linha.tamanho * DESCIDA) / PAGINA_H) * 100;
/** E onde o documento a escreveu. */
const naFolha = (e: Escrita) => (e.y / PAGINA_H) * 100;

describe("a miniatura contra a página do PDF", () => {
  it("põe o título e o subtítulo nas linhas do documento", async () => {
    const escritas = await paginaDoMoodBoard();
    for (const [texto, linha] of [
      [TITULO, TXT.titulo],
      [SUBTITULO, TXT.subtitulo],
    ] as const) {
      const escrita = escritas.find((e) => e.texto === texto);
      expect(escrita, `o PDF não escreveu «${texto}» nesta página`).toBeTruthy();
      const previa = naPrevia(linha);
      const folha = naFolha(escrita!);
      expect(
        Math.abs(folha - previa),
        `«${texto}»: ${previa.toFixed(2)}% na miniatura, ${folha.toFixed(2)}% na página`,
      ).toBeLessThan(TOLERANCIA);
      // E na mesma margem esquerda.
      expect(escrita!.x).toBe(PAGINA_M);
      expect(Number.parseFloat(estiloDaLinha(linha).left)).toBeCloseTo(
        (PAGINA_M / PAGINA_W) * 100,
        6,
      );
    }
  });

  /**
   * A legenda era a pior: colada ao fundo da folha na miniatura (3,4%) e a
   * 13,4% no documento — meio dedo numa A4, e a diferença entre «cabe» e «não
   * cabe» quando se está a decidir a disposição.
   */
  it("põe a legenda na linha onde o documento a escreve", async () => {
    const escritas = await paginaDoMoodBoard();
    // O desenho parte a descrição em linhas; a que assenta na margem é a
    // ÚLTIMA, e é essa que a miniatura tem de encontrar no mesmo sítio.
    // Só as linhas COMPRIDAS: o rodapé é desenhado letra a letra, e um «V»
    // solto também é um pedaço da legenda.
    const daLegenda = escritas.filter((e) => e.texto.length > 15 && LEGENDA.includes(e.texto));
    expect(daLegenda.length).toBeGreaterThan(0);
    const ultima = daLegenda.reduce((a, b) => (b.y < a.y ? b : a));
    const previa = naPrevia({ base: PAGINA_M + TXT.legenda.folga, tamanho: TXT.legenda.tamanho });
    expect(
      Math.abs(naFolha(ultima) - previa),
      `legenda: ${previa.toFixed(2)}% na miniatura, ${naFolha(ultima).toFixed(2)}% na página`,
    ).toBeLessThan(TOLERANCIA);
  });

  it("escreve o sobretítulo que a página tem, e na mesma linha", async () => {
    const escritas = await paginaDoMoodBoard();
    // É desenhado LETRA A LETRA — é assim que leva o espaçamento —, por isso
    // não há nenhuma escrita com a palavra inteira.
    const primeira = TXT.sobretitulo.texto[0].toUpperCase();
    const letras = escritas.filter((e) => e.texto === primeira && e.y > PAGINA_H / 2);
    expect(letras.length, "o PDF não escreveu o sobretítulo").toBeGreaterThan(0);
    const previa = naPrevia(TXT.sobretitulo);
    expect(Math.abs(naFolha(letras[0]) - previa)).toBeLessThan(TOLERANCIA);
  });

  it("a folha tem a proporção da página do documento", () => {
    // A4 ao baixo. Se um dia mudar, muda para os dois lados ao mesmo tempo.
    expect(PAGINA_W / PAGINA_H).toBeCloseTo(1.414, 3);
  });
});
