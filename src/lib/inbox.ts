import "server-only";
import type {
  ImapFlow,
  FetchMessageObject,
  FetchQueryObject,
  MessageStructureObject,
  SearchObject,
} from "imapflow";
import type { InboxAttachment, InboxItem, InboxMessage } from "./inbox-types";

// Re-export the client-safe types so existing `import { InboxItem } from
// "@/lib/inbox"` call sites keep working. The canonical definitions live in
// `inbox-types` (no `server-only`) so Client Components can use them too.
export type { InboxAttachment, InboxItem, InboxMessage } from "./inbox-types";

// imapflow (~1.9MB) and mailparser are imported lazily inside the functions that
// use them, NOT at module top level: `imapConfigured()`/`imapHost()` are pure
// env-var checks that many callers (the every-few-minutes inbox-check cron, the
// admin inbox listing) hit on the "not configured" / list-only fast paths, and
// those must not pay to parse+evaluate ~2MB of IMAP/mail deps just to no-op.
// The list path never needs mailparser at all — only getInboxMessage does.

/**
 * Read-only IMAP access to the team inbox, used by the dashboard so replies
 * can be read in one place. Connects on demand and logs out immediately
 * (suited to serverless). Falls back gracefully when unconfigured.
 *
 * Env vars (default to the SMTP_* values when omitted):
 *   IMAP_HOST   e.g. imap.gmail.com — if omitted, derived from SMTP_HOST
 *               (e.g. smtp.gmail.com → imap.gmail.com)
 *   IMAP_PORT   e.g. 993
 *   IMAP_USER   (default: SMTP_USER)
 *   IMAP_PASS   (default: SMTP_PASS)
 */

/**
 * The IMAP host to connect to. Prefers IMAP_HOST; otherwise derives it from
 * SMTP_HOST by swapping the leading "smtp." for "imap." (works for Gmail and
 * most providers), so the inbox lights up with just the send-mail config.
 */
export function imapHost(): string | undefined {
  if (process.env.IMAP_HOST) return process.env.IMAP_HOST;
  const smtp = process.env.SMTP_HOST;
  if (!smtp) return undefined;
  return smtp.startsWith("smtp.") ? smtp.replace(/^smtp\./, "imap.") : smtp;
}

export function imapConfigured(): boolean {
  const user = process.env.IMAP_USER ?? process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS ?? process.env.SMTP_PASS;
  return !!(imapHost() && user && pass);
}

async function makeClient(): Promise<ImapFlow> {
  const { ImapFlow } = await import("imapflow");
  const port = Number(process.env.IMAP_PORT ?? 993);
  return new ImapFlow({
    host: imapHost()!,
    port,
    secure: port === 993,
    auth: {
      user: (process.env.IMAP_USER ?? process.env.SMTP_USER)!,
      pass: (process.env.IMAP_PASS ?? process.env.SMTP_PASS)!,
    },
    logger: false,
  });
}

/**
 * Walk a BODYSTRUCTURE tree and collect the attachment leaves. An "attachment"
 * is any leaf node marked `Content-Disposition: attachment`, or any leaf that
 * carries a filename (the `name`/`filename` param) — some clients don't set the
 * disposition. Multipart container nodes and plain body parts are skipped. The
 * `partId` is the IMAP body part number, the handle a later download uses.
 */
export function collectAttachments(node?: MessageStructureObject): InboxAttachment[] {
  const out: InboxAttachment[] = [];
  const walk = (n: MessageStructureObject): void => {
    if (n.childNodes?.length) {
      for (const child of n.childNodes) walk(child);
      return;
    }
    const disposition = (n.disposition || "").toLowerCase();
    const filename = n.dispositionParameters?.filename || n.parameters?.name;
    if (disposition === "attachment" || filename) {
      out.push({
        partId: n.part || "",
        filename: filename || "(sem nome)",
        size: typeof n.size === "number" ? n.size : 0,
        contentType: n.type || "application/octet-stream",
      });
    }
  };
  if (node) walk(node);
  return out;
}

/**
 * Parse a References header buffer into an ordered list of Message-IDs. We only
 * ever fetch the References header into this buffer, so pulling every `<...>`
 * token out is safe (and folded/continued lines just work).
 */
export function parseReferences(headers?: Buffer): string[] {
  if (!headers) return [];
  return headers.toString("utf8").match(/<[^>]+>/g) ?? [];
}

const LIST_QUERY: FetchQueryObject = {
  envelope: true,
  flags: true,
  bodyStructure: true,
  headers: ["references"],
};

function toInboxItem(msg: FetchMessageObject): InboxItem {
  const env = msg.envelope;
  const f = env?.from?.[0];
  return {
    uid: msg.uid,
    from: f?.name || f?.address || "—",
    fromAddress: f?.address || "",
    subject: env?.subject || "(sem assunto)",
    date: (env?.date ?? new Date()).toISOString(),
    seen: msg.flags?.has("\\Seen") ?? false,
    messageId: env?.messageId || "",
    inReplyTo: env?.inReplyTo || undefined,
    references: parseReferences(msg.headers),
    attachments: collectAttachments(msg.bodyStructure),
  };
}

export interface ListInboxOptions {
  /** How many messages to return (bounded 1..200). Default 30. */
  limit?: number;
  /** Paginate: only messages with a UID strictly below this one. */
  before?: number;
  /** Free-text filter — matched against subject, From, and body server-side. */
  q?: string;
}

/**
 * List the most recent inbox messages, newest first. Read-only.
 *
 * Backward compatible: `listInbox(30)` and `listInbox()` still work; the options
 * form adds `before` (UID-based pagination) and `q` (server-side search).
 */
export async function listInbox(arg: number | ListInboxOptions = 30): Promise<InboxItem[]> {
  const opts = typeof arg === "number" ? { limit: arg } : arg;
  const limit = Math.max(1, Math.min(opts.limit ?? 30, 200));
  const q = opts.q?.trim();
  const before = opts.before;

  const client = await makeClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = client.mailbox;
      const total = box && typeof box !== "boolean" ? box.exists : 0;
      if (!total) return [];

      const items: InboxItem[] = [];
      if (q || before != null) {
        // Filtered / paginated path — resolve matching UIDs server-side, then
        // fetch the newest `limit` of them.
        const criteria: SearchObject = {};
        if (q) criteria.or = [{ subject: q }, { from: q }, { text: q }];
        if (before != null) criteria.uid = `1:${Math.max(1, before - 1)}`;
        const found = await client.search(criteria, { uid: true });
        const uids = (found || []).slice(-limit);
        if (!uids.length) return [];
        for await (const msg of client.fetch(uids, LIST_QUERY, { uid: true })) {
          items.push(toInboxItem(msg));
        }
      } else {
        const start = Math.max(1, total - limit + 1);
        for await (const msg of client.fetch(`${start}:*`, LIST_QUERY)) {
          items.push(toInboxItem(msg));
        }
      }
      items.sort((a, b) => +new Date(b.date) - +new Date(a.date));
      return items;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export async function getInboxMessage(uid: number): Promise<InboxMessage | null> {
  const client = await makeClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      // Envelope + structure + references in one fetch (the durable metadata),
      // then the body text via download (which decodes MIME parts for us).
      const meta = await client.fetchOne(String(uid), LIST_QUERY, { uid: true });
      if (!meta) return null;
      const base = toInboxItem(meta);

      let text = "";
      const dl = await client.download(String(uid), undefined, { uid: true });
      if (dl) {
        const { simpleParser } = await import("mailparser");
        const parsed = await simpleParser(dl.content);
        text = parsed.text || (parsed.html ? stripHtml(parsed.html) : "");
      }
      // Reading the message marks it \Seen on the server (download is not a peek).
      return { ...base, seen: true, text };
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

/**
 * Toggle durable IMAP flags on a message. Both `\Seen` (read/unread) and
 * `\Flagged` (star) are standard, Gmail-safe, and fully REVERSIBLE — the exact
 * opposite of a destructive expunge, which this module never performs. Keyed by
 * UID within the session. Returns the flags that were applied.
 */
export async function setFlags(
  uid: number,
  flags: { seen?: boolean; flagged?: boolean },
): Promise<{ seen?: boolean; flagged?: boolean }> {
  const client = await makeClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const applied: { seen?: boolean; flagged?: boolean } = {};
      const set = async (value: boolean, flag: string) => {
        if (value) await client.messageFlagsAdd(String(uid), [flag], { uid: true });
        else await client.messageFlagsRemove(String(uid), [flag], { uid: true });
      };
      if (typeof flags.seen === "boolean") {
        await set(flags.seen, "\\Seen");
        applied.seen = flags.seen;
      }
      if (typeof flags.flagged === "boolean") {
        await set(flags.flagged, "\\Flagged");
        applied.flagged = flags.flagged;
      }
      return applied;
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
