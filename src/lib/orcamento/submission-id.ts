/**
 * ════════════════════════════════════════════════════════════════════════════
 * O IDENTIFICADOR QUE IMPEDE O PEDIDO EM DUPLICADO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um identificador estável para ESTE pedido, enviado no corpo do POST. A rota
 * `/api/orcamento` deriva dele o `id` do lead, por isso um reenvio — o dedo que
 * carrega outra vez porque a resposta se perdeu numa rede fraca, ou a página
 * recarregada a meio — dá UM lead e UM email em vez de dois.
 *
 * Vivia dentro do formulário completo (`/orcamento`) e os formulários dos
 * anúncios não o mandavam: eram precisamente os que correm em redes piores
 * (browser interno do Instagram, 3G num telemóvel) e os únicos sem protecção
 * nenhuma contra a repetição. Está aqui para os três partilharem a MESMA regra
 * — duas cópias da mesma ideia é como se acaba com duas ideias diferentes.
 *
 * Sobrevive a recarregamentos porque mora no `localStorage`; sem ele (modo
 * privado, armazenamento bloqueado) devolve-se um id por chamada — não há
 * deduplicação entre recarregamentos, mas o pedido leva na mesma um
 * identificador válido em vez de nenhum.
 */

const SUBMISSION_KEY = "liquen-orcamento-sid";

/** Um id novo, sem depender do armazenamento. */
function novoId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** O identificador deste pedido, criando-o à primeira vez que é preciso. */
export function ensureSubmissionId(): string {
  try {
    let sid = localStorage.getItem(SUBMISSION_KEY);
    if (!sid) {
      sid = novoId();
      localStorage.setItem(SUBMISSION_KEY, sid);
    }
    return sid;
  } catch {
    return novoId();
  }
}

/**
 * Deita fora o identificador depois de um envio bem sucedido, para que um
 * pedido genuinamente NOVO mais tarde não seja deduplicado contra o anterior.
 */
export function clearSubmissionId(): void {
  try {
    localStorage.removeItem(SUBMISSION_KEY);
  } catch {
    /* sem armazenamento — nada para limpar */
  }
}
