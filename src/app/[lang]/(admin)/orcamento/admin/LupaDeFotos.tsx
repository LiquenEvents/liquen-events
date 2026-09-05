"use client";

import { useEffect } from "react";
import { useFocusTrap } from "./useFocusTrap";
import { useTrincoDeScroll } from "./useTrincoDeScroll";
import { ESTADO, PRESSAO } from "./ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VER A FOTOGRAFIA EM GRANDE, SEM SAIR DA PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Numa grelha pequena está-se a escolher às cegas.»
 *
 * As células da grelha do estúdio têm 174 px de largura (medido). É o
 * suficiente para saber que ali está um arranjo de flores, e não chega para
 * decidir entre dois arranjos parecidos — que é a decisão que se está mesmo a
 * tomar quando se monta uma página de inspiração.
 *
 * ── AS SETAS SÃO METADE DA UTILIDADE ──────────────────────────────────────
 * Abrir uma foto e ter de fechar para abrir a seguinte transforma comparar
 * duas fotos em quatro gestos. Com as setas — do teclado e no ecrã —, comparar
 * é carregar uma vez. Percorre as fotos DESTE board, pela ordem em que estão.
 *
 * O `alt` diz a posição e o nome do board, e não «fotografia»: quem usa leitor
 * de ecrã precisa de saber onde está na sequência, e é a única coisa que
 * sabemos com verdade sobre a imagem.
 */
export default function LupaDeFotos({
  aberta,
  urls,
  indice,
  titulo,
  onFechar,
  onMudar,
}: {
  aberta: boolean;
  /** As fotos do board, pela ordem do ecrã. Podem faltar URLs (fotos a entrar). */
  urls: (string | undefined)[];
  indice: number;
  /** O nome do mood board, para se saber o que se está a ver. */
  titulo: string;
  onFechar: () => void;
  onMudar: (novoIndice: number) => void;
}) {
  // Declarado ANTES da armadilha de foco de propósito: os efeitos correm por
  // ordem de declaração, portanto a página já está trancada quando o foco entra
  // na caixa. Não custa nada e tira uma ordem de que ninguém quer depender.
  useTrincoDeScroll(aberta);
  const caixa = useFocusTrap<HTMLDivElement>(aberta);
  const total = urls.length;

  useEffect(() => {
    if (!aberta) return;
    function aoTeclar(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onFechar();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        onMudar((indice + 1) % total);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        onMudar((indice - 1 + total) % total);
      }
    }
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [aberta, indice, total, onFechar, onMudar]);

  if (!aberta || total === 0) return null;
  const url = urls[indice];

  return (
    <div
      ref={caixa}
      role="dialog"
      aria-modal="true"
      aria-label={`Fotografia ${indice + 1} de ${total} — ${titulo || "mood board"}`}
      // ── A LUPA ENTRA, EM VEZ DE APARECER ────────────────────────────
      // Isto abria num fotograma: a página estava lá e, no seguinte, um véu
      // preto por cima dela inteira. Era o corte mais brusco do back office —
      // e o pior sítio possível para um, porque é a superfície que cobre o
      // ecrã TODO.
      //
      // A `.bo-entrada` do `globals.css` é a entrada da casa: 240 ms, quatro
      // píxeis e `cubic-bezier(0, 0, 0.2, 1)`, só `opacity` e `transform`, e
      // calada dentro de `prefers-reduced-motion`. Não atrasa nada — a lupa
      // está no sítio e responde ao teclado desde o primeiro fotograma.
      //
      // E vai SÓ a `.bo-entrada`, sem a `.bo-entrada-fundo`: aqui o véu e a
      // caixa são o mesmo elemento (a tinta escura não está por trás de nada,
      // É o visualizador), que é exactamente a razão por que o
      // `entrada-dos-fundos.test.ts` já isenta este ficheiro da regra dos
      // véus. A variante do fundo tiraria a deslocação a tudo.
      className="bo-entrada fixed inset-0 z-[80] flex flex-col bg-black/85 backdrop-blur-sm"
      // Largar o rato no fundo fecha. O clique na própria fotografia não:
      // ampliar para comparar e fechar por engano ao apontar é o género de
      // coisa que faz voltar a abrir tudo outra vez.
      onClick={(e) => {
        if (e.target === e.currentTarget) onFechar();
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white/85">
        <p className="min-w-0 truncate text-xs tracking-[0.12em] uppercase">
          {titulo || "Mood board"} · {indice + 1} de {total}
        </p>
        <button
          type="button"
          onClick={onFechar}
          aria-label="Fechar"
          className={`alvo-toque flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg leading-none text-white hover:bg-white/20 ${ESTADO} ${PRESSAO}`}
        >
          ×
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-4">
        {total > 1 && (
          <button
            type="button"
            onClick={() => onMudar((indice - 1 + total) % total)}
            aria-label="Fotografia anterior"
            className={`alvo-toque absolute left-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true">‹</span>
          </button>
        )}
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Fotografia ${indice + 1} de ${total} do mood board ${titulo || "sem título"}`}
            className="max-h-full max-w-full object-contain"
          />
        ) : (
          <p className="text-sm text-white/70">Esta fotografia ainda está a entrar na proposta.</p>
        )}
        {total > 1 && (
          <button
            type="button"
            onClick={() => onMudar((indice + 1) % total)}
            aria-label="Fotografia seguinte"
            className={`alvo-toque absolute right-2 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/25 ${ESTADO} ${PRESSAO}`}
          >
            <span aria-hidden="true">›</span>
          </button>
        )}
      </div>
    </div>
  );
}
