"use client";

import { useEffect, useMemo, useState } from "react";
import { randomId, eur2 } from "./util";
import type { Quote, EventSupplier, EventSupplierStatus, Supplier } from "@/lib/orcamento/types";

const STATUS_META: Record<EventSupplierStatus, { label: string; color: string }> = {
  contactado: { label: "Contactado", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#7c854b" },
  pago: { label: "Pago", color: "#4d6350" },
};

const CATEGORIES = [
  "Catering",
  "Floristas",
  "Música/DJ",
  "Fotografia",
  "Vídeo",
  "Decoração",
  "Espaços",
  "Audiovisual",
  "Transporte",
  "Outro",
];

interface Props {
  quote: Quote;
  onChange: (eventSuppliers: EventSupplier[]) => void;
}

/**
 * Per-event supplier bookings with budgeted vs actual cost. Combined with the
 * event's revenue (quotedPrice) it gives a live margin — the single most useful
 * number for running events profitably. Suppliers can be picked from the
 * directory or typed free-hand; the name is denormalised so the booking
 * survives if the directory entry is later removed.
 */
export default function EventCosts({ quote, onChange }: Props) {
  const [items, setItems] = useState<EventSupplier[]>(quote.eventSuppliers ?? []);
  const [directory, setDirectory] = useState<Supplier[]>([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({
    name: "",
    category: "Catering",
    estimatedCost: "",
    supplierId: "" as string | "",
  });

  // Load the supplier directory so bookings can be picked from it.
  useEffect(() => {
    fetch("/api/fornecedores", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => Array.isArray(d) && setDirectory(d))
      .catch(() => {});
  }, []);

  const revenue = quote.quotedPrice ?? quote.priceBreakdown?.total ?? 0;
  const totals = useMemo(() => {
    let estimated = 0;
    let actual = 0;
    for (const it of items) {
      estimated += it.estimatedCost || 0;
      actual += it.actualCost ?? it.estimatedCost ?? 0;
    }
    const margin = revenue - actual;
    const marginPct = revenue > 0 ? Math.round((margin / revenue) * 100) : 0;
    return { estimated, actual, margin, marginPct };
  }, [items, revenue]);

  function persist(next: EventSupplier[]) {
    setItems(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventSuppliers: next }),
    });
  }

  function add() {
    const name = form.name.trim();
    if (!name) return;
    const est = parseFloat(form.estimatedCost) || 0;
    persist([
      ...items,
      {
        id: randomId(),
        supplierId: form.supplierId || undefined,
        name,
        category: form.category,
        estimatedCost: est,
        status: "contactado",
      },
    ]);
    setForm({ name: "", category: "Catering", estimatedCost: "", supplierId: "" });
    setAdding(false);
  }

  function update(id: string, patch: Partial<EventSupplier>) {
    persist(items.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }
  function remove(id: string) {
    persist(items.filter((it) => it.id !== id));
  }

  // Cycle the booking status with a single tap (contactado → confirmado → pago).
  function cycleStatus(it: EventSupplier) {
    const order: EventSupplierStatus[] = ["contactado", "confirmado", "pago"];
    const next = order[(order.indexOf(it.status) + 1) % order.length];
    update(it.id, { status: next });
  }

  // Picking a directory supplier prefills name + category.
  function pickDirectory(supplierId: string) {
    const s = directory.find((x) => x.id === supplierId);
    setForm((f) => ({
      ...f,
      supplierId,
      name: s ? s.name : f.name,
      category: s ? s.category : f.category,
    }));
  }

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="bo-eyebrow">Fornecedores &amp; Custos</p>
        {items.length > 0 && (
          <span className="text-foreground/35 text-[10px] tabular-nums bg-foreground/[0.05] rounded-full px-2 py-0.5">
            {items.length}
          </span>
        )}
      </div>

      {/* Margin summary — the headline number */}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <div className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
          <p className="text-sm font-semibold text-foreground/70">{eur2(revenue)}</p>
          <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">Receita</p>
        </div>
        <div className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
          <p className="text-sm font-semibold text-[#c08457]">{eur2(totals.actual)}</p>
          <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">Custos</p>
        </div>
        <div className="bg-foreground/[0.04] rounded-lg p-2.5 text-center">
          <p
            className={`text-sm font-semibold ${totals.margin >= 0 ? "text-[#4d6350]" : "text-[#b5654a]"}`}
          >
            {eur2(totals.margin)}
          </p>
          <p className="text-foreground/25 text-[9px] tracking-[0.2em] uppercase mt-0.5">
            Margem{revenue > 0 ? ` · ${totals.marginPct}%` : ""}
          </p>
        </div>
      </div>

      {/* Bookings list */}
      {items.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-4">
          {items.map((it) => (
            <div
              key={it.id}
              className="group bg-foreground/[0.02] border border-foreground/[0.07] rounded-lg px-3 py-2.5"
            >
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/72 text-xs font-medium truncate">{it.name}</p>
                  <p className="text-foreground/30 text-[10px]">{it.category}</p>
                </div>
                <button
                  onClick={() => cycleStatus(it)}
                  className="text-[9px] tracking-[0.12em] uppercase px-2 py-0.5 rounded-md shrink-0 transition-opacity hover:opacity-80"
                  style={{
                    background: `${STATUS_META[it.status].color}18`,
                    color: STATUS_META[it.status].color,
                  }}
                  title="Clique para mudar o estado"
                >
                  {STATUS_META[it.status].label}
                </button>
                <button
                  onClick={() => remove(it.id)}
                  className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all shrink-0 text-sm leading-none"
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <label className="flex-1 flex items-center gap-1.5 text-[10px] text-foreground/35">
                  Orçado
                  <input
                    type="number"
                    value={it.estimatedCost || ""}
                    onChange={(e) =>
                      update(it.id, { estimatedCost: parseFloat(e.target.value) || 0 })
                    }
                    className="bo-input flex-1 px-2 py-1 text-xs text-foreground/70"
                    placeholder="0"
                  />
                </label>
                <label className="flex-1 flex items-center gap-1.5 text-[10px] text-foreground/35">
                  Real
                  <input
                    type="number"
                    value={it.actualCost ?? ""}
                    onChange={(e) =>
                      update(it.id, {
                        actualCost:
                          e.target.value === "" ? undefined : parseFloat(e.target.value) || 0,
                      })
                    }
                    className="bo-input flex-1 px-2 py-1 text-xs text-foreground/70"
                    placeholder="—"
                  />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add booking */}
      {adding ? (
        <div className="bg-foreground/[0.02] border border-foreground/[0.07] rounded-lg p-3 flex flex-col gap-2">
          {directory.length > 0 && (
            <select
              value={form.supplierId}
              onChange={(e) => pickDirectory(e.target.value)}
              className="bo-input px-2.5 py-1.5 text-xs text-foreground/60"
            >
              <option value="">Do diretório de fornecedores…</option>
              {directory.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.category}
                </option>
              ))}
            </select>
          )}
          <div className="flex gap-2">
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, supplierId: "" }))}
              placeholder="Nome do fornecedor"
              className="bo-input flex-1 px-2.5 py-1.5 text-xs text-foreground/70 placeholder-foreground/25"
              autoFocus
            />
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="bo-input px-2 py-1.5 text-xs text-foreground/60 w-28"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <input
              type="number"
              value={form.estimatedCost}
              onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Custo orçado €"
              className="bo-input flex-1 px-2.5 py-1.5 text-xs text-foreground/70 placeholder-foreground/25"
            />
            <button
              onClick={add}
              disabled={!form.name.trim()}
              className="px-4 py-1.5 rounded-lg bg-[#1b2119] text-white/90 text-[10px] tracking-[0.15em] uppercase hover:bg-[#2a3227] transition-colors disabled:opacity-40"
            >
              Adicionar
            </button>
            <button
              onClick={() => setAdding(false)}
              className="px-3 py-1.5 text-foreground/40 text-[10px] tracking-[0.15em] uppercase hover:text-foreground/65 transition-colors"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          className="w-full py-2.5 rounded-xl border border-dashed border-foreground/15 text-foreground/40 text-[11px] tracking-[0.2em] uppercase hover:border-[#4d6350]/40 hover:text-[#4d6350] transition-colors"
        >
          + Adicionar fornecedor ao evento
        </button>
      )}
    </div>
  );
}
