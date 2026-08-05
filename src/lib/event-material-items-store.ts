import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { EventMaterialItem } from "./event-material-types";
import type { MaterialKind } from "./material-types";
import type { Origem } from "./material-rules";

/**
 * As LINHAS da checklist de um evento.
 *
 * Store próprio pela mesma razão das listas base: a rede de segurança da cópia
 * descobre as tabelas pelo disco, um ficheiro por `mapper.table`.
 */
export type { EventMaterialItem } from "./event-material-types";

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1_000_000);
}

export const mapper: Mapper<EventMaterialItem> = {
  table: "event_material_items",
  fileName: "event-material-items.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    event_id: i.eventId,
    item_id: i.itemId || null,
    name: i.name,
    category: i.category,
    unit: i.unit || null,
    kind: i.kind,
    qty: i.qty,
    critical: i.critical,
    origin: i.origin,
    origin_ref: i.originRef || null,
    origin_label: i.originLabel || "",
    vehicle_id: i.vehicleId || null,
    loaded_at: i.loadedAt || null,
    loaded_by: i.loadedBy || null,
    returned_at: i.returnedAt || null,
    returned_by: i.returnedBy || null,
    missing: i.missing,
    used_qty: typeof i.usedQty === "number" ? i.usedQty : null,
    note: i.note || null,
  }),
  fromRow: (r) => {
    return {
      id: String(r.id),
      eventId: String(r.event_id ?? ""),
      itemId: (r.item_id as string) ?? undefined,
      name: String(r.name ?? ""),
      category: String(r.category ?? ""),
      unit: (r.unit as string) ?? undefined,
      kind: (r.kind as MaterialKind) === "consumivel" ? "consumivel" : "reutilizavel",
      qty: num(r.qty, 1),
      critical: Boolean(r.critical),
      origin: (r.origin as Origem) ?? "manual",
      originRef: (r.origin_ref as string) ?? undefined,
      originLabel: String(r.origin_label ?? ""),
      vehicleId: (r.vehicle_id as string) ?? undefined,
      loadedAt: (r.loaded_at as string) ?? undefined,
      loadedBy: (r.loaded_by as string) ?? undefined,
      returnedAt: (r.returned_at as string) ?? undefined,
      returnedBy: (r.returned_by as string) ?? undefined,
      missing: Boolean(r.missing),
      usedQty: r.used_qty === null || r.used_qty === undefined ? undefined : num(r.used_qty),
      note: (r.note as string) ?? undefined,
    };
  },
  order: { column: "category", ascending: true },
  fileCompare: (a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name),
};

const repo = createRepository(mapper);

export const listAllEventItems = (): Promise<EventMaterialItem[]> => repo.list();

export async function listItemsOfEvent(eventId: string): Promise<EventMaterialItem[]> {
  return (await repo.list())
    .filter((i) => i.eventId === eventId)
    .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
}

export async function addEventItem(
  input: Omit<EventMaterialItem, "id"> & { id?: string },
): Promise<EventMaterialItem> {
  const linha: EventMaterialItem = { ...input, id: input.id || randomUUID() };
  await repo.create(linha);
  return linha;
}

export const updateEventItem = (
  id: string,
  patch: Partial<EventMaterialItem>,
): Promise<EventMaterialItem | null> => repo.update(id, patch);

export const removeEventItem = (id: string): Promise<void> => repo.remove(id);

/** Todas as linhas de um evento — para quem regenera ou apaga a checklist. */
export async function removeItemsOfEvent(eventId: string): Promise<void> {
  for (const l of await listItemsOfEvent(eventId)) await repo.remove(l.id);
}
