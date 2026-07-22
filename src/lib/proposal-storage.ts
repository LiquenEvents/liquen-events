import "server-only";
import { randomUUID } from "node:crypto";
import { getSupabase } from "./supabase";
import { log } from "./logger";

/**
 * Storage for proposal mood-board / cover images, backed by a private Supabase
 * Storage bucket. Uploads return a stable `path` (persisted on the proposal so
 * it can be re-edited) plus a long-lived signed `url` for the admin preview.
 * The PDF generator never touches Storage directly — the generate route resolves
 * every path to bytes via `fetchProposalImageBytes` before rendering, keeping
 * the generator storage-agnostic.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. The bucket is created on
 * first use (idempotent), so no manual Supabase setup step is needed.
 */
export const PROPOSAL_BUCKET = "proposal-assets";

// 10-year signed URLs — effectively permanent for the admin's own preview use;
// the bucket stays private so nothing is publicly enumerable.
const SIGNED_TTL = 60 * 60 * 24 * 365 * 10;

let bucketReady = false;

async function ensureBucket(): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  if (bucketReady) return true;
  const { data } = await sb.storage.getBucket(PROPOSAL_BUCKET);
  if (!data) {
    const { error } = await sb.storage.createBucket(PROPOSAL_BUCKET, { public: false });
    // Ignore "already exists" races; surface anything else.
    if (error && !/exist/i.test(error.message)) {
      log.error("proposal-storage: createBucket falhou", error);
      return false;
    }
  }
  bucketReady = true;
  return true;
}

function extFor(contentType: string): string {
  if (/png/i.test(contentType)) return "png";
  if (/webp/i.test(contentType)) return "webp";
  return "jpg";
}

export interface UploadedImage {
  path: string;
  url: string;
}

/** Upload one image (bytes) for a quote; returns its storage path + signed URL. */
export async function uploadProposalImage(
  quoteId: string,
  bytes: Buffer,
  contentType: string,
): Promise<UploadedImage | null> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return null;
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  const path = `${safeId}/${randomUUID()}.${extFor(contentType)}`;
  const { error } = await sb.storage
    .from(PROPOSAL_BUCKET)
    .upload(path, bytes, { contentType, upsert: false });
  if (error) {
    log.error("proposal-storage: upload falhou", error, { quoteId });
    return null;
  }
  const { data } = await sb.storage.from(PROPOSAL_BUCKET).createSignedUrl(path, SIGNED_TTL);
  return { path, url: data?.signedUrl ?? "" };
}

/**
 * List every image already uploaded for a quote, newest first, each with a fresh
 * signed URL. The bucket folder (`${quoteId}/…`) is the device-independent index
 * of what the studio has stored for this pedido, so the studio can re-offer those
 * images on ANY device (a localStorage draft is per-browser and lost elsewhere).
 * Returns [] when Storage is unavailable — never throws.
 */
export async function listProposalImages(quoteId: string): Promise<UploadedImage[]> {
  const sb = getSupabase();
  if (!sb || !(await ensureBucket())) return [];
  const safeId = quoteId.replace(/[^a-zA-Z0-9_-]/g, "");
  try {
    const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).list(safeId, {
      limit: 200,
      sortBy: { column: "created_at", order: "desc" },
    });
    if (error || !data) return [];
    // Only real files (Storage can report folder placeholders with no id).
    const paths = data
      .filter((o) => o.id && !o.name.startsWith("."))
      .map((o) => `${safeId}/${o.name}`);
    if (paths.length === 0) return [];
    const { data: signed } = await sb.storage
      .from(PROPOSAL_BUCKET)
      .createSignedUrls(paths, SIGNED_TTL);
    return (signed ?? [])
      .map((s) => ({ path: s.path ?? "", url: s.signedUrl ?? "" }))
      .filter((im) => im.path && im.url);
  } catch (e) {
    log.error("proposal-storage: list falhou", e, { quoteId });
    return [];
  }
}

/**
 * Resolve an image reference to raw bytes for embedding in the PDF. Accepts a
 * bucket storage path, a full http(s) URL, or a base64 (optionally data:-URI)
 * string — so the generator input can mix stored images and inline uploads.
 */
export async function fetchProposalImageBytes(ref: string): Promise<Buffer | null> {
  if (!ref) return null;
  // Inline base64 / data URI.
  if (ref.startsWith("data:") || (!ref.includes("/") && ref.length > 128)) {
    try {
      const raw = ref.includes(",") ? ref.slice(ref.indexOf(",") + 1) : ref;
      return Buffer.from(raw, "base64");
    } catch {
      return null;
    }
  }
  // Absolute URL (e.g. a signed URL).
  if (/^https?:\/\//i.test(ref)) {
    try {
      const res = await fetch(ref);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    } catch {
      return null;
    }
  }
  // Bucket storage path.
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data, error } = await sb.storage.from(PROPOSAL_BUCKET).download(ref);
    if (error || !data) return null;
    return Buffer.from(await data.arrayBuffer());
  } catch {
    return null;
  }
}
