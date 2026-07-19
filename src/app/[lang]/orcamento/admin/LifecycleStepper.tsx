/**
 * LifecycleStepper — mostra, de forma compacta e horizontal, em que ponto do
 * ciclo de vida está o pedido selecionado: Pedido → Proposta → Contrato →
 * Fatura → Evento.
 *
 * É uma vista SIMPLIFICADA (5 fases) do modelo de 7 fases do Dossier
 * (`EventStage` em `@/lib/orcamento/dossier`). Mantém o vocabulário coerente:
 * cada fase grossa agrupa uma ou mais fases finas do Dossier —
 *   proposta_enviada → Proposta, aceite → Contrato,
 *   sinal_pago/em_producao → Fatura, semana_evento/concluido → Evento.
 *
 * Client-safe: só depende de tipos e de `countdownDays` (função pura). Nunca
 * importa nenhum `*-store.ts` nem `server-only`.
 */
import type { Quote } from "@/lib/orcamento/types";
import { countdownDays } from "@/lib/orcamento/dossier";

type StageId = "pedido" | "proposta" | "contrato" | "fatura" | "evento";
type StageState = "feito" | "atual" | "por_fazer";

const STEPS: { id: StageId; label: string }[] = [
  { id: "pedido", label: "Pedido" },
  { id: "proposta", label: "Proposta" },
  { id: "contrato", label: "Contrato" },
  { id: "fatura", label: "Fatura" },
  { id: "evento", label: "Evento" },
];

const STATE_HINT: Record<StageState, string> = {
  feito: "concluído",
  atual: "fase atual",
  por_fazer: "por fazer",
};

/**
 * Deriva, a partir apenas do Quote (os dados que o back office tem à mão),
 * qual a fase atual do pedido e se o ciclo já foi todo cumprido.
 *
 * Espelha a lógica de `deriveStage`, mas com os sinais disponíveis no Quote:
 *   - proposta enviada → status "cotado"/"aceite" ou registo "proposal_sent"
 *   - contrato aceite  → status "aceite" ou referência de contrato preenchida
 *   - fatura           → existe pelo menos um pagamento/sinal registado
 *   - evento           → data do evento na próxima semana (atual) ou já passada
 *                        (todas as fases concluídas)
 *   - perdido          → status "rejeitado" (estado terminal lateral)
 */
export function deriveRequestLifecycle(
  quote: Quote,
  today: Date = new Date(),
): { perdido: boolean; currentIndex: number; allDone: boolean } {
  if (quote.status === "rejeitado") {
    return { perdido: true, currentIndex: 0, allDone: false };
  }

  const propostaEnviada =
    quote.status === "cotado" ||
    quote.status === "aceite" ||
    (quote.activityLog ?? []).some((a) => a.kind === "proposal_sent");
  const contratoAceite = quote.status === "aceite" || !!quote.contractRef;
  const faturaEmitida = (quote.payments ?? []).some((p) => p.amount > 0);
  const eventPassed = !!quote.date && Date.parse(`${quote.date}T23:59:59`) < today.getTime();
  const cd = countdownDays(quote.date, today);
  const semanaEvento = contratoAceite && cd !== null && cd >= 0 && cd <= 7;

  if (eventPassed) return { perdido: false, currentIndex: 4, allDone: true };
  if (semanaEvento) return { perdido: false, currentIndex: 4, allDone: false };
  if (faturaEmitida) return { perdido: false, currentIndex: 3, allDone: false };
  if (contratoAceite) return { perdido: false, currentIndex: 2, allDone: false };
  if (propostaEnviada) return { perdido: false, currentIndex: 1, allDone: false };
  return { perdido: false, currentIndex: 0, allDone: false };
}

function CheckIcon() {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3.5"
      aria-hidden
    >
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function LifecycleStepper({ quote }: { quote: Quote }) {
  const { perdido, currentIndex, allDone } = deriveRequestLifecycle(quote);

  if (perdido) {
    return (
      <div className="pt-3" aria-label="Fase do pedido">
        <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#b5654a]/12 text-[#b5654a] text-[10px] tracking-[0.12em] uppercase font-medium">
          <span className="w-1.5 h-1.5 rounded-full bg-[#b5654a]" aria-hidden />
          Negócio perdido
        </span>
      </div>
    );
  }

  return (
    <ol
      aria-label="Fase do pedido"
      className="flex items-stretch gap-0 overflow-x-auto pt-3 pb-1 -mx-1 px-1"
    >
      {STEPS.map((step, i, arr) => {
        const state: StageState = allDone
          ? "feito"
          : i < currentIndex
            ? "feito"
            : i === currentIndex
              ? "atual"
              : "por_fazer";
        return (
          <li key={step.id} className="flex items-center shrink-0">
            <div
              aria-current={state === "atual" ? "step" : undefined}
              className="flex flex-col items-center gap-1 px-2"
              title={`${step.label} · ${STATE_HINT[state]}`}
            >
              <span
                className={`flex items-center justify-center w-4 h-4 rounded-full border transition-colors text-white ${
                  state === "atual"
                    ? "bg-[#4d6350] border-[#4d6350] ring-4 ring-[#4d6350]/15"
                    : state === "feito"
                      ? "bg-[#4d6350] border-[#4d6350]"
                      : "bg-transparent border-foreground/25"
                }`}
              >
                {state === "feito" ? (
                  <CheckIcon />
                ) : state === "atual" ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-white" aria-hidden />
                ) : null}
              </span>
              <span
                className={`text-[9px] tracking-[0.08em] uppercase whitespace-nowrap transition-colors ${
                  state === "atual"
                    ? "text-foreground/80 font-semibold"
                    : state === "feito"
                      ? "text-foreground/55"
                      : "text-foreground/30"
                }`}
              >
                {step.label}
              </span>
              {/* Estado textual (não só cor) para leitores de ecrã. */}
              <span className="sr-only">{STATE_HINT[state]}</span>
            </div>
            {i < arr.length - 1 && (
              <span
                aria-hidden
                className={`w-6 sm:w-10 h-px mt-[-14px] ${
                  i < currentIndex ? "bg-[#4d6350]/50" : "bg-foreground/15"
                }`}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
