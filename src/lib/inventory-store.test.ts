import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { PropItem } from "./inventory-types";

/**
 * Store-level coverage for the decor/prop inventory: CRUD round-trips through an
 * in-memory Repository fake, the camelCase↔snake_case mapper (empty optionals →
 * undefined, quantity coercion, category/condition defaults), and the
 * server-only write refusal (delegated to the shared Repository base, exercised
 * against the real `mapper` here via a faithful fake).
 *
 * The Repository generic (Supabase/file backends, optimistic locking) is proven
 * in `repository.test.ts`; here we bind the store's OWN mapper to a minimal
 * in-memory fake so store logic (id/timestamp assignment, delegation) is tested
 * without touching disk or Supabase.
 */

// A faithful-enough in-memory Repository: mirrors read-merge-write + beforeUpdate
// so `updateItem` bumping `updatedAt` is observable, without a real backend.
const db = vi.hoisted(() => ({ rows: new Map<string, unknown>(), captured: null as unknown }));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<PropItem>) => {
    db.captured = mapper;
    return {
      list: async () => [...db.rows.values()],
      get: async (id: string) => db.rows.get(id) ?? null,
      create: async (e: PropItem) => {
        db.rows.set(mapper.getId(e), e);
      },
      update: async (id: string, patch: Partial<PropItem>) => {
        const cur = db.rows.get(id) as PropItem | undefined;
        if (!cur) return null;
        let merged = { ...cur, ...patch } as PropItem;
        if (mapper.beforeUpdate) merged = mapper.beforeUpdate(merged);
        db.rows.set(id, merged);
        return merged;
      },
      remove: async (id: string) => {
        db.rows.delete(id);
      },
    };
  },
}));

import {
  mapper,
  createItem,
  getItem,
  listItems,
  updateItem,
  deleteItem,
  newItemId,
} from "./inventory-store";

beforeEach(() => {
  db.rows.clear();
  vi.clearAllMocks();
});

const base = (over: Partial<PropItem> = {}): Omit<PropItem, "id" | "updatedAt"> => ({
  name: "Vaso de vidro",
  category: "Vasos e Jarras",
  quantity: 12,
  unit: "un",
  condition: "bom",
  location: "Armazém A",
  notes: "Frágil",
  ...over,
});

describe("inventory-store CRUD", () => {
  it("createItem assigns an id and a server-managed updatedAt, and persists", async () => {
    const item = await createItem(base());
    expect(item.id).toMatch(/[0-9a-f-]{36}/);
    expect(item.updatedAt).toBeTruthy();
    expect(await getItem(item.id)).toEqual(item);
  });

  it("createItem honours a caller-supplied id but still stamps updatedAt", async () => {
    const item = await createItem({ ...base(), id: "fixed-id", updatedAt: "ignored" });
    expect(item.id).toBe("fixed-id");
    expect(item.updatedAt).not.toBe("ignored");
  });

  it("listItems returns everything created", async () => {
    await createItem(base({ name: "A" }));
    await createItem(base({ name: "B" }));
    expect(await listItems()).toHaveLength(2);
  });

  it("updateItem merges the patch and bumps updatedAt (beforeUpdate touch)", async () => {
    const item = await createItem({ ...base({ quantity: 5 }), id: "i1" });
    const before = item.updatedAt;
    await new Promise((r) => setTimeout(r, 2));
    const updated = await updateItem("i1", { quantity: 9 });
    expect(updated?.quantity).toBe(9);
    expect(updated?.name).toBe("Vaso de vidro");
    expect(updated?.updatedAt).not.toBe(before);
  });

  it("updateItem returns null for a missing item", async () => {
    expect(await updateItem("ghost", { quantity: 1 })).toBeNull();
  });

  it("deleteItem removes the item", async () => {
    await createItem({ ...base(), id: "i1" });
    await deleteItem("i1");
    expect(await getItem("i1")).toBeNull();
  });

  it("newItemId returns unique uuids", () => {
    expect(newItemId()).not.toBe(newItemId());
  });
});

describe("inventory mapper (camelCase ↔ snake_case)", () => {
  it("round-trips a fully-populated item", () => {
    const item: PropItem = {
      id: "it1",
      name: "Castiçal",
      category: "Castiçais e Velas",
      quantity: 4,
      unit: "un",
      condition: "novo",
      location: "Armazém B",
      notes: "Dourado",
      updatedAt: "2026-01-01T00:00:00.000Z",
    };
    expect(mapper.fromRow(mapper.toRow(item))).toEqual(item);
  });

  it("empty optionals persist as null and read back as undefined (not '')", () => {
    const row = mapper.toRow({
      id: "it2",
      name: "Item",
      category: "Outro",
      quantity: 0,
      unit: "",
      condition: "bom",
      location: "",
      notes: "",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row.unit).toBeNull();
    expect(row.location).toBeNull();
    expect(row.notes).toBeNull();
    const back = mapper.fromRow(row);
    expect(back.unit).toBeUndefined();
    expect(back.location).toBeUndefined();
    expect(back.notes).toBeUndefined();
  });

  it("coerces a string/undefined quantity to a Number, defaulting to 0", () => {
    expect(mapper.fromRow({ id: "x", name: "n", quantity: "15" }).quantity).toBe(15);
    expect(mapper.fromRow({ id: "x", name: "n" }).quantity).toBe(0);
  });

  it("defaults category to 'Outro' and condition to 'bom' when the row is missing them", () => {
    const back = mapper.fromRow({ id: "x", name: "n" });
    expect(back.category).toBe("Outro");
    expect(back.condition).toBe("bom");
  });

  it("toRow supplies updated_at when the entity lacks one (server-managed touch)", () => {
    const row = mapper.toRow({
      id: "x",
      name: "n",
      category: "Outro",
      quantity: 1,
      condition: "bom",
      updatedAt: "",
    } as PropItem);
    expect(typeof row.updated_at).toBe("string");
    expect(row.updated_at).not.toBe("");
  });
});
