"use client";

import { useEffect, useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
// `import type` is fully erased at build time, so pulling the shape from the
// server-only store never drags its runtime `server-only` guard into this
// client bundle.
import type { Invoice } from "@/lib/invoices-store";
import { SkeletonList } from "./Skeleton";
import { eur2 } from "./util";
import { splitThirtySeventy } from "@/lib/money";
import { useToast } from "./Toast";
import { Button, Card, EmptyState, Field, Segmented } from "./ui";

type Status = Invoice["status"];
type Kind = Invoice["kind"];

const STATUS_META: Record<Status, { label: string; color: string }> = {
  emitida: { label: "Emitida", color: "#9aa36a" },
  paga: { label: "Paga", color: "#4d6350" },
  anulada: { label: "Anulada", color: "#b5654a" },
};

const STATUSES = Object.keys(STATUS_META) as Status[];

const PlusIcon = (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    aria-hidden="true"
  >
    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
  </svg>
);

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
  // Faturas já existentes do evento escolhido — para avisar/impedir um duplo
  // sinal (o aceite da proposta pode já ter emitido o par 30/70).
  const [quoteInvoices, setQuoteInvoices] = useState<Invoice[]>([]);

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

  async function onPickQuote(id: string) {
    setQuoteId(id);
    const q = quotes?.find((x) => x.id === id);
    if (q) {
      setClientName(q.name || "");
      setClientEmail(q.email || "");
      const total = q.quotedPrice ?? q.priceBreakdown?.total ?? 0;
      if (total > 0) setAmount(String(total));
    }
    // Carregar o que já foi faturado a este evento, para bloquear um 2.º sinal.
    setQuoteInvoices([]);
    if (!id) return;
    try {
      const res = await fetch(`/api/faturas?quoteId=${encodeURIComponent(id)}`, {
        cache: "no-store",
      });
      if (res.ok) setQuoteInvoices(await res.json());
    } catch {
      // Silencioso — o servidor volta a validar na emissão (guarda de duplo sinal).
    }
  }

  // Sinal/saldo não anulados já emitidos para o evento escolhido.
  const existingSinal = useMemo(
    () => quoteInvoices.find((i) => i.kind === "sinal" && i.status !== "anulada"),
    [quoteInvoices],
  );
  const existingSaldo = useMemo(
    () => quoteInvoices.find((i) => i.kind === "saldo" && i.status !== "anulada"),
    [quoteInvoices],
  );
  // O split emitiria um novo sinal — bloqueá-lo quando já existe um.
  const splitBlocked = mode === "split" && !!existingSinal;
  // Modo single: um Tipo=Sinal/Saldo repetido duplicaria a fatura (o servidor
  // recusa com 409, mas avisamos e bloqueamos já na UI). `total` fica livre.
  const dupSingle =
    mode === "single" && kind === "sinal"
      ? existingSinal
      : mode === "single" && kind === "saldo"
        ? existingSaldo
        : undefined;
  const singleBlocked = mode === "single" && !!dupSingle;
  const emitBlocked = splitBlocked || singleBlocked;

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
    if (splitBlocked && existingSinal) {
      toast(`Este evento já tem sinal (${existingSinal.number})`, "error");
      return;
    }
    if (singleBlocked && dupSingle) {
      toast(`Este evento já tem ${kind} (${dupSingle.number})`, "error");
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
      setQuoteInvoices([]);
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
      // O PATCH pode devolver um saldo emitido automaticamente (quando se marca
      // um sinal como pago). Separamo-lo do próprio registo atualizado.
      const { saldoAutoIssued, ...updated } = data as Invoice & { saldoAutoIssued?: Invoice };
      setInvoices((prev) => {
        const next = prev.map((i) => (i.id === inv.id ? (updated as Invoice) : i));
        return saldoAutoIssued ? [saldoAutoIssued, ...next] : next;
      });
      if (saldoAutoIssued) {
        toast(`Sinal pago · saldo ${saldoAutoIssued.number} emitido automaticamente`, "success");
      } else {
        toast(status === "paga" ? "Fatura marcada como paga" : "Fatura anulada", "success");
      }
    } catch {
      toast("Erro de rede ao atualizar", "error");
    } finally {
      setBusy(null);
    }
  }

  // Apagar definitivamente uma fatura — só permitido quando já está anulada
  // (a guarda fiscal vive também no servidor, que devolve 409 caso contrário).
  // Anula-se primeiro, depois apaga-se: uma fatura viva nunca se apaga por engano.
  async function remove(inv: Invoice) {
    if (
      !window.confirm(
        `Apagar definitivamente a fatura ${inv.number}? Esta ação não pode ser anulada.`,
      )
    ) {
      return;
    }
    setBusy(inv.id);
    try {
      const res = await fetch(`/api/faturas/${inv.id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Não foi possível apagar", "error");
        return;
      }
      setInvoices((prev) => prev.filter((i) => i.id !== inv.id));
      toast("Fatura apagada", "success");
    } catch {
      toast("Erro de rede ao apagar", "error");
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
      {/* Totals + primary action */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="grid flex-1 grid-cols-3 gap-3 min-w-[280px]">
          {[
            { l: "Emitido", v: eur2(totals.emitido), c: "text-foreground/80" },
            { l: "Pago", v: eur2(totals.pago), c: "text-[#4d6350]" },
            {
              l: "Em dívida",
              v: eur2(totals.divida),
              c: totals.divida > 0 ? "text-[#8a2a22]" : "text-foreground/40",
            },
          ].map((k) => (
            <Card key={k.l} padding="sm">
              <p className={`text-lg font-semibold tabular-nums ${k.c}`}>{k.v}</p>
              <p className="bo-eyebrow mt-1.5">{k.l}</p>
            </Card>
          ))}
        </div>
        <Button
          variant={showForm ? "secondary" : "primary"}
          iconLeft={showForm ? undefined : PlusIcon}
          onClick={() => setShowForm((s) => !s)}
          className="shrink-0"
        >
          {showForm ? "Fechar" : "Nova fatura"}
        </Button>
      </div>

      {/* New-invoice form */}
      {showForm && (
        <Card className="mb-8">
          {/* Mode toggle */}
          <div className="mb-6">
            <Segmented
              ariaLabel="Tipo de emissão"
              value={mode}
              onChange={setMode}
              options={[
                { value: "split", label: "Sinal + Saldo (30/70)" },
                { value: "single", label: "Fatura única" },
              ]}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {quotes && quotes.length > 0 && (
              <Field
                as="select"
                label="Evento (opcional)"
                value={quoteId}
                onChange={(e) => void onPickQuote(e.target.value)}
                containerClassName="sm:col-span-2"
              >
                <option value="">— Escolher para preencher —</option>
                {quotes.map((q) => (
                  <option key={q.id} value={q.id}>
                    {q.name} · {q.eventName || q.eventType || "evento"}
                  </option>
                ))}
              </Field>
            )}

            <Field
              label="Cliente"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="Nome do cliente"
            />
            <Field
              label="E-mail"
              value={clientEmail}
              onChange={(e) => setClientEmail(e.target.value)}
              placeholder="cliente@email.pt"
            />

            {mode === "single" && (
              <Field
                as="select"
                label="Tipo"
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                <option value="total">Total</option>
                <option value="sinal">Sinal (30%)</option>
                <option value="saldo">Saldo (70%)</option>
              </Field>
            )}

            <Field
              label={mode === "split" ? "Total do evento (€)" : "Valor (€)"}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
            />
            <Field
              label="IVA (%)"
              type="number"
              value={vatRate}
              onChange={(e) => setVatRate(e.target.value)}
            />
            <Field
              label="Emissão"
              type="date"
              value={issuedAt}
              onChange={(e) => setIssuedAt(e.target.value)}
            />
            <Field
              label="Vencimento (opcional)"
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
            />
          </div>

          {splitBlocked && existingSinal ? (
            <p className="mt-4 text-sm leading-relaxed text-[#8a2a22]">
              Este evento já tem um sinal emitido ({existingSinal.number}). Para não faturar o sinal
              duas vezes, use “Fatura única” (só o saldo) em vez do split.
            </p>
          ) : singleBlocked && dupSingle ? (
            <p className="mt-4 text-sm leading-relaxed text-[#8a2a22]">
              Este evento já tem uma fatura de {kind} ({dupSingle.number}). Para não a faturar duas
              vezes, escolha outro tipo ou anule a existente primeiro.
            </p>
          ) : (
            mode === "split" &&
            amount &&
            parseFloat(amount) > 0 && (
              <p className="mt-4 text-sm leading-relaxed text-foreground/55">
                Serão emitidas duas faturas: sinal{" "}
                {eur2(splitThirtySeventy(parseFloat(amount)).sinal)} + saldo{" "}
                {eur2(splitThirtySeventy(parseFloat(amount)).saldo)}.
              </p>
            )
          )}

          <div className="mt-6 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              onClick={submit}
              loading={submitting}
              disabled={emitBlocked}
              title={
                splitBlocked
                  ? "Este evento já tem um sinal emitido"
                  : singleBlocked
                    ? `Este evento já tem uma fatura de ${kind}`
                    : undefined
              }
            >
              {submitting ? "A emitir…" : "Emitir"}
            </Button>
          </div>
        </Card>
      )}

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Filtrar por estado">
        <Button
          size="sm"
          variant={filter === "all" ? "subtle" : "ghost"}
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          Todas · {invoices.length}
        </Button>
        {STATUSES.map((s) => {
          const count = invoices.filter((i) => i.status === s).length;
          return (
            <Button
              key={s}
              size="sm"
              variant={filter === s ? "subtle" : "ghost"}
              aria-pressed={filter === s}
              onClick={() => setFilter(s)}
            >
              {STATUS_META[s].label} · {count}
            </Button>
          );
        })}
      </div>

      {/* Ledger table */}
      <Card padding="none" className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6M9 13h6M9 17h6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            title={filter !== "all" ? "Nenhuma fatura neste estado" : "Sem faturas ainda"}
            description={
              filter !== "all"
                ? "Mude de filtro para ver outras."
                : "Emita a primeira fatura com o botão “Nova fatura”."
            }
            action={
              filter === "all"
                ? { label: "Nova fatura", onClick: () => setShowForm(true) }
                : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-foreground/[0.08] text-foreground/40">
                  <th className="bo-eyebrow px-4 py-3.5 text-left">Nº</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-left">Cliente</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-left">Tipo</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-right">Valor</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-left">Emitida</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-left">Vencimento</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-left">Estado</th>
                  <th className="bo-eyebrow px-4 py-3.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-foreground/[0.06]">
                {filtered.map((i) => (
                  <tr
                    key={i.id}
                    className={`transition-colors hover:bg-foreground/[0.02] ${i.status === "anulada" ? "opacity-55" : ""}`}
                  >
                    <td className="whitespace-nowrap px-4 py-3.5 font-medium tabular-nums text-foreground/70">
                      {i.number}
                    </td>
                    <td
                      className="max-w-[180px] truncate px-4 py-3.5 text-foreground/70"
                      title={i.clientName}
                    >
                      {i.clientName || "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-foreground/50">
                      {KIND_LABEL[i.kind]}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold tabular-nums text-foreground/80">
                      {eur2(i.amount)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-foreground/45">
                      {fmtDate(i.issuedAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5 text-foreground/45">
                      {fmtDate(i.dueAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3.5">
                      <span
                        className="rounded-md px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.1em]"
                        style={{
                          background: `${STATUS_META[i.status].color}18`,
                          color: STATUS_META[i.status].color,
                        }}
                      >
                        {STATUS_META[i.status].label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-end gap-1.5">
                        {i.status === "emitida" && (
                          <>
                            <Button
                              size="sm"
                              variant="subtle"
                              onClick={() => setStatus(i, "paga")}
                              disabled={busy === i.id}
                            >
                              Marcar paga
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (
                                  window.confirm(
                                    `Anular a fatura ${i.number}? Deixa de contar para o total.`,
                                  )
                                )
                                  setStatus(i, "anulada");
                              }}
                              disabled={busy === i.id}
                            >
                              Anular
                            </Button>
                          </>
                        )}
                        {i.status === "paga" && (
                          <span className="text-xs text-foreground/40">
                            Pago {fmtDate(i.paidAt)}
                          </span>
                        )}
                        {/* Apagar — só para faturas já anuladas (segurança fiscal:
                            anula-se primeiro, depois apaga-se). */}
                        {i.status === "anulada" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => remove(i)}
                            disabled={busy === i.id}
                          >
                            Apagar
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
