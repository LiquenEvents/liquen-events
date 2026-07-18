"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
// `import type` is fully erased at build time, so pulling the shape from the
// server-only store never drags its runtime `server-only` guard into this
// client bundle.
import type { Invoice } from "@/lib/invoices-store";
import { SkeletonList } from "./Skeleton";
import EmptyState from "./EmptyState";
import { eur2 } from "./util";
import { useToast } from "./Toast";

type Status = Invoice["status"];
type Kind = Invoice["kind"];

const STATUS_META: Record<Status, { label: string; color: string }> = {
  emitida: { label: "Emitida", color: "#9aa36a" },
  paga: { label: "Paga", color: "#4d6350" },
  anulada: { label: "Anulada", color: "#b5654a" },
};

const KIND_LABEL: Record<Kind, string> = {
  sinal: "Sinal (30%)",
  saldo: "Saldo (70%)",
  total: "Total",
};

const today = () => new Date().toISOString().slice(0, 10);
const fmtDate = (d?: string) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("pt-PT", { day: "numeric", month: "short" })
    : "—";

interface Props {
  /** Optional events to prefill the "Nova fatura" client + total from. */
  quotes?: Quote[];
}

export default function Faturas({ quotes }: Props) {
  const { toast } = useToast();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | "all">("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // ── New-invoice form state ──
  const [mode, setMode] = useState<"single" | "split">("split");
  const [quoteId, setQuoteId] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [kind, setKind] = useState<Kind>("total");
  const [amount, setAmount] = useState("");
  const [vatRate, setVatRate] = useState("23");
  const [issuedAt, setIssuedAt] = useState(today());
  const [dueAt, setDueAt] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/faturas", { cache: "no-store" });
        if (res.ok) setInvoices(await res.json());
      } catch {
        toast("Não foi possível carregar as faturas", "error");
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  function onPickQuote(id: string) {
    setQuoteId(id);
    const q = quotes?.find((x) => x.id === id);
    if (q) {
      setClientName(q.name || "");
      setClientEmail(q.email || "");
      const total = q.quotedPrice ?? q.priceBreakdown?.total ?? 0;
      if (total > 0) setAmount(String(total));
    }
  }

  async function submit() {
    if (!clientName.trim()) {
      toast("Indique o nome do cliente", "error");
      return;
    }
    const value = parseFloat(amount);
    if (!value || value <= 0) {
      toast("Indique um valor válido", "error");
      return;
    }
    setSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        quoteId: quoteId || undefined,
        clientName: clientName.trim(),
        clientEmail: clientEmail.trim(),
        vatRate: (parseFloat(vatRate) || 0) / 100,
        issuedAt,
        dueAt: dueAt || undefined,
      };
      if (mode === "split") {
        payload.split = true;
        payload.total = value;
      } else {
        payload.kind = kind;
        payload.amount = value;
      }
      const res = await fetch("/api/faturas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Erro ao criar a fatura", "error");
        return;
      }
      const created: Invoice[] = data.invoices ?? [];
      setInvoices((prev) => [...created, ...prev]);
      toast(
        mode === "split"
          ? `Emitidas ${created.length} faturas (sinal + saldo)`
          : `Fatura ${created[0]?.number ?? ""} emitida`,
        "success",
      );
      // Reset the transient fields, keep the date defaults handy.
      setShowForm(false);
      setQuoteId("");
      setClientName("");
      setClientEmail("");
      setAmount("");
      setDueAt("");
    } catch {
      toast("Erro de rede ao criar a fatura", "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function setStatus(inv: Invoice, status: Status) {
    setBusy(inv.id);
    try {
      const res = await fetch(`/api/faturas/${inv.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error || "Não foi possível atualizar", "error");
        return;
      }
      setInvoices((prev) => prev.map((i) => (i.id === inv.id ? (data as Invoice) : i)));
      toast(status === "paga" ? "Fatura marcada como paga" : "Fatura anulada", "success");
    } catch {
      toast("Erro de rede ao atualizar", "error");
    } finally {
      setBusy(null);
    }
  }

  const filtered = useMemo(
    () => (filter === "all" ? invoices : invoices.filter((i) => i.status === filter)),
    [invoices, filter],
  );

  // Totals: emitido = tudo o que não está anulado; pago = faturas pagas;
  // em dívida = emitido − pago (o que falta receber).
  const totals = useMemo(() => {
    let emitido = 0;
    let pago = 0;
    for (const i of invoices) {
      if (i.status === "anulada") continue;
      emitido += i.amount;
      if (i.status === "paga") pago += i.amount;
    }
    return { emitido, pago, divida: Math.max(0, emitido - pago) };
  }, [invoices]);

  if (loading) return <SkeletonList rows={5} />;

  return (
    <div>
      {/* Header + totals */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
        <div className="grid grid-cols-3 gap-3 flex-1 min-w-[280px]">
          {[
            { l: "Emitido", v: eur2(totals.emitido), c: "text-foreground/75" },
            { l: "Pago", v: eur2(totals.pago), c: "text-[#4d6350]" },
            {
              l: "Em dívida",
              v: eur2(totals.divida),
              c: totals.divida > 0 ? "text-[#b5654a]" : "text-foreground/40",
            },
          ].map((k) => (
            <div
              key={k.l}
              className="bg-white border border-foreground/[0.08] rounded-xl p-3.5 shadow-sm"
            >
              <p className={`text-sm font-semibold tabular-nums ${k.c}`}>{k.v}</p>
              <p className="text-foreground/28 text-[9px] tracking-[0.22em] uppercase mt-1">
                {k.l}
              </p>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2.5 rounded-xl bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors shadow-sm shrink-0"
        >
          {showForm ? "Fechar" : "+ Nova fatura"}
        </button>
      </div>

      {/* New-invoice form */}
      {showForm && (
        <div className="bo-card p-5 mb-6">
          {/* Mode toggle */}
          <div className="flex gap-1.5 mb-4">
            {(
              [
                ["split", "Sinal + Saldo (30/70)"],
                ["single", "Fatura única"],
              ] as [typeof mode, string][]
            ).map(([m, label]) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${
                  mode === m
                    ? "bg-[#1b2119] text-white shadow-sm"
                    : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {quotes && quotes.length > 0 && (
              <label className="flex flex-col gap-1 sm:col-span-2">
                <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                  Evento (opcional)
                </span>
                <select
                  value={quoteId}
                  onChange={(e) => onPickQuote(e.target.value)}
                  className="bo-input px-2.5 py-2 text-xs text-foreground/70"
                >
                  <option value="">— Escolher para preencher —</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.name} · {q.eventName || q.eventType || "evento"}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                Cliente
              </span>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Nome do cliente"
                className="bo-input px-2.5 py-2 text-xs text-foreground/70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                E-mail
              </span>
              <input
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                placeholder="cliente@email.pt"
                className="bo-input px-2.5 py-2 text-xs text-foreground/70"
              />
            </label>

            {mode === "single" && (
              <label className="flex flex-col gap-1">
                <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                  Tipo
                </span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as Kind)}
                  className="bo-input px-2.5 py-2 text-xs text-foreground/70"
                >
                  <option value="total">Total</option>
                  <option value="sinal">Sinal (30%)</option>
                  <option value="saldo">Saldo (70%)</option>
                </select>
              </label>
            )}

            <label className="flex flex-col gap-1">
              <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                {mode === "split" ? "Total do evento (€)" : "Valor (€)"}
              </span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0,00"
                className="bo-input px-2.5 py-2 text-xs text-foreground/70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                IVA (%)
              </span>
              <input
                type="number"
                value={vatRate}
                onChange={(e) => setVatRate(e.target.value)}
                className="bo-input px-2.5 py-2 text-xs text-foreground/70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                Emissão
              </span>
              <input
                type="date"
                value={issuedAt}
                onChange={(e) => setIssuedAt(e.target.value)}
                className="bo-input px-2.5 py-2 text-xs text-foreground/70"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-foreground/35 text-[10px] tracking-[0.15em] uppercase">
                Vencimento (opcional)
              </span>
              <input
                type="date"
                value={dueAt}
                onChange={(e) => setDueAt(e.target.value)}
                className="bo-input px-2.5 py-2 text-xs text-foreground/70"
              />
            </label>
          </div>

          {mode === "split" && amount && parseFloat(amount) > 0 && (
            <p className="text-foreground/40 text-xs mt-3">
              Serão emitidas duas faturas: sinal{" "}
              {eur2(Math.round(parseFloat(amount) * 0.3 * 100) / 100)} + saldo{" "}
              {eur2(
                Math.round(
                  (parseFloat(amount) - Math.round(parseFloat(amount) * 0.3 * 100) / 100) * 100,
                ) / 100,
              )}
              .
            </p>
          )}

          <div className="flex justify-end gap-2 mt-4">
            <button
              onClick={() => setShowForm(false)}
              className="px-3.5 py-2 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium bg-foreground/[0.05] text-foreground/45 hover:bg-foreground/[0.09] transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={submitting}
              className="px-4 py-2 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium bg-[#1b2119] text-white/90 hover:bg-[#2a3227] transition-colors disabled:opacity-40"
            >
              {submitting ? "A emitir…" : "Emitir"}
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        <button
          onClick={() => setFilter("all")}
          className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${
            filter === "all"
              ? "bg-[#1b2119] text-white shadow-sm"
              : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"
          }`}
        >
          Todas · {invoices.length}
        </button>
        {(Object.keys(STATUS_META) as Status[]).map((s) => {
          const count = invoices.filter((i) => i.status === s).length;
          return (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-lg text-[10px] tracking-[0.1em] uppercase font-medium transition-all ${
                filter === s
                  ? "bg-[#1b2119] text-white shadow-sm"
                  : "bg-foreground/[0.04] text-foreground/40 hover:bg-foreground/[0.07]"
              }`}
            >
              {STATUS_META[s].label} · {count}
            </button>
          );
        })}
      </div>

      {/* Ledger table */}
      <div className="bo-card overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={filter !== "all" ? "Nenhuma fatura neste estado" : "Sem faturas ainda"}
            hint={
              filter !== "all"
                ? "Mude de filtro para ver outras."
                : "Emita a primeira fatura com o botão “Nova fatura”."
            }
            action={
              filter === "all"
                ? { label: "+ Nova fatura", onClick: () => setShowForm(true) }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-foreground/30 text-[9px] tracking-[0.15em] uppercase border-b border-foreground/[0.08]">
                  <th className="text-left font-medium px-4 py-3">Nº</th>
                  <th className="text-left font-medium px-4 py-3">Cliente</th>
                  <th className="text-left font-medium px-4 py-3">Tipo</th>
                  <th className="text-right font-medium px-4 py-3">Valor</th>
                  <th className="text-left font-medium px-4 py-3">Emitida</th>
                  <th className="text-left font-medium px-4 py-3">Vencimento</th>
                  <th className="text-left font-medium px-4 py-3">Estado</th>
                  <th className="text-right font-medium px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.06]">
                {filtered.map((i) => (
                  <tr
                    key={i.id}
                    className={`hover:bg-foreground/[0.02] transition-colors ${i.status === "anulada" ? "opacity-55" : ""}`}
                  >
                    <td className="px-4 py-3 font-medium text-foreground/70 whitespace-nowrap tabular-nums">
                      {i.number}
                    </td>
                    <td
                      className="px-4 py-3 text-foreground/65 max-w-[180px] truncate"
                      title={i.clientName}
                    >
                      {i.clientName || "—"}
                    </td>
                    <td className="px-4 py-3 text-foreground/45 whitespace-nowrap">
                      {KIND_LABEL[i.kind]}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-foreground/75 whitespace-nowrap tabular-nums">
                      {eur2(i.amount)}
                    </td>
                    <td className="px-4 py-3 text-foreground/40 whitespace-nowrap">
                      {fmtDate(i.issuedAt)}
                    </td>
                    <td className="px-4 py-3 text-foreground/40 whitespace-nowrap">
                      {fmtDate(i.dueAt)}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span
                        className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md"
                        style={{
                          background: `${STATUS_META[i.status].color}18`,
                          color: STATUS_META[i.status].color,
                        }}
                      >
                        {STATUS_META[i.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {i.status === "emitida" && (
                          <>
                            <button
                              onClick={() => setStatus(i, "paga")}
                              disabled={busy === i.id}
                              className="px-2.5 py-1 rounded-lg text-[10px] tracking-[0.08em] uppercase font-medium bg-[#4d6350]/12 text-[#4d6350] hover:bg-[#4d6350]/20 transition-colors disabled:opacity-40"
                            >
                              ✓ Paga
                            </button>
                            <button
                              onClick={() => setStatus(i, "anulada")}
                              disabled={busy === i.id}
                              className="px-2.5 py-1 rounded-lg text-[10px] tracking-[0.08em] uppercase font-medium bg-foreground/[0.05] text-foreground/40 hover:text-[#b5654a] hover:bg-[#b5654a]/[0.08] transition-colors disabled:opacity-40"
                            >
                              Anular
                            </button>
                          </>
                        )}
                        {i.status === "paga" && (
                          <span className="text-foreground/30 text-[10px]">
                            Pago {fmtDate(i.paidAt)}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
