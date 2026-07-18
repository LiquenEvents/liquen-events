"use client";

import type { Quote } from "@/lib/orcamento/types";
import { eur } from "@/lib/money";
import type { DossierInvoice, FinanceReconciliation } from "@/lib/orcamento/dossier";
import { PaymentsPanel, EventCosts } from "../../lazy";

/** yyyy-mm-dd → "12/09/26"; "—" se ausente. */
function shortDate(v?: string): string {
  if (!v) return "—";
  const dt = new Date(v.length <= 10 ? `${v}T12:00:00` : v);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const KIND_LABEL: Record<DossierInvoice["kind"], string> = {
  sinal: "Sinal (30%)",
  saldo: "Saldo (70%)",
  total: "Total",
};
const STATUS_LABEL: Record<DossierInvoice["status"], string> = {
  emitida: "Emitida",
  paga: "Paga",
  anulada: "Anulada",
};
const STATUS_TONE: Record<DossierInvoice["status"], string> = {
  emitida: "bg-gold/15 text-gold-text",
  paga: "bg-[#4d6350]/15 text-[#4d6350]",
  anulada: "bg-foreground/8 text-foreground/35 line-through",
};

/**
 * Zona Financeira — pagamentos e custos (ferramentas reutilizadas) mais o livro
 * de faturas (FT) como pequena tabela. O livro — e não `quote.payments` — é a
 * verdade para % Pago / Recebido: quando os dois divergem, mostramos um aviso
 * âmbar de reconciliação (regra da verdade financeira).
 */
interface Props {
  quote: Quote;
  invoices: DossierInvoice[];
  reconciliation: FinanceReconciliation;
  onQuoteChange: (patch: Partial<Quote>) => void;
}

export default function FinanceZone({ quote, invoices, reconciliation, onQuoteChange }: Props) {
  return (
    <section id="zone-financeiro" className="bo-card p-5 sm:p-6 scroll-mt-40 flex flex-col gap-6">
      <p className="bo-eyebrow">Financeiro</p>

      {/* Aviso de reconciliação — pagamentos registados ≠ faturas emitidas. */}
      {reconciliation.diverges && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-gold/40 bg-gold/[0.08] px-4 py-3"
        >
          <svg
            className="text-gold-text shrink-0 mt-0.5"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <div className="min-w-0">
            <p className="text-gold-text text-xs font-medium leading-snug">
              Pagamentos registados ({eur(reconciliation.informalPaid)}) não batem com faturas
              emitidas ({eur(reconciliation.ledgerPaid)}).
            </p>
            <p className="text-foreground/45 text-[11px] mt-0.5">
              O livro de faturas é a fonte de verdade — confirme as faturas na secção Faturas.
            </p>
          </div>
        </div>
      )}

      {/* Livro de faturas (FT) */}
      <div>
        <p className="text-foreground/35 text-[10px] tracking-[0.2em] uppercase mb-2">
          Livro de faturas
        </p>
        {invoices.length === 0 ? (
          <p className="text-foreground/35 text-xs bg-foreground/[0.03] rounded-lg px-3 py-4 text-center">
            Sem faturas emitidas para este evento.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-foreground/30 text-[9px] tracking-[0.12em] uppercase text-left">
                  <th className="font-medium py-1.5 pr-3">Nº</th>
                  <th className="font-medium py-1.5 pr-3">Tipo</th>
                  <th className="font-medium py-1.5 pr-3 text-right">Valor c/ IVA</th>
                  <th className="font-medium py-1.5 pr-3">Emissão</th>
                  <th className="font-medium py-1.5 pr-3">Pago</th>
                  <th className="font-medium py-1.5">Estado</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-foreground/[0.06]">
                    <td className="py-2 pr-3 text-foreground/55 tabular-nums whitespace-nowrap">
                      {i.number}
                    </td>
                    <td className="py-2 pr-3 text-foreground/50">{KIND_LABEL[i.kind]}</td>
                    <td className="py-2 pr-3 text-foreground/70 tabular-nums text-right whitespace-nowrap">
                      {eur(i.amount)}
                    </td>
                    <td className="py-2 pr-3 text-foreground/45 tabular-nums whitespace-nowrap">
                      {shortDate(i.issuedAt)}
                    </td>
                    <td className="py-2 pr-3 text-foreground/45 tabular-nums whitespace-nowrap">
                      {shortDate(i.paidAt)}
                    </td>
                    <td className="py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-sm text-[9px] tracking-[0.1em] uppercase ${STATUS_TONE[i.status]}`}
                      >
                        {STATUS_LABEL[i.status]}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Pagamentos (faseamento 30/70) */}
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
