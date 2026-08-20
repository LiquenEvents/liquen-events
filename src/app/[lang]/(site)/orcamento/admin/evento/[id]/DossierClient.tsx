"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n";
import type { Quote, ActivityEntry } from "@/lib/orcamento/types";
import {
  deriveStage,
  computeEventMetrics,
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
 * Nenhuma importação de store server-only atravessa esta fronteira: proposta e
 * contrato chegam já reduzidos a dados serializáveis em `data`; o link do
 * portal chega cunhado em `portalUrl`.
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

  // Estado vivo: a proposta/contrato não mudam por estas ferramentas (só a
  // `quote`), por isso reconstruímos o DossierData com a quote atual.
  const live: DossierData = useMemo(() => ({ ...data, quote }), [data, quote]);

  const stage = useMemo(() => deriveStage(live), [live]);
  const metrics = useMemo(() => computeEventMetrics(live), [live]);
  const next = useMemo(() => nextAction(stage, live), [stage, live]);

  // Espelho otimista — as ferramentas já persistiram; aqui só atualizamos o
  // estado local para tudo o que deriva da quote recalcular.
  const onQuoteChange = useCallback((patch: Partial<Quote>) => {
    setQuote((prev) => ({ ...prev, ...patch }));
  }, []);

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * ACRESCENTAR AO REGISTO, E NÃO REESCREVÊ-LO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Isto gravava o registo INTEIRO — o que estava neste ecrã mais a linha nova.
   * E esta página é desenhada no servidor: o `quote` que ela tem é o retrato do
   * momento em que foi aberta, e nunca revalida.
   *
   * O resultado: abre-se o dossier de manhã, deixa-se o separador aberto, e ao
   * fim da tarde regista-se uma chamada. O que se grava é o registo DE MANHÃ
   * mais essa linha — e tudo o que qualquer outra ferramenta escreveu pelo meio
   * (a proposta que seguiu, as mudanças de estado, os pagamentos) desaparece.
   * Sem erro nenhum, e só se dá por isso muito depois.
   *
   * O servidor já tinha o caminho seguro — `activityLogAppend`, que junta ao
   * registo FRESCO — e a gaveta do back office já o usava, com o comentário a
   * explicar porquê. Este ecrã e o Quadro eram os dois que faltavam.
   *
   * ── E UMA RECUSA NÃO PODE PASSAR POR REGISTADA ────────────────────────────
   *
   * O `catch` estava vazio e o `if (res.ok)` não tinha o outro ramo: a linha
   * ficava no ecrã, o formulário do registo fechava-se e limpava-se, e nada
   * dizia que aquilo não existia em lado nenhum. Uma sessão que expira a meio
   * da manhã — 401, o caso de todos os dias — dava exactamente a imagem de uma
   * chamada registada, e só ao recarregar a página, muito depois, é que ela
   * desaparecia.
   *
   * O que fica: a linha continua à vista (é o único sítio de onde o texto se
   * pode voltar a copiar, porque o formulário já se fechou), com um aviso que a
   * NOMEIA e um gesto para voltar a tentar. É a mesma regra do resto da casa —
   * «guardado» é uma palavra que só o servidor autoriza.
   */
  const [recusadas, setRecusadas] = useState<ActivityEntry[]>([]);
  const [aTentar, setATentar] = useState(false);

  const gravarEntradas = useCallback(
    async (entries: ActivityEntry[]): Promise<boolean> => {
      try {
        const res = await fetch(`/api/orcamento/${quote.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ activityLogAppend: entries }),
        });
        // Um 401 responde com um objecto de erro, não com o pedido: aceitá-lo
        // aqui era pôr `{ error: … }` no lugar da quote e levar o ecrã atrás.
        if (!res.ok) return false;
        const updated: Quote = await res.json();
        setQuote(updated);
        return true;
      } catch {
        return false;
      }
    },
    [quote.id],
  );

  const appendActivity = useCallback(
    async (entry: ActivityEntry) => {
      setQuote((prev) => ({ ...prev, activityLog: [...(prev.activityLog ?? []), entry] }));
      if (!(await gravarEntradas([entry]))) setRecusadas((prev) => [...prev, entry]);
    },
    [gravarEntradas],
  );

  const tentarGravarDeNovo = useCallback(async () => {
    if (recusadas.length === 0 || aTentar) return;
    setATentar(true);
    try {
      // Todas de uma vez: a rota junta o que lhe mandarem ao registo FRESCO, e
      // uma por uma seriam várias leituras do mesmo registo a competir.
      if (await gravarEntradas(recusadas)) setRecusadas([]);
    } finally {
      setATentar(false);
    }
  }, [recusadas, aTentar, gravarEntradas]);

  const scrollTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  }, []);

  return (
    <div className="-mt-24 min-h-screen bg-surface flex flex-col">
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
        {recusadas.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-[#b5654a]/40 bg-[#b5654a]/[0.07] px-4 py-3"
          >
            <p className="text-[#8a4632] text-xs font-medium leading-snug">
              {recusadas.length === 1
                ? "Esta entrada do registo não ficou guardada no servidor:"
                : `Estas ${recusadas.length} entradas do registo não ficaram guardadas no servidor:`}
            </p>
            <ul className="mt-1.5 flex flex-col gap-1">
              {recusadas.map((e) => (
                <li key={e.id} className="text-foreground/60 text-[11px] leading-snug">
                  «{e.summary}»
                </li>
              ))}
            </ul>
            <p className="text-foreground/45 text-[11px] mt-1.5">
              Estão só neste ecrã e desaparecem se recarregares a página. Se a sessão tiver
              expirado, volta a entrar antes de tentar.
            </p>
            <button
              type="button"
              onClick={tentarGravarDeNovo}
              disabled={aTentar}
              className="alvo-toque mt-2.5 rounded-lg border border-[#b5654a]/40 px-3 py-1.5 text-[11px] font-medium text-[#8a4632] transition-colors hover:bg-[#b5654a]/10 disabled:opacity-45"
            >
              {aTentar ? "A tentar…" : "Tentar de novo"}
            </button>
          </div>
        )}

        <MetricStrip metrics={metrics} />

        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_20rem] gap-6 items-start">
          {/* Coluna principal */}
          <div className="flex flex-col gap-6 min-w-0">
            <FinanceZone quote={quote} onQuoteChange={onQuoteChange} />
            <ProductionZone
              quote={quote}
              userName={userName}
              onQuoteChange={onQuoteChange}
              doc={data.proposal?.doc ?? null}
            />
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
