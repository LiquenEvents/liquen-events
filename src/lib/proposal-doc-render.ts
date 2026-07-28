import "server-only";
import { type ProposalDoc, withProposalDefaults } from "@/lib/proposal-doc";
import { renderProposalDocPdf } from "@/lib/proposal-doc-pdf";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";

// Bounds on image resolution, so a doc with a huge number of image refs can't
// fan out unbounded concurrent fetches (memory/CPU DoS during render) or embed
// an unreasonable number of images. Each fetch is itself host-restricted, timed
// out and size-capped in fetchProposalImageBytes.
//
// Este limite é também o teto do trabalho do sharp: o gerador só redimensiona
// fotos que passaram por aqui, uma de cada vez (os desenhos são sequenciais),
// e reaproveita por conteúdo a mesma foto desenhada mais do que uma vez. Ou
// seja, no máximo MAX_IMAGES_PER_DOC redimensionamentos e nunca mais do que um
// em simultâneo — bem dentro de FETCH_CONCURRENCY.
const MAX_IMAGES_PER_DOC = 80;
const FETCH_CONCURRENCY = 4;

/** Resolve `fn` over `items` with at most `limit` in flight at once. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const idx = next++;
      out[idx] = await fn(items[idx]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** Replace every image reference (cover + mood boards) with inline base64 so the
 *  storage-agnostic generator can embed them. A missing mood-board image is
 *  dropped (the collage has no fixed slots); a missing COVER image keeps its
 *  position, because the two cover slots are left and right. Resolution is
 *  concurrency-bounded and capped at MAX_IMAGES_PER_DOC total. */
async function resolveImages(doc: ProposalDoc): Promise<ProposalDoc> {
  let remaining = MAX_IMAGES_PER_DOC;
  const toB64 = async (ref: string): Promise<string | null> => {
    if (remaining <= 0) return null;
    remaining--;
    const bytes = await fetchProposalImageBytes(ref);
    return bytes ? bytes.toString("base64") : null;
  };
  // A capa tem 2 POSIÇÕES fixas. Uma referência vazia — ou que não resolve —
  // fica "" NA SUA POSIÇÃO em vez de desaparecer: compactar a lista fazia a
  // foto escolhida para a DIREITA sair impressa à esquerda. Um lugar vazio não
  // gasta orçamento de imagens (nem sequer chega a `toB64`).
  const cover = (
    await mapLimit(doc.coverImages ?? [], FETCH_CONCURRENCY, async (ref) =>
      ref ? await toB64(ref) : null,
    )
  ).map((s) => s ?? "");
  // Mood boards resolved one board at a time (inner concurrency bounded), so
  // total in-flight fetches stay ≤ FETCH_CONCURRENCY across the whole doc.
  const moodBoards: NonNullable<ProposalDoc["moodBoards"]> = [];
  for (const mb of doc.moodBoards ?? []) {
    const images = (await mapLimit(mb.images, FETCH_CONCURRENCY, toB64)).filter(
      (s): s is string => !!s,
    );
    moodBoards.push({ ...mb, images });
  }
  return { ...doc, coverImages: cover, moodBoards };
}

/**
 * Turn a STORED `ProposalDoc` (image fields hold Storage paths, not bytes) into
 * a print-ready PDF: fill the studio's fixed boilerplate, resolve every image
 * reference to inline base64, then render.
 *
 * Shared by the admin generate/preview route and the public portal PDF route so
 * both produce byte-for-byte the same document from the same stored doc.
 */
export async function renderStoredProposalDocPdf(doc: ProposalDoc): Promise<Buffer<ArrayBuffer>> {
  // Fill the studio's fixed boilerplate (condições, observações, faseamento,
  // cancelamento) + event-token substitution so the caller only supplies what
  // varies per event.
  const withDefaults = withProposalDefaults(doc);
  const resolved = await resolveImages(withDefaults);
  const pdfBytes = await renderProposalDocPdf(resolved);
  return Buffer.from(pdfBytes);
}
