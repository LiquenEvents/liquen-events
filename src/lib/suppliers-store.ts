import { randomUUID } from "node:crypto";
import type { Supplier } from "@/lib/orcamento/types";
import { createRepository, type Mapper } from "./repository";

export const mapper: Mapper<Supplier> = {
  table: "suppliers",
  fileName: "suppliers.json",
  getId: (s) => s.id,
  toRow: (s) => ({
    id: s.id,
    name: s.name,
    category: s.category,
    email: s.email || null,
    phone: s.phone || null,
    location: s.location || null,
    notes: s.notes || null,
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    category: String(r.category ?? "Outro"),
    email: (r.email as string) ?? undefined,
    phone: (r.phone as string) ?? undefined,
    location: (r.location as string) ?? undefined,
    notes: (r.notes as string) ?? undefined,
    createdAt: String(r.created_at ?? new Date().toISOString()),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
};

const repo = createRepository(mapper);

export const listSuppliers = (): Promise<Supplier[]> => repo.list();

export async function createSupplier(input: Omit<Supplier, "id" | "createdAt">): Promise<Supplier> {
  const supplier: Supplier = { ...input, id: randomUUID(), createdAt: new Date().toISOString() };
  await repo.create(supplier);
  return supplier;
}

export const updateSupplier = (id: string, updates: Partial<Supplier>): Promise<Supplier | null> =>
  repo.update(id, updates);

export const deleteSupplier = (id: string): Promise<void> => repo.remove(id);
