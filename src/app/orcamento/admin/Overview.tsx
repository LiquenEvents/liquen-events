"use client";

import { useMemo } from "react";
import type { Quote, QuoteStatus } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import Reminders from "./Reminders";
import Agenda from "./Agenda";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);

const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Pendente", color: "#8a8a82" },
  em_revisao: { label: "Em Revisão", color: "#9aa36a" },
  cotado: { label: "Cotado", color: "#7c854b" },
  aceite: { label: "Aceite", color: "#525a2f" },
  rejeitado: { label: "Rejeitado", color: "#5a5a55" },
};

// Order the pipeline reads as a funnel: new leads → qualified → quoted → won.
const FUNNEL: { id: QuoteStatus; label: string }[] = [
  { id: "pendente", label: "Novos" },
  { id: "em_revisao", label: "Em revisão" },
  { id: "cotado", label: "Proposta enviada" },
  { id: "aceite", label: "Ganhos" },
];

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const h = diff / 36e5;
  if (h < 1) return `há ${Math.max(1, Math.round(diff / 6e4))}min`;
  if (h < 24) return `há ${Math.round(h)}h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ontem" : `há ${d}d`;
}

/** A small ▲/▼ delta pill comparing this month to last. */
function Delta({ now, prev }: { now: number; prev: number }) {
  if (prev === 0 && now === 0) return null;
  const up = now >= prev;
  const pct = prev === 0 ? 100 : Math.round(((now - prev) / prev) * 100);
  if (pct === 0) return null;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-semibold tabular-nums ${
        up ? "text-[#8aad85]" : "text-[#c08457]"
      }`}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 12 12"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        {up ? (
          <path
            d="M6 9.5V2.5M6 2.5L2.5 6M6 2.5L9.5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <path
            d="M6 2.5V9.5M6 9.5L2.5 6M6 9.5L9.5 6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>
      {Math.abs(pct)}%
    </span>
  );
}

interface Props {
  quotes: Quote[];
  userName: string;
  onOpen: (q: Quote) => void;
  onGoStats: () => void;
  onGo: (view: "pedidos" | "kanban" | "calendario" | "tarefas" | "propostas" | "clientes") => void;
  onNew: () => void;
}

export default function Overview({ quotes, userName, onOpen, onGoStats, onGo, onNew }: Props) {
  const data = useMemo(() => {
    const now = new Date();
    const todayKey = now.toISOString().slice(0, 10);
    const weekEnd = new Date(now);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const weekEndKey = weekEnd.toISOString().slice(0, 10);
    const thisMonthKey = `${now.getFullYear()}-${now.getMonth()}`;
    const lastMonthD = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthKey = `${lastMonthD.getFullYear()}-${lastMonthD.getMonth()}`;

    let thisMonth = 0,
      lastMonth = 0,
      pipeline = 0,
      won = 0,
      wonThisMonth = 0,
      wonLastMonth = 0,
      received = 0,
      outstanding = 0;
    let eventsToday = 0,
      eventsThisWeek = 0;
    const byStatus: Record<string, number> = {};
    const months = Array.from({ length: 6 }, () => 0);

    for (const q of quotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      if (q.status === "cotado" && q.quotedPrice) pipeline += q.quotedPrice;
      if (q.status === "aceite" && q.quotedPrice) won += q.quotedPrice;
      for (const p of q.payments ?? []) {
        if (p.paid) received += p.amount;
        else outstanding += p.amount;
      }
      if (q.date === todayKey) eventsToday++;
      if (q.date && q.date >= todayKey && q.date <= weekEndKey) eventsThisWeek++;

      const sd = new Date(q.submittedAt);
      const sKey = `${sd.getFullYear()}-${sd.getMonth()}`;
      if (sKey === thisMonthKey) thisMonth++;
      if (sKey === lastMonthKey) lastMonth++;
      const monthsBack =
        (now.getFullYear() - sd.getFullYear()) * 12 + now.getMonth() - sd.getMonth();
      if (monthsBack >= 0 && monthsBack < 6) months[5 - monthsBack]++;

      // Won revenue attributed to the month the deal was last touched (accepted).
      if (q.status === "aceite" && q.quotedPrice) {
        const wd = new Date(q.lastUpdated ?? q.submittedAt);
        const wKey = `${wd.getFullYear()}-${wd.getMonth()}`;
        if (wKey === thisMonthKey) wonThisMonth += q.quotedPrice;
        if (wKey === lastMonthKey) wonLastMonth += q.quotedPrice;
      }
    }

    const needAction = quotes
      .filter((q) => q.status === "pendente" || q.status === "em_revisao")
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt));

    const recent = [...quotes]
      .sort((a, b) => +new Date(b.submittedAt) - +new Date(a.submittedAt))
      .slice(0, 6);

    const accepted = byStatus["aceite"] ?? 0;
    const decided = accepted + (byStatus["rejeitado"] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
    const avgTicket = accepted > 0 ? won / accepted : 0;
    const billed = received + outstanding;

    return {
      thisMonth,
      lastMonth,
      pipeline,
      won,
      wonThisMonth,
      wonLastMonth,
      received,
      outstanding,
      billed,
      eventsToday,
      eventsThisWeek,
      months,
      needAction,
      recent,
      conversion,
      avgTicket,
      total: quotes.length,
      byStatus,
      funnelMax: Math.max(1, ...FUNNEL.map((f) => byStatus[f.id] ?? 0)),
    };
  }, [quotes]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Bom dia" : hour < 20 ? "Boa tarde" : "Boa noite";

  // Smart headline: surface the most pressing things for today.
  const headline = (() => {
    const bits: string[] = [];
    if (data.eventsToday > 0)
      bits.push(`${data.eventsToday} evento${data.eventsToday !== 1 ? "s" : ""} hoje`);
    else if (data.eventsThisWeek > 0)
      bits.push(`${data.eventsThisWeek} evento${data.eventsThisWeek !== 1 ? "s" : ""} esta semana`);
    if (data.needAction.length > 0)
      bits.push(
        `${data.needAction.length} pedido${data.needAction.length !== 1 ? "s" : ""} a precisar de atenção`,
      );
    if (bits.length === 0) return "Tudo em dia. Nada urgente por agora.";
    return `Tem ${bits.join(" e ")}.`;
  })();

  const quickActions: { label: string; onClick: () => void; icon: React.ReactNode }[] = [
    {
      label: "Novo pedido",
      onClick: onNew,
      icon: <path d="M12 5v14M5 12h14" strokeLinecap="round" />,
    },
    {
      label: "Pipeline",
      onClick: () => onGo("kanban"),
      icon: (
        <>
          <rect x="3" y="4" width="4" height="16" rx="1" />
          <rect x="10" y="4" width="4" height="11" rx="1" />
          <rect x="17" y="4" width="4" height="7" rx="1" />
        </>
      ),
    },
    {
      label: "Calendário",
      onClick: () => onGo("calendario"),
      icon: (
        <>
          <rect x="3" y="4" width="18" height="17" rx="2" />
          <path d="M3 9h18M8 2v4M16 2v4" strokeLinecap="round" />
        </>
      ),
    },
    {
      label: "Tarefas",
      onClick: () => onGo("tarefas"),
      icon: (
        <>
          <path d="M9 11l3 3 8-8" strokeLinecap="round" strokeLinejoin="round" />
          <path
            d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"
            strokeLinecap="round"
          />
        </>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-7">
      {/* Greeting + quick actions */}
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
        <div>
          <p className="text-foreground/30 text-[10px] tracking-[0.4em] uppercase mb-2">
            {new Date().toLocaleDateString("pt-PT", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h2
            className="text-foreground font-bold"
            style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(26px, 3.5vw, 40px)" }}
          >
            {greeting}, {userName}.
          </h2>
          <p className="text-foreground/40 text-sm mt-2">{headline}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a, i) => (
            <button
              key={a.label}
              onClick={a.onClick}
              className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[10px] tracking-[0.12em] uppercase font-medium transition-colors ${
                i === 0
                  ? "bg-[#1b2119] text-white/90 hover:bg-[#2a3227] shadow-sm"
                  : "bg-white border border-foreground/[0.08] text-foreground/55 hover:text-foreground/80 hover:border-foreground/15 shadow-sm"
              }`}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
              >
                {a.icon}
              </svg>
              {a.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        {[
          { v: String(data.total), l: "Pedidos totais", dark: true },
          {
            v: String(data.thisMonth),
            l: "Este mês",
            delta: { now: data.thisMonth, prev: data.lastMonth },
          },
          { v: eur(data.pipeline), l: "Em proposta" },
          { v: eur(data.outstanding), l: "A receber" },
          {
            v: eur(data.won),
            l: "Ganho",
            dark: true,
            delta: { now: data.wonThisMonth, prev: data.wonLastMonth },
          },
        ].map((k) => (
          <div
            key={k.l}
            className={`relative overflow-hidden rounded-xl p-5 border ${
              k.dark
                ? "bg-[#1b2119] border-[#2d3829]"
                : "bg-white border-foreground/[0.08] shadow-sm"
            }`}
          >
            {k.dark && (
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  backgroundImage:
                    "radial-gradient(circle at 85% 15%, rgba(99,122,95,0.25) 0%, transparent 60%)",
                }}
              />
            )}
            <div className="flex items-start justify-between gap-2 relative">
              <p
                className={`font-bold leading-none mb-2 ${k.dark ? "text-[#8aad85]" : "text-foreground/82"}`}
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.4vw, 30px)" }}
              >
                {k.v}
              </p>
              {k.delta && <Delta now={k.delta.now} prev={k.delta.prev} />}
            </div>
            <p
              className={`text-[9px] tracking-[0.25em] uppercase relative ${k.dark ? "text-white/30" : "text-foreground/30"}`}
            >
              {k.l}
            </p>
          </div>
        ))}
      </div>

      {/* Reminders — derived urgent items */}
      <Reminders quotes={quotes} onOpen={onOpen} />

      {/* Agenda — events, calendar entries, tasks & payments due */}
      <Agenda quotes={quotes} onOpen={onOpen} />

      {/* Pipeline funnel + financial pulse */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Funnel */}
        <div className="bo-card p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="bo-eyebrow">Pipeline comercial</p>
            <button
              onClick={() => onGo("kanban")}
              className="text-[#637a5f]/70 hover:text-[#637a5f] text-[10px] tracking-[0.15em] uppercase transition-colors"
            >
              Abrir →
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {FUNNEL.map((f) => {
              const count = data.byStatus[f.id] ?? 0;
              return (
                <div key={f.id}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="flex items-center gap-2 text-foreground/55 text-xs">
                      <span
                        className="w-2 h-2 rounded-full"
                        style={{ background: STATUS_META[f.id].color }}
                      />
                      {f.label}
                    </span>
                    <span className="text-foreground/40 text-[11px] tabular-nums">{count}</span>
                  </div>
                  <div className="h-1.5 bg-foreground/[0.06] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${(count / data.funnelMax) * 100}%`,
                        background: STATUS_META[f.id].color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-foreground/[0.07]">
            <span className="text-foreground/35 text-xs">Taxa de conversão</span>
            <span className="text-foreground/75 text-sm font-semibold tabular-nums">
              {data.conversion}%
            </span>
          </div>
        </div>

        {/* Financial pulse */}
        <div className="bo-card p-5">
          <div className="flex items-center justify-between mb-5">
            <p className="bo-eyebrow">Pulso financeiro</p>
            <button
              onClick={onGoStats}
              className="text-[#637a5f]/70 hover:text-[#637a5f] text-[10px] tracking-[0.15em] uppercase transition-colors"
            >
              Ver tudo →
            </button>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-5">
            <div>
              <p
                className="text-[#4d6350] font-bold leading-none mb-1"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2vw, 24px)" }}
              >
                {eur(data.received)}
              </p>
              <p className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase">Recebido</p>
            </div>
            <div>
              <p
                className="text-foreground/70 font-bold leading-none mb-1"
                style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(18px, 2vw, 24px)" }}
              >
                {eur(data.outstanding)}
              </p>
              <p className="text-foreground/30 text-[9px] tracking-[0.2em] uppercase">A receber</p>
            </div>
          </div>
          {data.billed > 0 ? (
            <>
              <div className="h-2 rounded-full overflow-hidden flex bg-foreground/[0.06]">
                <div
                  className="h-full bg-[#4d6350] transition-all duration-700"
                  style={{ width: `${(data.received / data.billed) * 100}%` }}
                />
                <div
                  className="h-full bg-[#c0a060]/70 transition-all duration-700"
                  style={{ width: `${(data.outstanding / data.billed) * 100}%` }}
                />
              </div>
              <div className="flex items-center gap-4 mt-2.5 text-[10px] text-foreground/40">
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#4d6350]" /> Recebido
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#c0a060]/70" /> Por receber
                </span>
              </div>
            </>
          ) : (
            <p className="text-foreground/25 text-xs">Ainda sem pagamentos registados.</p>
          )}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-foreground/[0.07]">
            <span className="text-foreground/35 text-xs">Ticket médio (ganho)</span>
            <span className="text-foreground/75 text-sm font-semibold tabular-nums">
              {eur(data.avgTicket)}
            </span>
          </div>
        </div>
      </div>

      {/* Needs attention + recent activity */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <div className="bo-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-foreground/[0.07]">
            <p className="bo-eyebrow">Precisam de atenção</p>
            {data.needAction.length > 0 && (
              <span className="text-[10px] tabular-nums bg-[#1b2119] text-white/80 rounded-full px-2 py-0.5">
                {data.needAction.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-foreground/[0.06] max-h-[360px] overflow-y-auto">
            {data.needAction.length === 0 && (
              <p className="text-foreground/25 text-sm text-center py-12">
                Sem pedidos pendentes. ✓
              </p>
            )}
            {data.needAction.slice(0, 8).map((q) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className="w-full text-left px-5 py-3.5 hover:bg-foreground/[0.025] transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-foreground/72 text-sm truncate font-medium">{q.name}</p>
                  <p className="text-foreground/30 text-xs truncate mt-0.5">
                    {eventTypeLabel(q)} · {q.guests} pax
                  </p>
                </div>
                <div className="text-right shrink-0">
                  <span
                    className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md"
                    style={{
                      background: `${STATUS_META[q.status].color}18`,
                      color: STATUS_META[q.status].color,
                    }}
                  >
                    {STATUS_META[q.status].label}
                  </span>
                  <p className="text-foreground/22 text-[10px] mt-1">{timeAgo(q.submittedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="bo-card overflow-hidden">
          <p className="bo-eyebrow px-5 py-4 border-b border-foreground/[0.07]">
            Atividade recente
          </p>
          <div className="divide-y divide-foreground/[0.06]">
            {data.recent.map((q) => (
              <button
                key={q.id}
                onClick={() => onOpen(q)}
                className="w-full text-left px-5 py-3 hover:bg-foreground/[0.025] transition-colors flex items-center justify-between gap-3"
              >
                <span className="text-foreground/58 text-xs truncate font-medium">{q.name}</span>
                <span className="text-foreground/22 text-[10px] shrink-0">
                  {timeAgo(q.submittedAt)}
                </span>
              </button>
            ))}
            {data.recent.length === 0 && (
              <p className="text-foreground/25 text-sm text-center py-10">Sem atividade.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
