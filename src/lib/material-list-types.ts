/**
 * Listas base de material — conjuntos reutilizáveis, seguros no cliente.
 *
 * Uma lista base é uma receita, não uma checklist: descreve o que costuma ir
 * numa montagem daquele tipo. A checklist de um evento é uma CÓPIA dela, e é
 * por isso que mudar a lista base nunca mexe em eventos já preparados.
 */

export interface MaterialList {
  id: string;
  name: string;
  /** "Vai sempre": entra em todos os eventos, sem regra nenhuma. */
  isDefault: boolean;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MaterialListItem {
  id: string;
  listId: string;
  itemId: string;
  /** Quantidade fixa. É também o mínimo quando a linha escala com convidados. */
  qty: number;
  /**
   * Fração por convidado, quando a quantidade depende do tamanho do evento.
   * `1/50 = 0.02` → um saco do lixo por cada 50 pessoas.
   *
   * Guarda-se a FRAÇÃO e não "por cada N", porque é o que a conta usa
   * directamente e porque N=0 seria uma divisão por zero à espera de acontecer.
   */
  qtyPerPax?: number;
  /**
   * Sem isto a montagem não acontece: escadote, extensões, ferramentas. Se
   * ficar por marcar, a vista de carregamento avisa antes de dar a carrinha
   * por carregada.
   */
  critical: boolean;
  position: number;
}

/**
 * Quantas unidades desta linha, para um evento de `pax` convidados.
 *
 * Arredonda para CIMA: com 120 pessoas e um saco por cada 50, três sacos —
 * dois deixavam a última meia centena sem saco, e o erro que interessa evitar é
 * o de levar de menos. Nunca desce abaixo da quantidade fixa, que serve de
 * mínimo (dois panos são dois panos, mesmo num evento de dez pessoas).
 */
export function quantidadePara(
  linha: Pick<MaterialListItem, "qty" | "qtyPerPax">,
  pax: number,
): number {
  if (!linha.qtyPerPax || linha.qtyPerPax <= 0) return linha.qty;
  if (!Number.isFinite(pax) || pax <= 0) return linha.qty;
  return Math.max(linha.qty, Math.ceil(pax * linha.qtyPerPax));
}

/** "1 por cada 50" a partir da fração, para o ecrã não mostrar "0.02". */
export function porCadaQuantos(qtyPerPax?: number): number | null {
  if (!qtyPerPax || qtyPerPax <= 0) return null;
  return Math.round(1 / qtyPerPax);
}
