/**
 * A FRACÇÃO DE UMA BARRA — entre 0 e 1, e nunca um disparate.
 *
 * ── Porque existe ─────────────────────────────────────────────────────────
 * As barras do dossier deixaram de encolher por `width` e passaram a encolher
 * por `transform: scaleX(…)` (ver o contrato da fluidez, `Fluidez.contrato`).
 * A troca é boa para a fluidez, mas troca também o modo de falhar, e ao
 * contrário:
 *
 *   · `style={{ width: "NaN%" }}` é uma largura inválida — o browser ignora-a
 *     e a barra fica VAZIA. Um zero a mais no ecrã.
 *   · `style={{ transform: "scaleX(NaN)" }}` é uma transformação inválida — o
 *     browser ignora a declaração INTEIRA, e o traço fica com o tamanho que
 *     tem no CSS, que é `w-full`. A barra fica CHEIA.
 *
 * Uma divisão por zero num painel de pagamentos passava a desenhar «tudo
 * recebido». É a leitura mais enganadora que aquela barra podia dar, e dava-a
 * em silêncio.
 *
 * Hoje todos os sítios que chamam isto já protegem o denominador a montante.
 * Esta função existe para que continuem protegidos quando alguém mexer num
 * deles daqui a um ano — a rede fica aqui, num sítio, em vez de estar espalhada
 * por onze guardas que têm todas de continuar verdadeiras.
 */
export function fraccaoDaBarra(numerador: number, denominador: number): number {
  const f = numerador / denominador;
  // `Number.isFinite` apanha os três de uma vez: NaN (0/0), Infinity (n/0) e o
  // que vier de um campo por preencher.
  if (!Number.isFinite(f)) return 0;
  return Math.min(1, Math.max(0, f));
}
