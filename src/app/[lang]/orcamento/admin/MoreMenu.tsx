"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./ui";

/**
 * A small, accessible "⋯ Mais" overflow menu for secondary/print actions.
 *
 * Keeps the primary detail header uncluttered: low-frequency actions (duplicate,
 * print run-sheet, export) live here behind one calm button.
 *
 * Accessibility
 * - Trigger is a `button` with `aria-haspopup="menu"` + `aria-expanded`.
 * - The popup is a `role="menu"` of `role="menuitem"` buttons.
 * - Opens with focus on the first item; ArrowUp/ArrowDown cycle items; Escape
 *   closes and returns focus to the trigger; a click outside dismisses it.
 * - Never signals state by colour alone — the trigger's `aria-expanded` and the
 *   presence/absence of the popup carry the state.
 */

export interface MoreMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  /** Optional description shown under the label. */
  hint?: string;
}

export interface MoreMenuProps {
  items: MoreMenuItem[];
  /** Visible trigger label (also the accessible name alongside the glyph). */
  label?: string;
}

export function MoreMenu({ items, label = "Mais" }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
  }, [open]);

  // Dismiss on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function focusItem(idx: number) {
    const n = items.length;
    const target = ((idx % n) + n) % n;
    itemRefs.current[target]?.focus();
  }

  function onItemKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(idx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(idx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        iconLeft={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        }
      >
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Mais ações"
          className="absolute right-0 z-30 mt-2 w-60 origin-top-right rounded-2xl border border-foreground/[0.08] bg-white p-1.5 shadow-[0_8px_30px_rgba(42,38,32,0.12)]"
        >
          {items.map((item, idx) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={idx === 0 ? 0 : -1}
              onKeyDown={(e) => onItemKeyDown(e, idx)}
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground/75 motion-safe:transition-colors hover:bg-foreground/[0.05] hover:text-foreground/90"
            >
              {item.icon && (
                <span className="mt-0.5 shrink-0 text-foreground/45" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                {item.hint && (
                  <span className="mt-0.5 block text-xs leading-snug text-foreground/45">
                    {item.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
