"use client";

import { useEffect } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM LINK CARREGADO COM O RATO NÃO FICA COM O FOCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10, com a captura do menu e um quadrado à volta de
 * «GALERIA»: «eu não quero estes quadrados à volta do menu, tira isto».
 *
 * O quadrado é o anel de foco do teclado (`:focus-visible`, globals.css). Não
 * aparecia ao clicar — MEDIDO a 1440×900: depois do clique, o link fica com o
 * foco e sem anel. Aparecia à PRIMEIRA TECLA a seguir: uma seta ou o espaço
 * para descer a página, e o browser passa a tratar o foco como de teclado e
 * acende o anel no link onde ele ficou. O menu fica em cima de todas as
 * páginas, portanto o quadrado ficava lá a página inteira.
 *
 * O remédio NÃO é tirar o anel: sem ele, quem navega por teclado deixa de
 * saber onde está (Parte 18 do `docs/DESIGN-SYSTEM.md`). É não deixar o foco no
 * link depois de um clique de RATO. Um clique de rato tem `detail ≥ 1` (o
 * número de cliques); o Enter do teclado num link dispara um `click` com
 * `detail = 0` — esse fica como está, com o anel, que é o que o teclado pede.
 *
 * Vive no `CromadoDoSitio`, num sítio só, pela razão da `LinhaDeCarregamento`:
 * os `<Link>` do sítio estão espalhados por vinte e tal ficheiros.
 */
export function FocoNaoFicaNoLink() {
  useEffect(() => {
    const aoClicar = (e: MouseEvent) => {
      if (e.detail === 0) return;
      const link = (e.target as Element | null)?.closest?.("a");
      if (link instanceof HTMLElement && document.activeElement === link) link.blur();
    };
    document.addEventListener("click", aoClicar, true);
    return () => document.removeEventListener("click", aoClicar, true);
  }, []);
  return null;
}
