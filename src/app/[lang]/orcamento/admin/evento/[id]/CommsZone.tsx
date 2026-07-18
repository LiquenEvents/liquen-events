"use client";

import type { Quote, QuoteMessage, ActivityEntry } from "@/lib/orcamento/types";
import { randomId } from "../../util";
import { ProposalStudio, ClientMessenger } from "../../lazy";

/**
 * Zona de Comunicação — Proposal Studio (desenhar/enviar a proposta) e o
 * mensageiro do cliente. Cada ferramenta trata do seu envio/PATCH; aqui só
 * espelhamos o estado (status → cotado, mensagens) e registamos a atividade,
 * exatamente como o drawer.
 */
interface Props {
  quote: Quote;
  userName: string;
  onQuoteChange: (patch: Partial<Quote>) => void;
  onAddEntry: (entry: ActivityEntry) => Promise<void>;
}

export default function CommsZone({ quote, userName, onQuoteChange, onAddEntry }: Props) {
  return (
    <section id="zone-comunicacao" className="bo-card p-5 sm:p-6 scroll-mt-40 flex flex-col gap-6">
      <p className="bo-eyebrow">Comunicação</p>

      <ProposalStudio
        key={`studio-${quote.id}`}
        quote={quote}
        onSent={() => {
          onQuoteChange({ status: "cotado" });
          onAddEntry({
            id: randomId(),
            at: new Date().toISOString(),
            kind: "proposal_sent",
            actor: userName,
            summary: "Proposta enviada ao cliente (Studio)",
          });
        }}
      />

      <ClientMessenger
        key={`msg-${quote.id}`}
        quote={quote}
        onSent={(messages: QuoteMessage[]) => {
          const prevCount = quote.messages?.length ?? 0;
          onQuoteChange({ messages });
          if (messages.length > prevCount) {
            onAddEntry({
              id: randomId(),
              at: new Date().toISOString(),
              kind: "message_sent",
              actor: userName,
              summary: "Mensagem enviada ao cliente",
            });
          }
        }}
      />
    </section>
  );
}
