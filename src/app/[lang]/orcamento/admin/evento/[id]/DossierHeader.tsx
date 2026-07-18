"use client";

import { useRef } from "react";
import Link from "next/link";
import type { Locale } from "@/lib/i18n";
import {
  STAGE_ORDER,
  STAGE_LABELS,
  type DossierData,
  type EventStage,
  type EventMetrics,
  type NextAction,
} from "@/lib/orcamento/dossier";

/** yyyy-mm-dd (ou ISO) → "12 set 2026"; null se ausente/inválida. */
function fmtDate(v?: string | null): string | null {
  if (!v) return null;
  const dt = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("pt-PT", { day: "numeric", month: "short", year: "numeric" });
}

/** Datas a fixar sob cada marco do stepper, quando existirem. */
function stageDates(d: DossierData): Partial<Record<EventStage, string>> {
  const sinalInv = d.invoices.find((i) => i.kind === "sinal" && i.status === "paga");
  const saldoInv = d.invoices.find(
    (i) => (i.kind === "saldo" || i.kind === "total") && i.status === "paga",
  );
  return {
    lead: d.quote.submittedAt,
    proposta_enviada: d.proposal?.sentAt,
    aceite: d.contract?.acceptedAt ?? d.proposal?.respondedAt,
    sinal_pago: sinalInv?.paidAt,
    concluido: saldoInv?.paidAt ?? d.quote.date,
  };
}

interface Props {
  data: DossierData;
  stage: EventStage;
  metrics: EventMetrics;
  next: NextAction;
  portalUrl: string;
  lang: Locale;
  onScrollTo: (id: string) => void;
}

export default function DossierHeader({ data, stage, next, portalUrl, lang, onScrollTo }: Props) {
  const { quote } = data;
  const stepRef = useRef<HTMLDivElement>(null);

  const dates = stageDates(data);
  const reachedIdx = stage === "perdido" ? -1 : STAGE_ORDER.indexOf(stage);

  // Facts do título: cliente · evento · data · local.
  const titleBits = [
    quote.eventName?.trim() || null,
    fmtDate(quote.date),
    quote.location?.trim() || null,
  ].filter(Boolean);

  // Onde a próxima ação aponta. Portal abre link; as restantes navegam para a
  // zona respetiva; arquivar fica como marcador (fase de quick-actions).
  function zoneFor(kind: NextAction["kind"]): string | null {
    switch (kind) {
      case "proposta":
        return "zone-comunicacao";
      case "fatura_sinal":
      case "fatura_saldo":
        return "zone-financeiro";
      case "producao":
      case "runsheet":
        return "zone-producao";
      default:
        return null;
    }
  }
  const zone = zoneFor(next.kind);

  return (
    <header className="sticky top-0 z-20 bg-white/92 backdrop-blur-xl border-b border-foreground/[0.07]">
      <div className="px-4 sm:px-6 lg:px-10 py-4 flex flex-col gap-4">
        {/* Linha 1 — voltar + título + próxima ação */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-4">
          <div className="min-w-0 flex-1">
            <Link
              href={`/${lang}/orcamento/admin`}
              className="inline-flex items-center gap-1.5 text-foreground/40 text-[10px] tracking-[0.18em] uppercase hover:text-[#4d6350] transition-colors mb-2"
            >
              <svg
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Pedidos
            </Link>
            <p className="text-foreground/35 text-[9px] tracking-[0.35em] uppercase mb-1.5 font-medium">
              Dossier do Evento
            </p>
            <h1
              className="text-foreground/88 font-bold leading-tight truncate"
              style={{ fontFamily: "var(--font-playfair)", fontSize: "clamp(20px, 2.6vw, 30px)" }}
            >
              {quote.name}
            </h1>
            {titleBits.length > 0 && (
              <p className="text-foreground/45 text-xs mt-1 truncate">{titleBits.join(" · ")}</p>
            )}
          </div>

          {/* Cartão de próxima ação */}
          <div className="shrink-0 lg:max-w-xs w-full lg:w-auto bg-[#1b2119] rounded-xl p-4 shadow-sm">
            <p className="text-white/40 text-[9px] tracking-[0.3em] uppercase mb-1.5">
              Próxima ação
            </p>
            <p className="text-white/85 text-sm font-medium leading-snug mb-1">{next.label}</p>
            <p className="text-white/45 text-[11px] leading-relaxed mb-3">{next.hint}</p>
            {next.kind === "portal" ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#4d6350] hover:bg-[#59745b] text-white/95 text-[10px] tracking-[0.15em] uppercase rounded-lg transition-colors"
              >
                {next.label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M7 17 17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : zone ? (
              <button
                onClick={() => onScrollTo(zone)}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#4d6350] hover:bg-[#59745b] text-white/95 text-[10px] tracking-[0.15em] uppercase rounded-lg transition-colors"
              >
                {next.label}
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              // arquivar / none — ainda por ligar (fase de quick-actions).
              <button
                disabled
                title="Disponível na fase de ações rápidas"
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-white/10 text-white/45 text-[10px] tracking-[0.15em] uppercase rounded-lg cursor-not-allowed"
              >
                {next.label}
              </button>
            )}
          </div>
        </div>

        {/* Linha 2 — stepper de fases (roving tabindex, setas navegam) */}
        <div
          ref={stepRef}
          role="group"
          aria-label="Fase do evento"
          className="flex items-stretch gap-0 overflow-x-auto pb-1 -mx-1 px-1"
        >
          {stage === "perdido" ? (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#b5654a]/12 text-[#b5654a] text-[11px] tracking-[0.12em] uppercase font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-[#b5654a]" />
              Negócio perdido
            </span>
          ) : (
            STAGE_ORDER.map((s, i, arr) => {
              const reached = i <= reachedIdx;
              const current = s === stage;
              const when = fmtDate(dates[s]);
              return (
                <div key={s} className="flex items-center shrink-0">
                  <button
                    tabIndex={current ? 0 : -1}
                    aria-current={current ? "step" : undefined}
                    onKeyDown={(e) => {
                      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
                      e.preventDefault();
                      const dir = e.key === "ArrowRight" ? 1 : -1;
                      const btns =
                        stepRef.current?.querySelectorAll<HTMLButtonElement>("button[data-step]");
                      btns?.[(i + dir + arr.length) % arr.length]?.focus();
                    }}
                    data-step
                    className="group flex flex-col items-center gap-1 px-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/40 rounded-lg"
                    title={when ? `${STAGE_LABELS[s]} · ${when}` : STAGE_LABELS[s]}
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full border transition-colors ${
                        current
                          ? "bg-[#4d6350] border-[#4d6350] ring-4 ring-[#4d6350]/15"
                          : reached
                            ? "bg-[#4d6350] border-[#4d6350]"
                            : "bg-transparent border-foreground/25"
                      }`}
                    />
                    <span
                      className={`text-[9px] tracking-[0.08em] uppercase whitespace-nowrap transition-colors ${
                        current
                          ? "text-foreground/80 font-semibold"
                          : reached
                            ? "text-foreground/55"
                            : "text-foreground/30"
                      }`}
                    >
                      {STAGE_LABELS[s]}
                    </span>
                    <span className="text-foreground/25 text-[8px] tabular-nums h-3">
                      {when ?? ""}
                    </span>
                  </button>
                  {i < arr.length - 1 && (
                    <span
                      aria-hidden
                      className={`w-6 sm:w-10 h-px mt-[-14px] ${i < reachedIdx ? "bg-[#4d6350]/50" : "bg-foreground/15"}`}
                    />
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </header>
  );
}
