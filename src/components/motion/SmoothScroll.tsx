"use client";

import { createContext, useContext, useEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { inerciaDesejada, ligarInerciaDaRoda } from "@/lib/motion/inercia-roda";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SCROLL DO SÍTIO — nativo em todo o lado, com um interruptor para a roda
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O QUE JÁ CÁ ESTAVA, E PORQUÊ. Este sítio TEVE scroll com inércia por
 * JavaScript (Lenis) e foi tirado de propósito em 7d047fe, com esta razão
 * escrita: depois das correcções de compositing o sítio continuava a parecer
 * "pouco rápido na resposta", e a culpa era da interpolação — a página deslizava
 * em vez de seguir a roda/dedo a 1:1, o que se lê como atraso na resposta, e o
 * deslize de ~1 s depois de cada gesto mantinha o herói WebGL a redesenhar todo
 * esse tempo. A dependência caiu a seguir (90553fb).
 *
 * DUAS COISAS MUDARAM DESDE ENTÃO, e ambas contam para quem reabrir isto:
 *
 *   1. O QUE O LENIS TINHA ERA `syncTouch: false`. Ou seja: o TELEMÓVEL nunca
 *      teve inércia por JavaScript, nem antes nem depois. O que foi tirado em
 *      7d047fe foi a inércia DA RODA, no computador. Qualquer conversa sobre
 *      "voltar a pôr o Lenis" tem de começar por aqui, ou fala do que não era.
 *   2. AS DUAS COISAS QUE O DESLIZE ENCARECIA JÁ NÃO EXISTEM. O herói WebGL
 *      (HeroWebGL.heavyEffectsWelcome) e o parallax (Parallax.parallaxWanted)
 *      estão hoje desligados em TODOS os dispositivos. Metade da razão registada
 *      em 7d047fe — "mantinha o herói WebGL a redesenhar" — caducou. A outra
 *      metade (não seguir a roda a 1:1) é gosto, e é da dona, não nossa.
 *
 * O INTERRUPTOR (`INERCIA_NA_RODA`, mesmo aqui em baixo) está DESLIGADO. Ligado,
 * acende inércia SÓ EM PONTEIRO FINO — rato e trackpad. Nunca no telemóvel.
 *
 * PORQUE É QUE O TELEMÓVEL FICA DE FORA, e não é por prudência vaga. O scroll
 * nativo de toque corre no COMPOSITOR, fora da linha principal: com a linha
 * principal entupida, a página continua a deslizar debaixo do dedo. Uma inércia
 * por JavaScript substitui isso por uma emulação que escreve a posição do scroll
 * a partir de um `requestAnimationFrame` NA linha principal — e a partir daí
 * cada engasgo dessa linha é a página a parar debaixo do dedo. A queixa original
 * da dona do sítio foi exactamente essa, no telemóvel dela. Ligar inércia no
 * toque é arriscar agravar a queixa que deu origem a tudo isto.
 *
 * O QUE NÃO SE PERDE COM O NATIVO: os reveals são CSS + IntersectionObserver, o
 * Parallax tem o seu próprio ouvinte passivo, e os saltos de âncora continuam
 * suaves pelo `scroll-behavior: smooth` do globals.css (que só afecta scrolls
 * programáticos, nunca a roda/dedo de quem lá está).
 */

// ── O INTERRUPTOR ──
// `false` = o sítio inteiro em scroll nativo, como está hoje.
// `true`  = inércia na roda do rato, só em ponteiro fino (o telemóvel não muda).
// Segue o estilo dos outros interruptores de movimento do sítio
// (Parallax.parallaxWanted, HeroWebGL.heavyEffectsWelcome): uma constante que se
// vira à mão, sem plumbing de configuração para uma decisão que é de gosto.
const INERCIA_NA_RODA = false;

/**
 * Sobra do Lenis: zero consumidores hoje (verificado por procura em todo o
 * `src/`). Fica como no-op estável para não partir nada que venha a importá-lo,
 * e porque removê-lo é uma limpeza à parte desta decisão.
 */
const LenisContext = createContext<null>(null);

/** Sempre null — não há instância de scroll suave para partilhar. */
export function useLenis(): null {
  return useContext(LenisContext);
}

export default function SmoothScroll({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // A decisão é tomada depois de montar, porque `matchMedia` é só do cliente.
    // Com o interruptor desligado isto sai na primeira linha e não regista
    // ouvinte nenhum — nem sequer o `matchMedia` chega a ser chamado.
    if (
      !inerciaDesejada({
        ligada: INERCIA_NA_RODA,
        movimentoReduzido: prefersReducedMotion(),
        ponteiroFino: window.matchMedia("(pointer: fine)").matches,
      })
    ) {
      return;
    }
    return ligarInerciaDaRoda(window);
  }, []);

  return <LenisContext.Provider value={null}>{children}</LenisContext.Provider>;
}
