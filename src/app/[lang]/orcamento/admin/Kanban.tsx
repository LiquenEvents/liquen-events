"use client";

import { useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import { eventCountdown, randomId } from "./util";
import { eur0 as eur } from "@/lib/money";
import type { ActivityEntry } from "@/lib/orcamento/types";

const COLUMNS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novos", color: "#8a8a82" },
  { id: "em_revisao", label: "Em revisão", color: "#9aa36a" },
  { id: "cotado", label: "Proposta enviada", color: "#7c854b" },
  { id: "aceite", label: "Ganhos", color: "#525a2f" },
  { id: "rejeitado", label: "Perdidos", color: "#5a5a55" },
];

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
  userName?: string;
}

export default function Kanban({ quotes, onOpen, onStatusChange, userName }: Props) {
  const { toast } = useToast();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<QuoteStatus | null>(null);

  const byStatus = useMemo(() => {
    const map: Record<string, Quote[]> = {};
    for (const c of COLUMNS) map[c.id] = [];
    for (const q of quotes) (map[q.status] ??= []).push(q);
    return map;
  }, [quotes]);

  const todayKey = new Date().toISOString().slice(0, 10);

  // Shared by drag-and-drop and keyboard moves: optimistic update + PATCH,
  // reverting (and toasting) on failure.
  async function changeStatus(q: Quote, status: QuoteStatus) {
    if (q.status === status) return;
    onStatusChange(q.id, status); // optimistic
    try {
      const fromLabel = COLUMNS.find((c) => c.id === q.status)?.label ?? q.status;
      const toLabel = COLUMNS.find((c) => c.id === status)?.label ?? status;
      const entry: ActivityEntry = {
        id: randomId(),
        at: new Date().toISOString(),
        kind: "status_change",
        actor: userName,
        summary: `${fromLabel} → ${toLabel}`,
      };
      const activityLog = [...(q.activityLog ?? []), entry];
      const res = await fetch(`/api/orcamento/${q.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, activityLog }),
      });
      if (!res.ok) throw new Error();
      const updated = await res.json();
      // Propagate the updated activityLog back via onStatusChange-like mechanism.
      // We reuse onStatusChange only for status; for the full updated quote we
      // call it once and the parent syncs state (activityLog will be on next open).
      onStatusChange(q.id, updated.status ?? status);
      toast(`${q.name} → ${toLabel}`, "success");
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

  const summary = useMemo(() => {
    let proposta = 0;
    let ganho = 0;
    let active = 0;
    let accepted = 0;
    let rejected = 0;
    for (const q of quotes) {
      if (q.status === "cotado") proposta += q.quotedPrice ?? 0;
      if (q.status === "aceite") {
        ganho += q.quotedPrice ?? 0;
        accepted++;
      }
      if (q.status === "rejeitado") rejected++;
      if (q.status === "pendente" || q.status === "em_revisao" || q.status === "cotado") active++;
    }
    const decided = accepted + rejected;
    return {
      proposta,
      ganho,
      active,
      winRate: decided > 0 ? Math.round((accepted / decided) * 100) : 0,
    };
  }, [quotes]);

  return (
    <div className="flex flex-col gap-5">
      {/* Pipeline summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { v: String(summary.active), l: "Pedidos ativos" },
          { v: eur(summary.proposta), l: "Em proposta" },
          { v: eur(summary.ganho), l: "Ganho", dark: true },
          { v: `${summary.winRate}%`, l: "Taxa de conversão" },
        ].map((k) => (
          <div
            key={k.l}
            className={`rounded-xl p-4 border ${
              k.dark
                ? "bg-[#1b2119] border-[#2d3829]"
                : "bg-white border-foreground/[0.08] shadow-sm"
            }`}
          >
            <p
              className={`font-bold leading-none mb-1.5 ${k.dark ? "text-[#8aad85]" : "text-foreground/82"}`}
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2vw, 26px)" }}
            >
              {k.v}
            </p>
            <p
              className={`text-[9px] tracking-[0.22em] uppercase ${k.dark ? "text-white/30" : "text-foreground/30"}`}
            >
              {k.l}
            </p>
          </div>
        ))}
      </div>

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
                {items.map((q) => {
                  const daysSinceUpdate = Math.floor(
                    (Date.now() - new Date(q.lastUpdated ?? q.submittedAt).getTime()) / 86400000,
                  );
                  const staleProposal = q.status === "cotado" && daysSinceUpdate >= 7;
                  return (
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
                          <p className="text-foreground/78 text-sm font-semibold truncate">
                            {q.name}
                          </p>
                          <p className="text-foreground/45 text-[11px] truncate mt-0.5">
                            {eventTypeLabel(q)} · {q.guests} convidados
                          </p>
                        </div>
                        {q.followUpAt && q.followUpAt <= todayKey && (
                          <span
                            className={`shrink-0 mt-0.5 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[8px] tracking-[0.1em] uppercase font-semibold ${
                              q.followUpAt < todayKey
                                ? "bg-[#b5654a]/15 text-[#b5654a]"
                                : "bg-[#637a5f]/15 text-[#4d6350]"
                            }`}
                            title={
                              q.followUpAt < todayKey ? "Seguimento em atraso" : "Seguimento hoje"
                            }
                          >
                            <span className="w-1 h-1 rounded-full bg-current" />
                            Seguir
                          </span>
                        )}
                      </div>
                      {q.tags && q.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {q.tags.slice(0, 3).map((t) => (
                            <span
                              key={t}
                              className="px-1.5 py-0.5 rounded-full bg-[#4d6350]/10 text-[#4d6350] text-[8px] font-medium tracking-wide"
                            >
                              {t}
                            </span>
                          ))}
                        </div>
                      )}
                      {staleProposal && (
                        <div className="mt-2">
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[8px] tracking-[0.1em] uppercase font-semibold bg-amber-500/10 text-amber-600"
                            title={`Proposta enviada há ${daysSinceUpdate} dias sem resposta`}
                          >
                            <span className="w-1 h-1 rounded-full bg-current" />
                            {daysSinceUpdate}d sem resposta
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-foreground/[0.06]">
                        {q.quotedPrice ? (
                          <span className="text-[#4d6350] text-xs font-semibold">
                            {eur(q.quotedPrice)}
                          </span>
                        ) : (
                          <span className="text-foreground/20 text-[10px]">sem valor</span>
                        )}
                        <div className="flex items-center gap-2">
                          {q.date &&
                            (() => {
                              const cd = eventCountdown(q.date);
                              const soon = cd && (cd.tone === "soon" || cd.tone === "today");
                              return (
                                <span
                                  className={`text-[10px] ${soon ? "text-[#b5654a] font-medium" : "text-foreground/30"}`}
                                  title={cd ? cd.label : undefined}
                                >
                                  {new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
                                    day: "numeric",
                                    month: "short",
                                  })}
                                </span>
                              );
                            })()}
                          {/* Touch fallback for drag-and-drop: HTML5 drag events don't
                              fire on touch screens, so phones get ‹ › buttons to move
                              the card between columns. Hidden on desktop (drag + arrow
                              keys cover it there). */}
                          <div className="flex items-center gap-1 lg:hidden">
                            {COLUMNS.findIndex((c) => c.id === q.status) > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveByKeyboard(q, -1);
                                }}
                                aria-label="Mover para a coluna anterior"
                                className="w-6 h-6 rounded-md flex items-center justify-center bg-foreground/[0.05] text-foreground/40 active:bg-foreground/10"
                              >
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m15 18-6-6 6-6" />
                                </svg>
                              </button>
                            )}
                            {COLUMNS.findIndex((c) => c.id === q.status) < COLUMNS.length - 1 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  moveByKeyboard(q, 1);
                                }}
                                aria-label="Mover para a coluna seguinte"
                                className="w-6 h-6 rounded-md flex items-center justify-center bg-[#4d6350]/10 text-[#4d6350] active:bg-[#4d6350]/20"
                              >
                                <svg
                                  width="11"
                                  height="11"
                                  viewBox="0 0 24 24"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="2.2"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                >
                                  <path d="m9 18 6-6-6-6" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
    </div>
  );
}
