"use client";

import { useEffect } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TRINCO DO SCROLL — o fundo não anda enquanto há um diálogo à frente
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO com o navegador, com o «Novo pedido» aberto: arrastar FORA do diálogo
 * num telemóvel de 390×844 (y = 826) rolava a página de trás **0 → 892 px**; no
 * computador, a roda do rato EM CIMA do próprio diálogo rolava-a 771 px. Fecha-
 * se o diálogo e já não se está onde se estava — e num formulário longo isso
 * quer dizer procurar outra vez o sítio onde se ia.
 *
 * O padrão já era da casa (a gaveta do pedido, a folha do telemóvel, a lupa das
 * fotos): `body { overflow: hidden }`. O que não era da casa era estar num sítio
 * só — estava copiado em três ficheiros e faltava em dez diálogos.
 *
 * ── Três coisas que se estragam sempre aqui, e o que este trinco faz ────────
 *
 * 1. **A página salta pela largura da barra de deslocamento.** No computador,
 *    tirar o scroll tira também a barra, e o conteúdo alarga esses ~15 px de
 *    repente. Compensa-se com `padding-right` do tamanho exacto da barra que
 *    desapareceu, medida ANTES de trancar. No telemóvel a barra é sobreposta
 *    (0 px) e não se põe nada.
 *
 * 2. **A posição tem de ser a mesma ao sair.** É por isso que é
 *    `overflow: hidden` e não `position: fixed`: o `fixed` tira a página do
 *    fluxo e manda-a para o topo, e aí a reposição do `scrollY` passa a ser
 *    obrigatória — mais uma coisa para falhar. MEDIDO nesta Chromium (390×844,
 *    lista de pedidos a 514 px): com o `hidden`, o `scrollY` fica nos 514
 *    enquanto o diálogo está aberto e continua nos 514 depois de fechar.
 *    A reposição explícita fica na mesma, como cinto e suspensórios para os
 *    browsers que travem o `scrollY` em 0 ao clipar o viewport — quando não
 *    travam, repõe o número que já lá está e não se vê nada. (Não verificado
 *    no Safari do iOS, que é onde essa diferença costuma aparecer.)
 *
 * 3. **O que estava escrito no `style` é de alguém.** Restitui-se o valor
 *    anterior em vez de escrever `"visible"`: quem manda no eixo horizontal é o
 *    `body { overflow-x: clip }` do `globals.css`, e um `visible` por cima dele
 *    devolvia o scroll horizontal ao back office inteiro.
 *
 * ── E a contagem, que é o que faz isto funcionar com dois diálogos ──────────
 * Um diálogo pode abrir por cima de outro (a paleta de comandos por cima da
 * gaveta do pedido, o «Ajuda» por cima do estúdio). Sem contagem, o de dentro a
 * fechar-se destrancava a página com o de fora ainda aberto. O trinco é do
 * documento, portanto a contagem também é — vive no módulo, não no componente.
 */

/** Quantos diálogos estão a segurar o trinco neste momento. */
let trincos = 0;
/** O que lá estava antes do PRIMEIRO trinco — é a este valor que se volta. */
let overflowAnterior = "";
let paddingAnterior = "";
let scrollAnterior = 0;

/**
 * Uma barra de deslocamento plausível. Fora deste intervalo, não se mexe:
 * num DOM sem disposição (jsdom) a conta dá a largura da janela inteira, e uma
 * margem de 1024 px é pior do que o salto que se queria evitar.
 */
const BARRA_MAXIMA = 40;

export function useTrincoDeScroll(activo: boolean) {
  useEffect(() => {
    if (!activo) return;
    if (typeof document === "undefined") return;
    const corpo = document.body;

    if (trincos === 0) {
      overflowAnterior = corpo.style.overflow;
      paddingAnterior = corpo.style.paddingRight;
      scrollAnterior = window.scrollY;
      const barra = window.innerWidth - document.documentElement.clientWidth;
      if (barra > 0 && barra <= BARRA_MAXIMA) {
        const jaTinha = parseFloat(getComputedStyle(corpo).paddingRight) || 0;
        corpo.style.paddingRight = `${jaTinha + barra}px`;
      }
      corpo.style.overflow = "hidden";
    }
    trincos += 1;

    return () => {
      trincos -= 1;
      if (trincos === 0) {
        corpo.style.overflow = overflowAnterior;
        corpo.style.paddingRight = paddingAnterior;
        // `instant` e não o `scroll-behavior: smooth` que a folha de estilos
        // põe no `html`: isto é repor o sítio, não uma viagem para lá.
        if (scrollAnterior > 0)
          window.scrollTo({ top: scrollAnterior, left: 0, behavior: "instant" });
      }
    };
  }, [activo]);
}
