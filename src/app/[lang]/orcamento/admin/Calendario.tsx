"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote, CalendarEvent, CalendarEventKind } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import { isDateKey, todayKey } from "./util";
import { Button, Card, EmptyState, Field } from "./ui";

const WEEKDAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

const STATUS_COLOR: Record<string, string> = {
  pendente: "#8a8a82",
  em_revisao: "#9aa36a",
  cotado: "#7c854b",
  aceite: "#525a2f",
  rejeitado: "#5a5a55",
};

const KIND_META: Record<CalendarEventKind, { label: string; color: string }> = {
  reuniao: { label: "Reunião", color: "#7a8caa" },
  evento: { label: "Evento", color: "#7c854b" },
  bloqueio: { label: "Bloqueio", color: "#b5654a" },
  nota: { label: "Nota", color: "#a08a5a" },
};

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

/** Build and download an .ics calendar with every dated event. */
function exportIcs(quotes: Quote[]) {
  const day = (iso: string) => iso.replace(/-/g, "");
  // Escape per RFC 5545 instead of blanking commas/semicolons.
  const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");
  const stamp = new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Liquen Events//Back Office//PT",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];
  for (const q of quotes) {
    // Only real calendar dates — free-form values ("a definir") would otherwise
    // emit a malformed `DTSTART;VALUE=DATE:adefinir`. Skip them.
    if (!isDateKey(q.date)) continue;
    // DTEND is exclusive for all-day events: the day after the last day. Honour
    // multi-day ranges (endDate) so a 3-day wedding shows as 3 days, not 1.
    const lastDay = q.endDate && isDateKey(q.endDate) && q.endDate >= q.date ? q.endDate : q.date;
    const dtEnd = new Date(Date.parse(lastDay + "T00:00:00Z") + 86_400_000)
      .toISOString()
      .slice(0, 10)
      .replace(/-/g, "");
    const title = `${eventTypeLabel(q)} — ${q.name}`;
    const desc = [
      q.location && `Local: ${q.location}`,
      q.guests && `${q.guests} convidados`,
      q.phone && `Tel: ${q.phone}`,
    ]
      .filter(Boolean)
      .join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${q.id}@liquen-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day(q.date)}`,
      `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${esc(title)}`,
      q.location ? `LOCATION:${esc(q.location)}` : "",
      desc ? `DESCRIPTION:${esc(desc)}` : "",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  const blob = new Blob([lines.filter(Boolean).join("\r\n")], {
    type: "text/calendar;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "liquen-eventos.ics";
  a.click();
  URL.revokeObjectURL(url);
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export default function Calendario({ quotes, onOpen }: Props) {
  const { toast } = useToast();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Standalone calendar entries (reuniões, marcações, bloqueios…)
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modalDate, setModalDate] = useState<string | null>(null);
  // Day peek: the day whose events are expanded in the panel under the grid.
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [form, setForm] = useState<{
    title: string;
    kind: CalendarEventKind;
    time: string;
    note: string;
  }>({ title: "", kind: "evento", time: "", note: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/calendario", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setEvents(d))
      .catch(() => {});
  }, []);

  async function addEvent() {
    const title = form.title.trim();
    if (!title || !modalDate || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/calendario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, title, date: modalDate }),
      });
      if (!res.ok) throw new Error();
      const ev = await res.json();
      setEvents((prev) => [...prev, ev]);
      toast("Adicionado ao calendário", "success");
      setModalDate(null);
      setForm({ title: "", kind: "evento", time: "", note: "" });
    } catch {
      toast("Não foi possível guardar", "error");
    } finally {
      setSaving(false);
    }
  }

  async function deleteEvent(id: string, title: string) {
    // Single-click delete is a footgun on a tiny target — confirm first.
    if (!window.confirm(`Remover "${title}" do calendário?`)) return;
    // Optimistic remove, but keep the previous list so we can put the event
    // back if the server rejects the delete — otherwise it silently reappears
    // on the next reload and the team never learns it failed.
    const snapshot = events;
    setEvents((prev) => prev.filter((e) => e.id !== id));
    try {
      const res = await fetch(`/api/calendario/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      setEvents(snapshot);
      toast("Não foi possível remover. Tente novamente.", "error");
    }
  }

  // Open the "add event" modal for a given day (shared by click + keyboard).
  function openAdd(key: string) {
    setModalDate(key);
    setForm({ title: "", kind: "evento", time: "", note: "" });
  }

  // Month navigation always goes through here so the day peek never lingers
  // pointing at a day the grid no longer shows.
  function goTo(next: Date) {
    setCursor(next);
    setSelectedDay(null);
  }

  // Escape closes the add-event modal.
  useEffect(() => {
    if (!modalDate) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalDate(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [modalDate]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const e of events) {
      if (!map.has(e.date)) map.set(e.date, []);
      map.get(e.date)!.push(e);
    }
    return map;
  }, [events]);

  const byDay = useMemo(() => {
    const map = new Map<string, Quote[]>();
    for (const q of quotes) {
      // Free-form dates ("a definir", etc.) are allowed by the schema; skip
      // anything that isn't a real YYYY-MM-DD so `.toISOString()` below can't
      // throw a RangeError and take the whole month grid down with it.
      if (!isDateKey(q.date)) continue;
      // Multi-day events (endDate set) occupy every day of the range, so a
      // 3-day wedding blocks all three days on the grid — not just day one.
      // Capped at 31 days as a guard against bad data.
      const last = q.endDate && isDateKey(q.endDate) && q.endDate >= q.date ? q.endDate : q.date;
      const d = new Date(q.date + "T12:00:00");
      for (let i = 0; i < 31; i++) {
        // Build the key from LOCAL parts (not toISOString/UTC) so it matches the
        // grid cell keys below and stays correct in far-offset zones.
        const key = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        if (key > last) break;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(q);
        d.setDate(d.getDate() + 1);
      }
    }
    return map;
  }, [quotes]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = todayKey();

  // Full weeks: leading/trailing days of the neighbouring months are rendered
  // dimmed (and inert) so the grid is always a clean rectangle of hairlines.
  const cells: { key: string; day: number; inMonth: boolean }[] = [];
  const totalCells = Math.ceil((startOffset + daysInMonth) / 7) * 7;
  for (let i = 0; i < totalCells; i++) {
    const d = new Date(year, month, i - startOffset + 1);
    cells.push({
      key: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
      day: d.getDate(),
      inMonth: d.getMonth() === month,
    });
  }

  const upcoming = useMemo(() => {
    const today = todayKey();
    return quotes
      .filter((q) => isDateKey(q.date) && q.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [quotes]);

  const monthPrefix = `${year}-${pad2(month + 1)}`;
  const monthQuoteCount = quotes.filter((q) => q.date && q.date.startsWith(monthPrefix)).length;
  const monthEventCount = events.filter((e) => e.date.startsWith(monthPrefix)).length;
  const monthTotal = monthQuoteCount + monthEventCount;

  const dayLabelLong = (key: string) =>
    new Date(key + "T12:00:00").toLocaleDateString("pt-PT", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });

  const modalDateLabel = modalDate
    ? new Date(modalDate + "T12:00:00").toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  const selectedQuotes = selectedDay ? (byDay.get(selectedDay) ?? []) : [];
  const selectedEvents = selectedDay ? (eventsByDay.get(selectedDay) ?? []) : [];

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <Card padding="lg">
          {/* ── Header: month title + quiet controls on one row ── */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="min-w-0">
              <h3 className="font-display text-foreground/90 text-xl sm:text-2xl leading-tight truncate">
                {MONTHS[month]} {year}
              </h3>
              <p className="text-foreground/40 text-[10px] tracking-[0.2em] uppercase mt-1.5">
                {monthTotal === 0
                  ? "Sem eventos este mês"
                  : `${monthTotal} evento${monthTotal !== 1 ? "s" : ""} este mês`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportIcs(quotes)}
                title="Exportar para calendário (.ics)"
                className="hidden sm:inline-flex"
              >
                Exportar
              </Button>
              <div
                className="flex items-center rounded-xl border border-foreground/[0.08] p-0.5"
                role="group"
                aria-label="Navegação do mês"
              >
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goTo(new Date(year, month - 1, 1))}
                  aria-label="Mês anterior"
                  className="w-8 px-0"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const d = new Date();
                    goTo(new Date(d.getFullYear(), d.getMonth(), 1));
                  }}
                >
                  Hoje
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => goTo(new Date(year, month + 1, 1))}
                  aria-label="Mês seguinte"
                  className="w-8 px-0"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </Button>
              </div>
            </div>
          </div>

          {/* ── Weekday header ── */}
          <div className="grid grid-cols-7 mb-2" aria-hidden="true">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="text-center text-foreground/30 text-[9px] tracking-[0.25em] uppercase py-1"
              >
                {w}
              </div>
            ))}
          </div>

          {/* ── Month grid: hairline lines via 1px gaps over a tinted base ── */}
          <div
            role="group"
            aria-label={`Calendário de ${MONTHS[month]} ${year}`}
            className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-foreground/[0.06] bg-foreground/[0.06]"
          >
            {cells.map((c) => {
              if (!c.inMonth) {
                return (
                  <div
                    key={c.key}
                    aria-hidden="true"
                    className="min-h-[52px] sm:min-h-[80px] bg-white p-1.5 sm:p-2"
                  >
                    <span className="text-[10px] sm:text-[11px] tabular-nums text-foreground/[0.15]">
                      {c.day}
                    </span>
                  </div>
                );
              }
              const key = c.key;
              const dayQuotes = byDay.get(key) ?? [];
              const dayEvents = eventsByDay.get(key) ?? [];
              const isToday = key === todayStr;
              const isSelected = key === selectedDay;
              const total = dayQuotes.length + dayEvents.length;
              // Chip budget for the cell: up to 2 quotes, then events fill the
              // rest (compressed to 1 when the day is busy so the "+N" fits).
              // `hidden` is derived from what's actually shown — so a day with
              // exactly 3 of one type still surfaces the 3rd via "+1" instead of
              // dropping it silently.
              const shownQuotes = dayQuotes.slice(0, 2);
              const shownEvents = dayEvents.slice(0, total > 3 ? 1 : 2);
              const hiddenCount = total - shownQuotes.length - shownEvents.length;
              // On very narrow screens the chips collapse into plain dots.
              const dots = [
                ...dayQuotes.map((q) => STATUS_COLOR[q.status]),
                ...dayEvents.map((ev) => KIND_META[ev.kind].color),
              ].slice(0, 4);
              const dayLabel = `${c.day} de ${MONTHS[month]}${isToday ? " (hoje)" : ""} — ${
                total > 0
                  ? `${total} evento${total !== 1 ? "s" : ""}; Enter para ver`
                  : "Enter para adicionar"
              }`;
              return (
                <div
                  key={key}
                  role="button"
                  tabIndex={0}
                  aria-label={dayLabel}
                  aria-pressed={isSelected || undefined}
                  onClick={() => {
                    // A day with entries opens the peek; an empty day goes
                    // straight to "add" — the fastest path either way.
                    if (total > 0) setSelectedDay(isSelected ? null : key);
                    else openAdd(key);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      if (total > 0) setSelectedDay(isSelected ? null : key);
                      else openAdd(key);
                    }
                  }}
                  className={`group relative min-h-[52px] sm:min-h-[80px] bg-white p-1 sm:p-1.5 cursor-pointer motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#4d6350]/60 ${
                    isSelected
                      ? "ring-1 ring-inset ring-[#4d6350]/45 bg-[#4d6350]/[0.04]"
                      : isToday
                        ? "hover:bg-[#4d6350]/[0.03]"
                        : "hover:bg-[#4d6350]/[0.025]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    {isToday ? (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4d6350] text-white text-[10px] font-semibold tabular-nums">
                        {c.day}
                      </span>
                    ) : (
                      <span className="text-[10px] sm:text-[11px] tabular-nums text-foreground/40 px-0.5">
                        {c.day}
                      </span>
                    )}
                    <button
                      type="button"
                      tabIndex={-1}
                      aria-label={`Adicionar a ${c.day} de ${MONTHS[month]}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        openAdd(key);
                      }}
                      className="hidden sm:block text-[#4d6350]/0 group-hover:text-[#4d6350]/60 hover:!text-[#4d6350] text-sm leading-none px-0.5 motion-safe:transition-colors"
                    >
                      +
                    </button>
                  </div>

                  {/* Chips (sm and up) */}
                  <div className="hidden sm:flex flex-col gap-[3px] mt-1">
                    {shownQuotes.map((q) => (
                      <button
                        key={q.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(q);
                        }}
                        aria-label={`Abrir pedido de ${q.name} — ${eventTypeLabel(q)}`}
                        title={`${q.name} — ${eventTypeLabel(q)}`}
                        className="flex items-center gap-1.5 min-w-0 text-left text-[9px] leading-none px-1.5 py-1 rounded-md bg-foreground/[0.035] text-foreground/65 hover:bg-foreground/[0.07] motion-safe:transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#4d6350]/60"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: STATUS_COLOR[q.status] }}
                        />
                        <span className="truncate">{q.name.split(" ")[0]}</span>
                      </button>
                    ))}
                    {shownEvents.map((ev) => (
                      <button
                        key={ev.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteEvent(ev.id, ev.title);
                        }}
                        aria-label={`Remover ${KIND_META[ev.kind].label}: ${ev.title}`}
                        title={`${KIND_META[ev.kind].label}: ${ev.title} (clique para remover)`}
                        className="flex items-center gap-1.5 min-w-0 text-left text-[9px] leading-none px-1.5 py-1 rounded-md bg-foreground/[0.035] text-foreground/65 hover:line-through hover:bg-foreground/[0.07] motion-safe:transition-all focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-[#4d6350]/60"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full shrink-0"
                          style={{ background: KIND_META[ev.kind].color }}
                        />
                        <span className="truncate">
                          {ev.time ? `${ev.time} ` : ""}
                          {ev.title}
                        </span>
                      </button>
                    ))}
                    {hiddenCount > 0 && (
                      <span className="text-foreground/35 text-[9px] leading-none px-1.5 py-0.5">
                        +{hiddenCount}
                      </span>
                    )}
                  </div>

                  {/* Dots (below sm) — chips would overflow tiny cells */}
                  {dots.length > 0 && (
                    <div className="flex sm:hidden flex-wrap gap-[3px] mt-1.5 px-0.5">
                      {dots.map((color, di) => (
                        <span
                          key={di}
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ background: color }}
                        />
                      ))}
                      {total > dots.length && (
                        <span className="text-foreground/35 text-[8px] leading-[6px]">+</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ── Legend ── */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {(Object.keys(KIND_META) as CalendarEventKind[]).map((k) => (
              <span key={k} className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: KIND_META[k].color }}
                  aria-hidden="true"
                />
                <span className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase">
                  {KIND_META[k].label}
                </span>
              </span>
            ))}
            <span className="ml-auto hidden sm:inline text-foreground/25 text-[9px] tracking-[0.15em] uppercase">
              Clique num dia para ver ou adicionar
            </span>
          </div>

          {/* ── Day peek: everything on the selected day, with real targets ── */}
          {selectedDay && (selectedQuotes.length > 0 || selectedEvents.length > 0) && (
            <div className="mt-5 rounded-xl border border-foreground/[0.07] bg-foreground/[0.02] overflow-hidden">
              <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-foreground/[0.06]">
                <p className="bo-eyebrow capitalize">{dayLabelLong(selectedDay)}</p>
                <div className="flex items-center gap-1">
                  <Button variant="subtle" size="sm" onClick={() => openAdd(selectedDay)}>
                    Adicionar
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedDay(null)}
                    aria-label="Fechar dia"
                    className="w-8 px-0"
                  >
                    ×
                  </Button>
                </div>
              </div>
              <div className="divide-y divide-foreground/[0.05]">
                {selectedQuotes.map((q) => (
                  <button
                    key={q.id}
                    onClick={() => onOpen(q)}
                    className="w-full flex items-center gap-3 text-left px-4 py-3 hover:bg-foreground/[0.03] motion-safe:transition-colors"
                  >
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: STATUS_COLOR[q.status] }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-foreground/75 text-xs font-medium truncate">
                        {q.name}
                      </span>
                      <span className="block text-foreground/40 text-[10px] truncate">
                        {eventTypeLabel(q)}
                        {q.guests ? ` · ${q.guests} convidados` : ""}
                      </span>
                    </span>
                    <span className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase shrink-0">
                      Abrir
                    </span>
                  </button>
                ))}
                {selectedEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: KIND_META[ev.kind].color }}
                      aria-hidden="true"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-foreground/75 text-xs font-medium truncate">
                        {ev.time ? `${ev.time} · ` : ""}
                        {ev.title}
                      </span>
                      <span className="block text-foreground/40 text-[10px] truncate">
                        {KIND_META[ev.kind].label}
                        {ev.note ? ` · ${ev.note}` : ""}
                      </span>
                    </span>
                    <button
                      onClick={() => deleteEvent(ev.id, ev.title)}
                      aria-label={`Remover ${KIND_META[ev.kind].label}: ${ev.title}`}
                      className="text-foreground/35 hover:text-[#8a2a22] text-[9px] tracking-[0.15em] uppercase shrink-0 motion-safe:transition-colors"
                    >
                      Remover
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Empty month ── */}
          {monthTotal === 0 && (
            <EmptyState
              icon={
                <svg
                  width="24"
                  height="24"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="17" rx="2" />
                  <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
                </svg>
              }
              title="Mês sem eventos"
              description="Clique num dia do calendário para adicionar uma reunião, um bloqueio ou uma nota."
            />
          )}
        </Card>

        {/* Upcoming */}
        <Card padding="none" className="overflow-hidden self-start">
          <p className="bo-eyebrow px-5 sm:px-6 py-4 border-b border-foreground/[0.07]">
            Próximos eventos
          </p>
          <div className="divide-y divide-foreground/[0.06]">
            {upcoming.map((q) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className="w-full text-left px-5 sm:px-6 py-3.5 hover:bg-foreground/[0.02] motion-safe:transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-center shrink-0 w-10 py-1.5 rounded-lg bg-[#4d6350]/[0.06]">
                    <p className="font-display text-[#4d6350] text-lg font-semibold leading-none">
                      {new Date(q.date + "T12:00:00").getDate()}
                    </p>
                    <p className="text-foreground/40 text-[9px] uppercase mt-0.5">
                      {MONTHS[new Date(q.date + "T12:00:00").getMonth()].slice(0, 3)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground/70 text-xs font-medium truncate">{q.name}</p>
                    <p className="text-foreground/40 text-[11px] truncate">
                      {eventTypeLabel(q)} · {q.guests} convidados
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {upcoming.length === 0 && (
              <EmptyState
                icon={
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    aria-hidden="true"
                  >
                    <rect x="3" y="4" width="18" height="17" rx="2" />
                    <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
                  </svg>
                }
                title="Sem eventos agendados"
                description="Os próximos eventos com data marcada aparecem aqui."
              />
            )}
          </div>
        </Card>
      </div>

      {/* Add-event modal */}
      {modalDate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={() => setModalDate(null)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Adicionar ao calendário — ${modalDateLabel}`}
            className="relative w-full max-w-md bg-white border border-foreground/10 rounded-2xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="bo-eyebrow mb-1.5">Novo no calendário</p>
                <p className="text-foreground/75 text-sm capitalize">{modalDateLabel}</p>
              </div>
              <button
                onClick={() => setModalDate(null)}
                aria-label="Fechar"
                className="text-foreground/35 text-xl leading-none -mt-1 hover:text-foreground/65 motion-safe:transition-colors"
              >
                ×
              </button>
            </div>

            <fieldset className="mb-4">
              <legend className="bo-eyebrow mb-2">Tipo</legend>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(KIND_META) as CalendarEventKind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={form.kind === k}
                    onClick={() => setForm((f) => ({ ...f, kind: k }))}
                    className={`px-3 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase border motion-safe:transition-colors ${form.kind === k ? "text-cream" : "text-foreground/50 border-foreground/15 hover:border-foreground/30"}`}
                    style={
                      form.kind === k
                        ? { background: KIND_META[k].color, borderColor: KIND_META[k].color }
                        : undefined
                    }
                  >
                    {KIND_META[k].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <Field
              autoFocus
              label="Título"
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
              placeholder="Ex.: Reunião com fornecedor"
            />

            <div className="mt-3 flex gap-2">
              <Field
                label="Hora"
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                containerClassName="w-32"
              />
              <Field
                label="Nota"
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Opcional"
                containerClassName="flex-1"
              />
            </div>

            <Button
              fullWidth
              onClick={addEvent}
              loading={saving}
              disabled={!form.title.trim()}
              className="mt-4"
            >
              {saving ? "A guardar…" : "Adicionar ao calendário"}
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
