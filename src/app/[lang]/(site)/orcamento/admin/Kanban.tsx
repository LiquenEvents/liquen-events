"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { useToast } from "./Toast";
import { eventCountdown, randomId } from "./util";
import { eur0 as eur } from "@/lib/money";
import type { ActivityEntry } from "@/lib/orcamento/types";
import { Card } from "./ui";

const COLUMNS: { id: QuoteStatus; label: string; color: string }[] = [
  { id: "pendente", label: "Novo", color: "#8a8a82" },
  { id: "em_revisao", label: "Aguardar resposta", color: "#9aa36a" },
  { id: "cotado", label: "Proposta enviada", color: "#7c854b" },
  { id: "aceite", label: "Ganho", color: "#525a2f" },
  { id: "rejeitado", label: "Perdido", color: "#5a5a55" },
];
const LAST_COLUMN = COLUMNS.length - 1;
const COLUMN_INDEX = new Map(COLUMNS.map((c, i) => [c.id, i]));

/**
 * O rótulo do tipo de evento resolvido UMA vez por combinação.
 *
 * Era um `.find()` linear sobre o catálogo por cada cartão, por cada render —
 * e num arrasto há muitos renders. O catálogo é constante durante toda a
 * sessão, portanto a resposta também é: guarda-se num mapa.
 */
const labelCache = new Map<string, string>();
function eventTypeLabel(q: Quote): string {
  const key = `${q.category ?? ""}|${q.eventType ?? ""}`;
  const hit = labelCache.get(key);
  if (hit !== undefined) return hit;
  let label: string | undefined;
  if (q.category && q.eventType) {
    label = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType)?.label;
  }
  label ??= CATEGORIES.find((c) => c.id === q.category)?.label ?? "Evento";
  labelCache.set(key, label);
  return label;
}

interface CardProps {
  q: Quote;
  colColor: string;
  colLabel: string;
  colIndex: number;
  dragging: boolean;
  todayKey: string;
  onOpen: (q: Quote) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onMove: (q: Quote, dir: -1 | 1) => void;
}

/**
 * ── Porque é que o cartão é um componente `memo()` ────────────────────────
 *
 * Medido numa compilação de produção com 300 pedidos: arrastar um cartão pelas
 * cinco colunas (120 eventos `dragover`, ~2 s) custava 428 ms de JavaScript e
 * deixava cair 8 fotogramas em 119 (o pior de 50 ms). O arrasto "colava".
 *
 * A causa: cada `dragover` chamava `setOverCol`, e cada mudança de coluna
 * voltava a desenhar o quadro INTEIRO — os 300 cartões, com o seu `Date.now()`,
 * o seu `new Date(...)`, o seu `toLocaleDateString` e a procura linear do
 * rótulo do tipo de evento. Nada disso muda enquanto se arrasta: o que muda é
 * qual a coluna realçada, e se este cartão é o que vai a voar.
 *
 * Com o cartão isolado atrás de `memo()`, um `dragover` volta a desenhar as
 * colunas (é preciso: é o realce) e nenhum cartão. O `nowMs` também passou a
 * ser calculado uma vez por render do quadro em vez de uma vez por cartão.
 */
const KanbanCard = memo(function KanbanCard({
  q,
  colColor,
  colLabel,
  colIndex,
  dragging,
  todayKey,
  onOpen,
  onDragStart,
  onDragEnd,
  onMove,
}: CardProps) {
  // O relógio é lido AQUI, dentro do cartão, e não passado como prop: um
  // `nowMs` novo a cada render do quadro seria uma prop sempre diferente e
  // desfazia o `memo()` — o cartão só volta a desenhar-se quando alguma coisa
  // sua muda, e é então que o relógio interessa.
  const daysSinceUpdate = Math.floor(
    (Date.now() - new Date(q.lastUpdated ?? q.submittedAt).getTime()) / 86400000,
  );
  const staleProposal = q.status === "cotado" && daysSinceUpdate >= 7;
  const cd = q.date ? eventCountdown(q.date) : null;
  const soon = cd && (cd.tone === "soon" || cd.tone === "today");
  return (
    <div
      draggable
      role="button"
      tabIndex={0}
      aria-label={`${q.name}, ${eventTypeLabel(q)}, ${q.guests} pessoas. Coluna ${colLabel}. Enter para abrir; setas esquerda/direita para mover de coluna.`}
      onDragStart={() => onDragStart(q.id)}
      onDragEnd={onDragEnd}
      onClick={() => onOpen(q)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen(q);
        } else if (e.key === "ArrowLeft") {
          e.preventDefault();
          onMove(q, -1);
        } else if (e.key === "ArrowRight") {
          e.preventDefault();
          onMove(q, 1);
        }
      }}
      /* `transition-all` obrigava o browser a considerar TODAS as propriedades
         animáveis do cartão a cada realce; só a sombra e a moldura mudam. */
      className={`group cursor-grab active:cursor-grabbing rounded-2xl border border-foreground/[0.07] bg-white p-3.5 shadow-[0_1px_2px_rgba(42,38,32,0.04)] motion-safe:transition-[box-shadow,border-color,opacity,transform] hover:shadow-md hover:border-foreground/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#637a5f]/60 ${
        dragging ? "opacity-40 motion-safe:rotate-1" : ""
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="mt-1 w-1 h-8 rounded-full shrink-0" style={{ background: colColor }} />
        <div className="min-w-0 flex-1">
          <p className="text-foreground/78 text-sm font-semibold truncate">{q.name}</p>
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
            title={q.followUpAt < todayKey ? "Seguimento em atraso" : "Seguimento hoje"}
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
          <span className="text-[#4d6350] text-xs font-semibold">{eur(q.quotedPrice)}</span>
        ) : (
          <span className="text-foreground/40 text-[10px]">Sem valor</span>
        )}
        <div className="flex items-center gap-2">
          {q.date && (
            <span
              className={`text-[10px] ${soon ? "text-[#b5654a] font-medium" : "text-foreground/30"}`}
              title={cd ? cd.label : undefined}
            >
              {new Date(q.date + "T12:00:00").toLocaleDateString("pt-PT", {
                day: "numeric",
                month: "short",
              })}
            </span>
          )}
          {/* Touch fallback for drag-and-drop: HTML5 drag events don't
              fire on touch screens, so phones get ‹ › buttons to move
              the card between columns. Hidden on desktop (drag + arrow
              keys cover it there). */}
          <div className="flex items-center gap-1 lg:hidden">
            {colIndex > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(q, -1);
                }}
                aria-label="Mover para a coluna anterior"
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-foreground/[0.05] text-foreground/40 active:bg-foreground/10"
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
            {colIndex < LAST_COLUMN && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onMove(q, 1);
                }}
                aria-label="Mover para a coluna seguinte"
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-[#4d6350]/10 text-[#4d6350] active:bg-[#4d6350]/20"
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
});

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

  // O `AdminClient` passa `onOpen`/`onStatusChange` recriados a cada render
  // dele. Guardá-los numa ref e expor callbacks estáveis é o que permite ao
  // `memo()` dos cartões acertar — sem isso, cada render do pai desfazia-o.
  const latest = useRef({ onOpen, onStatusChange, userName, quotes });
  useEffect(() => {
    latest.current = { onOpen, onStatusChange, userName, quotes };
  });

  const byStatus = useMemo(() => {
    const map: Record<string, Quote[]> = {};
    for (const c of COLUMNS) map[c.id] = [];
    for (const q of quotes) (map[q.status] ??= []).push(q);
    return map;
  }, [quotes]);

  const todayKey = new Date().toISOString().slice(0, 10);

  // Shared by drag-and-drop and keyboard moves: optimistic update + PATCH,
  // reverting (and toasting) on failure.
  const changeStatus = useCallback(
    async function changeStatus(q: Quote, status: QuoteStatus) {
      const { onStatusChange, userName } = latest.current;
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
        /**
         * ACRESCENTAR, e não reescrever o registo inteiro.
         *
         * Gravar `activityLog` completo escreve o retrato que ESTE ecrã tem
         * mais a linha nova — e apaga tudo o que outra ferramenta escreveu
         * entretanto. Num quadro que fica aberto o dia todo, isso é o normal e
         * não o excepcional. O servidor já tinha o caminho seguro, que junta ao
         * registo fresco; a gaveta do back office já o usava, este ecrã não.
         */
        const res = await fetch(`/api/orcamento/${q.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status, activityLogAppend: [entry] }),
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
    },
    [toast],
  );

  // O id arrastado vive também numa ref: `drop` é chamado a partir da coluna e
  // precisa do valor actual sem voltar a criar o callback a cada arrasto.
  const dragIdRef = useRef<string | null>(null);

  const drop = useCallback(
    async (status: QuoteStatus) => {
      setOverCol(null);
      const id = dragIdRef.current;
      dragIdRef.current = null;
      setDragId(null);
      if (!id) return;
      const q = latest.current.quotes.find((x) => x.id === id);
      if (q) changeStatus(q, status);
    },
    [changeStatus],
  );

  // Keyboard equivalent of dragging: move a focused card to the adjacent column.
  const moveByKeyboard = useCallback(
    (q: Quote, dir: -1 | 1) => {
      const idx = COLUMN_INDEX.get(q.status);
      const next = idx === undefined ? undefined : COLUMNS[idx + dir];
      if (next) changeStatus(q, next.id);
    },
    [changeStatus],
  );

  const handleOpen = useCallback((q: Quote) => latest.current.onOpen(q), []);
  const handleDragStart = useCallback((id: string) => {
    dragIdRef.current = id;
    setDragId(id);
  }, []);
  const handleDragEnd = useCallback(() => {
    dragIdRef.current = null;
    setDragId(null);
    setOverCol(null);
  }, []);

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
    <div className="flex flex-col gap-6">
      {/* Pipeline summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { v: String(summary.active), l: "Pedidos ativos" },
          { v: eur(summary.proposta), l: "Em proposta" },
          { v: eur(summary.ganho), l: "Ganho" },
          { v: `${summary.winRate}%`, l: "Taxa de conversão" },
        ].map((k) => (
          <Card key={k.l} padding="sm" className="p-4 sm:p-5">
            <p
              className="font-display font-semibold leading-none mb-2 text-foreground/85 tabular-nums"
              style={{ fontSize: "clamp(20px, 2vw, 28px)" }}
            >
              {k.v}
            </p>
            <p className="text-[10px] tracking-[0.18em] uppercase text-foreground/40">{k.l}</p>
          </Card>
        ))}
      </div>

      <div className="flex gap-3.5 overflow-x-auto pb-4 scroll-hide">
        {COLUMNS.map((col, colIndex) => {
          const items = byStatus[col.id] ?? [];
          const value = items.reduce((s, q) => s + (q.quotedPrice ?? 0), 0);
          return (
            <div
              key={col.id}
              onDragOver={(e) => {
                e.preventDefault();
                // `dragover` dispara ~60×/s POR COLUNA. Só actualizamos o
                // estado quando a coluna realçada muda mesmo — caso contrário
                // era uma actualização por evento, só para chegar ao mesmo
                // valor.
                setOverCol((c) => (c === col.id ? c : col.id));
              }}
              onDragLeave={() => setOverCol((c) => (c === col.id ? null : c))}
              onDrop={() => drop(col.id)}
              /* Só mudam a cor de fundo, a cor da moldura e o anel (uma sombra):
                 `transition-all` punha o browser a vigiar tudo o resto. */
              className={`flex-shrink-0 w-[276px] rounded-2xl border motion-safe:transition-[background-color,border-color,box-shadow] motion-safe:duration-200 ${
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

              <div className="px-2 pb-2 flex flex-col gap-2 min-h-[120px] max-h-[calc(100dvh-18rem)] overflow-y-auto overscroll-contain">
                {items.map((q) => (
                  <KanbanCard
                    key={q.id}
                    q={q}
                    colColor={col.color}
                    colLabel={col.label}
                    colIndex={colIndex}
                    dragging={dragId === q.id}
                    todayKey={todayKey}
                    onOpen={handleOpen}
                    onDragStart={handleDragStart}
                    onDragEnd={handleDragEnd}
                    onMove={moveByKeyboard}
                  />
                ))}
                {items.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-8 text-foreground/30">
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
                    <p className="text-[10px] text-center px-2">Arrasta para aqui</p>
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
