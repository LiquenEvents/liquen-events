import { GALLERY_WIDTHS, galleryKey } from "./gallery-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUE FICHEIRO É QUE CADA ECRÃ RECEBE — E PORQUE NÃO O MAIOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O problema, medido ────────────────────────────────────────────────────
 * A galeria servia ficheiros de **1280 px** para caixas de **412 CSS px** num
 * telemóvel: 3,11× o tamanho de exibição, em 374 de 374 fotografias. Não era um
 * defeito — era a aritmética correcta a levar ao sítio errado. O ecrã é DPR 3,
 * o `sizes` dizia honestamente "100vw", e o browser fazia a conta certa:
 * 412 × 3 = 1236 px de ecrã, logo o candidato de 1280. Uma travessia completa
 * da galeria descarregava **55 MB**.
 *
 * ── A decisão ─────────────────────────────────────────────────────────────
 * Uma miniatura de grelha não precisa de 3× a densidade. Acima de ~2× o olho
 * deixa de distinguir numa fotografia, e a diferença de bytes é enorme:
 *
 *     1280 px → 132,9 KB       (1,04× os píxeis do ecrã)
 *     1024 px → 101,4 KB       (0,83×)
 *      768 px →  40,7 KB       (0,62× — ou seja, 1,86 de densidade efectiva)
 *
 * Ao telemóvel passa a ir no máximo **768**: −69 % dos bytes, com a fotografia
 * ainda a 1,86 de densidade efectiva. Quem quiser ver a fotografia a sério
 * abre-a — e aí o lightbox serve a resolução inteira, que é onde a nitidez
 * conta e onde o visitante está mesmo a olhar.
 *
 * Na secretária o tecto fica em **1024**, que dá 1,08× os píxeis físicos: aí
 * não há aperto de largura de banda que justifique perder nitidez.
 *
 * ── Porquê `<picture>` com `media`, e não só `sizes` ──────────────────────
 * Isto não se consegue dizer num `sizes`. O `sizes` descreve a LARGURA DA
 * CAIXA; quem multiplica pela densidade é o browser, e não há sintaxe para lhe
 * pedir "no máximo 2×". Mentir na percentagem (pôr 66vw numa caixa de 100vw)
 * resolvia no telemóvel e estragava tudo o resto — a DPR 1 pedia menos píxeis
 * do que a caixa tem, que é a definição de foto suave. Já esteve assim, e a
 * nota que isso deixou no código está a pedir para não se repetir.
 *
 * Com `<source media="…">` cada classe de ecrã recebe a SUA escada, com o SEU
 * tecto, e a conta do browser continua a ser a honesta dentro dela.
 */

/** Larguras que a grelha oferece a um telemóvel (mosaico a 100vw). */
export const ESCADA_TELEMOVEL = GALLERY_WIDTHS.filter((w) => w <= 768);
/** Larguras que a grelha oferece de `sm` para cima (mosaico a 50vw / 33vw). */
export const ESCADA_ECRA_GRANDE = GALLERY_WIDTHS.filter((w) => w <= 1024);

/** O ponto onde o mosaico deixa de ocupar a largura toda (Tailwind `sm`). */
export const CORTE_TELEMOVEL = "(max-width: 639px)";

export type FormatoDaGaleria = "avif" | "webp";

/** `/_img/g/<chave>-<largura>.<formato>` — o que o pré-gerador escreve. */
export function ficheiroDaGaleria(src: string, largura: number, formato: FormatoDaGaleria): string {
  return `/_img/g/${galleryKey(src)}-${largura}.${formato}`;
}

/**
 * Um `srcset` com descritores `w`, para uma escada e um formato.
 *
 * `sufixo` é o cache-buster das re-tentativas (`?r=2`). Vai em TODOS os
 * candidatos: se fosse só no `src`, a re-tentativa podia apanhar em cache
 * exactamente a resposta falhada que o srcset ainda referencia.
 */
export function srcsetDaGaleria(
  src: string,
  escada: readonly number[],
  formato: FormatoDaGaleria,
  sufixo = "",
): string {
  return escada.map((w) => `${ficheiroDaGaleria(src, w, formato)}${sufixo} ${w}w`).join(", ");
}

/**
 * A LARGURA CERTA para uma caixa, dentro de uma escada — a regra "nunca acima
 * de 2× o tamanho de exibição", escrita uma vez só.
 *
 * Um degrau acima do que a caixa precisa é inevitável (a escada é discreta e o
 * browser arredonda para cima); o que não pode acontecer é servir dois ou três
 * degraus acima, que era o caso. Esta função é a definição que o teste de
 * regressão usa para julgar uma medição real.
 */
export function larguraEsperada(larguraCss: number, escada: readonly number[]): number {
  const querido = larguraCss * 2;
  return escada.find((w) => w >= querido) ?? escada[escada.length - 1];
}
