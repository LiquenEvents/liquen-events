import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CARLITO_BOLD_TTF_B64, CARLITO_REGULAR_TTF_B64 } from "@/lib/proposal-fonts";
import { analisarODia, horaDoMinuto } from "./guiao-do-dia";
import { colunasPorResponsavel } from "./guioes";
import { horasDaJanela, janelaDoHorario, MINUTOS_POR_HORA } from "./horario";
import type { TimelineItem } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O HORÁRIO EM PDF — O MESMO DESENHO, NUM FICHEIRO QUE SE GUARDA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Quero que haja uma opção no timeline que seja fazer download. E que fique
 * como a foto que mandei num PDF.»
 *
 * ── PORQUE É QUE ISTO NÃO É «IMPRIMIR E GUARDAR COMO PDF» ────────────────
 *
 * Porque não é o mesmo gesto nem dá o mesmo ficheiro. «Imprimir» abre uma
 * janela do browser, obriga a escolher o destino, e o que sai leva o cabeçalho
 * e o rodapé que o browser mete (a data, o endereço, «1/2») e a margem que a
 * impressora dela tiver configurada. Um ficheiro para mandar ao cliente ou à
 * equipa não pode ter o endereço do back office impresso no fundo.
 *
 * Isto devolve um PDF já feito: um toque, um ficheiro, sempre igual.
 *
 * ── DEITADO, E NÃO DE PÉ ─────────────────────────────────────────────────
 *
 * A4 ao alto tem 595 pt de largura. Tirando margens e a coluna das horas
 * sobram ~480 pt para as pessoas — com cinco, são 96 pt cada, que é o mesmo
 * chão do ecrã e já aperta. Deitado sobram ~730, ou seja 146 pt cada: cabe o
 * nome do momento em duas linhas sem cortar palavras. O dia desce menos (496 pt
 * de altura útil contra 742), e por isso a hora encolhe até caber — ver
 * `alturaDaHora`.
 */

/** A4 deitada, em pontos. */
const LARGURA = 841.89;
const ALTURA = 595.28;
const MARGEM = 32;
/** A coluna das horas: 46 pt chegam para «09:00» a 8 pt com folga dos dois lados. */
const COLUNA_DAS_HORAS = 46;
/** O tecto de uma faixa. Acima disto um dia curto fica esticado e feio. */
const ALTURA_MAXIMA_DA_HORA = 46;
/** O chão de uma faixa. Abaixo disto não cabe uma linha escrita dentro do bloco. */
const ALTURA_MINIMA_DA_HORA = 14;

const TINTA = rgb(0.09, 0.11, 0.07);
const TINTA_FRACA = rgb(0.45, 0.47, 0.42);
const VERDE = rgb(0.32, 0.35, 0.18);
const RISCO = rgb(0.85, 0.85, 0.83);
const ZEBRA = rgb(0.957, 0.961, 0.941);
const BLOCO = rgb(0.918, 0.941, 0.894);
const BLOCO_RISCO = rgb(0.725, 0.776, 0.675);

export interface HorarioParaPdf {
  cliente: string;
  /** Já por extenso — quem chama é que sabe a língua e o formato da casa. */
  data: string;
  local: string;
  momentos: readonly TimelineItem[];
}

/** Corta um texto ao que couber na largura dada, com reticências se sobrar. */
function cortar(texto: string, fonte: PDFFont, tamanho: number, largura: number): string {
  if (fonte.widthOfTextAtSize(texto, tamanho) <= largura) return texto;
  let corte = texto;
  while (corte.length > 1 && fonte.widthOfTextAtSize(`${corte}…`, tamanho) > largura) {
    corte = corte.slice(0, -1);
  }
  return `${corte}…`;
}

/**
 * A altura de uma faixa de hora, para o dia caber na folha.
 *
 * Um dia de dezassete horas a 46 pt mediria 782 pt e não cabe nos 496 que a
 * folha deitada tem. Em vez de cortar o dia — que era esconder o que ela
 * precisa de ver — encolhe-se a hora até caber, com um chão: abaixo de 14 pt
 * não cabe uma linha escrita dentro de um bloco, e um horário sem palavras
 * dentro dos blocos é um gráfico bonito que não diz nada.
 *
 * Quando nem com o chão cabe (um dia de mais de trinta e cinco horas, que só
 * acontece com uma hora mal escrita), quem chama recebe a altura a sério e a
 * folha ganha as páginas que precisar — ver `desenharHorario`.
 */
function alturaDaHora(horas: number, disponivel: number): number {
  if (horas <= 0) return ALTURA_MAXIMA_DA_HORA;
  return Math.max(ALTURA_MINIMA_DA_HORA, Math.min(ALTURA_MAXIMA_DA_HORA, disponivel / horas));
}

/**
 * Desenha o horário de um dia e devolve o PDF em bytes.
 *
 * Devolve `null` quando não há um único momento com hora legível: um horário
 * sem horas é uma grelha vazia a fingir que o dia está livre, e quem chama tem
 * de dizer isso por palavras em vez de mandar um ficheiro em branco.
 */
export async function horarioEmPdf(dados: HorarioParaPdf): Promise<Uint8Array | null> {
  const dia = analisarODia(dados.momentos);
  const janela = janelaDoHorario(dia);
  if (!janela) return null;

  const colunas = colunasPorResponsavel(
    dia.blocos.map((b) => ({
      inicio: b.inicio,
      fim: b.fim,
      duracao: b.duracao,
      temHora: b.temHora,
      item: b.item,
    })),
  );
  if (colunas.length === 0) return null;

  const pdf = await PDFDocument.create();
  /**
   * Carlito, e não a Helvetica de série do PDF.
   *
   * A Helvetica embutida só sabe escrever WinAnsi, e um nome que saia dessa
   * tabela — um «Nguyễn», um «Łukasz» — não dá letra errada: dá uma EXCEPÇÃO a
   * meio do desenho, e o download falha inteiro. É o mesmo defeito que o
   * `proposal-doc-pdf.caracteres.test.ts` desta casa já apanhou uma vez, e a
   * saída é a mesma: a fonte embutida, que aceita o que lhe derem.
   */
  pdf.registerFontkit(fontkit);
  const carlito = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const reg = await carlito(CARLITO_REGULAR_TTF_B64);
  const bold = await carlito(CARLITO_BOLD_TTF_B64);

  const pagina = pdf.addPage([LARGURA, ALTURA]);
  desenharCabecalho(pagina, dados, bold, reg);

  const topoDaGrelha = ALTURA - MARGEM - 54;
  const alturaUtil = topoDaGrelha - MARGEM - 16; // 16 = a fila dos nomes
  const horas = horasDaJanela(janela);
  const passo = alturaDaHora(horas.length - 1, alturaUtil);
  const larguraDasPistas = LARGURA - MARGEM * 2 - COLUNA_DAS_HORAS;
  const larguraDaColuna = larguraDasPistas / colunas.length;
  const x0 = MARGEM + COLUNA_DAS_HORAS;
  const topoDasFaixas = topoDaGrelha - 16;

  // ── A FILA DOS NOMES ─────────────────────────────────────────────────────
  pagina.drawRectangle({
    x: MARGEM,
    y: topoDasFaixas,
    width: LARGURA - MARGEM * 2,
    height: 16,
    color: rgb(0.933, 0.945, 0.914),
  });
  colunas.forEach((c, i) => {
    const x = x0 + larguraDaColuna * i;
    pagina.drawLine({
      start: { x, y: topoDasFaixas },
      end: { x, y: topoDasFaixas + 16 },
      thickness: 0.5,
      color: RISCO,
    });
    const nome = cortar(c.nome, bold, 8, larguraDaColuna - 8);
    pagina.drawText(nome, {
      x: x + (larguraDaColuna - bold.widthOfTextAtSize(nome, 8)) / 2,
      y: topoDasFaixas + 5,
      size: 8,
      font: bold,
      color: VERDE,
    });
  });

  // ── AS FAIXAS DAS HORAS ──────────────────────────────────────────────────
  const alturaDasFaixas = passo * (horas.length - 1);
  const baseY = topoDasFaixas - alturaDasFaixas;

  horas.slice(0, -1).forEach((m, i) => {
    const y = topoDasFaixas - passo * (i + 1);
    if (i % 2 === 0) {
      pagina.drawRectangle({
        x: MARGEM,
        y,
        width: LARGURA - MARGEM * 2,
        height: passo,
        color: ZEBRA,
      });
    }
    pagina.drawLine({
      start: { x: MARGEM, y: y + passo },
      end: { x: LARGURA - MARGEM, y: y + passo },
      thickness: 0.5,
      color: RISCO,
    });
    // O princípio da faixa em cima e à esquerda, o fim em baixo e à direita —
    // é o que a folha dela faz, e é o que diz o INTERVALO em vez do instante.
    pagina.drawText(horaDoMinuto(m), {
      x: MARGEM + 4,
      y: y + passo - 8,
      size: 7,
      font: reg,
      color: TINTA_FRACA,
    });
    if (passo >= 22) {
      const fim = horaDoMinuto(m + MINUTOS_POR_HORA);
      pagina.drawText(fim, {
        x: MARGEM + COLUNA_DAS_HORAS - 4 - reg.widthOfTextAtSize(fim, 7),
        y: y + 3,
        size: 7,
        font: reg,
        color: rgb(0.62, 0.64, 0.6),
      });
    }
  });

  // ── OS BLOCOS ────────────────────────────────────────────────────────────
  colunas.forEach((c, i) => {
    const xColuna = x0 + larguraDaColuna * i;
    for (const { bloco, carril } of c.blocos) {
      const larguraCarril = larguraDaColuna / c.carris;
      const x = xColuna + larguraCarril * carril;
      const topo = topoDasFaixas - ((bloco.inicio - janela.inicio) * passo) / MINUTOS_POR_HORA;
      const instante = bloco.duracao <= 0;
      const alto = instante ? 11 : Math.max((bloco.duracao * passo) / MINUTOS_POR_HORA, 11);
      const y = topo - alto;
      if (instante) {
        pagina.drawLine({
          start: { x: x + 1, y: topo },
          end: { x: x + larguraCarril - 1, y: topo },
          thickness: 1.4,
          color: VERDE,
        });
      } else {
        pagina.drawRectangle({
          x: x + 1,
          y,
          width: larguraCarril - 2,
          height: alto,
          color: BLOCO,
          borderColor: BLOCO_RISCO,
          borderWidth: 0.5,
        });
      }
      const util = larguraCarril - 8;
      pagina.drawText(cortar(bloco.item.title, bold, 7.5, util), {
        x: x + 4,
        y: topo - 9,
        size: 7.5,
        font: bold,
        color: TINTA,
      });
      if (alto >= 20) {
        const quando = instante
          ? bloco.item.time
          : `${bloco.item.time} – ${horaDoMinuto(bloco.fim)}`;
        pagina.drawText(cortar(quando, reg, 6.5, util), {
          x: x + 4,
          y: topo - 17,
          size: 6.5,
          font: reg,
          color: TINTA_FRACA,
        });
      }
    }
  });

  // A moldura por cima de tudo, para nenhum bloco lhe passar por cima.
  pagina.drawRectangle({
    x: MARGEM,
    y: baseY,
    width: LARGURA - MARGEM * 2,
    height: alturaDasFaixas + 16,
    borderColor: rgb(0.78, 0.78, 0.76),
    borderWidth: 0.7,
  });
  colunas.forEach((_, i) => {
    if (i === 0) return;
    const x = x0 + larguraDaColuna * i;
    pagina.drawLine({
      start: { x, y: baseY },
      end: { x, y: topoDasFaixas },
      thickness: 0.5,
      color: RISCO,
    });
  });
  pagina.drawLine({
    start: { x: x0, y: baseY },
    end: { x: x0, y: topoDasFaixas + 16 },
    thickness: 0.7,
    color: rgb(0.78, 0.78, 0.76),
  });

  return pdf.save();
}

function desenharCabecalho(
  pagina: PDFPage,
  dados: HorarioParaPdf,
  bold: PDFFont,
  reg: PDFFont,
): void {
  pagina.drawText("LÍQUEN EVENTS · HORÁRIO DO DIA", {
    x: MARGEM,
    y: ALTURA - MARGEM - 10,
    size: 8,
    font: bold,
    color: VERDE,
  });
  pagina.drawText(cortar(dados.cliente, bold, 17, LARGURA - MARGEM * 2), {
    x: MARGEM,
    y: ALTURA - MARGEM - 30,
    size: 17,
    font: bold,
    color: TINTA,
  });
  const sub = [dados.data, dados.local].filter(Boolean).join(" · ");
  if (sub) {
    pagina.drawText(cortar(sub, reg, 9, LARGURA - MARGEM * 2), {
      x: MARGEM,
      y: ALTURA - MARGEM - 44,
      size: 9,
      font: reg,
      color: TINTA_FRACA,
    });
  }
}
