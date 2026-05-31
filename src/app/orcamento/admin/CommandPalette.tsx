"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Quote } from "../types";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

interface Props {
  open: boolean;
  onClose: () => void;
  navCommands: Command[];
  quotes: Quote[];
  onOpenQuote: (q: Quote) => void;
}

/**
 * ⌘K / Ctrl+K command palette: jump to any view or search a quote by name,
 * email or id. Keyboard-first, on-brand, minimal.
 */
export default function CommandPalette({ open, onClose, navCommands, quotes, onOpenQuote }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const navMatches = navCommands.filter((c) => !q || c.label.toLowerCase().includes(q));

    const quoteMatches: Command[] = q
      ? quotes
          .filter((quote) =>
            [quote.name, quote.email, quote.id, quote.phone]
              .filter(Boolean)
              .some((v) => String(v).toLowerCase().includes(q))
          )
          .slice(0, 6)
          .map((quote) => ({
            id: `quote-${quote.id}`,
            label: quote.name,
            hint: quote.email,
            group: "Pedidos",
            run: () => onOpenQuote(quote),
          }))
      : [];

    return [...navMatches, ...quoteMatches];
  }, [query, navCommands, quotes, onOpenQuote]);

  useEffect(() => {
    if (active >= results.length) setActive(0);
  }, [results.length, active]);

  if (!open) return null;

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const cmd = results[active];
      if (cmd) {
        cmd.run();
        onClose();
      }
    } else if (e.key === "Escape") {
      onClose();
    }
  }

  // Group results preserving order
  const groups: { name: string; items: Command[] }[] = [];
  for (const r of results) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) {
      g = { name: r.group, items: [] };
      groups.push(g);
    }
    g.items.push(r);
  }
  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center pt-[12vh] px-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-lg bg-surface-elevated/95 backdrop-blur-xl border border-foreground/12 rounded-xl shadow-2xl shadow-black/60 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-foreground/8">
          <svg className="text-foreground/30" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar ou navegar…"
            className="flex-1 bg-transparent text-foreground/80 text-sm placeholder-foreground/25 focus:outline-none"
          />
          <kbd className="text-[9px] text-foreground/30 border border-foreground/12 rounded px-1.5 py-0.5 tracking-wider">ESC</kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-2">
          {results.length === 0 && (
            <p className="text-foreground/25 text-sm text-center py-8">Sem resultados.</p>
          )}
          {groups.map((g) => (
            <div key={g.name} className="mb-1">
              <p className="px-4 py-1.5 text-foreground/22 text-[9px] tracking-[0.3em] uppercase">{g.name}</p>
              {g.items.map((c) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => { c.run(); onClose(); }}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      active === idx ? "bg-moss/15" : "hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <span className={`text-sm ${active === idx ? "text-moss" : "text-foreground/65"}`}>{c.label}</span>
                    {c.hint && <span className="text-foreground/25 text-xs truncate max-w-[180px]">{c.hint}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 px-4 py-2.5 border-t border-foreground/8 text-foreground/25 text-[10px]">
          <span className="flex items-center gap-1.5"><kbd className="border border-foreground/12 rounded px-1">↑↓</kbd> navegar</span>
          <span className="flex items-center gap-1.5"><kbd className="border border-foreground/12 rounded px-1">↵</kbd> abrir</span>
        </div>
      </div>
    </div>
  );
}
