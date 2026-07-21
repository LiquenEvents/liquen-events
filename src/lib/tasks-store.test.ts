import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mapper } from "./repository";
import type { Task } from "@/lib/orcamento/types";

/**
 * Store-level coverage for the tasks board: create/list/update/delete through an
 * in-memory Repository fake plus the camelCase↔snake_case mapper (empty optionals
 * → null → undefined, priority default, done coercion, createdAt fallback, and
 * the "created_at descending" ordering the file backend applies).
 *
 * The Repository generic (backends, read-merge-write, locking) is proven in
 * `repository.test.ts`; here we bind the store's OWN mapper to a faithful fake so
 * store logic (uuid + createdAt + done default, partial-update merge, delegation,
 * `fileCompare` ordering) is tested without disk or Supabase.
 */
const db = vi.hoisted(() => ({ rows: new Map<string, unknown>(), captured: null as unknown }));

vi.mock("./repository", () => ({
  createRepository: (mapper: Mapper<Task>) => {
    db.captured = mapper;
    return {
      list: async () => {
        const all = [...db.rows.values()] as Task[];
        return mapper.fileCompare ? [...all].sort(mapper.fileCompare) : all;
      },
      get: async (id: string) => db.rows.get(id) ?? null,
      create: async (e: Task) => {
        db.rows.set(mapper.getId(e), e);
      },
      // Mirrors Repository.update: read-merge-write, null when absent, no insert.
      update: async (id: string, patch: Partial<Task>) => {
        const cur = db.rows.get(id) as Task | undefined;
        if (!cur) return null;
        let merged = { ...cur, ...patch } as Task;
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

import { mapper, createTask, listTasks, updateTask, deleteTask } from "./tasks-store";

beforeEach(() => {
  db.rows.clear();
  vi.clearAllMocks();
});

const base = (
  over: Partial<Task> = {},
): Omit<Task, "id" | "createdAt" | "done"> & { done?: boolean } => ({
  title: "Confirmar catering",
  priority: "alta",
  dueDate: "2026-08-01",
  quoteId: "q1",
  clientName: "ACME",
  assignee: "Ana",
  area: "Produção",
  ...over,
});

const seed = (t: Task) => db.rows.set(t.id, t);
const task = (over: Partial<Task>): Task => ({
  id: "x",
  title: "t",
  done: false,
  priority: "normal",
  createdAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

describe("tasks-store create", () => {
  it("createTask assigns a uuid, a createdAt, defaults done to false, and persists", async () => {
    const t = await createTask(base());
    expect(t.id).toMatch(/[0-9a-f-]{36}/);
    expect(t.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(t.createdAt))).toBe(false);
    expect(t.done).toBe(false);
    expect((await listTasks())[0]).toEqual(t);
  });

  it("createTask honours an explicit done:true", async () => {
    const t = await createTask(base({ done: true }));
    expect(t.done).toBe(true);
  });

  it("createTask coerces nothing — a caller-supplied id is ignored (server uuid)", async () => {
    const t = await createTask({ ...base(), id: "evil", createdAt: "1999" } as unknown as Omit<
      Task,
      "id" | "createdAt" | "done"
    >);
    expect(t.id).not.toBe("evil");
    expect(t.createdAt).not.toBe("1999");
  });

  it("preserves every supplied field on the created task", async () => {
    const t = await createTask(base());
    expect(t).toMatchObject({
      title: "Confirmar catering",
      priority: "alta",
      dueDate: "2026-08-01",
      quoteId: "q1",
      clientName: "ACME",
      assignee: "Ana",
      area: "Produção",
    });
  });

  it("keeps optionals undefined when omitted (no phantom empties)", async () => {
    const t = await createTask({ title: "Só título", priority: "normal" });
    expect(t.dueDate).toBeUndefined();
    expect(t.quoteId).toBeUndefined();
    expect(t.clientName).toBeUndefined();
    expect(t.assignee).toBeUndefined();
    expect(t.area).toBeUndefined();
  });

  it("generates distinct ids across creates", async () => {
    const a = await createTask(base());
    const b = await createTask(base());
    expect(a.id).not.toBe(b.id);
  });
});

describe("tasks-store list", () => {
  it("listTasks on an empty store is [] (never null)", async () => {
    const list = await listTasks();
    expect(list).toEqual([]);
    expect(list).not.toBeNull();
  });

  it("orders by created_at descending (newest first) regardless of insertion order", async () => {
    seed(task({ id: "old", createdAt: "2026-01-01T00:00:00.000Z" }));
    seed(task({ id: "new", createdAt: "2026-12-31T00:00:00.000Z" }));
    seed(task({ id: "mid", createdAt: "2026-06-15T00:00:00.000Z" }));
    expect((await listTasks()).map((t) => t.id)).toEqual(["new", "mid", "old"]);
  });

  it("keeps insertion order for equal-createdAt ties (stable sort)", async () => {
    const stamp = "2026-05-05T12:00:00.000Z";
    seed(task({ id: "first", createdAt: stamp }));
    seed(task({ id: "second", createdAt: stamp }));
    seed(task({ id: "third", createdAt: stamp }));
    expect((await listTasks()).map((t) => t.id)).toEqual(["first", "second", "third"]);
  });

  it("orders sub-second-apart timestamps correctly (no truncation collision)", async () => {
    seed(task({ id: "a", createdAt: "2026-05-05T12:00:00.001Z" }));
    seed(task({ id: "b", createdAt: "2026-05-05T12:00:00.002Z" }));
    expect((await listTasks()).map((t) => t.id)).toEqual(["b", "a"]);
  });
});

describe("tasks-store update (partial merge)", () => {
  it("updateTask merges a patch without clobbering untouched fields", async () => {
    seed(task({ id: "t1", title: "Original", priority: "alta", assignee: "Ana", area: "X" }));
    const updated = await updateTask("t1", { title: "Novo" });
    expect(updated?.title).toBe("Novo");
    expect(updated?.priority).toBe("alta");
    expect(updated?.assignee).toBe("Ana");
    expect(updated?.area).toBe("X");
  });

  it("updateTask toggles done true→false→true", async () => {
    seed(task({ id: "t2", done: false }));
    expect((await updateTask("t2", { done: true }))?.done).toBe(true);
    expect((await updateTask("t2", { done: false }))?.done).toBe(false);
  });

  it("updateTask can change due date and priority", async () => {
    seed(task({ id: "t3", dueDate: "2026-01-01", priority: "baixa" }));
    const updated = await updateTask("t3", { dueDate: "2026-09-09", priority: "alta" });
    expect(updated?.dueDate).toBe("2026-09-09");
    expect(updated?.priority).toBe("alta");
  });

  it("updateTask on an unknown id returns null and never inserts a phantom row", async () => {
    expect(await updateTask("ghost", { done: true })).toBeNull();
    expect(await listTasks()).toHaveLength(0);
  });
});

describe("tasks-store delete", () => {
  it("deleteTask removes only the target row", async () => {
    seed(task({ id: "keep" }));
    seed(task({ id: "drop" }));
    await deleteTask("drop");
    expect((await listTasks()).map((t) => t.id)).toEqual(["keep"]);
  });

  it("deleteTask on an unknown id is a silent no-op (no throw)", async () => {
    seed(task({ id: "keep" }));
    await expect(deleteTask("ghost")).resolves.toBeUndefined();
    expect(await listTasks()).toHaveLength(1);
  });
});

describe("tasks mapper (camelCase ↔ snake_case)", () => {
  it("round-trips a fully-populated task", () => {
    const t: Task = {
      id: "t1",
      title: "Confirmar catering",
      done: true,
      priority: "alta",
      dueDate: "2026-08-01",
      quoteId: "q1",
      clientName: "ACME",
      assignee: "Ana",
      area: "Produção",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    // toRow deliberately omits created_at (DB-defaulted); inject it back.
    const row = { ...mapper.toRow(t), created_at: t.createdAt };
    expect(mapper.fromRow(row)).toEqual(t);
    expect(mapper.getId(t)).toBe("t1");
  });

  it("toRow does not project created_at (column is DB-defaulted, not written)", () => {
    const row = mapper.toRow(task({ id: "t2" }));
    expect(row).not.toHaveProperty("created_at");
  });

  it("empty optionals persist as null and read back as undefined (not '')", () => {
    const row = mapper.toRow({
      id: "t3",
      title: "Só título",
      done: false,
      priority: "normal",
      dueDate: "",
      quoteId: "",
      clientName: "",
      assignee: "",
      area: "",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(row.due_date).toBeNull();
    expect(row.quote_id).toBeNull();
    expect(row.client_name).toBeNull();
    expect(row.assignee).toBeNull();
    expect(row.area).toBeNull();
    const back = mapper.fromRow({ ...row, created_at: "2026-01-01T00:00:00.000Z" });
    expect(back.dueDate).toBeUndefined();
    expect(back.quoteId).toBeUndefined();
    expect(back.clientName).toBeUndefined();
    expect(back.assignee).toBeUndefined();
    expect(back.area).toBeUndefined();
  });

  it("reads null optional columns back as undefined", () => {
    const back = mapper.fromRow({
      id: "t4",
      title: "t",
      done: false,
      priority: "normal",
      due_date: null,
      quote_id: null,
      client_name: null,
      assignee: null,
      area: null,
      created_at: "2026-01-01T00:00:00.000Z",
    });
    expect(back.dueDate).toBeUndefined();
    expect(back.quoteId).toBeUndefined();
    expect(back.clientName).toBeUndefined();
    expect(back.assignee).toBeUndefined();
    expect(back.area).toBeUndefined();
  });

  it("defaults title to '' and priority to 'normal', with done false and a createdAt fallback", () => {
    const back = mapper.fromRow({ id: "t5" });
    expect(back.title).toBe("");
    expect(back.priority).toBe("normal");
    expect(back.done).toBe(false);
    expect(back.createdAt).toBeTruthy();
    expect(Number.isNaN(Date.parse(back.createdAt))).toBe(false);
  });

  it("coerces the done column with Boolean (round-trips both booleans)", () => {
    expect(mapper.fromRow({ id: "a", done: true }).done).toBe(true);
    expect(mapper.fromRow({ id: "b", done: false }).done).toBe(false);
    expect(mapper.fromRow({ id: "c" }).done).toBe(false);
    // toRow writes the raw boolean straight through.
    expect(mapper.toRow(task({ id: "d", done: true })).done).toBe(true);
  });

  it("coerces a non-string id/title to a string", () => {
    const back = mapper.fromRow({ id: 99, title: 5 });
    expect(back.id).toBe("99");
    expect(back.title).toBe("5");
  });

  // NEEDS DECISION (pinned): fromRow only nullish-coalesces `priority`, so an
  // unknown/garbage value passes THROUGH unchanged rather than snapping back to
  // "normal". A row written out-of-band (migration, future enum value) surfaces
  // verbatim; the API validates on write but the mapper does not sanitise reads.
  it("passes an unknown `priority` through unchanged (documents current behavior)", () => {
    const back = mapper.fromRow({ id: "t6", title: "t", priority: "SUPER-URGENT" });
    expect(back.priority).toBe("SUPER-URGENT");
  });
});
