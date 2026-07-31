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
