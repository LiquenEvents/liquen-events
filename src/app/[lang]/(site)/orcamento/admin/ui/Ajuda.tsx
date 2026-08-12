"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "./cn";

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
  children,
  className,
}: {
  sobre: string;
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
          "border text-[10px] leading-none font-medium transition-colors",
          aberto
            ? "border-[#4d6350]/60 bg-[#4d6350]/10 text-[#4d6350]"
            : "border-foreground/25 text-foreground/45 hover:border-foreground/45 hover:text-foreground/70",
        )}
      >
        <span aria-hidden="true">?</span>
      </button>
      {aberto && (
        <span
          id={id}
          role="note"
          // `left-0` e não centrado: encostado ao botão, um painel de 18rem cabe
          // sem sair do cartão em qualquer largura de ecrã.
          className="absolute top-full left-0 z-20 mt-1.5 w-[18rem] max-w-[80vw] rounded-xl border border-foreground/15 bg-white p-3 text-[11px] leading-relaxed text-foreground/70 normal-case tracking-normal shadow-[0_6px_20px_rgba(42,38,32,0.10)]"
        >
          {children}
        </span>
      )}
    </span>
  );
}
