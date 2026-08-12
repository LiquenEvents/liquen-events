"use client";

import type { MoodBoard } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DAS PÁGINAS DE INSPIRAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Índice lateral dentro da secção, com os 8 boards, para saltar
 * entre eles sem scroll. Marca quais estão vazios, prontos ou bloqueados.»
 *
 * Oito boards abertos são vários ecrãs de altura. Sem índice, «ir ao quinto» é
 * percorrer os quatro primeiros — e, a meio de os percorrer, mexer sem querer
 * num campo pelo caminho.
 *
 * ── O ESTADO É O QUE FAZ ISTO VALER A PENA ────────────────────────────────
 * Uma lista de títulos é um atalho. Uma lista que diz quais é que estão VAZIOS
 * responde à pergunta que se faz mesmo a meio de uma proposta: «o que é que
 * ainda me falta?» — que é a razão de se percorrer a secção toda.
 *
 * ── PORQUE É QUE NÃO É `position: sticky` NO TELEMÓVEL ────────────────────
 * A 390 px de largura, uma coluna lateral rouba metade da grelha das fotos. Em
 * ecrã estreito o índice é uma tira que se percorre na horizontal, por cima da
 * lista; a partir de `lg` passa a coluna fixa ao lado.
 */
export default function MoodBoardIndice({
  boards,
  ordem,
  bloqueados,
  onSaltar,
}: {
  boards: readonly MoodBoard[];
  /** Os índices reais, pela ordem em que estão desenhados. */
  ordem: readonly number[];
  /** Quantas fotos tem cada board, por índice real. */
  bloqueados?: readonly boolean[];
  onSaltar: (bi: number) => void;
}) {
  if (boards.length === 0) return null;

  return (
    <nav
      aria-label="Índice das páginas de inspiração"
      className="mb-3 lg:mb-0 lg:sticky lg:top-24 lg:self-start"
    >
      <p className="bo-eyebrow mb-1.5">Páginas</p>
      <ul className="flex gap-1.5 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
        {ordem.map((bi, pos) => {
          const b = boards[bi];
          const quantas = b?.images?.length ?? 0;
          const bloqueado = bloqueados?.[bi] ?? false;
          const vazio = quantas === 0;
          return (
            <li key={bi} className="shrink-0 lg:shrink">
              <button
                type="button"
                onClick={() => onSaltar(bi)}
                className={`alvo-toque flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-[11px] leading-tight transition-colors ${
                  vazio
                    ? "border-dashed border-foreground/20 text-foreground/45"
                    : "border-foreground/10 text-foreground/75 hover:border-foreground/25"
                }`}
              >
                <span className="text-foreground/30 tabular-nums">{pos + 1}</span>
                <span className="min-w-0 flex-1 truncate">{b?.title?.trim() || "sem título"}</span>
                {/* O ESTADO, em duas palavras. «Vazio» é o que interessa: é a
                    resposta a «o que é que me falta?». */}
                <span className="shrink-0 text-[10px] text-foreground/40">
                  {bloqueado ? "fechado" : vazio ? "vazio" : `${quantas}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
