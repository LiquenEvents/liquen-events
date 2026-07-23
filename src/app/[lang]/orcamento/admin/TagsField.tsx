"use client";

import { useMemo, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useToast } from "./Toast";

interface Props {
  quote: Quote;
  /** All tags already used across quotes — powers the add-suggestions. */
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

/**
 * Free-form labels on a quote. Persists immediately (like the checklist), and
 * suggests tags already in use so the vocabulary stays consistent rather than
 * sprouting near-duplicates.
 */
export default function TagsField({ quote, suggestions, onChange }: Props) {
  const { toast } = useToast();
  const [tags, setTags] = useState<string[]>(quote.tags ?? []);
  const [input, setInput] = useState("");

  function persist(next: string[]) {
    // Otimista com reversão: falha do servidor repõe o estado e avisa.
    const snapshot = tags;
    setTags(next);
    onChange(next);
    fetch(`/api/orcamento/${quote.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    })
      .then((res) => {
        if (!res.ok) throw new Error();
      })
      .catch(() => {
        setTags(snapshot);
        onChange(snapshot);
        toast("Não foi possível guardar as etiquetas. Tente novamente.", "error");
      });
  }

  function add(raw: string) {
    const t = raw.trim();
    if (!t) return;
    // Case-insensitive de-dupe so "VIP" and "vip" don't both stick.
    if (tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setInput("");
      return;
    }
    persist([...tags, t]);
    setInput("");
  }
  function remove(t: string) {
    persist(tags.filter((x) => x !== t));
  }

  // Suggestions not yet applied to this quote, filtered by what's typed.
  const open = useMemo(() => {
    const q = input.trim().toLowerCase();
    return suggestions
      .filter((s) => !tags.some((t) => t.toLowerCase() === s.toLowerCase()))
      .filter((s) => !q || s.toLowerCase().includes(q))
      .slice(0, 6);
  }, [suggestions, tags, input]);

  return (
    <div>
      <label className="block text-[10px] text-foreground/28 tracking-[0.3em] uppercase mb-2">
        Etiquetas
      </label>
      <div className="flex flex-wrap items-center gap-1.5 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-[#4d6350]/10 text-[#4d6350] text-[11px] font-medium"
          >
            {t}
            <button
              onClick={() => remove(t)}
              className="text-[#4d6350]/50 hover:text-[#4d6350] transition-colors leading-none"
              aria-label={`Remover etiqueta ${t}`}
            >
              ×
            </button>
          </span>
        ))}
        {tags.length === 0 && <span className="text-foreground/25 text-xs">Sem etiquetas.</span>}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add(input);
          }
        }}
        placeholder="Adicionar etiqueta e Enter…"
        className="bo-input px-3 py-2 text-sm text-foreground/70 placeholder-foreground/22"
        list={`tag-suggestions-${quote.id}`}
      />
      {open.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {open.map((s) => (
            <button
              key={s}
              onClick={() => add(s)}
              className="px-2.5 py-1 rounded-full bg-foreground/[0.05] text-foreground/45 text-[11px] hover:bg-foreground/[0.09] hover:text-foreground/70 transition-colors"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
