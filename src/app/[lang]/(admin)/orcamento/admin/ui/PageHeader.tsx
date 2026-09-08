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
        {/* ── A ESCALA, E O PESO QUE NÃO MUDA ──────────────────────────────
            Do sistema de design: título de página em `title1`, e o leading é
            ABSOLUTO — «nunca uses `line-height` unitless nesta escala». Por
            isso sai o `leading-tight` (1,25 sem unidade) e sai o `text-2xl`,
            que dava o tamanho certo e mais nada: o que a escala traz por cima
            é a entrelinha em píxeis e o TRACKING, que é o detalhe que faz um
            título grande parecer desenhado em vez de esticado.

            Os dois tamanhos ficam ao milímetro onde estavam — `title1` são os
            24 px do `text-2xl`, `display` são os 30 px do `text-3xl` —, e por
            isso a conta de altura escrita aqui em cima continua a valer.

            ── O QUE O DOCUMENTO PEDE E NÃO SE FAZ, E PORQUÊ ────────────────

            O mapeamento fixo diz «título de página `title1/600`». O peso NÃO
            muda, e não é distracção: há uma instrução dela, anterior e mais
            específica, escrita no `globals.css` com as palavras dela — foi ver
            qual era a letra que queria, trouxe o nome (Geist, a da Vercel) e
            descreveu-a como «tracking negativo forte nos títulos e PESO NORMAL
            em vez de negrito».

            Um documento geral não desfaz uma instrução dela sobre o caso
            exacto. O que a escala traz é precisamente a metade que ela pediu —
            o aperto —, e essa entra. */}
        <Heading className="font-display text-title1 text-[var(--bo-text)] sm:text-display">
          {title}
        </Heading>
        {subtitle && (
          <p className="mt-1.5 max-w-prose text-callout text-[var(--bo-text-muted)] sm:mt-2">
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
