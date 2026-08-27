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
      /* ── O TOPO DE UMA VISTA CUSTA ALTURA, E CUSTAVA A MESMA EM TODO O LADO ──
         Somado a 375 px: eyebrow 16 + 10 de margem + título 30 + 8 + subtítulo
         23 + 24 de `pb-6` = ~111 px antes da primeira linha de conteúdo, num
         ecrã de 667 onde o cabeçalho fixo e a barra de baixo já levaram 137. E
         com acções, mais 16 de `gap-4` e mais a fila delas.

         Todos os degraus abaixo de 640 passam a metade-e-pouco; a partir de
         640 fica tudo exactamente como estava. O `text-2xl sm:text-3xl` do
         título não entra nisto: já sabe encolher. */
      className={cn(
        "flex flex-col gap-2.5 pb-4 sm:flex-row sm:items-end sm:justify-between sm:gap-4 sm:pb-6",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="bo-eyebrow mb-1.5 sm:mb-2.5">{eyebrow}</p>}
        <Heading className="font-display text-2xl leading-tight text-[var(--bo-text)] sm:text-3xl">
          {title}
        </Heading>
        {subtitle && (
          <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-[var(--bo-text-faint)] sm:mt-2">
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">{actions}</div>
      )}
    </header>
  );
}
