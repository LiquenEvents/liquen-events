"use client";

import type { Impedimento } from "@/lib/proposal-progress";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE O BOTÃO NÃO ESTÁ LIGADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando falta alguma coisa na proposta, quero que apareça um
 * aviso a dizer que não dá para enviar porque não preenchi tal coisa».
 *
 * ── O QUE ESTAVA MAL ──────────────────────────────────────────────────────
 *
 * A razão existia e era boa — o `oQueFaltaParaEnviar` já a sabia dizer, campo a
 * campo — mas vivia no `title` do botão. Um `title` é uma bolha que só aparece
 * com o rato parado em cima de um botão DESACTIVADO, e num iPhone não aparece
 * de todo. Ela chegava ao último ecrã da jornada toda, carregava, não acontecia
 * nada, e não havia no ecrã uma única palavra a explicar porquê.
 *
 * ── PORQUE É QUE FICA AO LADO DO BOTÃO ────────────────────────────────────
 *
 * A coluna lateral do passo 1 já lista as faltas, e é lá que se resolvem. Mas a
 * pergunta «porque é que isto não envia?» faz-se aqui, no instante do envio, e é
 * aqui que a resposta tem de estar. Mandá-la procurar noutro passo o motivo de o
 * botão deste não funcionar é a mesma distância que o `title` já tinha.
 *
 * ── E PORQUE É QUE CADA LINHA É UM BOTÃO ──────────────────────────────────
 *
 * Porque dizer o que falta sem dizer onde é meia resposta. Cada impedimento sabe
 * a secção e, quando existe, o campo — é o mesmo salto da Conferência, que abre
 * a dobra e põe o cursor dentro da caixa.
 */
export default function PorqueNaoDaParaEnviar({
  faltas,
  fotosPorConfirmar,
  onIr,
}: {
  /** Tudo o que `oQueFaltaParaEnviar` devolveu — os conselhos ficam de fora. */
  faltas: readonly Impedimento[];
  /** Fotografias ainda a entrar na proposta. Não é uma falta: é uma espera. */
  fotosPorConfirmar: number;
  onIr: (falta: Impedimento) => void;
}) {
  const travam = faltas.filter((f) => f.trava);
  if (travam.length === 0 && fotosPorConfirmar === 0) return null;

  return (
    <div
      // `polite` e não `assertive`: isto aparece quando ela chega ao passo,
      // não a meio de uma frase que esteja a escrever.
      role="status"
      aria-live="polite"
      className="max-w-lg rounded-xl border border-[#8a2a22]/30 bg-[#8a2a22]/[0.05] px-3 py-2 text-xs leading-relaxed text-foreground/75"
    >
      {travam.length > 0 ? (
        <>
          <p className="font-medium text-[#8a2a22]">
            {travam.length === 1
              ? "Não dá para enviar: falta uma coisa."
              : `Não dá para enviar: faltam ${travam.length} coisas.`}
          </p>
          <ul className="mt-1.5 flex flex-col gap-0.5">
            {travam.map((f) => (
              <li key={f.id}>
                <button
                  type="button"
                  onClick={() => onIr(f)}
                  className="alvo-invisivel group flex w-full items-baseline gap-1.5 text-left text-foreground/75 transition-colors hover:text-foreground"
                >
                  <span aria-hidden="true" className="text-foreground/35">
                    ·
                  </span>
                  <span className="min-w-0 flex-1 underline decoration-foreground/20 underline-offset-2 group-hover:decoration-foreground/50">
                    {f.texto}
                  </span>
                  <span
                    aria-hidden="true"
                    className="shrink-0 text-foreground/30 group-hover:text-foreground/60"
                  >
                    →
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1.5 text-foreground/55">
            Toca numa linha para ir ao sítio onde se preenche.
          </p>
        </>
      ) : (
        /* ── A ESPERA NÃO É UMA FALTA ──────────────────────────────────────
           Nada está por preencher: há fotografias a subir. Dizer «falta
           preencher» aqui mandava-a procurar um campo que está preenchido. */
        <p>
          {fotosPorConfirmar === 1
            ? "Ainda há 1 fotografia a entrar na proposta. Assim que assentar, o envio fica disponível."
            : `Ainda há ${fotosPorConfirmar} fotografias a entrar na proposta. Assim que assentarem, o envio fica disponível.`}
        </p>
      )}
    </div>
  );
}
