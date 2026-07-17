import "server-only";
import { esc } from "./mail";
import type { Locale } from "./i18n/config";

/**
 * Confirmation email sent to the CLIENT right after a form submission
 * (quote request or contact message). The team notification is separate —
 * this one manages the client's expectations ("we reply within 24h") and
 * gives them the reference number to quote back. Localized to the locale
 * the visitor was browsing in.
 */
interface ConfirmationArgs {
  locale: Locale;
  name: string;
  /** Quote reference (LIQ-…) — omitted for plain contact messages. */
  referenceId?: string;
}

const COPY = {
  pt: {
    subject: (ref?: string) =>
      ref ? `Recebemos o seu pedido de orçamento (${ref})` : "Recebemos a sua mensagem",
    greeting: (name: string) => `Olá ${name},`,
    bodyQuote:
      "Obrigado pelo seu pedido de orçamento. Já o recebemos e vamos analisá-lo com atenção — entramos em contacto em menos de 24 horas (dias úteis) com uma proposta à medida.",
    bodyContact:
      "Obrigado pela sua mensagem. Já a recebemos — respondemos em menos de 24 horas (dias úteis).",
    reference: "A sua referência",
    footer: "Líquen Events · Évora, Alentejo",
    noreply: "Se precisar de acrescentar algo, basta responder a este email.",
  },
  en: {
    subject: (ref?: string) =>
      ref ? `We've received your quote request (${ref})` : "We've received your message",
    greeting: (name: string) => `Hello ${name},`,
    bodyQuote:
      "Thank you for your quote request. We've received it and will review it carefully — we'll get back to you within 24 hours (business days) with a tailored proposal.",
    bodyContact:
      "Thank you for your message. We've received it and will reply within 24 hours (business days).",
    reference: "Your reference",
    footer: "Líquen Events · Évora, Alentejo, Portugal",
    noreply: "If you'd like to add anything, simply reply to this email.",
  },
} as const;

export function buildClientConfirmation({ locale, name, referenceId }: ConfirmationArgs): {
  subject: string;
  html: string;
  text: string;
} {
  const t = COPY[locale];
  const body = referenceId ? t.bodyQuote : t.bodyContact;

  const html = `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;max-width:560px;margin:0 auto;color:#111">
    <h2 style="font-size:18px;margin:0 0 16px;color:#1b2119">${esc(t.subject(referenceId))}</h2>
    <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${esc(t.greeting(name))}</p>
    <p style="font-size:14px;line-height:1.6;margin:0 0 16px">${esc(body)}</p>
    ${
      referenceId
        ? `<p style="font-size:13px;margin:0 0 16px;color:#555">${esc(t.reference)}: <strong style="color:#7c854b">${esc(referenceId)}</strong></p>`
        : ""
    }
    <p style="font-size:13px;line-height:1.6;margin:0 0 20px;color:#555">${esc(t.noreply)}</p>
    <hr style="border:none;border-top:1px solid #eee;margin:0 0 12px">
    <p style="font-size:12px;color:#999;margin:0">${esc(t.footer)}</p>
  </div>`;

  const text = [
    t.greeting(name),
    "",
    body,
    referenceId ? `${t.reference}: ${referenceId}` : "",
    "",
    t.noreply,
    "",
    t.footer,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  return { subject: t.subject(referenceId), html, text };
}
