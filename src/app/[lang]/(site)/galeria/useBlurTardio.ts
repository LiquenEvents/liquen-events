"use client";

import { useEffect, useRef } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BLUR QUE CHEGA DEPOIS — E QUE NÃO CUSTA UM RENDER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O problema ────────────────────────────────────────────────────────────
 * Só as primeiras 48 de 427 fotografias levavam placeholder desfocado. Da
 * quarta dobra em diante ficavam 379 mosaicos com cor lisa — que é melhor do
 * que um buraco preto, mas não é a fotografia a desenhar-se.
 *
 * Mandar as 427 no HTML custava ~63 KB e atrasava a PRIMEIRA fotografia em
 * ~800 ms num telemóvel a 1,6 Mbit/s. Por isso o resto vem num ficheiro à
 * parte (`/_img/blur-galeria.json`, escrito pelo pré-gerador), buscado
 * **depois** da primeira pintura e em tempo ocioso.
 *
 * ── Porque é que isto não passa por estado do React ────────────────────────
 * O caminho óbvio — guardar o mapa em `useState` e voltar a desenhar os
 * mosaicos com o `blurDataURL` novo — obrigava a reconciliar centenas de
 * mosaicos de uma vez, no meio do scroll. Isso é exactamente o custo que o
 * Pilar 4 existe para eliminar: medido antes destas mudanças, a secretária
 * perdia 1362 de 2200 frames a percorrer a galeria.
 *
 * Um placeholder é pintura pura: não muda o que a página DIZ, só o que ela
 * MOSTRA enquanto espera. Por isso é aplicado directamente no elemento, com
 * `style.backgroundImage`, sem passar pelo React. O React continua dono da
 * árvore; isto só pinta por cima do espaço que ele já reservou.
 *
 * ── E quando a fotografia chega ────────────────────────────────────────────
 * O `<img>` fica opaco por cima e o blur deixa de se ver. O `GalleryImage`
 * apaga o dele no `load`; este é apagado pelo mesmo `load`, por um ouvinte
 * registado aqui — senão ficava um fundo desfocado debaixo de cada fotografia
 * para o resto da visita, a gastar memória de composição por nada.
 */

/** Onde o pré-gerador escreve o mapa. */
const CAMINHO = "/_img/blur-galeria.json";

type Mapa = Record<string, string>;

export interface BlurTardio {
  /**
   * Regista o `<img>` de um mosaico. Aplica o blur se já houver mapa; se não,
   * guarda-o para quando o mapa chegar. Devolve a limpeza.
   */
  registar: (el: HTMLImageElement | null, src: string) => void;
}

/** Espera pelo tempo ocioso, com um limite — nem todos os browsers o têm. */
function quandoOcioso(fn: () => void): () => void {
  const w = window as typeof window & {
    requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    cancelIdleCallback?: (id: number) => void;
  };
  if (typeof w.requestIdleCallback === "function") {
    const id = w.requestIdleCallback(fn, { timeout: 3000 });
    return () => w.cancelIdleCallback?.(id);
  }
  const id = setTimeout(fn, 1200);
  return () => clearTimeout(id);
}

export function useBlurTardio(activo: boolean): BlurTardio {
  const mapaRef = useRef<Mapa | null>(null);
  /** Mosaicos montados que ainda estão à espera de mapa. */
  const pendentesRef = useRef(new Map<HTMLImageElement, string>());

  /**
   * ONDE é que a pintura entra. No `<picture>` que envolve o `<img>`, não no
   * `<img>` — pela mesma razão que levou o placeholder do HTML a mudar de sítio
   * (ver `.g-moldura` em globals.css): quando há desfocado, o `<img>` leva
   * `g-foto`, que é `opacity: 0`, e um fundo pintado nele fica apagado com ele.
   *
   * Aqui não chegava a dar-se por isso, porque estas fotos (da 49.ª em diante)
   * NÃO vêm com placeholder no HTML e portanto não levam `g-foto` — a pintura
   * via-se por acaso. Deixar as duas no mesmo elemento é o que faz com que a
   * próxima pessoa que mexa numa não parta a outra sem saber.
   */
  const molduraDe = (el: HTMLImageElement): HTMLElement =>
    el.parentElement?.tagName === "PICTURE" ? el.parentElement : el;

  const aplicar = (el: HTMLImageElement, src: string, mapa: Mapa) => {
    const blur = mapa[src];
    const alvo = molduraDe(el);
    // Já tem placeholder (veio no HTML), já carregou, ou não há blur para esta
    // foto: em qualquer dos casos não há nada a fazer.
    if (!blur || alvo.style.backgroundImage || el.complete) return;
    alvo.style.backgroundImage = `url(${blur})`;
    // `background-size`/`position` já vêm da `.g-moldura` quando o alvo é o
    // `<picture>`; ficam aqui para o caso de o alvo ser o próprio `<img>`.
    alvo.style.backgroundSize = "cover";
    alvo.style.backgroundPosition = "center";
    el.addEventListener(
      "load",
      () => {
        alvo.style.backgroundImage = "";
      },
      { once: true },
    );
  };

  useEffect(() => {
    if (!activo || typeof window === "undefined") return;
    let vivo = true;
    const cancelar = quandoOcioso(() => {
      fetch(CAMINHO, { priority: "low" } as RequestInit)
        .then((r) => (r.ok ? r.json() : null))
        .then((mapa: Mapa | null) => {
          if (!vivo || !mapa) return;
          mapaRef.current = mapa;
          for (const [el, src] of pendentesRef.current) aplicar(el, src, mapa);
          pendentesRef.current.clear();
        })
        .catch(() => {
          // Sem o ficheiro, a galeria fica como estava: blur na primeira
          // janela, cor média no resto. Não é um erro que valha dizer a
          // ninguém.
        });
    });
    return () => {
      vivo = false;
      cancelar();
    };
  }, [activo]);

  const registar = (el: HTMLImageElement | null, src: string) => {
    if (!el) return;
    const mapa = mapaRef.current;
    if (mapa) aplicar(el, src, mapa);
    else pendentesRef.current.set(el, src);
  };

  return { registar };
}
