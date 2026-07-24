"use client";

import { useMemo, useState } from "react";
import { randomId, eur2 } from "./util";
import { useToast } from "./Toast";
import { Button, EmptyState } from "./ui";
import type { Quote, ChecklistItem, EventSupplierStatus } from "@/lib/orcamento/types";
import {
  DECOR_PRODUCTION,
  PRODUCTION_PHASE_SEP,
  buildProductionPlanItems,
} from "@/lib/production-templates";

interface Props {
  quote: Quote;
  onChange?: (productionPlan: ChecklistItem[]) => void;
}

const STATUS_LABEL: Record<EventSupplierStatus, { label: string; color: string }> = {
  contactado: { label: "Contactado", color: "#8a8a82" },
  confirmado: { label: "Confirmado", color: "#7c854b" },
  pago: { label: "Pago", color: "#4d6350" },
};

// Separador + transform partilhados com o seed do servidor (production-templates),
// para o plano gerado na UI e o gerado no aceite da proposta serem idênticos.
const SEP = PRODUCTION_PHASE_SEP;

/**
 * Decor production plan: a phased atelier timeline (Sourcing → Strike) stored
 * in the quote's own `productionPlan` field (separado do `checklist` do evento,
 * para os dois painéis não se sobreporem). One click seeds the phase tasks as
 * ChecklistItems (prefixed with the phase), each toggle PATCHes
 * /api/orcamento/:id. Suppliers booked in Custos are surfaced read-only so the
 * per-event supplier assignment is visible from the production view.
 */
export default function ProductionPlan({ quote, onChange }: Props) {
  const { toast } = useToast();
  // Novo campo dedicado: default [] quando ausente. Sem migração de dados — em
  // orçamentos antigos, itens de produção que tenham ficado gravados em
  // `checklist` permanecem lá intactos até serem re-aplicados aqui.
  const [items, setItems] = useState<ChecklistItem[]>(quote.productionPlan ?? []);
  const [newLabel, setNewLabel] = useState("");
  const [newPhase, setNewPhase] = useState<string>(DECOR_PRODUCTION[0].key);
  const suppliers = quote.eventSuppliers ?? [];

  async function persist(next: ChecklistItem[]) {
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = items;
    setItems(next);
    onChange?.(next);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionPlan: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      setItems(snapshot);
      onChange?.(snapshot);
      toast("Não foi possível guardar o plano de produção. Tente novamente.", "error");
    }
  }

  function applyPlan() {
    const existing = new Set(items.map((i) => i.label));
    const additions = buildProductionPlanItems(randomId, existing);
    if (additions.length === 0) return;
    persist([...items, ...additions]);
  }

  function toggle(id: string) {
    persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }

  function removeItem(id: string) {
    persist(items.filter((i) => i.id !== id));
  }

  // Tarefa própria: prefixa a fase escolhida (mesmo formato do seed) para o
  // agrupamento por fase continuar a funcionar.
  function addCustom() {
    const label = newLabel.trim();
    if (!label) return;
    const phase = DECOR_PRODUCTION.find((p) => p.key === newPhase) ?? DECOR_PRODUCTION[0];
    persist([...items, { id: randomId(), label: `${phase.label}${SEP}${label}`, done: false }]);
    setNewLabel("");
  }

  // Group the production plan by phase via the label prefix.
  const grouped = useMemo(
    () =>
      DECOR_PRODUCTION.map((phase) => {
        const prefix = phase.label + SEP;
        const phaseItems = items.filter((i) => i.label.startsWith(prefix));
        const done = phaseItems.filter((i) => i.done).length;
        return { phase, phaseItems, done };
      }),
    [items],
  );

  const seeded = grouped.some((g) => g.phaseItems.length > 0);

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="bo-eyebrow">Produção Decor</p>
        <div className="flex shrink-0 items-center gap-2">
          {items.length > 0 && (
            <span className="rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-foreground/55">
              {items.filter((i) => i.done).length}/{items.length} do plano
            </span>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={applyPlan}
            iconLeft={<span aria-hidden="true">+</span>}
          >
            Aplicar plano de produção
          </Button>
        </div>
      </div>

      {!seeded ? (
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
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3 3 8l9 5 9-5-9-5Z" />
              <path d="m3 13 9 5 9-5" />
            </svg>
          }
          title="Plano de produção por gerar"
          description="Gere as tarefas de atelier — do sourcing das flores à desmontagem no local — e ajuste-as a este evento."
          action={{ label: "Aplicar plano de produção", onClick: applyPlan }}
        />
      ) : (
        <div className="flex flex-col gap-4 mb-4">
          {grouped.map(({ phase, phaseItems, done }) => {
            if (phaseItems.length === 0) return null;
            const pct = Math.round((done / phaseItems.length) * 100);
            return (
              <div key={phase.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-foreground/55 text-[11px] font-medium tracking-[0.08em] uppercase">
                    {phase.label}
                  </p>
                  <span className="text-foreground/35 text-[10px] tabular-nums bg-foreground/[0.05] rounded-full px-2 py-0.5">
                    {done}/{phaseItems.length}
                  </span>
                </div>
                <div className="h-1 bg-foreground/[0.06] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-[#4d6350] rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  {phaseItems.map((i) => (
                    <div key={i.id} className="group flex items-center gap-2.5 py-1.5">
                      <button
                        onClick={() => toggle(i.id)}
                        role="checkbox"
                        aria-checked={i.done}
                        aria-label={i.label}
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${i.done ? "bg-[#4d6350] border-[#4d6350]" : "border-foreground/25 hover:border-[#4d6350]/60"}`}
                      >
                        {i.done && (
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
                      <span
                        className={`flex-1 text-sm ${i.done ? "text-foreground/35 line-through" : "text-foreground/70"}`}
                      >
                        {i.label.slice((phase.label + SEP).length)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(i.id)}
                        aria-label="Remover tarefa"
                        className="shrink-0 text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Adicionar uma tarefa própria a qualquer fase do plano. */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={newPhase}
          onChange={(e) => setNewPhase(e.target.value)}
          aria-label="Fase"
          className="bo-input w-auto px-2.5 py-2 text-xs text-foreground/70"
        >
          {DECOR_PRODUCTION.map((p) => (
            <option key={p.key} value={p.key}>
              {p.label}
            </option>
          ))}
        </select>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") addCustom();
          }}
          placeholder="Nova tarefa (ex.: encomendar velas)"
          aria-label="Nova tarefa de produção"
          className="bo-input min-w-[10rem] flex-1 px-2.5 py-2 text-xs text-foreground/80"
        />
        <Button
          size="sm"
          onClick={addCustom}
          disabled={!newLabel.trim()}
          iconLeft={<span aria-hidden="true">+</span>}
        >
          Adicionar
        </Button>
      </div>

      {/* Suppliers assigned to this event — managed in Custos, shown read-only. */}
      <div className="mt-5 pt-4 border-t border-foreground/[0.08]">
        <div className="flex items-center justify-between mb-2.5">
          <p className="text-foreground/45 text-[11px] tracking-[0.1em] uppercase">
            Fornecedores atribuídos
          </p>
          {suppliers.length > 0 && (
            <span className="text-foreground/35 text-[10px] tabular-nums bg-foreground/[0.05] rounded-full px-2 py-0.5">
              {suppliers.length}
            </span>
          )}
        </div>
        {suppliers.length === 0 ? (
          <p className="text-foreground/45 text-xs leading-relaxed">
            Sem fornecedores atribuídos. Faça a gestão no separador Custos.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {suppliers.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2.5 bg-foreground/[0.02] border border-foreground/[0.07] rounded-xl px-3.5 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="text-foreground/80 text-xs font-medium truncate">{s.name}</p>
                  <p className="text-foreground/45 text-[10px]">{s.category}</p>
                </div>
                <span
                  className="text-[10px] tracking-[0.1em] uppercase px-2 py-0.5 rounded-md shrink-0 font-medium"
                  style={{
                    background: `${STATUS_LABEL[s.status].color}1f`,
                    color: STATUS_LABEL[s.status].color,
                  }}
                >
                  {STATUS_LABEL[s.status].label}
                </span>
                <span className="text-foreground/55 text-[11px] tabular-nums shrink-0">
                  {eur2(s.estimatedCost)}
                </span>
              </div>
            ))}
            <p className="text-foreground/40 text-[10px] mt-1">Geridos no separador Custos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
