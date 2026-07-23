"use client";

/**
 * Client-side image preparation for the proposal studio uploads (covers +
 * mood boards).
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
 */
export type ImageKind = "cover" | "board";
const PRESETS: Record<ImageKind, { maxEdge: number; quality: number; keepBytes: number }> = {
  // Covers: bigger + higher quality (printed large, the document's hero image).
  cover: { maxEdge: 3000, quality: 0.92, keepBytes: 1_500_000 },
  // Mood boards: rendered as small cells → a tighter cap keeps boards snappy.
  board: { maxEdge: 1600, quality: 0.82, keepBytes: 1_000_000 },
};

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

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
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

/**
 * Downscale + re-encode an image for upload. Returns the original file when
 * it is already small and in a supported format. Throws a user-readable
 * (pt-PT) error when the browser cannot decode the file at all.
 */
export async function prepareImageForUpload(file: File, kind: ImageKind = "cover"): Promise<File> {
  const preset = PRESETS[kind];
  if (keepOriginal(file.type, file.size, kind)) return file;

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    if (SUPPORTED.test(file.type)) return file; // let the server try the original
    throw new Error(
      `"${file.name}" não é suportada neste navegador. Converta para JPG e tente de novo.`,
    );
  }

  const sw = "naturalWidth" in source ? source.naturalWidth : source.width;
  const sh = "naturalHeight" in source ? source.naturalHeight : source.height;
  const { w, h } = fitWithin(sw, sh, preset.maxEdge);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    if (SUPPORTED.test(file.type)) return file;
    throw new Error(`Não foi possível processar "${file.name}". Converta para JPG.`);
  }
  ctx.drawImage(source, 0, 0, w, h);
  if ("close" in source) source.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", preset.quality),
  );
  if (!blob) {
    if (SUPPORTED.test(file.type)) return file;
    throw new Error(`Não foi possível processar "${file.name}". Converta para JPG.`);
  }

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
