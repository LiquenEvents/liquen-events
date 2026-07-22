"use client";

import { useState } from "react";
import { randomId } from "./util";
import { useToast } from "./Toast";
import type { Quote, ChecklistItem } from "@/lib/orcamento/types";
import { checklistTemplate } from "@/lib/checklist-templates";
import { Button, Field, EmptyState } from "./ui";

interface Props {
  quote: Quote;
  onChange: (items: ChecklistItem[]) => void;
}

export default function EventChecklist({ quote, onChange }: Props) {
  const { toast } = useToast();
  const [items, setItems] = useState<ChecklistItem[]>(quote.checklist ?? []);
  const [newItem, setNewItem] = useState("");

  function persist(next: ChecklistItem[]) {
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = items;
    setItems(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setItems(snapshot);
        onChange(snapshot);
        toast("Não foi possível guardar a checklist. Tente novamente.", "error");
      });
  }

  function seed() {
    const next = checklistTemplate(quote.category).map((label) => ({
      id: randomId(),
      label,
      done: false,
    }));
    persist(next);
  }
  function toggle(id: string) {
    persist(items.map((i) => (i.id === id ? { ...i, done: !i.done } : i)));
  }
  function remove(id: string) {
    persist(items.filter((i) => i.id !== id));
  }
  function add() {
    const l = newItem.trim();
    if (!l) return;
    persist([...items, { id: randomId(), label: l, done: false }]);
    setNewItem("");
  }

  const doneCount = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((doneCount / items.length) * 100) : 0;

  return (
    <section className="border-t border-foreground/10 pt-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="bo-eyebrow">Checklist de Produção</p>
        {items.length > 0 && (
          <span className="shrink-0 rounded-full bg-foreground/[0.05] px-2.5 py-1 text-[11px] tabular-nums text-foreground/55">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
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
              <path d="M9 11l3 3L22 4" />
              <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
            </svg>
          }
          title="Sem checklist ainda"
          description="Comece por um modelo pensado para este tipo de evento e ajuste os itens à vontade."
          action={{ label: "Gerar checklist do evento", onClick: seed }}
        />
      ) : (
        <>
          <div
            className="mb-5 h-1.5 overflow-hidden rounded-full bg-foreground/[0.06]"
            role="progressbar"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da checklist"
          >
            <div
              className="h-full rounded-full bg-[#4d6350] motion-safe:transition-[width] motion-safe:duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <ul className="mb-5 flex flex-col gap-0.5">
            {items.map((i) => (
              <li
                key={i.id}
                className="group flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-foreground/[0.02]"
              >
                <button
                  onClick={() => toggle(i.id)}
                  role="checkbox"
                  aria-checked={i.done}
                  aria-label={i.label}
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border motion-safe:transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4d6350]/55 ${
                    i.done
                      ? "border-[#4d6350] bg-[#4d6350]"
                      : "border-foreground/30 hover:border-[#4d6350]/60"
                  }`}
                >
                  {i.done && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
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
                  className={`flex-1 text-sm leading-snug ${
                    i.done ? "text-foreground/35 line-through" : "text-foreground/75"
                  }`}
                >
                  {i.label}
                </span>
                <button
                  onClick={() => remove(i.id)}
                  className="shrink-0 rounded-md p-1 text-foreground/25 opacity-0 hover:text-[#8a2a22] focus-visible:opacity-100 motion-safe:transition-all group-hover:opacity-100"
                  aria-label={`Remover ${i.label}`}
                >
                  <svg
                    width="15"
                    height="15"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.7"
                    strokeLinecap="round"
                    aria-hidden="true"
                  >
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2">
            <Field
              as="input"
              label="Novo item da checklist"
              hideLabel
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Adicionar item…"
              containerClassName="flex-1"
            />
            <Button variant="primary" onClick={add} disabled={!newItem.trim()}>
              Adicionar
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
