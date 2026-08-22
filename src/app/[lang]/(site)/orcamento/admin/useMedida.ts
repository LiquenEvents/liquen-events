"use client";

import { useSyncExternalStore } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERGUNTAR AO NAVEGADOR SE A LARGURA CHEGA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O CSS resolve quase tudo o que depende da largura, e é sempre a primeira
 * escolha: não custa JavaScript nenhum, não pisca, e o servidor desenha o mesmo
 * HTML. Isto é para o caso em que ele NÃO resolve — quando a diferença entre
 * duas larguras não é como uma coisa se desenha, mas ONDE ela vive na árvore.
 *
 * O exemplo que o obrigou a existir: o cartão da página em construção. A partir
 * de `lg` vive no fundo da coluna dos temas; abaixo disso flutua sobre a
 * grelha. Desenhar os DOIS e esconder um com `lg:hidden` parece igual e não é:
 * ficam duas instâncias montadas, cada uma com o seu estado de aberto/fechado e
 * as duas a escrever na mesma chave do `localStorage`. Fechar uma não fecha a
 * outra, e ao rodar o telemóvel aparece a que ficou aberta. Um só componente,
 * num sítio de cada vez, não tem esse problema.
 *
 * ── PORQUÊ `useSyncExternalStore` ─────────────────────────────────────────
 *
 * Porque a resposta é uma subscrição a uma coisa de fora do React, e é
 * exactamente para isso que ele existe: não há um fotograma desenhado com a
 * resposta errada, como haveria com um `useEffect` a corrigir depois. No
 * servidor devolve `false` — o HTML sai pelo caminho estreito e a largura
 * aparece na hidratação.
 *
 * Sem `matchMedia` (o servidor, um ambiente de teste) a resposta é sempre
 * «não»: é a mais segura das duas, porque o caminho estreito nunca depende de
 * haver espaço.
 */
export function useMedida(medida: string): boolean {
  return useSyncExternalStore(
    (avisar) => {
      const mq = typeof window !== "undefined" ? window.matchMedia?.(medida) : undefined;
      if (!mq) return () => {};
      mq.addEventListener("change", avisar);
      return () => mq.removeEventListener("change", avisar);
    },
    () => (typeof window !== "undefined" ? (window.matchMedia?.(medida).matches ?? false) : false),
    () => false,
  );
}

/** Os cortes da casa, escritos como o Tailwind os escreve. */
export const MEDIDA_LG = "(min-width: 1024px)";
