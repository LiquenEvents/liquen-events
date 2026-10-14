"use client";

import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Impedimento } from "@/lib/proposal-progress";
import { FolhaOuDialogo } from "./ui";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA DO ENVIO, NO TELEMÓVEL: UMA LINHA, E O RESTO A UM TOQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela (14/10), com a captura do «Rever e enviar» num iPhone: «esta
 * aba de enviar ao cliente no telemóvel tapa tudo… transforma isto em algo
 * inteligente que se adapte».
 *
 * A barra levava seis coisas — voltar, a língua, o descarregar, o «Vai para»,
 * a caixa vermelha do que falta e o enviar — e no telemóvel isso é meio ecrã
 * colado por cima do trabalho. Nada daquilo está a mais; está tudo ao mesmo
 * tempo. Fica, na barra, o que decide o gesto seguinte: voltar, o ESTADO numa
 * pastilha, e enviar. A pastilha abre uma folha com o resto, inteiro e pela
 * mesma ordem.
 *
 * O ecrã largo não muda: lá há espaço, e a barra continua a ser a de sempre.
 */

/**
 * Onde vivem a língua e o descarregar: ao lado do botão no ecrã largo, numa
 * folha no telemóvel — com o «Vai para» e a lista do que falta por cima
 * (`antes`), que na barra compacta deixam de caber.
 */
export function ControlosDoEnvio({
  compacta,
  aberta,
  onFechar,
  antes,
  children,
}: {
  compacta: boolean;
  aberta: boolean;
  onFechar: () => void;
  antes: ReactNode;
  children: ReactNode;
}) {
  if (!compacta) {
    return (
      <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1.5">
        {children}
      </div>
    );
  }
  /**
   * ── A FOLHA NASCE FORA DA BARRA ─────────────────────────────────────────
   * MEDIDO a 390 px: desenhada aqui dentro, a folha abria POR TRÁS da cápsula
   * dos destinos. A barra é `sticky` com `z-20` e `backdrop-filter` — e o
   * `backdrop-filter` faz dela o bloco de contenção de tudo o que é `fixed`
   * lá dentro, e o `z-20` o tecto do empilhamento. A folha vai para o `body`,
   * que é onde as outras folhas desta casa vivem.
   */
  if (typeof document === "undefined") return null;
  return createPortal(
    <FolhaOuDialogo
      aberto={aberta}
      onFechar={onFechar}
      titulo="Antes de enviar"
      descricao="Para onde vai, o que falta, a língua e o PDF."
      largura="sm"
    >
      <div className="flex flex-col gap-4">
        {antes}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2">{children}</div>
      </div>
    </FolhaOuDialogo>,
    document.body,
  );
}

/** O que a pastilha diz. Puro, para se poder provar sem desenhar nada. */
export function estadoDoEnvio(
  faltas: readonly Impedimento[],
  fotosPorConfirmar: number,
  idioma: string,
): { texto: string; trava: boolean } {
  if (fotosPorConfirmar > 0) return { texto: "Fotos a entrar", trava: true };
  const travam = faltas.filter((f) => f.trava);
  if (travam.length === 1 && travam[0].id === "visto") return { texto: "Ver o PDF", trava: true };
  if (travam.length === 1) return { texto: "Falta 1", trava: true };
  if (travam.length > 1) return { texto: `Faltam ${travam.length}`, trava: true };
  return { texto: `${idioma.toUpperCase()} · pronto`, trava: false };
}

/**
 * A pastilha do meio: diz o estado do envio e abre a folha. Vermelha enquanto
 * alguma coisa trava, neutra quando está pronto — e é então a língua que diz,
 * que é a última coisa que se pode querer confirmar antes de enviar.
 */
export function PastilhaDoEnvio({
  faltas,
  fotosPorConfirmar,
  idioma,
  onAbrir,
}: {
  faltas: readonly Impedimento[];
  fotosPorConfirmar: number;
  idioma: string;
  onAbrir: () => void;
}) {
  const { texto, trava } = estadoDoEnvio(faltas, fotosPorConfirmar, idioma);
  return (
    <button
      type="button"
      onClick={onAbrir}
      aria-haspopup="dialog"
      aria-label={`Antes de enviar: ${texto}`}
      className={`alvo-toque mr-auto inline-flex min-h-9 items-center gap-1 rounded-full border px-3 text-xs font-medium ${ESTADO} ${PRESSAO} ${
        trava
          ? "border-[var(--bo-perigo)]/30 bg-[var(--bo-perigo)]/[0.06] text-[var(--bo-perigo)]"
          : "border-[var(--bo-hairline-strong)] text-[var(--bo-text)]"
      }`}
    >
      {texto}
      <span aria-hidden="true">›</span>
    </button>
  );
}
