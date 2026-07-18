import "server-only";
import { randomBytes, createHmac } from "node:crypto";
import type { Quote } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

/**
 * Generates a quote reference id (e.g. LIQ-M1A2B3-9F3C7A1B2D4E5F60). The
 * random suffix is hex (each nibble uniform, no modulo bias) and wide enough
 * (16 hex chars = 64 bits) that brute-forcing/enumerating other clients'
 * references is infeasible even without the rate limit the GET route also
 * applies.
 */
export function generateQuoteId(): string {
  const now = Date.now().toString(36).toUpperCase();
  const rand = randomBytes(8).toString("hex").toUpperCase();
  return `LIQ-${now}-${rand}`;
}

/**
 * Deterministic, unguessable id derived from a client-supplied submission id.
 * A retried POST (the response was lost, the visitor resubmitted the same
 * enquiry) carries the same submissionId → the same id → the route detects the
 * existing quote and returns it instead of creating a duplicate lead + email.
 *
 * HMAC over a server-side key (not a plain hash) so the id can't be computed or
 * enumerated from the submissionId alone — it stays as unguessable as the
 * random ids the confirmation page relies on for its public GET-by-id.
 */
export function quoteIdFor(submissionId: string): string {
  const key = process.env.SESSION_SECRET ?? process.env.ADMIN_SESSION_SECRET ?? "liquen-idem-dev";
  const h = createHmac("sha256", key).update(`quote:${submissionId}`).digest("hex").toUpperCase();
  return `LIQ-${h.slice(0, 6)}-${h.slice(6, 22)}`;
}

/**
 * Storage layer for quote requests. The full quote is kept in a `data` jsonb
 * column (with status/name/email mirrored for listing/searching); the file
 * fallback stores the quote object verbatim.
 */
export const mapper: Mapper<Quote> = {
  table: "quotes",
  fileName: "quotes.json",
  selectColumns: "data",
  getId: (q) => q.id,
  toRow: (q) => ({ id: q.id, status: q.status, name: q.name, email: q.email, data: q }),
  fromRow: (r) => r.data as Quote,
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt),
  touch: true,
  beforeUpdate: (q) => ({ ...q, lastUpdated: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const createQuote = (quote: Quote): Promise<void> => repo.create(quote);
export const listQuotes = (): Promise<Quote[]> => repo.list();
export const getQuote = (id: string): Promise<Quote | null> => repo.get(id);
export const updateQuote = (id: string, updates: Partial<Quote>): Promise<Quote | null> =>
  repo.update(id, updates);
/** Update derived from the freshly-read quote — use for appends (activity log,
    payments…) so concurrent writers can't drop each other's entries. */
export const updateQuoteWith = (
  id: string,
  mutate: (current: Quote) => Quote,
): Promise<Quote | null> => repo.updateWith(id, mutate);
