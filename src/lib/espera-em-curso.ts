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
 * Esta anda a passo certo até ao tempo estimado, depois vai abrandando, e
 * NUNCA chega ao fim sozinha: só a resposta a fecha. É a forma honesta de
 * dizer «está a andar, e não sei quanto falta» — e o abrandamento é literal,
 * porque passado o estimado, quanto mais tempo passa menos se sabe.
 */

/** A barra pára aqui. O que a fecha é a resposta, e só ela. */
export const TECTO_DA_BARRA = 0.95;

/** Onde a barra está quando passou exactamente o tempo estimado. */
export const NO_ESTIMADO = 0.85;

/**
 * Quanto da barra está cheia, de 0 a {@link TECTO_DA_BARRA}.
 *
 * ── PORQUE É QUE DEIXOU DE SER UMA CURVA QUE DISPARA ────────────────────────
 *
 * Era `0,94·(1 − e^(−2t/estimado))`: metade da barra no primeiro quinto do
 * tempo, e depois quase parada. A 14/10 ela pediu «a animação a descarregar
 * melhores mesmo muito», e o sistema de design (§10, Progresso) é explícito:
 * «mantém em movimento; distribui o avanço uniformemente». Uma barra que
 * dispara e depois se arrasta é a que parece encravada a meio — que é
 * exactamente o que ela via no «A gerar o PDF…».
 *
 * Agora são duas partes, coladas sem salto:
 *  · até ao tempo estimado, uma RECTA até {@link NO_ESTIMADO} (85%): o avanço
 *    é uniforme, e com uma estimativa aprendida a barra chega perto do fim
 *    quando a resposta costuma chegar;
 *  · depois, aproxima-se do tecto (95%) cada vez mais devagar, sem nunca o
 *    tocar nem parar. A inclinação à entrada desta parte é a mesma da recta,
 *    por isso não há esquina: `0,10 · e^(−8,5·x)` tem derivada 0,85 em x = 0,
 *    igual à da recta (0,85 por estimado).
 *
 * O que continua igual é a regra que faz todas as outras barras valerem
 * alguma coisa: sem resposta, nunca chega ao fim.
 */
export function avancoDaEspera(decorridoMs: number, estimadoMs: number): number {
  if (!(estimadoMs > 0) || !(decorridoMs > 0)) return 0;
  const x = decorridoMs / estimadoMs;
  if (x <= 1) return NO_ESTIMADO * x;
  const resto = TECTO_DA_BARRA - NO_ESTIMADO;
  return NO_ESTIMADO + resto * (1 - Math.exp((-NO_ESTIMADO / resto) * (x - 1)));
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
