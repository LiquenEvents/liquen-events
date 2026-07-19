"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * The back-office button, redesigned for the calm "ChatGPT-app" direction while
 * staying on the Líquen palette (moss `#4d6350`, forest ink, cream). One button
 * so every screen shares the same radii, focus ring, motion and disabled feel.
 *
 * Design notes
 * - Colours come from the existing tokens only — no new palette. `primary` fills
 *   with moss-dark `#4d6350` (≈6:1 on white → WCAG AA); `secondary` is a hairline
 *   outline; `ghost` is quiet until hover; `subtle` is the soft moss tint used for
 *   in-context actions; `danger` is a dark red that also passes AA on white.
 * - Focus ring is inherited from the global `:focus-visible` rule in globals.css
 *   (a 2px surface gap + moss halo); we only round the corners so it hugs them.
 * - Motion is gated behind `motion-safe:` so reduced-motion users get no press
 *   scale or colour tween.
 * - State is never colour-only: `loading` swaps in a spinner and sets
 *   `aria-busy`; `disabled` also lowers opacity and blocks the pointer.
 *
 * @example
 * <Button variant="primary" onClick={save}>Guardar</Button>
 * <Button variant="secondary" size="sm" iconLeft={<PlusIcon />}>Novo pedido</Button>
 * <Button variant="danger" loading={deleting}>Eliminar</Button>
 */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "subtle" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Visual weight / intent. Defaults to `primary`. */
  variant?: ButtonVariant;
  /** Padding + type scale. Defaults to `md`. */
  size?: ButtonSize;
  /** Shows a spinner, sets `aria-busy` and blocks clicks. Keeps the label visible. */
  loading?: boolean;
  /** Icon rendered before the label (or replaced by the spinner while loading). */
  iconLeft?: ReactNode;
  /** Icon rendered after the label. */
  iconRight?: ReactNode;
  /** Stretch to the full width of the container. */
  fullWidth?: boolean;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-xl font-medium tracking-[0.02em] " +
  "select-none whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none " +
  "motion-safe:transition-[background-color,color,box-shadow,transform] motion-safe:duration-150 " +
  "motion-safe:active:scale-[0.98]";

const VARIANTS: Record<ButtonVariant, string> = {
  // Moss-dark solid — the affirmative primary action.
  primary: "bg-[#4d6350] text-white shadow-sm hover:bg-[#415440]",
  // Hairline outline on white — secondary emphasis.
  secondary:
    "bg-white text-foreground/80 border border-foreground/15 shadow-sm hover:border-foreground/30 hover:text-foreground",
  // Quiet until hovered — for toolbars and low-emphasis rows.
  ghost: "bg-transparent text-foreground/55 hover:bg-foreground/[0.06] hover:text-foreground/80",
  // Soft moss tint — an in-context "yes, this one" without full weight.
  subtle: "bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/[0.16]",
  // Dark red solid (~5:1 on white) — destructive actions.
  danger: "bg-[#8a2a22] text-white shadow-sm hover:bg-[#73211b]",
};

const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-[15px]",
};

function Spinner() {
  return (
    <svg
      className="motion-safe:animate-spin shrink-0"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = "primary",
    size = "md",
    loading = false,
    iconLeft,
    iconRight,
    fullWidth = false,
    disabled,
    type,
    className,
    children,
    ...rest
  },
  ref,
) {
  return (
    <button
      ref={ref}
      // Default to type="button" so a primitive dropped inside a <form> never
      // submits it by accident — callers opt into submit explicitly.
      type={type ?? "button"}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANTS[variant], SIZES[size], fullWidth && "w-full", className)}
      {...rest}
    >
      {loading ? <Spinner /> : iconLeft}
      {children}
      {!loading && iconRight}
    </button>
  );
});
