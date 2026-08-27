"use client";

import { useMemo, useState } from "react";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { CATEGORIES, EVENT_TYPES_BY_CATEGORY } from "@/lib/orcamento/data";
import { computeEventMetrics, contractedAmounts } from "@/lib/orcamento/dossier";
import { downloadCsv, quotesToCsvRows, paymentsToCsvRows, dateStamp } from "./export";
import { eur0 as eur } from "@/lib/money";
import { Button, Card, EmptyState, Segmented } from "./ui";
import AnalisePropostas from "./AnalisePropostas";
import { fraccaoDaBarra } from "@/lib/fraccao-da-barra";

// Unified status vocabulary — the same words a newcomer sees everywhere else in
// the back office (Overview, Kanban): Novo / Aguardar resposta / Proposta enviada /
// Ganho / Perdido.
const STATUS_META: Record<QuoteStatus, { label: string; color: string }> = {
  pendente: { label: "Novo", color: "#8a8a82" },
  em_revisao: { label: "Aguardar resposta", color: "#9aa36a" },
  cotado: { label: "Proposta enviada", color: "#7c854b" },
  aceite: { label: "Ganho", color: "#525a2f" },
  rejeitado: { label: "Perdido", color: "#5a5a55" },
};

/**
 * A chave `YYYY-MM-DD` LOCAL de um dia — a mesma regra do `todayKey()` do
 * `util.ts`, aplicada também a dias que não são hoje. Nunca `toISOString()`,
 * que é UTC e desliza um dia para quem está a leste/oeste de Greenwich.
 */
const chaveLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

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

function Kpi({
  value,
  label,
  accent,
  small,
}: {
  value: string;
  label: string;
  accent?: boolean;
  /** Secondary, less prominent tile (smaller number, tighter padding). */
  small?: boolean;
}) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border ${small ? "p-4" : "p-5"} ${
        accent ? "bg-[#4d6350]/[0.05] border-[#4d6350]/20" : "bg-white border-[var(--bo-hairline)] "
      }`}
    >
      <p
        className={`font-light leading-none mb-2 relative ${accent ? "text-[#4d6350]" : "text-[var(--bo-text)]"}`}
        style={{
          fontSize: small ? "clamp(18px, 1.9vw, 24px)" : "clamp(22px, 2.6vw, 34px)",
        }}
      >
        {value}
      </p>
      <p
        className={`text-[9px] tracking-[0.25em] uppercase relative ${accent ? "text-[#4d6350]/60" : "text-foreground/30"}`}
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
  const allZero = data.every((d) => d.value === 0);
  if (allZero) {
    return <p className="text-foreground/40 text-xs">Ainda sem dados neste período.</p>;
  }
  return (
    <div className="flex items-end gap-2 h-40">
      {data.map((d, i) => {
        const valueLabel = format ? format(d.value) : String(d.value);
        return (
          <div
            key={i}
            className="flex-1 flex flex-col items-center gap-2 group"
            title={`${d.label}: ${valueLabel}`}
          >
            <span
              /* Os números só existiam com rato: no telemóvel este painel era um
               conjunto de barras sem um único valor à vista, e o `title` do
               contentor também só serve o rato. À vista no dedo, escondido
               até ao hover só onde há rato — o par da casa (globals.css:98). */
              className="text-foreground/45 text-[10px] tabular-nums opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 transition-opacity motion-reduce:transition-none"
            >
              {valueLabel}
            </span>
            <div
              className="w-full bg-[var(--bo-tinta-6)] rounded-sm relative"
              style={{ height: "100%" }}
              role="img"
              aria-label={`${d.label}: ${valueLabel}`}
            >
              <div
                className="absolute inset-0 origin-bottom bg-moss/70 group-hover:bg-moss rounded-sm transition-[transform,background-color] duration-500 motion-reduce:transition-[background-color]"
                style={{ transform: `scaleY(${fraccaoDaBarra(d.value, max)})` }}
              />
            </div>
            <span className="text-foreground/40 text-[9px] tracking-wide">{d.label}</span>
          </div>
        );
      })}
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
            <span className="text-[var(--bo-text-muted)] text-xs">{d.label}</span>
            <span className="text-foreground/35 text-[10px] tabular-nums">
              {d.value} · {Math.round((d.value / total) * 100)}%
            </span>
          </div>
          <div className="h-1.5 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden">
            <div
              className="h-full w-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-700"
              style={{
                transform: `scaleX(${fraccaoDaBarra(d.value, max)})`,
                background: d.color ?? "#7c854b",
              }}
            />
          </div>
        </div>
      ))}
      {data.length === 0 && <p className="text-foreground/40 text-xs">Ainda sem dados.</p>}
    </div>
  );
}

// A collapsible titled section — the deeper breakdowns fold away so the screen
// opens calm (headline numbers + money) and the analytics are one click away.
// `defaultOpen` keeps the sections that matter most for the owner expanded.
function Section({
  title,
  hint,
  defaultOpen,
  children,
}: {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-[var(--bo-hairline)] bg-white overflow-hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <span className="text-[var(--bo-text-muted)] text-[10px] tracking-[0.3em] uppercase font-medium">
            {title}
          </span>
          {hint && <p className="mt-1 text-[11px] text-foreground/35 leading-snug">{hint}</p>}
        </div>
        <svg
          className="shrink-0 text-foreground/30 motion-safe:transition-transform group-open:rotate-180"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="px-6 pb-6 pt-1">{children}</div>
    </details>
  );
}

/**
 * OS QUADRADOS DE NÚMERO DENTRO DE UMA SECÇÃO — porque não são dois a 320 px.
 *
 * As secções («Dinheiro», «Rentabilidade») já gastam 24 px de cada lado
 * (`px-6`), e cada quadrado gasta mais 20 (`p-5`). Medido a 320 px, sobravam
 * 71 px de largura útil por quadrado, e um total de seis algarismos precisa de
 * 109: «202 889 €» passava 17 px PARA ALÉM da borda do quadrado, que tem
 * `overflow-hidden` — ou seja, o € desaparecia. «164 950 €» perdia 13 px, e o
 * rótulo «Custo fornecedores» era cortado a 78 px de texto em 71 de caixa.
 *
 * A 375 px (o ecrã de referência) o mesmo número cabe com 10 px de folga, e é
 * por isso que a segunda coluna só sai abaixo de 22rem (352 px): quem tem
 * telemóvel estreito lê o número inteiro, e quem tem 375 continua a ver a
 * grelha de dois que sempre viu. Os quadrados de topo, esses, nunca estiveram
 * em causa — vivem fora da secção e têm 124 px úteis.
 */
const QUADRADOS_DE_NUMERO = "grid grid-cols-1 min-[22rem]:grid-cols-2 gap-3";

// A lightweight titled block used inside a Section — no border of its own, so
// grouped charts read as one calm panel instead of nested cards.
function Sub({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-foreground/45 text-[10px] tracking-[0.25em] uppercase mb-5 font-medium">
        {title}
      </h3>
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
      wonPricedCount = 0,
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
      /**
       * ── OS DOIS RAMOS NÃO ESTÃO NA MESMA UNIDADE ─────────────────────────
       *
       * `q.quotedPrice` é o campo «Preço final (SEM IVA)» do ecrã. Somá-lo
       * directo aqui e comparar com «Receita contratada» (que vem de
       * `computeEventMetrics().contracted`, sempre COM IVA) punha dois números
       * da mesma página em unidades diferentes: um evento aceite a 20 000 € +
       * IVA (24 600 € a receber) aparecia com «Ganho (aceite)» 20 000 € ao
       * lado de «Receita contratada» 24 600 € — 4 600 € de diferença, o IVA
       * inteiro, sistematicamente ~23% abaixo.
       *
       * A casa já tinha corrigido este mesmo erro em `Reminders.tsx`,
       * `PaymentsPanel.tsx` e `Overview.tsx`. `contractedAmounts` é a mesma
       * cascata: proposta > preço cotado > estimativa, sempre devolvida com
       * IVA. Sem proposta à mão aqui, o ramo do `quotedPrice` deriva o bruto
       * pela taxa efectiva do pedido — nunca uma conta nova.
       */
      const contratado = q.quotedPrice != null ? contractedAmounts(q).gross : 0;
      if (q.quotedPrice) {
        if (q.status === "cotado") pipelineSum += contratado;
        if (q.status === "aceite") {
          wonSum += contratado;
          wonPricedCount++;
        }
      }

      const sd = new Date(q.submittedAt);
      if (sd.getFullYear() === now.getFullYear() && sd.getMonth() === now.getMonth()) thisMonth++;
      const idx = monthIndex.get(`${sd.getFullYear()}-${sd.getMonth()}`);
      if (idx !== undefined) {
        months[idx].value++;
        if (q.status === "aceite" && q.quotedPrice) months[idx].revenue += contratado;
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
    // Dias LOCAIS, não os de `toISOString()` (que é UTC): à meia-noite e meia
    // de Verão em Portugal a data UTC ainda é a de ontem, e a janela dos
    // "próximos 60 dias" deixava de fora um pagamento marcado para hoje.
    // Ver a regra em `util.ts`.
    const hoje = chaveLocal(now);
    const horizon = chaveLocal(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 60));
    let received = 0,
      outstanding = 0;
    const upcoming: { id: string; name: string; amount: number; date: string; kind: string }[] = [];
    for (const q of filteredQuotes) {
      for (const p of q.payments ?? []) {
        if (p.paid) received += p.amount;
        else {
          outstanding += p.amount;
          if (p.date && p.date >= hoje && p.date <= horizon) {
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

    // ── Rentabilidade — margem sobre eventos ganhos (aceites) ──
    // Usa computeEventMetrics (mesma matemática do Dossier) para que os números
    // coincidam. Todos os valores são c/ IVA. Só entram eventos com valor
    // contratado real (> 0).
    let profContracted = 0,
      profCosts = 0,
      profMargin = 0,
      profCount = 0;
    /**
     * ── A PERCENTAGEM DE MARGEM DIVIDE-SE PELA RECEITA LÍQUIDA ──────────────
     *
     * A margem de `computeEventMetrics` é líquida contra líquida — o IVA não é
     * receita nem é custo (ver a nota em `EventMetrics.margin`). Dividi-la pelo
     * valor CONTRATADO, que é bruto, misturava as duas unidades: uma margem
     * real de 40% aparecia como 32,5%, e o «Margem média» do painel dizia,
     * sistematicamente, menos ~19% do que a verdade. O numerador e o
     * denominador têm de vir da mesma leitura.
     *
     * O valor contratado continua a mostrar-se BRUTO na coluna do lado: é o
     * que o cliente paga e é o número que ela reconhece do contrato.
     */
    let profContractedNet = 0;
    const byTypeProfit: Record<
      string,
      { contracted: number; contractedNet: number; cost: number; margin: number; count: number }
    > = {};
    for (const q of filteredQuotes) {
      if (q.status !== "aceite") continue;
      const m = computeEventMetrics({ quote: q, proposal: null, contract: null });
      if (m.contracted <= 0) continue;
      profContracted += m.contracted;
      profContractedNet += m.contractedNet;
      profCosts += m.supplierCosts;
      profMargin += m.margin;
      profCount++;
      const label = eventTypeLabel(q);
      const bucket =
        byTypeProfit[label] ??
        (byTypeProfit[label] = { contracted: 0, contractedNet: 0, cost: 0, margin: 0, count: 0 });
      bucket.contracted += m.contracted;
      bucket.contractedNet += m.contractedNet;
      bucket.cost += m.supplierCosts;
      bucket.margin += m.margin;
      bucket.count++;
    }
    const profAvgMarginPct = profContractedNet > 0 ? (profMargin / profContractedNet) * 100 : 0;
    const profByType = Object.entries(byTypeProfit)
      .map(([label, b]) => ({
        label,
        contracted: b.contracted,
        cost: b.cost,
        margin: b.margin,
        count: b.count,
        marginPct: b.contractedNet > 0 ? (b.margin / b.contractedNet) * 100 : 0,
      }))
      .sort((a, b) => b.margin - a.margin);

    const accepted = byStatus["aceite"] ?? 0;
    const decided = accepted + (byStatus["rejeitado"] ?? 0);
    const conversion = decided > 0 ? Math.round((accepted / decided) * 100) : 0;
    /**
     * O denominador é quem TEM preço (`wonPricedCount`), não todos os
     * aceites (`accepted`). `wonSum` só soma quem entrou no `if (q.quotedPrice)`
     * acima; dividir pelo total de aceites metia no denominador negócios que
     * não entraram no numerador, e o «Ticket médio» saía sistematicamente
     * abaixo da verdade — mesmo defeito já corrigido em `Overview.tsx`.
     */
    const avgTicket = wonPricedCount > 0 ? wonSum / wonPricedCount : 0;
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
      profitability: {
        contracted: profContracted,
        costs: profCosts,
        margin: profMargin,
        avgMarginPct: profAvgMarginPct,
        count: profCount,
        byType: profByType,
      },
      hasProfit: profCount > 0,
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
      <Card padding="none">
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="4" height="16" rx="1" />
              <rect x="10" y="4" width="4" height="11" rx="1" />
              <rect x="17" y="4" width="4" height="7" rx="1" />
            </svg>
          }
          title="Ainda não há dados para mostrar"
          description="As estatísticas — conversão, receita, margens e tendências — aparecem automaticamente assim que chegarem os primeiros pedidos."
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Toolbar: period filter (primary control) + quiet export actions */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <Segmented
          ariaLabel="Período"
          size="sm"
          value={period}
          onChange={setPeriod}
          options={(["all", "1y", "6m", "3m"] as Period[]).map((p) => ({
            value: p,
            label: PERIOD_LABELS[p],
          }))}
        />
        <div className="flex flex-wrap gap-2">
          {stats.hasPayments && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadCsv(`liquen-pagamentos-${dateStamp()}`, paymentsToCsvRows(filteredQuotes))
              }
              title="Exportar todos os pagamentos (tesouraria) para CSV"
            >
              Exportar pagamentos
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() =>
              downloadCsv(`liquen-pedidos-${dateStamp()}`, quotesToCsvRows(filteredQuotes))
            }
            title="Exportar todos os pedidos para CSV"
          >
            Exportar pedidos
          </Button>
        </div>
      </div>

      {/* ── OS OITO NÚMEROS DO TOPO QUEBRAM AO MESMO TEMPO ─────────────────
          Eram duas filas com dois cortes diferentes: a de cima passava a quatro
          colunas aos 1024 (`lg:`) e a de baixo aos 768 (`md:`). Entre essas duas
          larguras — o iPad ao alto, e é lá que a auditoria encontrou os quatro
          achados Críticos — liam-se dois de cima e quatro de baixo, com o mesmo
          desenho e o mesmo tamanho: uma escada sem razão nenhuma.

          E a pergunta nem era sobre o ecrã. Estes quadrados vivem na coluna de
          conteúdo, que a barra lateral encolhe a partir dos 1024 sem a janela
          encolher — é a mesma razão que pôs `@container` no `EventCosts` e no
          `PaymentsPanel`. Por isso o corte é do CONTENTOR.

          A CONTA, que é a que fixa os 40rem: o quadrado mais apertado é o da
          fila de baixo — «202 889 €» a 24 px de Playfair pede ~117 px, mais os
          32 px de `p-4`, dá 149. Quatro deles com três `gap-3` querem
          4×149 + 36 = 632 px de contentor. 40rem são 640, que é de propósito o
          mesmo número do `sm` da casa: um sistema de cortes, medido no sítio
          certo. */}
      <div className="@container flex flex-col gap-6">
        {/* Headline numbers — the four that answer "how are we doing?" at a glance */}
        <div className="grid grid-cols-2 @[40rem]:grid-cols-4 gap-3">
          <Kpi value={String(stats.total)} label="Pedidos totais" accent />
          <Kpi value={`${stats.conversion}%`} label="Conversão" />
          <Kpi value={eur(stats.pipelineSum)} label="Em proposta (com IVA)" />
          <Kpi value={eur(stats.wonSum)} label="Ganho (aceite, com IVA)" accent />
        </div>

        {/* Secondary indicators — still here, just quieter */}
        <div className="grid grid-cols-2 @[40rem]:grid-cols-4 gap-3">
          <Kpi small value={String(stats.thisMonth)} label="Este mês" />
          <Kpi small value={stats.avgRespLabel} label="Resposta média" />
          <Kpi
            small
            value={stats.avgDaysClose > 0 ? `${stats.avgDaysClose}d` : "—"}
            label="Tempo de fecho"
          />
          <Kpi
            small
            value={stats.forecastRevenue > 0 ? eur(stats.forecastRevenue) : "—"}
            label="Previsão pipeline (com IVA)"
          />
        </div>
      </div>

      {/* ── O QUE AS PROPOSTAS DIZEM ────────────────────────────────────
          O painel de cima conta PEDIDOS: quantos entraram, quantos fecharam,
          em que meses. Isto conta PROPOSTAS, e responde a outras perguntas —
          a primeira das quais é a que fez o motivo de recusa ser uma lista
          fechada em vez de texto livre: perdemos por preço quantas vezes? */}
      <Section
        title="Propostas"
        hint="Fecho, motivos de recusa e o que os extras vendem."
        defaultOpen
      >
        <AnalisePropostas />
      </Section>

      {/* Financeiro */}
      {stats.hasPayments && (
        <Section title="Dinheiro" hint="Pagamentos registados nos pedidos." defaultOpen>
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8">
            <Sub title="Recebido e a receber">
              <div className={`${QUADRADOS_DE_NUMERO} mb-5`}>
                <Kpi value={eur(stats.received)} label="Recebido" accent />
                <Kpi value={eur(stats.outstanding)} label="A receber" />
                <Kpi value={eur(stats.avgTicket)} label="Ticket médio (com IVA)" />
                {/* «Registado total», e já não «Faturado total». O número não
                    mudou — sempre foi recebido + a receber, somado das linhas
                    de pagamento (ver o cálculo acima), e nunca leu uma factura.
                    O rótulo é que prometia uma coisa que esta aplicação já não
                    faz: quem o lesse hoje procuraria o total facturado, que
                    vive no programa de facturação e não aqui. */}
                <Kpi value={eur(stats.received + stats.outstanding)} label="Registado total" />
              </div>
              {/* received vs outstanding bar */}
              {stats.received + stats.outstanding > 0 && (
                <div>
                  <div className="relative h-2 rounded-full overflow-hidden bg-[var(--bo-tinta-6)]">
                    <div
                      className="absolute inset-0 origin-left bg-moss motion-safe:transition-transform motion-safe:duration-700"
                      style={{
                        transform: `scaleX(${fraccaoDaBarra(stats.received, stats.received + stats.outstanding)})`,
                      }}
                    />
                    <div
                      className="absolute inset-0 origin-left bg-[#b5894a]/70 motion-safe:transition-transform motion-safe:duration-700"
                      style={{
                        transform: `translateX(${fraccaoDaBarra(stats.received, stats.received + stats.outstanding) * 100}%) scaleX(${fraccaoDaBarra(stats.outstanding, stats.received + stats.outstanding)})`,
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
            </Sub>

            <Sub title="Próximos pagamentos (60 dias)">
              {stats.upcoming.length === 0 ? (
                <p className="text-foreground/40 text-xs">
                  Sem pagamentos previstos para os próximos 60 dias.
                </p>
              ) : (
                <div className="flex flex-col divide-y divide-[var(--bo-hairline)]">
                  {stats.upcoming.map((p) => (
                    <div key={p.id} className="flex items-center justify-between py-2.5">
                      <div className="min-w-0">
                        <p className="text-[var(--bo-text-muted)] text-sm truncate">{p.name}</p>
                        <p className="text-foreground/30 text-[10px] capitalize">{p.kind}</p>
                      </div>
                      <div className="text-right shrink-0 ml-3">
                        <p className="text-moss text-sm font-medium tabular-nums">
                          {eur(p.amount)}
                        </p>
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
            </Sub>
          </div>
        </Section>
      )}

      {/* Rentabilidade */}
      <Section title="Rentabilidade" hint="Margem dos eventos ganhos (valores c/ IVA)." defaultOpen>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.2fr] gap-8">
          <Sub title="Eventos ganhos">
            {stats.hasProfit ? (
              <>
                <div className={QUADRADOS_DE_NUMERO}>
                  <Kpi
                    value={eur(stats.profitability.contracted)}
                    label="Receita contratada"
                    accent
                  />
                  <Kpi value={eur(stats.profitability.costs)} label="Custo fornecedores" />
                  <Kpi value={eur(stats.profitability.margin)} label="Margem" accent />
                  <Kpi
                    value={`${Math.round(stats.profitability.avgMarginPct)}%`}
                    label="Margem média"
                  />
                </div>
                <p className="text-foreground/25 text-[10px] mt-4">
                  Valores c/ IVA · {stats.profitability.count} evento
                  {stats.profitability.count === 1 ? "" : "s"} ganho
                  {stats.profitability.count === 1 ? "" : "s"} com valor contratado.
                </p>
              </>
            ) : (
              <p className="text-foreground/40 text-xs">
                Ainda sem eventos ganhos com valor contratado. A margem aparece assim que fechar a
                primeira proposta.
              </p>
            )}
          </Sub>

          <Sub title="Margem por tipo de evento">
            {stats.hasProfit ? (
              <div className="flex flex-col gap-3">
                {(() => {
                  const maxMargin = Math.max(1, ...stats.profitability.byType.map((r) => r.margin));
                  return stats.profitability.byType.map((row) => {
                    const pct = Math.round(row.marginPct);
                    const color = pct >= 50 ? "#4d6350" : pct >= 20 ? "#7c854b" : "#8a8a82";
                    return (
                      <div key={row.label}>
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[var(--bo-text-muted)] text-xs truncate max-w-[45%]">
                            {row.label}
                          </span>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="text-foreground/30 text-[10px] tabular-nums">
                              {eur(row.margin)}
                            </span>
                            <span
                              className="text-[11px] font-semibold tabular-nums min-w-[34px] text-right"
                              style={{ color }}
                            >
                              {pct}%
                            </span>
                          </div>
                        </div>
                        <div className="h-1.5 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden">
                          <div
                            className="h-full w-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-700"
                            style={{
                              transform: `scaleX(${fraccaoDaBarra(row.margin, maxMargin)})`,
                              background: color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <p className="text-foreground/40 text-xs">Sem propostas aceites ainda.</p>
            )}
          </Sub>
        </div>
      </Section>

      {/* Trends */}
      <Section title="Tendências" hint="Pedidos e receita ganha, mês a mês.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Sub title="Pedidos por mês (últimos 8)">
            <VBars data={stats.months.map((m) => ({ label: m.label, value: m.value }))} />
          </Sub>
          <Sub title="Receita ganha por mês (€, com IVA)">
            {stats.hasRevenue ? (
              <VBars
                data={stats.months.map((m) => ({ label: m.label, value: Math.round(m.revenue) }))}
                format={(n) => eur(n)}
              />
            ) : (
              <p className="text-foreground/40 text-xs">Sem propostas aceites ainda.</p>
            )}
          </Sub>
        </div>
      </Section>

      {/* Breakdowns */}
      <Section title="Repartições" hint="Como se distribuem os pedidos.">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Sub title="Por estado">
            <HBars data={stats.statusBars} />
          </Sub>
          <Sub title="Por categoria">
            <HBars data={stats.categoryBars} />
          </Sub>
          <Sub title="Tipos de evento mais pedidos">
            <HBars data={stats.eventTypeBars} />
          </Sub>
          <Sub title="Como nos conheceram">
            <HBars data={stats.referralBars} />
          </Sub>
        </div>
      </Section>

      {/* Lost reasons */}
      {stats.lostReasonRows.length > 0 && (
        <Section title="Motivos de perda">
          <div className="flex flex-col gap-3">
            {stats.lostReasonRows.map((row) => {
              const total = stats.lostReasonRows.reduce((s, r) => s + r.value, 0);
              return (
                <div key={row.label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[var(--bo-text-muted)] text-xs truncate max-w-[70%]">
                      {row.label}
                    </span>
                    <span className="text-foreground/35 text-[10px] tabular-nums shrink-0">
                      {row.value}× · {Math.round((row.value / total) * 100)}%
                    </span>
                  </div>
                  <div className="h-1.5 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden">
                    <div
                      className="h-full w-full origin-left rounded-full bg-[#8a8a82]/60 motion-safe:transition-transform motion-safe:duration-700"
                      style={{
                        transform: `scaleX(${fraccaoDaBarra(row.value, stats.lostReasonRows[0].value)})`,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </Section>
      )}

      {/* Referral conversion */}
      {stats.referralConvRows.length > 0 && (
        <Section title="Conversão por fonte" hint="Leads que se tornaram evento ganho, por origem.">
          <div className="flex flex-col gap-3">
            {stats.referralConvRows.map((row) => (
              <div key={row.label}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[var(--bo-text-muted)] text-xs truncate max-w-[55%]">
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
                <div className="h-1.5 bg-[var(--bo-tinta-6)] rounded-full overflow-hidden">
                  <div
                    className="h-full w-full origin-left rounded-full motion-safe:transition-transform motion-safe:duration-700"
                    style={{
                      transform: `scaleX(${fraccaoDaBarra(row.rate, 100)})`,
                      background:
                        row.rate >= 50 ? "#4d6350" : row.rate >= 20 ? "#7c854b" : "#8a8a82",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
