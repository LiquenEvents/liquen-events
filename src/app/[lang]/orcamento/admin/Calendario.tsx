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

export default function Calendario({ quotes, onOpen }: Props) {
  const { toast } = useToast();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // Standalone calendar entries (reuniões, marcações, bloqueios…)
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [modalDate, setModalDate] = useState<string | null>(null);
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
    const pad = (n: number) => String(n).padStart(2, "0");
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
        const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const upcoming = useMemo(() => {
    const today = todayKey();
    return quotes
      .filter((q) => isDateKey(q.date) && q.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, 6);
  }, [quotes]);

  const monthEventCount = quotes.filter(
    (q) => q.date && q.date.startsWith(`${year}-${String(month + 1).padStart(2, "0")}`),
  ).length;

  const modalDateLabel = modalDate
    ? new Date(modalDate + "T12:00:00").toLocaleDateString("pt-PT", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "";

  return (
    <>
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-6">
        <Card>
          <div className="flex items-center justify-between gap-4 mb-5">
            <div>
              <h3 className="font-display text-foreground/85 text-lg leading-tight">
                {MONTHS[month]} {year}
              </h3>
              <p className="text-foreground/40 text-[10px] tracking-[0.2em] uppercase mt-1">
                {monthEventCount} evento{monthEventCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => exportIcs(quotes)}
                title="Exportar para calendário (.ics)"
                className="mr-1"
              >
                Exportar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                aria-label="Mês anterior"
                className="w-8 px-0"
              >
                ‹
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  const d = new Date();
                  setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
              >
                Hoje
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                aria-label="Mês seguinte"
                className="w-8 px-0"
              >
                ›
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAYS.map((w) => (
              <div
                key={w}
                className="text-center text-foreground/25 text-[9px] tracking-[0.2em] uppercase py-1"
              >
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d, i) => {
              if (d === null) return <div key={i} />;
              const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
              const dayQuotes = byDay.get(key) ?? [];
              const dayEvents = eventsByDay.get(key) ?? [];
              const isToday = key === todayStr;
              const total = dayQuotes.length + dayEvents.length;
              // Chip budget for the cell: up to 2 quotes, then events fill the
              // rest (compressed to 1 when the day is busy so the "+N" fits).
              // `hidden` is derived from what's actually shown — so a day with
              // exactly 3 of one type still surfaces the 3rd via "+1" instead of
              // dropping it silently.
              const shownQuotes = dayQuotes.slice(0, 2);
              const shownEvents = dayEvents.slice(0, total > 3 ? 1 : 2);
              const hiddenCount = total - shownQuotes.length - shownEvents.length;
              const dayLabel = `${d} de ${MONTHS[month]}${isToday ? " (hoje)" : ""} — ${
                total > 0 ? `${total} evento${total !== 1 ? "s" : ""}; ` : ""
              }Enter para adicionar`;
              return (
                <div
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={dayLabel}
                  onClick={() => openAdd(key)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      openAdd(key);
                    }
                  }}
                  className={`group min-h-[64px] rounded-md border p-1.5 cursor-pointer transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${isToday ? "border-[#4d6350]/50 bg-[#4d6350]/[0.06]" : "border-foreground/[0.07] bg-white hover:border-[#4d6350]/30 hover:bg-[#4d6350]/[0.025]"}`}
                >
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-[10px] tabular-nums ${isToday ? "text-[#4d6350] font-bold" : "text-foreground/35"}`}
                    >
                      {d}
                    </span>
                    <span className="text-[#4d6350]/0 group-hover:text-[#4d6350]/60 text-[11px] leading-none transition-colors">
                      +
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 mt-0.5">
                    {shownQuotes.map((q) => (
                      <button
                        key={q.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpen(q);
                        }}
                        aria-label={`Abrir pedido de ${q.name} — ${eventTypeLabel(q)}`}
                        title={`${q.name} — ${eventTypeLabel(q)}`}
                        className="text-left text-[9px] leading-tight truncate px-1 py-0.5 rounded-sm hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/40"
                        style={{
                          background: `${STATUS_COLOR[q.status]}26`,
                          color: STATUS_COLOR[q.status],
                        }}
                      >
                        {q.name.split(" ")[0]}
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
                        className="text-left text-[9px] leading-tight truncate px-1 py-0.5 rounded-sm hover:line-through transition-all flex items-center gap-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-foreground/40"
                        style={{
                          background: `${KIND_META[ev.kind].color}22`,
                          color: KIND_META[ev.kind].color,
                        }}
                      >
                        <span
                          className="w-1 h-1 rounded-full shrink-0"
                          style={{ background: KIND_META[ev.kind].color }}
                        />
                        {ev.time ? `${ev.time} ` : ""}
                        {ev.title}
                      </button>
                    ))}
                    {hiddenCount > 0 && (
                      <span className="text-foreground/30 text-[9px] px-1">+{hiddenCount}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
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
                  <div className="text-center shrink-0 w-10">
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
