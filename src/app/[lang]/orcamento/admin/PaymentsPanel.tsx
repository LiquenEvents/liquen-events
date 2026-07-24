"use client";

import { useEffect, useMemo, useState } from "react";
import { parseMoney, randomId, eur2, todayKey, isDateKey } from "./util";
import { Button } from "./ui";
import { useToast } from "./Toast";
import type { Quote, Payment, PaymentKind } from "@/lib/orcamento/types";
// `import type` é apagado no build, por isso puxar a forma da fatura do store
// server-only não arrasta o guarda `server-only` para este bundle de cliente.
import type { Invoice } from "@/lib/invoices-store";
import { splitThirtySeventy } from "@/lib/money";
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

/** Número → texto do campo "Valor €" em hábito pt-PT ("450,00"). */
const fmtAmountInput = (n: number) => n.toFixed(2).replace(".", ",");

/** Invoice (superconjunto server-only) → DossierInvoice (os campos puros). */
const toDossierInvoices = (list: Invoice[]): DossierInvoice[] =>
  list.map((i) => ({
    id: i.id,
    number: i.number,
    kind: i.kind,
    amount: i.amount,
    status: i.status,
    issuedAt: i.issuedAt,
    dueAt: i.dueAt,
    paidAt: i.paidAt,
  }));

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
  /**
   * Notifica o pai quando o Nº de contrato é gravado, para o estado partilhado
   * (selected/quotes) não ficar velho — o ciclo de vida e o CSV dependem dele.
   */
  onContractRef?: (ref: string) => void;
}

export default function PaymentsPanel({
  quote,
  onChange,
  showLedger = false,
  onContractRef,
}: Props) {
  const { toast } = useToast();
  const [payments, setPayments] = useState<Payment[]>(quote.payments ?? []);
  const [kind, setKind] = useState<PaymentKind>("sinal");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayKey());
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
          setInvoices(toDossierInvoices(list));
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
    const next = contractRef.trim();
    if (next === (quote.contractRef ?? "")) return;
    setSavingRef(true);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // null (não undefined): limpar o campo tem de chegar ao servidor —
        // undefined desaparece no JSON e o valor antigo voltava sozinho.
        body: JSON.stringify({ contractRef: next || null }),
      });
      if (!res.ok) throw new Error();
      onContractRef?.(next);
      toast("Nº de contrato guardado", "success");
    } catch {
      toast("Não foi possível guardar o nº de contrato. Tente novamente.", "error");
    } finally {
      setSavingRef(false);
    }
  }

  // Total COM IVA (o que o cliente paga): a mesma base dos pagamentos/faturas, que
  // são com IVA. Antes usava-se `contracted`, que para um preço manual (quotedPrice,
  // sem IVA) deixava o "Em falta" errado em ~23%.
  const total = metrics.contractedGross; // proposta > preço cotado > estimativa
  const totalNet = metrics.contractedNet;
  const totalIva = metrics.contractedIva;
  // Recebido informal (quote.payments) — passa a ser uma nota secundária.
  const informalPaid = reconciliation.informalPaid;
  // Headline: quando o livro está visível, Recebido/Em falta derivam DELE (a
  // verdade); caso contrário mantém-se o comportamento informal anterior.
  const headlinePaid = showLedger ? metrics.ledgerPaid : informalPaid;
  const outstanding = Math.max(0, total - headlinePaid);
  // Estado "tudo recebido" só faz sentido quando há um total contratado.
  const allReceived = total > 0 && outstanding === 0;
  // Aviso suave: registaram-se recebimentos acima do total contratado.
  const overReceived = total > 0 && headlinePaid > total;
  // Faseamento 30/70 sobre o total com IVA — alimenta os atalhos de registo.
  const split = useMemo(() => splitThirtySeventy(total), [total]);
  const today = todayKey();

  function persist(next: Payment[]) {
    // Otimista com reversão: se o servidor recusar, o dinheiro NÃO pode ficar
    // diferente no ecrã e na base de dados sem ninguém dar por isso.
    const snapshot = payments;
    setPayments(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ payments: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setPayments(snapshot);
        onChange(snapshot);
        toast("Não foi possível guardar o pagamento. Tente novamente.", "error");
      });
  }

  function add() {
    // parseMoney entende "1.500" e "1500,50" — parseFloat lia 1.5 € e falhava.
    const a = parseMoney(amount);
    if (!a || a <= 0) return;
    const trimmedNote = note.trim();
    persist([
      ...payments,
      { id: randomId(), kind, amount: a, date, paid: false, note: trimmedNote || undefined },
    ]);
    setAmount("");
    setNote("");
  }
  function togglePaid(id: string) {
    persist(payments.map((p) => (p.id === id ? { ...p, paid: !p.paid } : p)));
  }
  function remove(id: string) {
    persist(payments.filter((p) => p.id !== id));
  }

  /** Atalho: escolhe o tipo e pré-preenche o valor no formulário de registo. */
  function quickFill(k: PaymentKind, value: number) {
    setKind(k);
    setAmount(fmtAmountInput(value));
  }

  /** Mudar o tipo no select pré-preenche o valor se o campo estiver vazio. */
  function pickKind(k: PaymentKind) {
    setKind(k);
    if (amount.trim() !== "" || total <= 0) return;
    if (k === "sinal") setAmount(fmtAmountInput(split.sinal));
    else if (k === "saldo" && outstanding > 0) setAmount(fmtAmountInput(outstanding));
  }

  /** Recarrega o livro de faturas (após emitir uma fatura/recibo, para a tabela e
   *  o banner de reconciliação não ficarem velhos). */
  async function refreshLedger() {
    if (!showLedger || !quote.id) return;
    try {
      const res = await fetch(`/api/faturas?quoteId=${encodeURIComponent(quote.id)}`, {
        cache: "no-store",
      });
      if (res.ok) setInvoices(toDossierInvoices(await res.json()));
    } catch {
      /* silencioso — o resumo informal continua a funcionar sem o livro */
    }
  }

  async function invoice(p: Payment, email: boolean) {
    // Um documento fiscal só é "Recibo" quando o valor foi recebido; se ainda está
    // por pagar é uma "Fatura". Rotular em conformidade (o back-end já emite o
    // estado certo — emitida vs paga).
    const docLabel = p.paid ? "Recibo" : "Fatura";
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
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        throw new Error(
          data?.error || `Falha ao gerar ${docLabel === "Recibo" ? "o recibo" : "a fatura"}.`,
        );
      }
      if (data.pdfBase64 && !email) {
        const a = document.createElement("a");
        a.href = `data:application/pdf;base64,${data.pdfBase64}`;
        a.download = `${docLabel}-${String(data.number ?? p.id).replace(/\//g, "-")}.pdf`;
        a.click();
      }
      if (email) {
        toast(
          data.emailed
            ? `${docLabel} enviado para ${quote.email}`
            : `${docLabel} gerado (email não configurado)`,
          data.emailed ? "success" : "info",
        );
      } else {
        toast(`${docLabel} descarregado`, "success");
      }
      // O livro de faturas mudou — recarregar para a tabela e a reconciliação
      // refletirem o novo documento sem reabrir o separador.
      await refreshLedger();
    } catch (e) {
      toast(
        e instanceof Error
          ? e.message
          : `Não foi possível gerar ${docLabel === "Recibo" ? "o recibo" : "a fatura"}.`,
        "error",
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="bo-eyebrow">Pagamentos &amp; Faturação</p>
        {/* Contract reference */}
        <div className="flex items-center gap-2">
          <label
            htmlFor="payments-contract-ref"
            className="text-foreground/45 text-[10px] tracking-[0.15em] uppercase"
          >
            Ref.
          </label>
          <input
            id="payments-contract-ref"
            value={contractRef}
            onChange={(e) => setContractRef(e.target.value)}
            onBlur={saveContractRef}
            onKeyDown={(e) => {
              if (e.key === "Enter") saveContractRef();
            }}
            placeholder="2026-001"
            className={`bo-input w-24 px-2.5 py-1.5 text-xs text-foreground/80 ${savingRef ? "opacity-50" : ""}`}
            title="Número de referência do contrato/fatura"
          />
        </div>
      </div>

      {/* ── Resumo — as três respostas que importam, numa linha ──
          Recebido/Em falta vêm do livro de faturas quando visível. "Em falta" é
          o herói quando há dinheiro por receber; quando está tudo recebido vira
          um estado calmo de confirmação. */}
      <div className="grid grid-cols-3 gap-2.5 mb-1.5">
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-center">
          <p className="text-base font-semibold tabular-nums text-foreground/85">{eur2(total)}</p>
          <p className="text-foreground/40 text-[9px] tracking-[0.2em] uppercase mt-1">
            Total (c/ IVA)
          </p>
          <p className="text-foreground/35 text-[9px] tabular-nums mt-1 leading-tight">
            s/ IVA {eur2(totalNet)} · IVA {eur2(totalIva)}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.02] p-3 text-center">
          <p className="text-base font-semibold tabular-nums text-[#4d6350]">
            {eur2(headlinePaid)}
          </p>
          <p className="text-foreground/40 text-[9px] tracking-[0.2em] uppercase mt-1">Recebido</p>
        </div>
        {allReceived ? (
          <div className="rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.05] p-3 text-center flex flex-col items-center justify-center">
            <p className="text-sm font-semibold text-[#4d6350] inline-flex items-center gap-1.5">
              Tudo recebido
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                aria-hidden="true"
              >
                <path d="M4 12.5 9.5 18 20 6.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </p>
            <p className="text-[#4d6350]/60 text-[9px] tracking-[0.2em] uppercase mt-1">Em falta</p>
          </div>
        ) : (
          <div
            className={`rounded-xl border p-3 text-center ${
              outstanding > 0
                ? "border-[#b5654a]/35 bg-[#b5654a]/[0.05]"
                : "border-foreground/[0.06] bg-foreground/[0.02]"
            }`}
          >
            <p
              className={`font-semibold tabular-nums ${
                outstanding > 0 ? "text-lg text-[#b5654a]" : "text-base text-foreground/45"
              }`}
            >
              {eur2(outstanding)}
            </p>
            <p
              className={`text-[9px] tracking-[0.2em] uppercase mt-1 ${
                outstanding > 0 ? "text-[#b5654a]/70" : "text-foreground/40"
              }`}
            >
              Em falta
            </p>
          </div>
        )}
      </div>
      {showLedger ? (
        <p className="text-foreground/30 text-[10px] mb-4">
          Recebido e Em falta com base no livro de faturas (FT).
        </p>
      ) : (
        <div className="mb-4" />
      )}

      {/* Aviso suave: recebido acima do total contratado (mesmo estilo do banner
          de reconciliação — algo para verificar, não um erro bloqueante). */}
      {overReceived && (
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
              Recebido excede o total contratado ({eur2(headlinePaid)} de {eur2(total)}).
            </p>
            <p className="text-foreground/45 text-[11px] mt-0.5">
              Verifique os valores registados ou o total do contrato.
            </p>
          </div>
        </div>
      )}

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

      {/* ── Pagamentos registados (registo interno do dia-a-dia) ── */}
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <p className="text-foreground/45 text-[10px] tracking-[0.2em] uppercase">
          Pagamentos registados
        </p>
        {showLedger && payments.length > 0 && (
          <span className="text-foreground/40 text-[10px] tabular-nums">
            {eur2(informalPaid)} recebido (registo interno)
          </span>
        )}
      </div>

      {/* List */}
      {payments.length === 0 ? (
        <p className="text-foreground/40 text-xs rounded-xl border border-dashed border-foreground/[0.1] bg-foreground/[0.02] px-3.5 py-3.5 text-center mb-3">
          Ainda sem pagamentos — registe o primeiro abaixo.
        </p>
      ) : (
        <div className="flex flex-col gap-1.5 mb-3">
          {payments.map((p) => {
            const overdue = !p.paid && isDateKey(p.date) && p.date < today;
            return (
              <div
                key={p.id}
                className="group flex items-center gap-2.5 bg-foreground/[0.02] border border-foreground/[0.07] rounded-xl px-3.5 py-2.5 motion-safe:transition-colors hover:border-foreground/[0.12]"
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
                  <p className="text-foreground/75 text-xs">
                    {KIND_LABEL[p.kind]} ·{" "}
                    <span className={overdue ? "text-[#b5654a]" : "text-foreground/45"}>
                      {new Date(p.date + "T12:00:00").toLocaleDateString("pt-PT")}
                    </span>
                    {overdue && (
                      <span className="text-[#b5654a] text-[10px] tracking-[0.08em] uppercase">
                        {" "}
                        · em atraso
                      </span>
                    )}
                  </p>
                  {p.note && (
                    <p className="text-foreground/40 text-[10px] truncate" title={p.note}>
                      {p.note}
                    </p>
                  )}
                </div>
                <span
                  className={`text-xs font-semibold shrink-0 tabular-nums ${p.paid ? "text-[#4d6350]" : "text-foreground/55"}`}
                >
                  {eur2(p.amount)}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => invoice(p, false)}
                    disabled={busy === p.id}
                    aria-label={`Descarregar ${p.paid ? "recibo" : "fatura"} PDF`}
                    title={`Descarregar ${p.paid ? "recibo" : "fatura"} PDF`}
                    className="text-foreground/45 hover:text-[#4d6350] transition-colors p-1"
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
                    aria-label={`Enviar ${p.paid ? "recibo" : "fatura"} por e-mail`}
                    title={`Enviar ${p.paid ? "recibo" : "fatura"} por e-mail`}
                    className="text-foreground/45 hover:text-[#4d6350] transition-colors p-1"
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
                    className="text-foreground/45 hover:text-[#b5654a] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-all p-1"
                    aria-label="Remover"
                  >
                    ×
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Atalhos 30/70 — um toque pré-preenche tipo + valor no formulário. */}
      {total > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <span className="text-foreground/35 text-[9px] tracking-[0.15em] uppercase mr-0.5">
            Atalhos
          </span>
          <button
            type="button"
            onClick={() => quickFill("sinal", split.sinal)}
            title="Preencher o formulário com o sinal de 30% do total"
            className="rounded-full border border-foreground/[0.1] bg-foreground/[0.02] px-2.5 py-1 text-[11px] tabular-nums text-foreground/60 hover:border-[#4d6350]/50 hover:text-[#4d6350] motion-safe:transition-colors"
          >
            Sinal 30% · {eur2(split.sinal)}
          </button>
          {outstanding > 0 && (
            <button
              type="button"
              onClick={() => quickFill("saldo", outstanding)}
              title="Preencher o formulário com o valor em falta"
              className="rounded-full border border-foreground/[0.1] bg-foreground/[0.02] px-2.5 py-1 text-[11px] tabular-nums text-foreground/60 hover:border-[#4d6350]/50 hover:text-[#4d6350] motion-safe:transition-colors"
            >
              Saldo final · {eur2(outstanding)}
            </button>
          )}
        </div>
      )}

      {/* Add */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Tipo de pagamento"
          value={kind}
          onChange={(e) => pickKind(e.target.value as PaymentKind)}
          className="bo-input w-auto px-2.5 py-2 text-xs text-foreground/70"
        >
          <option value="sinal">Sinal</option>
          <option value="pagamento">Pagamento</option>
          <option value="saldo">Saldo final</option>
        </select>
        <input
          type="text"
          inputMode="decimal"
          aria-label="Valor em euros"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Valor €"
          className="bo-input w-24 px-2.5 py-2 text-xs text-foreground/80"
        />
        <input
          type="date"
          aria-label="Data do pagamento"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="bo-input w-auto px-2.5 py-2 text-xs text-foreground/70"
        />
        <input
          type="text"
          aria-label="Método ou nota (opcional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (parseMoney(amount) ?? 0) > 0) add();
          }}
          placeholder="Método / nota (ex.: MB Way)"
          className="bo-input flex-1 min-w-[8rem] px-2.5 py-2 text-xs text-foreground/70"
        />
        <Button
          size="sm"
          onClick={add}
          disabled={!((parseMoney(amount) ?? 0) > 0)}
          iconLeft={<span aria-hidden="true">+</span>}
        >
          Registar
        </Button>
      </div>

      {/* ── Livro de faturas (FT) — leitura, a verdade fiscal do evento. Colapsado
          por omissão para não pesar no dia-a-dia; abre sozinho quando o registo
          informal diverge (o banner acima mantém-se sempre visível). ── */}
      {showLedger && (
        <details
          className="group/ledger mt-5 rounded-xl border border-foreground/[0.06] bg-foreground/[0.02]"
          open={reconciliation.diverges || undefined}
        >
          <summary className="flex cursor-pointer select-none list-none items-center justify-between gap-2 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            <span className="text-foreground/45 text-[10px] tracking-[0.2em] uppercase">
              Faturas emitidas (livro)
              {!ledgerLoading && <span className="text-foreground/35"> · {invoices.length}</span>}
            </span>
            <svg
              className="text-foreground/40 shrink-0 motion-safe:transition-transform group-open/ledger:rotate-180"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </summary>
          <div className="px-3.5 pb-3">
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
        </details>
      )}
    </div>
  );
}
