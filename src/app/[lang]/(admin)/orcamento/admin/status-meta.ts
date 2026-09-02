/**
 * UMA LINHA MÁ NÃO PODE DERRUBAR O ECRÃ TODO.
 *
 * Quase todos os ecrãs do back office pintam uma etiqueta indexando um mapa com
 * o valor da própria linha — `STATUS_META[q.status].color`. Isso dá `undefined`
 * assim que aparece um valor fora do mapa, e como estes são componentes de
 * cliente o erro sobe ao limite de erro e substitui o BACK OFFICE INTEIRO pelo
 * ecrã "Ocorreu um erro inesperado" — não só aquela linha, não só aquele ecrã.
 *
 * Foi mesmo assim que se perdeu o back office numa medição: uma proposta
 * gravada como `recusada` em vez de `rejeitada` (o mapa usa a segunda e mostra
 * "Recusada" como rótulo — a troca é fácil de fazer à mão). Encontrou-se depois
 * a mesma forma em sete ecrãs.
 *
 * As APIs validam os valores, portanto pelo uso normal isto não acontece.
 * Acontece com uma linha antiga, uma migração, ou uma correcção feita
 * directamente na base de dados — que é exactamente quando ela menos pode
 * dar-se ao luxo de perder o ecrã.
 *
 * A escolha aqui é deliberada: **mostrar o valor cru em cinzento** em vez de
 * inventar um rótulo bonito ou esconder a linha. Ela vê que aquela linha tem
 * algo estranho, sabe qual é, e continua a trabalhar.
 */

export interface StatusMeta {
  label: string;
  color: string;
}

/** Cinzento neutro — o mesmo que os mapas já usam para o estado mais apagado. */
export const UNKNOWN_STATUS_COLOR = "#8a8a82";

/**
 * Lê o mapa de estados sem rebentar com um valor desconhecido.
 *
 * Usar SEMPRE que a chave venha dos dados (`q.status`, `t.priority`, …). Para
 * chaves vindas de uma constante do próprio ficheiro (por exemplo iterar
 * `Object.keys(STATUS_META)` ou uma lista fixa de filtros) o acesso directo é
 * seguro e continua a ser o mais claro.
 */
export function metaFor<T extends StatusMeta>(map: Record<string, T>, key: string): T | StatusMeta {
  return map[key] ?? { label: key || "—", color: UNKNOWN_STATUS_COLOR };
}
