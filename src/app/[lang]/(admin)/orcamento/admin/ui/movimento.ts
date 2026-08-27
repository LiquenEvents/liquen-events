import { DUR_MICRO_MS, DUR_ELEMENTO_MS } from "@/lib/motion/tokens";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O MOVIMENTO DOS PRIMITIVOS — duas velocidades de interacção, e só duas
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Antes disto, o censo dos quinze primitivos desta pasta dava
 * **onze** transições escritas em oito ficheiros — e uma só duração real:
 * **150 ms** em todas as onze. Não porque alguém tenha escolhido 150, mas
 * porque ninguém escolheu nada: 150 ms é o `--default-transition-duration` do
 * Tailwind, o número que sai quando uma classe `transition-*` não traz duração
 * nenhuma. Oito ficheiros a concordar por omissão parecem um sistema e não
 * são: no dia em que um deles pedisse uma duração, ficavam dois.
 *
 * E duas curvas? Também não: UMA, e também por omissão — a
 * `--default-transition-timing-function` do `@theme`. Nenhum primitivo pedia
 * curva nenhuma. Deslocações animadas: **zero** — nenhum `translate` em
 * transição em toda a pasta, portanto a regra dos «4 px / 8 px / 32 px» da
 * análise não tem aqui nada a que se aplicar. Fica dito, porque uma regra sem
 * sítio onde valer é uma regra que não se cumpre nem se desobedece.
 *
 * As três avarias que o censo encontrou, todas silenciosas:
 *
 *  1. **O toque não tinha transição.** O `Button` tem `active:scale-[0.98]`
 *     desde sempre — a análise que diz «botões sem estado activo» está errada
 *     nesse ponto, e a prova está no ficheiro. O que ele NÃO tinha era a
 *     transição a cobri-lo: no Tailwind v4 a classe `scale-[0.98]` emite a
 *     propriedade autónoma `scale: 0.98`, e a lista do `Button` dizia
 *     `transition-[…,transform]`. `transform` não cobre `scale`. Resultado
 *     medido no CSS compilado: o carregar era um corte seco de 0 ms, e os
 *     150 ms ao lado não lhe tocavam. É exactamente o «corte seco de uma
 *     mudança sem transição» que os 20 ms existem para tirar — só que o
 *     diagnóstico certo não é «falta o estado», é «falta a lista».
 *
 *  2. **Seis das onze transições corriam sem `motion-safe:`** — em quatro
 *     ficheiros (`Ajuda`, `DesistirDaEdicao`, `MenuDeAccoes` ×3,
 *     `TabelaOuCartoes`), contra as cinco que o usavam (`Button`, `EmCurso`,
 *     `Field` ×2, `Segmented`). A somar a isso, dois elementos em que se toca
 *     não tinham transição NENHUMA — o fechar da `FolhaOuDialogo` e o parar do
 *     `EmCurso` —, ou seja hover e foco entravam e saíam a corte seco. O `globals.css` só desliga transições dentro de
 *     `prefers-reduced-motion` em três sítios muito concretos (o `:focus-visible`,
 *     o `scroll-behavior`, o `.link-line::after`) — não há rede global nenhuma,
 *     portanto quem escrevia `transition-colors` à seca estava mesmo a animar
 *     para quem pediu para não animar.
 *
 *  3. **`duration-elemento` não gera regra nenhuma.** O `@theme` do
 *     `globals.css` declara `--duration-micro/elemento/vista`, mas o espaço de
 *     nomes que o Tailwind v4 lê para os utilitários `duration-*` é
 *     `--transition-duration-*`. Compilei os dois para ter a certeza: com
 *     `--transition-duration-alfa` sai `.duration-alfa { … }`; com
 *     `--duration-beta` não sai regra nenhuma.
 *
 *     Compilado o `globals.css` desta casa a sério: as três variáveis chegam
 *     ao `:root` (estão lá, com os valores certos) e as regras `.duration-micro`,
 *     `.duration-elemento` e `.duration-vista` são **zero**. É esse o ponto —
 *     o token não está errado, está no espaço de nomes errado, e por isso é
 *     legível para um humano e invisível para o Tailwind. As treze classes
 *     `duration-elemento` / `-micro` / `-vista` do back office caem todas nos
 *     mesmos 150 ms por omissão. (As outras doze estão fora desta pasta —
 *     ficam relatadas, não tocadas.)
 *
 * ── A ESCALA ────────────────────────────────────────────────────────────────
 *
 * Duas velocidades para INTERACÇÃO, que é o que estes primitivos fazem:
 *
 *   · **toque — 20 ms.** Só o `:active`. É imperceptível como animação e
 *     perfeitamente perceptível como suavidade: tira o corte seco sem pôr
 *     latência nenhuma pelo caminho. É a diferença entre um botão que responde
 *     e um botão que pisca.
 *   · **estado — 120 ms.** Passar o rato, focar, mudar de cor, de contorno, de
 *     sombra. Não é um número novo: é o `--duration-micro` da casa, o degrau
 *     que a ficha de `lib/motion/tokens.ts` descreve como «responde ao dedo:
 *     toque, foco, passar o rato». Substitui os 150 ms que ninguém escolheu.
 *
 * A terceira duração aqui em baixo — `PROGRESSO` — NÃO é um terceiro degrau de
 * interacção. Uma barra a encher não é um estado a mudar: é uma coisa a
 * mover-se, e por isso pede o degrau `elemento` (250 ms) da mesma ficha. Está
 * aqui só porque era uma das classes mortas do ponto 3.
 *
 * ── E AS CURVAS? SÃO DUAS, E JÁ CÁ ESTAVAM ─────────────────────────────────
 *
 * Não se declara nenhuma curva neste ficheiro, de propósito. A casa já tem
 * duas, e não faltava nenhuma:
 *
 *   · `--ease-out: cubic-bezier(0.16, 1, 0.3, 1)` — a assinatura. É também o
 *     `--default-transition-timing-function` do `@theme`, ou seja: toda a
 *     classe `transition-*` desta casa já sai com ela sem a pedir. Arranca
 *     depressa e assenta devagar — só desacelera, sem `bounce` nem
 *     `overshoot`, que é precisamente o que a análise pede para o que o
 *     SISTEMA apresenta.
 *   · `--ease-in: cubic-bezier(0.4, 0, 1, 1)` — para o que sai.
 *
 * A análise pede uma TERCEIRA, simétrica (`cubic-bezier(0.4, 0, 0.2, 1)`), para
 * o que o UTILIZADOR provoca. Esta casa recusou-a por escrito: o comentário do
 * `@theme` conta que ~300 transições estavam nessa curva por omissão e foram
 * convergidas de propósito para a assinatura, e o `tokens.coerencia.test.ts`
 * tem um teste cujo comentário diz, letra por letra, que guarda «contra uma
 * troca distraída por uma curva simétrica (`ease`, `cubic-bezier(0.4,0,0.2,1)`)».
 * Não se desfaz isso a partir daqui.
 *
 * E, para ser franco: aos 20 ms e aos 120 ms a curva é indiscutivelmente
 * invisível — não há olho que distinga duas curvas num sexto de segundo. O que
 * se lê nestas velocidades é a DURAÇÃO. A discussão de curvas é real onde há
 * percurso (entradas, saídas, barras), e aí a casa já tem as duas de que
 * precisa.
 *
 * ── PORQUÊ VALORES ENTRE PARÊNTESES RECTOS E NÃO TOKENS ────────────────────
 *
 * Porque `duration-toque` e `duration-estado` não existem, e declará-los é no
 * `globals.css`, que não é meu. Até lá os números vivem AQUI, uma vez cada um,
 * escritos por extenso — e o `movimento.test.ts` prende-os à ficha da casa, de
 * modo que afinar o `--duration-micro` do lado de lá põe este lado vermelho em
 * vez de os deixar a discordar em silêncio.
 */

/** O toque, em milissegundos. Verbatim da análise: 0,02 s nos estados activos. */
export const TOQUE_MS = 20;

/**
 * O estado, em milissegundos. Não é um valor local: é o degrau `micro` da casa,
 * importado para que não possa divergir dele sem um teste dar por isso.
 */
export const ESTADO_MS = DUR_MICRO_MS;

/** A barra a encher. O degrau `elemento` da casa — uma coisa a mover-se. */
export const PROGRESSO_MS = DUR_ELEMENTO_MS;

/**
 * A transição de ESTADO de qualquer primitivo em que se toque.
 *
 * A lista de propriedades é explícita e fechada, e nenhuma delas força
 * *layout* — a regra da casa para 60 fps num telemóvel em 4G:
 *
 *   · `scale` — o carregar. **Tem de estar aqui**: no Tailwind v4 a classe
 *     `scale-*` emite a propriedade autónoma `scale`, não `transform`, e era
 *     esta a linha que faltava para o toque do `Button` ter transição.
 *   · `opacity` — o mostrar/esconder do `MenuDeAccoes`. Composta na GPU.
 *   · `background-color`, `border-color`, `color`, `box-shadow` — repintam,
 *     não remedem. Um botão pequeno a 120 ms não chega perto do orçamento de
 *     quadro.
 *
 * `transform` NÃO está na lista, e é de propósito: quem o usa nesta pasta é o
 * arrasto da `FolhaOuDialogo`, que segue o dedo e não pode ter transição
 * nenhuma por baixo.
 */
export const ESTADO =
  "motion-safe:transition-[background-color,border-color,color,box-shadow,opacity,scale] " +
  "motion-safe:duration-[120ms]";

/**
 * O TOQUE — o carregar, a 20 ms.
 *
 * Duas classes e uma assimetria deliberada. O `active:duration-[20ms]` só vale
 * enquanto o dedo está em baixo (o selector `:active` tem mais especificidade
 * do que a duração de base, portanto ganha sem depender de ordem nenhuma);
 * ao largar, o elemento deixa de estar `:active` e volta aos 120 ms do
 * `ESTADO`. Isto é o que se quer, e não um descuido: carrega instantâneo,
 * assenta com peso.
 *
 * O gesto é `scale-[0.98]` — 2%, e não um salto. É o que o `Button` já fazia; o
 * que muda é passar a ser o MESMO gesto em todos os primitivos em que se toca,
 * em vez de um só o ter. Um por cento de escala é composto na GPU e não mexe
 * com quem está à volta.
 *
 * Onde a variante já tem uma tinta no vocabulário (os fantasmas, os itens de
 * menu), cada primitivo junta-lhe o seu `active:bg-…` um degrau mais fundo —
 * mesma cor, opacidade seguinte. Estes 20 ms cobrem-na, porque a duração do
 * `:active` vale para todas as propriedades da lista.
 */
export const PRESSAO = "motion-safe:active:scale-[0.98] motion-safe:active:duration-[20ms]";

/**
 * Uma barra de progresso a avançar. Substitui o `duration-elemento` morto —
 * mesmo tempo pretendido (250 ms), só que agora o Tailwind gera mesmo a regra.
 */
export const PROGRESSO =
  "motion-safe:transition-transform motion-safe:duration-[250ms] motion-safe:ease-out";

/**
 * A MARCA QUE ANDA — o indicador deslizante do `Segmented`.
 *
 * Medido na Pixelmatters: numa barra de filtros o segmento activo não muda de
 * cor de repente; há um indicador que ANDA de um segmento para o outro. E o
 * detalhe que faz a diferença é a assimetria — lá o texto acende aos 200 ms e a
 * pílula só chega aos 300. Separar o sinal («ouvi-te») do movimento («e agora
 * mostro-te») é o que faz o clique parecer imediato e o movimento parecer caro,
 * em vez de obrigar a escolher entre os dois. Com os dois tempos iguais, o
 * clique parece lento.
 *
 * Aqui a assimetria é a mesma e a distância é maior: o texto entra nos 120 ms
 * do `ESTADO` (que já tinha) e a marca nos 250 ms do degrau `elemento` — «uma
 * coisa a mover-se», que é exactamente o que ela é. Não se importam os números
 * da análise; importa-se a ordem, com os degraus da casa.
 *
 * `translate` e não `transform`: no Tailwind v4 a classe emite a propriedade
 * autónoma, e é essa que o componente escreve no `style`. `width` acompanha
 * porque «Todas · 2» e «Aceites» não medem o mesmo — e não custa quadro nenhum,
 * porque a marca é `absolute` e não faz remedir ninguém à volta.
 */
export const MARCA_MS = DUR_ELEMENTO_MS;

export const MARCA = "motion-safe:transition-[translate,width] motion-safe:duration-[250ms]";
