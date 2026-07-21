import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { Supplier } from "@/lib/orcamento/types";

/**
 * Store-level coverage for the suppliers catalog: CRUD through an in-memory
 * Repository fake plus the camelCase↔snake_case mapper (empty optionals →
 * undefined, category default, createdAt fallback).
 *
 * The Repository generic is proven in `repository.test.ts`; here we bind the
 * store's OWN mapper to a minimal fake so store logic (uuid + createdAt
 * assignment, delegation) is tested without disk or Supabase.
 */

const db = vi.hoisted(() => ({ rows: new Map<string, unknown>() }));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<Supplier>) => ({
    list: async () => [...db.rows.values()],
    get: async (id: string) => db.rows.get(id) ?? null,
    create: async (e: Supplier) => {
      db.rows.set(mapper.getId(e), e);
    },
    update: async (id: string, patch: Partial<Supplier>) => {
      const cur = db.rows.get(id) as Supplier | undefined;
      if (!cur) return null;
      let merged = { ...cur, ...patch } as Supplier;
      if (mapper.beforeUpdate) merged = mapper.beforeUpdate(merged);
      db.rows.set(id, merged);
      return merged;
    },
    remove: async (id: string) => {
      db.rows.delete(id);
    },
  }),
}));

import {
  mapper,
  createSupplier,
  listSuppliers,
  updateSupplier,
  deleteSupplier,
} from "./suppliers-store";

beforeEach(() => {
  db.rows.clear();
  vi.clearAllMocks();
});

const base = (over: Partial<Supplier> = {}): Omit<Supplier, "id" | "createdAt"> => ({
  name: "Floristaria",
  category: "Flores",
  email: "f@x.pt",
  phone: "910000000",
  location: "Lisboa",
  notes: "Rápidos",
  ...over,
});

describe("suppliers-store CRUD", () => {
  it("createSupplier assigns a uuid and a createdAt, and persists", async () => {
    const s = await createSupplier(base());
    expect(s.id).toMatch(/[0-9a-f-]{36}/);
    expect(s.createdAt).toBeTruthy();
    expect((await listSuppliers())[0]).toEqual(s);
  });

  it("createSupplier ignores any caller-supplied id (server-assigned only)", async () => {
    const s = await createSupplier({ ...base(), id: "evil" } as Omit<Supplier, "id" | "createdAt">);
    expect(s.id).not.toBe("evil");
  });

  it("updateSupplier merges the patch", async () => {
    const s = await createSupplier(base());
    const updated = await updateSupplier(s.id, { name: "Novo nome" });
    expect(updated?.name).toBe("Novo nome");
    expect(updated?.category).toBe("Flores");
  });

  it("updateSupplier returns null for a missing supplier", async () => {
    expect(await updateSupplier("ghost", { name: "x" })).toBeNull();
  });

  it("deleteSupplier removes the supplier", async () => {
    const s = await createSupplier(base());
    await deleteSupplier(s.id);
    expect(await listSuppliers()).toHaveLength(0);
  });
});

describe("suppliers mapper (camelCase ↔ snake_case)", () => {
  it("round-trips a fully-populated supplier", () => {
    const supplier: Supplier = {
      id: "s1",
      name: "Floristaria",
      category: "Flores",
      email: "f@x.pt",
      phone: "910000000",
      location: "Lisboa",
      notes: "Rápidos",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const row = { ...mapper.toRow(supplier), created_at: supplier.createdAt };
    expect(mapper.fromRow(row)).toEqual(supplier);
  });

  it("empty optionals persist as null and read back as undefined (not '')", () => {
    const row = mapper.toRow({
      id: "s2",
      name: "Sem contactos",
      category: "Outro",
      email: "",
      phone: "",
      location: "",
      notes: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row.email).toBeNull();
    expect(row.phone).toBeNull();
    expect(row.location).toBeNull();
    expect(row.notes).toBeNull();
    const back = mapper.fromRow({ ...row, created_at: "2026-01-01T00:00:00.000Z" });
    expect(back.email).toBeUndefined();
    expect(back.phone).toBeUndefined();
    expect(back.location).toBeUndefined();
    expect(back.notes).toBeUndefined();
  });

  it("defaults name to '' and category to 'Outro' when the row is missing them", () => {
    const back = mapper.fromRow({ id: "s3" });
    expect(back.name).toBe("");
    expect(back.category).toBe("Outro");
    expect(back.createdAt).toBeTruthy();
  });

  // KNOWN SCHEMA GAP (documented, not a store bug): the `Supplier` type and the
  // fornecedores PATCH route accept `rating`/`preferred`, but the DB `suppliers`
  // table (db/schema.sql) has no such columns, so the mapper deliberately omits
  // them — adding them to toRow would make every Supabase insert fail on an
  // unknown column. This test pins that intentional omission so it can't drift
  // silently; wiring the feature requires a migration first.
  it("does not project rating/preferred onto the DB row (no column yet)", () => {
    const row = mapper.toRow({
      id: "s4",
      name: "Preferido",
      category: "Flores",
      createdAt: "2026-01-01T00:00:00.000Z",
      rating: 5,
      preferred: true,
    });
    expect(row).not.toHaveProperty("rating");
    expect(row).not.toHaveProperty("preferred");
  });
});
