"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * A segmented control (a small pill of mutually-exclusive options) for switching
 * a view's mode/filter — the calm alternative to a row of loud buttons. It sits
 * in a soft track; the active segment lifts to white with a shadow.
 *
 * Accessibility & signals
 * - Rendered as a `radiogroup` of `role="radio"` buttons with roving focus, so
 *   arrow keys move between segments and only the group holds one tab stop.
 * - Selection is never colour-only: the active segment gains elevation (white
 *   card + shadow) and `aria-checked`, both independent of hue.
 *
 * Generic over the option value `T` so `value`/`onChange` stay type-safe.
 *
 * @example
 * <Segmented
 *   ariaLabel="Vista"
 *   value={view}
 *   onChange={setView}
 *   options={[
 *     { value: "list", label: "Lista" },
 *     { value: "board", label: "Quadro" },
 *   ]}
 * />
 */

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional leading glyph. */
  icon?: ReactNode;
  /** Accessible name when `label` is icon-only. */
  ariaLabel?: string;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name for the whole group. Required. */
  ariaLabel: string;
  /** Shrink the control (denser toolbars). */
  size?: "sm" | "md";
  className?: string;
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  size = "md",
  className,
}: SegmentedProps<T>) {
  const pad = size === "sm" ? "h-8 px-3 text-xs" : "h-9 px-3.5 text-sm";

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const idx = options.findIndex((o) => o.value === value);
    if (idx === -1) return;
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = options[(idx + delta + options.length) % options.length];
    onChange(next.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        "inline-flex items-center gap-1 rounded-xl border border-foreground/[0.08] bg-foreground/[0.04] p-1",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg font-medium motion-safe:transition-colors",
              pad,
              active
                ? "bg-white text-foreground/90 shadow-[0_1px_2px_rgba(42,38,32,0.08)]"
                : "text-foreground/50 hover:text-foreground/75",
            )}
          >
            {o.icon}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
