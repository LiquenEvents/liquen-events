import type { MaterialKind } from "./material-types";
import type { Origem } from "./material-rules";

/**
 * A checklist de material de UM evento.
 *
 * É uma CÓPIA das listas base no instante em que foi gerada, e não uma
 * referência a elas. Afinar uma lista base em Março não pode mexer na checklist
 * de um casamento que já foi preparado em Fevereiro — quem carregou a carrinha
 * viu uma lista, e é essa que tem de continuar a existir.
 */

export type EventMaterialStatus = "preparada" | "carregada" | "devolvida";

export interface Veiculo {
  id: string;
  name: string;
}

export interface EventMaterial {
  id: string;
  quoteId: string;
  status: EventMaterialStatus;
  generatedAt: string;
  vehicles: Veiculo[];
  notes?: string;
  updatedAt: string;
}

export interface EventMaterialItem {
  id: string;
  eventId: string;
  /** O item do catálogo de onde veio. Pode ficar órfão sem partir a linha. */
  itemId?: string;
  /** Copiado, não lido por junção: é o que faz a lista sobreviver a tudo. */
  name: string;
  category: string;
  unit?: string;
  kind: MaterialKind;
  qty: number;
  critical: boolean;
  origin: Origem;
  originRef?: string;
  /** Legível: "Essenciais de carrinha", "Regra: velas". */
  originLabel: string;
  vehicleId?: string;
  loadedAt?: string;
  loadedBy?: string;
  returnedAt?: string;
  returnedBy?: string;
  missing: boolean;
  /** Consumíveis: quanto se gastou mesmo, preenchido no regresso. */
  usedQty?: number;
  note?: string;
}

/** Quantos estão carregados, e quantos faltam dos CRÍTICOS. */
export function progresso(itens: EventMaterialItem[]): {
  carregados: number;
  total: number;
  criticosPorCarregar: EventMaterialItem[];
} {
  const carregados = itens.filter((i) => i.loadedAt).length;
  return {
    carregados,
    total: itens.length,
    criticosPorCarregar: itens.filter((i) => i.critical && !i.loadedAt),
  };
}
