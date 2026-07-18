"use client";

import { useEffect, useMemo, useState } from "react";
import { randomId, eur2 } from "./util";
import { useToast } from "./Toast";
import type { Quote, Payment, PaymentKind } from "@/lib/orcamento/types";
// `import type` é apagado no build, por isso puxar a forma da fatura do store
// server-only não arrasta o guarda `server-only` para este bundle de cliente.
import type { Invoice } from "@/lib/invoices-store";
import {
  computeEventMetrics,
  reconcileFinance,
  type DossierData,
  type DossierInvoice,
} from "@/lib/orcamento/dossier";

const KIND_LABEL: Record<PaymentKind, string> = {
  sinal: "Sinal",
  pagamento: "Pagamento",
  saldo: "Saldo final",
};

// Rótulos do livro de faturas (FT) — espelham a Zona Financeira do Dossier.
const INV_KIND_LABEL: Record<DossierInvoice["kind"], string> = {
  sinal: "Sinal (30%)",
  saldo: "Saldo (70%)",
  total: "Total",
};
const INV_STATUS_META: Record<DossierInvoice["status"], { label: string; color: string }> = {
  emitida: { label: "Emitida", color: "#9aa36a" },
  paga: { label: "Paga", color: "#4d6350" },
  anulada: { label: "Anulada", color: "#b5654a" },
};

const fmtInvDate = (d?: string) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : "—";

interface Props {
  quote: Quote;
  onChange: (payments: Payment[]) => void;
  /**
   * Mostra o livro de faturas (FT) + banner de reconciliação e faz o headline
   * Recebido/Em falta derivar do livro (a verdade). Opt-in: o Dossier já rende a
   * sua própria Zona Financeira, por isso deixa isto por omissão (`false`) para
   * não duplicar. O painel Financeiro do back office liga-o.
   */
  showLedger?: boolean;
}

export default function PaymentsPanel({ quote, onChange, showLedger = false }: Props) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>(quote.payments ?? []);
  const [kind, setKind] = useState<PaymentKind>("sinal");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState<string | null>(null);
  const [contractRef, setContractRef] = useState(quote.contractRef ?? "");
  const [savingRef, setSavingRef] = useState(false);

  // ── Livro de faturas (FT) do evento — a fonte de verdade financeira ──
  // Cliente não pode importar o store server-only; lê pela API, como Faturas.tsx.
  const [invoices, setInvoices] = useState<DossierInvoice[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(showLedger);

  useEffect(() => {
    if (!showLedger || !quote.id) return;
    let alive = true;
    setLedgerLoading(true);
    (async () => {
      try {
        const res = await fetch(`/api/faturas?quoteId=${encodeURIComponent(quote.id)}`, {
          cache: "no-store",
        });
        if (res.ok && alive) {
          const list: Invoice[] = await res.json();
          // Invoice é um superconjunto de DossierInvoice — mapeamos os campos que
          // as funções puras do Dossier consomem.
          setInvoices(
            list.map((i) => ({
              id: i.id,
              number: i.number,
              kind: i.kind,
              amount: i.amount,
              status: i.status,
              issuedAt: i.issuedAt,
              dueAt: i.dueAt,
              paidAt: i.paidAt,
            })),
          );
        }
      } catch {
        // Silencioso — o resumo informal continua a funcionar sem o livro.
      } finally {
        if (alive) setLedgerLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [showLedger, quote.id]);

  // Dossier "sintético" só com o que as funções puras precisam (quote + faturas);
  // usa os pagamentos *vivos* (state) para o banner reagir aos toggles.
  const dossier: DossierData = useMemo(
    () => ({ quote: { ...quote, payments }, proposal: null, contract: null, invoices }),
    [quote, payments, invoices],
  );
  const metrics = useMemo(() => computeEventMetrics(dossier), [dossier]);
  const reconciliation = useMemo(() => reconcileFinance(dossier), [dossier]);

  async function saveContractRef() {
    if (contractRef.trim() === (quote.contractRef ?? "")) return;
    setSavingRef(true);
    try {
      await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractRef: contractRef.trim() || undefined }),
      });
    } finally {
      setSavingRef(false);
    }
  }

  const total = metrics.contracted; // proposta > preço cotado > estimativa
  // Recebido informal (quote.payments) — passa a ser uma nota secundária.
  const informalPaid = reconciliation.informalPaid;
  // Headline: quando o livro está visível, Recebido/Em falta derivam DELE (a
  // verdade); caso contrário mantém-se o comportamento informal anterior.
  const headlinePaid = showLedger ? metrics.ledgerPaid : informalPaid;
  const outstanding = Math.max(0, total - headlinePaid);

  function persist(next: Payment[]) {
    setPayments(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payments: next }),
    });
  }

  function add() {
    const a = parseFloat(amount);
    if (!a || a <= 0) return;
    persist([...payments, { id: randomId(), kind, amount: a, date, paid: false }]);
    setAmount("");
  }
  function togglePaid(id: string) {
    persist(payments.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));
  }
  function remove(id: string) {
    persist(payments.filter((p) => p.id !== id));
  }

  async function invoice(p: Payment, email: boolean) {
    setBusy(p.id);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/fatura`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // `paymentId` é a chave de idempotência do livro de faturas: descarregar
        // e depois enviar o mesmo pagamento reaproveita o mesmo número (FT AAAA/NNNN).
        body: JSON.stringify({
          paymentId: p.id,
          kind: p.kind,
          amount: p.amount,
          date: p.date,
          paid: p.paid,
          email,
        }),
      });
      const data = await res.json();
      if (data.pdfBase64 && !email) {
        const a = document.createElement("a");
        a.href = `data:application/pdf;base64,${data.pdfBase64}`;
        a.download = `Recibo-${data.number.replace(/\//g, "-")}.pdf`;
        a.click();
      }
      if (email) {
        toast(
          data.emailed
            ? `Recibo enviado para ${quote.email}`
            : "Recibo gerado (e-mail não configurado)",
          data.emailed ? "success" : "info",
        );
      } else {
        toast("Recibo descarregado", "success");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="bo-eyebrow">Pagamentos &amp; Faturação</p>
        {/* Contract reference */}
        <div className="flex items-center gap-2">
          <span className="text-foreground/25 text-[10px] tracking-[0.15em] uppercase">Ref.</span>
          <input
            value={contractRef}
            onChange={(e) => setContractRef(e.target.value)}
            onBlur={saveContractRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveContractRef();
            }}
            placeholder="2026-001"
            className={`bo-input w-24 px-2 py-1 text-xs text-foreground/65 ${savingRef ? "opacity-50" : ""}`}
            title="Número de referência do contrato/fatura"
          />
        </div>
      </div>

      {/* Summary — Recebido/Em falta vêm do livro de faturas quando visível. */}
      <div className="grid grid-cols-3 gap-2 mb-1.5">
        {[
          { l: "Total", v: eur2(total), c: "text-foreground/70" },
          { l: "Recebido", v: eur2(headlinePaid), c: "text-[#4d6350]" },
          {
            l: "Em falta",
            v: eur2(outstanding),
            c: outstanding > 0 ? "text-[#b5654a]" : "text-foreground/40",
          },
        ].map((k) => (
          <div key={k.l} className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
            <p className={`text-sm font-semibold ${k.c}`}>{k.v}</p>
            <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">{k.l}</p>
          </div>
        ))}
      </div>
      {showLedger && (
        <p className="text-foreground/30 text-[10px] mb-4">
          Recebido e Em falta com base no livro de faturas (FT).
        </p>
      )}
      {!showLedger && <div className="mb-4" />}

      {/* Banner de reconciliação — pagamentos informais ≠ faturas pagas. */}
      {showLedger && reconciliation.diverges && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-[#c99a3a]/40 bg-[#c99a3a]/[0.08] px-3.5 py-2.5 mb-4"
        >
          <svg
            className="text-[#a9781f] shrink-0 mt-0.5"
            width="15"
            height="15"
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
            <p className="text-[#a9781f] text-xs font-medium leading-snug">
              Registo informal ({eur2(reconciliation.informalPaid)}) não bate com faturas pagas (
              {eur2(reconciliation.ledgerPaid)}).
            </p>
            <p className="text-foreground/45 text-[11px] mt-0.5">
              O livro de faturas é a fonte de verdade — confirme no separador Faturas ou no livro
              abaixo.
            </p>
          </div>
        </div>
      )}

      {/* Livro de faturas (FT) — leitura, a verdade financeira do evento. */}
      {showLedger && (
        <div className="mb-4">
          <p className="text-foreground/35 text-[10px] tracking-[0.2em] uppercase mb-2">
            Faturas emitidas (livro)
          </p>
          {ledgerLoading ? (
            <p className="text-foreground/30 text-xs bg-foreground/[0.03] rounded-lg px-3 py-4 text-center">
              A carregar faturas…
            </p>
          ) : invoices.length === 0 ? (
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
                    <th className="font-medium py-1.5 pr-3">Venc.</th>
                    <th className="font-medium py-1.5 pr-3">Pago</th>
                    <th className="font-medium py-1.5">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((i) => (
                    <tr
                      key={i.id}
                      className={`border-t border-foreground/[0.06] ${i.status === "anulada" ? "opacity-55" : ""}`}
                    >
                      <td className="py-2 pr-3 text-foreground/55 tabular-nums whitespace-nowrap">
                        {i.number}
                      </td>
                      <td className="py-2 pr-3 text-foreground/50">{INV_KIND_LABEL[i.kind]}</td>
                      <td className="py-2 pr-3 text-foreground/70 tabular-nums text-right whitespace-nowrap">
                        {eur2(i.amount)}
                      </td>
                      <td className="py-2 pr-3 text-foreground/45 tabular-nums whitespace-nowrap">
                        {fmtInvDate(i.issuedAt)}
                      </td>
                      <td className="py-2 pr-3 text-foreground/45 tabular-nums whitespace-nowrap">
                        {fmtInvDate(i.dueAt)}
                      </td>
                      <td className="py-2 pr-3 text-foreground/45 tabular-nums whitespace-nowrap">
                        {fmtInvDate(i.paidAt)}
                      </td>
                      <td className="py-2 whitespace-nowrap">
                        <span
                          className="text-[9px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md"
                          style={{
                            background: `${INV_STATUS_META[i.status].color}18`,
                            color: INV_STATUS_META[i.status].color,
                          }}
                        >
                          {INV_STATUS_META[i.status].label}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Registo informal de pagamentos (tracker) — não é a verdade fiscal. */}
      {showLedger && (
        <p className="text-foreground/35 text-[10px] tracking-[0.2em] uppercase mb-2">
          Registo informal · {eur2(informalPaid)} recebido
        </p>
      )}

      {/* List */}
      {payments.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-4">
          {payments.map((p) => (
            <div
              key={p.id}
              className="group flex items-center gap-2.5 bg-foreground/[0.02] border border-foreground/[0.07] rounded-lg px-3 py-2"
            >
              <button
                onClick={() => togglePaid(p.id)}
                role="checkbox"
                aria-checked={p.paid}
                aria-label={`${KIND_LABEL[p.kind]} ${eur2(p.amount)} — ${p.paid ? "pago" : "por pagar"}`}
                className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${p.paid ? "bg-[#4d6350] border-[#4d6350]" : "border-foreground/25 hover:border-[#4d6350]/60"}`}
                title={p.paid ? "Pago" : "Marcar como pago"}
              >
                {p.paid && (
                  <svg width="9" height="9" viewBox="0 0 12 12" fill="none">
                    <path
                      d="M2 6l2.5 2.5L10 3"
                      stroke="white"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-foreground/65 text-xs">
                  {KIND_LABEL[p.kind]} ·{" "}
                  <span className="text-foreground/40">
                    {new Date(p.date + "T12:00:00").toLocaleDateString("pt-PT")}
                  </span>
                </p>
              </div>
              <span
                className={`text-xs font-semibold shrink-0 ${p.paid ? "text-[#4d6350]" : "text-foreground/50"}`}
              >
                {eur2(p.amount)}
              </span>
              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => invoice(p, false)}
                  disabled={busy === p.id}
                  aria-label="Descarregar recibo PDF"
                  title="Descarregar recibo PDF"
                  className="text-foreground/30 hover:text-[#4d6350] transition-colors p-1"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path
                      d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </button>
                <button
                  onClick={() => invoice(p, true)}
                  disabled={busy === p.id}
                  aria-label="Enviar recibo por e-mail"
                  title="Enviar recibo por e-mail"
                  className="text-foreground/30 hover:text-[#4d6350] transition-colors p-1"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                  >
                    <path d="M3 7l9 6 9-6" />
                    <rect x="3" y="5" width="18" height="14" rx="2" />
                  </svg>
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all p-1"
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add */}
      <div className="flex flex-wrap gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as PaymentKind)}
          className="bo-input px-2 py-1.5 text-xs text-foreground/55"
        >
          <option value="sinal">Sinal</option>
          <option value="pagamento">Pagamento</option>
          <option value="saldo">Saldo final</option>
        </select>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Valor €"
          className="bo-input w-24 px-2 py-1.5 text-xs text-foreground/70"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bo-input px-2 py-1.5 text-xs text-foreground/55"
        />
        <button
          onClick={add}
          className="px-3 py-1.5 rounded-lg bg-[#1b2119] text-white/90 text-xs hover:bg-[#2a3227] transition-colors"
        >
          + Registar
        </button>
      </div>
    </div>
  );
}
