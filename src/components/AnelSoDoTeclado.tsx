"use client";

import { useEffect } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM USA O RATO NÃO VÊ O ANEL DO TECLADO
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
 * O remédio NÃO é tirar o anel a toda a gente: sem ele, quem navega por
 * teclado deixa de saber onde está (Parte 18 do `docs/DESIGN-SYSTEM.md`). É
 * tirá-lo a quem está a usar o RATO (ou o dedo).
 *
 * ── E NÃO SÓ OS LINKS ────────────────────────────────────────────────────
 *
 * A seguir, também dela: «se há anéis desses pelo site, retira». Medido nas
 * páginas públicas a 1440 e a 390, o anel acendia também em sítios que NINGUÉM
 * carregou: abrir uma fotografia da galeria põe o foco no visor por programa,
 * e a primeira seta para a seguinte acendia um quadrado à volta do visor; o
 * mesmo no painel do menu do telemóvel e no botão a que o foco volta quando
 * se fecha. Marcar só o elemento clicado não chegava.
 *
 * Por isso a regra é o MODO, para o sítio inteiro:
 *
 *  · tocar ou clicar (`pointerdown`) passa ao modo do rato — e tudo o que
 *    receber o foco a seguir, carregado ou posto por programa, leva a marca
 *    `data-foco-do-rato`, que o globals.css lê para não desenhar o anel;
 *  · o Tab passa ao modo do teclado — e a partir daí nada se marca, e o anel
 *    aparece como sempre. As setas, o espaço e o Escape não mudam o modo:
 *    são as teclas que ela usa a ver fotografias e a descer a página.
 *
 * O foco FICA onde estava — tirá-lo (`blur()`) era mais simples, mas dentro da
 * fotografia aberta as setas deixavam de chegar ao visor. E a marca sai quando
 * o foco sai.
 *
 * Vive no `CromadoDoSitio`, num sítio só, pela razão da `LinhaDeCarregamento`:
 * os `<Link>` e os botões do sítio estão espalhados por dezenas de ficheiros.
 */
/** O nome da marca; o globals.css lê-a. */
export const MARCA = "data-foco-do-rato";

/**
 * O modo vive FORA do componente, no módulo. Trocar de língua (PT ⇄ EN) monta
 * o sítio outra vez, e com ele este componente — e o botão da língua recebe o
 * foco de volta. Com o modo dentro do efeito, a montagem nova começava a zero
 * (modo do teclado) e o anel acendia-se à volta de «EN». MEDIDO a 1440.
 */
let doRato = false;

export function AnelSoDoTeclado() {
  useEffect(() => {
    const aoTocar = () => {
      doRato = true;
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Tab") doRato = false;
    };
    const aoEntrar = (e: FocusEvent) => {
      if (doRato && e.target instanceof HTMLElement) e.target.setAttribute(MARCA, "");
    };
    const aoSair = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement) e.target.removeAttribute(MARCA);
    };
    document.addEventListener("pointerdown", aoTocar, true);
    document.addEventListener("keydown", aoTeclar, true);
    document.addEventListener("focusin", aoEntrar, true);
    document.addEventListener("focusout", aoSair, true);
    return () => {
      document.removeEventListener("pointerdown", aoTocar, true);
      document.removeEventListener("keydown", aoTeclar, true);
      document.removeEventListener("focusin", aoEntrar, true);
      document.removeEventListener("focusout", aoSair, true);
    };
  }, []);
  return null;
}
