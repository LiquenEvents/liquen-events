"use client";

import { useState } from "react";

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UMA FOTO QUE TENTA O ORIGINAL ANTES DE DESISTIR — E NUNCA DESISTE PARA SEMPRE
 * ══════════════════════════════════════════════════════════════════════════
 *
 * As células que desenham fotos no estúdio tinham o mesmo defeito, cada uma com
 * a sua cópia: um `useState(false)` de "falhou" que ninguém voltava a pôr a
 * `false`. Bastava UM erro — um URL assinado expirado, um instante sem rede, um
 * service worker a servir uma resposta estragada — para a célula ficar para
 * sempre a dizer "Guardada, mas não foi possível pré-visualizar aqui". A
 * fotografia estava lá, o URL seguinte estava bom, e a célula já não olhava
 * para ele.
 *
 * É o mesmo erro que a cache de fotografias tinha: **gravar uma falha como se
 * fosse um facto**.
 *
 * Duas regras, e num sítio só para não poderem voltar a divergir:
 *
 *  1. um `url` novo é sempre uma oportunidade nova;
 *  2. antes de desistir tenta-se o ORIGINAL — uma miniatura pode não existir
 *     (assinar um caminho no Storage NÃO garante que o ficheiro lá está, e
 *     devolve um URL bem formado para um objecto que dá 404).
 *
 * ── PORQUE É QUE ISTO VIVE NUM FICHEIRO PRÓPRIO ───────────────────────────
 * Estava exportado de dentro do `ProposalStudio`. A pré-visualização da página
 * — que o estúdio importa — precisa da mesma rede, e importá-la de lá fechava
 * um ciclo entre os dois módulos. A regra é de quem desenha uma foto, não do
 * estúdio; sai para onde qualquer um a possa ler.
 */
export function useFotoComPlanoB(url?: string, planoB?: string) {
  const [tentativa, setTentativa] = useState<"principal" | "planoB" | "desistiu">("principal");
  // Ajustar o estado DURANTE o render, e não num efeito: é o que evita a
  // célula piscar o aviso de erro durante um fotograma antes de voltar a
  // tentar. É o padrão que o React documenta para estado derivado de props.
  const [urlVisto, setUrlVisto] = useState(url);
  if (urlVisto !== url) {
    setUrlVisto(url);
    setTentativa("principal");
  }
  return {
    /** O URL a pedir agora, ou `undefined` se já não há por onde tentar. */
    alvo: tentativa === "planoB" ? planoB : url,
    /** Esgotaram-se as tentativas. */
    desistiu: tentativa === "desistiu",
    /**
     * O ÚLTIMO URL que esta célula chegou a pedir — o que interessa registar e
     * o que o «Abrir ficheiro» abre.
     *
     * Calculado, não guardado numa referência: a cascata só tem dois degraus, e
     * qual foi o último sabe-se das próprias props. A primeira versão disto
     * guardava-o num `useRef` e lia-o durante o desenho, que é precisamente o
     * que o React não garante — e o linter apanhou-o antes de mim.
     */
    ultimoAlvo: planoB && planoB !== url ? planoB : url,
    aoFalhar: () =>
      setTentativa((t) => (t === "principal" && planoB && planoB !== url ? "planoB" : "desistiu")),
    /**
     * Voltar ao princípio, a pedido dela.
     *
     * «Desistiu» nunca deve querer dizer «para sempre». Uma rede que voltou, um
     * ficheiro que já foi copiado, uma assinatura entretanto renovada — em
     * qualquer desses casos a foto está lá e a célula é a única coisa a dizer
     * que não. O botão custa uma linha e poupa um recarregamento da página.
     */
    tentarDeNovo: () => setTentativa("principal"),
  };
}
