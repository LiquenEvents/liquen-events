"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { downloadEventIcs, printEventDossier, printRunSheet } from "../../export";
import { Button } from "../../ui";

/** Ghost-style toolbar control shared by the header's link + button actions. */
const TOOL_LINK =
  "inline-flex items-center gap-2 h-8 px-3 rounded-xl text-xs font-medium text-foreground/55 " +
  "hover:bg-foreground/[0.06] hover:text-foreground/80 motion-safe:transition-colors " +
  "motion-safe:duration-150";

/**
 * Copia texto para a área de transferência com degradação graciosa. O caminho
 * moderno (`navigator.clipboard`) pode estar indefinido em http não seguro ou
 * ser recusado sem gesto do utilizador — aqui está atrás de um clique, mas
 * guardamos na mesma; o fallback usa um textarea oculto + `execCommand('copy')`
 * para browsers antigos. Devolve `true` se a cópia foi confirmada.
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* cai para o fallback legado abaixo */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}

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

  // Confirmação inline da cópia — a árvore do Dossier não está dentro do
  // ToastProvider (só a raiz de administração está), por isso mostramos um
  // "Copiado ✓" transitório no próprio botão em vez de um toast.
  const [copied, setCopied] = useState(false);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (copyTimer.current) clearTimeout(copyTimer.current);
    },
    [],
  );

  // Link partilhável do portal do cliente. O `portalUrl` chega relativo
  // (ex.: /pt/portal/<token>); prefixamos a origem atual para obter o URL
  // absoluto que a estúdio envia ao cliente.
  const copyPortalLink = useCallback(async () => {
    const absolute = typeof window !== "undefined" ? window.location.origin + portalUrl : portalUrl;
    const ok = await copyToClipboard(absolute);
    if (!ok) return;
    setCopied(true);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    copyTimer.current = setTimeout(() => setCopied(false), 2000);
  }, [portalUrl]);

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
      <div className="px-4 sm:px-6 lg:px-10 py-5 flex flex-col gap-5">
        {/* Linha 1 — voltar + título + próxima ação */}
        <div className="flex flex-col lg:flex-row lg:items-start gap-5">
          <div className="min-w-0 flex-1">
            <Link
              href={`/${lang}/orcamento/admin`}
              className="inline-flex items-center gap-1.5 text-foreground/45 text-xs font-medium hover:text-[#4d6350] motion-safe:transition-colors mb-3"
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Pedidos
            </Link>
            <p className="bo-eyebrow mb-1.5">Dossier do Evento</p>
            <h1
              className="font-display text-foreground/90 font-bold leading-tight truncate"
              style={{ fontSize: "clamp(22px, 2.6vw, 32px)" }}
            >
              {quote.name}
            </h1>
            {titleBits.length > 0 && (
              <p className="text-foreground/55 text-sm mt-1.5 truncate">{titleBits.join(" · ")}</p>
            )}

            {/* Barra de ações — partilha / impressão / calendário. Só
                ferramentas seguras e client-safe (export.ts + APIs do browser);
                nada que gere dinheiro (sinal/saldo são emitidos noutro lado).
                Ícones sempre visíveis, rótulos escondidos em ecrãs pequenos,
                tal como o cabeçalho da administração. */}
            <div className="flex flex-wrap items-center gap-1.5 mt-4">
              {/* Copiar link do portal — ação principal da estúdio para
                  partilhar o portal privado com o cliente, por isso destacada. */}
              <Button
                variant={copied ? "primary" : "subtle"}
                size="sm"
                onClick={copyPortalLink}
                aria-live="polite"
                title="Copiar o link privado do portal do cliente para a área de transferência"
                iconLeft={
                  copied ? (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  ) : (
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1.5 1.5" />
                      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1.5-1.5" />
                    </svg>
                  )
                }
              >
                <span className="hidden sm:inline">
                  {copied ? "Copiado ✓" : "Copiar link do portal"}
                </span>
              </Button>

              {/* Abrir portal — mesma janela nova que o cartão de próxima ação. */}
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={TOOL_LINK}
                title="Abrir o portal do cliente num separador novo"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <path d="M15 3h6v6M10 14 21 3" />
                </svg>
                <span className="hidden sm:inline">Abrir portal</span>
              </a>

              {/* Separador subtil entre partilha e impressão/calendário. */}
              <span aria-hidden className="w-px h-4 bg-foreground/10 mx-1" />

              <Button
                variant="ghost"
                size="sm"
                onClick={() => printEventDossier(quote)}
                title="Imprimir dossier completo do evento (contacto, financeiro, cronograma, convidados)"
                iconLeft={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path d="M14 2v6h6M9 13h6M9 17h6M9 9h1" strokeLinecap="round" />
                  </svg>
                }
              >
                <span className="hidden sm:inline">Imprimir Dossier</span>
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => printRunSheet(quote)}
                title="Imprimir o guião do dia (cronograma e checklist do evento)"
                iconLeft={
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    aria-hidden="true"
                  >
                    <path
                      d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <rect x="6" y="14" width="12" height="7" rx="1" />
                  </svg>
                }
              >
                <span className="hidden sm:inline">Guião do dia</span>
              </Button>

              {/* .ics — só quando o evento tem data (buildEventIcs devolve null
                  sem data, por isso o botão não teria efeito). */}
              {quote.date && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => downloadEventIcs(quote)}
                  title="Descarregar .ics para adicionar ao calendário (Google/Apple/Outlook)"
                  iconLeft={
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
                      <path d="M12 13v5M9.5 15.5 12 18l2.5-2.5" />
                    </svg>
                  }
                >
                  <span className="hidden sm:inline">.ics</span>
                </Button>
              )}
            </div>
          </div>

          {/* Cartão de próxima ação */}
          <div className="shrink-0 lg:max-w-xs w-full lg:w-auto bg-[#1b2119] rounded-2xl p-5 shadow-sm">
            <p className="text-white/45 text-[10px] tracking-[0.16em] uppercase font-semibold mb-2">
              Próxima ação
            </p>
            <p className="text-white/90 text-sm font-medium leading-snug mb-1.5">{next.label}</p>
            <p className="text-white/50 text-xs leading-relaxed mb-4">{next.hint}</p>
            {next.kind === "portal" ? (
              <a
                href={portalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 h-10 px-4 bg-[#4d6350] hover:bg-[#59745b] text-white/95 text-sm font-medium rounded-xl motion-safe:transition-colors motion-safe:duration-150 motion-safe:active:scale-[0.98]"
              >
                {next.label}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M7 17 17 7M8 7h9v9" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            ) : zone ? (
              <button
                type="button"
                onClick={() => onScrollTo(zone)}
                className="inline-flex items-center gap-2 h-10 px-4 bg-[#4d6350] hover:bg-[#59745b] text-white/95 text-sm font-medium rounded-xl motion-safe:transition-colors motion-safe:duration-150 motion-safe:active:scale-[0.98]"
              >
                {next.label}
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12l7 7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            ) : (
              // arquivar / none — ainda por ligar (fase de quick-actions).
              <button
                type="button"
                disabled
                title="Disponível na fase de ações rápidas"
                className="inline-flex items-center gap-2 h-10 px-4 bg-white/10 text-white/45 text-sm font-medium rounded-xl cursor-not-allowed"
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
