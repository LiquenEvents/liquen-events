"use client";

/**
 * Client-side image preparation for the proposal studio uploads (covers +
 * mood boards) and for the theme library.
 *
 * Why this exists: the team uploads photos straight from phones/cameras
 * (3–10 MB, often HEIC on iPhone). The serverless host rejects request bodies
 * over ~4.5 MB and the API only accepts JPG/PNG/WEBP — so "big real photo"
 * failed while small screenshots worked, which read as "às vezes não funciona".
 *
 * Fix: decode in the browser, downscale to a sane long edge and re-encode as
 * JPEG before uploading. A proposal PDF never needs more than ~2000 px. This
 * also converts HEIC → JPEG wherever the browser can decode HEIC (Safari/iOS —
 * exactly where HEIC files come from).
 *
 * The theme library additionally needs a THUMBNAIL per photo (see
 * `prepareImageWithThumb`): its grid shows hundreds of photos at ~150 px, and
 * pulling the 3000 px originals to draw them was the reason a big theme took
 * hundreds of MB to open. The thumbnail is produced from the SAME decoded
 * bitmap as the original — decoding twice would double the cost of a 300-photo
 * upload, which is the exact batch size we are sizing for.
 */

const SUPPORTED = /^image\/(jpe?g|png|webp)$/i;

/**
 * Per-use-case encode targets. Cover photos are printed LARGE in the proposal
 * (up to ~half the landscape A4 ≈ 300 DPI wants ~2500–3000 px) and are the hero
 * of the document, so they keep more pixels and a higher JPEG quality. Mood-board
 * photos render as small collage cells (a few hundred px each), so a tighter cap
 * keeps a board of 8–12 photos light without any visible loss.
 *
 * The 4.5 MB serverless body limit applies PER image (uploads are one file per
 * request), so a 3000 px cover at q0.92 (~2.5–3.5 MB) stays comfortably under it.
 * The thumbnail that travels with it adds ~30–60 KB — noise, at that scale.
 */
export type ImageKind = "cover" | "board";
const PRESETS: Record<ImageKind, { maxEdge: number; quality: number; keepBytes: number }> = {
  // Covers: bigger + higher quality (printed large, the document's hero image).
  cover: { maxEdge: 3000, quality: 0.92, keepBytes: 1_500_000 },
  // Mood boards: rendered as small cells → a tighter cap keeps boards snappy.
  board: { maxEdge: 1600, quality: 0.82, keepBytes: 1_000_000 },
};

/**
 * Miniatura da biblioteca de temas: 400 px de lado maior, q0.72 (~25–50 KB).
 *
 * A célula da grelha tem ~150 px de lado; 400 px cobre um ecrã Retina (2×) com
 * folga e ainda serve para a pré-visualização média do seletor de propostas.
 * Uma página de 100 miniaturas fica em ~3–5 MB — contra os ~300 MB que as
 * mesmas 100 fotos originais custavam.
 */
export const THUMB_EDGE = 400;
const THUMB_QUALITY = 0.72;

/** Target width/height after capping the long edge (pure — unit-tested). */
export function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Should this file skip re-encoding entirely? (pure — unit-tested)
 *  A supported file that is BOTH small in bytes and already within the kind's
 *  pixel cap is sent untouched (no re-encode, no quality loss). We can't read
 *  pixels here, so this is the byte-size gate; oversize-dimension files fall
 *  through to the canvas path which enforces the cap. */
export function keepOriginal(type: string, size: number, kind: ImageKind = "cover"): boolean {
  return SUPPORTED.test(type) && size <= PRESETS[kind].keepBytes;
}

/**
 * Vale a pena gerar miniatura para uma foto deste tamanho? (puro — testado)
 *
 * Uma foto que já é pequena não ganha nada com um segundo ficheiro: a poupança
 * seria marginal e o custo (mais um upload, mais um objeto no bucket para
 * limpar) é o mesmo. Sem miniatura, a grelha cai no original — que neste caso
 * já é leve. A margem de 25 % evita gerar uma miniatura de 400 px a partir de
 * uma foto de 420 px.
 */
export function needsThumb(w: number, h: number): boolean {
  return Math.max(w, h) > THUMB_EDGE * 1.25;
}

/** Nome do ficheiro da miniatura (puro — testado). Só para leitura humana nos
 *  registos: o servidor guarda a miniatura com a MESMA chave do original, no
 *  bucket das miniaturas. */
export function thumbFileName(name: string): string {
  return jpegName(name).replace(/\.jpg$/i, ".thumb.jpg");
}

/** O mesmo nome, com extensão .jpg (o que sai do canvas é sempre JPEG). */
function jpegName(name: string): string {
  return name.replace(/\.[^.]+$/, "") + ".jpg";
}

/** O par que sobe para a biblioteca: o original preparado + a miniatura. */
export interface PreparedImage {
  /** A foto a guardar (o original comprimido, ou o ficheiro tal e qual). */
  file: File;
  /** A miniatura, ou `null` quando não se justifica / não foi possível criar.
   *  Nunca é motivo para falhar o carregamento: sem miniatura a grelha usa o
   *  original, exatamente como faz com as fotos anteriores a esta funcionalidade. */
  thumb: File | null;
}

type Source = ImageBitmap | HTMLImageElement;

async function decode(file: File): Promise<Source> {
  try {
    return await createImageBitmap(file);
  } catch {
    // Fallback path (older Safari, or types createImageBitmap won't take).
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("decode-failed"));
      };
      img.src = url;
    });
  }
}

/** Desenha a fonte num canvas do tamanho pedido. `null` = sem contexto 2D. */
function drawTo(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  // Redução de 3000 → 400 px num só passo cria serrilhado nos browsers que
  // usam a interpolação rápida; isto pede a boa (é o que o Chrome/Safari já
  // fazem por omissão, mas não é garantido).
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(source, 0, 0, w, h);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

function sizeOf(source: Source): { w: number; h: number } {
  return "naturalWidth" in source
    ? { w: source.naturalWidth, h: source.naturalHeight }
    : { w: source.width, h: source.height };
}

/**
 * O trabalho comum: descodifica UMA vez e produz o original (e, se pedido, a
 * miniatura) a partir dessa mesma bitmap.
 *
 * A miniatura é desenhada a partir do canvas já reduzido, e não da bitmap
 * original — dois passos de redução dão menos serrilhado do que um salto de
 * 4000 → 400 px, e desenhar a partir de 3000 px em vez de 4000 px é mais
 * barato. Só quando não há canvas (ficheiro enviado tal e qual) é que se
 * desenha diretamente da fonte.
 */
async function prepare(file: File, kind: ImageKind, wantThumb: boolean): Promise<PreparedImage> {
  const preset = PRESETS[kind];
  const keep = keepOriginal(file.type, file.size, kind);
  // Sem miniatura a pedir, um ficheiro já pequeno e suportado nem sequer é
  // descodificado — é o caminho barato que o estúdio de propostas já usava.
  if (keep && !wantThumb) return { file, thumb: null };

  let source: Source;
  try {
    source = await decode(file);
  } catch {
    // Formato suportado que este browser não descodifica: sobe tal e qual e
    // fica sem miniatura (a grelha usa o original).
    if (SUPPORTED.test(file.type)) return { file, thumb: null };
    throw new Error(
      `"${file.name}" não é suportada neste navegador. Converta para JPG e tente de novo.`,
    );
  }

  try {
    const { w: sw, h: sh } = sizeOf(source);

    // 1) O original.
    let out = file;
    let base: CanvasImageSource = source;
    let bw = sw;
    let bh = sh;
    if (!keep) {
      const { w, h } = fitWithin(sw, sh, preset.maxEdge);
      const canvas = drawTo(source, w, h);
      const blob = canvas ? await encode(canvas, preset.quality) : null;
      if (!canvas || !blob) {
        // Sem canvas não há nada a fazer: um formato suportado ainda pode
        // subir tal e qual; um HEIC, não.
        if (!SUPPORTED.test(file.type)) {
          throw new Error(`Não foi possível processar "${file.name}". Converta para JPG.`);
        }
      } else {
        out = new File([blob], jpegName(file.name), { type: "image/jpeg" });
        base = canvas;
        bw = w;
        bh = h;
      }
    }

    // 2) A miniatura, da mesma bitmap. Qualquer falha aqui é silenciosa: a
    //    miniatura é derivada e dispensável, e perder o carregamento da foto
    //    por causa dela seria trocar o essencial pelo acessório.
    let thumb: File | null = null;
    if (wantThumb && needsThumb(bw, bh)) {
      const t = fitWithin(bw, bh, THUMB_EDGE);
      const canvas = drawTo(base, t.w, t.h);
      const blob = canvas ? await encode(canvas, THUMB_QUALITY) : null;
      if (blob) thumb = new File([blob], thumbFileName(file.name), { type: "image/jpeg" });
    }

    return { file: out, thumb };
  } finally {
    // Só depois de AMBOS os desenhos: fechar a bitmap a seguir ao primeiro
    // deixava a miniatura sem fonte.
    if ("close" in source) source.close();
  }
}

/**
 * Downscale + re-encode an image for upload. Returns the original file when
 * it is already small and in a supported format. Throws a user-readable
 * (pt-PT) error when the browser cannot decode the file at all.
 */
export async function prepareImageForUpload(file: File, kind: ImageKind = "cover"): Promise<File> {
  return (await prepare(file, kind, false)).file;
}

/**
 * Como `prepareImageForUpload`, mas devolve também a miniatura — para a
 * Biblioteca de Temas, onde a grelha nunca deve puxar os originais.
 *
 * Uma única descodificação serve os dois ficheiros: num lote de 300 fotos, a
 * descodificação é o passo caro e duplicá-la duplicaria o tempo do lote.
 */
export async function prepareImageWithThumb(
  file: File,
  kind: ImageKind = "cover",
): Promise<PreparedImage> {
  return prepare(file, kind, true);
}
