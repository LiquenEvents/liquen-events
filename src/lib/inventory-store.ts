import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { PropItem } from "./inventory-types";

/**
 * Decor prop / material inventory for the studio back office.
 *
 * A single flat catalog of physical items the team owns (vases, candlesticks,
 * textiles, furniture…) with quantity, condition and where each lives. Persisted
 * through the shared Repository — Supabase table `inventory_items` when
 * configured, else a dev JSON file. `updatedAt` is server-managed (touch).
 *
 * The `PropItem` type and `PROP_CATEGORIES` list live in the client-safe
 * `inventory-types` module (re-exported here for convenience) so client
 * components can use them without importing this server-only store.
 */
export type { PropCondition, PropItem } from "./inventory-types";
export { PROP_CATEGORIES } from "./inventory-types";

export const mapper: Mapper<PropItem> = {
  table: "inventory_items",
  fileName: "inventory-items.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    quantity: i.quantity,
    unit: i.unit || null,
    condition: i.condition,
    location: i.location || null,
    notes: i.notes || null,
    updated_at: i.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    category: String(r.category ?? "Outro"),
    quantity: Number(r.quantity ?? 0),
    unit: (r.unit as string) ?? undefined,
    condition: (r.condition as PropItem["condition"]) ?? "bom",
    location: (r.location as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
  touch: true,
  beforeUpdate: (i) => ({ ...i, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

/** Fresh, unguessable item id. */
export const newItemId = (): string => randomUUID();

export const listItems = (): Promise<PropItem[]> => repo.list();

export const getItem = (id: string): Promise<PropItem | null> => repo.get(id);

export async function createItem(
  input: Omit<PropItem, "id" | "updatedAt"> & { id?: string; updatedAt?: string },
): Promise<PropItem> {
  const item: PropItem = {
    ...input,
    id: input.id || newItemId(),
    updatedAt: new Date().toISOString(),
  };
  await repo.create(item);
  return item;
}

export const updateItem = (id: string, patch: Partial<PropItem>): Promise<PropItem | null> =>
  repo.update(id, patch);

export const deleteItem = (id: string): Promise<void> => repo.remove(id);
