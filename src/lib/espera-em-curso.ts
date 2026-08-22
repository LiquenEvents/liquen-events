/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA BARRA QUE NÃO MENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nasceu no envio de uma proposta — «quero uma animação que eu perceba que
 * está a ser enviado» — e vive aqui porque a pergunta não é do envio: é de
 * TODA a espera desta casa em que não há progresso real para reportar. Gerar
 * um PDF, mandar um email, gravar um documento, pedir um link curto: um
 * pedido, uma resposta, e no meio nada que se possa contar.
 *
 * ── AS DUAS ESPERAS, E PORQUE É QUE SÃO DIFERENTES ───────────────────────
 *
 * Há esperas em que se SABE quanto falta: importar 312 fotos são 312 coisas,
 * e a barra pode dizer a verdade (47 de 312). Essas não usam isto — usam a
 * fracção a sério.
 *
 * E há esperas OPACAS: um pedido só. Aí uma barra que ande a passo certo até
 * 100% e depois fique lá parada é pior do que barra nenhuma — ensina a não
 * acreditar nela, e a partir daí nenhuma barra do produto vale nada.
 *
 * Esta anda depressa no princípio e vai abrandando, e NUNCA chega ao fim
 * sozinha: só a resposta a fecha. É a forma honesta de dizer «está a andar, e
 * não sei quanto falta» — e o abrandamento é literal, porque quanto mais tempo
 * passa menos se sabe.
 */

/** A barra pára aqui. O que a fecha é a resposta, e só ela. */
export const TECTO_DA_BARRA = 0.94;

/**
 * Quanto da barra está cheia, de 0 a {@link TECTO_DA_BARRA}.
 *
 * `1 - e^(-2·t/estimado)`: no tempo estimado vai em 86%, ao dobro em 98% do
 * tecto, e nunca lá chega. Uma recta chegava ao fim e parava — que é o gesto
 * que faz uma barra deixar de ser acreditada.
 *
 * O `estimadoMs` é o que faz isto acompanhar a máquina de quem espera: com uma
 * estimativa aprendida das gerações anteriores, num computador rápido a barra
 * anda depressa e num telemóvel com 4G fraco anda devagar. Sem estimativa
 * nenhuma, quem chama deve passar o palpite mais honesto que tiver — nunca
 * zero, que devolve uma barra parada.
 */
export function avancoDaEspera(decorridoMs: number, estimadoMs: number): number {
  if (!(estimadoMs > 0) || !(decorridoMs > 0)) return 0;
  return TECTO_DA_BARRA * (1 - Math.exp((-2 * decorridoMs) / estimadoMs));
}

/**
 * Passou muito mais tempo do que o estimado?
 *
 * A partir daqui a barra deixa de ser informação — está a 98% do tecto e mal
 * se mexe — e o que interessa dizer passa a ser outra coisa: isto demora, não
 * feches o separador. Quem desenha decide a frase; o momento decide-se aqui,
 * para ser o mesmo em toda a parte.
 */
export function esperaDemorada(decorridoMs: number, estimadoMs: number): boolean {
  return estimadoMs > 0 && decorridoMs > 2 * estimadoMs;
}
