"use client";

import type { KeyboardEvent } from "react";
import {
  DISPOSICOES,
  FOTOS_DA_DISPOSICAO,
  NOME_DA_DISPOSICAO,
  composicao,
  repartir,
  type Disposicao,
} from "@/lib/pdf-editorial/mosaico";
import { composicaoEmPalavras } from "@/lib/pdf-editorial/plano";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DISPOSIÇÃO DAS FOTOGRAFIAS DE UM TEMA — À ESCOLHA, NO DESENHO NOVO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (15/10): «antigamente dava para escolher os mosaicos que
 * queria… a disposição das fotos no slide», «mas com o mesmo design que está
 * agora no PDF». O selector do PDF antigo saiu no #173; este é o mesmo gesto
 * para as composições do PDF novo.
 *
 * Cada opção é um desenho pequeno da página — e o desenho sai da MESMA
 * `composicao()` que o PDF e as miniaturas usam, com as formas das fotografias
 * verdadeiras. Se divergissem, ela escolhia por um desenho e recebia outro.
 *
 * «Automática» é uma opção a sério: sem escolha, a página acompanha o número
 * de fotografias. Uma disposição que não serve para tão poucas fotografias fica
 * desligada e diz porquê; com mais do que a página leva, o tema reparte-se por
 * mais páginas, e o rótulo di-lo.
 */

type Opcao = Disposicao | null;

export default function EscolherDisposicao({
  valor,
  aspectos,
  vezPar,
  desligado = false,
  onEscolher,
  onAplicarATodos,
}: {
  valor: Disposicao | null;
  /** A forma de cada fotografia, pela ordem por que a página as desenha. */
  aspectos: readonly number[];
  /** A vez do tema é par? Decide de que lado fica o texto, como no PDF. */
  vezPar: boolean;
  /** Um tema fechado não muda. */
  desligado?: boolean;
  onEscolher: (d: Disposicao | null) => void;
  /** Pôr esta disposição em todos os temas (só aparece quando há escolha). */
  onAplicarATodos?: () => void;
}) {
  const n = aspectos.length;
  const opcoes: Opcao[] = [null, ...DISPOSICOES];
  const serve = (o: Opcao) => o === null || n >= FOTOS_DA_DISPOSICAO[o].min;
  const escolhido = Math.max(0, opcoes.indexOf(valor));

  // Um só ponto de paragem no tabulador e as setas a andar de opção em opção,
  // saltando as que não servem — a navegação do `Segmented`.
  function aoTeclar(e: KeyboardEvent<HTMLDivElement>) {
    const passo =
      e.key === "ArrowRight" || e.key === "ArrowDown"
        ? 1
        : e.key === "ArrowLeft" || e.key === "ArrowUp"
          ? -1
          : 0;
    if (!passo || desligado) return;
    e.preventDefault();
    for (let k = 1; k <= opcoes.length; k++) {
      const o = opcoes[(escolhido + passo * k + opcoes.length * k) % opcoes.length];
      if (serve(o)) {
        onEscolher(o);
        return;
      }
    }
  }

  return (
    <div className="mt-3">
      <p className="bo-eyebrow mb-1">Disposição das fotos</p>
      <p className="mb-2 text-[11px] leading-relaxed text-[var(--bo-text-muted)]">
        {valor
          ? `Escolhida por vocês: ${composicaoEmPalavras(n, valor).toLowerCase()}.`
          : `Automática — ${composicaoEmPalavras(n).toLowerCase()}.`}
      </p>
      <div
        role="radiogroup"
        aria-label="Disposição das fotos na página"
        aria-disabled={desligado || undefined}
        onKeyDown={aoTeclar}
        className="flex flex-wrap gap-2"
      >
        {opcoes.map((o, i) => {
          const activo = o === valor;
          const ok = serve(o);
          const limites = o ? FOTOS_DA_DISPOSICAO[o] : null;
          const porque =
            !ok && limites ? `Precisa de pelo menos ${limites.min} fotografias` : undefined;
          const paginas = o && ok ? repartir(n, o).length : 1;
          return (
            <button
              key={o ?? "auto"}
              type="button"
              role="radio"
              aria-checked={activo}
              aria-label={`${o ? NOME_DA_DISPOSICAO[o] : "Automática"}${porque ? ` — ${porque.toLowerCase()}` : ""}`}
              title={porque}
              disabled={desligado || !ok}
              tabIndex={i === escolhido ? 0 : -1}
              onClick={() => onEscolher(o)}
              className={`w-[5.75rem] rounded-lg border p-1.5 text-left disabled:cursor-not-allowed disabled:opacity-40 ${
                activo
                  ? "border-[var(--bo-accent)] bg-[var(--bo-tinta-10)]"
                  : "border-[var(--bo-hairline-strong)] bg-[var(--bo-surface)]"
              } ${ESTADO} ${PRESSAO}`}
            >
              <DiagramaDaDisposicao disposicao={o} aspectos={aspectos} vezPar={vezPar} />
              {/* A escolha nunca é só cor: muda o peso, e o `aria-checked` diz o
                  mesmo a quem ouve. */}
              <span
                className={`mt-1 block text-[10px] leading-tight ${
                  activo ? "font-semibold text-[var(--bo-text)]" : "text-[var(--bo-text-muted)]"
                }`}
              >
                {o ? NOME_DA_DISPOSICAO[o] : "Automática"}
                {paginas > 1 && (
                  <span className="block text-[9px] text-[var(--bo-text-muted)]">
                    {paginas} páginas
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      {valor && onAplicarATodos && !desligado && (
        <button
          type="button"
          onClick={onAplicarATodos}
          className={`mt-2 text-xs font-medium text-[var(--bo-accent)] underline-offset-2 hover:underline ${ESTADO} ${PRESSAO}`}
        >
          Usar «{NOME_DA_DISPOSICAO[valor]}» em todos os temas
        </button>
      )}
    </div>
  );
}

/** A primeira página do tema com esta disposição, à escala. */
export function DiagramaDaDisposicao({
  disposicao,
  aspectos,
  vezPar,
}: {
  disposicao: Disposicao | null;
  aspectos: readonly number[];
  vezPar: boolean;
}) {
  const naPrimeira = aspectos.length ? repartir(aspectos.length, disposicao)[0] : 0;
  const c = composicao(aspectos.slice(0, naPrimeira), vezPar, disposicao);
  const celulas = c.tipo === "texto" ? [] : c.celulas;
  const mosaico = "mosaico" in c ? c.mosaico : null;
  return (
    <svg
      viewBox="0 0 1123 794"
      className="block h-auto w-full overflow-hidden rounded-[3px]"
      // O rótulo diz o mesmo por palavras.
      aria-hidden="true"
      focusable="false"
    >
      <rect width={1123} height={794} className="fill-[var(--bo-papel-pdf)]" />
      {mosaico && (
        <rect
          x={mosaico.x + 40}
          y={mosaico.y + 60}
          width={Math.max(40, mosaico.w * 0.55)}
          height={36}
          rx={18}
          className="fill-[var(--bo-accent)]"
        />
      )}
      {celulas.map((cel, k) => (
        <rect
          key={k}
          x={cel.x}
          y={cel.y}
          width={cel.w}
          height={cel.h}
          // As fotografias claras sobre a folha escura, como no PDF; a primeira
          // (a ★) um pouco mais clara, porque é a que manda no destaque.
          className={
            k === 0 ? "fill-[var(--bo-surface)] opacity-80" : "fill-[var(--bo-surface)] opacity-50"
          }
        />
      ))}
    </svg>
  );
}
