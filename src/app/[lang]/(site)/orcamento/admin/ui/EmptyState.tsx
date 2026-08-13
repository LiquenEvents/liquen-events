"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { Button } from "./Button";

/**
 * The "nothing here yet — here's what to do" panel. A soft rounded icon well, a
 * clear heading, one guiding line and an optional call-to-action, all centred in
 * generous space. It turns an empty screen from something that looks broken into
 * something that teaches a newcomer their next step.
 *
 * This is the redesign version living under `ui/` — a superset of the older
 * admin `EmptyState`: it adds a `description` line and delegates the CTA to the
 * shared `Button` so the action matches every other button in the tool. Nothing
 * imports it yet, so it coexists with the existing component.
 *
 * @example
 * <EmptyState
 *   icon={<InboxIcon />}
 *   title="Ainda não há pedidos"
 *   description="Quando alguém pedir um orçamento, aparece aqui."
 *   action={{ label: "Criar pedido manual", onClick: openNewQuote }}
 * />
 */

export interface EmptyStateProps {
  /** Optional glyph shown in the rounded well. Falls back to an info circle. */
  icon?: ReactNode;
  /** Short, plain-language heading. Required. */
  title: ReactNode;
  /** One or two guiding lines telling the newcomer what happens or what to do. */
  description?: ReactNode;
  /** Optional primary action. */
  action?: { label: string; onClick: () => void };
  /** Optional quieter secondary action shown beside the primary. */
  secondaryAction?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn("flex flex-col items-center justify-center px-6 py-16 text-center", className)}
    >
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4d6350]/[0.08] text-[#4d6350]">
        {icon ?? (
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v4M12 16h.01" strokeLinecap="round" />
          </svg>
        )}
      </div>
      <p className="text-base font-medium text-foreground/85">{title}</p>
      {description && (
        <p className="mt-2 max-w-sm text-sm leading-relaxed text-foreground/50">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button variant="primary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction && (
            <Button variant="ghost" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
