"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";
import { ESTADO, PRESSAO } from "./movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A EXPLICAÇÃO QUE SE PEDE, EM VEZ DA QUE SE LEVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o texto da caixa «Extra»: «ocupa três linhas sempre
 * visíveis». E o critério, que vale para o editor inteiro: **são úteis na
 * primeira vez, ruído a partir da segunda.**
 *
 * Uma explicação de três linhas ao lado de um controlo lê-se uma vez. Nas
 * outras cinquenta ocupa o espaço onde deviam estar as linhas do orçamento, e o
 * olho aprende a saltá-la — o que é pior do que ela não existir, porque no dia
 * em que mudar ninguém repara.
 *
 * ── PORQUE É QUE NÃO É UM `title` ─────────────────────────────────────────
 * O `title` nativo não aparece ao toque (metade do trabalho dela é no
 * telemóvel), não se abre pelo teclado, e desaparece sozinho ao fim de uns
 * segundos — não dá para ler três linhas. Isto é um botão a sério, com o texto
 * num painel que fica aberto até ser fechado.
 *
 * ── O QUE VAI PARA AQUI, E O QUE NÃO VAI ──────────────────────────────────
 * Vai o que explica COMO FUNCIONA um controlo: é sempre o mesmo texto, e quem
 * já sabe não precisa dele. NÃO vai nada que dependa do documento — «1 linha
 * ainda não tem preço», «a última fila fica com uma foto só», o aviso de
 * ortografia. Esses aparecem porque aconteceu alguma coisa, e escondê-los atrás
 * de um botão era escondê-los.
 */
export function Ajuda({
  /** O que o botão explica, para quem não vê o ícone («o que faz a caixa Extra»). */
  sobre,
  /**
   * De que lado do botão é que o painel cresce. Por omissão para a direita,
   * que é onde ele cabe na esmagadora maioria dos sítios — um `?` ao lado de
   * uma etiqueta tem o cartão inteiro à sua direita.
   *
   * `"direita"` para quando o botão está encostado à margem direita (a barra
   * de selecção do seletor de fotos): aí um painel de 18 rem ancorado à
   * esquerda saía do diálogo, e o que se lia era metade de cada linha.
   */
  alinhar = "esquerda",
  children,
  className,
}: {
  sobre: string;
  alinhar?: "esquerda" | "direita";
  children: ReactNode;
  className?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const id = useId();
  const caixa = useRef<HTMLSpanElement>(null);

  // Fechar com Escape e ao carregar fora. As duas juntas: sem a primeira, quem
  // anda pelo teclado fica preso; sem a segunda, o painel acompanha a página
  // enquanto ela já está a escrever noutro sítio.
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberto(false);
    };
    const aoCarregar = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    document.addEventListener("keydown", aoTeclar);
    document.addEventListener("mousedown", aoCarregar);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.removeEventListener("mousedown", aoCarregar);
    };
  }, [aberto]);

  return (
    <span ref={caixa} className={cn("relative inline-flex items-center", className)}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        aria-expanded={aberto}
        aria-controls={aberto ? id : undefined}
        // O nome diz o ASSUNTO e não «ajuda»: numa lista de controlos lida em
        // voz alta, dez botões «Ajuda» são dez botões indistinguíveis.
        aria-label={`Ajuda: ${sobre}`}
        className={cn(
          "alvo-toque flex h-5 w-5 shrink-0 items-center justify-center rounded-full",
          // Era `transition-colors` à seca — sem `motion-safe:`, ou seja a animar
          // para quem pediu para não animar. Ver `movimento.ts`.
          `border text-[10px] leading-none font-medium ${ESTADO} ${PRESSAO}`,
          aberto
            ? "border-[#4d6350]/60 bg-[#4d6350]/10 text-[#4d6350]"
            : "border-foreground/25 text-foreground/45 hover:border-foreground/45 hover:text-foreground/70 active:bg-[var(--bo-tinta-6)]",
        )}
      >
        <span aria-hidden="true">?</span>
      </button>
      {aberto && (
        <span
          id={id}
          role="note"
          // Encostado ao botão e não centrado: um painel de 18rem cabe sem sair
          // do cartão em qualquer largura de ecrã — desde que cresça para o
          // lado onde há espaço, que é o que `alinhar` escolhe.
          className={cn(
            "bo-entrada absolute top-full z-20 mt-1.5 w-[18rem] max-w-[80vw] rounded-xl border border-[var(--bo-hairline-strong)] bg-white p-3 text-[11px] leading-relaxed text-foreground/70 normal-case tracking-normal shadow-[var(--bo-sombra-suspensa)]",
            alinhar === "direita" ? "right-0" : "left-0",
          )}
        >
          {children}
        </span>
      )}
    </span>
  );
}
