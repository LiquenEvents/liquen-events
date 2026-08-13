import { describe, it, expect, vi, beforeEach } from "vitest";
import { promises as fs } from "fs";
import path from "path";
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

  /**
   * ════════════════════════════════════════════════════════════════════════
   * AS ESTRELAS E O «PREFERIDO» TÊM DE CHEGAR À BASE DE DADOS
   * ════════════════════════════════════════════════════════════════════════
   *
   * Aqui esteve um teste a prender a OMISSÃO destes dois campos, com a lacuna
   * do schema escrita como se fosse uma decisão. Não era: o tipo `Supplier`, a
   * rota PATCH e o `supplierUpdateSchema` aceitavam-nos, o ecrã de Fornecedores
   * ordena e filtra por eles — e o mapper deitava-os fora ao gravar.
   *
   * Em desenvolvimento (backend de ficheiro, que guarda o objecto tal e qual)
   * nunca se via. Com Supabase, avaliar uma florista com 5 estrelas respondia
   * 200, pintava as estrelas, e no recarregamento seguinte elas tinham
   * desaparecido — sem erro nenhum, que é a pior maneira de perder trabalho.
   *
   * A correcção são as duas metades juntas: a coluna em `db/schema.sql` e a
   * projecção aqui. Os dois testes abaixo prendem uma metade cada.
   */
  it("projecta rating/preferred na linha da base de dados", () => {
    const row = mapper.toRow({
      id: "s4",
      name: "Preferido",
      category: "Flores",
      createdAt: "2026-01-01T00:00:00.000Z",
      rating: 5,
      preferred: true,
    });
    expect(row.rating).toBe(5);
    expect(row.preferred).toBe(true);

    const back = mapper.fromRow({ ...row, created_at: "2026-01-01T00:00:00.000Z" });
    expect(back.rating).toBe(5);
    expect(back.preferred).toBe(true);
  });

  it("sem avaliação grava nulo e lê-se como indefinido (não como zero estrelas)", () => {
    const row = mapper.toRow({
      id: "s5",
      name: "Por avaliar",
      category: "Flores",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row.rating).toBeNull();
    expect(row.preferred).toBe(false);

    const back = mapper.fromRow({ ...row, created_at: "2026-01-01T00:00:00.000Z" });
    expect(back.rating).toBeUndefined();
    expect(back.preferred).toBeFalsy();
  });

  it("tirar a avaliação (null vindo da rota) apaga-a em vez de a manter", () => {
    const row = mapper.toRow({
      id: "s6",
      name: "Desavaliado",
      category: "Flores",
      createdAt: "2026-01-01T00:00:00.000Z",
      rating: undefined,
      preferred: false,
    });
    expect(row.rating).toBeNull();
    expect(row.preferred).toBe(false);
  });
});

// ── A outra metade: a coluna existe mesmo em db/schema.sql ────────────────
// Projectar uma coluna que a base não tem não é meia funcionalidade: faz TODAS
// as escritas da tabela falharem com `column ... does not exist`. Este teste lê
// o ficheiro a sério, como o `bloqueio-optimista.test.ts` faz para o
// `updated_at`, e prende a coluna a quem a escreve.
describe("db/schema.sql garante as colunas que o mapper de fornecedores escreve", () => {
  it.each(["rating", "preferred"])("coluna %s", async (coluna) => {
    const sql = await fs.readFile(path.join(process.cwd(), "db", "schema.sql"), "utf-8");

    // Ou a coluna nasce com a tabela…
    const criacao = /create table if not exists public\.suppliers\s*\(([\s\S]*?)\n\);/i.exec(sql);
    const nasceCom = !!criacao && new RegExp(`\\b${coluna}\\b`).test(criacao[1]);
    // …ou chega por migração idempotente a uma instalação que já existia.
    const porMigracao = new RegExp(
      `alter table public\\.suppliers\\s+add column if not exists\\s+${coluna}\\b`,
      "i",
    ).test(sql);

    expect(
      nasceCom && porMigracao,
      `suppliers.${coluna} é gravado pelo mapper mas db/schema.sql não garante a coluna`,
    ).toBe(true);
  });
});
