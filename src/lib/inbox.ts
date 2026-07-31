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
        // O corpo é input NÃO CONFIÁVEL: qualquer pessoa consegue escrever para
        // esta caixa. Descarregamos com tecto de bytes e extraímos o texto de
        // forma que nunca rebenta a leitura da mensagem.
        const raw = await readCapped(dl.content, MAX_RAW_BYTES);
        text = clampBody(await extractBody(raw));
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

// ── Corpo da mensagem: extração defensiva ───────────────────────────────────
// Tudo aqui trata o email recebido como hostil. As três constantes limitam,
// por ordem, o que descarregamos, o que analisamos e o que devolvemos.

/**
 * Tecto de bytes descarregados de UMA mensagem. Sem isto, um email de dezenas
 * de MB era inteiramente carregado em memória por pedido. O corpo de texto vive
 * sempre nas primeiras partes MIME (os clientes põem os anexos a seguir), e os
 * anexos aqui nem sequer são usados — a lista deles vem do BODYSTRUCTURE —, por
 * isso cortar a cauda não tira nada ao que é mostrado.
 */
const MAX_RAW_BYTES = 12 * 1024 * 1024;

/** Tecto de HTML que aceitamos analisar/varrer (o que o mailparser já usava). */
const MAX_HTML_PARSE = 2_000_000;

/**
 * Tecto de caracteres do corpo devolvido ao back office. Uma mensagem é lida
 * por uma pessoa: 200 000 caracteres estão muito acima de qualquer email real e
 * impedem que um corpo hostil de vários MB atravesse o JSON até ao browser (que
 * o renderiza num único parágrafo e bloqueava o separador).
 */
const MAX_BODY_CHARS = 200_000;

/**
 * Lê um stream até ao tecto de bytes e descarta o resto, fechando a torneira em
 * vez de deixar a ligação IMAP escorrer a mensagem toda.
 */
async function readCapped(
  source: NodeJS.ReadableStream | Buffer,
  maxBytes: number,
): Promise<Buffer> {
  // O imapflow devolve um stream; aceitamos também um Buffer já materializado.
  if (Buffer.isBuffer(source)) return source.subarray(0, maxBytes);
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of source) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string);
    if (total + buf.length >= maxBytes) {
      chunks.push(buf.subarray(0, maxBytes - total));
      total = maxBytes;
      break;
    }
    chunks.push(buf);
    total += buf.length;
  }
  (source as { destroy?: () => void }).destroy?.();
  return Buffer.concat(chunks, total);
}

/** Corta o corpo no tecto, deixando marca visível de que foi cortado. */
export function clampBody(body: string): string {
  if (body.length <= MAX_BODY_CHARS) return body;
  return `${body.slice(0, MAX_BODY_CHARS)}\n\n[…] Mensagem demasiado longa — mostrada apenas a primeira parte.`;
}

/**
 * Extrai o texto legível de uma mensagem crua. NUNCA lança: o back office tem
 * de conseguir abrir qualquer email, por pior que ele seja.
 */
async function extractBody(raw: Buffer): Promise<string> {
  const { simpleParser } = await import("mailparser");
  const base = { skipImageLinks: true, maxHtmlLengthToParse: MAX_HTML_PARSE };
  const pick = (p: { text?: string; html?: string | false }) =>
    p.text || (p.html ? stripHtml(p.html) : "");

  try {
    // Caminho normal: deixamos o mailparser converter HTML→texto, que dá muito
    // melhor formatação (parágrafos, URLs das ligações) do que o nosso varrimento.
    return pick(await simpleParser(raw, { ...base, skipHtmlToText: false }));
  } catch {
    // O mailparser emite 'error' — e o simpleParser rejeita a leitura INTEIRA —
    // quando o HTML passa o tecto de análise ou não é analisável. Isso deixava a
    // mensagem permanentemente ilegível (502 no back office): qualquer remetente
    // o provocava de propósito, e newsletters legítimas passam o tecto à vontade.
    // Segunda tentativa sem a conversão HTML→texto (é esse o ramo que rebenta),
    // extraindo o texto por nós.
    try {
      return pick(await simpleParser(raw, { ...base, skipHtmlToText: true }));
    } catch {
      return "(não foi possível ler o conteúdo desta mensagem)";
    }
  }
}

/**
 * Reduz HTML a texto simples. Não é um sanitizador — é uma extração: o
 * resultado é sempre entregue como TEXTO (o React escapa-o ao renderizar), e
 * nenhum HTML de um email chega a ser interpretado pelo browser. Os conteúdos
 * de <script>/<style> são deitados fora inteiros para não aparecerem como
 * "corpo" da mensagem.
 */
function stripHtml(html: string): string {
  return html
    .slice(0, MAX_HTML_PARSE)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
