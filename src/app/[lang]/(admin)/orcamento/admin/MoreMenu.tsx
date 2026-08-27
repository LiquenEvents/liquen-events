"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./ui";

/**
 * A small, accessible "⋯ Mais" overflow menu for secondary/print actions.
 *
 * Keeps the primary detail header uncluttered: low-frequency actions (duplicate,
 * print run-sheet, export) live here behind one calm button.
 *
 * Accessibility
 * - Trigger is a `button` with `aria-haspopup="menu"` + `aria-expanded`.
 * - The popup is a `role="menu"` of `role="menuitem"` buttons.
 * - Opens with focus on the first item; ArrowUp/ArrowDown cycle items; Escape
 *   closes and returns focus to the trigger; a click outside dismisses it.
 * - Never signals state by colour alone — the trigger's `aria-expanded` and the
 *   presence/absence of the popup carry the state.
 */

export interface MoreMenuItem {
  label: string;
  onClick: () => void;
  icon?: ReactNode;
  /** Optional description shown under the label. */
  hint?: string;
}

export interface MoreMenuProps {
  items: MoreMenuItem[];
  /** Visible trigger label (also the accessible name alongside the glyph). */
  label?: string;
}

export function MoreMenu({ items, label = "Mais" }: MoreMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  // Focus the first item when the menu opens.
  useEffect(() => {
    if (!open) return;
    itemRefs.current[0]?.focus();
  }, [open]);

  // Dismiss on outside click / Escape while open.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  function focusItem(idx: number) {
    const n = items.length;
    const target = ((idx % n) + n) % n;
    itemRefs.current[target]?.focus();
  }

  function onItemKeyDown(e: React.KeyboardEvent<HTMLButtonElement>, idx: number) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      focusItem(idx + 1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      focusItem(idx - 1);
    } else if (e.key === "Home") {
      e.preventDefault();
      focusItem(0);
    } else if (e.key === "End") {
      e.preventDefault();
      focusItem(items.length - 1);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        // No telemóvel o rótulo esconde-se (`hidden sm:inline` abaixo) e sobra
        // só o glifo "⋯": o botão fica com 39 px de largura, três abaixo do
        // mínimo. A altura já vem dos 44 px do `ui/Button.tsx`; falta a
        // largura, e só onde há dedo.
        className="pointer-coarse:min-w-11"
        // O NOME NÃO PODE VIVER NUM RÓTULO QUE O CSS ESCONDE. O rótulo abaixo é
        // `hidden sm:inline`: no telemóvel fica `display: none`, e como o "⋯" é
        // `aria-hidden` o botão ficava LITERALMENTE sem nome — um leitor de ecrã
        // anunciava «botão» e mais nada, precisamente no ecrã onde ele é a única
        // porta para duplicar, imprimir e exportar. O `MenuDeAccoes` (o gémeo em
        // `ui/`) já trazia o seu `aria-label`; este não.
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((o) => !o)}
        iconLeft={
          <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <circle cx="5" cy="12" r="1.6" />
            <circle cx="12" cy="12" r="1.6" />
            <circle cx="19" cy="12" r="1.6" />
          </svg>
        }
      >
        <span className="hidden sm:inline">{label}</span>
      </Button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="Mais ações"
          className="absolute right-0 z-30 mt-2 w-60 origin-top-right rounded-2xl border border-foreground/[0.08] bg-white p-1.5 shadow-[var(--bo-sombra-suspensa)]"
        >
          {items.map((item, idx) => (
            <button
              key={item.label}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              role="menuitem"
              tabIndex={idx === 0 ? 0 : -1}
              onKeyDown={(e) => onItemKeyDown(e, idx)}
              onClick={() => {
                setOpen(false);
                // O foco volta ao abridor ANTES de a acção correr. O item
                // escolhido desaparece com o menu, e sem isto o foco caía no
                // `<body>`: o Tab seguinte recomeçava no topo da página, longe
                // da linha em que se estava. O Escape já devolvia o foco — esta
                // é a saída que se usa a sério, e era a que o perdia.
                //
                // Antes da acção e não depois: quando ela abre um diálogo, é
                // este botão que a armadilha de foco vai memorizar para
                // devolver no fim (ver `useFocusTrap`), e o efeito do diálogo
                // corre depois deste clique — leva o foco para dentro na mesma.
                triggerRef.current?.focus();
                item.onClick();
              }}
              className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-foreground/75 motion-safe:transition-colors hover:bg-foreground/[0.05] hover:text-foreground/90"
            >
              {item.icon && (
                <span className="mt-0.5 shrink-0 text-foreground/45" aria-hidden="true">
                  {item.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                {item.hint && (
                  <span className="mt-0.5 block text-xs leading-snug text-foreground/45">
                    {item.hint}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
