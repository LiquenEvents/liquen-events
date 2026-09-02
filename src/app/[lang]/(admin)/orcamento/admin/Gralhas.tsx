"use client";

import { useMemo } from "react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import { gralhasDoDocumento, type Gralha } from "@/lib/proposal-ortografia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS ACENTOS QUE FALTAM, ANTES DE O DOCUMENTO SAIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Decor Floral Cerimonia" sem acento na lista de serviços →
 * "Cerimónia". Verificação ortográfica dos campos que saem no PDF.»
 *
 * Fica ao pé do botão de enviar pela mesma razão que a Conferência: é ali que
 * a pergunta «está pronto?» se faz. Antes disso, a meio de escrever, um aviso
 * de acento é uma interrupção — a palavra ainda está a ser escrita.
 *
 * ── NÃO TRAVA O ENVIO ─────────────────────────────────────────────────────
 * Como tudo o resto nesta coluna. Uma palavra pode estar escrita assim de
 * propósito; quem decide é ela. O que isto faz é não deixar que a decisão seja
 * tomada por distracção.
 *
 * A regra e as correcções vivem em `proposal-ortografia.ts` — este ficheiro só
 * desenha o que de lá vem.
 */
export default function Gralhas({
  doc,
  onCorrigir,
  onCorrigirTudo,
  onIr,
}: {
  doc: ProposalDoc;
  /** Aplica UMA correcção ao documento do estúdio. */
  onCorrigir: (g: Gralha) => void;
  onCorrigirTudo: () => void;
  /**
   * Leva ao campo onde a palavra está escrita.
   *
   * «Corrigir» resolve o caso normal — falta um acento, põe-se o acento. Não
   * resolve os outros dois: a palavra pode estar assim de propósito, ou ser a
   * frase à volta dela que está errada. Nesses, o que é preciso é chegar ao
   * campo, e procurá-lo à mão num documento de catorze páginas é o que fazia
   * este aviso acabar ignorado.
   */
  onIr: (g: Gralha) => void;
}) {
  const gralhas = useMemo(() => gralhasDoDocumento(doc), [doc]);
  if (gralhas.length === 0) return null;

  return (
    <section
      aria-labelledby="gralhas-titulo"
      className="mt-5 rounded-2xl border border-[#c08a3e]/40 bg-[#c08a3e]/[0.05] p-4"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3
          id="gralhas-titulo"
          className="text-[11px] font-medium tracking-[0.12em] uppercase text-foreground/70"
        >
          Ortografia
        </h3>
        {gralhas.length > 1 && (
          <button
            type="button"
            onClick={onCorrigirTudo}
            className="alvo-toque text-[11px] font-medium text-[#4d6350] transition-colors hover:text-[#415440]"
          >
            Corrigir as {gralhas.length}
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-foreground/55">
        {gralhas.length === 1
          ? "Uma palavra que sai impressa parece estar sem acento."
          : `${gralhas.length} palavras que saem impressas parecem estar sem acento.`}{" "}
        Nada te impede de enviar assim.
      </p>

      <ul className="mt-3 flex flex-col gap-1.5">
        {gralhas.map((g, i) => (
          <li
            key={`${i}-${g.escrita}`}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 text-xs leading-relaxed"
          >
            <span className="text-foreground/45">{g.rotulo}:</span>
            {/* A palavra escrita e a proposta, uma ao lado da outra. Sem as
                duas à vista, «corrigir» é um botão que faz uma coisa que não
                se viu — e num campo que vai impresso isso não chega. */}
            <span className="text-foreground/75">
              <span className="line-through decoration-[#8a2a22]/60">{g.escrita}</span>
              <span aria-hidden="true" className="mx-1 text-foreground/30">
                →
              </span>
              <strong className="font-medium">{g.sugerida}</strong>
            </span>
            <button
              type="button"
              onClick={() => onCorrigir(g)}
              className="alvo-toque rounded-md border border-[var(--bo-hairline-strong)] px-2 py-0.5 text-[11px] font-medium text-foreground/70 transition-colors hover:border-foreground/30 hover:text-foreground/90"
            >
              Corrigir
            </button>
            {/* O caminho para quem não quer a correcção automática: ver a
                palavra onde ela está escrita, com a frase à volta. */}
            <button
              type="button"
              onClick={() => onIr(g)}
              className="alvo-toque text-[11px] font-medium text-[#4d6350] underline-offset-2 transition-colors hover:text-[#415440] hover:underline"
            >
              Ver no campo
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
