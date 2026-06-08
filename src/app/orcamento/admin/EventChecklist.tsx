"use client";

import { useState } from "react";
import { randomId } from "./util";
import type { Quote, ChecklistItem } from "../types";
import { checklistTemplate } from "@/lib/checklist-templates";

interface Props {
  quote: Quote;
  onChange: (items: ChecklistItem[]) => void;
}

export default function EventChecklist({ quote, onChange }: Props) {
  const [items, setItems] = useState<ChecklistItem[]>(quote.checklist ?? []);
  const [newItem, setNewItem] = useState("");

  function persist(next: ChecklistItem[]) {
    setItems(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ checklist: next }),
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
    <div className="border-t border-foreground/10 pt-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-foreground/22 text-[10px] tracking-[0.35em] uppercase">
          Checklist de Produção
        </p>
        {items.length > 0 && (
          <span className="text-foreground/35 text-[10px] tabular-nums">
            {doneCount}/{items.length}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <button
          onClick={seed}
          className="w-full py-2.5 rounded-md border border-dashed border-foreground/15 text-foreground/40 text-[11px] tracking-[0.2em] uppercase hover:border-moss/40 hover:text-moss transition-colors"
        >
          + Gerar checklist do evento
        </button>
      ) : (
        <>
          <div className="h-1 bg-foreground/6 rounded-full overflow-hidden mb-4">
            <div
              className="h-full bg-moss rounded-full transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex flex-col gap-0.5 mb-3">
            {items.map((i) => (
              <div key={i.id} className="group flex items-center gap-2.5 py-1.5">
                <button
                  onClick={() => toggle(i.id)}
                  role="checkbox"
                  aria-checked={i.done}
                  aria-label={i.label}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-moss/55 ${i.done ? "bg-moss border-moss" : "border-foreground/25 hover:border-moss/60"}`}
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
                  className={`flex-1 text-xs ${i.done ? "text-foreground/30 line-through" : "text-foreground/60"}`}
                >
                  {i.label}
                </span>
                <button
                  onClick={() => remove(i.id)}
                  className="text-foreground/20 hover:text-[#b5654a] opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-all shrink-0"
                  aria-label="Remover"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && add()}
              placeholder="Adicionar item…"
              className="flex-1 bg-surface border border-foreground/15 rounded-md px-3 py-1.5 text-xs text-foreground/70 placeholder-foreground/22 focus:outline-none focus:border-moss/45"
            />
            <button
              onClick={add}
              className="px-3 py-1.5 rounded-md border border-foreground/15 text-foreground/45 text-xs hover:border-moss/40 hover:text-moss transition-colors"
            >
              +
            </button>
          </div>
        </>
      )}
    </div>
  );
}
