"use client";

import { useRef } from "react";
import { useIsomorphicLayoutEffect } from "@/lib/motion/useIsomorphicLayoutEffect";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { observeOnceInView } from "@/lib/motion/observeInView";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ENTRADA DE UM BLOCO PASSA A ACONTECER QUANDO ELE CHEGA AO ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office já tinha a entrada: a `.bo-cena`, com a escada de 20 ms e o
 * tecto ao sexto degrau. O que lhe faltava era o GATILHO certo.
 *
 * Ela corria toda na montagem. Num painel que tem quatro blocos empilhados,
 * isso quer dizer que o terceiro e o quarto — os que estão abaixo da dobra —
 * fazem a sua entrada enquanto ninguém está a olhar, e quando ela lá chega a
 * rolar já está tudo parado. A animação foi paga e não foi vista.
 *
 * A análise que ela mandou do site de referência diz isto por outras palavras:
 * lá o motor do site inteiro é a revelação ao rolar, dispara uma vez, e ao
 * voltar atrás não repete.
 *
 * ── COMO, E PORQUE É QUE NÃO SE MEXE NA ANIMAÇÃO ──────────────────────────
 *
 * Não se toca na `.bo-cena`: mesma curva, mesma duração, mesma escada, mesmo
 * `transform`/`opacity` a correr no compositor. O que este gancho faz é PAUSAR
 * a animação antes do primeiro pixel e voltar a pô-la a andar quando o bloco
 * entra no ecrã. O desenho é o mesmo; muda só o instante.
 *
 * É por isso que isto não é o que o site de referência faz. Lá o `translateY`
 * é interpolado à mão em `requestAnimationFrame` — vi os valores fraccionários
 * no relatório dela — e são 44 blocos a fazê-lo. Aqui a animação continua a ser
 * do browser, e o JavaScript só decide quando ela começa.
 *
 * ── O OBSERVADOR É O DA CASA ──────────────────────────────────────────────
 *
 * `observeOnceInView`, que já existe e já é partilhado por geometria: todos os
 * blocos com o mesmo par {limiar, margem} custam UM observador, não um cada.
 * Escrevi um segundo antes de o procurar; o próprio ficheiro dele começa a
 * queixar-se de o padrão já estar copiado duas vezes na casa, e eu ia fazer a
 * terceira. A geometria é a mesma do sítio público — 8 % do bloco visível e
 * 40 px de margem em baixo, para um bloco não «chegar» quando ainda só se vê o
 * rebordo.
 *
 * ── E SE ALGUMA COISA FALHAR, O CONTEÚDO APARECE ──────────────────────────
 *
 * Esta é a parte que importa numa ferramenta. Um bloco pausado está invisível
 * (`animation-fill-mode: backwards`), portanto qualquer maneira de o gatilho
 * nunca chegar seria conteúdo perdido — e isso é pior do que qualquer animação.
 * Há três redes:
 *
 *   1. SEM JAVASCRIPT, o HTML do servidor já traz a `.bo-cena`, que corre na
 *      montagem como sempre correu. Este gancho nunca chega a pausar nada.
 *   2. SEM `IntersectionObserver`, ou com movimento reduzido, não se pausa.
 *   3. E SE O OBSERVADOR NUNCA DISPARAR — o bloco nasce dentro de um separador
 *      escondido, o elemento é removido e reposto, o browser faz alguma coisa
 *      que eu não previ —, um relógio de 1,2 s despausa à mesma.
 *
 * A rede 3 é a que interessa: não é uma hipótese teórica, é a diferença entre
 * «a lista demorou a aparecer» e «a lista não apareceu».
 */

/** Quanto tempo se espera pelo observador antes de mostrar o bloco à mesma. */
const REDE_MS = 1200;

export function useEntradaAoChegar<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  useIsomorphicLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Movimento reduzido: a `.bo-cena` já não anima nada (tem a sua própria
    // regra), portanto pausá-la seria esconder o bloco para sempre.
    if (prefersReducedMotion()) return;

    // Pausar ANTES do primeiro pixel. Um `useEffect` normal corria depois de
    // pintar, e a animação já teria começado — via-se um salto.
    el.style.animationPlayState = "paused";

    let feito = false;
    let largar: (() => void) | null = null;
    const andar = () => {
      if (feito) return;
      feito = true;
      el.style.animationPlayState = "";
      clearTimeout(rede);
      largar?.();
    };

    const rede = setTimeout(andar, REDE_MS);
    // Um browser sem `IntersectionObserver` não tem gatilho nenhum: mostra-se
    // já, em vez de ficar à espera de um aviso que não vem.
    if (typeof IntersectionObserver === "undefined") andar();
    else
      largar = observeOnceInView(el, { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }, andar);

    return () => {
      clearTimeout(rede);
      largar?.();
      // Se o bloco sai do ecrã a meio (mudança de vista), não fica pausado num
      // elemento que alguém possa voltar a montar.
      el.style.animationPlayState = "";
    };
  }, []);

  return ref;
}
