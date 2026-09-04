"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

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

/**
 * O `sm` do Tailwind. É a largura a partir da qual uma linha a mais de
 * interface deixa de custar altura às fotografias — e portanto a partir da
 * qual a caixa de procurar temas fica sempre à vista em vez de atrás da lupa.
 */
export const MEDIDA_SM = "(min-width: 640px)";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PERGUNTA, MAS À ZONA — E NÃO À JANELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `useMedida` pergunta ao navegador quanto mede a JANELA. Quase sempre chega,
 * e é mais barato. Mas há um caso em que a resposta certa é outra, e custou
 * caro descobri-lo:
 *
 * Palavras dela, com uma captura do estúdio de propostas: «isto no back office
 * está tudo com bugs e todo desformatado».
 *
 * MEDIDO num Chromium, no painel que abre a partir do cartão de um cliente:
 *
 *     janela 1366   a coluna onde ela escreve tem 368 px   legível
 *     janela 1440   a coluna onde ela escreve tem  82 px   ← alargar PIOROU
 *     janela 2000   a coluna onde ela escreve tem 136 px
 *
 * A causa: o painel «O que vai sair» perguntava à JANELA se ela tinha 1440 px.
 * Tinha. Mas o painel aterra dentro de uma caixa de 712 px — o painel de
 * detalhe tem um tecto próprio —, e ali as duas colunas laterais pedem 576 px
 * sem negociar. Sobram 136 para a coluna onde se escreve. O comentário do
 * próprio `PainelDoEstudio` prometia «quando o painel é desenhado é porque
 * cabe»; nessa montagem a promessa era falsa.
 *
 * O mesmo erro já estava escrito noutro sítio desta casa, no `ThemePicker`: «a
 * pergunta que elas fazem — que largura tem a janela? — não é a que decide, que
 * é: que largura tem esta zona?»
 *
 * ── PORQUÊ UM `ResizeObserver` E NÃO UM `@container` ──────────────────────
 *
 * Porque o que muda não é como uma coisa se desenha: é SE ela existe na
 * árvore. Um `@container` esconde por CSS, e esconder é precisamente o que o
 * `PainelDoEstudio` existe para não fazer — dois painéis montados são dois
 * estados a divergir. A decisão é de montagem, portanto tem de ser JavaScript.
 *
 * ── E NO SERVIDOR RESPONDE ZERO ───────────────────────────────────────────
 *
 * Que é a resposta segura: o caminho estreito nunca depende de haver espaço,
 * e a largura aparece na hidratação. É a mesma escolha do `useMedida`.
 */
export function useLarguraDaZona(ref: { current: HTMLElement | null }): number {
  const [largura, setLargura] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // A primeira leitura é imediata, e vem ANTES da guarda do observador: sem
    // ela havia um fotograma com zero — e zero quer dizer «não cabe», portanto
    // o painel piscava a aparecer. É também o que dá uma resposta num ambiente
    // sem `ResizeObserver` (o jsdom dos testes), em vez de ficar cego.
    setLargura(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const obs = new ResizeObserver((entradas) => {
      for (const e of entradas) {
        // `borderBoxSize` quando existe (é o que o navegador já calculou),
        // e a caixa medida à mão quando não — ler `getBoundingClientRect`
        // dentro do observador é o que provoca um ciclo de medições.
        const w = e.borderBoxSize?.[0]?.inlineSize ?? e.contentRect.width;
        setLargura(w);
      }
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref]);
  return largura;
}
