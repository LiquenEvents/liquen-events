"use client";

import { useState } from "react";
import type { Quote, ProposalLineItem } from "../types";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

interface Props {
  quote: Quote;
  onSent?: (total: number) => void;
}

export default function ProposalBuilder({ quote, onSent }: Props) {
  const seedPrice = quote.quotedPrice || quote.priceBreakdown?.subtotal || 0;
  const [items, setItems] = useState<ProposalLineItem[]>([
    { description: "Organização e produção do evento", qty: 1, unitPrice: Math.round(seedPrice) },
  ]);
  const [vatRate, setVatRate] = useState(0.23);
  const [validUntil, setValidUntil] = useState("");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ total: number; emailed: boolean; pdfUrl: string } | null>(
    null,
  );

  const subtotal = items.reduce(
    (s, it) => s + (Number(it.qty) || 0) * (Number(it.unitPrice) || 0),
    0,
  );
  const vat = subtotal * vatRate;
  const total = subtotal + vat;

  function update(i: number, patch: Partial<ProposalLineItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }
  function addRow() {
    setItems((prev) => [...prev, { description: "", qty: 1, unitPrice: 0 }]);
  }
  function removeRow(i: number) {
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function send() {
    if (sending) return;
    // Outward-facing action: this emails the proposal (with pricing) to the
    // client. Confirm first so a stray click never sends an unfinished quote.
    if (!window.confirm(`Enviar a proposta de ${eur(total)} por e-mail para ${quote.email}?`)) {
      return;
    }
    setSending(true);
    setError(null);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}/proposta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lineItems: items,
          vatRate,
          validUntil: validUntil || undefined,
          notes: notes || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erro");

      const pdfUrl = `data:application/pdf;base64,${data.pdfBase64}`;
      setResult({ total: data.total, emailed: data.emailed, pdfUrl });
      onSent?.(data.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao enviar a proposta.");
    } finally {
      setSending(false);
    }
  }

  if (result) {
    return (
      <div className="border-t border-foreground/10 pt-5">
        <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-4">Proposta</p>
        <div className="rounded-sm border border-moss/30 bg-moss/8 p-4">
          <p className="text-moss text-sm font-medium mb-1">
            ✓ Proposta criada — {eur(result.total)}
          </p>
          <p className="text-foreground/45 text-xs mb-4">
            {result.emailed
              ? `Enviada por e-mail para ${quote.email}.`
              : "Gerada (e-mail não configurado — descarregue e envie manualmente)."}
          </p>
          <div className="flex flex-wrap gap-2">
            <a
              href={result.pdfUrl}
              download={`Proposta-Liquen-${quote.id}.pdf`}
              className="px-4 py-2 bg-moss text-cream text-[10px] tracking-[0.2em] uppercase rounded-sm hover:bg-moss-dark transition-colors"
            >
              Descarregar PDF
            </a>
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 border border-foreground/15 text-foreground/40 text-[10px] tracking-[0.2em] uppercase rounded-sm hover:border-foreground/30 transition-colors"
            >
              Nova proposta
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase mb-4">
        Criar &amp; Enviar Proposta (PDF)
      </p>

      {/* Line items */}
      <div className="flex flex-col gap-2 mb-3">
        <div className="flex gap-2 text-[9px] tracking-[0.2em] uppercase text-foreground/25">
          <span className="flex-1">Descrição</span>
          <span className="w-10 text-center">Qt</span>
          <span className="w-20 text-right">Unit. €</span>
          <span className="w-5" />
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              value={it.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Ex: Decoração floral"
              className="flex-1 min-w-0 bg-surface border border-foreground/15 rounded-sm px-2.5 py-2 text-xs text-foreground/75 focus:outline-none focus:border-moss/50"
            />
            <input
              type="number"
              value={it.qty}
              min={1}
              onChange={(e) => update(i, { qty: Number(e.target.value) })}
              className="w-10 bg-surface border border-foreground/15 rounded-sm px-1.5 py-2 text-xs text-foreground/75 text-center focus:outline-none focus:border-moss/50"
            />
            <input
              type="number"
              value={it.unitPrice}
              min={0}
              onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
              className="w-20 bg-surface border border-foreground/15 rounded-sm px-2 py-2 text-xs text-foreground/75 text-right focus:outline-none focus:border-moss/50"
            />
            <button
              onClick={() => removeRow(i)}
              disabled={items.length === 1}
              className="w-5 text-foreground/25 hover:text-foreground/60 disabled:opacity-20 disabled:cursor-not-allowed text-sm"
              aria-label="Remover linha"
            >
              ×
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={addRow}
        className="text-[10px] tracking-[0.2em] uppercase text-moss/70 hover:text-moss transition-colors mb-5"
      >
        + Adicionar linha
      </button>

      {/* Totals */}
      <div className="rounded-sm bg-foreground/4 p-3 flex flex-col gap-1.5 mb-5">
        <div className="flex justify-between text-[11px]">
          <span className="text-foreground/35">Subtotal</span>
          <span className="text-foreground/55">{eur(subtotal)}</span>
        </div>
        <div className="flex justify-between text-[11px] items-center">
          <span className="text-foreground/35 flex items-center gap-2">
            IVA
            <select
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className="bg-surface border border-foreground/15 rounded-sm px-1 py-0.5 text-[10px] text-foreground/60 focus:outline-none"
            >
              <option value={0.23}>23%</option>
              <option value={0.13}>13%</option>
              <option value={0.06}>6%</option>
              <option value={0}>0%</option>
            </select>
          </span>
          <span className="text-foreground/55">{eur(vat)}</span>
        </div>
        <div className="flex justify-between text-sm font-medium pt-1.5 border-t border-foreground/8">
          <span className="text-foreground/65">Total</span>
          <span className="text-moss">{eur(total)}</span>
        </div>
      </div>

      {/* Validity + notes */}
      <div className="flex flex-col gap-3 mb-5">
        <div>
          <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
            Válida até
          </label>
          <input
            type="date"
            value={validUntil}
            onChange={(e) => setValidUntil(e.target.value)}
            className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50"
          />
        </div>
        <div>
          <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
            Notas (no PDF)
          </label>
          <textarea
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Condições, observações, o que está incluído…"
            className="w-full bg-surface border border-foreground/15 rounded-sm px-3 py-2 text-sm text-foreground/70 focus:outline-none focus:border-moss/50 resize-none"
          />
        </div>
      </div>

      {error && <p className="text-moss/80 text-xs mb-4">{error}</p>}

      <button
        onClick={send}
        disabled={sending || subtotal <= 0}
        className={`w-full py-3 rounded-sm text-[11px] tracking-[0.2em] uppercase transition-all ${
          sending || subtotal <= 0
            ? "bg-moss/40 text-cream/50 cursor-not-allowed"
            : "bg-moss text-cream hover:bg-moss-dark"
        }`}
      >
        {sending ? "A gerar e enviar…" : "Gerar PDF & Enviar ao Cliente →"}
      </button>
    </div>
  );
}
