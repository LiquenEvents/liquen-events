import { NextRequest, NextResponse } from "next/server";
import type { Quote, QuoteFormData, PriceBreakdown } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, LOCATION_LABELS } from "@/lib/orcamento/data";
import { sendMail, esc } from "@/lib/mail";
import { buildClientConfirmation } from "@/lib/client-confirmation";
import { LANG_COOKIE, normalizeLocale } from "@/lib/i18n/config";
import { createQuote, listQuotes, generateQuoteId } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { sendPushToAll } from "@/lib/push";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quotePayloadSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";

export const maxDuration = 30;

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const MONTHS_PT = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];
// "2026-09-12" → "12 set 2026". Anything that doesn't parse is shown as-is.
function prettyDate(d?: string): string {
  const raw = (d ?? "").trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!m) return raw;
  const mi = Number(m[2]) - 1;
  return mi >= 0 && mi < 12 ? `${Number(m[3])} ${MONTHS_PT[mi]} ${m[1]}` : raw;
}

// tel: href — keep only digits and a leading +, so the phone is tappable.
const telHref = (phone: string) => phone.replace(/[^\d+]/g, "");

interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * The team's new-quote notification. Optimised for the person RECEIVING it:
 * a scannable subject (who + what, not the long reference), the client's
 * contact one tap away (mailto/tel), only the fields that were actually filled
 * (no "—" clutter), and a clear reminder that replying reaches the client
 * (the message sets Reply-To to form.email).
 */
function buildEmail(id: string, form: QuoteFormData, breakdown?: PriceBreakdown): BuiltEmail {
  const cat = form.category ? (CATEGORIES.find((c) => c.id === form.category)?.label ?? "") : "";
  const et =
    (form.category && form.eventType
      ? EVENT_TYPES_BY_CATEGORY[form.category]?.find((e) => e.id === form.eventType)?.label
      : undefined) ??
    form.eventName ??
    "";
  const local =
    form.location ||
    (form.locationType ? (LOCATION_LABELS[form.locationType] ?? form.locationType) : "");
  const estimate = breakdown
    ? `${eur(breakdown.rangeMin)} – ${eur(breakdown.rangeMax)}${breakdown.isEstimate ? " (estimativa)" : ""}`
    : "";
  const when = prettyDate(form.date);
  const name = form.name?.trim() || "Sem nome";
  const subtitle = [et, cat].filter(Boolean).join(" · ");

  // Subject leads with WHO + WHAT so it's scannable in the inbox; the long
  // reference stays in the body.
  const subject =
    `Novo orçamento — ${[name, et || cat].filter(Boolean).join(" · ")}` +
    (form.guests ? ` (${form.guests} convidados)` : "");

  // Detail rows — only the ones actually filled in.
  // One hairline-separated row. `valueHtml` is already-safe HTML (esc'd text or
  // a link), so it can hold a mailto:/tel: anchor; empty value → no row.
  const row = (label: string, valueHtml: string) =>
    valueHtml
      ? `<tr>
           <td style="padding:11px 0;border-top:1px solid #f0efe9;color:#9a9e8c;font-size:13px;width:128px;vertical-align:top">${esc(label)}</td>
           <td style="padding:11px 0;border-top:1px solid #f0efe9;color:#26291d;font-size:14px;font-weight:500">${valueHtml}</td>
         </tr>`
      : "";
  const link = (href: string, text: string) =>
    `<a href="${href}" style="color:#5c6437;text-decoration:none">${esc(text)}</a>`;

  const rows =
    row("Email", link(`mailto:${esc(form.email)}`, form.email)) +
    (form.phone ? row("Telefone", link(`tel:${telHref(form.phone)}`, form.phone)) : "") +
    (form.company ? row("Empresa", esc(form.company)) : "") +
    (form.nif ? row("NIF", esc(form.nif)) : "") +
    row("Data", esc(when)) +
    row("Convidados", form.guests ? String(form.guests) : "") +
    row("Local", esc(local));

  const html = `
  <div style="margin:0;padding:0;background:#f6f5f2">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f5f2;padding:28px 12px">
      <tr><td align="center">
        <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #ecebe4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
          <!-- Cabeçalho -->
          <tr><td style="padding:34px 40px 0">
            <div style="color:#a9a99f;font-size:11px;letter-spacing:3px;text-transform:uppercase">Líquen Events</div>
            <div style="color:#a9a99f;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:26px">Novo pedido de orçamento</div>
            <div style="font-family:Georgia,'Times New Roman',serif;font-size:25px;color:#1c1f17;margin-top:8px;line-height:1.2">${esc(name)}</div>
            ${subtitle ? `<div style="color:#7c806f;font-size:14px;margin-top:6px">${esc(subtitle)}</div>` : ""}
          </td></tr>

          <!-- Contactos + detalhes -->
          <tr><td style="padding:22px 40px 0">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
          </td></tr>

          <!-- Estimativa -->
          ${
            estimate
              ? `<tr><td style="padding:20px 40px 0">
                   <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #1c1f17"><tr>
                     <td style="padding:12px 0 0;color:#9a9e8c;font-size:12px;text-transform:uppercase;letter-spacing:1px;vertical-align:middle">Orçamento estimado</td>
                     <td style="padding:12px 0 0;text-align:right;color:#1c1f17;font-size:17px;font-weight:600;vertical-align:middle">${esc(estimate)}</td>
                   </tr></table>
                 </td></tr>`
              : ""
          }

          <!-- Notas -->
          ${
            form.notes
              ? `<tr><td style="padding:24px 40px 0">
                   <div style="color:#a9a99f;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px">Notas do cliente</div>
                   <div style="color:#45483c;font-size:14px;line-height:1.65;white-space:pre-wrap">${esc(form.notes)}</div>
                 </td></tr>`
              : ""
          }

          <!-- Ação -->
          <tr><td style="padding:26px 40px 0">
            <div style="color:#8b8f7e;font-size:13px;line-height:1.55">Responda a este email para falar diretamente com ${esc(name.split(" ")[0] || "o cliente")} — a resposta vai direta para o email do cliente.</div>
          </td></tr>

          <!-- Rodapé -->
          <tr><td style="padding:22px 40px 34px">
            <div style="border-top:1px solid #f0efe9;padding-top:16px;color:#b5b5aa;font-size:11px;letter-spacing:0.3px">Ref. ${esc(id)} · ${new Date().toLocaleString("pt-PT")}</div>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </div>`;

  const text = [
    "NOVO PEDIDO DE ORÇAMENTO",
    `Referência: ${id}`,
    "",
    `Nome: ${name}`,
    `Email: ${form.email}`,
    form.phone ? `Telefone: ${form.phone}` : "",
    form.company ? `Empresa: ${form.company}` : "",
    form.nif ? `NIF: ${form.nif}` : "",
    "",
    subtitle ? `Evento: ${subtitle}` : "",
    when ? `Data: ${when}` : "",
    form.guests ? `Convidados: ${form.guests}` : "",
    local ? `Local: ${local}` : "",
    estimate ? `Orçamento estimado: ${estimate}` : "",
    form.notes ? `\nNotas:\n${form.notes}` : "",
    "",
    "Responda a este email para falar diretamente com o cliente.",
  ]
    .filter((line) => line !== "")
    .join("\n");

  return { subject, html, text };
}

export async function POST(request: NextRequest) {
  try {
    sweep();
    const limited = await rateLimit(`orcamento:${clientIp(request)}`, 5, 60_000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Demasiados pedidos. Tente novamente dentro de momentos." },
        { status: 429, headers: { "Retry-After": String(limited.retryAfter ?? 60) } },
      );
    }

    const body = await request.json().catch(() => null);
    // Honeypot: a real visitor never fills the hidden "website" field. If it's
    // set, this is a bot — pretend success and drop it silently. The client
    // guards it too, but that alone is bypassable, so re-check server-side.
    if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
      return NextResponse.json({ id: generateQuoteId(), status: "ok" });
    }
    const parsed = quotePayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: firstError(parsed.error) }, { status: 400 });
    }
    const { form, breakdown } = parsed.data as unknown as {
      form: QuoteFormData;
      breakdown: PriceBreakdown;
    };

    const id = generateQuoteId();

    const quote: Quote = {
      ...form,
      id,
      submittedAt: new Date().toISOString(),
      status: "pendente",
      priceBreakdown: breakdown,
    };

    // ── Durable delivery FIRST ──────────────────────────────────────────────
    // A lead is the whole point of this endpoint, so it must never be lost.
    // We persist BEFORE sending any email: (1) the store is the record the admin
    // dashboard reads, and (2) persisting first means a slow/hanging SMTP call
    // can't make the function hit maxDuration before the lead is saved.
    // Persistence: Supabase when configured; local file in dev.
    let persisted = false;
    try {
      await createQuote(quote);
      persisted = true;
    } catch (storeErr) {
      log.error("orcamento: persistência falhou", storeErr, { id });
    }

    // Notify the team by email (a second, independent delivery path). `sendMail`
    // never throws — it returns { sent:false } when SMTP isn't configured — so we
    // read `sent` to know whether the lead actually reached the team's inbox.
    let emailed = false;
    try {
      const email = buildEmail(id, form, breakdown);
      const res = await sendMail({
        subject: email.subject,
        html: email.html,
        text: email.text,
        replyTo: form.email,
      });
      emailed = res.sent;
    } catch (mailErr) {
      log.error("orcamento: email falhou", mailErr, { id });
    }

    // If the lead reached NEITHER a durable store NOR the team inbox, it is lost.
    // Return a real error so the visitor can retry or contact us directly, instead
    // of a false "success" screen over a dropped enquiry.
    if (!persisted && !emailed) {
      log.error("orcamento: lead não registada nem enviada — a devolver erro", undefined, { id });
      return NextResponse.json(
        {
          error:
            "Não foi possível registar o seu pedido. Tente novamente dentro de momentos ou contacte-nos diretamente.",
        },
        { status: 503 },
      );
    }

    // Confirmation to the client, in the language they were browsing in (best-effort).
    try {
      const locale = normalizeLocale(request.cookies?.get?.(LANG_COOKIE)?.value);
      const confirmation = buildClientConfirmation({ locale, name: form.name, referenceId: id });
      await sendMail({ to: form.email, ...confirmation });
    } catch (mailErr) {
      log.error("orcamento: email de confirmação ao cliente falhou", mailErr, { id });
    }

    // Push notification to the team's devices (best-effort).
    try {
      await sendPushToAll({
        title: "Novo pedido de orçamento",
        body: `${form.name}${form.guests ? ` · ${form.guests} convidados` : ""}`,
        url: "/orcamento/admin",
        tag: "novo-orcamento",
      });
    } catch (pushErr) {
      log.error("orcamento: push falhou", pushErr, { id });
    }

    return NextResponse.json({ id, status: "ok" });
  } catch (err) {
    log.error("orcamento POST falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthed(request)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const quotes = await listQuotes();
    return NextResponse.json(quotes);
  } catch (err) {
    log.error("orcamento GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
