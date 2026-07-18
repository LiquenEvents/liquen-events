"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { Quote, ActivityEntry } from "@/lib/orcamento/types";
import {
  deriveStage,
  computeEventMetrics,
  reconcileFinance,
  nextAction,
  type DossierData,
} from "@/lib/orcamento/dossier";
import DossierHeader from "./DossierHeader";
import MetricStrip from "./MetricStrip";
import DossierAside from "./DossierAside";
import FinanceZone from "./FinanceZone";
import ProductionZone from "./ProductionZone";
import CommsZone from "./CommsZone";

/**
 * DossierClient — o cockpit de um evento. Guarda um único estado `quote`,
 * inicializado a partir das props do servidor, e passa `quote` + um callback a
 * cada ferramenta reutilizada exatamente como o drawer da administração. As
 * ferramentas fazem o seu próprio PATCH a `/api/orcamento/[id]`; o callback
 * espelha a alteração no estado local (espelho otimista) para o cabeçalho, as
 * métricas e o stepper recalcularem ao vivo.
 *
 * Nenhuma importação de store server-only atravessa esta fronteira: proposta,
 * contrato e faturas chegam já reduzidos a dados serializáveis em `data`; o
 * link do portal chega cunhado em `portalUrl`.
 */
interface Props {
  data: DossierData;
  portalUrl: string;
  lang: Locale;
  userName: string;
}

export default function DossierClient({ data, portalUrl, lang, userName }: Props) {
  const [quote, setQuote] = useState<Quote>(data.quote);

  // Superfície de ferramenta de página inteira: esconder nav pública + grão,
  // tal como a administração faz.
  useEffect(() => {
    document.body.classList.add("admin-mode");
    return () => document.body.classList.remove("admin-mode");
  }, []);

  // Estado vivo: a proposta/contrato/faturas não mudam por estas ferramentas
  // (só a `quote`), por isso reconstruímos o DossierData com a quote atual.
  const live: DossierData = useMemo(() => ({ ...data, quote }), [data, quote]);

  const stage = useMemo(() => deriveStage(live), [live]);
  const metrics = useMemo(() => computeEventMetrics(live), [live]);
  const reconciliation = useMemo(() => reconcileFinance(live), [live]);
  const next = useMemo(() => nextAction(stage, live), [stage, live]);

  // Espelho otimista — as ferramentas já persistiram; aqui só atualizamos o
  // estado local para tudo o que deriva da quote recalcular.
  const onQuoteChange = useCallback((patch: Partial<Quote>) => {
    setQuote((prev) => ({ ...prev, ...patch }));
  }, []);

  // Registo de atividade: acrescenta a entrada e persiste o log completo. É o
  // único PATCH que o container faz (o ActivityLog delega no pai, tal como no
  // drawer).
  const appendActivity = useCallback(
    async (entry: ActivityEntry) => {
      const activityLog = [...(quote.activityLog ?? []), entry];
      setQuote((prev) => ({ ...prev, activityLog }));
      try {
        const res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityLog }),
        });
        if (res.ok) {
          const updated: Quote = await res.json();
          setQuote(updated);
        }
      } catch {
        /* best-effort — o espelho local já reflete a entrada */
      }
    },
    [quote.activityLog, quote.id],
  );

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <div className="min-h-screen bg-surface flex flex-col">
      <DossierHeader
        data={live}
        stage={stage}
        metrics={metrics}
        next={next}
        portalUrl={portalUrl}
        lang={lang}
        onScrollTo={scrollTo}
      />

      <main className="flex-1 px-4 sm:px-6 lg:px-10 py-6 lg:py-8 flex flex-col gap-6">
        <MetricStrip metrics={metrics} />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          {/* Coluna principal */}
          <div className="flex flex-col gap-6 min-w-0">
            <FinanceZone
              quote={quote}
              invoices={data.invoices}
              reconciliation={reconciliation}
              onQuoteChange={onQuoteChange}
            />
            <ProductionZone quote={quote} userName={userName} onQuoteChange={onQuoteChange} />
            <CommsZone
              quote={quote}
              userName={userName}
              onQuoteChange={onQuoteChange}
              onAddEntry={appendActivity}
            />
          </div>

          {/* Coluna lateral (fixa em ecrãs largos) */}
          <aside className="xl:sticky xl:top-40 min-w-0">
            <DossierAside quote={quote} actor={userName} onAddEntry={appendActivity} />
          </aside>
        </div>
      </main>
    </div>
  );
}
