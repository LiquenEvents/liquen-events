/**
 * ── PORQUE É QUE ISTO DEIXOU DE IMPORTAR A FICHA DO SÍTIO ──────────────────
 *
 * Havia aqui um `import { DUR_MICRO_MS, DUR_ELEMENTO_MS } from
 * "@/lib/motion/tokens"`, e era a decisão certa enquanto o back office não
 * tinha escala própria: melhor emprestar a do sítio do que inventar uma
 * terceira.
 *
 * Passou a ter. O `docs/DESIGN-SYSTEM.md` manda no back office — está escrito
 * no `CLAUDE.md` — e traz dez durações com nomes de uso e as molas a que
 * pertencem. Continuar a ler o degrau `micro` do sítio era ter duas escalas a
 * decidir a mesma coisa.
 *
 * E não custa nada ao sítio: MEDIDO, o `DUR_MICRO_MS` e o `DUR_ELEMENTO_MS`
 * tinham UM consumidor em todo o repositório — este ficheiro. O que o sítio
 * usa da ficha partilhada são as curvas (`EASE_OUT`, `EASE_IN`) e as escalas
 * das fotografias, e nada disso se toca.
 *
 * Os números vivem agora onde o Tailwind os lê: `--transition-duration-*` no
 * `@theme` do `tema.css`, com o `molas-da-apple.test.ts` a refazer a física de
 * cada curva a partir das fórmulas da Apple.
 */

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
 * transição em toda a pasta, portanto a escada do percurso da casa — hoje
 * 10 px para um rótulo, 18 px para um aviso ou uma folha, 28 px para uma cena,
 * 32 px para uma página, no `:root` do `globals.css` — não tem aqui nada a que
 * se aplicar. (Eram «4 / 8 / 32» quando isto se escreveu; ficam os números de
 * hoje, para o censo não mandar ninguém procurar uma escada que já não existe.)
 * Fica dito, porque uma regra sem sítio onde valer é uma regra que não se
 * cumpre nem se desobedece.
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
 *     `.duration-elemento` e `.duration-vista` eram **zero**. É esse o ponto —
 *     o token não estava errado, estava no espaço de nomes errado, e por isso
 *     era legível para um humano e invisível para o Tailwind.
 *
 *     ── E ESTA JÁ ESTÁ CORRIGIDA, o que muda como se lê o resto ────────────
 *
 *     Os tokens mudaram-se para o espaço certo: o `tema.css` declara hoje
 *     `--transition-duration-micro: 120ms`, `--transition-duration-elemento:
 *     250ms` e `--transition-duration-vista: 350ms`, e o comentário lá conta a
 *     mesma história com a compilação que a provou. Ou seja: `duration-elemento`
 *     GERA regra e corre mesmo a 250 ms.
 *
 *     Fica escrito aqui porque este parágrafo, tal como estava, já enganou
 *     quem veio a seguir — mandou procurar uma avaria que já não existe e
 *     mandou «corrigir» sítios que estavam certos. Um censo que se lê como
 *     presente depois de resolvido é pior do que não existir. As avarias 1 e 2
 *     continuam vivas fora desta pasta; esta não.
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
 * Não se desfaz isso a partir daqui, e continua a não se desfazer.
 *
 * ── MAS HÁ UMA MOLA, E ISTO TEM DE ESTAR ESCRITO AQUI ─────────────────────
 *
 * Este parágrafo dizia «são duas, e já cá estavam». Passou a ser meia verdade
 * no dia em que a escada do percurso subiu, e uma meia verdade num censo é o
 * que manda quem vem a seguir procurar no sítio errado. O que é verdade hoje:
 *
 *   · para o que TRANSICIONA — tudo o que este ficheiro trata — as curvas
 *     continuam a ser duas, `--ease-out` e `--ease-in`, e não faltava nenhuma;
 *   · para UMA animação de entrada, e só uma — a caixa que o utilizador
 *     convocou (`.bo-entrada-folha` e o diálogo `aria-modal`) —, o
 *     `globals.css` passou a ter um `--bo-mola-chegada`, que é um `linear()`.
 *
 * E a distinção não é um truque de vocabulário. A curva recusada era uma
 * segunda DESACELERAÇÃO a fazer o mesmo trabalho da assinatura, e duas
 * maneiras de fazer a mesma coisa é o defeito que estas rondas todas vieram
 * tirar. A mola faz um trabalho que nenhuma das duas faz e que nenhuma
 * `cubic-bezier` faz sem um ponto de controlo escolhido ao olho fora do
 * intervalo: passar do sítio e assentar. Além disso não é uma curva ESCRITA —
 * é a `MOLA_CHEGADA` do `lib/motion/tokens.ts` amostrada, e mexer na mola
 * reescreve-a inteira, com um teste a ligar as duas pontas.
 *
 * Nada disto chega aqui: nenhum primitivo desta pasta ganha mola, e o
 * `PRESSAO` não é tocado.
 *
 * E, para ser franco: aos 20 ms e aos 120 ms a curva é indiscutivelmente
 * invisível — não há olho que distinga duas curvas num sexto de segundo. O que
 * se lê nestas velocidades é a DURAÇÃO. A discussão de curvas é real onde há
 * percurso (entradas, saídas, barras), e aí a casa tem as duas de sempre mais
 * a mola de uma chegada.
 *
 * ── PORQUÊ VALORES ENTRE PARÊNTESES RECTOS E NÃO TOKENS ────────────────────
 *
 * Porque `duration-toque` e `duration-estado` não existem, e declará-los é no
 * `globals.css`, que não é meu. Até lá os números vivem AQUI, uma vez cada um,
 * escritos por extenso — e o `movimento.test.ts` prende-os à ficha da casa, de
 * modo que afinar o `--duration-micro` do lado de lá põe este lado vermelho em
 * vez de os deixar a discordar em silêncio.
 */

/**
 * A IDA do toque, em milissegundos. O documento é explícito: «a ida é seca; só
 * o regresso é mola». 80 ms com a curva de saída.
 *
 * Eram 20. Vinte é imperceptível como animação — e era essa a intenção escrita
 * aqui: «tira o corte seco sem pôr latência nenhuma». O documento escolhe
 * outra coisa, e a diferença tem nome: aos 20 ms o dedo não sente que a peça
 * cedeu, sente que ela piscou. 80 ms ainda é instantâneo para quem carrega
 * (o limiar de «não houve espera» é 100) e já é matéria a afundar.
 */
export const TOQUE_MS = 80;

/**
 * O ESTADO — passar o rato, focar, mudar de cor, de contorno, de sombra.
 *
 * 150 ms e a mola `interactive` (ζ = 0,86), que é o preset `.interactiveSpring`
 * do SwiftUI: `response .15, damping .86`. Eram 120 ms e a curva de omissão.
 *
 * O censo deste ficheiro argumentou, com razão, que «aos 20 e aos 120 ms a
 * curva é indiscutivelmente invisível». Continua a ser quase invisível aos
 * 150 — e é por isso que a mudança que se SENTE não é esta, é a de baixo.
 * Esta entra por coerência: é o degrau que o documento dá a este trabalho, e
 * ter um número próprio ao lado do dele era manter as duas escalas que este
 * commit veio juntar.
 */
export const ESTADO_MS = 150;

/**
 * O REGRESSO do toque. É aqui que se sente.
 *
 * 260 ms com a mola `press` (ζ = 1, sem ressalto) contra os 120 ms de antes.
 * Duzentos e sessenta milissegundos VEEM-SE — e é de propósito: o botão
 * carrega instantâneo e assenta com peso, que é a assimetria que este ficheiro
 * já procurava («carrega instantâneo, assenta com peso») e só conseguia
 * exprimir com uma diferença de 20 para 120.
 *
 * Sem ressalto, porque um botão que salta ao ser largado lê-se como um erro.
 */
export const REGRESSO_MS = 260;

/** A barra a encher. O degrau `elemento` da casa — uma coisa a mover-se. */
export const PROGRESSO_MS = 250;

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

/**
 * ── PORQUE É QUE ISTO ESTÁ ESCRITO POR EXTENSO, E NÃO MONTADO ─────────────
 *
 * Porque montado NÃO FUNCIONA, e não funciona em silêncio. Isto chegou a
 * estar assim:
 *
 *     const PROPRIEDADES = "background-color,…,scale";
 *     const CINCO = Array(5).fill("var(--transition-duration-interactive)")…
 *     export const ESTADO = `motion-safe:transition-[${PROPRIEDADES}] …`;
 *
 * — que lê bem, compila em TypeScript, passa nos testes de unidade e não gera
 * UMA ÚNICA REGRA de CSS. O Tailwind v4 não executa o código: varre o texto do
 * ficheiro à procura de candidatos, e o texto que lá está é
 * `transition-[${PROPRIEDADES}]`, que não é classe nenhuma. Medido no CSS
 * compilado desta casa com o próprio `@tailwindcss/postcss`: das dez classes
 * `motion-safe:transition-[…]` que saem, a lista de seis propriedades deste
 * ficheiro não estava lá, e `transition-duration-interactive`,
 * `transition-duration-press` e `ease-press` apareciam ZERO vezes. No browser
 * dava `transition-property: all`, `transition-duration: 0s` — ou seja, os
 * botões todos sem transição nenhuma, exactamente a avaria que esta pasta
 * existe para não ter.
 *
 * Só o `ESTADO` e a `PRESSAO` tinham interpolação, e foram só esses dois que
 * desapareceram; o `PROGRESSO` e a `MARCA`, escritos por extenso, compilaram.
 *
 * Fica feio repetir `var(--transition-duration-interactive)` cinco vezes. Fica.
 * O `movimento.test.ts` tem um teste que lê o TEXTO deste ficheiro e exige que
 * cada classe exportada apareça nele letra por letra — é o que apanha esta
 * avaria da próxima vez que alguém tentar arrumá-la.
 *
 * ── DURAÇÕES POR PROPRIEDADE, E PORQUE É QUE NÃO HÁ ATALHO ────────────────
 *
 * O documento pede duas velocidades DIFERENTES no mesmo elemento: 150 ms para
 * o que se pinta (cor, contorno, sombra) e 260 ms para o regresso do toque. Um
 * `duration-*` só escreve UM número para todas as propriedades da lista, e as
 * duas coisas não cabem lá.
 *
 * A saída é a que o CSS já tem: `transition-duration` aceita uma LISTA que
 * casa, posição a posição, com a `transition-property`. Cinco vezes o degrau
 * interactivo e uma vez o do regresso. O mesmo para as curvas. As seis
 * propriedades estão POR ESTA ORDEM e a ordem importa: trocar duas em cima sem
 * trocar as duas em baixo dá um botão a mudar de cor ao ritmo do toque.
 *
 * A lista de propriedades continua fechada e nenhuma delas força *layout* — a
 * regra da casa para 60 fps num telemóvel em 4G. `scale` tem de estar cá
 * porque no Tailwind v4 a classe `scale-*` emite a propriedade autónoma
 * `scale`, e não `transform`; `transform` continua FORA, porque quem o usa
 * nesta pasta é o arrasto da folha, que segue o dedo.
 */
export const ESTADO =
  "motion-safe:transition-[background-color,border-color,color,box-shadow,opacity,scale] " +
  "motion-safe:[transition-duration:var(--transition-duration-interactive),var(--transition-duration-interactive),var(--transition-duration-interactive),var(--transition-duration-interactive),var(--transition-duration-interactive),var(--transition-duration-press)] " +
  "motion-safe:[transition-timing-function:var(--ease-interactive),var(--ease-interactive),var(--ease-interactive),var(--ease-interactive),var(--ease-interactive),var(--ease-press)]";

/**
 * O TOQUE — a IDA, a 80 ms e seca.
 *
 * Três classes e uma assimetria deliberada, que é o coração deste ficheiro. O
 * `:active` tem mais especificidade do que a duração de base, portanto estas
 * três ganham sem depender de ordem nenhuma enquanto o dedo está em baixo; ao
 * largar, o elemento deixa de estar `:active`, cai para a lista do `ESTADO` e
 * o `scale` volta ao sítio nos 260 ms da mola `press`.
 *
 * É por isso que a ida escreve UM número para todas as propriedades e a volta
 * escreve seis: à ida não há nada a distinguir — carrega tudo ao mesmo tempo,
 * depressa e sem curva de mola. É o documento, letra por letra: «a ida é seca;
 * só o regresso é mola».
 *
 * O gesto é `scale-[0.97]` — 3%, e não um salto. Compõe-se na GPU e não mexe
 * com quem está à volta.
 *
 * Onde a variante já tem uma tinta no vocabulário (os fantasmas, os itens de
 * menu), cada primitivo junta-lhe o seu `active:bg-…` um degrau mais fundo —
 * mesma cor, opacidade seguinte. Estes 80 ms cobrem-na, porque a duração do
 * `:active` vale para todas as propriedades da lista.
 */
export const PRESSAO =
  "motion-safe:active:scale-[0.97] " +
  "motion-safe:active:[transition-duration:80ms] " +
  "motion-safe:active:[transition-timing-function:var(--ease-out)]";

/**
 * Uma barra de progresso a avançar. Substitui o `duration-elemento` morto —
 * mesmo tempo pretendido (250 ms), só que agora o Tailwind gera mesmo a regra.
 */
export const PROGRESSO =
  "motion-safe:transition-transform motion-safe:duration-elemento motion-safe:ease-out";

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
/**
 * 325 ms — o degrau `quick` do documento, que a Parte 9.5 dá por nome ao
 * indicador de um segmentado: «o indicador desliza com `--ease-quick`».
 *
 * A assimetria que este bloco defende não só se mantém como CRESCE: o texto
 * acende aos 150 ms do estado e a marca só chega aos 325. Era 120 contra 250.
 */
export const MARCA_MS = 325;

export const MARCA =
  "motion-safe:transition-[translate,width] motion-safe:duration-quick motion-safe:ease-quick";

/**
 * ── A MOLA DE MARCAR ─────────────────────────────────────────────────────
 *
 * 320 ms, `scale(1) → 1.18 → 1`, com a curva `quick`. É o número que ela
 * escreveu no documento das Tarefas, e é o mesmo degrau de todas as outras
 * aberturas da casa (325 é o token; 320 é o que ela pediu, e a diferença de
 * cinco milissegundos não é uma segunda velocidade — é o mesmo degrau).
 *
 * Vive aqui, e não escrito à mão na linha da tarefa, pela regra deste
 * ficheiro: as durações e as curvas moram todas no mesmo sítio, para a subida
 * de uma delas chegar a toda a gente sem se procurar por onde.
 *
 * Os fotogramas estão no `tema.css` (`@keyframes bo-marca-mola`), que é onde
 * um `@keyframes` pode viver.
 */
export const MOLA_DE_MARCAR = "motion-safe:animate-[bo-marca-mola_320ms_var(--ease-quick)]";
