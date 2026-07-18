/**
 * Small, dependency-free export helpers for the back office:
 *  - CSV download (Excel/Numbers/Sheets friendly, UTF-8 BOM + ; separator for PT)
 *  - Printable run-sheet for an event (opens an isolated print window)
 */
import type { Quote } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "@/lib/orcamento/data";
import { eur0 } from "@/lib/money";

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "";
}

/** Escape a single CSV cell (handles quotes, separators and newlines). */
function cell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Build a `;`-separated CSV string (PT locale) with a UTF-8 BOM for Excel. */
export function toCsv(rows: (string | number)[][]): string {
  const body = rows.map((r) => r.map(cell).join(";")).join("\r\n");
  return "﻿" + body;
}

/** Trigger a client-side download of a CSV file. */
export function downloadCsv(filename: string, rows: (string | number)[][]): void {
  const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const STATUS_LABEL: Record<string, string> = {
  pendente: "Pendente",
  em_revisao: "Em Revisão",
  cotado: "Cotado",
  aceite: "Aceite",
  rejeitado: "Rejeitado",
};

/** Export a list of quotes (pedidos) as CSV rows. */
export function quotesToCsvRows(quotes: Quote[]): (string | number)[][] {
  const header = [
    "ID",
    "Data submissão",
    "Estado",
    "Nome",
    "Email",
    "Telefone",
    "Empresa",
    "NIF",
    "Categoria",
    "Tipo de evento",
    "Pacote",
    "Convidados",
    "Data do evento",
    "Local",
    "Duração (h)",
    "Estimativa (€)",
    "Cotado (€)",
    "Responsável",
    "Ref. contrato",
    "Motivo de perda",
    "Arquivado",
  ];
  const rows = quotes.map((q) => [
    q.id,
    new Date(q.submittedAt).toLocaleString("pt-PT"),
    STATUS_LABEL[q.status] ?? q.status,
    q.name,
    q.email,
    q.phone,
    q.company ?? "",
    q.nif ?? "",
    CATEGORIES.find((c) => c.id === q.category)?.label ?? "",
    eventTypeLabel(q),
    PACKAGES.find((p) => p.id === q.packageTier)?.label ?? "",
    q.guests ?? 0,
    q.date ?? "",
    q.location ?? "",
    q.duration ?? "",
    q.priceBreakdown?.total ?? "",
    q.quotedPrice ?? "",
    q.assignedTo ?? "",
    q.contractRef ?? "",
    q.lostReason ?? "",
    q.archived ? "Sim" : "",
  ]);
  return [header, ...rows];
}

const PAYMENT_KIND_LABEL: Record<string, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};

/** Flatten every payment across all quotes into CSV rows (treasury export). */
export function paymentsToCsvRows(quotes: Quote[]): (string | number)[][] {
  const header = ["Evento (ID)", "Cliente", "Tipo", "Valor c/IVA (€)", "Data", "Estado", "Nota"];
  const rows: (string | number)[][] = [];
  for (const q of quotes) {
    for (const p of q.payments ?? []) {
      rows.push([
        q.id,
        q.name,
        PAYMENT_KIND_LABEL[p.kind] ?? p.kind,
        p.amount ?? 0,
        p.date ?? "",
        p.paid ? "Pago" : "Por receber",
        p.note ?? "",
      ]);
    }
  }
  rows.sort((a, b) => String(a[4]).localeCompare(String(b[4])));
  return [header, ...rows];
}

/** A short ISO date stamp for filenames, e.g. 2026-06-01. */
export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── iCalendar (.ics) export ────────────────────────────────────────────────

/** Escape a text value per RFC 5545 (backslash, separators, newlines). */
function icsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Build the iCalendar document for an event (pure — unit-tested). All-day
 * event on the quote's date — multi-day when an endDate is set — with the
 * client's contact in the notes. Returns null when the quote has no date.
 */
export function buildEventIcs(q: Quote, now: Date = new Date()): string | null {
  if (!q.date) return null;

  const day = (iso: string) => iso.replace(/-/g, "");
  // DTEND is exclusive for all-day events: day after the last event day.
  const lastDay = q.endDate && q.endDate >= q.date ? q.endDate : q.date;
  const end = new Date(lastDay + "T12:00:00");
  end.setDate(end.getDate() + 1);
  const dtEnd = end.toISOString().slice(0, 10).replace(/-/g, "");
  const stamp = now
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");

  const summary = `${eventTypeLabel(q) || "Evento"} — ${q.name}`;
  const description = [
    `Cliente: ${q.name}`,
    q.phone ? `Tel: ${q.phone}` : "",
    q.email ? `Email: ${q.email}` : "",
    q.guests ? `Convidados: ${q.guests}` : "",
    `Ref: ${q.id}`,
  ]
    .filter(Boolean)
    .join("\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Liquen Events//Back Office//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${q.id}@liquen-events.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${day(q.date)}`,
    `DTEND;VALUE=DATE:${dtEnd}`,
    `SUMMARY:${icsText(summary)}`,
    q.location ? `LOCATION:${icsText(q.location)}` : "",
    `DESCRIPTION:${icsText(description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ]
    .filter(Boolean)
    .join("\r\n");
}

/**
 * Download the event as a .ics file so anyone on the team can drop it into
 * their personal calendar (Google/Apple/Outlook).
 */
export function downloadEventIcs(q: Quote): void {
  const ics = buildEventIcs(q);
  if (!ics) return;

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `evento-${q.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const RSVP_LABEL: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  recusado: "Recusado",
};

/** Export an event's guest list (RSVP) as CSV rows. */
export function guestsToCsvRows(q: Quote): (string | number)[][] {
  const header = ["Convidado / Família", "Pessoas", "RSVP", "Nota"];
  const rows = (q.guestList ?? []).map((g) => [
    g.name,
    g.party ?? 1,
    RSVP_LABEL[g.rsvp] ?? g.rsvp,
    g.note ?? "",
  ]);
  return [header, ...rows];
}

/**
 * Open a clean, print-ready guest list for an event (alphabetical, with a
 * headcount summary). Handy to print or save as PDF for the venue/catering.
 */
export function printGuestList(q: Quote): void {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;

  const guests = (q.guestList ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  let confirmed = 0;
  let pending = 0;
  let declined = 0;
  for (const g of guests) {
    const n = g.party || 1;
    if (g.rsvp === "confirmado") confirmed += n;
    else if (g.rsvp === "pendente") pending += n;
    else declined += n;
  }

  const dateStr = q.date
    ? new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const rows = guests.length
    ? guests
        .map(
          (g) =>
            `<tr><td>${escapeHtml(g.name)}</td><td class="c">${g.party || 1}</td><td class="o">${RSVP_LABEL[g.rsvp] ?? g.rsvp}</td><td>${escapeHtml(g.note ?? "")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="4" class="empty">Sem convidados na lista.</td></tr>`;

  win.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8" />
  <title>Convidados — ${escapeHtml(q.name)} — ${q.id}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 40px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #525a2f; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 13px; letter-spacing: .25em; text-transform: uppercase; color: #525a2f; font-weight: 700; }
    h1 { font-size: 26px; margin: 6px 0 2px; }
    .sub { color: #666; font-size: 13px; }
    .id { color: #999; font-size: 11px; font-family: monospace; }
    .facts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-bottom: 28px; }
    .facts div { border: 1px solid #eee; border-radius: 8px; padding: 12px; text-align: center; }
    .facts .v { font-size: 22px; font-weight: 700; color: #525a2f; }
    .facts .k { color: #888; font-size: 11px; text-transform: uppercase; letter-spacing: .1em; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: #888; padding: 8px 6px; border-bottom: 2px solid #ddd; }
    td { padding: 8px 6px; border-bottom: 1px solid #eee; font-size: 13px; }
    td.c { width: 70px; text-align: center; font-weight: 600; }
    td.o { width: 110px; color: #525a2f; }
    td.empty { color: #aaa; font-style: italic; text-align: center; }
    .foot { margin-top: 40px; color: #aaa; font-size: 11px; text-align: center; }
    @media print { body { padding: 24px; } }
  </style></head><body>
    <div class="head">
      <div>
        <div class="brand">Líquen Events · Convidados</div>
        <h1>${escapeHtml(q.name)}</h1>
        <div class="sub">${dateStr}</div>
      </div>
      <div class="id">${q.id}</div>
    </div>
    <div class="facts">
      <div><div class="v">${confirmed}</div><div class="k">Confirmados</div></div>
      <div><div class="v">${pending}</div><div class="k">Pendentes</div></div>
      <div><div class="v">${declined}</div><div class="k">Recusados</div></div>
    </div>
    <table>
      <thead><tr><th>Convidado / Família</th><th>Pessoas</th><th>RSVP</th><th>Nota</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot">Gerado em ${new Date().toLocaleString("pt-PT")} · Líquen Events</div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 200); };</script>
  </body></html>`);
  win.document.close();
}

/**
 * Open a clean, print-ready run-sheet for a single event in a new window.
 * Designed for the day-of: contacts, key facts, the timeline and the checklist.
 */
export function printRunSheet(q: Quote): void {
  const win = window.open("", "_blank", "width=820,height=1000");
  if (!win) return;

  const cat = CATEGORIES.find((c) => c.id === q.category)?.label ?? "";
  const et = eventTypeLabel(q);
  const pkg = PACKAGES.find((p) => p.id === q.packageTier)?.label ?? "";
  const dateStr = q.date
    ? new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "—";

  const facts: [string, string][] = [
    ["Tipo", [cat, et].filter(Boolean).join(" · ") || "—"],
    ["Pacote", pkg || "—"],
    ["Convidados", String(q.guests ?? "—")],
    ["Duração", q.duration ? `${q.duration}h` : "—"],
    ["Local", q.location || "—"],
    ["Cliente", q.name || "—"],
    ["Telefone", q.phone || "—"],
    ["Email", q.email || "—"],
  ];

  const timeline = (q.timeline ?? [])
    .slice()
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const timelineRows = timeline.length
    ? timeline
        .map(
          (t) =>
            `<tr><td class="t">${t.time || "—"}</td><td>${escapeHtml(t.title)}</td><td class="o">${escapeHtml(t.owner ?? "")}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="3" class="empty">Sem cronograma definido.</td></tr>`;

  const checklist = q.checklist ?? [];
  const checklistRows = checklist.length
    ? checklist
        .map(
          (c) =>
            `<li class="${c.done ? "done" : ""}"><span class="box">${c.done ? "✓" : ""}</span>${escapeHtml(c.label)}</li>`,
        )
        .join("")
    : `<li class="empty">Sem checklist definida.</li>`;

  // Plano de produção decor — campo próprio (productionPlan). Só o mostramos
  // quando tem itens, para não poluir run-sheets de eventos sem plano decor.
  const production = q.productionPlan ?? [];
  const productionBlock = production.length
    ? `<h2>Plano de produção decor</h2>
       <ul>${production
         .map(
           (c) =>
             `<li class="${c.done ? "done" : ""}"><span class="box">${c.done ? "✓" : ""}</span>${escapeHtml(c.label)}</li>`,
         )
         .join("")}</ul>`
    : "";

  // Financial summary for the day-of (what's contracted, paid and still due).
  const payments = (q.payments ?? [])
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const contracted = q.quotedPrice ?? q.priceBreakdown?.total ?? 0;
  const paidSum = payments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  const dueSum = payments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  const financeBlock =
    payments.length || contracted
      ? `<h2>Pagamentos</h2>
         <div class="facts">
           ${contracted ? `<div><span class="k">Contratado</span><span class="v">${eur0(contracted)}</span></div>` : ""}
           <div><span class="k">Recebido</span><span class="v">${eur0(paidSum)}</span></div>
           <div><span class="k">Por receber</span><span class="v">${eur0(dueSum)}</span></div>
         </div>
         ${
           payments.length
             ? `<table><tbody>${payments
                 .map(
                   (p) =>
                     `<tr><td class="t">${p.paid ? "✓" : "○"}</td><td>${PAYMENT_KIND_LABEL[p.kind] ?? p.kind}</td><td class="o">${p.date ? new Date(p.date + "T12:00:00").toLocaleDateString("pt-PT") : "—"}</td><td style="text-align:right;font-weight:600">${eur0(p.amount)}</td></tr>`,
                 )
                 .join("")}</tbody></table>`
             : ""
         }`
      : "";

  win.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8" />
  <title>Run-sheet — ${escapeHtml(q.name)} — ${q.id}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 40px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #525a2f; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 13px; letter-spacing: .25em; text-transform: uppercase; color: #525a2f; font-weight: 700; }
    h1 { font-size: 26px; margin: 6px 0 2px; }
    .sub { color: #666; font-size: 13px; }
    .id { color: #999; font-size: 11px; font-family: monospace; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-bottom: 28px; }
    .facts div { border-bottom: 1px solid #eee; padding: 6px 0; display: flex; justify-content: space-between; gap: 12px; }
    .facts .k { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .facts .v { color: #111; font-size: 13px; font-weight: 600; text-align: right; }
    h2 { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #525a2f; margin: 28px 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 6px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
    td.t { width: 70px; font-weight: 700; color: #525a2f; white-space: nowrap; }
    td.o { color: #777; width: 150px; }
    td.empty, li.empty { color: #aaa; font-style: italic; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; display: flex; gap: 10px; align-items: center; }
    li.done { color: #888; text-decoration: line-through; }
    .box { width: 16px; height: 16px; border: 1.5px solid #999; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #525a2f; flex: 0 0 auto; }
    .notes { margin-top: 24px; padding: 12px 14px; background: #f7f6f3; border-radius: 6px; font-size: 13px; color: #333; white-space: pre-wrap; }
    .foot { margin-top: 40px; color: #aaa; font-size: 11px; text-align: center; }
    @media print { body { padding: 24px; } .foot { position: fixed; bottom: 12px; left: 0; right: 0; } }
  </style></head><body>
    <div class="head">
      <div>
        <div class="brand">Líquen Events · Run-sheet</div>
        <h1>${escapeHtml(q.name)}</h1>
        <div class="sub">${dateStr}</div>
      </div>
      <div class="id">${q.id}</div>
    </div>
    <div class="facts">
      ${facts.map(([k, v]) => `<div><span class="k">${k}</span><span class="v">${escapeHtml(v)}</span></div>`).join("")}
    </div>
    <h2>Cronograma do dia</h2>
    <table><tbody>${timelineRows}</tbody></table>
    <h2>Checklist de produção</h2>
    <ul>${checklistRows}</ul>
    ${productionBlock}
    ${financeBlock}
    ${q.notes ? `<h2>Notas do cliente</h2><div class="notes">${escapeHtml(q.notes)}</div>` : ""}
    ${q.adminNotes ? `<h2>Notas internas</h2><div class="notes">${escapeHtml(q.adminNotes)}</div>` : ""}
    <div class="foot">Gerado em ${new Date().toLocaleString("pt-PT")} · Líquen Events</div>
    <script>window.onload = function () { setTimeout(function () { window.print(); }, 200); };</script>
  </body></html>`);
  win.document.close();
}

const RSVP_LABEL_PRINT: Record<string, string> = {
  pendente: "Pendente",
  confirmado: "Confirmado",
  recusado: "Recusado",
};

/**
 * Open a comprehensive, print-ready event dossier covering all aspects of the
 * event: contact, logistics, financial, timeline, checklist, suppliers and
 * guest list. Designed to be saved as PDF and distributed to the team.
 */
export function printEventDossier(q: Quote): void {
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;

  const cat = CATEGORIES.find((c) => c.id === q.category)?.label ?? "";
  const et = eventTypeLabel(q);
  const pkg = PACKAGES.find((p) => p.id === q.packageTier)?.label ?? "";
  const dateStr = q.date
    ? new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Data a definir";

  const STATUS_LABEL_PT: Record<string, string> = {
    pendente: "Pendente",
    em_revisao: "Em Revisão",
    cotado: "Cotado",
    aceite: "Aceite",
    rejeitado: "Rejeitado",
  };

  // ── Financial ──
  const contracted = q.quotedPrice ?? q.priceBreakdown?.total ?? 0;
  const payments = (q.payments ?? [])
    .slice()
    .sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  const paidSum = payments.filter((p) => p.paid).reduce((s, p) => s + p.amount, 0);
  const dueSum = payments.filter((p) => !p.paid).reduce((s, p) => s + p.amount, 0);
  const supplierCosts = (q.eventSuppliers ?? []).reduce(
    (s, e) => s + (e.actualCost ?? e.estimatedCost ?? 0),
    0,
  );
  const margin = contracted - supplierCosts;

  // ── Sections ──
  const sectionFinancial = `
    <section>
      <h2>Financeiro</h2>
      <div class="facts3">
        <div><span class="k">Valor contratado</span><span class="v">${contracted ? eur0(contracted) : "—"}</span></div>
        <div><span class="k">Recebido</span><span class="v green">${eur0(paidSum)}</span></div>
        <div><span class="k">Por receber</span><span class="v">${eur0(dueSum)}</span></div>
        ${supplierCosts > 0 ? `<div><span class="k">Custos fornecedores</span><span class="v">${eur0(supplierCosts)}</span></div>` : ""}
        ${supplierCosts > 0 ? `<div><span class="k">Margem estimada</span><span class="v ${margin >= 0 ? "green" : "red"}">${eur0(margin)}</span></div>` : ""}
      </div>
      ${
        payments.length
          ? `<table><thead><tr><th></th><th>Tipo</th><th>Data</th><th>Valor</th><th>Nota</th></tr></thead><tbody>
            ${payments
              .map(
                (p) =>
                  `<tr><td class="t">${p.paid ? '<span class="tick">✓</span>' : "○"}</td><td>${PAYMENT_KIND_LABEL[p.kind] ?? p.kind}</td><td>${p.date ? new Date(p.date + "T12:00:00").toLocaleDateString("pt-PT") : "—"}</td><td class="num">${eur0(p.amount)}</td><td class="grey">${escapeHtml(p.note ?? "")}</td></tr>`,
              )
              .join("")}</tbody></table>`
          : ""
      }
    </section>`;

  const suppliers = q.eventSuppliers ?? [];
  const sectionSuppliers = suppliers.length
    ? `<section>
        <h2>Fornecedores</h2>
        <table><thead><tr><th>Nome</th><th>Categoria</th><th>Orçado</th><th>Real</th><th>Estado</th></tr></thead>
        <tbody>
        ${suppliers
          .map(
            (s) =>
              `<tr><td>${escapeHtml(s.name)}</td><td class="grey">${escapeHtml(s.category)}</td><td class="num">${eur0(s.estimatedCost)}</td><td class="num">${s.actualCost != null ? eur0(s.actualCost) : "—"}</td><td class="grey">${s.status}</td></tr>`,
          )
          .join("")}
        </tbody></table>
      </section>`
    : "";

  const timeline = (q.timeline ?? [])
    .slice()
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));
  const sectionTimeline = `<section>
    <h2>Cronograma do dia</h2>
    ${
      timeline.length
        ? `<table><tbody>${timeline
            .map(
              (t) =>
                `<tr><td class="t">${escapeHtml(t.time || "—")}</td><td>${escapeHtml(t.title)}</td><td class="grey">${escapeHtml(t.owner ?? "")}</td></tr>`,
            )
            .join("")}</tbody></table>`
        : "<p class='empty'>Cronograma não definido.</p>"
    }
  </section>`;

  const checklist = q.checklist ?? [];
  const sectionChecklist = `<section>
    <h2>Checklist de produção ${checklist.length ? `(${checklist.filter((c) => c.done).length}/${checklist.length})` : ""}</h2>
    ${
      checklist.length
        ? `<ul>${checklist
            .map(
              (c) =>
                `<li class="${c.done ? "done" : ""}"><span class="box">${c.done ? "✓" : ""}</span>${escapeHtml(c.label)}</li>`,
            )
            .join("")}</ul>`
        : "<p class='empty'>Sem checklist.</p>"
    }
  </section>`;

  // Plano de produção decor — campo próprio (productionPlan), à parte do
  // checklist do evento. Secção só surge quando há plano seeded.
  const production = q.productionPlan ?? [];
  const sectionProduction = production.length
    ? `<section>
        <h2>Plano de produção decor (${production.filter((c) => c.done).length}/${production.length})</h2>
        <ul>${production
          .map(
            (c) =>
              `<li class="${c.done ? "done" : ""}"><span class="box">${c.done ? "✓" : ""}</span>${escapeHtml(c.label)}</li>`,
          )
          .join("")}</ul>
      </section>`
    : "";

  const guests = (q.guestList ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const gConfirmed = guests
    .filter((g) => g.rsvp === "confirmado")
    .reduce((s, g) => s + (g.party || 1), 0);
  const gPending = guests
    .filter((g) => g.rsvp === "pendente")
    .reduce((s, g) => s + (g.party || 1), 0);
  const sectionGuests = guests.length
    ? `<section>
      <h2>Convidados (${guests.length} ${guests.length === 1 ? "entrada" : "entradas"} · ${gConfirmed} confirmados · ${gPending} pendentes)</h2>
      <table><thead><tr><th>Nome</th><th>Pax</th><th>RSVP</th><th>Nota</th></tr></thead><tbody>
      ${guests
        .map(
          (g) =>
            `<tr><td>${escapeHtml(g.name)}</td><td class="num">${g.party || 1}</td><td class="${g.rsvp === "confirmado" ? "green" : g.rsvp === "recusado" ? "red" : "grey"}">${RSVP_LABEL_PRINT[g.rsvp] ?? g.rsvp}</td><td class="grey">${escapeHtml(g.note ?? "")}</td></tr>`,
        )
        .join("")}
      </tbody></table>
    </section>`
    : "";

  win.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8" />
  <title>Dossier — ${escapeHtml(q.name)}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 40px; max-width: 860px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #525a2f; padding-bottom: 16px; margin-bottom: 28px; }
    .brand { font-size: 12px; letter-spacing: .3em; text-transform: uppercase; color: #525a2f; font-weight: 700; margin-bottom: 6px; }
    h1 { font-size: 28px; margin: 4px 0; }
    .sub { color: #555; font-size: 14px; margin-top: 3px; }
    .badge { display: inline-block; padding: 3px 10px; background: #f0f5ee; color: #525a2f; font-size: 11px; letter-spacing: .12em; text-transform: uppercase; font-weight: 600; border-radius: 4px; margin-top: 8px; }
    .id { color: #999; font-size: 10px; font-family: monospace; text-align: right; }
    .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
    .meta > div { border: 1px solid #e8e8e8; border-radius: 8px; padding: 10px 12px; }
    .meta .k { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: #999; display: block; margin-bottom: 4px; }
    .meta .v { font-size: 14px; font-weight: 600; color: #111; }
    .contact { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px 24px; padding: 14px; background: #fafafa; border-radius: 8px; margin-bottom: 24px; }
    .contact > div {}
    .contact .k { font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #aaa; margin-bottom: 2px; }
    .contact .v { font-size: 13px; color: #333; }
    section { margin-bottom: 32px; page-break-inside: avoid; }
    h2 { font-size: 11px; letter-spacing: .25em; text-transform: uppercase; color: #525a2f; margin: 0 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e5ede4; }
    .facts3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px 20px; margin-bottom: 14px; }
    .facts3 > div { padding: 8px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; gap: 8px; }
    .facts3 .k { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: #888; }
    .facts3 .v { font-size: 13px; font-weight: 600; }
    .green { color: #3a5c39; }
    .red { color: #a03a1a; }
    .grey { color: #777; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; font-size: 10px; letter-spacing: .1em; text-transform: uppercase; color: #999; padding: 7px 6px; border-bottom: 2px solid #ddd; }
    td { padding: 7px 6px; border-bottom: 1px solid #f0f0f0; font-size: 13px; vertical-align: top; }
    td.t { width: 70px; font-weight: 700; color: #525a2f; white-space: nowrap; }
    td.num { text-align: right; font-weight: 600; white-space: nowrap; }
    .tick { color: #3a5c39; font-weight: 700; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 6px 0; border-bottom: 1px solid #f5f5f5; font-size: 13px; display: flex; gap: 10px; align-items: center; }
    li.done { color: #aaa; text-decoration: line-through; }
    .box { width: 15px; height: 15px; border: 1.5px solid #bbb; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 10px; color: #525a2f; flex: 0 0 auto; }
    .notes { padding: 12px 14px; background: #f7f6f3; border-radius: 6px; font-size: 13px; color: #333; white-space: pre-wrap; margin-bottom: 10px; }
    p.empty { color: #bbb; font-style: italic; font-size: 13px; }
    .foot { margin-top: 48px; color: #bbb; font-size: 10px; text-align: center; border-top: 1px solid #eee; padding-top: 12px; }
    @media print { body { padding: 24px; } section { page-break-inside: avoid; } }
  </style></head><body>
  <div class="head">
    <div>
      <div class="brand">Líquen Events · Dossier do Evento</div>
      <h1>${escapeHtml(q.name)}</h1>
      <div class="sub">${dateStr}</div>
      <div class="badge">${STATUS_LABEL_PT[q.status] ?? q.status}</div>
    </div>
    <div class="id">${q.id}<br/>Gerado: ${new Date().toLocaleDateString("pt-PT")}</div>
  </div>

  <div class="meta">
    <div><span class="k">Tipo de evento</span><span class="v">${escapeHtml([cat, et].filter(Boolean).join(" · ") || "—")}</span></div>
    <div><span class="k">Pacote</span><span class="v">${escapeHtml(pkg || "—")}</span></div>
    <div><span class="k">Convidados</span><span class="v">${q.guests ?? "—"}</span></div>
    <div><span class="k">Local</span><span class="v">${escapeHtml(q.location || "—")}</span></div>
  </div>

  <div class="contact">
    <div><div class="k">Cliente</div><div class="v">${escapeHtml(q.name)}</div></div>
    <div><div class="k">Email</div><div class="v">${escapeHtml(q.email || "—")}</div></div>
    <div><div class="k">Telefone</div><div class="v">${escapeHtml(q.phone || "—")}</div></div>
    ${q.company ? `<div><div class="k">Empresa</div><div class="v">${escapeHtml(q.company)}</div></div>` : ""}
    ${q.nif ? `<div><div class="k">NIF</div><div class="v">${escapeHtml(q.nif)}</div></div>` : ""}
    ${q.duration ? `<div><div class="k">Duração</div><div class="v">${q.duration}h</div></div>` : ""}
  </div>

  ${sectionFinancial}
  ${sectionSuppliers}
  ${sectionTimeline}
  ${sectionChecklist}
  ${sectionProduction}
  ${sectionGuests}

  ${q.notes ? `<section><h2>Notas do cliente</h2><div class="notes">${escapeHtml(q.notes)}</div></section>` : ""}
  ${q.adminNotes ? `<section><h2>Notas internas</h2><div class="notes">${escapeHtml(q.adminNotes)}</div></section>` : ""}

  <div class="foot">Dossier gerado em ${new Date().toLocaleString("pt-PT")} · Líquen Events</div>
  <script>window.onload = function () { setTimeout(function () { window.print(); }, 200); };</script>
</body></html>`);
  win.document.close();
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
