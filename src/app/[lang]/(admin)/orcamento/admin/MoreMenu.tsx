"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "./ui";
/* A escala de movimento da casa — ver `ui/movimento.ts`. O `motion-safe:` já
   aqui estava; o que faltava era a DURAÇÃO: uma `transition-*` sem duração cai
   nos 150 ms do `--default-transition-duration` do Tailwind, que não é degrau
   nenhum desta casa. `ESTADO` são os 120 ms do `micro`, `PRESSAO` o toque. */
import { ESTADO, PRESSAO } from "./ui/movimento";
/* A saída da casa — 200 ms, `--ease-in`, quatro píxeis (a distância de um item
   de menu), e o `pointer-events` largado dentro da própria classe. O gancho é o
   que segura o nó montado esses 200 ms; o contrato está em `ui/saida.ts`. */
import { SAIDA, useSaidaDeUmSo } from "./ui/saida";

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

  /* ── A COLUNA SÓ EXISTE SE HOUVER ÍCONES ─────────────────────────────────
     A fila alinhada é o que impede um menu misto de ficar com os rótulos em
     duas colunas. Num menu em que NENHUMA acção tem ícone ela não alinha nada:
     é uma goteira de 26 px à esquerda de tudo, e um menu mais estreito por
     causa dela. Por isso pergunta-se ao menu, e não ao item. */
  const temIcones = items.some((i) => i.icon);

  /**
   * ── O MENU ENTRAVA E DESAPARECIA ──────────────────────────────────────────
   *
   * Havia `.bo-entrada` na abertura e NADA no fecho: o `{open && …}` passava a
   * falso e o painel sumia entre dois fotogramas. E as três saídas deste menu
   * (Escape, clique fora, escolher uma acção) davam todas no mesmo corte.
   *
   * Com `prefers-reduced-motion` o gancho devolve `false` no próprio instante e
   * nada disto chega a acontecer — o painel desmonta como desmontava.
   */
  const aSairAgora = useSaidaDeUmSo(open);

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
      {(open || aSairAgora) && (
        <div
          id={menuId}
          /* A SAIR, DEIXA DE SER UM MENU no mesmo fotograma do gesto. O nó fica
             montado para ter o que animar, mas sem `role`, sem nome e `inert`:
             para quem ouve o ecrã e para quem anda de Tab isto já acabou. Sem
             isto, os itens continuavam alcançáveis durante 200 ms depois de a
             pessoa já ter escolhido. */
          role={aSairAgora ? undefined : "menu"}
          aria-label={aSairAgora ? undefined : "Mais ações"}
          aria-hidden={aSairAgora || undefined}
          inert={aSairAgora}
          /* ── O MATERIAL ──────────────────────────────────────────────────
             Era `rounded-2xl border … bg-[var(--bo-surface)] p-1.5`. O `rounded-2xl` media
             8 px como todo o resto (o bloco dos raios do `globals.css` colapsa
             a escala do Tailwind para o conteúdo), e o `bg-[var(--bo-surface)]` era branco
             opaco escrito à mão — nem sequer o token da superfície.

             A `.bo-material` traz o raio de 12 px, o fio e a superfície
             translúcida; o desfoque vem à parte, para se poder baixar num
             sítio só. E a folga passa de 6 px para os 4 px do token, que é o
             número de que o raio da pastilha aqui em baixo é subtraído. */
          className={`${
            aSairAgora ? SAIDA : "bo-entrada"
          } absolute right-0 z-30 mt-2 w-60 origin-top-right bo-material bo-material-desfoque p-[var(--bo-material-folga)] shadow-[var(--bo-sombra-suspensa)]`}
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
              /* ── A LINHA SOB O RATO É UMA PASTILHA CHEIA ──────────────────
                 Era `hover:bg-[var(--bo-tinta-6)]`: seis por cento de preto.
                 Sobre um material translúcido, seis por cento não chega a ser
                 um estado — lê-se como sujidade do fundo.

                 Preenchimento de acento com texto invertido, que é o gesto das
                 capturas. Medido: branco sobre `--bo-accent` dá 6,55:1.

                 O `active:` repete a pastilha porque o `hover:` do Tailwind
                 vive dentro de `@media (hover: hover)` e no dedo não existe.
                 E o `group` está aqui para a dica de baixo poder virar-se
                 também — senão ficava cinzenta em cima de verde. */
              className={`group flex w-full items-start gap-2.5 rounded-[var(--bo-material-raio-pastilha)] px-2.5 py-2.5 text-left text-sm text-[var(--bo-tinta-72)] ${ESTADO} ${PRESSAO} hover:bg-[var(--bo-accent)] hover:text-white active:bg-[var(--bo-accent)] active:text-white`}
            >
              {/* A COLUNA DOS ÍCONES, SEMPRE COM A MESMA LARGURA — e presente
                  mesmo quando o item não traz ícone, senão os rótulos de um
                  menu misto ficam em duas colunas.

                  Sem cor própria, de propósito: o `text-foreground/45` que
                  aqui estava media 3,11:1 sobre branco (chumbava) e, sobre a
                  pastilha cheia, ficava um cinzento em cima de verde. A herança
                  do `currentColor` resolve as duas — o ícone acompanha o
                  rótulo, que é o que as capturas mostram. */}
              {temIcones && (
                <span
                  className="flex w-[var(--bo-material-coluna)] shrink-0 items-center justify-center pt-0.5"
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              )}
              <span className="min-w-0">
                <span className="block truncate font-medium">{item.label}</span>
                {item.hint && (
                  /* `--bo-text-muted` e não o `foreground/45` de antes: aquele
                     media 3,11:1 sobre branco e 2,95:1 sobre o pior material —
                     chumbava nos dois. Este mede 5,91:1 e 5,32:1. Sobre a
                     pastilha passa a branco a 85%, que dá 5,28:1 contra o
                     acento. */
                  <span className="mt-0.5 block text-xs leading-snug text-[var(--bo-text-muted)] group-hover:text-white/85 group-active:text-white/85">
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
