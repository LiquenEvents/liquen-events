"use client";

import { useMemo } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { camposPorTraduzir, type CampoBilingue } from "@/lib/proposal-doc-bilingue";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE VAI SAIR EM PORTUGUÊS NUMA PROPOSTA INGLESA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma caixa inglesa vazia cai para o português, calada e sem marca nenhuma no
 * papel — é a única regra que nunca produz um buraco, e um documento de vinte
 * mil euros não leva marcas de revisão. O preço de o fazer calado é este
 * painel: ela tem de saber, ANTES de enviar, o que é que vai sair na língua
 * errada.
 *
 * Fica ao pé das Gralhas e da Conferência pela mesma razão que elas: é aqui que
 * a pergunta «está pronto?» se faz. A meio de escrever, um aviso destes é uma
 * interrupção — a tradução ainda está a ser escrita.
 *
 * ── E NÃO TRAVA NADA ──────────────────────────────────────────────────────
 * Como tudo o resto nesta coluna. Uma proposta com metade da prosa por traduzir
 * tem de poder seguir: ela pode ter decidido que aquelas oito rubricas são
 * nomes próprios.
 *
 * ── «FICAR EM PORTUGUÊS» É O BOTÃO QUE FAZ A CONTAGEM SER HONESTA ─────────
 * Copia o texto português para a caixa inglesa. Sem ele, um campo que não
 * precisa de tradução — «Lisianthus», «Monte da Oliveirinha» — contava como
 * falta para sempre, e um aviso sempre aceso é um aviso que se aprende a
 * ignorar, incluindo no dia em que está certo. Transforma «vazio por
 * esquecimento» em «vazio por decisão».
 */
export default function PorTraduzir({
  doc,
  onFicarEmPortugues,
  onFicarTodosEmPortugues,
  onIr,
}: {
  doc: ProposalDoc;
  /** Copia o português para a caixa inglesa DESTE campo. */
  onFicarEmPortugues: (c: CampoBilingue) => void;
  onFicarTodosEmPortugues: () => void;
  /** Leva à caixa inglesa do campo, no passo do conteúdo. */
  onIr: (c: CampoBilingue) => void;
}) {
  const faltam = useMemo(() => camposPorTraduzir(doc), [doc]);
  if (faltam.length === 0) return null;

  return (
    <section
      aria-labelledby="por-traduzir-titulo"
      className="mt-5 rounded-2xl border border-[#c08a3e]/40 bg-[#c08a3e]/[0.05] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="por-traduzir-titulo"
          className="text-[11px] font-medium tracking-[0.12em] uppercase text-foreground/70"
        >
          Por traduzir
        </h3>
        {faltam.length > 1 && (
          <button
            type="button"
            onClick={onFicarTodosEmPortugues}
            className="alvo-toque text-[11px] font-medium text-[#4d6350] transition-colors hover:text-[#415440]"
          >
            Ficar em português nos {faltam.length}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
        {faltam.length === 1
          ? "Um campo não tem versão inglesa e vai sair em português."
          : `${faltam.length} campos não têm versão inglesa e vão sair em português.`}{" "}
        Nada te impede de enviar assim.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {faltam.map((c, i) => (
          <li
            key={`${i}-${c.rotulo}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-relaxed"
          >
            <span className="text-foreground/45">{c.rotulo}:</span>
            {/* O texto português à vista. Sem ele, «Serviços · linha 3» não diz
                nada a quem não tem o documento à frente — e decidir se um campo
                precisa de tradução é olhar para o que lá está escrito. */}
            <span className="min-w-0 text-foreground/75">
              {c.texto.length > 48 ? `${c.texto.slice(0, 48)}…` : c.texto}
            </span>
            <button
              type="button"
              onClick={() => onFicarEmPortugues(c)}
              className="alvo-toque rounded-md border border-[var(--bo-hairline-strong)] px-2 py-0.5 text-[11px] font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
            >
              Ficar em português
            </button>
            <button
              type="button"
              onClick={() => onIr(c)}
              className="alvo-toque text-[11px] font-medium text-[#4d6350] underline-offset-2 transition-colors hover:text-[#415440] hover:underline"
            >
              Traduzir
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
