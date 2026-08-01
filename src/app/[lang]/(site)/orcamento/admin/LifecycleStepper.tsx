/**
 * LifecycleStepper — mostra, de forma compacta e horizontal, em que ponto do
 * ciclo de vida está o pedido selecionado: Pedido → Proposta → Contrato →
 * Fatura → Evento.
 *
 * É uma vista SIMPLIFICADA (5 passos) do modelo de 7 fases do Dossier
 * (`EventStage` em `@/lib/orcamento/dossier`). Mantém o vocabulário coerente:
 * cada passo grosso agrupa uma ou mais fases finas do Dossier —
 *   proposta_enviada → Proposta, aceite → Contrato,
 *   sinal_pago/em_producao → Fatura, semana_evento/concluido → Evento.
 *
 * Client-safe: só depende de tipos e de funções puras do Dossier. Nunca importa
 * nenhum `*-store.ts` nem `server-only`.
 */
import type { Quote } from "@/lib/orcamento/types";
import { deriveStage, type DossierInvoice, type EventStage } from "@/lib/orcamento/dossier";

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

/** Em que passo grosso do stepper cai cada fase fina do Dossier. */
const STAGE_STEP: Record<Exclude<EventStage, "perdido">, number> = {
  lead: 0,
  proposta_enviada: 1,
  aceite: 2,
  sinal_pago: 3,
  em_producao: 3,
  semana_evento: 4,
  concluido: 4,
};

/**
 * Em que passo do ciclo está o pedido e se o ciclo já foi todo cumprido.
 *
 * É uma PROJEÇÃO de `deriveStage` (o Dossier), não uma segunda derivação. Tinha
 * a sua própria, e as duas discordavam no sítio que mais custa dinheiro: aqui,
 * `if (eventPassed) return { allDone: true }` pintava os cinco passos de verde
 * assim que a data do casamento ficava para trás — sem olhar para um cêntimo.
 * O Dossier só chega a `concluido` com o evento passado E o saldo liquidado (do
 * livro de faturas ou do registo à mão, ver `combinedPaidTotal`); é ele que está
 * certo. O estúdio corria a lista, via tudo verde e um "Rever produção do
 * evento" em casamentos com o saldo por receber.
 *
 * `invoices` é opcional porque a lista do back office só tem o Quote à mão. Sem
 * o livro de faturas, um casamento pago APENAS por faturas (sem nenhuma linha em
 * `quote.payments`) aparece aquém da sua fase — erra a favor de "ainda há
 * trabalho", nunca a favor de "está tratado". O Dossier do evento, esse, recebe
 * as faturas e fecha a conta.
 */
export function deriveRequestLifecycle(
  quote: Quote,
  today: Date = new Date(),
  invoices: DossierInvoice[] = [],
): { perdido: boolean; currentIndex: number; allDone: boolean } {
  const stage = deriveStage({ quote, proposal: null, contract: null, invoices }, today);
  if (stage === "perdido") return { perdido: true, currentIndex: 0, allDone: false };
  return { perdido: false, currentIndex: STAGE_STEP[stage], allDone: stage === "concluido" };
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

export default function LifecycleStepper({
  quote,
  invoices,
}: {
  quote: Quote;
  invoices?: DossierInvoice[];
}) {
  const { perdido, currentIndex, allDone } = deriveRequestLifecycle(quote, new Date(), invoices);

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
