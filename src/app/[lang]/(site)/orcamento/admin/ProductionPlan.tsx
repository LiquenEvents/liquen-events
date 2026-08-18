"use client";

import { useMemo, useRef, useState } from "react";
import { randomId, eur2 } from "./util";
import { useToast } from "./Toast";
import { metaFor } from "./status-meta";
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

  /**
   * Otimista com reversão — mas a reversão é para o último estado que o SERVIDOR
   * confirmou, e só quando não há gravação mais recente.
   *
   * `const snapshot = items` era lido ANTES do `await`, ou seja um instante que
   * já passou. O atelier risca tarefas em série, portanto dois PATCH no ar são o
   * caso normal: o segundo leva o plano INTEIRO (já com a primeira marcação
   * dentro) e o servidor fica com as duas; a primeira, ao falhar, repunha o
   * instante anterior às DUAS e desriscava uma tarefa que estava gravada.
   */
  const gravacoes = useRef(0);
  const gravado = useRef<ChecklistItem[]>(quote.productionPlan ?? []);

  async function persist(next: ChecklistItem[]) {
    const minha = ++gravacoes.current;
    setItems(next);
    onChange?.(next);
    try {
      const res = await fetch(`/api/orcamento/${quote.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productionPlan: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      if (minha === gravacoes.current) gravado.current = next;
    } catch {
      // Já foi substituída por uma gravação mais recente: o que essa levar
      // contém o que esta levava, portanto não há nada a desfazer nem nada a
      // dizer. Se ELA também falhar, é ela que repõe — e para o mesmo sítio.
      if (minha !== gravacoes.current) return;
      setItems(gravado.current);
      onChange?.(gravado.current);
      toast("Não foi possível guardar o plano de produção. Tenta novamente.", "error");
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

  /**
   * Group the production plan by phase via the label prefix — MAIS o que não
   * cair em fase nenhuma.
   *
   * O crachá «X/Y do plano» lê a lista inteira e a vista só desenhava o que
   * tivesse prefixo: uma tarefa sem ele era contada e invisível, e — sem linha
   * — também não tinha caixa para riscar nem × para remover. Ficava presa no
   * plano a puxar o denominador, com ela a contar cinco no ecrã e a ler «2/6».
   *
   * E o rótulo não é um campo privado deste painel: repor uma cópia de
   * segurança traz o `productionPlan` do ficheiro tal e qual (`looseObject`), o
   * PATCH aceita qualquer texto até 300 caracteres, e mudar o NOME de uma fase
   * em `DECOR_PRODUCTION` desprende de uma vez tudo o que já está gravado (o
   * que se guarda é o rótulo, não a chave da fase).
   *
   * O grupo das sobras só existe quando há sobras — com o plano normal não há
   * secção nenhuma a mais.
   */
  const grupos = useMemo(() => {
    const porFase = DECOR_PRODUCTION.map((phase) => {
      const prefixo = phase.label + SEP;
      return {
        key: phase.key,
        titulo: phase.label,
        prefixo,
        itens: items.filter((i) => i.label.startsWith(prefixo)),
      };
    });
    const arrumados = new Set(porFase.flatMap((g) => g.itens.map((i) => i.id)));
    const sobras = items.filter((i) => !arrumados.has(i.id));
    const todos =
      sobras.length > 0
        ? [...porFase, { key: "sem-fase", titulo: "Sem fase", prefixo: "", itens: sobras }]
        : porFase;
    return todos.map((g) => ({ ...g, feitos: g.itens.filter((i) => i.done).length }));
  }, [items]);

  // O crachá e o desenho passam a ler a MESMA lista: se há itens, há-os para
  // ver. Era esta a distância que deixava o vazio «por gerar» ao lado de um
  // crachá que já contava tarefas — e aplicar o plano por cima duplicava-as.
  const seeded = items.length > 0;

  return (
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <p className="bo-eyebrow">Produção Decor</p>
        <div className="flex flex-wrap items-center gap-2">
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
          description="Gera as tarefas de atelier — do sourcing das flores à desmontagem no local — e ajusta-as a este evento."
          action={{ label: "Aplicar plano de produção", onClick: applyPlan }}
        />
      ) : (
        <div className="flex flex-col gap-4 mb-4">
          {grupos.map(({ key, titulo, prefixo, itens, feitos }) => {
            if (itens.length === 0) return null;
            const pct = Math.round((feitos / itens.length) * 100);
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-foreground/55 text-[11px] font-medium tracking-[0.08em] uppercase">
                    {titulo}
                  </p>
                  <span className="text-foreground/35 text-[10px] tabular-nums bg-foreground/[0.05] rounded-full px-2 py-0.5">
                    {feitos}/{itens.length}
                  </span>
                </div>
                <div className="h-1 bg-foreground/[0.06] rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-[#4d6350] rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  {itens.map((i) => (
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
                        {/* Sem fase não há prefixo a cortar: mostra-se inteiro. */}
                        {i.label.slice(prefixo.length)}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeItem(i.id)}
                        aria-label="Remover tarefa"
                        className="alvo-toque shrink-0 p-1 text-foreground/20 hover:text-[#b5654a] opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100 transition-all"
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
            Sem fornecedores atribuídos. Faz a gestão no separador Custos.
          </p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {suppliers.map((s) => {
              // `STATUS_LABEL[s.status].color` à bruta era `undefined.color`
              // assim que aparecesse um estado de fora — uma linha antiga, uma
              // migração, uma correcção feita à mão na base de dados. Num
              // componente de cliente isso não perde a linha do fornecedor:
              // perde o back office inteiro para o ecrã de erro. O valor cru
              // fica à vista, em cinzento, para se saber qual é a linha.
              const estado = metaFor(STATUS_LABEL, s.status);
              return (
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
                      background: `${estado.color}1f`,
                      color: estado.color,
                    }}
                  >
                    {estado.label}
                  </span>
                  <span className="text-foreground/55 text-[11px] tabular-nums shrink-0">
                    {eur2(s.estimatedCost)}
                  </span>
                </div>
              );
            })}
            <p className="text-foreground/40 text-[10px] mt-1">Geridos no separador Custos.</p>
          </div>
        )}
      </div>
    </div>
  );
}
