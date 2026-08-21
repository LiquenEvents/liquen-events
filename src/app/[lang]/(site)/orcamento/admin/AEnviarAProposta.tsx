"use client";

import { useEffect, useState } from "react";
import { tempoEstimado, type AmostraDeGeracao } from "@/lib/custo-do-pdf";
import { avancoDoEnvio, passoDoEnvio } from "@/lib/envio-em-curso";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA ESTÁ A SER ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «ao enviar a proposta, quero que haja uma animação que eu
 * perceba que está a ser enviado».
 *
 * Não havia nenhuma. O `send()` fechava a confirmação e o ecrã voltava ao botão
 * «Gerar e enviar ao cliente», apagado — durante dezenas de segundos, que é o
 * que o envio demora numa quinta com 4G fraco. O desenho do PDF, a gravação e o
 * email acontecem todos dentro de um pedido só, e do lado de cá não se via nada.
 *
 * ── A REGRA DA CASA VALE AQUI TAMBÉM ──────────────────────────────────────
 *
 * «Nenhuma animação pode atrasar uma tarefa.» Esta não atrasa nada: é o retrato
 * de uma espera que já existe. E anima só `transform` e `opacity` — a barra é
 * um `scaleX`, que o telemóvel compõe sem repintar.
 *
 * ── E COM MOVIMENTO REDUZIDO ──────────────────────────────────────────────
 *
 * Fica tudo: a barra continua a encher, sem transição a suavizar os saltos, e o
 * ponto deixa de pulsar. O que ela precisa de saber — que está a andar — não é
 * um enfeite, e tirá-lo era deixar quem pediu menos movimento sem informação
 * nenhuma.
 */

/** De quanto em quanto tempo a barra reconsidera. */
const TIQUE_MS = 200;

export default function AEnviarAProposta({
  fotos,
  amostras,
  para,
}: {
  /** Quantas fotografias o documento leva — é delas que sai a estimativa. */
  fotos: number;
  amostras: readonly AmostraDeGeracao[];
  /** Para quem vai. Vazio quando o pedido não tem email de cliente. */
  para?: string;
}) {
  const estimado = tempoEstimado(fotos, amostras);
  const [decorrido, setDecorrido] = useState(0);

  useEffect(() => {
    const inicio = Date.now();
    // `Date.now` e não um contador de tiques: um separador em segundo plano
    // engasga os temporizadores, e ao voltar a barra tem de estar onde o
    // relógio a pôs — não onde os tiques que não correram a deixaram.
    const t = setInterval(() => setDecorrido(Date.now() - inicio), TIQUE_MS);
    return () => clearInterval(t);
  }, []);

  const avanco = avancoDoEnvio(decorrido, estimado);

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-lg rounded-xl border border-[#4d6350]/25 bg-[#4d6350]/[0.05] px-3 py-2.5"
    >
      <p className="flex items-center gap-2 text-xs font-medium text-[#4d6350]">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#4d6350] motion-safe:animate-pulse"
        />
        {passoDoEnvio(decorrido, estimado)}
      </p>

      {/* A barra: um traço cheio, encolhido por `scaleX`. Nada de largura em
          percentagem — mudar a largura obriga o navegador a refazer a linha a
          cada tique, e `transform` não. */}
      <span
        aria-hidden="true"
        className="mt-2 block h-[3px] w-full overflow-hidden rounded-full bg-[#4d6350]/15"
      >
        <span
          className="block h-full w-full origin-left rounded-full bg-[#4d6350] motion-safe:transition-transform motion-safe:duration-elemento motion-safe:ease-out"
          style={{ transform: `scaleX(${avanco})` }}
        />
      </span>

      <p className="mt-1.5 text-[11px] leading-relaxed text-foreground/50">
        {/* Nunca «enviado»: quem dá o envio por feito é a resposta. Enquanto
            isto está no ecrã, o email ainda não saiu. */}
        {para ? `A proposta vai para ${para}.` : "A proposta está a ser preparada."} Não feches nem
        recarregues esta página.
      </p>
    </div>
  );
}
