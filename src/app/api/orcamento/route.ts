import { NextRequest, NextResponse } from "next/server";
import type { Quote, QuoteFormData, PriceBreakdown } from "@/lib/orcamento/types";
import {
  CATEGORIES,
  EVENT_TYPES_BY_CATEGORY,
  LOCATION_LABELS,
  BUDGET_RANGES,
  URGENCY_OPTIONS,
} from "@/lib/orcamento/data";
import { sendMail, esc, MAIL_TO } from "@/lib/mail";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "@/lib/email-logo";
import { buildClientConfirmation } from "@/lib/client-confirmation";
import { LANG_COOKIE, normalizeLocale } from "@/lib/i18n/config";
import { createQuote, listQuotes, getQuote, generateQuoteId, quoteIdFor } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { sendPushToAll } from "@/lib/push";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quotePayloadSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";
import { eur0 as eur } from "@/lib/money";

export const maxDuration = 30;

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

/** Portuguese numbers read in 3-3-3 groups. Shown grouped, dialled unchanged —
 *  "939513151" is a string to decode; "939 513 151" is a phone number. */
const telDisplay = (phone: string) => {
  const raw = phone.trim();
  const d = raw.replace(/\D/g, "");
  const nat = d.length === 12 && d.startsWith("351") ? d.slice(3) : d;
  if (nat.length !== 9) return raw; // not a PT number — leave exactly as typed
  const grouped = `${nat.slice(0, 3)} ${nat.slice(3, 6)} ${nat.slice(6)}`;
  return raw.startsWith("+") || d.length === 12 ? `+351 ${grouped}` : grouped;
};

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
  const name = form.name?.trim() || "Sem nome";
  const firstName = name.split(" ")[0] || "o cliente";
  const subtitle = [et, cat].filter(Boolean).join(" · ");
  // The label the CLIENT picked ("Casamento"), not the pricing taxonomy's
  // plural bucket ("Casamentos"). Falls back to the taxonomy for quotes created
  // in the back office, which have no eventName.
  const eventLabel = form.eventName?.trim() || et || cat;
  const eventoLc = (et || cat || "evento").toLowerCase();

  // The date is the hero — availability decides the booking. Lead with the
  // weekday, flag weekends, and show the full range for a multi-day event. The
  // weekday is derived from a Y/M/D-constructed date, so it's correct whatever
  // the server timezone is.
  const WEEKDAYS_PT = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
  const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec((form.date ?? "").trim());
  const weekday = dm
    ? WEEKDAYS_PT[new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])).getDay()]
    : "";
  const isWeekend = weekday === "sábado" || weekday === "domingo";
  const when = prettyDate(form.date);
  const dateHero =
    form.isMultiDay && form.endDate
      ? `${when} – ${prettyDate(form.endDate)}`
      : weekday
        ? `${weekday}, ${when}`
        : when;

  // Fields the form captures but the old email dropped — shown only when set.
  const budgetLabel = form.budgetRange
    ? (BUDGET_RANGES.find((b) => b.id === form.budgetRange)?.label ?? "")
    : "";
  const urgencyLabel =
    form.urgency && form.urgency !== "standard"
      ? (URGENCY_OPTIONS.find((u) => u.id === form.urgency)?.label ?? "")
      : "";
  const referral = form.referralSource?.trim() || "";

  // Subject: type · date · pax — name. The triage trio leads (survives phone
  // truncation); the name lands last where a cut is harmless.
  const subjectLead = [et || cat, when, form.guests ? `${form.guests} pax` : ""]
    .filter(Boolean)
    .join(" · ");
  const subject = subjectLead ? `${subjectLead} — ${name}` : `Novo pedido de orçamento — ${name}`;

  // Hidden inbox-preview line — surfaces what the subject can't.
  const preheader = [
    name,
    dateHero + (isWeekend ? " (fim de semana)" : ""),
    subtitle,
    form.guests ? `${form.guests} convidados` : "",
    local,
    budgetLabel ? `orçamento ${budgetLabel}` : "",
    urgencyLabel ? "resposta urgente" : "",
  ]
    .filter(Boolean)
    .join(" · ");

  // Detail row — hairline-separated; empty value → no row. `valueHtml` is
  // already-safe HTML (esc'd text or a link). Classes drive dark-mode overrides.
  // A fact line. No rules, no table chrome — Apple's product pages carry a
  // whole spec sheet on whitespace and type weight alone, and the old
  // hairline-per-row grid read as a form to fill in rather than a lead to act
  // on. `valueHtml` is already-safe HTML (esc'd text or a link).
  const row = (label: string, valueHtml: string) =>
    valueHtml
      ? `<tr>
           <td class="em-muted" style="padding:0 0 13px;color:#8a8579;font-size:13px;line-height:20px;width:124px;vertical-align:top;font-weight:400">${esc(label)}</td>
           <td class="em-strong" style="padding:0 0 13px;color:#1d1b16;font-size:15px;line-height:20px;font-weight:500">${valueHtml}</td>
         </tr>`
      : "";
  // Only what decides the answer. Guests and location ride in the summary line
  // under the name, so repeating them here would be the third time on one
  // screen.
  const eventRows =
    (budgetLabel ? row("Orçamento", esc(budgetLabel)) : "") +
    (urgencyLabel ? row("Antecedência", esc(urgencyLabel)) : "") +
    (referral ? row("Origem", esc(referral)) : "") +
    (form.company ? row("Empresa", esc(form.company)) : "") +
    (form.nif ? row("NIF", esc(form.nif)) : "") +
    (estimate ? row("Estimativa", esc(estimate)) : "");

  // Email-specific logo: the site PNG carries ~23% transparent padding, so at a
  // 38px box the wordmark rendered only ~18px tall (illegible), and width/height
  // attrs that didn't match its 1.674 ratio made Outlook stretch it. This asset
  // is pre-trimmed onto an opaque cream plate at an exact 2:1 ratio — the plate
  // also keeps the mark readable in Gmail's dark theme, which never inverts
  // image pixels.
  // cid: — the wordmark travels inside the message. A hosted URL 404s until
  // production is promoted, and is blocked outright by clients that suppress
  // remote images by default. See lib/email-logo.
  const logoUrl = `cid:${EMAIL_LOGO_CID}`;

  // The one-line summary under the name: what a colleague would say out loud.
  // Uses the form's OWN label ("Casamento") rather than the pricing taxonomy's
  // ("Casamentos · Eventos Particulares") — the category adds no information the
  // type doesn't already carry.
  const summary = [eventLabel, form.guests ? `${form.guests} convidados` : "", local]
    .filter(Boolean)
    .join(" · ");

  // Actions. WhatsApp is primary when there's a phone (fastest, warmest channel
  // for PT leads); otherwise the email reply is primary. Both are prefilled.
  const waMsg = `Olá ${firstName}, fala a equipa da Líquen Events 🌿 Recebemos o seu pedido para o ${eventoLc} e teríamos todo o gosto em ajudar. Quando lhe der jeito, é só dizer — combinamos uma conversa sem compromisso.`;
  const waDigits = form.phone ? form.phone.replace(/\D/g, "") : "";
  const waNumber = /^9\d{8}$/.test(waDigits) ? `351${waDigits}` : waDigits;
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}` : "";
  const mailtoHref =
    `mailto:${esc(form.email)}?subject=${encodeURIComponent(`Líquen Events — o seu pedido para o ${eventoLc}`)}` +
    `&body=${encodeURIComponent(
      `Olá ${firstName},\n\nMuito obrigado pelo seu pedido de orçamento para o ${eventoLc} — foi um gosto recebê-lo.\n\n\n\nCom os melhores cumprimentos,\nEquipa Líquen Events`,
    )}`;

  // ONE solid action, everything else quiet. Two equally-weighted buttons make
  // the reader choose before they can act; the pill is the fastest channel and
  // the other route stays a plain link beside it.
  const btnPrimary =
    "display:inline-block;background:#4c6150;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;letter-spacing:-0.01em;padding:14px 30px;border-radius:980px;white-space:nowrap";
  const btnGhost =
    "display:inline-block;color:#4c6150;text-decoration:none;font-size:15px;font-weight:500;padding:14px 4px;white-space:nowrap";
  const actionsCell = waHref
    ? `<td class="em-btn" style="padding-right:22px"><a href="${waHref}" style="${btnPrimary}">Enviar WhatsApp</a></td>
       <td class="em-btn"><a href="${mailtoHref}" style="${btnGhost}">Responder por email&nbsp;›</a></td>`
    : `<td class="em-btn"><a href="${mailtoHref}" style="${btnPrimary}">Responder ao cliente</a></td>`;

  const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Novo pedido de orçamento</title>
<style>
  /* The site's own typefaces. Apple Mail loads these; Gmail strips @font-face
     entirely, which is why every stack below falls back deliberately rather
     than by accident — Georgia is Playfair's closest stock relative, and the
     system sans is Inter's. The team sees the brand where the client supports
     it and something coherent everywhere else. Team email only: it's our own
     inbox, so the remote font fetch costs no client privacy. */
  @font-face{font-family:'Playfair Display';font-style:normal;font-weight:400;font-display:swap;src:url(https://fonts.gstatic.com/s/playfairdisplay/v40/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvUDQ.ttf) format('truetype')}
  @font-face{font-family:'Inter';font-style:normal;font-weight:400;font-display:swap;src:url(https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuLyfMZg.ttf) format('truetype')}
  @font-face{font-family:'Inter';font-style:normal;font-weight:600;font-display:swap;src:url(https://fonts.gstatic.com/s/inter/v20/UcCO3FwrK3iLTeHuS_nVMrMxCp50SjIw2boKoduKmMEVuGKYMZg.ttf) format('truetype')}
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  @media (prefers-color-scheme: dark){
    .em-bg{background:#14160f !important}
    .em-card{background:#1e2118 !important}
    .em-strong{color:#f4f3ef !important}
    .em-muted{color:#a9ab9c !important}
    .em-hair{border-color:#343829 !important}
    .em-quote{border-color:#8a6a1d !important}
    .em-foot{color:#8b8d7f !important}
  }
  @media only screen and (max-width:620px){
    .em-pad{padding-left:26px !important;padding-right:26px !important}
    .em-name{font-size:27px !important}
    .em-date{font-size:23px !important}
    /* Stack the actions: side by side they broke the pill onto two lines. */
    .em-btn{display:block !important;padding:0 0 6px !important}
  }
</style>
</head>
<body class="em-bg" style="margin:0;padding:0;background:#f7f4ee">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f7f4ee">${esc(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background:#f7f4ee;padding:44px 14px">
    <tr><td align="center">
      <!-- No border, no shadow: one sheet of paper, and every division below is
           made with space instead of a line. -->
      <table role="presentation" width="580" cellpadding="0" cellspacing="0" class="em-card" style="max-width:580px;width:100%;background:#ffffff;border-radius:22px;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">

        <tr><td class="em-pad" align="center" style="padding:44px 46px 0">
          <img src="${logoUrl}" alt="Líquen Events" width="112" height="56" style="width:112px;height:56px;display:block;border:0;border-radius:10px;margin:0 auto;font-family:Georgia,'Times New Roman',serif;font-size:17px;color:#4c6150;text-decoration:none" />
        </td></tr>

        <tr><td class="em-pad" style="padding:46px 46px 0">
          <div class="em-muted" style="color:#63755a;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600">Novo pedido${urgencyLabel ? ` · <span style="color:#8a6a1d">urgente</span>` : ""}</div>
          <div class="em-strong em-name" style="font-family:'Playfair Display',Georgia,'Times New Roman',serif;font-size:32px;color:#1d1b16;margin-top:16px;line-height:1.08;letter-spacing:-0.02em">${esc(name)}</div>
          ${summary ? `<div class="em-muted" style="color:#8a8579;font-size:15px;margin-top:12px;line-height:1.5">${esc(summary)}</div>` : ""}
        </td></tr>

        ${
          dateHero
            ? `<tr><td class="em-pad" style="padding:40px 46px 0">
                 <div class="em-muted" style="color:#8a8579;font-size:11px;letter-spacing:0.16em;text-transform:uppercase;font-weight:600">Data do evento</div>
                 <div class="em-strong em-date" style="font-family:'Playfair Display',Georgia,serif;font-size:27px;color:#1d1b16;margin-top:10px;line-height:1.2;letter-spacing:-0.01em">${esc(dateHero)}${isWeekend ? `<span class="em-muted" style="font-family:'Inter',-apple-system,Segoe UI,Arial,sans-serif;font-size:13px;color:#63755a;font-weight:600;letter-spacing:0"> · fim de semana</span>` : ""}</div>
               </td></tr>`
            : ""
        }

        ${
          eventRows
            ? `<tr><td class="em-pad" style="padding:38px 46px 0">
                 <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${eventRows}</table>
               </td></tr>`
            : ""
        }

        ${
          form.notes
            ? `<tr><td class="em-pad" style="padding:34px 46px 0">
                 <div class="em-quote em-strong" style="border-left:2px solid #d6ab3a;padding-left:20px;color:#45483c;font-size:15px;line-height:1.7;white-space:pre-wrap">${esc(form.notes)}</div>
               </td></tr>`
            : ""
        }

        <tr><td class="em-pad" style="padding:42px 46px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${actionsCell}</tr></table>
        </td></tr>

        <tr><td class="em-pad" style="padding:34px 46px 0">
          <div style="font-size:16px;line-height:1.9">
            <a href="mailto:${esc(form.email)}" style="color:#4c6150;text-decoration:none">${esc(form.email)}</a>${
              form.phone
                ? `<br><a href="tel:${telHref(form.phone)}" style="color:#4c6150;text-decoration:none">${esc(telDisplay(form.phone))}</a>`
                : ""
            }
          </div>
        </td></tr>

        <tr><td class="em-pad" style="padding:38px 46px 44px">
          <div class="em-hair em-foot" style="border-top:1px solid #ede7db;padding-top:18px;color:#a8a294;font-size:11.5px;line-height:1.7;letter-spacing:0.2px">
            Responder a este email chega diretamente a ${esc(firstName)}.<br>
            Ref. ${esc(id)} · ${esc(new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }))}
          </div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    "NOVO PEDIDO DE ORÇAMENTO",
    `Referência: ${id}`,
    "",
    `Nome: ${name}`,
    subtitle ? `Evento: ${subtitle}` : "",
    dateHero ? `Data: ${dateHero}${isWeekend ? " (fim de semana)" : ""}` : "",
    form.guests ? `Convidados: ${form.guests}` : "",
    local ? `Local: ${local}` : "",
    budgetLabel ? `Orçamento: ${budgetLabel}` : "",
    urgencyLabel ? `Antecedência: ${urgencyLabel}` : "",
    estimate ? `Orçamento estimado: ${estimate}` : "",
    "",
    `Email: ${form.email}`,
    form.phone ? `Telefone: ${form.phone}` : "",
    form.company ? `Empresa: ${form.company}` : "",
    form.nif ? `NIF: ${form.nif}` : "",
    referral ? `Como nos conheceu: ${referral}` : "",
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
    // We LOG the drop (with the UA) so a false positive — a real lead lost to an
    // over-eager autofill on a non-bot browser — is observable instead of 100%
    // silent. Behaviour is unchanged: the request is still discarded.
    if (body && typeof body === "object" && (body as Record<string, unknown>).website) {
      const ua = request.headers.get("user-agent") ?? "";
      const looksLikeBot = /bot|crawl|spider|headless|python|curl|wget|scrapy/i.test(ua);
      log.warn("orcamento: honeypot acionado — pedido descartado", {
        looksLikeBot,
        ua: ua.slice(0, 120),
      });
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

    // Idempotency: the client sends a stable submissionId (persisted across a
    // reload for the same unsent enquiry). Deriving a deterministic id from it
    // means a retried POST — the response was lost and the visitor resubmitted
    // — maps to the SAME quote instead of creating a duplicate lead and sending
    // a duplicate email. A fresh random id is used when no submissionId is sent.
    const rawSub = (body as Record<string, unknown> | null)?.submissionId;
    const submissionId =
      typeof rawSub === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(rawSub) ? rawSub : null;
    const id = submissionId ? quoteIdFor(submissionId) : generateQuoteId();

    if (submissionId) {
      try {
        if (await getQuote(id)) return NextResponse.json({ id, status: "ok" });
      } catch (lookupErr) {
        // A lookup failure must never block a genuine new lead — fall through
        // and create it (a duplicate is far better than a dropped enquiry).
        log.error("orcamento: verificação de idempotência falhou", lookupErr, { id });
      }
    }

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
        attachments: [emailLogoAttachment()],
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

    // Partial success: the lead is safely in the store but the team's email
    // didn't go out (e.g. SMTP unset/misconfigured in prod). The visitor still
    // sees success — the lead isn't lost — but nobody was actively notified, so
    // it can sit unseen in the dashboard. Log at ERROR so it reaches the alert
    // fan-out (Sentry/webhook), turning a silent notification gap into a signal.
    if (persisted && !emailed) {
      log.error(
        "orcamento: lead registada mas email à equipa NÃO enviado — verificar SMTP",
        undefined,
        { id },
      );
    }

    // Confirmation to the client, in the language they were browsing in (best-effort).
    try {
      const locale = normalizeLocale(request.cookies?.get?.(LANG_COOKIE)?.value);
      // Feed the builder what the client actually told us, so the email mirrors
      // their event back in prose instead of being a generic acknowledgement.
      // Only the free-text `location` is passed — never the internal pricing
      // bucket (LOCATION_LABELS), which would read as "your venue is a rural
      // area". Weddings/christenings are organised by a couple → plural register.
      const confirmation = buildClientConfirmation({
        locale,
        name: form.name,
        referenceId: id,
        event: {
          typeLabel:
            (form.category && form.eventType
              ? EVENT_TYPES_BY_CATEGORY[form.category]?.find((e) => e.id === form.eventType)?.label
              : undefined) ||
            form.eventName ||
            (form.category ? CATEGORIES.find((c) => c.id === form.category)?.label : undefined) ||
            undefined,
          date: form.date,
          guests: form.guests || undefined,
          location: form.location?.trim() || undefined,
          plural: form.eventType === "casamentos" || form.eventType === "batizados",
        },
      });
      // Per-recipient daily cap: this email goes to a user-SUPPLIED address, so
      // without a ceiling the endpoint could be abused to bombard a victim's
      // inbox from Líquen's sender reputation (a mail-bomb amplifier). 5/day per
      // address is far above any real client's needs; over it we skip the
      // confirmation — the lead is already persisted and the team notified.
      const emailKey = `confirm:${form.email.trim().toLowerCase()}`;
      if ((await rateLimit(emailKey, 5, 24 * 60 * 60_000)).ok) {
        const sentRes = await sendMail({
          to: form.email,
          // The body invites a reply ("basta responder a este email"), so point
          // replies explicitly at the monitored inbox. Without this they only
          // land correctly by coincidence — because MAIL_FROM happens to equal
          // MAIL_TO today — and a hot lead's reply would vanish the moment a
          // separate sending identity is configured.
          replyTo: MAIL_TO,
          headers: {
            "Auto-Submitted": "auto-generated", // RFC 3834 — don't auto-reply to us
            "X-Auto-Response-Suppress": "OOF, AutoReply", // Exchange/Outlook
          },
          attachments: [emailLogoAttachment()],
          ...confirmation,
        });
        // sendMail resolves {sent:false} (no throw) when SMTP is unconfigured,
        // so without this the client silently gets nothing and nobody knows.
        if (!sentRes.sent) {
          log.error("orcamento: confirmação ao cliente NÃO enviada — verificar SMTP", undefined, {
            id,
          });
        }
      } else {
        log.warn("orcamento: cap diário do email de confirmação atingido — não reenviado", { id });
      }
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
