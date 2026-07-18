import "server-only";
import { type ProposalDoc, withProposalDefaults } from "@/lib/proposal-doc";
import { renderProposalDocPdf } from "@/lib/proposal-doc-pdf";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";

/** Replace every image reference (cover + mood boards) with inline base64 so the
 *  storage-agnostic generator can embed them. Missing images are dropped. */
async function resolveImages(doc: ProposalDoc): Promise<ProposalDoc> {
  const toB64 = async (ref: string): Promise<string | null> => {
    const bytes = await fetchProposalImageBytes(ref);
    return bytes ? bytes.toString("base64") : null;
  };
  const cover = (await Promise.all((doc.coverImages ?? []).map(toB64))).filter(
    (s): s is string => !!s,
  );
  const moodBoards = await Promise.all(
    (doc.moodBoards ?? []).map(async (mb) => ({
      ...mb,
      images: (await Promise.all(mb.images.map(toB64))).filter((s): s is string => !!s),
    })),
  );
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
