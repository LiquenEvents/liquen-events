import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

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
  persist(id: string, merged: T): Promise<void>;
  remove(id: string): Promise<void>;
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

  private map = (r: unknown) => this.m.fromRow(r as Record<string, unknown>);

  async list(): Promise<T[]> {
    const base = this.sb.from(this.m.table).select(this.cols);
    const q = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []).map(this.map);
  }

  async get(id: string): Promise<T | null> {
    const { data, error } = await this.sb
      .from(this.m.table)
      .select(this.cols)
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    return data ? this.map(data) : null;
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

  async persist(id: string, merged: T): Promise<void> {
    const row = this.m.toRow(merged);
    if (this.m.touch) row.updated_at = new Date().toISOString();
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

  constructor(
    private readonly m: Mapper<T>,
    baseDir: string,
  ) {
    this.file = path.join(baseDir, m.fileName);
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
    const all = await this.read();
    all.push(entity);
    await this.write(all);
  }

  async persist(id: string, merged: T): Promise<void> {
    const all = await this.read();
    const idx = all.findIndex((e) => this.m.getId(e) === id);
    if (idx === -1) return;
    all[idx] = merged;
    await this.write(all);
  }

  async remove(id: string): Promise<void> {
    const all = await this.read();
    await this.write(all.filter((e) => this.m.getId(e) !== id));
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
  async update(id: string, updates: Partial<T>): Promise<T | null> {
    const backend = this.getBackend();
    const current = await backend.get(id);
    if (!current) return null;
    let merged = { ...current, ...updates } as T;
    if (this.mapper.beforeUpdate) merged = this.mapper.beforeUpdate(merged);
    await backend.persist(id, merged);
    return merged;
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
