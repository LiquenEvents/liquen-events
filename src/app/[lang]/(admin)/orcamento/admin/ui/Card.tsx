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

/**
 * ── O DEGRAU DO TELEMÓVEL E O DEGRAU DO COMPUTADOR ────────────────────────
 * O `md` é o padrão, e servia 20 px de cada lado a QUALQUER largura: 40 px dos
 * 375 de um iPhone SE — mais de um décimo do ecrã — gastos em ar à volta de
 * cada cartão, repetido em todos os cartões empilhados da vista. O `lg` fazia o
 * mesmo com 24.
 *
 * `--bo-p-cartao` é 14 px abaixo de 640 e 24 a partir daí (ver a escala do
 * espaço no `globals.css`), portanto o computador fica exactamente como estava
 * e é só o telemóvel que aperta.
 *
 * O `lg` não lê o token, e é de propósito: no token os dois degraus ficariam
 * iguais abaixo de 640 e a palavra «lg» passava a não querer dizer nada nessa
 * largura. Fica um degrau acima (16 px) e guarda os 32 do `sm:` — é o cartão de
 * entrada e o de recuperar palavra-passe, onde o conteúdo é pouco e a folga é o
 * desenho.
 *
 * `Calendario.tsx:517` continua a mandar por cima (`!p-3 sm:!p-8`), com a conta
 * dele explicada lá: uma grelha de sete colunas não tem 14 px para dar.
 */
const PADDING: Record<CardPadding, string> = {
  none: "",
  sm: "p-4",
  md: "p-[var(--bo-p-cartao)]",
  lg: "p-4 sm:p-8",
};

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Inner padding. Defaults to `md`. Use `none` when the content manages its own. */
  padding?: CardPadding;
}

export function Card({ padding = "md", className, children, ...rest }: CardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-foreground/[0.08] bg-white ",
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
        /* 20 px entre o título do painel e o que ele mostra eram 20 px em
           qualquer largura; abaixo de 640 chegam 14, e a diferença repete-se
           uma vez por painel. */
        <div className="mb-3.5 flex items-start justify-between gap-3 sm:mb-5 sm:gap-4">
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
