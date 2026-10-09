import type { PDFDocument, PDFImage } from "pdf-lib";

/**
 * Embute uma JPEG ou um PNG.
 *
 * Copia para um `Uint8Array` que começa no princípio da imagem: um `Buffer`
 * pequeno do Node vive a meio de uma reserva partilhada, e o `JpegEmbedder` do
 * pdf-lib lê a partir do princípio da RESERVA («SOI not found in JPEG»). É a
 * mesma armadilha que o gerador antigo documenta em `embedImage`.
 */
export async function embedImagem(pdf: PDFDocument, cru: Buffer): Promise<PDFImage | null> {
  const bytes = new Uint8Array(cru);
  const jpg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  try {
    return jpg ? await pdf.embedJpg(bytes) : await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/** Os bytes de uma foto do documento — base64, com ou sem o prefixo `data:`. */
export function bytesDaFoto(dado: string | null | undefined): Buffer | null {
  if (!dado) return null;
  const virgula = dado.startsWith("data:") ? dado.indexOf(",") : -1;
  const b64 = virgula >= 0 ? dado.slice(virgula + 1) : dado;
  try {
    const b = Buffer.from(b64, "base64");
    return b.length ? b : null;
  } catch {
    return null;
  }
}
