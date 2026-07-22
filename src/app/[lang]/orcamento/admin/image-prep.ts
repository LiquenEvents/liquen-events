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

const MAX_EDGE = 2000;
// Under this size an already-supported file is sent untouched (no quality loss).
const KEEP_BYTES = 1_500_000;
const SUPPORTED = /^image\/(jpe?g|png|webp)$/i;
const JPEG_QUALITY = 0.85;

/** Target width/height after capping the long edge (pure — unit-tested). */
export function fitWithin(w: number, h: number, maxEdge: number): { w: number; h: number } {
  const scale = Math.min(1, maxEdge / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

/** Should this file skip re-encoding entirely? (pure — unit-tested) */
export function keepOriginal(type: string, size: number): boolean {
  return SUPPORTED.test(type) && size <= KEEP_BYTES;
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
export async function prepareImageForUpload(file: File): Promise<File> {
  if (keepOriginal(file.type, file.size)) return file;

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
  const { w, h } = fitWithin(sw, sh, MAX_EDGE);

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
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) {
    if (SUPPORTED.test(file.type)) return file;
    throw new Error(`Não foi possível processar "${file.name}". Converta para JPG.`);
  }

  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
