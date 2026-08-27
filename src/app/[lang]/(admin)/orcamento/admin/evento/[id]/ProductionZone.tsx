"use client";

import type { Quote } from "@/lib/orcamento/types";
import type { ProposalDoc } from "@/lib/proposal-doc";
import EscolhasDoCasal from "../../EscolhasDoCasal";
import { EventTasks, EventChecklist, ProductionPlan, EventTimeline, GuestList } from "../../lazy";

/**
 * Zona de Produção — compõe as ferramentas existentes tal como o drawer:
 * tarefas, checklist do evento, plano de produção (atelier), cronograma do dia
 * e lista de convidados. Cada ferramenta faz o seu próprio PATCH; o callback só
 * espelha o estado local para as métricas/stepper recalcularem ao vivo.
 */
interface Props {
  quote: Quote;
  userName: string;
  onQuoteChange: (patch: Partial<Quote>) => void;
  /**
   * O documento da proposta que o casal tem à frente — é ele que traz as
   * PERGUNTAS; o pedido traz as respostas. Ausente numa proposta antiga (ou
   * quando ainda não há proposta nenhuma), e aí não se desenha secção alguma.
   */
  doc?: ProposalDoc | null;
}

/** A moldura desta zona sai abaixo de 640 e fica um risco no lugar dela — a
 *  conta está no cabeçalho do `FinanceZone`, que tem a mesma linha. */
export default function ProductionZone({ quote, userName, onQuoteChange, doc }: Props) {
  return (
    <section
      id="zone-producao"
      className="scroll-mt-40 flex flex-col gap-[var(--bo-gap-vista)] border-t border-[var(--bo-hairline)] pt-[var(--bo-p-cartao)] sm:rounded-[var(--bo-radius-lg)] sm:border sm:bg-[var(--bo-surface)] sm:p-[var(--bo-p-cartao)]"
    >
      <p className="bo-eyebrow">Produção</p>

      {/* Antes das tarefas: o que o casal escolheu decide o que se compra, e
          é a pergunta que ela traz do telefonema quando abre este ecrã. */}
      <EscolhasDoCasal escolhas={doc?.escolhas} respostas={quote.escolhasDoCasal} />

      <EventTasks key={`tasks-${quote.id}`} quote={quote} userName={userName} />

      <EventChecklist
        key={`cl-${quote.id}`}
        quote={quote}
        onChange={(checklist) => onQuoteChange({ checklist })}
      />

      <ProductionPlan
        key={`prod-${quote.id}`}
        quote={quote}
        onChange={(productionPlan) => onQuoteChange({ productionPlan })}
      />

      <EventTimeline
        key={`tl-${quote.id}`}
        quote={quote}
        onChange={(timeline) => onQuoteChange({ timeline })}
      />

      <GuestList
        key={`guests-${quote.id}`}
        quote={quote}
        onChange={(guestList) => onQuoteChange({ guestList })}
      />
    </section>
  );
}
