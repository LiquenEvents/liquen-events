/**
 * Client-safe inbox types.
 *
 * These describe the shape the inbox API returns and the local overlay store
 * persists. They live apart from `inbox.ts` / `message-links-store.ts` (both
 * `server-only` — they pull in `imapflow`/`fs`) so Client Components can
 * `import type` them without dragging a server-only module into the browser
 * bundle (which breaks the build). Mirrors the `contract-types` / `contracts-
 * store` and `inventory-types` / `inventory-store` splits.
 *
 * MUST NOT import any `server-only` module.
 */

/** Metadata for one attachment on a message — enough to list it and, later, to fetch it by its IMAP body part. */
export interface InboxAttachment {
  /** IMAP body part number (e.g. "2", "2.1") — the handle used to download the part. */
  partId: string;
  filename: string;
  /** Size in bytes as reported by BODYSTRUCTURE (0 when the server omits it). */
  size: number;
  contentType: string;
}

/**
 * A message as summarised for the inbox list.
 *
 * `messageId` is the DURABLE key (the RFC822 Message-ID). The IMAP `uid` is only
 * stable within a mailbox session and can be renumbered, so anything persisted
 * (the overlay store, CRM links) keys off `messageId`, never `uid`.
 */
export interface InboxItem {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: string;
  seen: boolean;
  /** RFC822 Message-ID — the durable identity. Empty string only if the server omitted it. */
  messageId: string;
  /** Message-ID this is a reply to (In-Reply-To header), if any. */
  inReplyTo?: string;
  /** Message-IDs from the References header (threading chain), oldest first. */
  references: string[];
  attachments: InboxAttachment[];
}

/** A full message (list fields plus the decoded body text). */
export interface InboxMessage extends InboxItem {
  text: string;
}

/**
 * Local, server-side overlay for a message, keyed by its durable Message-ID.
 * None of this touches the mailbox — it is Líquen's own annotation layer:
 * CRM links, labels, a pin, and a soft "archive" (hide) timestamp.
 */
export interface MessageLink {
  messageId: string;
  /** Explicit link to a quote (pedido). Overrides any heuristic match. */
  quoteId?: string;
  /** Explicit link to a proposal. */
  proposalId?: string;
  labels: string[];
  pinned: boolean;
  /**
   * When set, the message is "archived" — hidden from the default inbox view.
   * "Archive" and "delete" in the UI both map here; they NEVER expunge the
   * mailbox. Clearing it un-archives.
   */
  archivedAt?: string;
  createdAt: string;
}

/** An inbox item joined with its overlay (when one exists). */
export interface InboxItemEnriched extends InboxItem {
  link?: MessageLink;
}
