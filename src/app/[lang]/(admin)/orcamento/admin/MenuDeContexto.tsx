"use client";

import { Fragment, useEffect, useLayoutEffect, useRef } from "react";
import { ESTADO, PRESSAO } from "./ui/movimento";
import type { AccaoDeItem } from "./ui";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO DIREITO — AS MESMAS ACÇÕES, NO SÍTIO ONDE SE CARREGOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido do `docs/APPLE-TEMAS.md`, ponto 8: «Não há menu de contexto. Numa
 * coleção, o botão direito é obrigatório.» E o ponto 9 fecha o contrato: o
 * «⋯» do cartão «abre o MESMO menu do botão direito».
 *
 * ── PORQUE É QUE ISTO NÃO É UM SEGUNDO MENU ────────────────────────────────
 *
 * Porque a lista de acções é a mesma peça de dados — `AccaoDeItem`, do
 * `ui/MenuDeAccoes.tsx` — e quem a escreve escreve-a uma vez. Este ficheiro
 * não inventa acções nenhumas: recebe a lista que o «⋯» já recebe e desenha-a
 * ancorada ao ponteiro em vez de ancorada a um botão. É a única diferença
 * entre os dois, e é a razão de existirem dois.
 *
 * O MATERIAL é o mesmo, à letra: `.bo-material` com o desfoque, a folga da
 * moldura, a sombra do que flutua e a pastilha cheia por baixo do rato. Duas
 * famílias de material no mesmo ecrã é o defeito que a Parte −1 do
 * `docs/DESIGN-SYSTEM.md` manda evitar acima de tudo — aqui há uma só, e este
 * componente é um consumidor dela.
 *
 * ── E NÃO MOSTRA ATALHOS DE TECLADO ────────────────────────────────────────
 *
 * «Nunca mostrar atalhos de teclado num menu de contexto.» [APPLE] O item diz
 * o que faz, e mais nada.
 */

/** Onde o menu foi pedido, em coordenadas da JANELA (o painel é `fixed`). */
export interface PedidoDeMenu {
  x: number;
  y: number;
  /** Quem pediu este menu, quando isso importa a alguém de fora.
   *
   *  Serve o `aria-expanded` de um botão que o abre: o «⋯» da barra de topo
   *  precisa de saber se o menu aberto é o DELE, e o `sobre` não chega para
   *  isso — o menu do vazio da grelha fala da mesma biblioteca e teria o
   *  mesmo nome. */
  de?: string;
  /** O que este menu governa, para o rótulo acessível. */
  sobre: string;
  accoes: readonly AccaoDeItem[];
}

/**
 * Quanto é que o painel se afasta da borda da janela quando não cabe.
 *
 * Oito, e não zero: colado ao pixel da borda o menu lê-se como estando cortado,
 * e num telemóvel de 375 px é onde ele vai parar quase sempre — o dedo carrega
 * perto do bordo do cartão, e o cartão vai de bordo a bordo.
 */
const MARGEM = 8;

export function MenuDeContexto({
  pedido,
  onFechar,
}: {
  pedido: PedidoDeMenu | null;
  onFechar: () => void;
}) {
  const painelRef = useRef<HTMLDivElement>(null);

  /**
   * ── A POSIÇÃO CORRIGE-SE ANTES DE O ECRÃ PINTAR ───────────────────────────
   *
   * O painel nasce no ponteiro (é o `style` do JSX) e aqui mede-se para o
   * encostar para dentro quando não cabe — a 375 px de largura é o caso
   * normal, porque o cartão vai de bordo a bordo e o dedo carrega perto da
   * borda.
   *
   * `useLayoutEffect` e não `useEffect`: a correcção acontece no MESMO
   * fotograma, senão via-se o menu a saltar. E escreve-se no `style` do nó em
   * vez de passar por estado — o que se está a fazer é posicionar um elemento
   * medido, que é trabalho de DOM e não um segundo desenho do React.
   */
  useLayoutEffect(() => {
    const el = painelRef.current;
    if (!pedido || !el) return;
    const { width, height } = el.getBoundingClientRect();
    const maxX = Math.max(MARGEM, window.innerWidth - width - MARGEM);
    const maxY = Math.max(MARGEM, window.innerHeight - height - MARGEM);
    el.style.left = `${Math.min(Math.max(MARGEM, pedido.x), maxX)}px`;
    el.style.top = `${Math.min(Math.max(MARGEM, pedido.y), maxY)}px`;
  }, [pedido]);

  /**
   * ── AS SAÍDAS ─────────────────────────────────────────────────────────────
   *
   * `Escape`, carregar fora, e QUALQUER rolagem ou mudança de tamanho da
   * janela. As duas últimas são o que distingue um menu ancorado ao ponteiro
   * de um ancorado a um botão: o botão anda com a página, o ponteiro não —
   * sem isto, rolar a grelha deixava o menu parado no ar sobre outro tema.
   *
   * `pointerdown` e não `click`, como no menu do «⋯»: com `click` o menu só
   * fechava depois de a acção de baixo já ter disparado.
   */
  useEffect(() => {
    if (!pedido) return;
    const fora = (e: PointerEvent) => {
      if (painelRef.current && !painelRef.current.contains(e.target as Node)) onFechar();
    };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        // Parar aqui: com selecção activa, o `Escape` da grelha limpa-a — e
        // fechar um menu não é limpar uma selecção.
        e.stopPropagation();
        onFechar();
      }
    };
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", tecla, true);
    window.addEventListener("scroll", onFechar, true);
    window.addEventListener("resize", onFechar);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", tecla, true);
      window.removeEventListener("scroll", onFechar, true);
      window.removeEventListener("resize", onFechar);
    };
  }, [pedido, onFechar]);

  // O foco entra no menu quando ele abre: um menu de contexto que não se
  // percorre com o teclado é um menu que metade das acções não tem.
  useEffect(() => {
    if (!pedido) return;
    painelRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [pedido]);

  if (!pedido) return null;

  const itens = pedido.accoes;

  return (
    <div
      ref={painelRef}
      role="menu"
      aria-label={`Acções de ${pedido.sobre}`}
      // O sítio onde se carregou. O `useLayoutEffect` acima encosta-o para
      // dentro se não couber, antes de isto chegar ao ecrã.
      style={{ left: pedido.x, top: pedido.y }}
      className={
        "bo-material bo-material-desfoque bo-entrada fixed z-50 min-w-48 overflow-hidden " +
        "p-[var(--bo-material-folga)] shadow-[var(--bo-sombra-suspensa)]"
      }
    >
      {itens.map((a, i) => {
        // A mesma regra do menu do «⋯»: um filete antes da primeira acção
        // destrutiva, que fica no FIM da lista. É o que impede o toque
        // distraído em «Eliminar» quando se queria o item de cima.
        const primeiraDestrutiva = a.destrutiva && !itens.slice(0, i).some((x) => x.destrutiva);
        return (
          <Fragment key={a.id}>
            {primeiraDestrutiva && i > 0 && (
              <div
                aria-hidden="true"
                className="mx-2.5 my-1 border-t border-[var(--bo-hairline)]"
              />
            )}
            <button
              type="button"
              role="menuitem"
              disabled={a.desativada}
              onClick={() => {
                onFechar();
                a.onAccao();
              }}
              className={
                `alvo-toque flex w-full items-center gap-2.5 rounded-[var(--bo-material-raio-pastilha)] ` +
                `px-2.5 py-2.5 text-left text-sm disabled:opacity-30 ${ESTADO} ${PRESSAO} ` +
                (a.destrutiva
                  ? "text-[var(--bo-perigo)] hover:bg-[var(--bo-perigo)] hover:text-white active:bg-[var(--bo-perigo)] active:text-white"
                  : "text-[var(--bo-tinta-72)] hover:bg-[var(--bo-accent)] hover:text-white active:bg-[var(--bo-accent)] active:text-white")
              }
            >
              {/* A coluna dos ícones tem largura mesmo quando o item não traz
                  nenhum — senão um menu misto fica com os rótulos em duas
                  colunas. Mesma regra, mesmo token que o menu do «⋯». */}
              <span
                aria-hidden="true"
                className="flex w-[var(--bo-material-coluna)] shrink-0 items-center justify-center"
              >
                {a.icone}
              </span>
              {a.rotulo}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}
