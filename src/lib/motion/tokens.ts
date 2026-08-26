/**
 * Fichas de movimento do lado JS.
 *
 * O sítio declara UMA desaceleração de assinatura — `--ease-out` no `:root` do
 * globals.css. Mas uma primitiva que escreve `el.style.transition` à mão não
 * consegue ler essa variável, por isso a curva estava copiada, caracter a
 * caracter, em cada primitiva (Reveal, AnimateIn, TiltCard, e o menu do
 * Navbar). Quatro cópias independentes de um valor que devia ser um só: nada
 * impedia que uma delas fosse afinada e as outras não, e foi exactamente assim
 * que a curva do Reveal chegou a ter no comentário um valor
 * (`cubic-bezier(0.33, 1, 0.68, 1)`) diferente do que a constante logo abaixo
 * usava.
 *
 * Este ficheiro é a cópia única do lado JS. O `tokens.coerencia.test.ts`
 * compara-a com o valor REAL lido do globals.css — se um dos dois lados for
 * afinado sozinho, o teste fica vermelho em vez de a página ficar
 * silenciosamente com duas desacelerações.
 */

/**
 * A desaceleração de assinatura. Espelha `--ease-out` do globals.css (mesmo
 * valor, verificado por teste). Arranca depressa e assenta devagar: é o que dá
 * a leitura de "peso" ao movimento do sítio.
 */
export const EASE_OUT = "cubic-bezier(0.16, 1, 0.3, 1)";

/**
 * A curva de SAÍDA. Espelha `--ease-in` do globals.css (mesmo valor, verificado
 * por teste).
 *
 * A irmã da de cima, e a que faltava. Quem sai não precisa de ser acompanhado
 * até ao fim: hesita no arranque — para se perceber o que é que está a sair — e
 * acelera a partir daí. Uma saída que trava à chegada lê-se como indecisão, e
 * uma saída na curva de ENTRADA lê-se como se a coisa ainda pudesse voltar
 * atrás.
 */
export const EASE_IN = "cubic-bezier(0.4, 0, 1, 1)";

/**
 * ── A ESCALA DOS TEMPOS ─────────────────────────────────────────────────────
 *
 * Três degraus, e a razão de serem três: o que responde ao dedo, o que move uma
 * coisa, e o que troca um ecrã. Antes disto havia seis números em uso (300,
 * 200, 500, 700, 150, 400) sem regra escrita em lado nenhum — ou seja, cada
 * componente novo escolhia à sorte, e a olho lia-se como deriva.
 *
 * Espelham os `--transition-duration-*` do `@theme` do globals.css, com teste a ligar as
 * pontas. Lá dão utilitários do Tailwind (`duration-elemento`); aqui servem
 * quem escreve `element.style.transition` à mão.
 *
 * O QUARTO tempo — a entrada de uma fotografia ao scroll — NÃO é um degrau
 * desta escala. É uma escala própria, que acompanha o tamanho da fotografia
 * (ver `PHOTO_REVEAL_*` no fim deste ficheiro), e existia antes disto.
 */
/** Responde ao dedo: toque, foco, passar o rato. */
export const DUR_MICRO_MS = 120;
/** Move uma coisa: abrir uma secção, entrar uma foto, fechar um aviso. */
export const DUR_ELEMENTO_MS = 250;
/** Troca um ecrã: mudar de passo, mudar de vista. */
export const DUR_VISTA_MS = 350;

/**
 * ── A MOLA ──────────────────────────────────────────────────────────────────
 *
 * Para o que se ARRASTA — e só para isso. Uma curva descreve um percurso com
 * princípio e fim conhecidos; uma coisa largada a meio de um gesto não tem
 * nenhum dos dois, e é por isso que uma `transition` a seguir um dedo se lê
 * sempre como atraso.
 *
 * Amortecimento alto, quase crítico: assenta e fica. A oscilação é o erro
 * clássico da mola em interfaces — parece brincadeira, e num painel onde se
 * arrastam quarenta fotografias parece que o programa não está seguro do que
 * fez.
 *
 * Sem biblioteca: ver `mola.ts`, cerca de quarenta linhas sobre
 * `requestAnimationFrame`. O `@dnd-kit` que a casa já usa trata do arrastar; o
 * que lhe falta é a assentada.
 *
 * ── Os números são MEDIDOS, e não herdados ────────────────────────────────
 *
 * A primeira proposta foi 170/26 — que é, literalmente, o preset «gentle» de
 * uma biblioteca de molas conhecida. Herdar o valor por omissão de outra pessoa
 * é exactamente o que se lê como «não foi escolhido»: medido aqui, assentava um
 * arrasto de 200 px em 717 ms, o que num painel de fotografias é uma espera.
 *
 * 400/38 assenta o mesmo arrasto em 450 ms, 40 px em 350 ms e um empurrão de
 * 8 px em 233 ms — ou seja, o tempo acompanha a distância sozinho, que é a
 * razão de se usar uma mola e não uma duração fixa.
 *
 * O amortecimento fica a 95% do crítico (o crítico, para esta rigidez, é 40):
 * o recuo depois de chegar é de centésimos de píxel — invisível — mas continua
 * a ser uma mola e não um travão. Um teste guarda as duas pontas.
 */
export const MOLA = {
  /** A força com que puxa para o sítio. */
  rigidez: 400,
  /** O travão — é isto que impede a oscilação. */
  amortecimento: 38,
  massa: 1,
} as const;

/**
 * Duração de UMA entrada ao scroll. Vale para todas as revelações do mesmo
 * gesto — `Reveal`, `AnimateIn` e a `.cl-reveal` da parede de logótipos já
 * partilhavam este número, cada uma escrita à parte; agora partilham a ficha.
 */
export const REVEAL_MS = 750;

/** O mesmo, em segundos (a API do `Reveal` fala em segundos, como o GSAP falava). */
export const REVEAL_S = REVEAL_MS / 1000;

/**
 * Intervalo entre elementos consecutivos de uma cascata, em segundos. 90 ms lê-se
 * como "composto" sem obrigar a esperar: uma cascata de 4 elementos fica
 * resolvida em 0,27 s + a duração da entrada.
 */
export const STAGGER_S = 0.09;

/** O mesmo passo, em milissegundos (a API do `AnimateIn` fala em ms). */
export const STAGGER_MS = STAGGER_S * 1000;

/**
 * TECTO da cascata de blocos. A partir do 5.º elemento o atraso deixa de
 * acumular.
 *
 * Sem tecto, uma cascata é uma multiplicação: quem chega ao fim de uma lista
 * longa espera pelo produto. A parede de logótipos é a prova — 19 logótipos a
 * 42 ms dão 756 ms de rasto, e o último só fica legível ~1,5 s depois de a
 * secção entrar. Com tecto, o rasto de QUALQUER cascata é no máximo
 * `STAGGER_CAP × STAGGER_MS` = 360 ms, seja de 5 elementos ou de 50.
 *
 * O padrão não é novo: o `LegalDocView` já fazia `Math.min(i, 4) * 40`. Estava
 * escrito uma vez, num sítio, e em mais lado nenhum.
 */
export const STAGGER_CAP = 4;

/** Atraso do i-ésimo BLOCO de uma cascata, com o tecto já aplicado. */
export function staggerMs(i: number): number {
  return Math.min(i, STAGGER_CAP) * STAGGER_MS;
}

/**
 * Passo entre PALAVRAS (a animação `word-rise` dos títulos).
 *
 * Deliberadamente mais curto que o passo de blocos, e isto não é deriva: as
 * palavras são pequenas, contíguas e leem-se como UMA frase a levantar-se. Ao
 * passo de bloco (90 ms) uma frase de dez palavras demoraria quase um segundo a
 * acabar de chegar e passaria a ler-se como dez coisas separadas.
 *
 * 50 ms é o valor que o sítio usa em produção (`/sobre`). O `TitleReveal` tinha
 * um valor por omissão diferente (60 ms) que nunca chegou a ser usado, e o
 * `KineticHeading` — componente órfão, zero utilizações — trazia um terceiro
 * (90 ms). Três valores por omissão para o mesmo gesto, um só em uso.
 */
export const WORD_STAGGER_MS = 50;

/** Tecto da cascata de palavras. Um título longo deixa de castigar quem o lê. */
export const WORD_STAGGER_CAP = 6;

/** Atraso da i-ésima PALAVRA, com o tecto já aplicado. */
export function wordStaggerMs(i: number, step: number = WORD_STAGGER_MS): number {
  return Math.min(i, WORD_STAGGER_CAP) * step;
}

/**
 * Onde é que a cascata de palavras de `texto` ACABA — o instante em que uma
 * frase seguinte pode arrancar sem colidir nem deixar buraco.
 *
 * Existe por causa de um acoplamento real: no `/sobre` a segunda metade da
 * frase arrancava com `statementLead.split(/\s+/).length * 50 + 80`, ou seja
 * com o passo (50) escrito à mão uma TERCEIRA vez, fora do componente. Mudar o
 * `step` de um dos `<TitleReveal>` dessincronizava as duas metades em silêncio.
 * Agora quem sabe contar palavras é quem sabe o passo.
 *
 * Enquanto o tecto não morde, devolve exactamente o mesmo número que a conta
 * antiga (`n × passo + intervalo`) — é uma reorganização, não uma afinação.
 */
export const SENTENCE_GAP_MS = 80;

export function wordCascadeEndMs(texto: string, step: number = WORD_STAGGER_MS): number {
  const n = texto.trim().split(/\s+/).filter(Boolean).length;
  if (n === 0) return 0;
  return (Math.min(n - 1, WORD_STAGGER_CAP) + 1) * step + SENTENCE_GAP_MS;
}

/**
 * ── Revelação de FOTOGRAFIA ─────────────────────────────────────────────────
 *
 * É UM gesto, não quatro: `<Reveal variant="zoom">` — a foto assenta de
 * `scale(1.08)` até ao repouso enquanto desvanece para dentro. Transform +
 * opacity apenas, portanto composto na GPU; substituiu de propósito o `mask`
 * (uma limpeza por `clip-path`, que repinta a cada quadro) em todos os sítios
 * onde havia fotografias grandes.
 *
 * O que faltava não era o gesto — era a ESCALA. Os três tempos abaixo já
 * existiam no sítio, escolhidos um a um, e à primeira vista leem-se como
 * deriva. Não são: acompanham o TAMANHO da fotografia. Ao mesmo `scale(1.08)`,
 * uma foto de sangria inteira percorre muitas mais centenas de píxeis do que um
 * mosaico de 160 px — dar-lhes o mesmo tempo faria a grande parecer apressada e
 * a pequena arrastada. O que estava errado era a escala não estar escrita em
 * lado nenhum, e por isso cada foto nova inventar um número.
 */
/** Sangria inteira, 100svh (capítulos da página inicial). */
export const PHOTO_REVEAL_FULL_S = 1.15;
/** Retrato / meia página (`/sobre`). */
export const PHOTO_REVEAL_LARGE_S = 0.9;
/** Mosaico e tiles pequenos — o mesmo tempo de qualquer outra entrada. */
export const PHOTO_REVEAL_TILE_S = REVEAL_S;
