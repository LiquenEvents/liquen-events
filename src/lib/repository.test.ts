import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  Repository,
  FileBackend,
  SupabaseBackend,
  ConflictError,
  type Mapper,
  type Backend,
} from "./repository";

// A self-contained entity to exercise the generic machinery.
interface Widget {
  id: string;
  name: string;
  qty: number;
  createdAt: string;
  updatedAt?: string;
}

const widgetMapper: Mapper<Widget> = {
  table: "widgets",
  fileName: "widgets.json",
  getId: (w) => w.id,
  toRow: (w) => ({ id: w.id, name: w.name, qty: w.qty }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    qty: Number(r.qty ?? 0),
    createdAt: String(r.created_at ?? "2026-01-01T00:00:00.000Z"),
  }),
  order: { column: "name", ascending: true },
  fileCompare: (a, b) => a.name.localeCompare(b.name),
  touch: true,
  beforeUpdate: (w) => ({ ...w, updatedAt: "touched" }),
};

const widget = (over: Partial<Widget> = {}): Widget => ({
  id: "w1",
  name: "Alpha",
  qty: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

// ── Shared CRUD contract, run against both backends ───────────────────────
function crudSuite(name: string, makeRepo: () => Promise<Repository<Widget>> | Repository<Widget>) {
  describe(`Repository over ${name}`, () => {
    let repo: Repository<Widget>;
    beforeEach(async () => {
      repo = await makeRepo();
    });

    it("creates and reads back an entity", async () => {
      await repo.create(widget({ id: "w1", name: "Alpha", qty: 3 }));
      const got = await repo.get("w1");
      expect(got?.name).toBe("Alpha");
      expect(got?.qty).toBe(3);
    });

    it("returns null for a missing id", async () => {
      expect(await repo.get("nope")).toBeNull();
    });

    it("lists entities in the configured order", async () => {
      await repo.create(widget({ id: "b", name: "Charlie" }));
      await repo.create(widget({ id: "a", name: "Alpha" }));
      await repo.create(widget({ id: "c", name: "Bravo" }));
      const names = (await repo.list()).map((w) => w.name);
      expect(names).toEqual(["Alpha", "Bravo", "Charlie"]);
    });

    it("merges updates and applies beforeUpdate", async () => {
      await repo.create(widget({ id: "w1", name: "Alpha", qty: 1 }));
      const updated = await repo.update("w1", { qty: 9 });
      expect(updated).toMatchObject({ id: "w1", name: "Alpha", qty: 9, updatedAt: "touched" });
      const reread = await repo.get("w1");
      expect(reread?.qty).toBe(9);
    });

    it("returns null when updating a missing entity", async () => {
      expect(await repo.update("ghost", { qty: 5 })).toBeNull();
    });

    it("filters with where()", async () => {
      await repo.create(widget({ id: "a", name: "Alpha", qty: 1 }));
      await repo.create(widget({ id: "b", name: "Bravo", qty: 2 }));
      const res = await repo.where("qty", 2, (w) => w.qty === 2);
      expect(res.map((w) => w.id)).toEqual(["b"]);
    });

    it("removes an entity", async () => {
      await repo.create(widget({ id: "w1" }));
      await repo.remove("w1");
      expect(await repo.get("w1")).toBeNull();
    });
  });
}

// File backend — real temp directory.
let tmpDir: string;
crudSuite("FileBackend", async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "repo-test-"));
  return new Repository<Widget>(widgetMapper, () => new FileBackend<Widget>(widgetMapper, tmpDir));
});
afterEach(async () => {
  if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
});

// ── Minimal in-memory fake of the Supabase client ─────────────────────────
function createFakeSupabase() {
  const store = new Map<string, Record<string, unknown>[]>();

  // A structural thenable: `await` only needs a `then` method, no interface.
  class Query {
    private op: "select" | "insert" | "update" | "delete" = "select";
    private payload: Record<string, unknown> | null = null;
    private filters: [string, unknown, "eq" | "is"][] = [];
    private single = false;
    private returning = false;
    private orderBy: { col: string; asc: boolean } | null = null;
    private lim: number | null = null;
    constructor(private table: string) {}

    select() {
      // After update/insert, .select() means "return the affected rows"
      // (PostgREST returning), not a new select operation.
      if (this.op !== "select") this.returning = true;
      return this;
    }
    insert(row: Record<string, unknown>) {
      this.op = "insert";
      this.payload = row;
      return this;
    }
    update(row: Record<string, unknown>) {
      this.op = "update";
      this.payload = row;
      return this;
    }
    delete() {
      this.op = "delete";
      return this;
    }
    eq(col: string, val: unknown) {
      this.filters.push([col, val, "eq"]);
      return this;
    }
    is(col: string, val: unknown) {
      this.filters.push([col, val, "is"]);
      return this;
    }
    order(col: string, opts: { ascending: boolean }) {
      this.orderBy = { col, asc: opts.ascending };
      return this;
    }
    limit(n: number) {
      this.lim = n;
      return this;
    }
    maybeSingle() {
      this.single = true;
      return this;
    }

    private rows() {
      return store.get(this.table) ?? [];
    }
    private matches(r: Record<string, unknown>) {
      // `is` compares SQL-style null (JS null OR missing column).
      return this.filters.every(([c, v, op]) => (op === "is" ? (r[c] ?? null) === v : r[c] === v));
    }
    private exec() {
      if (this.op === "insert") {
        const row = { created_at: new Date().toISOString(), ...this.payload };
        store.set(this.table, [...this.rows(), row]);
        return { data: null, error: null };
      }
      if (this.op === "update") {
        const hit: Record<string, unknown>[] = [];
        for (const r of this.rows())
          if (this.matches(r)) {
            Object.assign(r, this.payload);
            hit.push(r);
          }
        return { data: this.returning ? hit : null, error: null };
      }
      if (this.op === "delete") {
        store.set(
          this.table,
          this.rows().filter((r) => !this.matches(r)),
        );
        return { data: null, error: null };
      }
      // select
      let rows = this.rows().filter((r) => this.matches(r));
      if (this.orderBy) {
        const { col, asc } = this.orderBy;
        rows = [...rows].sort(
          (a, b) => String(a[col]).localeCompare(String(b[col])) * (asc ? 1 : -1),
        );
      }
      if (this.single) return { data: rows[0] ?? null, error: null };
      if (this.lim !== null) rows = rows.slice(0, this.lim);
      return { data: rows, error: null };
    }

    then<R>(onF: (v: { data: unknown; error: null }) => R): Promise<R> {
      return Promise.resolve(this.exec()).then(onF);
    }
  }

  return { from: (table: string) => new Query(table) } as unknown as SupabaseClient;
}

crudSuite("SupabaseBackend (fake client)", () => {
  const sb = createFakeSupabase();
  return new Repository<Widget>(widgetMapper, () => new SupabaseBackend<Widget>(widgetMapper, sb));
});

// Backend interface conformance is what the suite proves; this references the
// type so an accidental signature drift would fail to compile.
const _conformance: (b: Backend<Widget>) => void = () => {};
void _conformance;

// ── Optimistic locking (CAS on updated_at, Supabase backend) ───────────────
describe("optimistic locking", () => {
  it("persist throws ConflictError when the row changed since the read", async () => {
    const sb = createFakeSupabase();
    const backend = new SupabaseBackend<Widget>(widgetMapper, sb);
    await backend.insert(widget({ id: "w1", qty: 1 }));

    const stale = await backend.get("w1");
    // A concurrent writer lands first (bumps updated_at)…
    const fresh = await backend.get("w1");
    await backend.persist("w1", widget({ id: "w1", qty: 2 }), fresh!);
    // …so persisting on top of the stale read must refuse to clobber it.
    await expect(
      backend.persist("w1", widget({ id: "w1", qty: 3 }), stale!),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it("updateWith retries after a mid-flight concurrent write and reapplies mutate on the fresh state", async () => {
    const sb = createFakeSupabase();
    const real = new SupabaseBackend<Widget>(widgetMapper, sb);
    const interloper = new SupabaseBackend<Widget>(widgetMapper, sb);
    await real.insert(widget({ id: "w1", name: "Alpha", qty: 1 }));

    // Wrap the backend so a concurrent write sneaks in between updateWith's
    // read and its first persist — the classic lost-update window.
    let injected = false;
    const wrapped: Backend<Widget> = {
      list: () => real.list(),
      get: (id) => real.get(id),
      query: (c, v, p) => (real as Backend<Widget>).query(c, v, p),
      insert: (e) => real.insert(e),
      remove: (id) => real.remove(id),
      persist: async (id, merged, cas) => {
        if (!injected) {
          injected = true;
          const cur = await interloper.get(id);
          await interloper.persist(id, { ...cur!, name: "Interloped" }, cur!);
        }
        return real.persist(id, merged, cas);
      },
    };

    const repo = new Repository<Widget>(widgetMapper, () => wrapped);
    const result = await repo.updateWith("w1", (c) => ({ ...c, qty: c.qty + 1 }));

    // The mutate was reapplied on the post-conflict state: both the concurrent
    // name change AND the increment survive — nothing was lost.
    expect(result).toMatchObject({ name: "Interloped", qty: 2 });
    const reread = await real.get("w1");
    expect(reread).toMatchObject({ name: "Interloped", qty: 2 });
  });
});

// ── Per-store mapper round-trips (camelCase ↔ snake_case) ─────────────────
describe("store mappers round-trip through toRow → DB → fromRow", () => {
  it("tasks", async () => {
    const { mapper } = await import("./tasks-store");
    const row = {
      ...mapper.toRow({
        id: "t1",
        title: "Ligar ao cliente",
        done: false,
        priority: "alta",
        dueDate: "2026-06-01",
        quoteId: "Q1",
        clientName: "Ana",
        assignee: "Rui",
        area: "comercial",
        createdAt: "2026-01-01T00:00:00.000Z",
      } as any),
      created_at: "2026-01-01T00:00:00.000Z",
    };
    expect(mapper.fromRow(row)).toEqual({
      id: "t1",
      title: "Ligar ao cliente",
      done: false,
      priority: "alta",
      dueDate: "2026-06-01",
      quoteId: "Q1",
      clientName: "Ana",
      assignee: "Rui",
      area: "comercial",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
  });

  it("suppliers", async () => {
    const { mapper } = await import("./suppliers-store");
    const supplier = {
      id: "s1",
      name: "Floristaria",
      category: "Flores",
      email: "f@x.pt",
      phone: "910000000",
      location: "Lisboa",
      notes: "Rápidos",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const row = { ...mapper.toRow(supplier as any), created_at: supplier.createdAt };
    expect(mapper.fromRow(row)).toEqual(supplier);
  });

  it("calendar events", async () => {
    const { mapper } = await import("./calendar-store");
    const event = {
      id: "c1",
      date: "2026-07-04",
      title: "Casamento",
      kind: "evento" as const,
      time: "16:00",
      note: "Quinta",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const row = { ...mapper.toRow(event as any), created_at: event.createdAt };
    expect(mapper.fromRow(row)).toEqual(event);
  });

  it("quotes (jsonb blob)", async () => {
    const { mapper } = await import("./quotes-store");
    const quote = { id: "Q1", status: "pendente", name: "Ana", email: "a@x.pt" } as any;
    const row = mapper.toRow(quote);
    expect(row).toMatchObject({ id: "Q1", status: "pendente", name: "Ana", email: "a@x.pt" });
    expect(mapper.fromRow(row)).toEqual(quote);
  });
});
