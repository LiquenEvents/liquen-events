"use client";

import type { Quote } from "@/lib/orcamento/types";
import { PaymentsPanel, EventCosts } from "../../lazy";

/**
 * Zona Financeira — pagamentos e custos do evento (ferramentas reutilizadas).
 *
 * Teve aqui, durante muito tempo, o livro de faturas (FT) como pequena tabela e
 * um aviso âmbar de reconciliação por cima dela: o livro era a verdade para
 * «% Pago / Recebido» e o aviso acendia-se quando os pagamentos registados não
 * batiam com as faturas dadas por pagas.
 *
 * A casa deixou de facturar aqui — factura noutro sítio — e as duas coisas
 * saíram juntas, porque uma não vive sem a outra: sem livro não há segunda
 * contagem para confrontar, e um aviso que compara o dinheiro recebido com um
 * zero fixo estaria aceso em todos os eventos pagos (ver a nota extensa em
 * `@/lib/orcamento/dossier`).
 *
 * O que fica é o que ela alimenta e sempre alimentou: quem pagou o quê e
 * quando, e o que isso custou.
 */
interface Props {
  quote: Quote;
  onQuoteChange: (patch: Partial<Quote>) => void;
}

export default function FinanceZone({ quote, onQuoteChange }: Props) {
  return (
    <section id="zone-financeiro" className="bo-card p-5 sm:p-6 scroll-mt-40 flex flex-col gap-6">
      <p className="bo-eyebrow">Financeiro</p>

      {/* Pagamentos (faseamento sinal/saldo da proposta) */}
      <PaymentsPanel
        key={`pay-${quote.id}`}
        quote={quote}
        onChange={(payments) => onQuoteChange({ payments })}
      />

      {/* Fornecedores contratados + orçamentado vs real */}
      <EventCosts
        key={`costs-${quote.id}`}
        quote={quote}
        onChange={(eventSuppliers) => onQuoteChange({ eventSuppliers })}
      />
    </section>
  );
}
