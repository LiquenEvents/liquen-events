"use client";

import { useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "../types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "../data";
import { downloadCsv, quotesToCsvRows, paymentsToCsvRows, dateStamp } from "./export";

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

const MONTHS_PT = [
  "Jan",
  "Fev",
  "Mar",
  "Abr",
  "Mai",
  "Jun",
  "Jul",
  "Ago",
  "Set",
  "Out",
  "Nov",
  "Dez",
];

function eventTypeLabel(q: Quote): string {
  if (q.category && q.eventType) {
    const et = EVENT_TYPES_BY_CATEGORY[q.category]?.find((e) => e.id === q.eventType);
    if (et) return et.label;
  }
  return CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro";
}

function Kpi({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div
      className={`relative overflow-hidden rounded-xl p-5 border ${
        accent ? "bg-[#1b2119] border-[#2d3829]" : "bg-white border-foreground/[0.08] shadow-sm"
      }`}
    >
      {accent && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              "radial-gradient(circle at 85% 15%, rgba(99,122,95,0.25) 0%, transparent 60%)",
          }}
        />
      )}
      <p
        className={`font-bold leading-none mb-2 relative ${accent ? "text-[#8aad85]" : "text-foreground/82"}`}
        style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(22px, 2.6vw, 34px)" }}
      >
        {value}
      </p>
      <p
        className={`text-[9px] tracking-[0.25em] uppercase relative ${accent ? "text-white/30" : "text-foreground/30"}`}
      >
        {label}
      </p>
    </div>
  );
}

function VBars({
  data,
  format,
}: {
  data: { label: string; value: number }[];
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-2 group">
          <span className="text-foreground/40 text-[10px] tabular-nums opacity-0 group-hover:opacity-100 transition-opacity">
            {format ? format(d.value) : d.value}
          </span>
          <div className="w-full bg-foreground/5 rounded-sm relative" style={{ height: "100%" }}>
            <div
              className="absolute bottom-0 left-0 right-0 bg-moss/70 group-hover:bg-moss rounded-sm transition-all duration-500"
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-foreground/25 text-[9px] tracking-wide">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

function HBars({ data }: { data: { label: string; value: number; color?: string }[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="flex flex-col gap-3">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-foreground/55 text-xs">{d.label}</span>
            <span className="text-foreground/35 text-[10px] tabular-nums">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-foreground/6 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${(d.value / max) * 100}%`, background: d.color ?? "#7c854b" }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-foreground/25 text-xs">Sem dados.</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-foreground/[0.08] rounded-xl p-6 bg-white shadow-sm">
      <p className="text-foreground/35 text-[10px] tracking-[0.3em] uppercase mb-6 font-medium">
        {title}
      </p>
      {children}
    </div>
  );
}

type Period = "all" | "6m" | "3m" | "1y";

const PERIOD_LABELS: Record<Period, string> = {
  all: "Todo o período",
  "1y": "Último ano",
  "6m": "Últimos 6 meses",
  "3m": "Últimos 3 meses",
};

export default function StatsDashboard({ quotes }: { quotes: Quote[] }) {
  const [period, setPeriod] = useState<Period>("all");

  const filteredQuotes = useMemo(() => {
    if (period === "all") return quotes;
    const now = new Date();
    const months = period === "3m" ? 3 : period === "6m" ? 6 : 12;
    const cutoff = new Date(
      now.getFullYear(),
      now.getMonth() - months,
      now.getDate(),
    ).toISOString();
    return quotes.filter((q) => q.submittedAt >= cutoff);
  }, [quotes, period]);

  const stats = useMemo(() => {
    const now = new Date();
    const total = filteredQuotes.length;

    const byStatus: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    const byEventType: Record<string, number> = {};
    const byReferral: Record<string, number> = {};
    let guestsSum = 0,
      guestsCount = 0;
    let pipelineSum = 0,
      wonSum = 0,
      thisMonth = 0;
    let respHoursSum = 0,
      respCount = 0;

    const months: { key: string; label: string; value: number; revenue: number }[] = [];
    for (let i = 7; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        key: `${d.getFullYear()}-${d.getMonth()}`,
        label: MONTHS_PT[d.getMonth()],
        value: 0,
        revenue: 0,
      });
    }
    const monthIndex = new Map(months.map((m, i) => [m.key, i]));

    // Days-to-close tracking (submittedAt → lastUpdated for accepted quotes)
    let closeSum = 0,
      closeCount = 0;
    // Referral source conversion
    const byReferralConv: Record<string, { total: number; accepted: number }> = {};

    for (const q of filteredQuotes) {
      byStatus[q.status] = (byStatus[q.status] ?? 0) + 1;
      byCategory[CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro"] =
        (byCategory[CATEGORIES.find((c) => c.id === q.category)?.label ?? "Outro"] ?? 0) + 1;
      const et = eventTypeLabel(q);
      byEventType[et] = (byEventType[et] ?? 0) + 1;
      const ref = q.referralSource?.trim() || "Não indicado";
      byReferral[ref] = (byReferral[ref] ?? 0) + 1;

      // Referral conversion tracking
      if (!byReferralConv[ref]) byReferralConv[ref] = { total: 0, accepted: 0 };
      byReferralConv[ref].total++;
      if (q.status === "aceite") byReferralConv[ref].accepted++;

      if (q.guests > 0) {
        guestsSum += q.guests;
        guestsCount++;
      }
      if (q.quotedPrice) {
        if (q.status === "cotado") pipelineSum += q.quotedPrice;
        if (q.status === "aceite") wonSum += q.quotedPrice;
      }

      const sd = new Date(q.submittedAt);
      if (sd.getFullYear() === now.getFullYear() && sd.getMonth() === now.getMonth()) thisMonth++;
      const idx = monthIndex.get(`${sd.getFullYear()}-${sd.getMonth()}`);
      if (idx !== undefined) {
        months[idx].value++;
        if (q.status === "aceite" && q.quotedPrice) months[idx].revenue += q.quotedPrice;
      }

      // Response time: submitted → first reply (or last update)
      const respAt = q.messages?.[0]?.at ?? q.lastUpdated;
      if (respAt) {
        const h = (new Date(respAt).getTime() - sd.getTime()) / 36e5;
        if (h >= 0 && h < 24 * 60) {
          respHoursSum += h;
          respCount++;
        }
      }

      // Days to close: submitted → last updated (only for accepted, < 2 years)
      if (q.status === "aceite" && q.lastUpdated) {
        const days = (new Date(q.lastUpdated).getTime() - sd.getTime()) / 86400000;
        if (days >= 0 && days < 730) {
          closeSum += days;
          closeCount++;
        }
      }
    }

    // ── Finanças reais (a partir dos pagamentos registados) ──
    const todayKey = now.toISOString().slice(0, 10);
    const horizon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60)
      .toISOString()
      .slice(0, 10);
    let received = 0,
      outstanding = 0;
    const upcoming: { id: string; name: string; amount: number; date: string; kind: string }[] = [];
    for (const q of filteredQuotes) {
      for (const p of q.payments ?? []) {
        if (p.paid) received += p.amount;
        else {
          outstanding += p.amount;
          if (p.date && p.date >= todayKey && p.date <= horizon) {
            upcoming.push({
              id: `${q.id}-${p.id}`,
              name: q.name,
              amount: p.amount,
              date: p.date,
              kind: p.kind,
            });
          }
        }
      }
    }
    upcoming.sort((a, b) => a.date.localeCompare(b.date));

    const accepted = byStatus["aceite"] ?? 0;
    const decided = accepted + (byStatus["rejeitado"] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
    const avgTicket = accepted > 0 ? wonSum / accepted : 0;
    const avgResp = respCount ? respHoursSum / respCount : 0;
    const avgRespLabel =
      respCount === 0
        ? "—"
        : avgResp < 1
          ? `${Math.round(avgResp * 60)}min`
          : avgResp < 48
            ? `${avgResp.toFixed(1)}h`
            : `${Math.round(avgResp / 24)}d`;

    const toSorted = (rec: Record<string, number>) =>
      Object.entries(rec)
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value);

    const avgDaysClose = closeCount > 0 ? Math.round(closeSum / closeCount) : 0;
    const forecastRevenue = conversion > 0 ? Math.round(pipelineSum * (conversion / 100)) : 0;

    const referralConvRows = Object.entries(byReferralConv)
      .map(([label, { total, accepted }]) => ({
        label,
        total,
        accepted,
        rate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 8);

    return {
      total,
      thisMonth,
      conversion,
      avgDaysClose,
      forecastRevenue,
      avgRespLabel,
      avgGuests: guestsCount ? Math.round(guestsSum / guestsCount) : 0,
      pipelineSum,
      wonSum,
      received,
      outstanding,
      avgTicket,
      upcoming: upcoming.slice(0, 8),
      hasPayments: received > 0 || outstanding > 0,
      months,
      hasRevenue: months.some((m) => m.revenue > 0),
      statusBars: (Object.keys(STATUS_META) as QuoteStatus[])
        .map((s) => ({
          label: STATUS_META[s].label,
          value: byStatus[s] ?? 0,
          color: STATUS_META[s].color,
        }))
        .filter((d) => d.value > 0),
      categoryBars: toSorted(byCategory),
      eventTypeBars: toSorted(byEventType).slice(0, 6),
      referralBars: toSorted(byReferral).slice(0, 6),
      referralConvRows,
      lostReasonRows: Object.entries(
        filteredQuotes.reduce<Record<string, number>>((acc, q) => {
          if (q.status === "rejeitado" && q.lostReason?.trim()) {
            const key = q.lostReason.trim();
            acc[key] = (acc[key] ?? 0) + 1;
          }
          return acc;
        }, {}),
      )
        .map(([label, value]) => ({ label, value }))
        .sort((a, b) => b.value - a.value)
        .slice(0, 8),
    };
  }, [filteredQuotes]);

  if (quotes.length === 0) {
    return (
      <div className="text-center py-24 text-foreground/25">
        <p className="text-sm">Ainda não há dados para mostrar.</p>
        <p className="text-xs mt-2">As estatísticas aparecem assim que chegarem pedidos.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar: period filter + export */}
      <div className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-1.5">
          {(["all", "1y", "6m", "3m"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all duration-150 ${
                period === p
                  ? "bg-[#1b2119] text-white shadow-sm"
                  : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07] hover:text-foreground/65"
              }`}
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {stats.hasPayments && (
            <button
              onClick={() =>
                downloadCsv(`liquen-pagamentos-${dateStamp()}`, paymentsToCsvRows(filteredQuotes))
              }
              className="px-4 py-2 bg-white border border-foreground/[0.09] text-foreground/45 text-[10px] tracking-[0.15em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm"
              title="Exportar todos os pagamentos (tesouraria) para CSV"
            >
              Pagamentos ↓
            </button>
          )}
          <button
            onClick={() =>
              downloadCsv(`liquen-pedidos-${dateStamp()}`, quotesToCsvRows(filteredQuotes))
            }
            className="px-4 py-2 bg-white border border-foreground/[0.09] text-foreground/45 text-[10px] tracking-[0.15em] uppercase rounded-xl hover:text-foreground/65 transition-colors shadow-sm"
          >
            Exportar CSV ↓
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Kpi value={String(stats.total)} label="Pedidos totais" accent />
        <Kpi value={String(stats.thisMonth)} label="Este mês" />
        <Kpi value={`${stats.conversion}%`} label="Conversão" />
        <Kpi value={stats.avgRespLabel} label="Resposta média" />
        <Kpi
          value={stats.avgDaysClose > 0 ? `${stats.avgDaysClose}d` : "—"}
          label="Tempo de fecho"
        />
        <Kpi value={eur(stats.pipelineSum)} label="Em proposta" />
        <Kpi
          value={stats.forecastRevenue > 0 ? eur(stats.forecastRevenue) : "—"}
          label="Previsão pipeline"
        />
        <Kpi value={eur(stats.wonSum)} label="Ganho (aceite)" accent />
      </div>

      {/* Financeiro */}
      {stats.hasPayments && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-6">
          <Panel title="Finanças (pagamentos registados)">
            <div className="grid grid-cols-2 gap-3 mb-5">
              <Kpi value={eur(stats.received)} label="Recebido" accent />
              <Kpi value={eur(stats.outstanding)} label="A receber" />
              <Kpi value={eur(stats.avgTicket)} label="Ticket médio" />
              <Kpi value={eur(stats.received + stats.outstanding)} label="Faturado total" />
            </div>
            {/* received vs outstanding bar */}
            {stats.received + stats.outstanding > 0 && (
              <div>
                <div className="h-2 rounded-full overflow-hidden flex bg-foreground/6">
                  <div
                    className="h-full bg-moss transition-all duration-700"
                    style={{
                      width: `${(stats.received / (stats.received + stats.outstanding)) * 100}%`,
                    }}
                  />
                  <div
                    className="h-full bg-[#b5894a]/70 transition-all duration-700"
                    style={{
                      width: `${(stats.outstanding / (stats.received + stats.outstanding)) * 100}%`,
                    }}
                  />
                </div>
                <div className="flex items-center gap-4 mt-2.5 text-[10px] text-foreground/40">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-moss" /> Recebido
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-[#b5894a]/70" /> A receber
                  </span>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Próximos pagamentos (60 dias)">
            {stats.upcoming.length === 0 ? (
              <p className="text-foreground/25 text-xs">
                Sem pagamentos previstos para os próximos 60 dias.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-foreground/6">
                {stats.upcoming.map((p) => (
                  <div key={p.id} className="flex items-center justify-between py-2.5">
                    <div className="min-w-0">
                      <p className="text-foreground/65 text-sm truncate">{p.name}</p>
                      <p className="text-foreground/30 text-[10px] capitalize">{p.kind}</p>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <p className="text-moss text-sm font-medium tabular-nums">{eur(p.amount)}</p>
                      <p className="text-foreground/30 text-[10px]">
                        {new Date(p.date + "T12:00:00").toLocaleDateString("pt-PT", {
                          day: "numeric",
                          month: "short",
                        })}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      )}

      {/* Trends */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Pedidos por mês (últimos 8)">
          <VBars data={stats.months.map((m) => ({ label: m.label, value: m.value }))} />
        </Panel>
        <Panel title="Receita ganha por mês (€)">
          {stats.hasRevenue ? (
            <VBars
              data={stats.months.map((m) => ({ label: m.label, value: Math.round(m.revenue) }))}
              format={(n) => eur(n)}
            />
          ) : (
            <p className="text-foreground/25 text-xs">Sem propostas aceites ainda.</p>
          )}
        </Panel>
      </div>

      {/* Breakdowns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="Por estado">
          <HBars data={stats.statusBars} />
        </Panel>
        <Panel title="Por categoria">
          <HBars data={stats.categoryBars} />
        </Panel>
        <Panel title="Tipos de evento mais pedidos">
          <HBars data={stats.eventTypeBars} />
        </Panel>
        <Panel title="Como nos conheceram">
          <HBars data={stats.referralBars} />
        </Panel>
      </div>

      {/* Lost reasons */}
      {stats.lostReasonRows.length > 0 && (
        <Panel title="Motivos de perda">
          <div className="flex flex-col gap-3">
            {stats.lostReasonRows.map((row) => {
              const total = stats.lostReasonRows.reduce((s, r) => s + r.value, 0);
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-foreground/55 text-xs truncate max-w-[70%]">
                      {row.label}
                    </span>
                    <span className="text-foreground/35 text-[10px] tabular-nums shrink-0">
                      {row.value}× · {Math.round((row.value / total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-foreground/6 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#8a8a82]/60 transition-all duration-700"
                      style={{ width: `${(row.value / stats.lostReasonRows[0].value) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {/* Referral conversion */}
      {stats.referralConvRows.length > 0 && (
        <Panel title="Conversão por fonte (leads → aceite)">
          <div className="flex flex-col gap-3">
            {stats.referralConvRows.map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-foreground/55 text-xs truncate max-w-[55%]">
                    {row.label}
                  </span>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-foreground/30 text-[10px] tabular-nums">
                      {row.accepted}/{row.total} leads
                    </span>
                    <span
                      className="text-[11px] font-semibold tabular-nums min-w-[34px] text-right"
                      style={{
                        color: row.rate >= 50 ? "#4d6350" : row.rate >= 20 ? "#7c854b" : "#8a8a82",
                      }}
                    >
                      {row.rate}%
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-foreground/6 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{
                      width: `${row.rate}%`,
                      background:
                        row.rate >= 50 ? "#4d6350" : row.rate >= 20 ? "#7c854b" : "#8a8a82",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}
