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

/* ── TRÊS MOLDURAS ENCAIXADAS, 96 PX COMIDOS A 375 ─────────────────────────
 *
 * MEDIDO a 375 px, de fora para dentro: o `px-4` do `DossierClient` leva 32, o
 * `bo-card p-5` desta zona leva 40 mais 2 de borda, e o cartão interior de cada
 * ferramenta (`rounded-xl border p-3`) leva outros 24 mais 2. Sobravam 279 px
 * para números de seis algarismos com rótulo por baixo — e «202 889 €» precisa
 * de 109, medido.
 *
 * Abaixo de 640 a moldura desta zona SAI e fica um risco a separá-la da
 * anterior: uma caixa dentro de outra caixa dentro de outra não diz nada que o
 * risco não diga, e devolve ~40 px de largura útil e ~30 px de altura por zona.
 * A partir de 640 volta o cartão inteiro, exactamente como estava.
 *
 * É o mesmo padrão que o `Overview.tsx` já usa nos blocos de números
 * (`:1641` e `:1724`) — moldura no grupo abaixo de 640, grelha sem moldura
 * acima. Diferença só de ESTILO, portanto CSS e não um hook.
 *
 * O enchimento e os intervalos leem a escala do espaço (`--bo-p-cartao`,
 * `--bo-gap-vista`): eram 20/24 fixos dos dois lados dos 640.
 */
export default function FinanceZone({ quote, onQuoteChange }: Props) {
  return (
    <section
      id="zone-financeiro"
      className="scroll-mt-40 flex flex-col gap-[var(--bo-gap-vista)] border-t border-[var(--bo-hairline)] pt-[var(--bo-p-cartao)] sm:rounded-[var(--bo-radius-lg)] sm:border sm:bg-[var(--bo-surface)] sm:p-[var(--bo-p-cartao)]"
    >
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
