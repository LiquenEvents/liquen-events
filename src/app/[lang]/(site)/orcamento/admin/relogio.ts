"use client";

import { useSyncExternalStore } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RELÓGIO DO BACK OFFICE — E PORQUE É QUE ELE NÃO EXISTE NO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A Visão Geral é a única vista desenhada no SERVIDOR à chegada (ver
 * `lazy.tsx`), e desenhava textos tirados de `Date.now()`: «há 3min», «Bom
 * dia», «sábado, 25 de julho». O servidor escrevia um valor no HTML e o
 * browser, ao hidratar um minuto depois, calculava outro:
 *
 *     Error: Hydration failed because the server rendered text didn't match
 *     the client.     (+ há 3min / - há 2min)
 *
 * O React não tem como escolher entre os dois: deita a árvore fora e desenha o
 * ecrã inteiro outra vez. Acontecia justamente quando os pedidos eram frescos
 * — o momento em que ela abre o back office porque acabou de entrar um.
 *
 * ── PORQUE É QUE NÃO CHEGA FORMATAR MELHOR ────────────────────────────────
 *
 * Fixar o fuso (Europe/Lisbon) tira a parte SISTEMÁTICA do desencontro (o
 * servidor corre em UTC), mas não a corrida: um desenho às 11:59:59,8 e uma
 * hidratação às 12:00:00,4 continuam a discordar. `suppressHydrationWarning`
 * cala o aviso e deixa no ecrã o valor VELHO, do servidor — é a mentira que se
 * está a corrigir, agora em silêncio. A única resposta que fecha o buraco é não
 * desenhar relógio nenhum no servidor.
 *
 * ── COMO ─────────────────────────────────────────────────────────────────
 *
 * `useSyncExternalStore` com um retrato do SERVIDOR que é `null`. O React usa o
 * retrato do servidor no HTML e OUTRA VEZ na hidratação — os dois lados
 * escrevem exactamente o mesmo — e só depois de hidratar passa a ler o do
 * cliente, com um desenho normal (não é hidratação, portanto não há nada para
 * discordar). Quem chama desenha um espaço enquanto o valor for `null`.
 *
 * De borla, e não é pouco: o valor ANDA. Um back office aberto desde as 9h
 * deixa de dizer «há 2min» às 11h — a cada meio minuto os textos acertam-se
 * sozinhos, e ela vê a idade verdadeira do pedido sem recarregar a página.
 *
 * Um só temporizador para toda a aplicação (e nenhum quando ninguém está a
 * ver), porque o back office tem listas de centenas de linhas e um `setInterval`
 * por linha era o mesmo que uma folha de cálculo a recalcular sozinha.
 */

/** De quanto em quanto tempo o relógio acerta. Meio minuto para que um «há
 *  1min» não fique a mentir mais do que isso, sem ser um desenho por segundo. */
const PASSO_MS = 30_000;

let agora = Date.now();
let temporizador: ReturnType<typeof setInterval> | null = null;
const ouvintes = new Set<() => void>();

function subscrever(ouvinte: () => void): () => void {
  // O módulo pode ter sido carregado há muito (é aquecido em janelas de
  // inatividade, ver `lazy.tsx`): quem chega lê a hora de AGORA, não a de
  // quando o ficheiro entrou em memória.
  agora = Date.now();
  ouvintes.add(ouvinte);
  if (!temporizador) {
    temporizador = setInterval(() => {
      agora = Date.now();
      for (const o of ouvintes) o();
    }, PASSO_MS);
    // Não segura o processo em pé (Node, testes); nos browsers não existe.
    (temporizador as { unref?: () => void }).unref?.();
  }
  return () => {
    ouvintes.delete(ouvinte);
    if (ouvintes.size === 0 && temporizador) {
      clearInterval(temporizador);
      temporizador = null;
    }
  };
}

const noCliente = (): number => agora;
/** No servidor (e na hidratação) não há hora nenhuma — é esse o ponto. */
const noServidor = (): null => null;

/**
 * A hora, para quem desenha texto que depende dela.
 *
 * `null` no servidor e na primeira pintura do cliente; um instante em
 * milissegundos a partir daí, que se acerta sozinho a cada {@link PASSO_MS}.
 */
export function useRelogio(): number | null {
  return useSyncExternalStore(subscrever, noCliente, noServidor);
}
