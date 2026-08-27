"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * AS ACÇÕES DE UM ITEM — reveladas ao passar o rato no computador, sempre
 * visíveis onde não há rato.
 *
 * ── A regra, numa frase ─────────────────────────────────────────────────────
 * **Num ecrã táctil, "aparece no hover" quer dizer "não existe".** Não é um
 * inconveniente: a função fica invisível e ninguém a descobre. Este componente
 * é o sítio onde essa regra passa a ser aplicada uma vez, em vez de ser
 * relembrada em cada ecrã — e esquecida num.
 *
 * A decisão usa o PONTEIRO, não a largura (ver `adaptativo.ts`): um portátil
 * com ecrã táctil é largo e tem dedo, e um monitor grande ligado a um telemóvel
 * é estreito e tem rato. Esconder por largura acertava nos dois casos comuns e
 * falhava nos dois interessantes.
 *
 * ── E A DECISÃO É EM CSS, NÃO EM JAVASCRIPT ─────────────────────────────────
 * Isto lia `usePodeEsconderNoHover()`, que responde à mesma pergunta — e que
 * continua a ser a ferramenta certa para diferenças ESTRUTURAIS. Aqui era a
 * errada: o hook devolve `false` no servidor (tem de devolver, senão há
 * desencontro de hidratação), portanto o primeiro desenho no computador
 * mostrava as acções todas e o segundo escondia-as. MEDIDO: um piscar em cada
 * linha, em cada carregamento — numa tabela de trinta linhas, trinta.
 *
 * As variantes `com-rato:` / `sem-rato:` (globals.css) fazem o mesmo teste,
 * mas a media query já é verdadeira quando o primeiro píxel é pintado. Zero
 * JavaScript, zero piscar, e o mesmo desenho do lado do servidor.
 */

export interface AccaoDeItem {
  id: string;
  rotulo: string;
  onAccao: () => void;
  icone?: ReactNode;
  /** Acções que apagam ou são irreversíveis. Ficam a vermelho e SEPARADAS das
   *  outras — no telemóvel, "apagar" ao lado de "duplicar" é um engano à
   *  espera de acontecer. */
  destrutiva?: boolean;
  desativada?: boolean;
}

export interface MenuDeAccoesProps {
  accoes: readonly AccaoDeItem[];
  /** O que este menu governa, para o rótulo acessível ("Acções de Terracotta").
   *  Sem isto, dez menus na mesma página chamam-se todos "Acções". */
  sobre: string;
  /** Quantas acções aparecem soltas (em vez de dentro do menu) quando há
   *  espaço. As restantes ficam no "…". */
  soltasNoEcraGrande?: number;
  className?: string;
}

export function MenuDeAccoes({
  accoes,
  sobre,
  soltasNoEcraGrande = 0,
  className,
}: MenuDeAccoesProps) {
  const [aberto, setAberto] = useState(false);
  const caixaRef = useRef<HTMLDivElement>(null);
  const abridorRef = useRef<HTMLButtonElement>(null);

  /**
   * ── O FOCO VOLTA A QUEM ABRIU ─────────────────────────────────────────────
   *
   * As duas saídas do menu apagam o elemento que tem o foco: o item escolhido
   * desaparece com o menu, e o Escape fecha-o por baixo dos pés. Sem devolver
   * o foco ele cai no `<body>` — e o Tab seguinte recomeça no princípio da
   * página. Numa tabela de trinta linhas isso é voltar a percorrê-las todas
   * para chegar à linha onde se estava.
   *
   * O clique FORA não conta: aí o foco vai para onde se carregou, que é
   * exactamente onde a pessoa quis ir.
   */
  const fecharEDevolverFoco = () => {
    setAberto(false);
    abridorRef.current?.focus();
  };

  // Fechar ao clicar fora e ao Escape. `pointerdown` e não `click`: com `click`
  // o menu fechava só depois de a acção de baixo já ter disparado.
  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: PointerEvent) => {
      if (caixaRef.current && !caixaRef.current.contains(e.target as Node)) setAberto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        abridorRef.current?.focus();
      }
    };
    document.addEventListener("pointerdown", foraDaqui);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", foraDaqui);
      document.removeEventListener("keydown", escape);
    };
  }, [aberto]);

  const soltas = accoes.slice(0, soltasNoEcraGrande);
  const noMenu = accoes.slice(soltas.length);

  return (
    <div ref={caixaRef} className={cn("relative flex items-center gap-1", className)}>
      {soltas.map((a) => (
        <button
          key={a.id}
          type="button"
          disabled={a.desativada}
          onClick={a.onAccao}
          aria-label={a.rotulo}
          title={a.rotulo}
          className={cn(
            // O `transition-opacity` que aqui estava não tinha `motion-safe:`.
            // O `ESTADO` traz a opacidade na lista, portanto o esconder-no-rato
            // continua a esbater-se — agora nos 120 ms da escala.
            `alvo-toque flex h-11 w-11 items-center justify-center rounded-lg disabled:opacity-30 ${ESTADO} ${PRESSAO}`,
            a.destrutiva
              ? "text-[#8a3d2f] active:bg-[#8a3d2f]/[0.12]"
              : "text-foreground/45 hover:text-foreground/70 active:bg-foreground/[0.12]",
            // O coração deste componente: só se esconde onde há mesmo rato.
            "opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100",
          )}
        >
          {a.icone ?? a.rotulo.slice(0, 1)}
        </button>
      ))}

      {noMenu.length > 0 && (
        <>
          <button
            ref={abridorRef}
            type="button"
            aria-label={`Acções de ${sobre}`}
            aria-haspopup="menu"
            aria-expanded={aberto}
            onClick={() => setAberto((v) => !v)}
            className={cn(
              `alvo-toque flex h-11 w-11 items-center justify-center rounded-lg text-foreground/45 hover:text-foreground/70 active:bg-foreground/[0.12] ${ESTADO} ${PRESSAO}`,
              // Aberto fica sempre visível: escondê-lo por baixo do seu próprio
              // menu deixava o menu a flutuar sem nada que o segurasse.
              aberto
                ? "opacity-100"
                : "opacity-100 com-rato:opacity-0 com-rato:group-hover:opacity-100 com-rato:focus-visible:opacity-100",
            )}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <circle cx="5" cy="12" r="1.6" />
              <circle cx="12" cy="12" r="1.6" />
              <circle cx="19" cy="12" r="1.6" />
            </svg>
          </button>

          {aberto && (
            <div
              role="menu"
              aria-label={`Acções de ${sobre}`}
              className="absolute right-0 top-full z-30 mt-1 min-w-48 overflow-hidden rounded-xl border border-foreground/[0.1] bg-[var(--bo-surface,#ffffff)] py-1 shadow-[var(--bo-sombra-suspensa)]"
            >
              {noMenu.map((a, i) => {
                // Uma linha a separar antes da primeira destrutiva: é o que
                // impede o toque distraído em "Eliminar" quando se queria
                // "Duplicar", que fica logo por cima.
                const primeiraDestrutiva =
                  a.destrutiva && !noMenu.slice(0, i).some((x) => x.destrutiva);
                return (
                  <button
                    key={a.id}
                    type="button"
                    role="menuitem"
                    disabled={a.desativada}
                    onClick={() => {
                      // Devolver o foco ANTES da acção: se ela abrir um
                      // diálogo, é este botão que a armadilha de foco memoriza
                      // para devolver no fim (ver `useFocusTrap`).
                      fecharEDevolverFoco();
                      a.onAccao();
                    }}
                    className={cn(
                      `alvo-toque flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm disabled:opacity-30 ${ESTADO} ${PRESSAO}`,
                      a.destrutiva
                        ? "text-[#8a3d2f] hover:bg-[#8a3d2f]/[0.07] active:bg-[#8a3d2f]/[0.14]"
                        : "text-foreground/75 hover:bg-foreground/[0.05] active:bg-foreground/[0.10]",
                      primeiraDestrutiva && "mt-1 border-t border-foreground/[0.08] pt-3",
                    )}
                  >
                    {a.icone}
                    {a.rotulo}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
