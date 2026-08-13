import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { MaterialItem, MaterialKind } from "./material-types";

/**
 * Catálogo de material de logística, persistido pelo Repository partilhado —
 * tabela `material_items` no Supabase quando está configurado, ficheiro JSON
 * em desenvolvimento. O `updatedAt` é gerido pelo servidor (`touch`).
 *
 * Os tipos e as categorias vivem no `material-types`, seguro no cliente, e são
 * reexportados aqui por conveniência de quem já está no servidor.
 */
export type { MaterialKind, MaterialItem } from "./material-types";
export { MATERIAL_CATEGORIES, MATERIAL_UNITS, abaixoDoMinimo } from "./material-types";

/** Número não-negativo e limitado. Decimal, por causa dos metros e dos rolos. */
function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.min(n, 1_000_000);
}

export const mapper: Mapper<MaterialItem> = {
  table: "material_items",
  fileName: "material-items.json",
  getId: (i) => i.id,
  toRow: (i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    kind: i.kind,
    unit: i.unit || null,
    stock: i.stock,
    // `null` e `0` são coisas diferentes: `null` é "não vigiar este item",
    // `0` é "avisar-me assim que houver menos do que nenhum", que nunca
    // dispara. Colapsá-los desligava a reposição em silêncio.
    min_stock: typeof i.minStock === "number" ? i.minStock : null,
    notes: i.notes || null,
    photo_path: i.photoPath || null,
    updated_at: i.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    category: String(r.category ?? "Ferramentas"),
    kind: (r.kind as MaterialKind) === "consumivel" ? "consumivel" : "reutilizavel",
    unit: (r.unit as string) ?? undefined,
    stock: num(r.stock),
    minStock: r.min_stock === null || r.min_stock === undefined ? undefined : num(r.min_stock),
    notes: (r.notes as string) ?? undefined,
    photoPath: (r.photo_path as string) ?? undefined,
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
  touch: true,
  beforeUpdate: (i) => ({ ...i, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const newMaterialId = (): string => randomUUID();

export const listMaterial = (): Promise<MaterialItem[]> => repo.list();

export const getMaterial = (id: string): Promise<MaterialItem | null> => repo.get(id);

export async function createMaterial(
  input: Omit<MaterialItem, "id" | "updatedAt"> & { id?: string; updatedAt?: string },
): Promise<MaterialItem> {
  const item: MaterialItem = {
    ...input,
    id: input.id || newMaterialId(),
    updatedAt: new Date().toISOString(),
  };
  await repo.create(item);
  return item;
}

export const updateMaterial = (
  id: string,
  patch: Partial<MaterialItem>,
): Promise<MaterialItem | null> => repo.update(id, patch);

export const deleteMaterial = (id: string): Promise<void> => repo.remove(id);
