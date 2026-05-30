import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

/**
 * Read-only IMAP access to the team inbox, used by the dashboard so replies
 * can be read in one place. Connects on demand and logs out immediately
 * (suited to serverless). Falls back gracefully when unconfigured.
 *
 * Env vars (default to the SMTP_* values when omitted):
 *   IMAP_HOST   e.g. imap.gmail.com
 *   IMAP_PORT   e.g. 993
 *   IMAP_USER   (default: SMTP_USER)
 *   IMAP_PASS   (default: SMTP_PASS)
 */
export function imapConfigured(): boolean {
  const user = process.env.IMAP_USER ?? process.env.SMTP_USER;
  const pass = process.env.IMAP_PASS ?? process.env.SMTP_PASS;
  return !!(process.env.IMAP_HOST && user && pass);
}

function makeClient(): ImapFlow {
  const port = Number(process.env.IMAP_PORT ?? 993);
  return new ImapFlow({
    host: process.env.IMAP_HOST!,
    port,
    secure: port === 993,
    auth: {
      user: (process.env.IMAP_USER ?? process.env.SMTP_USER)!,
      pass: (process.env.IMAP_PASS ?? process.env.SMTP_PASS)!,
    },
    logger: false,
  });
}

export interface InboxItem {
  uid: number;
  from: string;
  fromAddress: string;
  subject: string;
  date: string;
  seen: boolean;
}

export async function listInbox(limit = 30): Promise<InboxItem[]> {
  const client = makeClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const box = client.mailbox;
      const total = box && typeof box !== "boolean" ? box.exists : 0;
      if (!total) return [];
      const start = Math.max(1, total - limit + 1);
      const items: InboxItem[] = [];
      for await (const msg of client.fetch(`${start}:*`, { envelope: true, flags: true })) {
        const f = msg.envelope?.from?.[0];
        items.push({
          uid: msg.uid,
          from: f?.name || f?.address || "—",
          fromAddress: f?.address || "",
          subject: msg.envelope?.subject || "(sem assunto)",
          date: (msg.envelope?.date ?? new Date()).toISOString(),
          seen: msg.flags?.has("\\Seen") ?? false,
        });
      }
      return items.reverse();
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => {});
  }
}

export interface InboxMessage extends InboxItem {
  text: string;
}

export async function getInboxMessage(uid: number): Promise<InboxMessage | null> {
  const client = makeClient();
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const dl = await client.download(String(uid), undefined, { uid: true });
      if (!dl) return null;
      const parsed = await simpleParser(dl.content);
      const f = parsed.from?.value?.[0];
      return {
        uid,
        from: f?.name || f?.address || "—",
        fromAddress: f?.address || "",
        subject: parsed.subject || "(sem assunto)",
        date: (parsed.date ?? new Date()).toISOString(),
        seen: true,
        text: parsed.text || (parsed.html ? stripHtml(parsed.html) : ""),
      };
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
