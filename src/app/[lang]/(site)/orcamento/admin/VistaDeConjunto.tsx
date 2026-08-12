"use client";

import type { MoodBoard } from "@/lib/proposal-doc";
import { MOOD_BOARD_MAX_IMAGES } from "@/lib/proposal-doc";
import { ASPETO_POR_OMISSAO } from "@/lib/proposal-geometria";
import { layoutDoBoard, ordemDasFotos } from "@/lib/proposal-moodboard";
import PreviaDaPagina from "./PreviaDaPagina";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS OITO PÁGINAS LADO A LADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Não há forma de ver todos lado a lado para avaliar coerência
 * de paleta.»
 *
 * O editor mostra uma página de cada vez, e uma proposta tem oito. A pergunta
 * que não se consegue fazer assim é a única que se faz no fim: **isto parece
 * tudo do mesmo casamento?** Duas páginas de verdes frios e uma de laranjas
 * quentes só se vêem quando estão à mesma distância dos olhos.
 *
 * ── AS MINIATURAS SÃO AS PÁGINAS A SÉRIO ──────────────────────────────────
 * Cada uma é a `PreviaDaPagina`, com as caixas de `caixasDoMoodboard` — a mesma
 * geometria do gerador. Não é um resumo nem uma grelha de fotos: é a folha,
 * pequena. Uma vista de conjunto feita com outro desenho responderia à pergunta
 * errada.
 *
 * ── REORDENAR AQUI ────────────────────────────────────────────────────────
 * É aqui que se decide que a página do jantar tem de vir antes da do cocktail,
 * portanto é aqui que se tem de poder mexer. As setas movem POSIÇÕES no ecrã, e
 * a acção é a mesma do editor (`moveBoard`) — não uma segunda maneira de
 * reordenar, que um dia discordaria da primeira.
 */
export default function VistaDeConjunto({
  boards,
  ordem,
  urls,
  originais = {},
  aspetos,
  onMover,
  onSaltar,
  onFechar,
}: {
  boards: readonly MoodBoard[];
  /** Índices reais, pela ordem em que as páginas saem. */
  ordem: readonly number[];
  urls: Record<string, string>;
  /** O original de cada foto, para quando a miniatura não existir. */
  originais?: Record<string, string>;
  /** A forma medida de cada foto, por caminho. */
  aspetos: Record<string, number>;
  /** Mover a página que está NA POSIÇÃO `de` para a posição `para`. */
  onMover: (de: number, para: number) => void;
  onSaltar: (bi: number) => void;
  onFechar: () => void;
}) {
  const comFotos = ordem.filter((bi) => (boards[bi]?.images?.length ?? 0) > 0);

  return (
    <div className="mb-4 rounded-2xl border border-foreground/10 bg-foreground/[0.02] p-4">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div>
          <p className="bo-eyebrow">Vista de conjunto</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-foreground/50">
            As páginas pela ordem em que saem. É aqui que se vê se parecem todas do mesmo casamento.
          </p>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="alvo-toque text-[11px] font-medium text-foreground/55 transition-colors hover:text-foreground/80"
        >
          Fechar
        </button>
      </div>

      {comFotos.length === 0 ? (
        <p className="text-xs text-foreground/45">
          Ainda não há páginas com fotografias — as vazias não são impressas.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
          {comFotos.map((bi) => {
            const b = boards[bi];
            const desenho = ordemDasFotos(b).slice(0, MOOD_BOARD_MAX_IMAGES);
            const pos = ordem.indexOf(bi);
            return (
              <li key={bi} className="min-w-0">
                <button
                  type="button"
                  onClick={() => onSaltar(bi)}
                  className="block w-full text-left"
                  aria-label={`Ir para a página ${pos + 1}, ${b.title?.trim() || "sem título"}`}
                >
                  <PreviaDaPagina
                    layout={layoutDoBoard(b)}
                    aspectos={desenho.map((i) => aspetos[b.images[i]] ?? ASPETO_POR_OMISSAO)}
                    urls={desenho.map((i) => urls[b.images[i]])}
                    originais={desenho.map((i) => originais[b.images[i]])}
                    semRecorte={b.enquadramento === "forma-da-foto"}
                    titulo={b.title}
                    subtitulo={b.subtitulo}
                    legenda={b.annotation}
                  />
                </button>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate text-[11px] text-foreground/60">
                    {pos + 1}. {b.title?.trim() || "sem título"}
                  </p>
                  {/* Reordenar SEM sair daqui: é nesta vista que se percebe que
                      a página do jantar tem de vir antes da do cocktail. */}
                  <span className="flex shrink-0 gap-0.5">
                    <button
                      type="button"
                      onClick={() => onMover(pos, pos - 1)}
                      disabled={pos === 0}
                      aria-label={`Mover a página ${pos + 1} para trás`}
                      className="alvo-toque flex h-6 w-6 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-foreground/[0.07] disabled:opacity-30"
                    >
                      <span aria-hidden="true">←</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => onMover(pos, pos + 1)}
                      disabled={pos === ordem.length - 1}
                      aria-label={`Mover a página ${pos + 1} para a frente`}
                      className="alvo-toque flex h-6 w-6 items-center justify-center rounded-md text-foreground/45 transition-colors hover:bg-foreground/[0.07] disabled:opacity-30"
                    >
                      <span aria-hidden="true">→</span>
                    </button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
