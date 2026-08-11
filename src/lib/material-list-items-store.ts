import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { MaterialListItem } from "./material-list-types";

/**
 * As LINHAS das listas base.
 *
 * Store próprio, e não uma segunda tabela dentro do `material-lists-store`,
 * porque a rede de segurança da cópia descobre as tabelas pelo disco: um
 * ficheiro, um `mapper.table`. Duas tabelas num ficheiro deixavam a segunda
 * invisível para essa verificação — que é exactamente o defeito que ela existe
 * para apanhar.
 */
export type { MaterialListItem } from "./material-list-types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1_000_000);
}

export const mapper: Mapper<MaterialListItem> = {
  table: "material_list_items",
  fileName: "material-list-items.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    list_id: i.listId,
    item_id: i.itemId,
    qty: i.qty,
    // Nulo = "não escala com convidados". Diferente de 0, que seria uma fração
    // de zero por pessoa e daria sempre a quantidade fixa por outra via.
    qty_per_pax: typeof i.qtyPerPax === "number" ? i.qtyPerPax : null,
    critical: i.critical,
    position: i.position,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    listId: String(r.list_id ?? ""),
    itemId: String(r.item_id ?? ""),
    qty: num(r.qty, 1),
    qtyPerPax:
      r.qty_per_pax === null || r.qty_per_pax === undefined ? undefined : num(r.qty_per_pax),
    critical: Boolean(r.critical),
    position: Number(r.position) || 0,
  }),
  order: { column: "position", ascending: true },
  fileCompare: (a, b) => a.position - b.position,
  /**
   * Compare-and-set sobre o `updated_at`.
   *
   * Reordenar uma lista é o caso mau: arrastar uma linha grava `position` em
   * várias linhas de seguida, e enquanto isso outra pessoa corrige a
   * quantidade de uma delas. Os dois patches são pequenos e não se cruzam, mas
   * o que chega em segundo reescreve a linha inteira com o resto como ela
   * estava na leitura dele — a quantidade corrigida volta atrás, ou a lista
   * fica ordenada por metade. Nenhum dos dois vê nada acontecer.
   */
  touch: true,
};

const repo = createRepository(mapper);

export const listAllListItems = (): Promise<MaterialListItem[]> => repo.list();

export async function listItemsOf(listId: string): Promise<MaterialListItem[]> {
  return (await repo.list())
    .filter((i) => i.listId === listId)
    .sort((a, b) => a.position - b.position);
}

export async function addListItem(
  input: Omit<MaterialListItem, "id"> & { id?: string },
): Promise<MaterialListItem> {
  const linha: MaterialListItem = { ...input, id: input.id || randomUUID() };
  await repo.create(linha);
  return linha;
}

export const updateListItem = (
  id: string,
  patch: Partial<MaterialListItem>,
): Promise<MaterialListItem | null> => repo.update(id, patch);

export const removeListItem = (id: string): Promise<void> => repo.remove(id);

/** Todas as linhas de uma lista, para quem a apaga ou a duplica. */
export async function removeItemsOf(listId: string): Promise<void> {
  for (const l of await listItemsOf(listId)) await repo.remove(l.id);
}
