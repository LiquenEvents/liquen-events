"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote, CalendarEvent, CalendarEventKind } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import { useToast } from "./Toast";

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
  const dated = quotes.filter((q) => q.date);
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Liquen Events//Back Office//PT",
    "CALSCALE:GREGORIAN",
  ];
  for (const q of dated) {
    const d = q.date.replace(/-/g, "");
    const title = `${eventTypeLabel(q)} — ${q.name}`.replace(/[,;\\]/g, " ");
    const desc = [
      q.location && `Local: ${q.location}`,
      q.guests && `${q.guests} convidados`,
      q.phone && `Tel: ${q.phone}`,
    ]
      .filter(Boolean)
      .join(" \\n ");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${q.id}@liquen-events.com`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${d}`,
      `SUMMARY:${title}`,
      desc ? `DESCRIPTION:${desc}` : "",
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
  void pad;
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
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await fetch(`/api/calendario/${id}`, { method: "DELETE" }).catch(() => {});
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
    for (const q of quotes) {
      if (!q.date) continue;
      const key = q.date; // yyyy-mm-dd
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(q);
    }
    return map;
  }, [quotes]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = new Date().toISOString().slice(0, 10);

  const cells: (number | null)[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const upcoming = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return quotes
      .filter((q) => q.date && q.date >= today)
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
        <div className="bo-card p-5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3
                className="text-foreground/80 font-bold text-lg"
                style={{ fontFamily: "var(--font-playfair)" }}
              >
                {MONTHS[month]} {year}
              </h3>
              <p className="text-foreground/30 text-[10px] tracking-[0.2em] uppercase mt-0.5">
                {monthEventCount} evento{monthEventCount !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => exportIcs(quotes)}
                title="Exportar para calendário (.ics)"
                className="px-3 h-8 mr-1 rounded-md border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.2em] uppercase hover:text-[#4d6350] hover:border-[#4d6350]/40 transition-colors"
              >
                Exportar
              </button>
              <button
                onClick={() => setCursor(new Date(year, month - 1, 1))}
                aria-label="Mês anterior"
                className="w-8 h-8 rounded-md border border-foreground/12 text-foreground/40 hover:text-foreground/70 hover:border-foreground/30 transition-colors"
              >
                ‹
              </button>
              <button
                onClick={() => {
                  const d = new Date();
                  setCursor(new Date(d.getFullYear(), d.getMonth(), 1));
                }}
                className="px-3 h-8 rounded-md border border-foreground/12 text-foreground/40 text-[10px] tracking-[0.2em] uppercase hover:text-foreground/70 hover:border-foreground/30 transition-colors"
              >
                Hoje
              </button>
              <button
                onClick={() => setCursor(new Date(year, month + 1, 1))}
                aria-label="Mês seguinte"
                className="w-8 h-8 rounded-md border border-foreground/12 text-foreground/40 hover:text-foreground/70 hover:border-foreground/30 transition-colors"
              >
                ›
              </button>
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
              const isToday = key === todayKey;
              const total = dayQuotes.length + dayEvents.length;
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
                    {dayQuotes.slice(0, 2).map((q) => (
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
                    {dayEvents.slice(0, total > 3 ? 1 : 2).map((ev) => (
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
                    {total > 3 && (
                      <span className="text-foreground/30 text-[9px] px-1">+{total - 3}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Upcoming */}
        <div className="bo-card">
          <p className="bo-eyebrow px-5 py-4 border-b border-foreground/[0.07]">Próximos eventos</p>
          <div className="divide-y divide-foreground/[0.06]">
            {upcoming.map((q) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className="w-full text-left px-5 py-3.5 hover:bg-foreground/[0.02] transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="text-center shrink-0 w-10">
                    <p
                      className="text-[#4d6350] text-lg font-bold leading-none"
                      style={{ fontFamily: "var(--font-playfair)" }}
                    >
                      {new Date(q.date + "T12:00:00").getDate()}
                    </p>
                    <p className="text-foreground/30 text-[9px] uppercase">
                      {MONTHS[new Date(q.date + "T12:00:00").getMonth()].slice(0, 3)}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-foreground/65 text-xs font-medium truncate">{q.name}</p>
                    <p className="text-foreground/30 text-[11px] truncate">
                      {eventTypeLabel(q)} · {q.guests} pax
                    </p>
                  </div>
                </div>
              </button>
            ))}
            {upcoming.length === 0 && (
              <p className="text-foreground/25 text-sm text-center py-12">Sem eventos agendados.</p>
            )}
          </div>
        </div>
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
            <div className="flex items-start justify-between mb-5">
              <div>
                <p className="text-foreground/22 text-[10px] tracking-[0.3em] uppercase mb-1">
                  Novo no calendário
                </p>
                <p className="text-foreground/70 text-sm capitalize">{modalDateLabel}</p>
              </div>
              <button
                onClick={() => setModalDate(null)}
                aria-label="Fechar"
                className="text-foreground/30 text-lg hover:text-foreground/60 transition-colors"
              >
                ×
              </button>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-4">
              {(Object.keys(KIND_META) as CalendarEventKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setForm((f) => ({ ...f, kind: k }))}
                  className={`px-3 py-1.5 rounded-full text-[10px] tracking-[0.1em] uppercase border transition-colors ${form.kind === k ? "text-cream" : "text-foreground/40 border-foreground/15 hover:border-foreground/30"}`}
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

            <input
              autoFocus
              value={form.title}
              onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && addEvent()}
              placeholder="Título (ex: Reunião com fornecedor)"
              className="bo-input px-3 py-2.5 text-sm text-foreground/75 placeholder-foreground/25 mb-2"
            />

            <div className="flex gap-2 mb-2">
              <input
                type="time"
                value={form.time}
                onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))}
                className="bo-input px-3 py-2 text-sm text-foreground/70 w-32"
              />
              <input
                value={form.note}
                onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="Nota (opcional)"
                className="bo-input flex-1 px-3 py-2 text-sm text-foreground/70 placeholder-foreground/25"
              />
            </div>

            <button
              onClick={addEvent}
              disabled={saving || !form.title.trim()}
              className={`w-full mt-3 py-2.5 rounded-xl text-[11px] tracking-[0.18em] uppercase transition-colors ${saving || !form.title.trim() ? "bg-[#1b2119]/30 text-white/50 cursor-not-allowed" : "bg-[#1b2119] text-white/90 hover:bg-[#2a3227]"}`}
            >
              {saving ? "A guardar…" : "Adicionar ao calendário"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
