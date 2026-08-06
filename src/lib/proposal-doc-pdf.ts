import "server-only";
import {
  PDFDocument,
  rgb,
  pushGraphicsState,
  popGraphicsState,
  moveTo,
  lineTo,
  closePath,
  clip,
  endPath,
  type PDFFont,
  type PDFPage,
  type PDFImage,
} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { SITE } from "@/lib/site";
import {
  achatarLogotipo,
  imageContentKey,
  resizeToBox,
  transcodificarParaJpeg,
  type ImagePlacement,
} from "@/lib/proposal-image";
import {
  type ProposalDoc,
  type MoodBoard,
  MOOD_BOARD_MAX_IMAGES,
  resolveProposalMoney,
  resolveValidUntil,
} from "@/lib/proposal-doc";
import { splitThirtySeventy, eur } from "@/lib/money";
import { LOGO_DARK_PNG_B64, LOGO_WHITE_PNG_B64 } from "@/lib/proposal-assets";
import {
  CARLITO_REGULAR_TTF_B64,
  CARLITO_BOLD_TTF_B64,
  CARLITO_ITALIC_TTF_B64,
} from "@/lib/proposal-fonts";
import { opcionaisDe, totaisDasVersoes } from "@/lib/orcamento/versoes-da-proposta";
import { winAnsiSafe } from "@/lib/pdf-text";
import { log } from "@/lib/logger";

const PT_MONTHS_SHORT = [
  "jan.",
  "fev.",
  "mar.",
  "abr.",
  "mai.",
  "jun.",
  "jul.",
  "ago.",
  "set.",
  "out.",
  "nov.",
  "dez.",
];
/** "2026-09-12" → "12 de set. de 2026"; passes through anything unexpected. */
function prettyDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return iso;
  return `${Number(m[3])} de ${PT_MONTHS_SHORT[mo - 1]} de ${m[1]}`;
}

// ── Landscape A4 ──
const W = 841.89;
const H = 595.28;
const M = 68; // page margin — generous editorial whitespace, let the page breathe
// Max text measure: long lines (~120+ chars edge-to-edge) are the biggest "DIY"
// tell. Cap body copy near the 45–75 char ideal.
const MEASURE = 430;

// ── Type scale (one display, one subtitle, one body, one caption) ──
const T_DISPLAY = 20; // section titles (serif)
const T_SUB = 13; // sub-section / group titles (serif)
const T_BODY = 10; // body copy
const T_CAPTION = 7.5; // eyebrows / captions (uppercase)

// ── Qualidade das imagens ──
// O orçamento de pixéis por sítio (capa vs célula de mood board) e o encode
// vivem em `@/lib/proposal-image`, com o raciocínio de DPI. Aqui só se diz ONDE
// cada foto é desenhada; quantos pixéis isso vale é decidido lá.

// ── Brand palette ──
// Moss/gold are deliberately rare now — quiet ink & grey type on white carry the
// interior; a single gold hairline marks the one accent moment (the total).
const INK = rgb(0.165, 0.149, 0.125); // #2a2620
const MUTED = rgb(0.42, 0.4, 0.36);
const FAINT = rgb(0.55, 0.53, 0.49);
const DARK = rgb(0.047, 0.055, 0.043); // #0c0e0b
const LINE = rgb(0.886, 0.871, 0.835); // #e2ded5

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
  serif: PDFFont;
  serifB: PDFFont;
  serifIt: PDFFont;
}

// ── O que o DESENHO deixa de fora ──
//
// O documento tem limites de composição: a página de mood board desenha 6
// fotos, a descrição do mood board 5 linhas, cada campo do evento 2 linhas, o
// nome na capa 2 linhas. Até aqui, o que passava desses limites desaparecia sem
// deixar rasto: as fotos tinham sido carregadas, tinham sido descarregadas do
// armazenamento com sucesso, e simplesmente não eram desenhadas.
//
// É a MESMA perda que a contagem de "fotos em falta" foi criada para apanhar
// (uma proposta seguiu para um noivo com fotos a menos e ninguém deu por isso),
// só que por outro caminho: ali a foto não chegou, aqui chegou e não coube.
// Por isso é contada — mas SEPARADA de `missingImages`, porque a causa e a
// correcção são outras: em falta = avaria, tenta-se de novo; cortado = escolha
// editorial, tira-se uma foto ou encurta-se o texto.
const MAX_ANNOTATION_LINES = 5; // descrição sob o collage
const MAX_EVENT_FIELD_LINES = 2; // cada campo da faixa de detalhes
const MAX_COVER_NAME_LINES = 2; // nome do casal na capa

/** Uma perda por COMPOSIÇÃO: o conteúdo chegou inteiro ao gerador e o desenho
 *  não o mostra todo. Estruturada (e não uma frase feita) para o estúdio poder
 *  escrever a mensagem no idioma da interface e somar o que quiser. */
export interface DocTruncation {
  /** Onde, em pt-PT, como aparece ao utilizador: `Mood board «Cerimónia»`. */
  where: string;
  /** Quantas unidades ficaram por desenhar (nunca 0 — o que cabe não se anota). */
  dropped: number;
  /** O que se perdeu, para a frase concordar em número e género. */
  unit: "fotos" | "linhas";
}

/** Regista uma truncagem (ignora `dropped <= 0`, que é o caso normal). */
type NoteTruncation = (where: string, dropped: number, unit: DocTruncation["unit"]) => void;

/**
 * Regista uma foto que CHEGOU inteira ao gerador e que não foi possível
 * DESENHAR (bytes corrompidos, ou um formato que nem o sharp nem o `pdf-lib`
 * aceitam).
 *
 * Não é uma truncagem: não há aqui escolha de composição nenhuma a morder o
 * conteúdo — é uma AVARIA, exactamente da mesma família da foto que não resolve
 * do armazenamento, e a correcção é a mesma (voltar a tentar, ou recarregar a
 * foto). Por isso soma-se às FOTOS EM FALTA e não ao conteúdo cortado.
 *
 * Recebe o base64 da foto para as contar por CONTEÚDO: a mesma foto escolhida
 * para os dois lados da capa é desenhada quatro vezes (capa + contracapa) e
 * falharia quatro vezes — dizer "4 fotos em falta" quando é uma só seria mandar
 * o estúdio procurar fotos que não existem.
 */
type NoteUndrawn = (b64: string) => void;

// ── Refined palette additions for the redesign ──
const CREAM = rgb(0.968, 0.957, 0.933); // #f7f4ee — warm off-white on the dark cover
const GOLD = rgb(0.541, 0.416, 0.114); // #8a6a1d — accent hairlines / eyebrows on light
const CREAM_DIM = rgb(0.72, 0.74, 0.71); // muted cream/sage for sub-text on dark

/** Embed image bytes into the PDF, trying JPEG then PNG by their magic bytes and
 *  never throwing. Returns null when the bytes are neither (so a bad image is
 *  simply omitted instead of failing the whole document). `embedJpg`/`embedPng`
 *  are awaited so a rejection (e.g. "SOI not found in JPEG") is caught here.
 *
 *  Último recurso: bytes que não são JPEG nem PNG são CONVERTIDOS para JPEG
 *  pelo sharp e embutidos assim. O `pdf-lib` só sabe embutir estes dois
 *  formatos, e a biblioteca do estúdio tem WebP a sério lá dentro (as fotos do
 *  Pinterest) — sem esta conversão, essas fotos não eram desenhadas de todo e
 *  ficava um buraco na página de inspiração. */
async function embedImage(doc: PDFDocument, bytes: Buffer): Promise<PDFImage | null> {
  const isJpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const isPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  if (isJpg) {
    try {
      return await doc.embedJpg(bytes);
    } catch {
      /* fall through */
    }
  }
  if (isPng) {
    try {
      return await doc.embedPng(bytes);
    } catch {
      /* fall through */
    }
  }
  // Unknown/none of the magic bytes matched — last-resort attempts, still guarded.
  try {
    return await doc.embedJpg(bytes);
  } catch {
    /* fall through */
  }
  try {
    return await doc.embedPng(bytes);
  } catch {
    /* fall through */
  }
  // Nem JPEG nem PNG: o sharp lê WebP, AVIF, TIFF, GIF… — converte-se para
  // JPEG baseline e embute-se isso. Guardado como tudo o resto: uma foto que
  // nem assim entra é omitida, nunca deita abaixo o documento.
  try {
    const jpeg = await transcodificarParaJpeg(bytes);
    if (jpeg) return await doc.embedJpg(jpeg);
  } catch {
    /* segue para o `null` */
  }
  return null;
}

/** Draw `img` to COVER the box (x,y,w,h) — the same visual result as CSS
 *  `object-fit: cover`: scaled to fill, centred, and the overflow clipped away.
 *  Uses pdf-lib's low-level content-stream clipping (pushGraphicsState → a
 *  rectangular clip path → drawImage → popGraphicsState). Because the image is
 *  scaled by a SINGLE factor `max(w/iw, h/ih)`, its aspect ratio is always
 *  preserved — it can never be stretched, only cropped by the clip. */
function drawImageCover(
  page: PDFPage,
  img: PDFImage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const scale = Math.max(w / img.width, h / img.height); // fill, don't fit
  const dw = img.width * scale;
  const dh = img.height * scale;
  const dx = x + (w - dw) / 2; // centre the overflow
  const dy = y + (h - dh) / 2;
  page.pushOperators(
    pushGraphicsState(),
    moveTo(x, y),
    lineTo(x + w, y),
    lineTo(x + w, y + h),
    lineTo(x, y + h),
    closePath(),
    clip(),
    endPath(),
  );
  page.drawImage(img, { x: dx, y: dy, width: dw, height: dh });
  page.pushOperators(popGraphicsState());
}

/**
 * Cache de imagens JÁ EMBUTIDAS neste documento, por CONTEÚDO + caixa de
 * destino. A capa é desenhada duas vezes (página 1 e contracapa) e a mesma foto
 * pode ser escolhida para os dois lados: sem isto, a mesma fotografia era
 * redimensionada pelo sharp e escrita no PDF até quatro vezes. Guarda-se a
 * Promise (não o resultado) para que dois desenhos simultâneos da mesma foto
 * partilhem o mesmo trabalho.
 */
type EmbedCache = Map<string, Promise<PDFImage | null>>;

/** Corre `make` uma só vez por `key` dentro deste documento. */
function once(cache: EmbedCache, key: string, make: () => Promise<PDFImage | null>) {
  const hit = cache.get(key);
  if (hit) return hit;
  const pending = make();
  cache.set(key, pending);
  return pending;
}

/** Recorta uma imagem base64 para a caixa (x,y,w,h) de `page` e desenha-a.
 *
 *  Caminho principal: `resizeToBox` recorta ao aspeto EXATO da caixa, com os
 *  pixéis que o sítio (`placement`) justifica, e reencoda em JPEG baseline —
 *  desenhar isso às medidas da caixa não pode distorcer. Recurso (sharp
 *  indisponível/falhado): embute-se o ORIGINAL e desenha-se com `drawImageCover`,
 *  que preserva o aspeto por recorte — parece igual e continua a não poder
 *  esticar (era o bug das "fotos esticadas"). Nunca lança.
 *
 *  DEVOLVE se desenhou mesmo. Quem chama TEM de usar isto: a moldura fina do
 *  collage só pode ser desenhada por cima de uma foto que exista, e uma foto que
 *  não se consegue desenhar tem de ser contada como foto em falta. Um rectângulo
 *  de contorno vazio num PDF que vai para o cliente é pior do que não haver
 *  caixa nenhuma — foi assim que uma proposta seguiu com 6 molduras e 2 fotos.
 *
 *  As duas coisas são distintas e ambas contam: uma foto que sai pelo CAMINHO
 *  DE RECURSO foi desenhada (devolve `true`, leva moldura) e avisa
 *  `aoUsarRecurso` — saiu, apenas saiu pesada; só a foto que não se consegue
 *  desenhar de todo devolve `false`, e essa não avisa ninguém por aqui. */
async function drawCoverImage(
  doc: PDFDocument,
  page: PDFPage,
  b64: string,
  x: number,
  y: number,
  w: number,
  h: number,
  placement: ImagePlacement,
  cache: EmbedCache,
  /** Chamado quando esta foto entra pelo caminho de recurso (sem redimensionar). */
  aoUsarRecurso?: () => void,
): Promise<boolean> {
  const raw = b64.includes(",") ? b64.slice(b64.indexOf(",") + 1) : b64;
  let input: Buffer;
  try {
    input = Buffer.from(raw, "base64");
  } catch {
    return false;
  }
  if (input.length < 32) return false;

  // A chave inclui a caixa: a mesma foto na capa e numa célula de mood board
  // são embutidas com resoluções diferentes, logo são objetos diferentes.
  const content = imageContentKey(input);
  const box = `${Math.round(w)}x${Math.round(h)}:${placement}`;

  const img = await once(cache, `${content}@${box}`, async () => {
    const cropped = await resizeToBox(input, w, h, placement);
    return cropped ? await embedImage(doc, cropped) : null;
  });
  if (img) {
    // Recortada ao aspeto exato da caixa — desenhar às medidas dela não estica.
    page.drawImage(img, { x, y, width: w, height: h });
    return true;
  }

  // Recurso: embutir o ORIGINAL e ajustar por recorte (nunca esticar). Também
  // vai a cache — sem isto, uma foto que o sharp não consiga tratar era escrita
  // por inteiro no ficheiro tantas vezes quantas fosse desenhada.
  //
  // ── ISTO TEM DE SE VER ────────────────────────────────────────────────────
  // Este caminho foi desenhado para o PDF sair sempre, e cumpre — cumpre até
  // demais: um PDF verdadeiro de 3,31 MB chegou com as fotos a 266–576 DPI
  // quando o `PLACEMENT_DPI` manda 130–160, porque TODAS entraram por aqui e
  // ninguém deu por nada. Medido: com este código, as caixas produzem
  // exactamente 130 e 160 (ver PDF-BEFORE.md).
  //
  // Falhar em silêncio é o defeito. Contar não corrige a causa, mas põe-na à
  // vista: quem gerar uma proposta passa a saber que ela saiu pesada, e o
  // registo diz porquê.
  aoUsarRecurso?.();
  const orig = await once(cache, `${content}@original`, () => embedImage(doc, input));
  if (orig) {
    drawImageCover(page, orig, x, y, w, h);
    return true;
  }
  // Não há foto nenhuma para esta caixa. Quem chamou não desenha a moldura e
  // conta-a como em falta.
  return false;
}

function wrap(font: PDFFont, rawText: string, size: number, maxWidth: number): string[] {
  // Sanitiza para WinAnsi antes de medir/quebrar — descrições e notas do
  // documento podem trazer caracteres que a Helvetica não codifica.
  const text = winAnsiSafe(rawText);
  const out: string[] = [];
  for (const paragraph of text.split("\n")) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = "";
    for (const w of words) {
      const test = line ? `${line} ${w}` : w;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        out.push(line);
        line = w;
      } else {
        line = test;
      }
    }
    out.push(line);
  }
  return out;
}

/** Como {@link renderProposalDocPdfWithReport}, mas só os bytes — para quem não
 *  tem a quem dar o relatório (a pré-visualização de desenvolvimento). */
export async function renderProposalDocPdf(doc: ProposalDoc): Promise<Uint8Array> {
  return (await renderProposalDocPdfWithReport(doc)).bytes;
}

/**
 * Gera o PDF E diz o que o desenho deixou de fora:
 *
 * - `truncations` — conteúdo que chegou inteiro e que a COMPOSIÇÃO não mostra
 *   todo (ver {@link DocTruncation}).
 * - `undrawnImages` — fotos distintas que chegaram e que não foi possível
 *   desenhar (ver {@link NoteUndrawn}). São fotos EM FALTA, e quem chama
 *   soma-as à contagem que já existe.
 * - `semRedimensionar` — fotos que FORAM desenhadas, mas pelo caminho de
 *   recurso, com o original embutido. Não faltam ao cliente; o PDF é que sai
 *   pesado a abrir e a percorrer.
 *
 * As duas últimas não se confundem: uma foto ou não sai (`undrawnImages`) ou
 * sai pesada (`semRedimensionar`) — nunca as duas.
 *
 * O relatório sai daqui, e não de uma contagem feita por fora, porque só aqui
 * se sabe: as linhas dependem das métricas da fonte embutida e da largura da
 * caixa onde o texto é desenhado, e só aqui se descobre que uma foto não se
 * consegue embutir. Calculá-lo noutro sítio era garantir que um dia deixava de
 * coincidir com o que sai impresso.
 */
export async function renderProposalDocPdfWithReport(doc: ProposalDoc): Promise<{
  bytes: Uint8Array;
  truncations: DocTruncation[];
  undrawnImages: number;
  semRedimensionar: number;
}> {
  const truncations: DocTruncation[] = [];
  /**
   * Quantas fotos entraram SEM serem redimensionadas.
   *
   * Zero é o normal. Qualquer outro número quer dizer que o `sharp` falhou e
   * que o PDF saiu com as fotos em tamanho de armazenamento — pesado a abrir e
   * a percorrer. Era exactamente isto que estava a acontecer sem ninguém saber.
   */
  let semRedimensionar = 0;
  const contarRecurso = () => {
    semRedimensionar++;
  };
  const note: NoteTruncation = (where, dropped, unit) => {
    if (dropped > 0) truncations.push({ where, dropped, unit });
  };
  // Por CONTEÚDO: a mesma foto que falha em vários sítios é uma foto, não
  // várias (ver NoteUndrawn).
  const undrawn = new Set<string>();
  const noteUndrawn: NoteUndrawn = (b64) => {
    undrawn.add(b64);
  };
  /** Corta a `max` linhas E DIZ quantas ficaram de fora. Usar sempre isto em
   *  vez de `.slice(0, max)`: o `.slice` é mudo, este não. */
  const clampLines = (lines: string[], max: number, where: string): string[] => {
    note(where, lines.length - max, "linhas");
    return lines.slice(0, max);
  };

  const pdf = await PDFDocument.create();
  // Uma foto = um redimensionamento e um objeto no ficheiro, por muitas vezes
  // que seja desenhada (ver EmbedCache). Vive só durante este documento.
  const images: EmbedCache = new Map();
  /** Desenha uma foto do documento E conta-a nas duas contagens: quando não sai
   *  de todo (`noteUndrawn`) e quando sai pelo caminho de recurso, sem
   *  redimensionar (`contarRecurso`). Usar sempre isto em vez de
   *  `drawCoverImage` direto: é o que garante que uma foto que não se desenha
   *  nunca fica invisível para quem vai enviar a proposta, e que um PDF que
   *  saiu pesado o diz. */
  const photo = async (
    p: PDFPage,
    b64: string,
    x: number,
    y: number,
    w: number,
    h: number,
    placement: ImagePlacement,
  ): Promise<boolean> => {
    const drawn = await drawCoverImage(pdf, p, b64, x, y, w, h, placement, images, contarRecurso);
    if (!drawn) noteUndrawn(b64);
    return drawn;
  };
  pdf.registerFontkit(fontkit);
  // Carlito — a free, metric-compatible twin of Microsoft Calibri, the font the
  // studio's real "PO Decoração" sample proposals are set in. Embedding it (from
  // base64 WOFF, like the logos) means the generated PDF matches those samples
  // instead of mixing Helvetica + Times (neither of which appears in the
  // samples). One family, used everywhere; subset:true keeps only drawn glyphs.
  const carlito = (b64: string) => pdf.embedFont(Buffer.from(b64, "base64"), { subset: true });
  const reg = await carlito(CARLITO_REGULAR_TTF_B64);
  const bold = await carlito(CARLITO_BOLD_TTF_B64);
  const italic = await carlito(CARLITO_ITALIC_TTF_B64);
  // The layout still names "serif"/"serifB"/"serifIt" slots for its elegant
  // moments; in the sample proposals those are simply Calibri regular/bold/
  // italic, so every slot now resolves to Carlito — one consistent typeface.
  const f: Fonts = { reg, bold, serif: reg, serifB: bold, serifIt: italic };
  /**
   * O logótipo das PÁGINAS DE CONTEÚDO entra achatado contra branco, sem canal
   * alfa, e à resolução a que é desenhado.
   *
   * Antes disto ia como PNG com máscara alfa, composto em todas as páginas e a
   * 720 DPI — a única transparência do documento e a única coisa em resolução
   * absurda (as fotografias vão a 130–160). Compor transparência é das
   * operações mais caras num visualizador de PDF, e estava a ser paga uma vez
   * por página para desenhar uma marca que assenta sobre branco chapado.
   *
   * ── Porque é que só esta, e não a da capa ────────────────────────────────
   * O `sharp` compõe em luz linear, e o resultado sai um nível abaixo da cor
   * pedida: medido no ficheiro, a caixa do logótipo dava 11,13,10 onde o painel
   * escuro da capa dá 12,14,11. Contra o verde-escuro isso desenhava um
   * RECTÂNGULO visível à volta da marca; contra BRANCO PURO não há desvio
   * nenhum, porque 255 não tem para onde subir.
   *
   * Por isso achata-se a das páginas de conteúdo — que são 10 das 12
   * utilizações, e portanto quase todo o ganho — e deixa-se a da capa com o
   * canal alfa. Duas composições de transparência em vez de doze, e a capa
   * continua exactamente com o aspecto que ela aprovou.
   *
   * Se o `sharp` falhar, volta-se ao PNG original: o documento sai na mesma,
   * apenas sem esta melhoria.
   */
  const logoDarkPng = Buffer.from(LOGO_DARK_PNG_B64, "base64");
  const logoDarkChato = await achatarLogotipo(logoDarkPng, { r: 255, g: 255, b: 255 }, 72);
  const logoDark = await pdf.embedPng(logoDarkChato ?? logoDarkPng);
  // A da capa mantém a transparência, pela razão acima.
  const logoWhite = await pdf.embedPng(Buffer.from(LOGO_WHITE_PNG_B64, "base64"));

  // Sanitiza no ponto de desenho: campos do documento (nomes, descrições…) podem
  // conter caracteres que o WinAnsi/Helvetica não codifica (→ drawText lança).
  const text = (
    p: PDFPage,
    s: string,
    x: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) =>
    p.drawText(winAnsiSafe(s), {
      x,
      y,
      font: o.font ?? f.reg,
      size: o.size ?? 10,
      color: o.color ?? INK,
    });

  const textRight = (
    p: PDFPage,
    s: string,
    xR: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const safe = winAnsiSafe(s);
    const fn = o.font ?? f.reg;
    const sz = o.size ?? 10;
    p.drawText(safe, {
      x: xR - fn.widthOfTextAtSize(safe, sz),
      y,
      font: fn,
      size: sz,
      color: o.color ?? INK,
    });
  };

  // Centred text helper (used on the cover).
  const textCenter = (
    p: PDFPage,
    s: string,
    cx: number,
    y: number,
    o: { font?: PDFFont; size?: number; color?: ReturnType<typeof rgb>; tracking?: number } = {},
  ) => {
    const safe = winAnsiSafe(s);
    const fn = o.font ?? f.reg;
    const sz = o.size ?? 10;
    if (o.tracking) {
      // Letter-spaced small caps (eyebrows) — draw glyph by glyph.
      let w = 0;
      for (const ch of safe) w += fn.widthOfTextAtSize(ch, sz) + o.tracking;
      w -= o.tracking;
      let x = cx - w / 2;
      for (const ch of safe) {
        p.drawText(ch, { x, y, font: fn, size: sz, color: o.color ?? INK });
        x += fn.widthOfTextAtSize(ch, sz) + o.tracking;
      }
      return;
    }
    p.drawText(safe, {
      x: cx - fn.widthOfTextAtSize(safe, sz) / 2,
      y,
      font: fn,
      size: sz,
      color: o.color ?? INK,
    });
  };

  // Content-page header: small colour logo top-left, running ref top-right — kept
  // light and quiet so it never competes with the page's content.
  const header = (p: PDFPage) => {
    const lw = 72;
    const lh = (logoDark.height / logoDark.width) * lw;
    p.drawImage(logoDark, { x: M, y: H - M - lh + 6, width: lw, height: lh });
    textRight(p, doc.ref, W - M, H - M - 2, { size: 8, color: FAINT });
  };

  // Calm footer: a pale hairline, quiet brand + email, plain page number. Called
  // on every content page so the document reads as one considered, paginated piece.
  const footer = (p: PDFPage, pageNum: number) => {
    p.drawLine({
      start: { x: M, y: M - 12 },
      end: { x: W - M, y: M - 12 },
      thickness: 0.5,
      color: LINE,
    });
    let bx = M;
    for (const ch of "LÍQUEN EVENTS") {
      p.drawText(ch, { x: bx, y: M - 26, font: f.bold, size: 6.5, color: FAINT });
      bx += f.bold.widthOfTextAtSize(ch, 6.5) + 1.4;
    }
    textRight(p, SITE.email, W - M, M - 26, { size: 7, color: FAINT });
    textCenter(p, String(pageNum).padStart(2, "0"), W / 2, M - 26, {
      size: 7.5,
      color: FAINT,
    });
  };

  // A page frame = header + footer, returning the starting y for the body.
  let pageNo = 0;
  const frame = (p: PDFPage): number => {
    pageNo += 1;
    header(p);
    footer(p, pageNo);
    return H - M - 84;
  };

  // Quiet uppercase eyebrow/label — pale grey by default so it whispers rather
  // than shouts. The one consistent "voice" for small labels across the document.
  const eyebrow = (p: PDFPage, s: string, x: number, y: number, color = FAINT) => {
    const sz = T_CAPTION;
    let cx = x;
    for (const ch of winAnsiSafe(s.toUpperCase())) {
      p.drawText(ch, { x: cx, y, font: f.bold, size: sz, color });
      cx += f.bold.widthOfTextAtSize(ch, sz) + 2;
    }
  };
  // Section header: a small quiet eyebrow, the serif title, and a very thin, short
  // pale hairline. No colour, no weight — the title alone carries the section.
  const sectionHeader = (p: PDFPage, kicker: string, title: string, y: number): number => {
    eyebrow(p, kicker, M, y);
    text(p, title, M, y - 24, { font: f.serifB, size: T_DISPLAY, color: INK });
    p.drawLine({
      start: { x: M, y: y - 36 },
      end: { x: M + 32, y: y - 36 },
      thickness: 0.6,
      color: LINE,
    });
    return y - 58;
  };

  // ── Page 1 — Cover ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });

    const hasImgs = !!(doc.coverImages[0] || doc.coverImages[1]);
    if (hasImgs) {
      // Two side photos flanking a centre band — the editorial "gatefold" look.
      const panelW = W * 0.34;
      const sideW = (W - panelW) / 2;
      const left = doc.coverImages[0];
      const right = doc.coverImages[1];
      // A capa não leva moldura (foi retirada a pedido), por isso uma foto que
      // não saia não deixa cá rectângulo nenhum — mas continua a ser uma foto
      // que o cliente devia ter visto e não vê, logo é contada. E o `photo`
      // encaminha também a contagem do caminho de recurso: a capa é a maior
      // caixa do documento, é a que mais pesa quando entra sem redimensionar.
      if (left) await photo(p, left, 0, 0, sideW, H, "cover");
      if (right) await photo(p, right, sideW + panelW, 0, sideW, H, "cover");
      p.drawRectangle({ x: sideW, y: 0, width: panelW, height: H, color: DARK });
    }

    const cx = W / 2;
    // No border frame around the cover — removed on request for a cleaner,
    // edge-to-edge look (the two side photos run to the trim).

    // White logo, upper area.
    const lw = 148;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H - 150, width: lw, height: lh });

    // Eyebrow (gold small-caps) + gold rule.
    const kicker =
      doc.template === "organizacao" ? "Proposta · Organização" : "Proposta · Decoração";
    textCenter(p, kicker.toUpperCase(), cx, 336, {
      font: f.bold,
      size: 9,
      color: rgb(0.72, 0.6, 0.34),
      tracking: 3.2,
    });
    p.drawRectangle({ x: cx - 26, y: 324, width: 52, height: 1.1, color: rgb(0.72, 0.6, 0.34) });

    // Couple/client name — shrink-to-fit, then wrap to two lines as a last resort
    // so long names never overflow the trim or the centre band.
    // Sanitiza para WinAnsi ANTES de medir: widthOfTextAtSize lança em glifos
    // fora do WinAnsi (emoji/CJK num nome de cliente), o que rebentaria o PDF
    // inteiro aqui na capa em vez de degradar graciosamente.
    const names = winAnsiSafe(doc.clientNames || "");
    const maxNameW = (hasImgs ? W * 0.34 : W * 0.72) - 16;
    let nameSize = 52;
    while (nameSize > 26 && f.serif.widthOfTextAtSize(names, nameSize) > maxNameW) nameSize -= 2;
    if (f.serif.widthOfTextAtSize(names, nameSize) > maxNameW) {
      // Duas linhas é o que a capa comporta; um nome que peça mais é cortado —
      // e um nome cortado na capa é a primeira coisa que o cliente vê.
      const nl = clampLines(
        wrap(f.serif, names, nameSize, maxNameW),
        MAX_COVER_NAME_LINES,
        "Nome na capa",
      );
      let ny = 278;
      for (const ln of nl) {
        textCenter(p, ln, cx, ny, { font: f.serif, size: nameSize, color: CREAM });
        ny -= nameSize * 1.05;
      }
    } else {
      textCenter(p, names, cx, 262, { font: f.serif, size: nameSize, color: CREAM });
    }

    const sub = [doc.eventType, doc.eventDate].filter(Boolean).join("   ·   ");
    if (sub)
      textCenter(p, sub, cx, 214, { font: f.reg, size: 11, color: CREAM_DIM, tracking: 1.4 });
    if (doc.location)
      textCenter(p, doc.location, cx, 194, { font: f.serifIt, size: 11, color: FAINT });
  }

  // ── Page 2 — Apresentação + Serviços ──
  {
    const org = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    const ensure = (need: number) => {
      if (y - need < M + 6) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };
    y = sectionHeader(p, "A Proposta", "Apresentação", y);

    // Client / couple name in serif — the personal headline of the document.
    eyebrow(p, org ? "Cliente" : "Noivos", M, y);
    text(p, doc.clientNames, M, y - 24, { font: f.serif, size: T_DISPLAY, color: INK });
    y -= 52;

    // Warm opening — a short, personalised welcome sets the tone before the facts.
    // Kept to a comfortable measure so it never runs edge to edge.
    const evento = (doc.eventType || "evento").toLowerCase();
    const nomes = doc.clientNames || (org ? "Cliente" : "Noivos");
    const welcome =
      `Caros ${nomes}, foi com muito gosto que preparámos esta proposta para o vosso ${evento}. ` +
      "Reunimos aqui a nossa visão, pensada ao pormenor para tornar este momento único. " +
      "Estamos ao vosso lado em cada passo.";
    for (const ln of wrap(f.serifIt, welcome, 11.5, MEASURE)) {
      text(p, ln, M, y, { font: f.serifIt, size: 11.5, color: MUTED });
      y -= 17;
    }
    y -= 26;

    // Event details as a calm tinted band of labelled columns.
    const details: [string, string][] = [
      ...(!org && doc.eventType ? ([["Evento", doc.eventType]] as [string, string][]) : []),
      ...(doc.eventDate ? ([["Data", doc.eventDate]] as [string, string][]) : []),
      ...(doc.location ? ([["Local", doc.location]] as [string, string][]) : []),
      ...(doc.guests ? ([["Convidados", doc.guests]] as [string, string][]) : []),
      ...(!org && doc.ceremony ? ([["Cerimónia", doc.ceremony]] as [string, string][]) : []),
      ...(!org && doc.time ? ([["Hora", doc.time]] as [string, string][]) : []),
      ...(!org && doc.weddingPlanners
        ? ([["Wedding Planners", doc.weddingPlanners]] as [string, string][])
        : []),
    ];
    if (details.length) {
      // Flat, borderless key–value row: tiny grey label over a quiet serif value,
      // generously spaced, framed by a single pale hairline above. No fill, no bar.
      const cols = Math.min(4, details.length);
      const rows = Math.ceil(details.length / cols);
      const colW = (W - 2 * M) / cols;
      const rowH = 48;
      p.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5, color: LINE });
      const top = y - 24;
      details.forEach(([k, v], i) => {
        const r = Math.floor(i / cols);
        const c = i % cols;
        const cxp = M + c * colW;
        const cyp = top - r * rowH;
        eyebrow(p, k, cxp, cyp);
        // Duas linhas por campo — um local com nome comprido ("Herdade da …,
        // Reguengos de Monsaraz") pede três e perdia o resto.
        for (const [j, ln] of clampLines(
          wrap(f.reg, v, 11, colW - 16),
          MAX_EVENT_FIELD_LINES,
          `Campo «${k}»`,
        ).entries()) {
          text(p, ln, cxp, cyp - 16 - j * 13, { font: f.serif, size: 11.5, color: INK });
        }
      });
      y = top - (rows - 1) * rowH - 42;
    }

    y = sectionHeader(p, "O que propomos", "Serviços", y);
    const descSize = org ? 9.5 : T_BODY;
    for (const g of doc.serviceGroups) {
      ensure(30);
      // Group title in serif; the ordinal marker stays quiet grey, not coloured.
      if (g.letter) text(p, g.letter, M, y, { font: f.serifB, size: T_SUB, color: MUTED });
      const letterW = g.letter ? f.serifB.widthOfTextAtSize(winAnsiSafe(g.letter) + " ", T_SUB) : 0;
      text(p, g.title, M + letterW, y, {
        font: f.serifB,
        size: T_SUB,
        color: INK,
      });
      y -= 22;
      for (const it of g.items) {
        p.drawCircle({ x: M + 12, y: y + 3, size: 1.2, color: FAINT });
        if (it.desc) {
          // Sanitiza aqui também: `lab` é medido diretamente com
          // widthOfTextAtSize (que lança em glifos fora do WinAnsi).
          const lab = winAnsiSafe(`${it.label}: `);
          text(p, lab, M + 24, y, { font: f.bold, size: descSize });
          const dx = M + 24 + f.bold.widthOfTextAtSize(lab, descSize);
          const lines = wrap(f.reg, it.desc, descSize, W - M - dx);
          text(p, lines[0] ?? "", dx, y, { size: descSize });
          y -= descSize + 6;
          for (let i = 1; i < lines.length; i++) {
            ensure(descSize + 4);
            text(p, lines[i], M + 24, y, { size: descSize });
            y -= descSize + 5;
          }
        } else {
          text(p, it.label, M + 24, y, { size: descSize });
          y -= descSize + 6;
        }
        ensure(descSize + 8);
      }
      y -= 8;
    }
  }

  // ── Cronograma de Organização (Organização template) ──
  if (doc.cronograma && doc.cronograma.length) {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, "Como avançamos", "Cronograma de Organização", y);
    for (const phase of doc.cronograma) {
      if (y - 24 < M + 24) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      text(p, phase.title, M, y, { font: f.serifB, size: T_SUB, color: INK });
      y -= 20;
      for (const it of phase.items) {
        const lines = wrap(f.reg, it, T_BODY, MEASURE + 120);
        p.drawCircle({ x: M + 12, y: y + 3, size: 1.2, color: FAINT });
        for (const ln of lines) {
          text(p, ln, M + 24, y, { size: T_BODY });
          y -= 15;
        }
      }
      y -= 14;
    }
  }

  // ── Mood board pages (skip empty boards — never show a client a placeholder) ──
  for (const [bi, mb] of doc.moodBoards.entries()) {
    if (!mb.images || mb.images.length === 0) continue;
    const p = pdf.addPage([W, H]);
    frame(p);
    eyebrow(p, "Inspiração", M, H - M - 48);
    text(p, mb.title, M, H - M - 76, { font: f.serifIt, size: 24, color: INK });
    // Como o mood board se chama num aviso. Sem título, vale a posição — é
    // assim que ele aparece no estúdio, contado a partir de 1.
    const boardName = mb.title.trim() ? `«${mb.title.trim()}»` : `${bi + 1}`;
    await drawCollage(
      pdf,
      p,
      mb,
      f,
      textFns(text, textRight),
      images,
      boardName,
      note,
      noteUndrawn,
      contarRecurso,
    );
  }

  // ── Orçamento ──
  {
    // Branch on TEMPLATE, not on whether rows exist — an Organização proposal
    // with no priced rows must never fall into the Decoração reserva wording.
    const orgT = doc.template === "organizacao";
    let p = pdf.addPage([W, H]);
    const firstBudgetPage = p;
    frame(p);
    let y = H - M - 64;
    y = sectionHeader(p, "O investimento", "Orçamento Proposto", y);

    const totalStr = orgT ? (doc.totalEstimatedText ?? "") : doc.totalText;
    const totalLbl = orgT ? "Total Estimado" : doc.totalLabel;
    const boxW = MEASURE;
    const boxH = 50;
    // Flat, typographic total: a single thin gold hairline (the one accent moment
    // in the interior), a quiet grey label and the amount in serif ink. No fill.
    const drawTotal = (pg: PDFPage, ty: number) => {
      pg.drawLine({
        start: { x: M, y: ty },
        end: { x: M + boxW, y: ty },
        thickness: 1,
        color: GOLD,
      });
      text(pg, totalLbl, M, ty - 26, { font: f.serifB, size: 13, color: INK });
      const amount = totalStr || "—";
      pg.drawText(winAnsiSafe(amount), {
        x: M + boxW - f.serifB.widthOfTextAtSize(winAnsiSafe(amount), 22),
        y: ty - 32,
        font: f.serifB,
        size: 22,
        color: INK,
      });
    };

    // Column header row — bold sentence-case (matching the studio's sample
    // proposals: "Item" / "Preço Estimado (€)"), one pale rule underneath.
    text(p, "Item", M, y, { font: f.serifB, size: 11, color: INK });
    textRight(p, orgT ? "Preço Estimado (€)" : "Preço (€)", M + boxW, y, {
      font: f.serifB,
      size: 11,
      color: INK,
    });
    y -= 14;
    p.drawLine({ start: { x: M, y }, end: { x: M + boxW, y }, thickness: 0.5, color: LINE });
    y -= 22;

    // Start a fresh page when the next row (or block) won't fit above the footer.
    const budgetBreak = (need: number) => {
      if (y - need < M + 30) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
    };

    // Reserve room on the right of each row for the price/value column so a long
    // item name wraps onto extra lines instead of running through the amount (and
    // on into the "Notas importantes" column). ~120pt covers "12.500,00 € + IVA".
    const PRICE_COL = 120;
    if (orgT) {
      for (const r of doc.budgetRows ?? []) {
        const lines = wrap(f.reg, r.item, 10.5, boxW - PRICE_COL);
        budgetBreak(Math.max(20, lines.length * 15));
        lines.forEach((ln, i) => {
          text(p, ln, M, y, { size: 10.5, color: INK });
          if (i === 0) textRight(p, r.price, M + boxW, y, { size: 10.5, color: MUTED });
          y -= 15;
        });
        y -= 5;
      }
    } else {
      // As linhas assinaladas como EXTRA saem marcadas, para o casal poder ler
      // a proposta uma vez e ver as duas versões nela. A marca é uma palavra à
      // direita e não uma segunda lista: partir o orçamento em dois quadros
      // fazia parecer duas propostas, que é precisamente o que isto vem
      // substituir. Ver `orcamento/versoes-da-proposta.ts`.
      const marcas = opcionaisDe(doc);
      doc.budgetItems.forEach((it, i) => {
        const lines = wrap(f.reg, it, 10.5, boxW - 14 - (marcas[i] ? 46 : 0));
        budgetBreak(Math.max(20, lines.length * 15));
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.2, color: FAINT });
        lines.forEach((ln, j) => {
          text(p, ln, M + 14, y, { size: 10.5, color: INK });
          if (j === 0 && marcas[i]) {
            textRight(p, "extra", M + boxW, y, { size: 9, color: MUTED });
          }
          y -= 15;
        });
        y -= 5;
      });
    }

    budgetBreak(boxH + 24);
    y -= 16;
    drawTotal(p, y);
    y -= boxH + 20;

    // ── A versão SEM os extras ─────────────────────────────────────────────
    // O total grande é a proposta inteira; por baixo dele, e só quando há
    // linhas assinaladas, a mesma proposta sem elas. É o que permite responder
    // ao "e sem isso, quanto fica?" sem uma segunda proposta a divergir desta.
    //
    // Um extra sem preço não se desconta, e nesse caso os dois números sairiam
    // iguais — melhor não desenhar nada do que desenhar duas vezes o mesmo
    // número com rótulos diferentes.
    const versoes = totaisDasVersoes(doc, doc.totalAmount ?? 0);
    if (versoes && versoes.base > 0 && versoes.extras > 0) {
      const maisIva = doc.totalVatMode === "acrescer" ? " + IVA" : "";
      budgetBreak(40);
      text(p, "Sem os extras assinalados", M, y, { size: 10.5, color: MUTED });
      textRight(p, `${eur(versoes.base)}${maisIva}`, M + boxW, y, {
        font: f.serif,
        size: 13,
        color: INK,
      });
      y -= 16;
      text(
        p,
        versoes.linhasExtra === 1
          ? "A linha assinalada com «extra» é opcional e pode ser retirada."
          : `As ${versoes.linhasExtra} linhas assinaladas com «extra» são opcionais e podem ser retiradas.`,
        M,
        y,
        { size: 9, color: MUTED },
      );
      y -= 22;
    }

    // Extra budget lines — per-couple add-ons shown right under the total, exactly
    // as in the studio's real proposals (Deslocação da equipa, Wedding Coordinator,
    // Tecidos suspensos, Mobiliário opção A/B, …). Display-only free text; the
    // billed total / 30-70 split come from the structured total above.
    const extras = (doc.budgetExtras ?? []).filter(
      (e) => (e.label ?? "").trim() || (e.valueText ?? "").trim(),
    );
    if (extras.length) {
      budgetBreak(24 + extras.length * 18);
      eyebrow(p, "Valores adicionais", M, y);
      y -= 18;
      for (const ex of extras) {
        const lines = wrap(f.reg, ex.label, 10.5, boxW - PRICE_COL);
        budgetBreak(Math.max(18, lines.length * 14));
        lines.forEach((ln, i) => {
          text(p, ln, M, y, { size: 10.5, color: INK });
          if (i === 0) textRight(p, ex.valueText, M + boxW, y, { size: 10.5, color: MUTED });
          y -= 14;
        });
        y -= 4;
      }
      y -= 8;
    }

    // Payment schedule with the actual amounts (30% sinal / 70% saldo) — the
    // clarity a client wants right under the total. Amounts come from the same
    // money resolver the invoicing uses, so they always agree.
    const money = resolveProposalMoney(doc);
    if (money.gross > 0) {
      const { sinal, saldo } = splitThirtySeventy(money.gross);
      budgetBreak(58);
      eyebrow(p, "Faseamento do pagamento", M, y);
      y -= 18;
      text(p, `Sinal 30%   ${eur(sinal)}`, M, y, { font: f.serif, size: 12, color: INK });
      textRight(p, "na adjudicação, para reservar a data", M + boxW, y, {
        size: 9.5,
        color: MUTED,
      });
      y -= 17;
      text(p, `Saldo 70%   ${eur(saldo)}`, M, y, { font: f.serif, size: 12, color: INK });
      textRight(p, "até 1 mês antes do evento", M + boxW, y, { size: 9.5, color: MUTED });
      y -= 20;
    }

    if (doc.budgetNote) {
      budgetBreak(30);
      for (const ln of wrap(f.reg, `Nota: ${doc.budgetNote}`, 9, boxW)) {
        text(p, ln, M, y, { size: 9, color: MUTED });
        y -= 13;
      }
    }

    // Reservation notes — a right-hand column, anchored on the FIRST budget page
    // (independent of how far the left list paginated). Shown for both templates.
    let ry = H - M - 64;
    const rx = M + 490;
    const rW = W - M - rx;
    const rHead = (t: string) => {
      text(firstBudgetPage, t, rx, ry, { font: f.serifB, size: T_SUB, color: INK });
      ry -= 22;
    };
    rHead("Notas importantes");
    ry = bullets(firstBudgetPage, doc.notasImportantes, rx, ry, rW, f, 8.5);
    ry -= 16;
    rHead("Condições de reserva");
    eyebrow(firstBudgetPage, "Incluído na proposta", rx, ry);
    ry -= 14;
    ry = bullets(firstBudgetPage, doc.incluido, rx, ry, rW, f, 8.5);
    ry -= 10;
    eyebrow(firstBudgetPage, "Não incluído", rx, ry);
    ry -= 14;
    bullets(firstBudgetPage, doc.naoIncluido, rx, ry, rW, f, 8.5);
  }

  // ── Condições Gerais (two columns for a comfortable reading measure) ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    const yTop = sectionHeader(p, "Para sua tranquilidade", "Condições Gerais", H - M - 64);
    const gutter = 34;
    const colW = (W - 2 * M - gutter) / 2;
    const colX = [M, M + colW + gutter];
    let col = 0;
    let y = yTop;
    for (const c of doc.condicoesGerais) {
      const lines = wrap(f.reg, c, 9, colW - 14);
      if (y - lines.length * 12 - 6 < M + 4) {
        // Column full → next column, or a new page after the second column.
        if (col === 0) {
          col = 1;
          y = yTop;
        } else {
          p = pdf.addPage([W, H]);
          frame(p);
          col = 0;
          y = H - M - 64;
        }
      }
      const x = colX[col];
      p.drawCircle({ x: x + 3, y: y + 3, size: 1.2, color: FAINT });
      for (const ln of lines) {
        text(p, ln, x + 14, y, { size: 9 });
        y -= 12;
      }
      y -= 8;
    }
  }

  // ── Observações / Faseamento / Cancelamento / Contactos ──
  {
    let p = pdf.addPage([W, H]);
    frame(p);
    let y = H - M - 64;
    const maxW = MEASURE; // capped reading measure
    const subHead = (title: string) => {
      if (y - 40 < M + 24) {
        p = pdf.addPage([W, H]);
        frame(p);
        y = H - M - 64;
      }
      text(p, title, M, y, { font: f.serifB, size: T_SUB, color: INK });
      y -= 24;
    };
    const section = (title: string, items: string[], size = 9) => {
      subHead(title);
      for (const it of items) {
        const lines = wrap(f.reg, it, size, maxW - 16);
        if (y - lines.length * 12 < M + 24) {
          p = pdf.addPage([W, H]);
          frame(p);
          y = H - M - 64;
        }
        p.drawCircle({ x: M + 3, y: y + 3, size: 1.2, color: FAINT });
        for (const ln of lines) {
          text(p, ln, M + 14, y, { size });
          y -= 12;
        }
        y -= 6;
      }
      y -= 18;
    };

    // Próximos passos — the clear "what happens next", with the validity date.
    const validUntil = prettyDate(resolveValidUntil(doc));
    subHead("Próximos Passos");
    for (const line of [
      "Para confirmar esta proposta, basta aceitá-la online através da ligação enviada no e-mail, ou responder-nos diretamente.",
      "A reserva da data só fica garantida após o pagamento do sinal.",
      `Esta proposta é válida até ${validUntil}.`,
    ]) {
      const lines = wrap(f.reg, line, 10, maxW - 16);
      p.drawCircle({ x: M + 3, y: y + 3, size: 1.2, color: FAINT });
      for (const ln of lines) {
        text(p, ln, M + 14, y, { size: 10 });
        y -= 14;
      }
      y -= 4;
    }
    y -= 18;

    section("Observações Gerais", doc.observacoesGerais);
    section("Faseamento do Pagamento", doc.faseamento);
    section("Cancelamento", doc.cancelamento);

    // Contactos
    subHead("Contactos");
    eyebrow(p, "Email", M, y);
    text(p, SITE.email, M + 70, y, { size: 10.5, color: INK });
    y -= 18;
    eyebrow(p, "Telefone", M, y);
    text(p, SITE.phoneDisplay, M + 70, y, { size: 10.5, color: INK });
  }

  // ── Back cover — mirrors the front cover's gatefold so the document opens and
  //    closes on the same image: two side photos flanking a dark centre band,
  //    with a quiet closing note in the middle. ──
  {
    const p = pdf.addPage([W, H]);
    p.drawRectangle({ x: 0, y: 0, width: W, height: H, color: DARK });

    const hasImgs = !!(doc.coverImages[0] || doc.coverImages[1]);
    if (hasImgs) {
      // Same gatefold geometry as page 1 so the covers bookend each other.
      const panelW = W * 0.34;
      const sideW = (W - panelW) / 2;
      const left = doc.coverImages[0];
      const right = doc.coverImages[1];
      // A capa não leva moldura (foi retirada a pedido), por isso uma foto que
      // não saia não deixa cá rectângulo nenhum — mas continua a ser uma foto
      // que o cliente devia ter visto e não vê, logo é contada. E o `photo`
      // encaminha também a contagem do caminho de recurso: a capa é a maior
      // caixa do documento, é a que mais pesa quando entra sem redimensionar.
      if (left) await photo(p, left, 0, 0, sideW, H, "cover");
      if (right) await photo(p, right, sideW + panelW, 0, sideW, H, "cover");
      p.drawRectangle({ x: sideW, y: 0, width: panelW, height: H, color: DARK });
    }

    // No border frame — removed on request, matching the front cover.

    const cx = W / 2;
    // Keep every line inside the centre band so text never spills onto the
    // photos; wrap to the band width when images flank the page.
    const bandW = (hasImgs ? W * 0.34 : W * 0.72) - 24;
    textCenter(p, "OBRIGADA", cx, H * 0.62, {
      font: f.bold,
      size: 9,
      color: rgb(0.72, 0.6, 0.34),
      tracking: 3,
    });
    let my = H * 0.56;
    for (const ln of wrap(f.serifIt, "Por nos deixarem fazer parte deste momento.", 13, bandW)) {
      textCenter(p, ln, cx, my, { font: f.serifIt, size: 13, color: CREAM });
      my -= 13 * 1.3;
    }
    const lw = 168;
    const lh = (logoWhite.height / logoWhite.width) * lw;
    p.drawImage(logoWhite, { x: cx - lw / 2, y: H * 0.3, width: lw, height: lh });
    let sy = H * 0.3 - 18;
    for (const ln of wrap(f.serifIt, SITE.slogan, 10.5, bandW)) {
      textCenter(p, ln, cx, sy, { font: f.serifIt, size: 10.5, color: CREAM_DIM });
      sy -= 10.5 * 1.3;
    }
  }

  if (semRedimensionar > 0) {
    // ERRO e não aviso: o PDF sai, mas sai pesado a abrir e a percorrer, e até
    // aqui isso acontecia sem deixar rasto nenhum. Um PDF verdadeiro de
    // 3,31 MB chegou com as fotos a 266–576 DPI por este caminho.
    log.error("proposal-doc-pdf: fotos embutidas SEM redimensionar", null, {
      quantas: semRedimensionar,
      ref: doc.ref,
      porque:
        "o sharp falhou e usou-se o original. O PDF fica pesado a abrir. " + "Ver PDF-BEFORE.md.",
    });
  }
  return { bytes: await pdf.save(), truncations, undrawnImages: undrawn.size, semRedimensionar };
}

// Small helper factory so the collage function can reuse the closures.
function textFns(
  text: (p: PDFPage, s: string, x: number, y: number, o?: object) => void,
  textRight: (p: PDFPage, s: string, xR: number, y: number, o?: object) => void,
) {
  return { text, textRight };
}

/** Auto-layout collage of a mood board's images across the page body. */
async function drawCollage(
  pdf: PDFDocument,
  p: PDFPage,
  mb: MoodBoard,
  f: Fonts,
  fns: ReturnType<typeof textFns>,
  cache: EmbedCache,
  boardName: string,
  note: NoteTruncation,
  noteUndrawn: NoteUndrawn,
  /** Ver `renderProposalDocPdfWithReport`: conta as fotos que entram sem
   *  serem redimensionadas, para a proposta poder dizer que saiu pesada. */
  contarRecurso: () => void,
) {
  // Wrap the annotation (description + optional flower list) to the page measure
  // up front so the collage reserves exactly the height the caption needs. Capped
  // at 5 lines so a very long note never crowds out the photos — o que passa
  // disso é anotado, não desaparece calado.
  const annAll = mb.annotation ? wrap(f.serifIt, mb.annotation, 11, W - 2 * M) : [];
  note(`Descrição do mood board ${boardName}`, annAll.length - MAX_ANNOTATION_LINES, "linhas");
  const annLines = annAll.slice(0, MAX_ANNOTATION_LINES);
  const annH = annLines.length ? annLines.length * 15 + 12 : 8;
  const top = H - M - 112;
  const bottom = M + annH;
  const areaW = W - 2 * M;
  const areaH = top - bottom;
  // O collage tem lugar para MOOD_BOARD_MAX_IMAGES fotos. As restantes JÁ
  // FORAM descarregadas do armazenamento com sucesso e mesmo assim não são
  // desenhadas — é a perda que este aviso existe para tornar visível.
  const imgs = mb.images.slice(0, MOOD_BOARD_MAX_IMAGES);
  note(`Mood board ${boardName}`, mb.images.length - MOOD_BOARD_MAX_IMAGES, "fotos");
  const n = imgs.length;
  const gap = 8;

  // Draw one framed image into a box (cover-cropped, thin hairline frame).
  //
  // A MOLDURA SÓ EXISTE SE A FOTO EXISTIR. Era isto que faltava: o contorno era
  // desenhado sempre, mesmo quando o desenho da foto falhava, e a página saía
  // com rectângulos vazios (seis molduras, duas fotos, numa proposta que já
  // tinha seguido para o cliente). Uma caixa vazia num documento que o cliente
  // vê é pior do que não haver caixa — o collage não tem lugares fixos, o resto
  // das fotos ocupa a página na mesma. E a foto que não saiu é CONTADA, para o
  // estúdio ser avisado antes de enviar.
  const place = async (b64: string, x: number, yBottom: number, w: number, h: number) => {
    const drawn = await drawCoverImage(
      pdf,
      p,
      b64,
      x,
      yBottom,
      w,
      h,
      "collage",
      cache,
      contarRecurso,
    );
    if (!drawn) {
      noteUndrawn(b64);
      return;
    }
    p.drawRectangle({ x, y: yBottom, width: w, height: h, borderColor: LINE, borderWidth: 0.5 });
  };

  if (n === 1) {
    await place(imgs[0], M, bottom, areaW, areaH);
  } else if (n === 2) {
    const cw = (areaW - gap) / 2;
    await place(imgs[0], M, bottom, cw, areaH);
    await place(imgs[1], M + cw + gap, bottom, cw, areaH);
  } else {
    // Feature layout: a large left image + the rest as a grid on the right.
    const featW = areaW * 0.56;
    await place(imgs[0], M, bottom, featW, areaH);
    const rest = imgs.slice(1);
    const rx = M + featW + gap;
    const rW = areaW - featW - gap;
    const rCols = rest.length <= 2 ? 1 : 2;
    const rRows = Math.ceil(rest.length / rCols);
    const cw = (rW - gap * (rCols - 1)) / rCols;
    const ch = (areaH - gap * (rRows - 1)) / rRows;
    for (let i = 0; i < rest.length; i++) {
      const r = Math.floor(i / rCols);
      const c = i % rCols;
      const x = rx + c * (cw + gap);
      const yTop = top - r * (ch + gap);
      await place(rest[i], x, yTop - ch, cw, ch);
    }
  }

  if (annLines.length) {
    let ay = bottom - 15;
    for (const ln of annLines) {
      fns.text(p, ln, M, ay, { font: f.serifIt, size: 11, color: MUTED });
      ay -= 15;
    }
  }
}

function bullets(
  p: PDFPage,
  items: string[],
  x: number,
  y: number,
  maxW: number,
  f: Fonts,
  size: number,
): number {
  for (const it of items) {
    const lines = wrap(f.reg, it, size, maxW - 12);
    p.drawCircle({ x: x + 2, y: y + 3, size: 1.1, color: FAINT });
    for (const ln of lines) {
      p.drawText(ln, { x: x + 11, y, font: f.reg, size, color: INK });
      y -= size + 3;
    }
    y -= 3;
  }
  return y;
}
