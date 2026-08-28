import "server-only";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FIM EM BRANCO DE UM CORPO DE EMAIL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, com a fotografia do email no iPhone: «estava a falar deste
 * anexo pdf. e muitas vezes ele esta super la para baixo no email».
 *
 * ── O QUE ISTO É, E O QUE NÃO É ──────────────────────────────────────────
 *
 * O clipe do anexo é desenhado pelo GMAIL, sempre logo a seguir ao corpo da
 * mensagem. Não é nosso e não se move. MEDIDO num browser, com este email
 * desenhado a 390 px: o nosso HTML acaba a ZERO píxeis do fundo da faixa — não
 * há espaço nosso nenhum depois dela.
 *
 * O que É nosso é o COMPRIMENTO do corpo. Quanto mais comprido, mais abaixo
 * fica o clipe. E há comprimento que não é texto nenhum.
 *
 * ── DE ONDE VEM ──────────────────────────────────────────────────────────
 *
 * O corpo do modelo é escrito num editor visual (`contentEditable`, ver
 * `EmailTemplates.tsx`). Um `contentEditable` escreve um bloco por cada Enter:
 * carregar duas vezes no fim para «dar um ar» deixa lá `<div><br></div>` duas
 * vezes, e essas linhas vão para o email tal e qual. Não se veem a escrever —
 * o cursor está lá — e não se veem a ler: vêem-se como um email mais comprido,
 * com o anexo mais longe. É por isso que «muitas vezes» e não sempre: depende
 * de quantas vezes se carregou em Enter no modelo daquele dia.
 *
 * O corpo escrito à mão no ecrã de envio já não tem este problema — o
 * `paragrafosDeTexto` deita fora os parágrafos vazios. Este módulo é a mesma
 * regra para o lado do markup.
 *
 * ── SÓ O FIM ─────────────────────────────────────────────────────────────
 *
 * Só se arruma o FIM, e é deliberado. Uma linha em branco no MEIO é
 * composição — separa dois parágrafos, e é dela. Uma linha em branco depois da
 * última palavra não separa nada de nada: só empurra para baixo tudo o que vem
 * a seguir, que é a assinatura, a faixa e o anexo.
 */

/**
 * Os pedaços que, no fim de um corpo, não são conteúdo nenhum.
 *
 * Aplicam-se em ciclo até deixarem de casar, e a razão é o encaixe: um
 * `<div><div><br></div></div>` só se resolve depois de a de dentro sair.
 */
const FIM_VAZIO: readonly RegExp[] = [
  /\s+$/,
  /<br\s*\/?>\s*$/i,
  /(?:&nbsp;|&#160;|&#xa0;)\s*$/i,
  /<!--[\s\S]*?-->\s*$/,
  /**
   * Um bloco cujo interior é só espaço, quebras ou espaços duros.
   *
   * `td`, `tr` e `table` NÃO estão na lista, de propósito: uma célula vazia no
   * fim de uma tabela é estrutura, e tirá-la desmancha a moldura em vez de
   * arrumar o fim. O que se tira são blocos de TEXTO.
   */
  /<(p|div|h[1-6]|span|li|ul|ol|section|article|blockquote)\b[^>]*>(?:\s|&nbsp;|&#160;|&#xa0;|<br\s*\/?>)*<\/\1>\s*$/i,
  /**
   * O mesmo bloco vazio, mas ENCAIXADO: seguido só de fechos até ao fim.
   *
   * `<div><div><br></div></div>` — o de dentro não está no fim da cadeia (tem
   * o `</div>` do de fora a seguir), portanto a regra acima passava-lhe ao
   * lado. A antevisão `(?=(?:\s*<\/[a-z0-9]+>)*\s*$)` diz «daqui até ao fim
   * só há fechos», e o que se apaga é SÓ o bloco vazio — os fechos de fora
   * ficam, e é a regra acima que os apanha na volta seguinte, já com o de
   * dentro esvaziado.
   */
  /<(p|div|h[1-6]|span|li|ul|ol|section|article|blockquote)\b[^>]*>(?:\s|&nbsp;|&#160;|&#xa0;|<br\s*\/?>)*<\/\1>(?=(?:\s*<\/[a-z0-9]+>)*\s*$)/i,
];

/**
 * O mesmo corpo, sem as linhas em branco do fim.
 *
 * Não toca em mais nada: o que está antes da última palavra fica exactamente
 * como estava, incluindo as linhas em branco do meio.
 */
export function semFimEmBranco(html: string): string {
  let fora = String(html ?? "");
  for (let voltas = 0; voltas < 200; voltas++) {
    const antes = fora;
    for (const r of FIM_VAZIO) fora = fora.replace(r, "");
    if (fora === antes) return fora;
  }
  return fora;
}
