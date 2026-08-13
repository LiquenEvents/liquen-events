import logoDims from "./logo-dims.json";

/**
 * Optical sizing for client logos. Logos vary wildly in shape (thin wordmarks
 * vs square marks), so a single height makes some dominate. We size each logo
 * by AREA — every logo occupies a similar visual area — within a clamped
 * height range, which is the balanced "logo wall" approach.
 */
const DIMS = logoDims as Record<string, number[]>;

export function logoDimsFor(src: string): number[] {
  return DIMS[src] ?? [400, 120];
}

export function logoHeight(src: string, targetArea = 1600, min = 26, max = 46): number {
  const d = DIMS[src];
  if (!d || !d[1]) return Math.round(Math.sqrt(targetArea));
  const ratio = d[0] / d[1];
  return Math.round(Math.max(min, Math.min(max, Math.sqrt(targetArea / ratio))));
}

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * O `sizes` DE CADA LOGÓTIPO, CALCULADO LOGÓTIPO A LOGÓTIPO
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * PORQUÊ. O `sizes` é a ÚNICA coisa que decide qual das variantes pré-geradas
 * (64/128/256/384/512, ver scripts/pregen-logos.mjs) o browser vai buscar. Até
 * aqui os dois componentes declaravam UMA largura para TODOS os logótipos — a
 * do mais largo de todos: 170px na fita, 157px na parede. Só que a largura a
 * que um logótipo é desenhado NÃO é a mesma para todos: como a altura é
 * calculada por ÁREA (`logoHeight`), um logótipo alto e estreito fica com
 * poucos px de largura e um wordmark fino fica com muitos. Medido no build de
 * produção, a 1440px e DPR 1:
 *
 *   convento-espinheiro  desenhado a 28,4px na fita e 30,7px na parede
 *   pact                 desenhado a 34,3px na fita e 37,0px na parede
 *   aernnova             desenhado a 170px  na fita e 128,7px na parede
 *
 * Os três recebiam o mesmo ficheiro de 256px de largura, porque os três
 * declaravam a mesma largura. Para o convento isso são 27,8 KB para pintar 28
 * px — o browser não tem culpa nenhuma, foi o que lhe dissemos.
 *
 * (E NÃO era artefacto de `transform`: medido, o `getBoundingClientRect()` bate
 * certo com o `offsetWidth` e o `transform` computado é `none` em repouso. Os
 * 28px são mesmo 28px. O que os explica é o `max-h-[34px]` da fita a cortar a
 * altura calculada, e o `max-w-[68%]` da parede a encolher a largura.)
 *
 * O QUE ISTO DEVOLVE. A largura máxima, em px de CSS, a que ESTE logótipo pode
 * ser desenhado em QUALQUER sítio do sítio. É um limite SUPERIOR de propósito:
 * mais vale declarar um pouco a mais e servir um degrau acima do que declarar a
 * menos e desfocar tipografia fina. O browser multiplica isto pelo DPR do ecrã
 * sozinho, por isso aqui não se fala de retina nenhuma.
 *
 * UM SÓ NÚMERO PARA OS DOIS COMPONENTES, e é de propósito. A fita e a parede
 * mostram os MESMOS 19 logótipos na mesma página (/clientes), e a fita ainda
 * repete cada um duas vezes para o ciclo do scroll. Se cada componente
 * declarasse a sua largura exacta, os dois pediriam variantes DIFERENTES do
 * mesmo logótipo e a página descarregava duas cópias da mesma marca —
 * desperdício puro, e ainda por cima invisível. Com um número só, os três
 * `<img>` do mesmo cliente resolvem para o MESMO URL: medido, 1 pedido por
 * logótipo (`req=1` no medidor), e o mesmo ficheiro serve depois a página
 * inicial a partir da cache.
 */

/**
 * Os sítios onde um logótipo de cliente é desenhado. Estes números são o CSS
 * dos dois componentes escrito em aritmética — se lá mudarem as classes, têm de
 * mudar aqui (há um teste em logo.test.ts que compara os dois lados).
 */
const CONTEXTOS = [
  {
    // ClientMarquee: altura de `logoHeight(src)` cortada pelo `max-h-[34px]`,
    // largura travada pelo `max-w-[170px]`. Abaixo de sm são 22px/120px — menor
    // em ambos os eixos, logo nunca é este o caso que manda.
    area: 1600,
    min: 26,
    max: 46,
    alturaMax: 34,
    larguraMax: 170,
  },
  {
    // ClientLogoGrid: altura de `logoHeight(src, 3200, 30, 54)` (célula mais
    // alta, sem `max-h`), largura travada pelo `max-w-[68%]` da célula.
    //
    // 194px = 68% da célula MAIS LARGA que a grelha alguma vez tem: 3 colunas a
    // 1023px de viewport, dentro de `max-w-7xl px-6`, cada célula com `px-5` e
    // uma borda — (1023−48)/3 − 40 − 1 ≈ 285px de conteúdo. Nos ecrãs grandes a
    // célula é MENOR (5 colunas dentro de 1280px ⇒ ~189px, medido), por isso
    // 194 cobre toda a escala de viewports com um número só.
    area: 3200,
    min: 30,
    max: 54,
    alturaMax: Infinity,
    larguraMax: 194,
  },
];

/** A largura máxima, em px de CSS, a que um logótipo chega a ser desenhado. */
export function logoCssWidth(src: string): number {
  const d = logoDimsFor(src);
  const ratio = d[0] / d[1];
  let maior = 0;
  for (const c of CONTEXTOS) {
    // Um `max-width` a morder num elemento substituído encolhe também a altura,
    // e vice-versa: por isso o mínimo aplica-se ao produto, não à altura.
    const altura = Math.min(c.alturaMax, logoHeight(src, c.area, c.min, c.max));
    maior = Math.max(maior, Math.min(c.larguraMax, altura * ratio));
  }
  return Math.ceil(maior);
}

/**
 * O valor do atributo `sizes`. Em px e sem `vw` de propósito: o `next/image` só
 * põe no `srcset` as larguras >= `deviceSizes[0] * (menor vw)` quando há `vw`
 * na expressão (getWidths, em next/dist/shared/lib/get-img-props.js), o que
 * apagaria justamente os candidatos pequenos que queremos que ele possa
 * escolher. Com px, o `srcset` traz a escada toda e a escolha é do browser.
 */
export function logoSizes(src: string): string {
  return `${logoCssWidth(src)}px`;
}
