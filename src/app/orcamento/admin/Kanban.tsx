"use client";

import { useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import { useToast } from "./Toast";

const COLUMNS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novos", color: "#8a8a82" },
  { id: "em_revisao", label: "Em Revisão", color: "#9aa36a" },
  { id: "cotado", label: "Proposta Enviada", color: "#7c854b" },
  { id: "aceite", label: "Ganhos", color: "#525a2f" },
  { id: "rejeitado", label: "Perdidos", color: "#5a5a55" },
];

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
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
}

interface Props {
  quotes: Quote[];
  onOpen: (q: Quote) => void;
  onStatusChange: (id: string, status: QuoteStatus) => void;
}

export default function Kanban({ quotes, onOpen, onStatusChange }: Props) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<QuoteStatus | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<string, Quote[]> = {};
    for (const c of COLUMNS) map[c.id] = [];
    for (const q of quotes) (map[q.status] ??= []).push(q);
    return map;
  }, [quotes]);

  // Shared by drag-and-drop and keyboard moves: optimistic update + PATCH,
  // reverting (and toasting) on failure.
  async function changeStatus(q: Quote, status: QuoteStatus) {
    if (q.status === status) return;
    onStatusChange(q.id, status); // optimistic
    try {
      const res = await fetch(`/api/orcamento/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      toast(`${q.name} → ${COLUMNS.find((c) => c.id === status)?.label}`, "success");
    } catch {
      onStatusChange(q.id, q.status); // revert
      toast("Não foi possível atualizar", "error");
    }
  }

  async function drop(status: QuoteStatus) {
    setOverCol(null);
    const id = dragId;
    setDragId(null);
    if (!id) return;
    const q = quotes.find((x) => x.id === id);
    if (q) changeStatus(q, status);
  }

  // Keyboard equivalent of dragging: move a focused card to the adjacent column.
  function moveByKeyboard(q: Quote, dir: -1 | 1) {
    const idx = COLUMNS.findIndex((c) => c.id === q.status);
    const next = COLUMNS[idx + dir];
    if (next) changeStatus(q, next.id);
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-4 scroll-hide">
      {COLUMNS.map((col) => {
        const items = byStatus[col.id] ?? [];
        const value = items.reduce((s, q) => s + (q.quotedPrice ?? 0), 0);
        return (
          <div
            key={col.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(col.id);
            }}
            onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
            onDrop={() => drop(col.id)}
            className={`flex-shrink-0 w-[270px] rounded-2xl border transition-all duration-200 ${
              overCol === col.id
                ? "border-[#637a5f]/50 bg-[#637a5f]/[0.05] ring-2 ring-[#637a5f]/20"
                : "border-foreground/[0.07] bg-foreground/[0.018]"
            }`}
          >
            <div className="flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full" style={{ background: col.color }} />
                <span className="text-foreground/60 text-[11px] tracking-[0.1em] uppercase font-medium">
                  {col.label}
                </span>
              </div>
              <span className="text-foreground/35 text-[10px] tabular-nums bg-foreground/[0.06] rounded-full px-2 py-0.5 min-w-[20px] text-center">
                {items.length}
              </span>
            </div>

            <div className="px-2 pb-2 flex flex-col gap-2 min-h-[120px] max-h-[calc(100vh-18rem)] overflow-y-auto">
              {items.map((q) => (
                <div
                  key={q.id}
                  draggable
                  role="button"
                  tabIndex={0}
                  aria-label={`${q.name}, ${eventTypeLabel(q)}, ${q.guests} pessoas. Coluna ${col.label}. Enter para abrir; setas esquerda/direita para mover de coluna.`}
                  onDragStart={() => setDragId(q.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onClick={() => onOpen(q)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onOpen(q);
                    } else if (e.key === "ArrowLeft") {
                      e.preventDefault();
                      moveByKeyboard(q, -1);
                    } else if (e.key === "ArrowRight") {
                      e.preventDefault();
                      moveByKeyboard(q, 1);
                    }
                  }}
                  className={`group cursor-grab active:cursor-grabbing rounded-xl border border-foreground/[0.07] bg-white p-3.5 shadow-sm transition-all hover:shadow-md hover:border-foreground/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#637a5f]/60 ${
                    dragId === q.id ? "opacity-40 rotate-1" : ""
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1 w-1 h-8 rounded-full shrink-0"
                      style={{ background: col.color }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-foreground/78 text-sm font-semibold truncate">{q.name}</p>
                      <p className="text-foreground/45 text-[11px] truncate mt-0.5">
                        {eventTypeLabel(q)} · {q.guests} pax
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-foreground/[0.06]">
                    {q.quotedPrice ? (
                      <span className="text-[#4d6350] text-xs font-semibold">
                        {eur(q.quotedPrice)}
                      </span>
                    ) : (
                      <span className="text-foreground/20 text-[10px]">sem valor</span>
                    )}
                    {q.date && (
                      <span className="text-foreground/30 text-[10px]">
                        {new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
                          day: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="flex flex-col items-center justify-center py-8 text-foreground/18">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    className="mb-1.5"
                  >
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  <p className="text-[10px] text-center px-2">Arraste para aqui</p>
                </div>
              )}
            </div>

            {value > 0 && (
              <div className="px-4 py-2.5 border-t border-foreground/[0.07] flex items-center justify-between">
                <span className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase">
                  Total
                </span>
                <span className="text-foreground/55 text-[11px] font-semibold tabular-nums">
                  {eur(value)}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
