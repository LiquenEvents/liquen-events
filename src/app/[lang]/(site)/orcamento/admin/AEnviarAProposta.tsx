"use client";

import { tempoEstimado, type AmostraDeGeracao } from "@/lib/custo-do-pdf";
import { passoDoEnvio } from "@/lib/envio-em-curso";
import { EmCurso, useDecorrido } from "./ui";

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
 * ── O QUE ESTE FICHEIRO AINDA DECIDE ──────────────────────────────────────
 *
 * Só o que é DO ENVIO: quanto ele costuma demorar (a estimativa aprendida das
 * gerações anteriores), em que passo o servidor vai (`passoDoEnvio`) e para
 * quem a proposta vai. O desenho da espera — a barra que nunca chega ao fim, o
 * ponto a pulsar, o que acontece com movimento reduzido — mudou-se para o
 * `EmCurso`, que é agora a única maneira de esta casa desenhar uma espera.
 *
 * Foi este ecrã que a inventou; passou a ser um dos que a usam.
 */

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
  const decorrido = useDecorrido();

  return (
    <EmCurso
      className="max-w-lg"
      titulo={passoDoEnvio(decorrido, estimado)}
      estimadoMs={estimado}
      nota={
        <>
          {/* Nunca «enviado»: quem dá o envio por feito é a resposta. Enquanto
              isto está no ecrã, o email ainda não saiu. */}
          {para ? `A proposta vai para ${para}.` : "A proposta está a ser preparada."} Não feches
          nem recarregues esta página.
        </>
      }
    />
  );
}
