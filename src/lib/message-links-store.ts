import "server-only";
import { createRepository, type Mapper } from "./repository";
import type { MessageLink } from "./inbox-types";

/**
 * Local overlay for inbox messages, keyed by the durable Message-ID.
 *
 * This is Líquen's OWN annotation layer — CRM links, labels, a pin, and a soft
 * "archive" (hide) timestamp. It never touches the mailbox: Gmail won't persist
 * custom keywords reliably, and "archive"/"delete" here mean HIDE (set
 * `archivedAt`), NEVER an IMAP expunge.
 *
 * Persisted through the shared Repository — Supabase table `message_links` when
 * configured, else the dev JSON file — exactly like contracts-store /
 * invoices-store. The Repository addresses rows by an `id` column, so the
 * Message-ID is stored there (see `toRow`/`fromRow` and db/schema.sql).
 *
 * The `MessageLink` type lives in the client-safe `inbox-types` module (re-
 * exported here) so Client Components can use it without importing this
 * server-only store.
 */
export type { MessageLink } from "./inbox-types";

export const mapper: Mapper<MessageLink> = {
  table: "message_links",
  fileName: "message-links.json",
  getId: (l) => l.messageId,
  toRow: (l) => ({
    id: l.messageId, // the Repository keys rows by `id`; here it holds the Message-ID
    quote_id: l.quoteId ?? null,
    proposal_id: l.proposalId ?? null,
    labels: l.labels ?? [],
    pinned: l.pinned ?? false,
    archived_at: l.archivedAt ?? null,
    created_at: l.createdAt,
  }),
  fromRow: (r) => ({
    messageId: String(r.id ?? ""),
    quoteId: (r.quote_id as string) || undefined,
    proposalId: (r.proposal_id as string) || undefined,
    labels: Array.isArray(r.labels) ? (r.labels as unknown[]).map(String) : [],
    pinned: Boolean(r.pinned),
    archivedAt: (r.archived_at as string) || undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "created_at", ascending: false },
  fileCompare: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
  touch: true,
};

const repo = createRepository(mapper);

/** Every overlay row (small table — the inbox enrichment reads all of them once). */
export const listLinks = (): Promise<MessageLink[]> => repo.list();

/** The overlay for a single message, or null if none has been created yet. */
export const getLink = (messageId: string): Promise<MessageLink | null> => repo.get(messageId);

/** Overlays explicitly linked to a given quote (pedido). */
export const listLinksForQuote = (quoteId: string): Promise<MessageLink[]> =>
  repo.where("quote_id", quoteId, (l) => l.quoteId === quoteId);

/**
 * Create-or-patch the overlay for a message. A first touch creates the row with
 * sensible defaults; subsequent calls merge the patch over the stored row.
 */
export async function upsertLink(
  messageId: string,
  patch: Partial<MessageLink>,
): Promise<MessageLink> {
  const existing = await repo.get(messageId);
  if (!existing) {
    const created: MessageLink = {
      messageId,
      quoteId: patch.quoteId,
      proposalId: patch.proposalId,
      labels: patch.labels ?? [],
      pinned: patch.pinned ?? false,
      archivedAt: patch.archivedAt,
      createdAt: new Date().toISOString(),
    };
    await repo.create(created);
    return created;
  }
  const updated = await repo.update(messageId, patch);
  return updated ?? existing;
}

/** Link (or, with both undefined, unlink) a message to a quote/proposal. */
export const linkToQuote = (
  messageId: string,
  quoteId?: string,
  proposalId?: string,
): Promise<MessageLink> => upsertLink(messageId, { quoteId, proposalId });

/** Pin or unpin a message. */
export const setPinned = (messageId: string, pinned: boolean): Promise<MessageLink> =>
  upsertLink(messageId, { pinned });

/** Archive (hide) or un-archive a message. Maps to `archivedAt` — never a mailbox delete. */
export const setArchived = (messageId: string, archived: boolean): Promise<MessageLink> =>
  upsertLink(messageId, { archivedAt: archived ? new Date().toISOString() : undefined });

/** Add a label if absent, remove it if present. Returns the updated overlay. */
export async function toggleLabel(messageId: string, label: string): Promise<MessageLink> {
  const existing = await repo.get(messageId);
  const current = existing?.labels ?? [];
  const labels = current.includes(label) ? current.filter((l) => l !== label) : [...current, label];
  return upsertLink(messageId, { labels });
}
