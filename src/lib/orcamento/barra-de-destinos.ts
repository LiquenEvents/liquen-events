/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QUANDO É QUE A BARRA DE DESTINOS SE AFASTA — E QUANDO É QUE NÃO PODE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Uma colaboradora dela disse que a barra «nem sempre aparece» e que «às vezes
 * não está em lado nenhum». Não era impressão: a barra é hoje a ÚNICA navegação
 * do back office — «a barra substitui o menu», e a coluna da esquerda passou a
 * gaveta —, e a regra que a escondia não sabia disso.
 *
 * ── A REGRA ANTIGA, E PORQUE É QUE ELA ESTAVA ERRADA ──────────────────────
 *
 * Era uma condição só: se houvesse um pedido aberto, a barra saía do ecrã. Fazia
 * sentido enquanto o detalhe de um pedido fosse SEMPRE uma folha modal — uma
 * superfície que toma conta do ecrã e por baixo da qual não há para onde ir.
 *
 * Só que abaixo de 1280 px o detalhe é isso, e a partir de 1280 NÃO é: é uma
 * coluna ao lado da lista, com a lista toda à vista e utilizável. O ecrã não
 * ficou modal — ficou com duas colunas. E a barra desaparecia na mesma.
 *
 * O resultado é exactamente o que ela descreveu: no portátil, abrir um pedido
 * apagava a navegação inteira. Sem coluna à esquerda e sem barra em baixo, não
 * havia UM caminho para outra secção — restava fechar o detalhe e esperar que
 * ela voltasse. Quem não soubesse disso concluía, com razão, que o menu tinha
 * desaparecido.
 *
 * ── O TECLADO DO TELEMÓVEL, QUE É A OUTRA METADE ──────────────────────────
 *
 * E há um segundo sítio onde uma barra colada ao fundo se perde, este no
 * telemóvel: quando o teclado do sistema sobe.
 *
 * Os dois motores fazem-no de maneiras diferentes e ambas más para nós:
 *
 *   · o Android encolhe a janela de LAYOUT, portanto um `bottom: 0` passa a ser
 *     o topo do teclado — a barra sobe e pousa em cima do campo que se está a
 *     escrever, que é o pior sítio onde ela pode estar;
 *   · o iOS não encolhe nada: a janela de layout fica igual e o teclado tapa-a
 *     por cima. A barra continua onde estava, só que escondida por trás do
 *     teclado — e reaparece sozinha quando ele desce.
 *
 * Em qualquer dos dois, uma barra de NAVEGAÇÃO não serve para nada enquanto se
 * escreve: ninguém muda de secção a meio de uma frase. O que ela faz é estorvar
 * (Android) ou fingir que está lá (iOS). Portanto afasta-se, e volta no instante
 * em que o teclado desce.
 *
 * O sinal é a diferença entre a janela de layout (`innerHeight`) e a janela
 * VISUAL (`visualViewport.height`). Ambos os motores a mexem quando o teclado
 * sobe, mesmo os que não mexem no layout.
 */

/**
 * Quanto é que a janela visual tem de encolher para se poder dizer «isto é um
 * teclado» e não outra coisa.
 *
 * O que mais mexe neste número sem ser o teclado é a barra de endereço do
 * telemóvel a recolher-se ao rolar: no Safari do iPhone são ~60 px, no Chrome
 * do Android ~56. Um teclado é outra ordem de grandeza — o do iPhone anda pelos
 * 260–340 px, o do Android pelos 240–300, e com a barra de sugestões ainda mais.
 *
 * 160 px fica no meio do vazio entre as duas famílias: o dobro da maior barra de
 * endereço e bem abaixo do menor teclado. Não é um número escolhido a gosto — é
 * o ponto onde a distância para o engano de cada lado é maior.
 */
export const ENGOLIDO_PELO_TECLADO_PX = 160;

/**
 * O teclado do sistema está a ocupar o fundo do ecrã?
 *
 * `alturaDaJanela` é a de layout (`window.innerHeight`) e `alturaVisivel` a
 * visual (`visualViewport.height`).
 *
 * Devolve `false` quando não há com que decidir — número que não é número, ou
 * uma janela visual MAIOR do que a de layout (acontece a meio de um gesto de
 * zoom). Na dúvida, a barra fica: o defeito que estamos a fechar é ela faltar,
 * e um palpite errado para o lado de a esconder repetia-o.
 */
export function tecladoAberto(alturaDaJanela: number, alturaVisivel: number): boolean {
  if (!Number.isFinite(alturaDaJanela) || !Number.isFinite(alturaVisivel)) return false;
  if (alturaDaJanela <= 0 || alturaVisivel <= 0) return false;
  return alturaDaJanela - alturaVisivel >= ENGOLIDO_PELO_TECLADO_PX;
}

/** O que o ecrã tem, no momento, que possa mandar a barra afastar-se. */
export type EstadoDoEcra = {
  /**
   * Há um detalhe aberto E ele é uma folha MODAL — não a coluna ao lado.
   * Repara no «e»: é o `&&` que faltava, e é ele que fecha o defeito.
   */
  detalheSobreposto: boolean;
  /** O teclado do sistema está a ocupar o fundo. */
  tecladoAberto: boolean;
};

/**
 * A regra inteira, num sítio só, para se poder dizer em voz alta:
 *
 *   **a barra está sempre, excepto quando alguma coisa modal tomou conta do
 *   ecrã ou o teclado tomou conta do fundo dele.**
 *
 * Tudo o resto — rolar, escrever num campo que não levanta teclado, abrir a
 * gaveta, ter uma coluna de detalhe ao lado — deixa-a onde está. Uma barra de
 * navegação que se esconde por outros motivos é uma barra em que não se confia,
 * e deixa de se procurar.
 *
 * Os diálogos a sério (a lupa das fotografias, a paleta de comandos, os avisos
 * destrutivos) não estão aqui de propósito: desenham-se a `z-50` ou acima e
 * TAPAM a barra por cima, que é o que uma superfície modal deve fazer. Mandá-la
 * também sair seria pedir duas vezes a mesma coisa, e em sítios que discordam.
 */
export function barraDeveSumir(estado: EstadoDoEcra): boolean {
  return estado.detalheSobreposto || estado.tecladoAberto;
}
