/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE MOSTRAR ENQUANTO A PROPOSTA ESTÁ A SER ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «ao enviar a proposta, quero que haja uma animação que eu
 * perceba que está a ser enviado».
 *
 * ── O QUE ACONTECIA ───────────────────────────────────────────────────────
 *
 * Nada. O `send()` apagava a confirmação e punha o `busy`, e o ecrã voltava ao
 * botão «Gerar e enviar ao cliente» — desactivado, e mais nada. O envio desenha
 * o PDF inteiro no servidor, guarda-o e manda o email: numa quinta com 4G fraco
 * são dezenas de segundos a olhar para um botão apagado, sem forma de saber se
 * aquilo está a andar ou se morreu.
 *
 * ── UMA BARRA QUE NÃO MENTE ───────────────────────────────────────────────
 *
 * O envio é UM pedido: não há progresso real para reportar, e uma barra que
 * ande a passo certo até 100% e depois fique lá parada é pior do que nenhuma —
 * ensina a não acreditar nela.
 *
 * Esta anda depressa no princípio e vai abrandando, e NUNCA chega ao fim
 * sozinha: só a resposta a fecha. É a forma honesta de dizer «está a andar, e
 * não sei quanto falta» — e o abrandamento é literal, porque quanto mais tempo
 * passa menos se sabe.
 *
 * O ritmo sai da estimativa que a casa já aprendeu com as gerações anteriores
 * (`tempoEstimado`), portanto num computador rápido a barra anda depressa e num
 * telemóvel com rede fraca anda devagar. Passado o dobro do estimado deixa de
 * fingir e diz o que interessa: isto demora, não feches o separador.
 */

/** A barra pára aqui. O que a fecha é a resposta, e só ela. */
export const TECTO_DA_BARRA = 0.94;

/**
 * Quanto da barra está cheia, de 0 a {@link TECTO_DA_BARRA}.
 *
 * `1 - e^(-2·t/estimado)`: no tempo estimado vai em 86%, ao dobro em 98% do
 * tecto, e nunca lá chega. Uma recta chegava ao fim e parava — que é o gesto
 * que faz uma barra deixar de ser acreditada.
 */
export function avancoDoEnvio(decorridoMs: number, estimadoMs: number): number {
  if (!(estimadoMs > 0) || !(decorridoMs > 0)) return 0;
  return TECTO_DA_BARRA * (1 - Math.exp((-2 * decorridoMs) / estimadoMs));
}

/**
 * O que o servidor está a fazer, dito pela ordem por que o faz.
 *
 * ── Isto é uma estimativa, e diz-se aqui ──────────────────────────────────
 *
 * O envio é um pedido só: o cliente não sabe em que passo o servidor vai. O que
 * se sabe é a ORDEM — a rota desenha o documento, grava a proposta e só então
 * manda o email —, e é essa ordem que aqui se conta contra o relógio.
 *
 * O risco de contar assim seria dizer «enviado» antes de estar; por isso o
 * último passo nunca é um facto consumado («A enviar o email», e não «Email
 * enviado») e quem dá o envio por feito continua a ser só a resposta.
 */
export function passoDoEnvio(decorridoMs: number, estimadoMs: number): string {
  const t = estimadoMs > 0 ? decorridoMs / estimadoMs : 0;
  if (t > 2) return "Ainda a enviar. Com rede fraca demora — não feches o separador.";
  if (t < 0.5) return "A desenhar o PDF…";
  if (t < 0.8) return "A guardar a proposta…";
  return "A enviar o email…";
}
