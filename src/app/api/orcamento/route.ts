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
import { rotularPontos } from "@/lib/orcamento/decoracao";
import { EMAIL_LOGO_CID, emailLogoAttachment } from "@/lib/email-logo";
import { SITE } from "@/lib/site";
import { buildClientConfirmation } from "@/lib/client-confirmation";
import { LANG_COOKIE, normalizeLocale } from "@/lib/i18n/config";
import { createQuote, listQuotes, getQuote, generateQuoteId, quoteIdFor } from "@/lib/quotes-store";
import { isAuthed } from "@/lib/admin-auth";
import { jsonWithEtag } from "@/lib/api-cache";
import { sendPushToAll } from "@/lib/push";
import { rateLimit, clientIp, sweep } from "@/lib/rate-limit";
import { quotePayloadSchema, firstError } from "@/lib/validation";
import { log } from "@/lib/logger";
import { eur0 as eur } from "@/lib/money";
import { enviarEventos, ipDoPedido } from "@/lib/meta/capi";
import { EVENTOS as EVENTOS_META } from "@/lib/meta/eventos";
import { desserializar as desserializarMeta } from "@/lib/meta/click-id";

export const maxDuration = 30;

/**
 * Não há email do cliente, logo não há confirmação a enviar.
 *
 * É uma saída antecipada com nome, e não um `if` a envolver sessenta linhas:
 * o bloco da confirmação já vive dentro de um `try`, e enfiá-lo num `if`
 * mudava a indentação de tudo o que lá está sem mudar o comportamento de
 * nada. Quem lê o `catch` vê explicitamente que este caso não é uma falha.
 */
class NadaParaConfirmar extends Error {}

/**
 * Reenvia o `Lead` para a Meta pela Conversions API, com o MESMO `event_id`
 * que o browser usou no pixel.
 *
 * ── AS TRÊS GUARDAS, E PORQUE É QUE CADA UMA EXISTE ────────────────────────
 *  1. sem `leadEventId` não se envia. É o que garante a deduplicação: um
 *     identificador gerado aqui nunca encontraria o par do browser, e a
 *     conversão contaria duas vezes;
 *  2. sem `metaClick` não se envia. Esse campo só existe quando o pixel
 *     correu, e o pixel só corre com consentimento — portanto a presença dele
 *     É a prova de consentimento que o servidor tem. Não se inventa outra;
 *  3. sem configuração (`META_DATASET_ID` / `META_CAPI_ACCESS_TOKEN`) o
 *     `enviarEventos` devolve `sem-configuracao` sem abrir socket nenhum.
 *
 * NUNCA lança para fora: quem chama embrulha à mesma, mas a regra vale a pena
 * ser dita duas vezes — o lead vale mil vezes mais do que o evento.
 */
async function reenviarLeadParaMeta(
  request: NextRequest,
  id: string,
  form: QuoteFormData,
): Promise<void> {
  const eventId = (form.leadEventId ?? "").trim();
  const meta = (form.metaClick ?? "").trim();
  if (!eventId || !meta) return;

  const { fbp, fbc } = desserializarMeta(meta);
  const r = await enviarEventos([
    {
      nome: EVENTOS_META.lead,
      eventId,
      quando: Math.floor(Date.now() / 1000),
      fonte: "website",
      contexto: form.notes?.slice(0, 100) || undefined,
      pessoa: {
        email: form.email || undefined,
        telefone: form.phone || undefined,
        nome: form.name || undefined,
        fbp: fbp || undefined,
        fbc: fbc || undefined,
        ip: ipDoPedido(request.headers) || undefined,
        agente: request.headers.get("user-agent") ?? undefined,
      },
    },
  ]);
  if (!r.enviado && r.motivo !== "sem-configuracao") {
    log.error("orcamento: Lead não chegou à Meta", undefined, {
      id,
      motivo: r.motivo,
      detalhe: r.detalhe,
    });
  }
}

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
  const name = form.name?.trim() || "Sem nome";
  const firstName = name.split(" ")[0] || "o cliente";
  const subtitle = [et, cat].filter(Boolean).join(" · ");
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
  // ── "COMO NOS CONHECEU" NÃO VAI NO EMAIL ─────────────────────────────────
  // "Retira isto do email", com a fotografia da linha a dizer
  // `Como nos conheceu  ref:www.google.com`.
  //
  // Tinha razão, e o problema não é o campo — é o sítio. O `referralSource`
  // não é escrito por ninguém: é apanhado pelo LeadSourceCapture no primeiro
  // ecrã da visita, e o que lá está é `ref:<domínio>` ou uma lista de UTMs,
  // ou seja, notação de máquina. Num email que a equipa lê com pressa para
  // decidir se responde, aquela linha ocupa espaço e não ajuda a decidir nada.
  //
  // O campo CONTINUA a ser capturado e gravado. O sítio dele é o back office,
  // onde já alimenta a agregação "de onde vêm os pedidos"
  // (StatsDashboard.tsx) — que é uma pergunta de fim de mês, não de resposta
  // a um pedido. Só deixou de ser desenhado no email.

  // ── O ASSUNTO DIZ PRIMEIRO O QUE É ────────────────────────────────────────
  // A queixa, textual: "não gosto disto assim, quero que fique mais claro que
  // é um pedido de orçamento, está uma confusão enorme".
  //
  // O assunto começava pelo trio de triagem — "Casamentos · 18 set 2027 ·
  // 250 pax — Catarina..." — porque isso é o que decide se o trabalho cabe na
  // agenda. Bom raciocínio, conclusão errada: na lista da caixa de correio,
  // ao lado de tudo o resto, aquilo lia-se como uma marcação já feita, e não
  // como alguém a pedir orçamento. A triagem só serve depois de se saber o
  // que a mensagem é.
  //
  // "Pedido de orçamento" leva 19 caracteres dos cerca de 45 que um telemóvel
  // mostra. É caro, e paga-se de bom grado: o resto do assunto repete-se todo
  // dentro do email, e a linha de pré-visualização — que é a seguir — leva o
  // nome e a data. O que não se pode recuperar é a mensagem parecer outra
  // coisa.
  const subjectLead = [et || cat, when, form.guests ? `${form.guests} pax` : ""]
    .filter(Boolean)
    .join(" · ");
  const subject = subjectLead
    ? `Pedido de orçamento · ${subjectLead} — ${name}`
    : `Pedido de orçamento — ${name}`;

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
  const row = (label: string, valueHtml: string) =>
    valueHtml
      ? `<tr>
           <td class="em-hair em-muted" style="padding:11px 0;border-top:1px solid #eee8dc;color:#6b6f5a;font-size:13px;width:120px;vertical-align:top">${esc(label)}</td>
           <td class="em-hair em-strong" style="padding:11px 0;border-top:1px solid #eee8dc;color:#2a2620;font-size:14px;font-weight:500">${valueHtml}</td>
         </tr>`
      : "";
  const link = (href: string, text: string) =>
    `<a href="${href}" style="color:#4c6150;text-decoration:none">${esc(text)}</a>`;

  // Decision block first (can we do it?), contact block second (how to reply).
  // Os pontos de decoração que o casal escolheu no pedido. Vão no bloco de
  // DECISÃO e não nas notas porque é isto que diz, antes da primeira chamada,
  // se o pedido é a cerimónia toda ou só as mesas do jantar.
  const decor = rotularPontos(form.decorPoints ?? [], "pt").join(" · ");
  const noivos = [form.partnerA, form.partnerB]
    .map((n) => n?.trim())
    .filter(Boolean)
    .join(" & ");
  const eventRows =
    // Sem número exacto vale a estimativa. A linha nunca fica vazia por causa
    // de um `guests: 0` que só quer dizer "ainda não sabem".
    row("Convidados", form.guests ? String(form.guests) : esc(form.guestsEstimate?.trim() ?? "")) +
    row("Local", esc(local)) +
    (noivos ? row("Noivos", esc(noivos)) : "") +
    (decor ? row("Decoração", esc(decor)) : "") +
    (budgetLabel ? row("Orçamento", esc(budgetLabel)) : "") +
    (urgencyLabel ? row("Antecedência", esc(urgencyLabel)) : "");
  // O email pode agora vir VAZIO (a regra é "email ou telefone" — ver
  // quoteFormSchema). `row()` já omite a linha quando o valor é vazio, mas o
  // `link()` construiria um `mailto:` para lado nenhum, por isso a guarda.
  const contactRows =
    (form.email ? row("Email", link(`mailto:${esc(form.email)}`, form.email)) : "") +
    (form.phone ? row("Telefone", link(`tel:${telHref(form.phone)}`, form.phone)) : "") +
    (form.company ? row("Empresa", esc(form.company)) : "") +
    (form.nif ? row("NIF", esc(form.nif)) : "");

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

  // Actions. WhatsApp is primary when there's a phone (fastest, warmest channel
  // for PT leads); otherwise the email reply is primary. Both are prefilled.
  const waMsg = `Olá ${firstName}, fala a equipa da Líquen Events 🌿 Recebemos o seu pedido para o ${eventoLc} e teríamos todo o gosto em ajudar. Quando lhe der jeito, é só dizer — combinamos uma conversa sem compromisso.`;
  const waDigits = form.phone ? form.phone.replace(/\D/g, "") : "";
  const waNumber = /^9\d{8}$/.test(waDigits) ? `351${waDigits}` : waDigits;
  const waHref = waNumber ? `https://wa.me/${waNumber}?text=${encodeURIComponent(waMsg)}` : "";
  const mailtoHref = form.email
    ? `mailto:${esc(form.email)}?subject=${encodeURIComponent(`Líquen Events — o seu pedido para o ${eventoLc}`)}` +
      `&body=${encodeURIComponent(
        `Olá ${firstName},\n\nMuito obrigado pelo seu pedido de orçamento para o ${eventoLc} — foi um gosto recebê-lo.\n\n\n\nCom os melhores cumprimentos,\nEquipa Líquen Events`,
      )}`
    : "";

  // Speed-to-lead nudge — urgency-aware when the client flagged it.
  const nudge = urgencyLabel
    ? "O cliente pediu resposta com urgência — um olá nas próximas horas faz toda a diferença."
    : "Pedidos respondidos no próprio dia convertem muito mais.";
  const btnPrimary =
    "display:inline-block;background:#4c6150;color:#ffffff;text-decoration:none;font-size:14px;font-weight:500;padding:12px 24px;border-radius:10px";
  const btnOutline =
    "display:inline-block;background:#ffffff;border:1px solid #ece7dc;color:#3a3d30;text-decoration:none;font-size:14px;font-weight:500;padding:11px 22px;border-radius:10px";
  // Três casos, agora que um pedido pode chegar só com telefone OU só com
  // email: os dois botões, só o WhatsApp, ou só o email. O que NÃO pode
  // acontecer é desenhar um botão com um `href` vazio — parecia um botão e
  // não fazia nada, que é a pior das três avarias possíveis num email que a
  // equipa lê com pressa.
  const actionsCell =
    waHref && mailtoHref
      ? `<td style="padding-right:10px"><a href="${waHref}" style="${btnPrimary}">Enviar WhatsApp</a></td>
       <td><a href="${mailtoHref}" style="${btnOutline}">Responder por email</a></td>`
      : waHref
        ? `<td><a href="${waHref}" style="${btnPrimary}">Enviar WhatsApp</a></td>`
        : mailtoHref
          ? `<td><a href="${mailtoHref}" style="${btnPrimary}">Responder ao cliente</a></td>`
          : // Inalcançável pelo esquema (exige email ou telefone), mas se
            // alguém afrouxar essa regra é melhor um aviso do que um botão morto.
            `<td style="color:#8f8a7a;font-size:13px">Sem contacto registado.</td>`;

  const html = `<!doctype html>
<html lang="pt">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>Novo pedido de orçamento</title>
<style>
  :root{color-scheme:light dark;supported-color-schemes:light dark}
  @media (prefers-color-scheme: dark){
    .em-bg{background:#161911 !important}
    .em-card{background:#24271c !important;border-color:#3a3d30 !important}
    .em-strong{color:#f4f3ef !important}
    .em-muted{color:#c7c9ba !important}
    .em-hair{border-color:#3a3d30 !important}
    .em-note{background:#1e2118 !important;border-color:#3a3d30 !important}
    .em-foot{color:#9a9c8e !important}
  }
</style>
</head>
<body class="em-bg" style="margin:0;padding:0;background:#f7f4ee">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#f7f4ee">${esc(preheader)}&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="em-bg" style="background:#f7f4ee;padding:32px 12px">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" class="em-card" style="max-width:560px;width:100%;background:#ffffff;border:1px solid #ece7dc;border-radius:16px;overflow:hidden;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
        <!-- Logo colorido -->
        <tr><td align="center" class="em-hair" style="padding:36px 40px 28px;border-bottom:1px solid #ece7dc">
          <img src="${logoUrl}" alt="Líquen Events" width="130" height="65" style="width:130px;height:65px;display:block;border:0;margin:0 auto;font-family:Georgia,'Times New Roman',serif;font-size:18px;color:#4c6150;text-decoration:none" />
        </td></tr>

        <!-- Título -->
        <tr><td style="padding:32px 40px 0">
          <div class="em-muted" style="color:#63755a;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600">Novo pedido de orçamento</div>
          <div class="em-strong" style="font-family:Georgia,'Times New Roman',serif;font-size:27px;color:#2a2620;margin-top:14px;line-height:1.15;letter-spacing:-0.01em">${esc(name)}</div>
          ${subtitle ? `<div class="em-muted" style="color:#8f8a7a;font-size:14px;margin-top:7px">${esc(subtitle)}</div>` : ""}
        </td></tr>

        <!-- Data em destaque -->
        <tr><td style="padding:20px 40px 0">
          <div class="em-muted" style="color:#63755a;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600">Data do evento</div>
          <div class="em-strong" style="font-family:Georgia,serif;font-size:20px;color:#2a2620;margin-top:6px">${esc(dateHero)}${isWeekend ? ` <span style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:12px;color:#63755a;font-weight:600">· fim de semana</span>` : ""}</div>
        </td></tr>

        <!-- O evento -->
        <tr><td style="padding:24px 40px 0">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${eventRows}</table>
        </td></tr>

        <!-- Estimativa -->
        ${
          estimate
            ? `<tr><td style="padding:16px 40px 0">
                 <div class="em-note" style="background:#f7f4ee;border:1px solid #ece7dc;border-radius:10px;padding:14px 16px">
                   <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
                     <td class="em-muted" style="color:#8f8a7a;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;vertical-align:middle">Orçamento estimado</td>
                     <td class="em-strong" style="text-align:right;font-family:Georgia,serif;color:#2a2620;font-size:17px;vertical-align:middle">${esc(estimate)}</td>
                   </tr></table>
                 </div>
               </td></tr>`
            : ""
        }

        <!-- Contacto -->
        <tr><td style="padding:24px 40px 0">
          <div class="em-muted" style="color:#63755a;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;font-weight:600;margin-bottom:2px">Contacto</div>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">${contactRows}</table>
        </td></tr>

        <!-- Notas -->
        ${
          form.notes
            ? `<tr><td style="padding:24px 40px 0">
                 <div class="em-muted" style="color:#63755a;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;margin-bottom:8px;font-weight:600">Notas do cliente</div>
                 <div class="em-note em-strong" style="color:#45483c;font-size:14px;line-height:1.65;white-space:pre-wrap;background:#f7f4ee;border:1px solid #ece7dc;border-radius:10px;padding:14px 16px">${esc(form.notes)}</div>
               </td></tr>`
            : ""
        }

        <!-- Ações -->
        <tr><td style="padding:32px 40px 0">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr>${actionsCell}</tr></table>
          <div class="em-muted" style="color:#6b6f5a;font-size:12px;line-height:1.5;margin-top:14px">${esc(nudge)}</div>
          <div class="em-muted" style="color:#8f8a7a;font-size:12px;line-height:1.5;margin-top:6px">Também pode responder a este email — a resposta vai direta para ${esc(firstName)}.</div>
        </td></tr>

        <!-- Rodapé -->
        <tr><td style="padding:26px 40px 32px">
          <div class="em-hair em-foot" style="border-top:1px solid #ece7dc;padding-top:16px;color:#a8a294;font-size:11px;letter-spacing:0.3px">Ref. ${esc(id)} · ${esc(new Date().toLocaleString("pt-PT", { timeZone: "Europe/Lisbon" }))}</div>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  // ── A PRIMEIRA LINHA DESTE TEXTO É A PRÉ-VISUALIZAÇÃO DA CAIXA DE CORREIO ──
  // Ela fotografou a lista de mensagens e por baixo do assunto lia-se "NOVO
  // PEDIDO DE ORÇAMENTO Referência: LI...". Duas linhas de espaço, e nenhuma
  // delas a dizer quem escreveu nem quando é o casamento: o cabeçalho repetia
  // o que o assunto passa a dizer, e a referência é o dado menos útil que este
  // email tem — serve para procurar mais tarde, não para decidir agora.
  //
  // Alguns clientes de correio mostram o HTML e usam a linha invisível de
  // pré-visualização (a `preheader`, mais acima); outros — foi o caso — mostram
  // a versão em texto simples. As duas passam a dizer o mesmo, e a referência
  // desce para o fim.
  //
  // As linhas em branco são deliberadas e têm de sobreviver. O filtro de baixo
  // deixava cair TUDO o que fosse string vazia, e portanto deixava cair também
  // os espaçamentos: o texto chegava como um bloco corrido de dez linhas
  // coladas, que é a segunda metade da confusão de que ela se queixou. Os
  // campos ausentes passam a ser `null`, e é `null` que se filtra.
  const text = [
    preheader,
    "",
    "O EVENTO",
    subtitle ? `Evento: ${subtitle}` : null,
    dateHero ? `Data: ${dateHero}${isWeekend ? " (fim de semana)" : ""}` : null,
    form.guests ? `Convidados: ${form.guests}` : null,
    local ? `Local: ${local}` : null,
    decor ? `Decoração: ${decor}` : null,
    budgetLabel ? `Orçamento: ${budgetLabel}` : null,
    urgencyLabel ? `Antecedência: ${urgencyLabel}` : null,
    estimate ? `Orçamento estimado: ${estimate}` : null,
    "",
    "QUEM PEDIU",
    `Nome: ${name}`,
    form.email ? `Email: ${form.email}` : null,
    form.phone ? `Telefone: ${form.phone}` : null,
    form.company ? `Empresa: ${form.company}` : null,
    form.nif ? `NIF: ${form.nif}` : null,
    form.notes ? `\nNOTAS DO CLIENTE\n${form.notes}` : null,
    "",
    "Responda a este email para falar diretamente com o cliente.",
    `Referência: ${id}`,
  ]
    .filter((line) => line !== null)
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
        // Sem email do cliente não há a quem responder: omite-se o cabeçalho
        // em vez de o enviar vazio, que faria alguns servidores recusar a
        // mensagem inteira e perder a notificação do lead.
        replyTo: form.email || undefined,
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
    // Só existe quando o cliente deu email. Um pedido que chega só com
    // telemóvel — o caso normal nas variantes sociais — não tem para onde
    // mandar a confirmação, e é a EQUIPA que responde por WhatsApp. Não é uma
    // degradação silenciosa: o email à equipa traz o botão de WhatsApp já
    // pré-preenchido, que é o caminho mais rápido de qualquer forma.
    try {
      if (!form.email) throw new NadaParaConfirmar();
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
          // The client's OWN word first. The taxonomy label is a plural bucket
          // ("Casamentos"), which this email drops into a singular sentence —
          // "o vosso pedido para o casamentos de 25 de janeiro".
          typeLabel:
            form.eventName?.trim() ||
            (form.category && form.eventType
              ? EVENT_TYPES_BY_CATEGORY[form.category]?.find((e) => e.id === form.eventType)?.label
              : undefined) ||
            (form.category ? CATEGORIES.find((c) => c.id === form.category)?.label : undefined) ||
            undefined,
          date: form.date,
          guests: form.guests || undefined,
          location: form.location?.trim() || undefined,
          plural: form.eventType === "casamentos" || form.eventType === "batizados",
          // Na língua do email, não na da equipa: quem escreveu em inglês
          // recebe "Ceremony · Dinner tables", não "Cerimónia · Mesas".
          decor: rotularPontos(form.decorPoints ?? [], locale),
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
      // `NadaParaConfirmar` não é uma falha: é o caso previsto de um pedido
      // que chegou só com telemóvel. Registar isso como erro encheria o
      // fan-out de alertas com o funcionamento normal das páginas sociais, e
      // um alerta que toca sempre deixa de ser lido.
      if (mailErr instanceof NadaParaConfirmar) {
        log.info("orcamento: pedido sem email — confirmação ao cliente não se aplica", { id });
      } else {
        log.error("orcamento: email de confirmação ao cliente falhou", mailErr, { id });
      }
    }

    // ── A Meta, pelo servidor ───────────────────────────────────────────────
    // O browser já disparou o `Lead` para o pixel com um `event_id`, e enviou-o
    // aqui dentro do formulário. Reenvia-se o MESMO identificador pela
    // Conversions API: a Meta reconhece os dois como um acontecimento só, e o
    // envio do servidor é o que sobrevive ao ITP do Safari e aos bloqueadores.
    //
    // Sem `leadEventId` não se envia NADA. Um `event_id` inventado aqui nunca
    // encontraria o par do browser e a conversão passaria a contar a dobrar —
    // que é exactamente a avaria que a deduplicação existe para evitar.
    try {
      await reenviarLeadParaMeta(request, id, form);
    } catch (metaErr) {
      log.error("orcamento: reenvio do Lead para a Meta falhou", metaErr, { id });
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
    return jsonWithEtag(request, quotes);
  } catch (err) {
    log.error("orcamento GET falhou", err);
    return NextResponse.json({ error: "Erro interno" }, { status: 500 });
  }
}
