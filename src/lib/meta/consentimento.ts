/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CONSENTIMENTO — O QUE SE PODE E O QUE NÃO SE PODE ENVIAR PARA A META
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O pedido foi: "o Pixel só dispara com consentimento, mas a CAPI continua a
 * enviar o que for legítimo enviar". A segunda metade merece uma resposta
 * franca, porque a resposta comercial habitual é falsa.
 *
 * ── O QUE É QUE A CAPI PODE ENVIAR SEM CONSENTIMENTO ───────────────────────
 * **Nada de útil.** E não é prudência excessiva; é o que sobra depois de tirar
 * o que precisa de consentimento:
 *
 *   • `fbp` e `fbc`   — derivam de cookies. Sem consentimento não existem, e
 *                       lê-los seria aceder a armazenamento no dispositivo
 *                       para fins publicitários, que é precisamente o que a
 *                       ePrivacy sujeita a consentimento;
 *   • email, telefone — dados pessoais. Cifrá-los em SHA-256 não os torna
 *                       anónimos: o objectivo declarado do envio é encontrar a
 *                       pessoa na Meta, portanto continuam a identificá-la. É
 *                       tratamento de dados pessoais e precisa de base legal;
 *   • IP e agente     — dados pessoais também, e a CAPI usa-os exactamente
 *                       para correspondência;
 *   • um evento sem   — chegaria a uma "conversão" sem pessoa: não melhora a
 *     nada disto        optimização, não constrói público nenhum, e mesmo
 *                       assim envia o IP no cabeçalho do pedido.
 *
 * A base legal do formulário — diligência pré-contratual, RGPD art. 6.º/1/b —
 * cobre RESPONDER ao pedido de orçamento. Não cobre mandar os dados dessa
 * pessoa para a Meta para melhorar a segmentação de anúncios: é outra
 * finalidade, e uma finalidade que a própria pessoa não pediu.
 *
 * ── O QUE ISTO NÃO QUER DIZER ──────────────────────────────────────────────
 * NÃO quer dizer que a CAPI não valha a pena. O valor dela está inteiro para
 * quem CONSENTIU, e é grande: o envio do servidor não é apanhado pelo ITP do
 * Safari, nem por bloqueadores, nem pela expiração de cookies de sete dias do
 * iOS. Em Portugal, com a fatia de iPhone que este mercado tem, a diferença
 * entre ter e não ter CAPI é tipicamente a diferença entre ver metade das
 * conversões e vê-las quase todas — DE QUEM CONSENTIU.
 *
 * ── O INTERRUPTOR ──────────────────────────────────────────────────────────
 * `ENVIAR_SEM_CONSENTIMENTO` existe e está DESLIGADO. Não está aqui para ser
 * ligado sem pensar: está aqui para a decisão ser visível e ter dono. Se
 * alguém — com aconselhamento jurídico próprio — concluir que no caso dela há
 * base legal para um envio mínimo, muda-se aqui e vê-se em todo o lado.
 * Enquanto estiver `false`, sem consentimento não sai NADA para a Meta.
 */

/** A mesma chave que o banner de cookies já usa para a Google. */
export const CHAVE_CONSENTIMENTO = "liquen-consent";

/**
 * DESLIGADO de propósito. Ver o cabeçalho.
 * `true` faria a CAPI enviar eventos sem identificadores nem dados pessoais
 * quando não há consentimento.
 */
export const ENVIAR_SEM_CONSENTIMENTO = false;

/**
 * Há consentimento neste dispositivo?
 *
 * Lê a MESMA chave do banner que já governa a Google. Isto é deliberado: dois
 * armazenamentos de consentimento separados dariam, mais dia menos dia, dois
 * estados diferentes — e a pessoa que recusou num teria consentido no outro
 * sem nunca ter dito que sim.
 *
 * Devolve `false` em qualquer situação anómala (armazenamento bloqueado, valor
 * estranho). Negado é o lado seguro.
 */
export function temConsentimento(): boolean {
  try {
    return localStorage.getItem(CHAVE_CONSENTIMENTO) === "granted";
  } catch {
    return false;
  }
}

/**
 * O servidor pode enviar este evento?
 *
 * `consentido` é o que o CLIENTE declarou no pedido. O servidor não tem forma
 * de o verificar por si — é uma afirmação de quem chama —, e isso está bem
 * assumido: quem falsificasse esta bandeira estaria a atacar a sua própria
 * privacidade, não a de outra pessoa. O que importa é que o caminho normal do
 * código nunca envia sem consentimento.
 */
export function podeEnviarDoServidor(consentido: boolean): boolean {
  return consentido || ENVIAR_SEM_CONSENTIMENTO;
}
