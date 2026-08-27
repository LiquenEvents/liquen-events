"use client";

import type { ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

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
  // 44 px de altura onde se toca com o dedo, a densidade de sempre com rato —
  // a mesma regra e a mesma razão que estão escritas em `Button.tsx`. Estes
  // segmentos são filtros ("Todas · 0", "Últimos 3 meses"), e são dos alvos em
  // que mais se toca no telemóvel.
  const pad =
    size === "sm"
      ? "h-8 pointer-coarse:h-11 px-3 text-xs"
      : "h-9 pointer-coarse:h-11 px-3.5 text-sm";

  /**
   * ── O GRUPO TEM DE TER SEMPRE UMA PORTA DE ENTRADA ────────────────────────
   *
   * O foco andante dava `tabIndex={0}` só ao segmento activo. Quando o `value`
   * não consta das opções — um filtro antigo reposto do `localStorage`, um
   * estado gravado que entretanto deixou de existir — NENHUM segmento ficava
   * activo, todos ficavam a -1, e o controlo inteiro saía da ordem de
   * tabulação: com teclado deixava de haver maneira de lá chegar, e portanto de
   * mudar o filtro que está encravado. Sem rato, o ecrã ficava preso.
   *
   * Com um `value` desconhecido, a entrada é o primeiro segmento (e as setas
   * passam a partir dele). Nada muda no caso normal.
   */
  const activeIndex = options.findIndex((o) => o.value === value);
  const entryIndex = activeIndex === -1 ? 0 : activeIndex;

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    if (options.length === 0) return;
    // Valor fora das opções: a primeira seta escolhe o ponto de entrada em vez
    // de não fazer nada (era o que prendia o teclado).
    if (activeIndex === -1) {
      onChange(options[entryIndex].value);
      return;
    }
    const delta = e.key === "ArrowRight" ? 1 : -1;
    const next = options[(activeIndex + delta + options.length) % options.length];
    onChange(next.value);
  }

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn(
        // `flex-wrap`: dois segmentos com rótulos compridos ("IVA incluído" e
        // "+ IVA (acresce)") somam mais de 375 px e o segundo ficava cortado na
        // margem. Encolhê-los cortava as palavras; abreviá-los tirava-lhes o
        // sentido. Passar para a linha de baixo não custa nada e mantém as duas
        // legíveis — num ecrã largo continuam lado a lado, porque só quebra
        // quando não cabe.
        // `rounded-full` nos dois: a caixa e cada segmento. O DESIGN.md já
        // descrevia isto como «uma pequena pílula de opções mutuamente
        // exclusivas» — passou a sê-lo. Ver a nota no `ui/Button.tsx`: a curva
        // máxima é de quem se clica.
        "inline-flex flex-wrap items-center gap-1 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] p-1",
        className,
      )}
    >
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={o.ariaLabel}
            tabIndex={i === entryIndex ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cn(
              `inline-flex items-center gap-1.5 rounded-full font-medium ${ESTADO} ${PRESSAO}`,
              pad,
              active
                ? "bg-white text-foreground/90 "
                : "text-foreground/50 hover:text-foreground/75 active:bg-foreground/[0.06]",
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
