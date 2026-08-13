"use client";

import type { Quote } from "@/lib/orcamento/types";
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
}

export default function ProductionZone({ quote, userName, onQuoteChange }: Props) {
  return (
    <section id="zone-producao" className="bo-card p-5 sm:p-6 scroll-mt-40 flex flex-col gap-6">
      <p className="bo-eyebrow">Produção</p>

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
