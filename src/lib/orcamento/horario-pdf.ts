import "server-only";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { CARLITO_BOLD_TTF_B64, CARLITO_REGULAR_TTF_B64 } from "@/lib/proposal-fonts";
import { LOGO_DARK_PNG_B64 } from "@/lib/proposal-assets";
import { ordenar } from "./guiao-do-dia";
import type { TimelineItem } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TIMELINE EM PDF — A FOLHA QUE A EQUIPA DELA JÁ LEVA PARA O EVENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── DE ONDE VEIO ESTE DESENHO ────────────────────────────────────────────
 *
 * Não o inventei. Ela mandou a timeline a sério de um casamento — a folha que
 * a equipa levou para a Adega Fita Preta a 28 de Junho, três páginas, feita à
 * mão — e escreveu: **«quero que faças assim mesmo para o nosso timeline»**.
 *
 * Fui lê-la, e o que lá está é isto:
 *
 *     CASAMENTO J&P 28.06.25
 *            Timeline
 *
 *     Adultos      Crianças                  Staff
 *     240          6 crianças (1 c/ 1 ano)   24
 *
 *     HORA   LOCAL        DESCRIÇÃO                        NOTAS
 *     08h30  Fitapreta    Chegada Icook para montagem
 *     10h30               Chegada Festaaluga para montagem
 *                         Chegada Liquen Flowers
 *                         Chegada equipa WP
 *     14h30  Governador   Chegada foto e vídeo aos noivos
 *
 * ── AS TRÊS COISAS QUE FAZEM AQUELA FOLHA FUNCIONAR ─────────────────────
 *
 * 1. **A hora escreve-se UMA vez.** Às 10h30 acontecem cinco coisas, e a hora
 *    aparece na primeira. Repeti-la cinco vezes faria a coluna da esquerda
 *    parecer cinco momentos diferentes quando é um só.
 *
 * 2. **O local também.** «Fitapreta» escreve-se quando se muda para lá, e não
 *    outra vez. Uma coluna cheia de «Fitapreta» não diz nada; uma coluna com
 *    duas palavras em três páginas diz exactamente onde o dia muda de sítio.
 *
 * 3. **As NOTAS são uma coluna à parte.** «Sergey chega» é a descrição;
 *    «enviar táxi» é a nota. As duas na mesma coluna fazem uma folha que se lê
 *    em voz alta e não se cumpre.
 *
 * ── E PORQUE É QUE NÃO É A GRELHA ───────────────────────────────────────
 *
 * A grelha de horas (a `GrelhaDoDia`, no ecrã) responde a «são três e meia,
 * quem está livre?». Esta folha responde a «o que é que se segue, e o que é
 * preciso ter pronto para isso?». São perguntas diferentes e a segunda é a que
 * se faz com a folha na mão no dia. O ecrã ficou com a primeira; o papel e o
 * PDF ficam com esta, que é a que ela já usa.
 */

/** A4 ao alto, em pontos. É o formato da folha dela. */
const LARGURA = 595.28;
const ALTURA = 841.89;
const MARGEM = 48;

/**
 * As colunas, medidas na folha dela e trazidas para as nossas margens.
 *
 * Lá estão em x71 · x129 · x201 · x427, com a página a acabar aos 560. Aqui os
 * mesmos degraus a partir de 48: a hora estreita (cabe «08h30»), o local
 * estreito (é um nome de sítio), a descrição larga (é onde está o trabalho) e
 * as notas com o que sobra.
 */
const COL_HORA = MARGEM;
const COL_LOCAL = MARGEM + 52;
const COL_DESC = MARGEM + 124;
const COL_NOTAS = MARGEM + 352;
const FIM = LARGURA - MARGEM;

const CORPO = 8.5;
const ENTRELINHA = 11;
const TINTA = rgb(0.11, 0.12, 0.1);
const TINTA_FRACA = rgb(0.42, 0.44, 0.4);
const VERDE = rgb(0.32, 0.35, 0.18);
const RISCO = rgb(0.82, 0.82, 0.8);

export interface HorarioParaPdf {
  /** «CASAMENTO J&P 28.06.25» — o título grande, já composto por quem chama. */
  titulo: string;
  /** Quantos convidados. Vazio quando o pedido ainda não o diz. */
  convidados: string;
  /** O sítio do evento, para o subtítulo. */
  local: string;
  momentos: readonly TimelineItem[];
}

/** «08:30» → «08h30», que é como a folha dela escreve as horas. */
function horaDaFolha(hhmm: string): string {
  const encontro = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!encontro) return hhmm.trim();
  return `${encontro[1].padStart(2, "0")}h${encontro[2]}`;
}

/**
 * Parte um texto nas linhas que couberem na largura dada.
 *
 * Por PALAVRA e nunca por letra: cortar «Chegada Festaaluga» a meio da segunda
 * palavra dá uma folha que se lê aos soluços. Uma palavra sozinha maior do que
 * a coluna (um endereço, um nome sem espaços) fica por cortar e transborda —
 * é preferível a parti-la e ninguém a reconhecer.
 */
function emLinhas(texto: string, fonte: PDFFont, tamanho: number, largura: number): string[] {
  const palavras = texto.split(/\s+/).filter(Boolean);
  if (palavras.length === 0) return [];
  const linhas: string[] = [];
  let atual = palavras[0];
  for (const p of palavras.slice(1)) {
    const tentativa = `${atual} ${p}`;
    if (fonte.widthOfTextAtSize(tentativa, tamanho) <= largura) atual = tentativa;
    else {
      linhas.push(atual);
      atual = p;
    }
  }
  linhas.push(atual);
  return linhas;
}

/** Uma linha da folha, já com o texto partido e a saber se abre um bloco de hora. */
interface LinhaDaFolha {
  hora: string;
  local: string;
  descricao: string[];
  notas: string[];
  /** Verdade na primeira linha de cada hora — é onde a régua fina se desenha. */
  abreBloco: boolean;
  altura: number;
}

/**
 * Desenha a timeline e devolve o PDF em bytes.
 *
 * `null` quando não há um único momento: uma folha em branco parece um defeito
 * e quem chama tem de o dizer por palavras.
 */
export async function horarioEmPdf(dados: HorarioParaPdf): Promise<Uint8Array | null> {
  const momentos = ordenar(dados.momentos);
  if (momentos.length === 0) return null;

  const pdf = await PDFDocument.create();
  /**
   * Carlito, e não a Helvetica de série do PDF.
   *
   * A Helvetica embutida só sabe escrever WinAnsi, e um nome que saia dessa
   * tabela — um «Nguyễn», um «Łukasz» — não dá letra errada: dá uma EXCEPÇÃO a
   * meio do desenho, e o download falha inteiro. É o mesmo defeito que o
   * `proposal-doc-pdf.caracteres.test.ts` desta casa já apanhou uma vez.
   */
  pdf.registerFontkit(fontkit);
  const carlito = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const reg = await carlito(CARLITO_REGULAR_TTF_B64);
  const bold = await carlito(CARLITO_BOLD_TTF_B64);
  /* «E coloca o logo no pdf quando for para descarregar o timeline.» É a mesma
     marca que vai nas propostas e nos contratos (`LOGO_DARK_PNG_B64`), pela
     mesma razão por que ela lá está: uma folha que sai da casa e vai parar às
     mãos de dez fornecedores tem de dizer de quem é. */
  const marca = await pdf.embedPng(Buffer.from(LOGO_DARK_PNG_B64, "base64"));

  const larguraDesc = COL_NOTAS - COL_DESC - 10;
  const larguraNotas = FIM - COL_NOTAS;
  const larguraLocal = COL_DESC - COL_LOCAL - 6;

  // ── AS LINHAS, JÁ MEDIDAS ────────────────────────────────────────────────
  const linhas: LinhaDaFolha[] = [];
  let horaAnterior = "";
  let localAnterior = "";
  for (const m of momentos) {
    const hora = horaDaFolha(m.time);
    const mudouDeHora = hora !== horaAnterior;
    const local = (m.local ?? "").trim();
    const mudouDeLocal = !!local && local !== localAnterior;
    const descricao = emLinhas(m.title, reg, CORPO, larguraDesc);
    const notas = emLinhas(m.notas ?? "", reg, CORPO, larguraNotas);
    linhas.push({
      hora: mudouDeHora ? hora : "",
      local: mudouDeLocal ? local : "",
      descricao,
      notas,
      abreBloco: mudouDeHora,
      altura: Math.max(descricao.length, notas.length, 1) * ENTRELINHA,
    });
    if (mudouDeHora) horaAnterior = hora;
    if (mudouDeLocal) localAnterior = local;
  }

  // ── AS PÁGINAS ───────────────────────────────────────────────────────────
  let pagina = pdf.addPage([LARGURA, ALTURA]);
  let y = await cabecalhoDaPrimeira(pagina, dados, bold, reg, marca);
  y = cabecalhoDaTabela(pagina, y, bold);

  const chao = MARGEM + 24;
  for (const linha of linhas) {
    if (y - linha.altura < chao) {
      pagina = pdf.addPage([LARGURA, ALTURA]);
      y = ALTURA - MARGEM;
      y = cabecalhoDaTabela(pagina, y, bold);
    }
    /* A régua fina só onde a hora muda: é ela que faz os cinco momentos das
       10h30 lerem-se como UM bloco, que é o que a folha dela faz. */
    if (linha.abreBloco) {
      pagina.drawLine({
        start: { x: MARGEM, y: y + 4 },
        end: { x: FIM, y: y + 4 },
        thickness: 0.5,
        color: RISCO,
      });
    }
    if (linha.hora) {
      pagina.drawText(linha.hora, {
        x: COL_HORA,
        y: y - CORPO,
        size: CORPO,
        font: bold,
        color: TINTA,
      });
    }
    if (linha.local) {
      const cabe = emLinhas(linha.local, reg, CORPO, larguraLocal)[0] ?? "";
      pagina.drawText(cabe, {
        x: COL_LOCAL,
        y: y - CORPO,
        size: CORPO,
        font: reg,
        color: TINTA_FRACA,
      });
    }
    linha.descricao.forEach((t, i) => {
      pagina.drawText(t, {
        x: COL_DESC,
        y: y - CORPO - i * ENTRELINHA,
        size: CORPO,
        font: reg,
        color: TINTA,
      });
    });
    linha.notas.forEach((t, i) => {
      pagina.drawText(t, {
        x: COL_NOTAS,
        y: y - CORPO - i * ENTRELINHA,
        size: CORPO,
        font: reg,
        color: TINTA_FRACA,
      });
    });
    y -= linha.altura;
  }

  return pdf.save();
}

/**
 * O cabeçalho da primeira página: marca, título, «Timeline» e os convidados.
 * Devolve o `y` a que a tabela pode começar.
 */
async function cabecalhoDaPrimeira(
  pagina: PDFPage,
  dados: HorarioParaPdf,
  bold: PDFFont,
  reg: PDFFont,
  marca: Awaited<ReturnType<PDFDocument["embedPng"]>>,
): Promise<number> {
  const larguraDaMarca = 104;
  const escala = larguraDaMarca / marca.width;
  const alturaDaMarca = marca.height * escala;
  pagina.drawImage(marca, {
    x: (LARGURA - larguraDaMarca) / 2,
    y: ALTURA - MARGEM - alturaDaMarca,
    width: larguraDaMarca,
    height: alturaDaMarca,
  });

  let y = ALTURA - MARGEM - alturaDaMarca - 22;

  const titulo = dados.titulo.toUpperCase();
  pagina.drawText(titulo, {
    x: (LARGURA - bold.widthOfTextAtSize(titulo, 11)) / 2,
    y,
    size: 11,
    font: bold,
    color: TINTA,
  });
  y -= 18;

  pagina.drawText("Timeline", {
    x: (LARGURA - reg.widthOfTextAtSize("Timeline", 11)) / 2,
    y,
    size: 11,
    font: reg,
    color: TINTA,
  });
  y -= 24;

  /* A folha dela abre com «Adultos · Crianças · Staff» e os números por baixo.
     Nós sabemos os convidados e o sítio, e mais nada — as crianças e a equipa
     não existem no modelo deste produto. Escrever «0 crianças» era apresentar
     um dado em falta como um zero, que é precisamente o que o documento dela
     proíbe noutro ecrã. Diz-se o que se sabe. */
  const factos = [dados.convidados && `${dados.convidados} convidados`, dados.local]
    .filter(Boolean)
    .join("  ·  ");
  if (factos) {
    pagina.drawText(factos, {
      x: (LARGURA - reg.widthOfTextAtSize(factos, 9)) / 2,
      y,
      size: 9,
      font: reg,
      color: TINTA_FRACA,
    });
    y -= 26;
  }

  return y;
}

/** A fila dos nomes das colunas. Repete-se em cada página, como na folha dela. */
function cabecalhoDaTabela(pagina: PDFPage, y: number, bold: PDFFont): number {
  const nomes: [string, number][] = [
    ["HORA", COL_HORA],
    ["LOCAL", COL_LOCAL],
    ["DESCRIÇÃO", COL_DESC],
    ["NOTAS", COL_NOTAS],
  ];
  for (const [nome, x] of nomes) {
    pagina.drawText(nome, { x, y: y - 9, size: 8, font: bold, color: VERDE });
  }
  pagina.drawLine({
    start: { x: MARGEM, y: y - 16 },
    end: { x: FIM, y: y - 16 },
    thickness: 0.8,
    color: rgb(0.6, 0.63, 0.55),
  });
  return y - 26;
}
