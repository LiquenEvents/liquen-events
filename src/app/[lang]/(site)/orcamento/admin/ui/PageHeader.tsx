"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";

/**
 * The header that opens a back-office screen: a small uppercase eyebrow, a serif
 * display title, an optional calm subtitle, and right-aligned actions. Generous
 * vertical rhythm gives each view room to breathe — the anchor of the roomy,
 * ChatGPT-app-like layout.
 *
 * Keeps the Líquen identity: the title uses `font-display` (Playfair) and the
 * eyebrow reuses the shared `.bo-eyebrow` token. On narrow screens the actions
 * drop below the title instead of crowding it.
 *
 * @example
 * <PageHeader
 *   eyebrow="Back office"
 *   title="Visão geral"
 *   subtitle="O estado de todos os trabalhos, num relance."
 *   actions={<Button iconLeft={<PlusIcon />}>Novo pedido</Button>}
 * />
 */

export interface PageHeaderProps {
  /** Uppercase micro-heading above the title. */
  eyebrow?: ReactNode;
  /** The screen title, rendered in the serif display face. Required. */
  title: ReactNode;
  /** One or two calm lines under the title. */
  subtitle?: ReactNode;
  /** Right-aligned actions (buttons, filters). */
  actions?: ReactNode;
  /** Heading level for the title, for correct document outline. Defaults to `h1`. */
  as?: "h1" | "h2";
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  as: Heading = "h1",
  className,
}: PageHeaderProps) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 pb-6 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="bo-eyebrow mb-2.5">{eyebrow}</p>}
        <Heading className="font-display text-2xl leading-tight text-foreground/90 sm:text-3xl">
          {title}
        </Heading>
        {subtitle && (
          <p className="mt-2 max-w-prose text-sm leading-relaxed text-foreground/55">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </header>
  );
}
