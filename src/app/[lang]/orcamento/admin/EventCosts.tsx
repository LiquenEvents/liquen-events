"use client";

import { useEffect, useMemo, useState } from "react";
import { parseMoney, randomId, eur2 } from "./util";
import { useToast } from "./Toast";
import type { Quote, EventSupplier, EventSupplierStatus, Supplier } from "@/lib/orcamento/types";
import { contractedAmounts, effectiveVatRate } from "@/lib/orcamento/dossier";
import { round2 } from "@/lib/money";
import { Button, Field, EmptyState } from "./ui";

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
  const { toast } = useToast();
  const [items, setItems] = useState<EventSupplier[]>(quote.eventSuppliers ?? []);
  const [directory, setDirectory] = useState<Supplier[]>([]);
  const [adding, setAdding] = useState(false);
  // Buffer de escrita por campo ("id:est" / "id:act") — deixa escrever "1.500,50"
  // livremente e só grava (um PATCH) ao sair do campo, em vez de a cada tecla.
  const [draft, setDraft] = useState<Record<string, string>>({});
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

  // Receita e custos comparados na MESMA base (sem IVA): o preço "Preço final
  // (sem IVA)" já é líquido; os custos de fornecedor são com IVA e o IVA é
  // dedutível, por isso divide-se por (1+taxa). Assim a margem é o lucro real —
  // antes comparava receita sem IVA com custos com IVA (margem falsamente baixa).
  const amounts = contractedAmounts(quote);
  const vatRate = effectiveVatRate(quote);
  const totals = useMemo(() => {
    let estimated = 0;
    let actual = 0;
    for (const it of items) {
      estimated += it.estimatedCost || 0;
      actual += it.actualCost ?? it.estimatedCost ?? 0;
    }
    const actualNet = round2(actual / (1 + vatRate));
    const revenueNet = amounts.net;
    const margin = round2(revenueNet - actualNet);
    const marginPct = revenueNet > 0 ? Math.round((margin / revenueNet) * 100) : 0;
    return { estimated, actual, actualNet, revenueNet, margin, marginPct };
  }, [items, amounts.net, vatRate]);

  function persist(next: EventSupplier[]) {
    // Otimista com reversão + aviso: custos errados no ecrã sem estarem na base
    // de dados corrompiam a margem sem ninguém saber.
    const snapshot = items;
    setItems(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventSuppliers: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setItems(snapshot);
        onChange(snapshot);
        toast("Não foi possível guardar o custo. Tente novamente.", "error");
      });
  }

  function add() {
    const name = form.name.trim();
    if (!name) return;
    const est = parseMoney(form.estimatedCost) ?? 0;
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
    <div className="border-t border-foreground/10 pt-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Fornecedores &amp; Custos</p>
        {items.length > 0 && (
          <span className="rounded-full bg-foreground/[0.05] px-2.5 py-0.5 text-[11px] tabular-nums text-foreground/55">
            {items.length}
          </span>
        )}
      </div>

      {/* Margin summary — the headline number. Receita/Custos/Margem na mesma base
          (sem IVA) para reconciliarem no ecrã; o valor com IVA vai por baixo. */}
      <div className="mb-5 grid grid-cols-3 gap-2.5">
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-center">
          <p className="text-sm font-semibold text-foreground/80 tabular-nums">
            {eur2(totals.revenueNet)}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-foreground/45">
            Receita (s/ IVA)
          </p>
          <p className="mt-1 text-[9px] tabular-nums text-foreground/35 leading-tight">
            c/ IVA {eur2(amounts.gross)}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-center">
          <p className="text-sm font-semibold text-[#a4642f] tabular-nums">
            {eur2(totals.actualNet)}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-foreground/45">
            Custos (s/ IVA)
          </p>
          <p className="mt-1 text-[9px] tabular-nums text-foreground/35 leading-tight">
            c/ IVA {eur2(totals.actual)}
          </p>
        </div>
        <div className="rounded-xl border border-foreground/[0.06] bg-foreground/[0.03] p-3 text-center">
          <p
            className={`text-sm font-semibold tabular-nums ${totals.margin >= 0 ? "text-[#4d6350]" : "text-[#8a2a22]"}`}
          >
            {eur2(totals.margin)}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.16em] text-foreground/45">
            Margem{totals.revenueNet > 0 ? ` · ${totals.marginPct}%` : ""}
          </p>
          {totals.margin < 0 && (
            <p className="mt-1 text-[9px] uppercase tracking-[0.12em] text-[#8a2a22] leading-tight">
              Prejuízo
            </p>
          )}
        </div>
      </div>

      {/* Bookings list */}
      {items.length > 0 && (
        <div className="mb-4 flex flex-col gap-2">
          {items.map((it) => (
            <div
              key={it.id}
              className="group rounded-xl border border-foreground/[0.08] bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(42,38,32,0.04)]"
            >
              <div className="flex items-center gap-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground/80">{it.name}</p>
                  <p className="text-[11px] text-foreground/45">{it.category}</p>
                </div>
                <button
                  onClick={() => cycleStatus(it)}
                  className="shrink-0 rounded-md px-2.5 py-1 text-[10px] uppercase tracking-[0.1em] motion-safe:transition-opacity hover:opacity-80"
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
                  className="shrink-0 text-foreground/25 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-[#8a2a22] motion-safe:transition-all"
                  aria-label="Remover"
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" strokeLinecap="round" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <Field
                  as="input"
                  type="text"
                  inputMode="decimal"
                  label="Orçado (€)"
                  value={draft[`${it.id}:est`] ?? (it.estimatedCost || "")}
                  onChange={(e) => setDraft((d) => ({ ...d, [`${it.id}:est`]: e.target.value }))}
                  onBlur={(e) => {
                    update(it.id, { estimatedCost: parseMoney(e.target.value) ?? 0 });
                    setDraft((d) => {
                      const n = { ...d };
                      delete n[`${it.id}:est`];
                      return n;
                    });
                  }}
                  placeholder="0"
                />
                <Field
                  as="input"
                  type="text"
                  inputMode="decimal"
                  label="Real (€)"
                  value={draft[`${it.id}:act`] ?? it.actualCost ?? ""}
                  onChange={(e) => setDraft((d) => ({ ...d, [`${it.id}:act`]: e.target.value }))}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    update(it.id, { actualCost: v === "" ? undefined : (parseMoney(v) ?? 0) });
                    setDraft((d) => {
                      const n = { ...d };
                      delete n[`${it.id}:act`];
                      return n;
                    });
                  }}
                  placeholder="—"
                />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add booking */}
      {adding ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-foreground/[0.08] bg-foreground/[0.02] p-4">
          {directory.length > 0 && (
            <Field
              as="select"
              label="Do diretório de fornecedores"
              value={form.supplierId}
              onChange={(e) => pickDirectory(e.target.value)}
            >
              <option value="">Escolher do diretório…</option>
              {directory.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.category}
                </option>
              ))}
            </Field>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Nome do fornecedor"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value, supplierId: "" }))}
              placeholder="Ex.: Flores da Vila"
              autoFocus
            />
            <Field
              as="select"
              label="Categoria"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Field>
          </div>
          <Field
            as="input"
            type="text"
            inputMode="decimal"
            label="Custo orçado (€)"
            value={form.estimatedCost}
            onChange={(e) => setForm((f) => ({ ...f, estimatedCost: e.target.value }))}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder="0"
          />
          <div className="flex items-center gap-2 pt-1">
            <Button variant="primary" onClick={add} disabled={!form.name.trim()}>
              Adicionar
            </Button>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          className="px-4 py-10"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path d="M3 7h18M3 12h18M3 17h18" strokeLinecap="round" />
            </svg>
          }
          title="Ainda sem fornecedores"
          description="Adiciona fornecedores para acompanhar custos orçados, reais e a margem do evento."
          action={{ label: "Adicionar fornecedor", onClick: () => setAdding(true) }}
        />
      ) : (
        <Button
          variant="secondary"
          fullWidth
          iconLeft={
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
          }
          onClick={() => setAdding(true)}
        >
          Adicionar fornecedor ao evento
        </Button>
      )}
    </div>
  );
}
