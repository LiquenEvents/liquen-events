import "server-only";
import nodemailer from "nodemailer";
import { log } from "./logger";

/**
 * SMTP transport built from environment variables. Returns null when the
 * server hasn't been configured, so callers can degrade gracefully instead
 * of crashing (e.g. before the env vars are set on the hosting provider).
 *
 * Required env vars (set these on Vercel → Settings → Environment Variables):
 *   SMTP_HOST   e.g. smtp.gmail.com
 *   SMTP_PORT   e.g. 465 (SSL) or 587 (STARTTLS)
 *   SMTP_USER   the mailbox username / address
 *   SMTP_PASS   the mailbox password or app-password
 * Optional:
 *   MAIL_TO     where submissions land (default: liquen.alentejo@gmail.com)
 *   MAIL_FROM   the From header (default: SMTP_USER)
 */
function getTransport() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

export const MAIL_TO = process.env.MAIL_TO ?? "liquen.alentejo@gmail.com";

// Always present a NAMED sender ("Líquen Events <addr>") so the recipient sees
// the brand, never a bare mailbox. MAIL_FROM wins when set (lets you move to a
// custom domain + display name); a bare MAIL_FROM address still gets the brand
// name; otherwise the SMTP user is wrapped with it. nodemailer MIME-encodes the
// non-ASCII display name, so "Líquen" is safe in the header.
const FROM_NAME = "Líquen Events";
function fromAddress(): string {
  const explicit = process.env.MAIL_FROM?.trim();
  if (explicit) return explicit.includes("<") ? explicit : `${FROM_NAME} <${explicit}>`;
  return `${FROM_NAME} <${process.env.SMTP_USER}>`;
}

interface Attachment {
  filename: string;
  content: Buffer | Uint8Array;
  contentType?: string;
}

interface SendArgs {
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  to?: string; // overrides the default MAIL_TO (e.g. send to the client)
  attachments?: Attachment[];
}

/**
 * Sends an email. Resolves with `{ sent: false }` (never throws) when SMTP
 * isn't configured, so a form submission still completes for the visitor.
 */
export async function sendMail({
  subject,
  html,
  text,
  replyTo,
  to,
  attachments,
}: SendArgs): Promise<{ sent: boolean }> {
  const transport = getTransport();
  if (!transport) {
    // In production an unconfigured SMTP means real emails silently don't send —
    // including the client's confirmation, whose caller doesn't inspect `sent`.
    // Log at ERROR there so it reaches alerting rather than passing unnoticed;
    // in dev it's an expected no-op, so a warning is enough.
    const msg =
      "mail: SMTP não configurado — email não enviado (defina SMTP_HOST, SMTP_USER e SMTP_PASS)";
    if (process.env.NODE_ENV === "production") log.error(msg);
    else log.warn(msg);
    return { sent: false };
  }

  const from = fromAddress();
  const attach = attachments?.map((a) => ({
    filename: a.filename,
    content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
    contentType: a.contentType,
  }));
  await transport.sendMail({
    from,
    to: to ?? MAIL_TO,
    subject,
    html,
    text,
    replyTo,
    attachments: attach,
  });
  return { sent: true };
}

/** Escapes user-provided text before embedding it in HTML email bodies. */
export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
