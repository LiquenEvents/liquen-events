import "server-only";
import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";
import { log } from "./logger";

// NOTE: `list()` is intentionally UNBOUNDED by default. A blanket row cap was
// tried but reverted: consumers like the "full backup" export, the admin stats
// pipeline, and the daily digest expect the COMPLETE table, and an ascending-
// ordered table (the calendar) would drop the most-recent/upcoming rows first —
// both are silent data loss the operator can't see. A cap only makes sense with
// real pagination. A per-entity `Mapper.listLimit` opt-in remains for a future
// bounded/paginated reader; when set, hitting it logs a warning (never silent).

/**
 * Unified data-access layer.
 *
 * Every entity is persisted through a single `Repository<T>` that hides the
 * "Supabase when configured, else a local JSON file (dev)" decision and the
 * CRUD plumbing that used to be copy-pasted into each store. The only
 * per-entity logic lives in a small `Mapper<T>`:
 *
 *   - toRow / fromRow  translate between the camelCase domain object and the
 *     snake_case database row (the bug-prone part — unit tested per store).
 *   - order / fileCompare  keep Supabase and the file fallback sorted alike.
 *
 * The Supabase backend handles the database row shape; the file backend stores
 * domain objects verbatim. Both satisfy the same `Backend<T>` contract, so the
 * Repository (and the update read-merge-write) is written and tested once.
 */
export interface Mapper<T> {
  /** Supabase table name. */
  table: string;
  /** JSON file name under data/ for the dev fallback. */
  fileName: string;
  /** Stable identity of an entity. */
  getId(entity: T): string;
  /** Domain object → database row (snake_case columns). */
  toRow(entity: T): Record<string, unknown>;
  /** Database row → domain object. */
  fromRow(row: Record<string, unknown>): T;
  /** Columns to select; defaults to "*". Use "data" for jsonb-blob tables. */
  selectColumns?: string;
  /** Default ordering applied to lists. */
  order?: { column: string; ascending: boolean };
  /** Upper bound on an unpaginated `list()` read (defaults to DEFAULT_LIST_LIMIT). */
  listLimit?: number;
  /** Comparator mirroring `order` for the file backend. */
  fileCompare?: (a: T, b: T) => number;
  /** Set updated_at on Supabase updates (table must have the column). */
  touch?: boolean;
  /** Adjust a merged entity before an update is persisted (e.g. timestamps). */
  beforeUpdate?: (merged: T) => T;
}

/** Storage contract shared by the Supabase and file backends. */
export interface Backend<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  query(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]>;
  insert(entity: T): Promise<void>;
  /**
   * Write `merged` over the stored entity. When `cas` (the entity previously
   * returned by `get` on this same backend instance) is provided and the
   * backend can tell the row changed since that read, it throws ConflictError
   * instead of clobbering the concurrent write (optimistic locking).
   */
  persist(id: string, merged: T, cas?: T): Promise<void>;
  remove(id: string): Promise<void>;
}

/** A concurrent write happened between read and write; the caller should re-read and retry. */
export class ConflictError extends Error {
  constructor(id: string) {
    super(`Concurrent update on "${id}" — stale read`);
    this.name = "ConflictError";
  }
}

// ── Supabase backend ──────────────────────────────────────────────────────
export class SupabaseBackend<T> implements Backend<T> {
  constructor(
    private readonly m: Mapper<T>,
    private readonly sb: SupabaseClient,
  ) {}

  private get cols() {
    return this.m.selectColumns ?? "*";
  }

  /** For `touch` tables, `get` also selects updated_at so persist can CAS on it. */
  private get colsWithStamp() {
    if (!this.m.touch || this.cols === "*") return this.cols;
    return `${this.cols}, updated_at`;
  }

  // updated_at as of the read, keyed by the entity object `get` returned.
  // WeakMap: entries vanish with the entities, nothing to clean up.
  private stamps = new WeakMap<object, string | null>();

  private map = (r: unknown) => this.m.fromRow(r as Record<string, unknown>);

  async list(): Promise<T[]> {
    const limit = this.m.listLimit; // undefined ⇒ fetch everything (no cap)
    const base = this.sb.from(this.m.table).select(this.cols);
    const ordered = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error } = await (limit != null ? ordered.limit(limit) : ordered);
    if (error) throw error;
    const rows = data ?? [];
    // Only an EXPLICIT opt-in limit can truncate — and never silently: a full
    // page is the signal that real pagination is needed.
    if (limit != null && rows.length >= limit) {
      log.warn("list() hit the configured row cap — results may be truncated", {
        table: this.m.table,
        limit,
      });
    }
    return rows.map(this.map);
  }

  async get(id: string): Promise<T | null> {
    const { data, error } = await this.sb
      .from(this.m.table)
      .select(this.colsWithStamp)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const entity = this.map(data);
    if (this.m.touch && entity && typeof entity === "object") {
      const stamp = (data as unknown as Record<string, unknown>).updated_at;
      this.stamps.set(entity as object, typeof stamp === "string" ? stamp : null);
    }
    return entity;
  }

  async query(column: string, value: unknown): Promise<T[]> {
    const base = this.sb.from(this.m.table).select(this.cols).eq(column, value);
    const q = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(this.map);
  }

  async insert(entity: T): Promise<void> {
    const { error } = await this.sb.from(this.m.table).insert(this.m.toRow(entity));
    if (error) throw error;
  }

  async persist(id: string, merged: T, cas?: T): Promise<void> {
    const row = this.m.toRow(merged);
    if (this.m.touch) row.updated_at = new Date().toISOString();

    // Optimistic locking: only write if the row still carries the updated_at
    // we read. Zero rows updated ⇒ someone else wrote in between ⇒ conflict.
    const stamp = cas && typeof cas === "object" ? this.stamps.get(cas as object) : undefined;
    if (stamp !== undefined) {
      const base = this.sb.from(this.m.table).update(row).eq("id", id);
      const guarded = stamp === null ? base.is("updated_at", null) : base.eq("updated_at", stamp);
      const { data, error } = await guarded.select("id");
      if (error) throw error;
      if (!data?.length) throw new ConflictError(id);
      return;
    }

    const { error } = await this.sb.from(this.m.table).update(row).eq("id", id);
    if (error) throw error;
  }

  async remove(id: string): Promise<void> {
    const { error } = await this.sb.from(this.m.table).delete().eq("id", id);
    if (error) throw error;
  }
}

// ── File backend (dev fallback) ───────────────────────────────────────────
export class FileBackend<T> implements Backend<T> {
  private readonly file: string;
  // Serialize mutating ops: each does read → modify → write with an `await` in the
  // middle, so two concurrent inserts would both read the pre-write array and the
  // second write would clobber the first (lost update). Chaining them through this
  // tail makes read-modify-write atomic within the process.
  private tail: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly m: Mapper<T>,
    baseDir: string,
  ) {
    this.file = path.join(baseDir, m.fileName);
  }

  private serialize<R>(fn: () => Promise<R>): Promise<R> {
    const run = this.tail.then(fn, fn);
    this.tail = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  private async read(): Promise<T[]> {
    try {
      return JSON.parse(await fs.readFile(this.file, "utf-8")) as T[];
    } catch {
      return [];
    }
  }

  private async write(rows: T[]): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(this.file, JSON.stringify(rows, null, 2));
  }

  async list(): Promise<T[]> {
    const all = await this.read();
    return this.m.fileCompare ? [...all].sort(this.m.fileCompare) : all;
  }

  async get(id: string): Promise<T | null> {
    return (await this.read()).find((e) => this.m.getId(e) === id) ?? null;
  }

  async query(_column: string, _value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    const all = await this.list();
    return all.filter(predicate);
  }

  async insert(entity: T): Promise<void> {
    return this.serialize(async () => {
      const all = await this.read();
      all.push(entity);
      await this.write(all);
    });
  }

  async persist(id: string, merged: T): Promise<void> {
    return this.serialize(async () => {
      const all = await this.read();
      const idx = all.findIndex((e) => this.m.getId(e) === id);
      if (idx === -1) return;
      all[idx] = merged;
      await this.write(all);
    });
  }

  async remove(id: string): Promise<void> {
    return this.serialize(async () => {
      const all = await this.read();
      await this.write(all.filter((e) => this.m.getId(e) !== id));
    });
  }
}

// ── Repository ─────────────────────────────────────────────────────────────
export class Repository<T> {
  /** `getBackend` is a thunk so backend selection stays lazy (per call), matching the previous getSupabase()-per-method behaviour. */
  constructor(
    private readonly mapper: Mapper<T>,
    private readonly getBackend: () => Backend<T>,
  ) {}

  list(): Promise<T[]> {
    return this.getBackend().list();
  }

  get(id: string): Promise<T | null> {
    return this.getBackend().get(id);
  }

  /** Filtered list. `column` is the snake_case DB column; `predicate` is the equivalent for the file backend. */
  where(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    return this.getBackend().query(column, value, predicate);
  }

  create(entity: T): Promise<void> {
    return this.getBackend().insert(entity);
  }

  /** Read-merge-write update. Returns the merged entity, or null if not found. */
  update(id: string, updates: Partial<T>): Promise<T | null> {
    return this.updateWith(id, (current) => ({ ...current, ...updates }) as T);
  }

  /**
   * Read-mutate-write update with optimistic locking. `mutate` derives the new
   * entity from the freshly-read current one (the right tool for appends —
   * activity log, payments — where spreading a stale copy would drop a
   * concurrent write). On conflict the read+mutate is retried, so the change
   * is always applied on top of the latest state.
   */
  async updateWith(id: string, mutate: (current: T) => T): Promise<T | null> {
    const backend = this.getBackend();
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; ; attempt++) {
      const current = await backend.get(id);
      if (!current) return null;
      let merged = mutate(current);
      if (this.mapper.beforeUpdate) merged = this.mapper.beforeUpdate(merged);
      try {
        await backend.persist(id, merged, current);
        return merged;
      } catch (err) {
        if (!(err instanceof ConflictError) || attempt >= MAX_ATTEMPTS) throw err;
      }
    }
  }

  remove(id: string): Promise<void> {
    return this.getBackend().remove(id);
  }
}

/** Build a repository that targets Supabase when configured, else the dev file. */
export function createRepository<T>(mapper: Mapper<T>): Repository<T> {
  const baseDir = path.join(process.cwd(), "data");
  return new Repository<T>(mapper, () => {
    const sb = getSupabase();
    return sb ? new SupabaseBackend<T>(mapper, sb) : new FileBackend<T>(mapper, baseDir);
  });
}
