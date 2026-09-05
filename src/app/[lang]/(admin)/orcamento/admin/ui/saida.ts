"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A SAÍDA — a metade do vocabulário que faltava
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A casa tem entradas em nove sítios (a `.bo-entrada` do `globals.css`, e o
 * censo está escrito lá). Saídas não tinha em nenhum: o `Toast` desaparecia num
 * fotograma com os avisos de baixo a saltar, e as folhas e diálogos do
 * `ui/FolhaOuDialogo.tsx` fecham a seco porque o pai desmonta e o ecrã volta.
 *
 * A palavra em CSS é a `.bo-saida` (200 ms, `--ease-in`, e o `pointer-events`
 * largado dentro da própria classe — a prosa toda está lá). Este ficheiro é a
 * outra metade, a que o CSS não pode fazer sozinho: **segurar o nó montado o
 * tempo da animação.**
 *
 * ── PORQUE É QUE ISTO PRECISA DE UM HOOK ────────────────────────────────────
 *
 * Uma animação de saída tem um problema que a de entrada não tem: quando ela
 * devia começar, o elemento já não existe. Um aviso sai do array e desaparece;
 * um `{aberto && <Folha/>}` passa a falso e desmonta. Não há nada para animar.
 *
 * A rede não é o `key` — o `key` REMONTA, e remontar é o contrário do que aqui
 * se quer. É preciso separar duas coisas que até agora eram uma só: «esta coisa
 * acabou» e «esta coisa já não está no ecrã». Entre as duas há 200 ms, e é isso
 * que este hook guarda.
 *
 * ── COMO SE USA ─────────────────────────────────────────────────────────────
 *
 * O hook é indexado por CHAVE, porque nasceu numa PILHA (a do `Toast`), onde há
 * vários nós a sair ao mesmo tempo e cada um com o seu relógio. Quem só tem um
 * nó — uma folha, um diálogo — passa uma chave constante e ignora que ela
 * existe:
 *
 *     const { aSair, comecarSaida } = useSaidaAdiada(() => aoFechar());
 *     // fechar:   comecarSaida("folha")   — em vez de chamar aoFechar()
 *     // desenhar: className={aSair.includes("folha")
 *     //             ? `${SAIDA_FOLHA} pointer-events-none`
 *     //             : "bo-entrada bo-entrada-folha"}
 *
 * O `aoAcabar` é chamado quando os 200 ms passam: é aí — e só aí — que o dono
 * do estado desmonta o que estava a sair.
 *
 * ── E QUEM PEDIU PARA NÃO ANIMAR NÃO ESPERA ─────────────────────────────────
 *
 * Com `prefers-reduced-motion: reduce` o `comecarSaida` chama o `aoAcabar` no
 * próprio instante e nunca chega a marcar nada. Não chega desligar a animação
 * pelo CSS: se o nó ficasse montado 200 ms sem animar, ficava uma caixa parada
 * e morta em cima do que está por baixo dela. Aqui a guarda tem de ser em
 * JavaScript porque o que muda é o CICLO DE VIDA, não só a pintura.
 *
 * ── O QUE ESTE HOOK NÃO FAZ ─────────────────────────────────────────────────
 *
 * Não fecha o ESPAÇO que o nó deixa. Uma folha ou um diálogo não deixam espaço
 * nenhum (estão fora de fluxo), mas uma PILHA deixa, e os irmãos saltam para o
 * lugar do que saiu. Isso resolve-se com um FLIP (medir, inverter, largar) que
 * é geometria da pilha e não do ciclo de vida — vive no `Toast.tsx`, comentado
 * lá, e não se generaliza para aqui enquanto não houver uma segunda pilha.
 */

/** Os 200 ms da `.bo-saida`. Mais curtos do que a entrada, de propósito. */
export const SAIDA_MS = 200;

/** A classe de saída da casa: 4 px, para um menu. */
export const SAIDA = "bo-saida";
/** A variante de 8 px: uma folha do telemóvel, ou um aviso. */
export const SAIDA_FOLHA = "bo-saida bo-saida-folha";
/** A variante de 0 px: um fundo, que não vem nem vai a sítio nenhum. */
export const SAIDA_FUNDO = "bo-saida bo-saida-fundo";

/** Verdadeiro quando o sistema operativo pediu para não se animar nada. */
export function semMovimento(): boolean {
  return (
    typeof window !== "undefined" &&
    !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
  );
}

export interface SaidaAdiada {
  /** As chaves que estão a sair AGORA — montadas, e já sem `pointer-events`. */
  aSair: readonly string[];
  /** Começa a saída de uma chave. Não desmonta nada: marca-a. */
  comecarSaida: (chave: string) => void;
  /**
   * Esquece as saídas de chaves que já não existem. Serve o caso em que outra
   * regra deita fora o que estava a sair antes de a saída acabar — no `Toast`,
   * o tecto de quatro avisos. Sem isto ficava um nome preso na lista para
   * sempre, e com ele tudo o que depende de «não há ninguém a sair».
   */
  podar: (vivas: readonly string[]) => void;
}

export function useSaidaAdiada(
  aoAcabar: (chave: string) => void,
  duracaoMs: number = SAIDA_MS,
): SaidaAdiada {
  const [aSair, setASair] = useState<readonly string[]>([]);
  const relogios = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // Lida por referência para o relógio, que é armado uma vez, chamar sempre a
  // versão mais recente sem ter de ser re-armado a cada renderização do pai.
  const aoAcabarRef = useRef(aoAcabar);
  useEffect(() => {
    aoAcabarRef.current = aoAcabar;
  });

  const terminar = useCallback((chave: string) => {
    const relogio = relogios.current.get(chave);
    if (relogio) {
      clearTimeout(relogio);
      relogios.current.delete(chave);
    }
    setASair((prev) => (prev.includes(chave) ? prev.filter((c) => c !== chave) : prev));
    aoAcabarRef.current(chave);
  }, []);

  const comecarSaida = useCallback(
    (chave: string) => {
      if (semMovimento()) {
        terminar(chave);
        return;
      }
      // A marca entra no MESMO commit do React, ou seja antes de o browser
      // pintar o primeiro fotograma da saída. É daqui que vem a garantia de que
      // o `pointer-events` se larga a tempo — ver a `.bo-saida` no globals.css.
      setASair((prev) => (prev.includes(chave) ? prev : [...prev, chave]));
      if (relogios.current.has(chave)) return;
      relogios.current.set(
        chave,
        setTimeout(() => terminar(chave), duracaoMs),
      );
    },
    [duracaoMs, terminar],
  );

  const podar = useCallback((vivas: readonly string[]) => {
    setASair((prev) => {
      const ficam = prev.filter((chave) => vivas.includes(chave));
      return ficam.length === prev.length ? prev : ficam;
    });
  }, []);

  useEffect(() => {
    const abertos = relogios.current;
    return () => {
      for (const relogio of abertos.values()) clearTimeout(relogio);
      abertos.clear();
    };
  }, []);

  return { aSair, comecarSaida, podar };
}
