"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

/**
 * The redesign card surface: a white panel with a hairline border, soft shadow
 * and generous rounding (`rounded-2xl`) — the calm container the whole back
 * office sits inside. It mirrors the existing `.bo-card` language but leans into
 * the roomier radii and padding of the new direction.
 *
 * `Card` is the bare surface. `SectionCard` adds a considered header
 * (eyebrow + serif title + description + right-aligned actions) for the common
 * "titled panel" case, so screens don't re-hand-roll that header every time.
 *
 * @example
 * <Card>…</Card>
 *
 * @example
 * <SectionCard
 *   eyebrow="Pipeline"
 *   title="Pedidos em aberto"
 *   description="Tudo o que aguarda resposta."
 *   actions={<Button size="sm">Novo</Button>}
 * >
 *   <QuoteList />
 * </SectionCard>
 */

export type CardPadding = "none" | "sm" | "md" | "lg";

const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-5 sm:p-6",
  lg: "p-6 sm:p-8",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Defaults to `md`. Use `none` when the content manages its own. */
  padding?: CardPadding;
}

export function Card({ padding = "md", className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-foreground/[0.08] bg-white shadow-[0_1px_2px_rgba(42,38,32,0.04)]",
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

export interface SectionCardProps extends Omit<CardProps, "title"> {
  /** Uppercase micro-heading above the title (matches the `.bo-eyebrow` discipline). */
  eyebrow?: ReactNode;
  /** The panel title, rendered in the serif display face. */
  title?: ReactNode;
  /** One calm line under the title explaining the panel. */
  description?: ReactNode;
  /** Right-aligned header actions (buttons, filters). */
  actions?: ReactNode;
}

export function SectionCard({
  eyebrow,
  title,
  description,
  actions,
  padding = "md",
  className,
  children,
  ...rest
}: SectionCardProps) {
  const hasHeader = eyebrow || title || description || actions;
  return (
    <Card padding={padding} className={className} {...rest}>
      {hasHeader && (
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="min-w-0">
            {eyebrow && <p className="bo-eyebrow mb-2">{eyebrow}</p>}
            {title && (
              <h2 className="font-display text-lg leading-tight text-foreground/90">{title}</h2>
            )}
            {description && (
              <p className="mt-1.5 text-sm leading-relaxed text-foreground/55">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </Card>
  );
}
