"use client";

import { useState, useEffect } from "react";
import type { Quote, ProposalLineItem } from "@/lib/orcamento/types";
import { Card, Field, Button, EmptyState } from "@/app/[lang]/orcamento/admin/ui";

const eur = (n: number) =>
  new Intl.NumberFormat("pt-PT", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(n || 0);

const LS_KEY = "liquen-last-proposal-items";

function loadLastItems(): ProposalLineItem[] | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveLastItems(items: ProposalLineItem[]) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items));
  } catch {
    /* ignore */
  }
}

function buildFromBreakdown(q: Quote): ProposalLineItem[] {
  const pb = q.priceBreakdown;
  if (!pb)
    return [
      {
        description: "Organização e produção do evento",
        qty: 1,
        unitPrice: Math.round(q.quotedPrice || 0),
      },
    ];
  const items: ProposalLineItem[] = [];
  // Base do serviço já com o multiplicador do pacote aplicado, para que a
  // soma das linhas reproduza o subtotal do breakdown.
  const packaged = Math.round((pb.basePrice + pb.guestCost) * (pb.packageMultiplier || 1));
  if (packaged > 0) {
    items.push({ description: "Produção e coordenação do evento", qty: 1, unitPrice: packaged });
  }
  if (pb.locationSurcharge > 0)
    items.push({
      description: "Suplemento deslocação",
      qty: 1,
      unitPrice: Math.round(pb.locationSurcharge),
    });
  if (pb.weekendSurcharge > 0)
    items.push({
      description: "Suplemento fim de semana",
      qty: 1,
      unitPrice: Math.round(pb.weekendSurcharge),
    });
  if (pb.seasonSurcharge > 0)
    items.push({
      description: "Suplemento época alta",
      qty: 1,
      unitPrice: Math.round(pb.seasonSurcharge),
    });
  if (pb.urgencySurcharge > 0)
    items.push({
      description: "Suplemento urgência",
      qty: 1,
      unitPrice: Math.round(pb.urgencySurcharge),
    });
  if (pb.addonsCost > 0)
    items.push({
      description: "Serviços adicionais",
      qty: 1,
      unitPrice: Math.round(pb.addonsCost),
    });
  if (items.length === 0)
    items.push({
      description: "Organização e produção do evento",
      qty: 1,
      unitPrice: Math.round(q.quotedPrice || pb.subtotal || 0),
    });
  return items;
}

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
  const [hasLastItems, setHasLastItems] = useState(false);

  useEffect(() => {
    setHasLastItems(!!loadLastItems());
  }, []);

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
    if (items.length === 1) return;
    setItems((prev) => prev.filter((_, idx) => idx !== i));
  }

  function applyTemplate(tpl: "single" | "breakdown" | "last") {
    if (tpl === "single") {
      setItems([
        {
          description: "Organização e produção do evento",
          qty: 1,
          unitPrice: Math.round(seedPrice),
        },
      ]);
    } else if (tpl === "breakdown") {
      setItems(buildFromBreakdown(quote));
    } else {
      const last = loadLastItems();
      if (last) setItems(last);
    }
  }

  async function send() {
    if (sending) return;
    if (!window.confirm(`Enviar a proposta de ${eur(total)} por e-mail para ${quote.email}?`))
      return;
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
      saveLastItems(items);
      setHasLastItems(true);
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
      <Card padding="none">
        <EmptyState
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              aria-hidden="true"
            >
              <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          }
          title={`Proposta criada — ${eur(result.total)}`}
          description={
            result.emailed
              ? `Enviada por e-mail para ${quote.email}.`
              : "Gerada (e-mail não configurado — descarregue e envie manualmente)."
          }
          action={{
            label: "Descarregar PDF",
            onClick: () => {
              const a = document.createElement("a");
              a.href = result.pdfUrl;
              a.download = `Proposta-Liquen-${quote.id}.pdf`;
              a.click();
            },
          }}
          secondaryAction={{ label: "Nova proposta", onClick: () => setResult(null) }}
        />
      </Card>
    );
  }

  return (
    <Card>
      <div className="mb-5">
        <p className="bo-eyebrow mb-1.5">Proposta</p>
        <h3 className="font-display text-lg leading-tight text-foreground/90">
          Criar e enviar proposta (PDF)
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-foreground/55">
          Componha as linhas, defina o IVA e envie o PDF ao cliente.
        </p>
      </div>

      {/* Template shortcuts */}
      <div className="flex flex-wrap gap-2 mb-5">
        <Button variant="ghost" size="sm" onClick={() => applyTemplate("single")}>
          Pacote único
        </Button>
        {quote.priceBreakdown && (
          <Button variant="ghost" size="sm" onClick={() => applyTemplate("breakdown")}>
            Por componentes
          </Button>
        )}
        {hasLastItems && (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => applyTemplate("last")}
            iconLeft={<span aria-hidden="true">↺</span>}
          >
            Última proposta
          </Button>
        )}
      </div>

      {/* Line items */}
      <div className="flex flex-col gap-2 mb-2">
        <div className="flex gap-2 text-[11px] font-medium uppercase tracking-[0.12em] text-foreground/55">
          <span className="flex-1">Descrição</span>
          <span className="w-16 text-center">Qt.</span>
          <span className="w-24 text-right">Unit. €</span>
          <span className="w-10" />
        </div>
        {items.map((it, i) => (
          <div key={i} className="flex gap-2 items-center">
            <Field
              hideLabel
              label={`Descrição da linha ${i + 1}`}
              containerClassName="flex-1 min-w-0"
              value={it.description}
              onChange={(e) => update(i, { description: e.target.value })}
              placeholder="Ex.: Decoração floral"
            />
            <Field
              hideLabel
              label={`Quantidade da linha ${i + 1}`}
              containerClassName="w-16"
              type="number"
              min={1}
              value={it.qty}
              onChange={(e) => update(i, { qty: Number(e.target.value) })}
              className="text-center"
            />
            <Field
              hideLabel
              label={`Preço unitário da linha ${i + 1}`}
              containerClassName="w-24"
              type="number"
              min={0}
              value={it.unitPrice}
              onChange={(e) => update(i, { unitPrice: Number(e.target.value) })}
              className="text-right"
            />
            <Button
              variant="ghost"
              onClick={() => removeRow(i)}
              disabled={items.length === 1}
              aria-label="Remover linha"
              className="h-10 w-10 shrink-0 px-0 text-lg"
            >
              ×
            </Button>
          </div>
        ))}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={addRow}
        iconLeft={<span aria-hidden="true">+</span>}
        className="mt-2 mb-5 text-[#4d6350] hover:text-[#415440]"
      >
        Adicionar linha
      </Button>

      {/* Totals */}
      <div className="rounded-xl bg-foreground/[0.035] p-4 flex flex-col gap-2 mb-5">
        <div className="flex justify-between text-sm">
          <span className="text-foreground/55">Subtotal</span>
          <span className="text-foreground/75">{eur(subtotal)}</span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span className="text-foreground/55 flex items-center gap-2">
            IVA
            <select
              aria-label="Taxa de IVA"
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className="rounded-lg border border-foreground/20 bg-white px-2 py-1 text-xs text-foreground/70 shadow-[0_1px_2px_rgba(42,38,32,0.04)] focus:outline-none focus:border-foreground/40"
            >
              <option value={0.23}>23%</option>
              <option value={0.13}>13%</option>
              <option value={0.06}>6%</option>
              <option value={0}>0%</option>
            </select>
          </span>
          <span className="text-foreground/75">{eur(vat)}</span>
        </div>
        <div className="flex justify-between text-base font-medium pt-2 border-t border-foreground/10">
          <span className="text-foreground/75">Total</span>
          <span className="text-[#4d6350] font-semibold">{eur(total)}</span>
        </div>
      </div>

      {/* Validity + notes */}
      <div className="flex flex-col gap-4 mb-5">
        <Field
          label="Válida até"
          type="date"
          value={validUntil}
          onChange={(e) => setValidUntil(e.target.value)}
        />
        <Field
          as="textarea"
          label="Notas (no PDF)"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Condições, observações, o que está incluído…"
          className="resize-none"
        />
      </div>

      {error && (
        <p
          role="alert"
          aria-live="assertive"
          className="mb-4 flex items-start gap-1.5 text-sm leading-relaxed text-[#8a2a22]"
        >
          <span aria-hidden="true">⚠</span>
          <span>{error}</span>
        </p>
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        onClick={send}
        loading={sending}
        disabled={subtotal <= 0}
        iconRight={<span aria-hidden="true">→</span>}
      >
        {sending ? "A gerar e enviar…" : "Gerar PDF e enviar ao cliente"}
      </Button>
    </Card>
  );
}
