"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { avancoDaEspera, esperaDemorada } from "@/lib/espera-em-curso";
import { cn } from "./cn";
import { ESTADO, PRESSAO, PROGRESSO } from "./movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ISTO ESTÁ A ACONTECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o envio de uma proposta: «quero que haja uma animação
 * que eu perceba que está a ser enviado». E depois, a olhar para o resultado:
 * «quero estes detalhes espalhados por imensas coisas».
 *
 * Este é o sítio de onde saem todos. Uma espera desenhada de doze maneiras
 * diferentes não é doze animações — é nenhuma linguagem, e o olho tem de
 * reaprender o significado em cada ecrã.
 *
 * ── AS DUAS ESPERAS ───────────────────────────────────────────────────────
 *
 * SABIDA. Passa-se `feito` e `total`: importar 312 fotos são 312 coisas, e a
 * barra diz a verdade. É sempre a melhor, e sempre que houver uma contagem é
 * esta que se usa.
 *
 * OPACA. Passa-se `estimadoMs`: um pedido, uma resposta, e no meio nada que se
 * possa contar. A barra anda depressa no princípio, vai abrandando e NUNCA
 * chega ao fim — só a resposta a fecha. Ver `espera-em-curso.ts`, que explica
 * porque é que uma barra que chega a 100% e fica lá parada estraga todas as
 * outras barras do produto.
 *
 * ── AS REGRAS QUE ISTO NÃO QUEBRA ─────────────────────────────────────────
 *
 * **Nenhuma animação atrasa uma tarefa.** Isto não acrescenta espera nenhuma:
 * é o retrato de uma que já existe.
 *
 * **Só `transform` e `opacity`.** A barra é um `scaleX` e não uma largura em
 * percentagem: mudar a largura obriga o navegador a refazer a linha a cada
 * tique, e num telemóvel isso vê-se. O `transform` é composto sem repintar.
 *
 * **Com movimento reduzido fica tudo.** A barra continua a encher, sem
 * transição a suavizar os saltos, e o ponto deixa de pulsar. O que ela precisa
 * de saber — que está a andar — não é um enfeite, e tirá-lo era deixar quem
 * pediu menos movimento sem informação nenhuma.
 *
 * **Ninguém fala por cima.** É um `role="status"` com `aria-live="polite"`, e
 * a frase muda poucas vezes de propósito: um leitor de ecrã a anunciar uma
 * percentagem cinco vezes por segundo é ruído, não é acesso.
 */

/** De quanto em quanto tempo a barra reconsidera. */
const TIQUE_MS = 200;

/**
 * O tempo decorrido desde que isto foi montado, em milissegundos.
 *
 * `Date.now` e não um contador de tiques: um separador em segundo plano
 * engasga os temporizadores, e ao voltar a barra tem de estar onde o RELÓGIO a
 * pôs — não onde os tiques que não correram a deixaram.
 *
 * Exportado porque há esperas que já têm o seu próprio desenho e só precisam
 * do relógio.
 */
export function useDecorrido(activo = true): number {
  const [decorrido, setDecorrido] = useState(0);
  const inicio = useRef(0);
  useEffect(() => {
    if (!activo) {
      setDecorrido(0);
      return;
    }
    inicio.current = Date.now();
    const t = setInterval(() => setDecorrido(Date.now() - inicio.current), TIQUE_MS);
    return () => clearInterval(t);
  }, [activo]);
  return decorrido;
}

export interface EmCursoProps {
  /**
   * O que está a acontecer, na primeira pessoa do que o computador faz: «A
   * enviar o email…», «A gerar as miniaturas…».
   *
   * Nunca um facto consumado enquanto não o é: «A enviar», e não «Enviado».
   * Quem dá uma coisa por feita é a resposta, e enquanto isto está no ecrã a
   * resposta não chegou.
   */
  titulo: ReactNode;
  /** Quantas já foram. Com `total`, faz a barra dizer a verdade. */
  feito?: number;
  /** Quantas são ao todo. */
  total?: number;
  /**
   * Quanto é que isto costuma demorar, para a espera OPACA. Ignorado quando há
   * `total`. Sem um nem outro fica só o ponto a pulsar e a frase — que é
   * honesto, e melhor do que uma barra inventada.
   */
  estimadoMs?: number;
  /** A linha pequena por baixo: a consequência, o aviso, o destinatário. */
  nota?: ReactNode;
  /** Quando a espera se arrastar muito mais do que o previsto. Só na opaca. */
  notaDemorada?: ReactNode;
  /** Um «Parar», quando parar é possível e seguro. */
  aoParar?: () => void;
  rotuloDoParar?: string;
  className?: string;
}

export function EmCurso({
  titulo,
  feito,
  total,
  estimadoMs,
  nota,
  notaDemorada,
  aoParar,
  rotuloDoParar = "Parar",
  className,
}: EmCursoProps) {
  const decorrido = useDecorrido();
  const sabida = typeof feito === "number" && typeof total === "number" && total > 0;
  const avanco = sabida
    ? Math.min(1, Math.max(0, feito! / total!))
    : avancoDaEspera(decorrido, estimadoMs ?? 0);
  const demorada = !sabida && !!notaDemorada && esperaDemorada(decorrido, estimadoMs ?? 0);
  const temBarra = sabida || (estimadoMs ?? 0) > 0;

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "w-full rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.05] px-3 py-2.5",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <p className="flex min-w-0 flex-1 items-center gap-2 text-xs font-medium text-[#4d6350]">
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4d6350] motion-safe:animate-pulse"
          />
          <span className="min-w-0">{titulo}</span>
        </p>
        {/* A contagem à direita e em números tabulares: sem eles, «7 de 312» a
            passar a «8 de 312» empurra a linha meio pixel a cada foto. */}
        {sabida && (
          <span className="shrink-0 text-[11px] tabular-nums text-[#4d6350]/70">
            {feito} de {total}
          </span>
        )}
        {aoParar && (
          <button
            type="button"
            onClick={aoParar}
            // Sem transição nenhuma até aqui — e é o botão que pára uma espera,
            // ou seja aquele em que se carrega com pressa. É onde a resposta ao
            // toque mais se nota que falta.
            className={`alvo-toque shrink-0 rounded-lg px-2 text-[11px] text-[#4d6350]/75 underline decoration-dotted underline-offset-2 hover:text-[#4d6350] active:bg-[#4d6350]/[0.12] ${ESTADO} ${PRESSAO}`}
          >
            {rotuloDoParar}
          </button>
        )}
      </div>

      {temBarra && (
        /* Um traço cheio, encolhido por `scaleX`. `aria-hidden` porque a barra
           não diz nada que a frase e a contagem já não digam — e um
           `progressbar` vivo ao lado de um `status` vivo faz o leitor de ecrã
           anunciar a mesma espera duas vezes. */
        <span
          aria-hidden="true"
          className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-[#4d6350]/15"
        >
          <span
            // A marca é para os testes: o traço não tem papel nem nome (é
            // `aria-hidden`), e sem ela a única maneira de lhe chegar era
            // contar `span`s dentro de `span`s — que se cala no dia em que
            // alguém acrescentar um.
            data-barra="preenchimento"
            // `motion-safe:duration-elemento` NÃO gerava regra nenhuma: o
            // Tailwind v4 lê os utilitários `duration-*` do espaço de nomes
            // `--transition-duration-*`, e o `@theme` da casa declara
            // `--duration-elemento`. A barra corria nos 150 ms por omissão em
            // vez dos 250 ms pretendidos. Ver `movimento.ts` (ponto 3).
            className={`block h-full w-full origin-left rounded-full bg-[#4d6350] ${PROGRESSO}`}
            style={{ transform: `scaleX(${avanco})` }}
          />
        </span>
      )}

      {(demorada ? notaDemorada : nota) && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
          {demorada ? notaDemorada : nota}
        </p>
      )}
    </div>
  );
}
