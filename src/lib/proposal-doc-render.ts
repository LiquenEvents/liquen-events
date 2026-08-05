import "server-only";
import { type ProposalDoc, withProposalDefaults } from "@/lib/proposal-doc";
import { renderProposalDocPdfWithReport, type DocTruncation } from "@/lib/proposal-doc-pdf";
import { fetchProposalImageBytes } from "@/lib/proposal-storage";
import { log } from "@/lib/logger";

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
async function resolveImages(doc: ProposalDoc): Promise<{ doc: ProposalDoc; missing: number }> {
  let remaining = MAX_IMAGES_PER_DOC;
  // Quantas fotos foram PEDIDAS e não entraram. Uma proposta com fotos a menos
  // seguia para o cliente sem ninguém dar por isso; agora quem chama fica a
  // saber e pode dizê-lo. Ver o cabeçalho `X-Fotos-Em-Falta` na rota.
  let missing = 0;
  const toB64 = async (ref: string): Promise<string | null> => {
    if (remaining <= 0) {
      // O tecto também é uma perda silenciosa: uma proposta com mais de
      // MAX_IMAGES_PER_DOC fotos perdia as últimas sem aviso.
      missing++;
      return null;
    }
    remaining--;
    const bytes = await fetchProposalImageBytes(ref);
    if (!bytes) missing++;
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
  return { doc: { ...doc, coverImages: cover, moodBoards }, missing };
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
  return (await renderStoredProposalDocPdfWithReport(doc)).pdf;
}

/**
 * Como `renderStoredProposalDocPdf`, mas diz também o que o PDF não leva:
 *
 * - `missingImages` — fotos PEDIDAS que não entraram: as que não resolveram do
 *   armazenamento (ou passaram do tecto de imagens por documento) MAIS as que
 *   resolveram e que o gerador não conseguiu desenhar. É uma AVARIA: a
 *   correcção é voltar a tentar ou recarregar a foto.
 * - `truncations` — conteúdo que chegou inteiro e que o DESENHO não mostra
 *   todo (a sétima foto de um mood board, a terceira linha do "Local"…). É uma
 *   ESCOLHA de composição a morder o conteúdo: a correcção é editorial —
 *   tirar uma foto, criar outro mood board, encurtar um texto.
 *
 * Ficam separadas de propósito. Somá-las dava um número maior mas mais pobre:
 * a mensagem "N fotos não entraram" ficaria errada para texto cortado, e a
 * pessoa deixaria de saber se tem de recarregar alguma coisa ou de reescrever.
 * O que as une — e é o que interessa — é que ambas TÊM DE APARECER no aviso
 * antes de a proposta seguir para o cliente.
 */
export async function renderStoredProposalDocPdfWithReport(
  doc: ProposalDoc,
): Promise<{ pdf: Buffer<ArrayBuffer>; missingImages: number; truncations: DocTruncation[] }> {
  // Fill the studio's fixed boilerplate (condições, observações, faseamento,
  // cancelamento) + event-token substitution so the caller only supplies what
  // varies per event.
  const withDefaults = withProposalDefaults(doc);
  const { doc: resolved, missing } = await resolveImages(withDefaults);
  // As duas contagens não se sobrepõem: o gerador só vê as fotos que
  // RESOLVERAM (as outras já foram descartadas aqui e contadas em `missing`),
  // por isso uma foto em falta nunca é também contada como cortada.
  const {
    bytes: pdfBytes,
    truncations,
    undrawnImages,
  } = await renderProposalDocPdfWithReport(resolved);
  // A foto que RESOLVEU e que o gerador não conseguiu desenhar (um WebP antigo
  // da biblioteca, bytes corrompidos) some-se aqui às que nem chegaram: para
  // quem vai enviar a proposta é a mesma coisa — uma foto que o cliente devia
  // ver e não vê, com a mesma correcção (tentar de novo, ou recarregá-la). Sem
  // esta soma era a perda MAIS invisível de todas: a foto existia, descarregava
  // bem, e desaparecia calada no desenho.
  const emFalta = missing + undrawnImages;
  if (emFalta > 0) {
    log.error("proposal-doc-render: PDF gerado com fotos EM FALTA", null, {
      emFalta,
      naoResolvidas: missing,
      naoDesenhadas: undrawnImages,
      ref: doc.ref,
    });
  }
  if (truncations.length > 0) {
    log.error("proposal-doc-render: PDF gerado com conteúdo CORTADO", null, {
      cortado: truncations.map((t) => `${t.where}: -${t.dropped} ${t.unit}`),
      ref: doc.ref,
    });
  }
  return { pdf: Buffer.from(pdfBytes), missingImages: emFalta, truncations };
}
