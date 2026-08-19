"use client";

import { useEffect, useState } from "react";

/**
 * Quanto tempo se espera antes da SEGUNDA volta à cascata.
 *
 * Dois segundos: o suficiente para uma rede móvel que piscou já ter voltado, e
 * pouco de mais para quem está a olhar para a grelha. Não é uma reserva
 * infinita — dá-se UMA volta a mais e mais nenhuma, senão uma pasta mesmo
 * apagada punha a grelha a pedir para sempre.
 */
export const ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS = 2_000;

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
export function useFotoComPlanoB(
  url?: string,
  planoB?: string,
  /**
   * Não insistir: já se sabe que insistir dá sempre o mesmo.
   *
   * O caso é um só e é o das regras do próprio sítio (`img-src`): a fotografia
   * nem chega a ser pedida, e portanto nem a segunda volta nem a rede a voltar
   * mudam alguma coisa. MEDIDO com nove células recusadas: 54 recusas sem esta
   * trava, 117 com a segunda volta a correr para nada.
   */
  naoInsistir = false,
) {
  const [tentativa, setTentativa] = useState<"principal" | "planoB" | "desistiu">("principal");
  // Ajustar o estado DURANTE o render, e não num efeito: é o que evita a
  // célula piscar o aviso de erro durante um fotograma antes de voltar a
  // tentar. É o padrão que o React documenta para estado derivado de props.
  const [urlVisto, setUrlVisto] = useState(url);
  /**
   * Quantas VOLTAS à cascata já se deram nesta fotografia. Zera com um URL
   * novo — outro URL é outra fotografia para efeitos de tentativas.
   */
  const [voltas, setVoltas] = useState(0);
  if (urlVisto !== url) {
    setUrlVisto(url);
    setTentativa("principal");
    setVoltas(0);
  }

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * UMA SEGUNDA VOLTA, SOZINHA — PORQUE UMA PISCADELA NÃO É UMA AVARIA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Este ficheiro abre a dizer que o erro antigo era **gravar uma falha como se
   * fosse um facto** — e depois fazia exactamente isso: chegado a «desistiu»,
   * nada voltava a olhar para a fotografia sem um dedo dela em cima do botão.
   *
   * E as tentativas eram MENOS do que parecem. Contadas no código:
   *
   *   · com miniatura e original diferentes — DUAS (a miniatura, o original);
   *   · sem miniatura, ou com a miniatura igual ao original — UMA.
   *
   * Uma. Um instante sem rede, um 503 de um Storage a arrancar, uma resposta
   * estragada servida por um service worker, e a célula ficava morta até alguém
   * recarregar a página inteira.
   *
   * Uma volta a mais, e só uma, dois segundos depois. É o que separa a rede que
   * piscou (recupera sozinha, sem ninguém dar por nada) da pasta que não está
   * lá (continua a acabar em «desistiu», com o botão e o «Abrir ficheiro»).
   */
  useEffect(() => {
    if (naoInsistir || tentativa !== "desistiu" || voltas >= 1) return;
    const t = setTimeout(() => {
      setVoltas((v) => v + 1);
      setTentativa("principal");
    }, ESPERA_ANTES_DA_SEGUNDA_VOLTA_MS);
    return () => clearTimeout(t);
  }, [tentativa, voltas, naoInsistir]);

  /**
   * ── E QUANDO A REDE VOLTA, A CÉLULA VOLTA COM ELA ─────────────────────────
   *
   * O caso que o telemóvel tem e o computador não: sair do wi-fi, o elevador, o
   * comboio. O navegador SABE quando a ligação voltou e diz — e até aqui
   * ninguém o ouvia. Uma grelha morta ficava morta com a rede de volta, e a
   * única saída era recarregar a página e pagar os downloads todos outra vez.
   *
   * Não gasta nada enquanto está viva: o ouvinte só existe em «desistiu».
   */
  useEffect(() => {
    if (naoInsistir || tentativa !== "desistiu") return;
    const voltar = () => setTentativa("principal");
    window.addEventListener("online", voltar);
    return () => window.removeEventListener("online", voltar);
  }, [tentativa, naoInsistir]);

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
    tentarDeNovo: () => {
      // As voltas automáticas voltam à conta: um pedido dela é um recomeço, não
      // a continuação do que já se tentou sozinho.
      setVoltas(0);
      setTentativa("principal");
    },
  };
}
