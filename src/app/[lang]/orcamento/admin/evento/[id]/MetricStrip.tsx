"use client";

import { eur0 } from "@/lib/money";
import type { EventMetrics } from "@/lib/orcamento/dossier";

/**
 * Faixa de métricas do cockpit — Valor, Margem (c/ IVA), % Pago, contagem
 * decrescente e RSVP. Graciosa quando faltam dados: cada célula cai para "—".
 * Todos os valores são com IVA (rotulados "c/ IVA").
 */
interface Props {
  metrics: EventMetrics;
}

function Cell({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: string;
}) {
  return (
    <div className="bo-card px-4 py-3.5 flex flex-col justify-center">
      <p className="text-foreground/30 text-[9px] tracking-[0.22em] uppercase mb-1.5">{label}</p>
      <p className={`text-lg font-semibold leading-none ${tone ?? "text-foreground/80"}`}>
        {value}
      </p>
      {sub && <p className="text-foreground/35 text-[10px] mt-1">{sub}</p>}
    </div>
  );
}

export default function MetricStrip({ metrics }: Props) {
  const {
    contracted,
    margin,
    supplierCosts,
    pctPaid,
    ledgerPaid,
    countdownDays,
    rsvpConfirmed,
    rsvpTotal,
  } = metrics;

  // Contagem decrescente: rótulo + tom de urgência (esta semana / hoje / passou).
  let cdValue = "—";
  let cdSub: string | undefined;
  let cdTone: string | undefined;
  if (countdownDays !== null) {
    if (countdownDays === 0) {
      cdValue = "Hoje";
      cdTone = "text-[#b5654a]";
    } else if (countdownDays > 0) {
      cdValue = String(countdownDays);
      cdSub = countdownDays === 1 ? "dia" : "dias";
      cdTone = countdownDays <= 7 ? "text-[#b5654a]" : undefined;
    } else {
      cdValue = String(Math.abs(countdownDays));
      cdSub = Math.abs(countdownDays) === 1 ? "dia (passou)" : "dias (passou)";
      cdTone = "text-foreground/40";
    }
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
      <Cell label="Valor c/ IVA" value={contracted > 0 ? eur0(contracted) : "—"} />
      <Cell
        label="Margem c/ IVA"
        value={supplierCosts > 0 ? eur0(margin) : "—"}
        sub={supplierCosts > 0 ? `custos ${eur0(supplierCosts)}` : "sem custos registados"}
        tone={supplierCosts > 0 ? (margin >= 0 ? "text-[#4d6350]" : "text-[#b5654a]") : undefined}
      />
      <Cell
        label="% Pago"
        value={contracted > 0 ? `${Math.round(pctPaid * 100)}%` : "—"}
        sub={contracted > 0 ? `recebido ${eur0(ledgerPaid)}` : undefined}
        tone={pctPaid >= 1 ? "text-[#4d6350]" : undefined}
      />
      <Cell
        label={countdownDays !== null && countdownDays > 0 ? "Faltam" : "Evento"}
        value={cdValue}
        sub={cdSub}
        tone={cdTone}
      />
      <Cell
        label="RSVP"
        value={rsvpTotal > 0 ? `${rsvpConfirmed}/${rsvpTotal}` : "—"}
        sub={rsvpTotal > 0 ? "confirmados" : "sem lista"}
      />
    </div>
  );
}
