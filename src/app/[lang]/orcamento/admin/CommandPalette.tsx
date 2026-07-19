"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Quote } from "@/lib/orcamento/types";
import { useFocusTrap } from "./useFocusTrap";

export interface Command {
  id: string;
  label: string;
  hint?: string;
  group: string;
  run: () => void;
}

export interface RecentQuote {
  id: string;
  name: string;
  email: string;
  status: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  navCommands: Command[];
  quotes: Quote[];
  onOpenQuote: (q: Quote) => void;
  recentQuotes?: RecentQuote[];
}

/**
 * ⌘K / Ctrl+K command palette: jump to any view or search a quote by name,
 * email or id. Keyboard-first, on-brand, minimal.
 */
export default function CommandPalette({
  open,
  onClose,
  navCommands,
  quotes,
  onOpenQuote,
  recentQuotes,
}: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  // Trap Tab within the dialog + restore focus to the trigger on close.
  const dialogRef = useFocusTrap<HTMLDivElement>(open);

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
              .some((v) => String(v).toLowerCase().includes(q)),
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

    const recentMatches: Command[] =
      !q && recentQuotes?.length
        ? (recentQuotes
            .map((r) => {
              const full = quotes.find((x) => x.id === r.id);
              if (!full) return null;
              return {
                id: `recent-${r.id}`,
                label: r.name,
                hint: r.email,
                group: "Recentes",
                run: () => onOpenQuote(full),
              };
            })
            .filter(Boolean) as Command[])
        : [];

    return [...recentMatches, ...navMatches, ...quoteMatches];
  }, [query, navCommands, quotes, onOpenQuote, recentQuotes]);

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
    <div
      className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-[#1b2119]/50 backdrop-blur-sm" />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pesquisar e navegar"
        className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-foreground/[0.08] bg-white shadow-[0_24px_60px_-12px_rgba(27,33,25,0.35)]"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-3 border-b border-foreground/[0.07] px-4 py-3.5">
          <svg
            className="shrink-0 text-foreground/40"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Pesquisar ou navegar…"
            className="flex-1 bg-transparent text-[15px] text-foreground/90 placeholder-foreground/35 focus:outline-none"
          />
          <kbd className="rounded-md border border-foreground/15 px-1.5 py-0.5 text-[10px] tracking-wider text-foreground/45">
            ESC
          </kbd>
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <p className="py-10 text-center text-sm text-foreground/45">
              Sem resultados para “{query.trim()}”.
            </p>
          )}
          {groups.map((g) => (
            <div key={g.name} className="mb-1 last:mb-0">
              <p className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.18em] text-foreground/45">
                {g.name}
              </p>
              {g.items.map((c) => {
                flatIndex++;
                const idx = flatIndex;
                const isActive = active === idx;
                return (
                  <button
                    key={c.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => {
                      c.run();
                      onClose();
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left motion-safe:transition-colors ${
                      isActive ? "bg-[#4d6350]/[0.12]" : "hover:bg-foreground/[0.04]"
                    }`}
                  >
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                        isActive
                          ? "bg-[#4d6350]/[0.16] text-[#4d6350]"
                          : "bg-foreground/[0.05] text-foreground/40"
                      }`}
                      aria-hidden="true"
                    >
                      {c.hint ? (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <circle cx="12" cy="8" r="3.2" />
                          <path d="M5.5 19a6.5 6.5 0 0 1 13 0" strokeLinecap="round" />
                        </svg>
                      ) : (
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                        >
                          <path
                            d="M5 12h14M13 6l6 6-6 6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`min-w-0 flex-1 truncate text-sm ${
                        isActive ? "font-medium text-[#4d6350]" : "text-foreground/75"
                      }`}
                    >
                      {c.label}
                    </span>
                    {c.hint && (
                      <span className="max-w-[180px] shrink-0 truncate text-xs text-foreground/40">
                        {c.hint}
                      </span>
                    )}
                    {isActive && (
                      <kbd className="shrink-0 rounded-md border border-[#4d6350]/25 px-1.5 py-0.5 text-[10px] text-[#4d6350]">
                        ↵
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-4 border-t border-foreground/[0.07] px-4 py-2.5 text-[11px] text-foreground/45">
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-foreground/15 px-1.5 py-0.5">↑↓</kbd> navegar
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-foreground/15 px-1.5 py-0.5">↵</kbd> abrir
          </span>
          <span className="flex items-center gap-1.5">
            <kbd className="rounded-md border border-foreground/15 px-1.5 py-0.5">esc</kbd> fechar
          </span>
        </div>
      </div>
    </div>
  );
}
