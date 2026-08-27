"use client";

import { forwardRef } from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

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

/**
 * ── PORQUE É QUE O MOVIMENTO SAIU DAQUI ───────────────────────────────────
 *
 * Estas duas linhas eram, até agora, `motion-safe:duration-150` mais
 * `motion-safe:active:scale-[0.98]`. Duas avarias medidas no CSS compilado:
 *
 *  · os 150 ms não foram escolhidos por ninguém — são o
 *    `--default-transition-duration` do Tailwind, e apareciam iguais nos oito
 *    primitivos desta pasta porque nenhum pedia duração;
 *  · e o `scale-[0.98]` NÃO estava a transicionar. No Tailwind v4 essa classe
 *    emite a propriedade autónoma `scale: 0.98`, e a lista dizia
 *    `transition-[…,transform]` — que não cobre `scale`. O carregar era um
 *    corte seco.
 *
 * Ver `movimento.ts` para a escala e para os números. O que se ganha aqui é o
 * toque a 20 ms (o corte seco desaparece sem custar latência) e o estado nos
 * 120 ms do degrau `micro` da casa.
 */
/**
 * ── `rounded-full` E NÃO `rounded-xl`: A CURVA É DE QUEM SE CLICA ──────────
 *
 * A análise mediu os dois sites de referência e os dois dizem o mesmo com
 * números diferentes: a Apple põe `border-radius: 980px` em 33 elementos — «os
 * botões são TODOS pílulas» — e deixa os tiles e as imagens a raio zero; a
 * Pixelmatters põe 32 px (pílula) nos botões e na navegação e 8 px nos cartões
 * e nas imagens. «O raio máximo está reservado ao elemento clicável.»
 *
 * Aqui o conteúdo passou todo para 8 px de uma vez, colapsando a escala do
 * Tailwind no `globals.css`. Se este primitivo ficasse em `rounded-xl`, os 151
 * botões que passam por ele ficavam com o MESMO canto do cartão onde assentam
 * — e a distinção que este bloco inteiro serve para criar desaparecia no sítio
 * onde ela mais conta.
 *
 * Uma linha, 151 botões. Os 34 `<button>` em cru do back office ficam nos 8 px
 * de propósito: são separadores, linhas de lista e botões de ícone dentro de
 * barras — coisas que se clicam mas que SÃO a superfície, e não uma acção
 * assente nela. A pílula é para o que se destaca do que está por baixo.
 */
const BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-medium tracking-[0.02em] " +
  "select-none whitespace-nowrap disabled:opacity-45 disabled:pointer-events-none " +
  `${ESTADO} ${PRESSAO}`;

/**
 * ── A TINTA DE PRESSÃO, E ONDE ELA NÃO EXISTE ─────────────────────────────
 *
 * Onde a variante já tem uma tinta translúcida no vocabulário (`secondary`,
 * `ghost`, `subtle`), o carregar aprofunda-a um degrau — mesma cor, opacidade
 * seguinte —, e os 20 ms do `PRESSAO` cobrem-na.
 *
 * As duas variantes CHEIAS (`primary`, `danger`) ficam só com o gesto de
 * escala, e isto é uma falta assumida e não um esquecimento: escurecer um
 * `#4d6350` cheio obriga a um sexto verde e a um terceiro vermelho, e o
 * `DESIGN.md` desta pasta é explícito — «no new palette», «resist inventing a
 * parallel palette». Dois tokens de pressão resolvem-no no dia em que
 * existirem; até lá o corte seco desapareceu na mesma, porque o que o tirou
 * foi a transição, não a cor.
 */
const VARIANTS: Record<ButtonVariant, string> = {
  // Moss-dark solid — the affirmative primary action.
  primary: "bg-[#4d6350] text-white hover:bg-[#415440]",
  // Outline on white — secondary emphasis.
  //
  // Era `border-[var(--bo-hairline-strong)]` com `text-foreground/80`, e lia-se como
  // DESACTIVADO: o estado desactivado é este mesmo desenho com `opacity-45`
  // por cima, e a diferença entre os dois era pequena de mais para se notar.
  // Na entrada isso é grave — «Entrar com palavra-passe» é o caminho de quem
  // ainda não tem passkey, e parecia fora de serviço.
  //
  // O contorno passa a 28% e o texto a 90% (que dá 12,6:1 sobre branco, contra
  // os 10,2:1 de antes). Continua a ser claramente secundário ao lado do verde
  // cheio do passkey — o que muda é ler-se como disponível.
  secondary:
    "bg-white text-foreground/90 border border-foreground/28 hover:border-foreground/45 hover:bg-[var(--bo-tinta-3)] hover:text-foreground " +
    // A pressão aprofunda a MESMA tinta do hover (0,03 → 0,07). Sem cor nova:
    // é o passo de opacidade que o `DESIGN.md` já usa para hierarquia.
    "active:bg-[var(--bo-tinta-6)]",
  // Quiet until hovered — for toolbars and low-emphasis rows.
  ghost:
    "bg-transparent text-foreground/55 hover:bg-[var(--bo-tinta-6)] hover:text-foreground/80 " +
    "active:bg-[var(--bo-tinta-10)]",
  // Soft moss tint — an in-context "yes, this one" without full weight.
  subtle: "bg-[#4d6350]/10 text-[#4d6350] hover:bg-[#4d6350]/[0.16] active:bg-[#4d6350]/[0.24]",
  // Dark red solid (~5:1 on white) — destructive actions.
  danger: "bg-[#8a2a22] text-white hover:bg-[#73211b]",
};

/**
 * Alturas por tamanho, com um mínimo de 44 px onde se toca com o dedo.
 *
 * ── Porquê 44, e porquê só no dedo ────────────────────────────────────────
 * 44×44 px é o mínimo das Human Interface Guidelines da Apple (o Material
 * Design pede 48 dp). Não é gosto: a polpa do dedo cobre ~10 mm e o ecrã não
 * sabe onde está o centro dela, portanto abaixo disto a taxa de toques errados
 * sobe depressa. Com rato é outra história — o ponteiro tem um pixel de
 * precisão, e alturas de 32/40 px são o que dá a densidade calma que este back
 * office quer no portátil.
 *
 * `pointer-coarse:` resolve para `@media (pointer: coarse)`, que é verdade num
 * telemóvel ou tablet e falso com rato. Portanto: o portátil fica EXACTAMENTE
 * como estava, e o telemóvel — onde a dona trabalha a sério — passa a ter
 * alvos em que se acerta.
 *
 * `lg` já tem 48 px e não precisa de nada.
 *
 * Isto sozinho trata de 175 botões espalhados pelo back office: era a razão
 * pela qual quase todos os alvos medidos a 375 px davam 32 ou 40 px de altura.
 */
const SIZES: Record<ButtonSize, string> = {
  sm: "h-8 pointer-coarse:h-11 px-3 text-xs",
  md: "h-10 pointer-coarse:h-11 px-4 text-sm",
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
