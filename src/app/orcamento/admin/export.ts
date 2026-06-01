/**
 * Small, dependency-free export helpers for the back office:
 *  - CSV download (Excel/Numbers/Sheets friendly, UTF-8 BOM + ; separator for PT)
 *  - Printable run-sheet for an event (opens an isolated print window)
 */
import type { Quote } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY, PACKAGES } from "../data";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

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
  ]);
  return [header, ...rows];
}

/** A short ISO date stamp for filenames, e.g. 2026-06-01. */
export function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
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

  win.document.write(`<!doctype html><html lang="pt"><head><meta charset="utf-8" />
  <title>Run-sheet — ${escapeHtml(q.name)} — ${q.id}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #111; margin: 0; padding: 40px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2d5c3e; padding-bottom: 16px; margin-bottom: 24px; }
    .brand { font-size: 13px; letter-spacing: .25em; text-transform: uppercase; color: #2d5c3e; font-weight: 700; }
    h1 { font-size: 26px; margin: 6px 0 2px; }
    .sub { color: #666; font-size: 13px; }
    .id { color: #999; font-size: 11px; font-family: monospace; }
    .facts { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 28px; margin-bottom: 28px; }
    .facts div { border-bottom: 1px solid #eee; padding: 6px 0; display: flex; justify-content: space-between; gap: 12px; }
    .facts .k { color: #888; font-size: 12px; text-transform: uppercase; letter-spacing: .08em; }
    .facts .v { color: #111; font-size: 13px; font-weight: 600; text-align: right; }
    h2 { font-size: 12px; letter-spacing: .2em; text-transform: uppercase; color: #2d5c3e; margin: 28px 0 10px; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 8px 6px; border-bottom: 1px solid #eee; font-size: 13px; vertical-align: top; }
    td.t { width: 70px; font-weight: 700; color: #2d5c3e; white-space: nowrap; }
    td.o { color: #777; width: 150px; }
    td.empty, li.empty { color: #aaa; font-style: italic; }
    ul { list-style: none; padding: 0; margin: 0; }
    li { padding: 6px 0; border-bottom: 1px solid #f0f0f0; font-size: 13px; display: flex; gap: 10px; align-items: center; }
    li.done { color: #888; text-decoration: line-through; }
    .box { width: 16px; height: 16px; border: 1.5px solid #999; border-radius: 3px; display: inline-flex; align-items: center; justify-content: center; font-size: 11px; color: #2d5c3e; flex: 0 0 auto; }
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
    ${q.notes ? `<h2>Notas do cliente</h2><div class="notes">${escapeHtml(q.notes)}</div>` : ""}
    ${q.adminNotes ? `<h2>Notas internas</h2><div class="notes">${escapeHtml(q.adminNotes)}</div>` : ""}
    <div class="foot">Gerado em ${new Date().toLocaleString("pt-PT")} · Líquen Events</div>
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
