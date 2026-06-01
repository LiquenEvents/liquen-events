import { promises as fs } from "fs";
import path from "path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabase } from "./supabase";

export interface Mapper<T> {
  table: string;
  fileName: string;
  getId(entity: T): string;
  toRow(entity: T): Record<string, unknown>;
  fromRow(row: Record<string, unknown>): T;
  selectColumns?: string;
  order?: { column: string; ascending: boolean };
  fileCompare?: (a: T, b: T) => number;
  touch?: boolean;
  beforeUpdate?: (merged: T) => T;
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
}

export interface Backend<T> {
  list(): Promise<T[]>;
  get(id: string): Promise<T | null>;
  query(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]>;
  insert(entity: T): Promise<void>;
  persist(id: string, merged: T): Promise<void>;
  remove(id: string): Promise<void>;
  listPaginated(limit: number, offset: number): Promise<PaginatedResult<T>>;
  listFiltered(
    column: string,
    value: unknown,
    predicate: (e: T) => boolean,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<T>>;
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

  async listPaginated(limit: number, offset: number): Promise<PaginatedResult<T>> {
    const base = this.sb.from(this.m.table).select(this.cols, { count: "exact" });
    const q = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) throw error;
    return { items: (data ?? []).map(this.map), total: count ?? 0 };
  }

  async listFiltered(
    column: string,
    value: unknown,
    _predicate: (e: T) => boolean,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<T>> {
    const base = this.sb.from(this.m.table).select(this.cols, { count: "exact" }).eq(column, value);
    const q = this.m.order
      ? base.order(this.m.order.column, { ascending: this.m.order.ascending })
      : base;
    const { data, error, count } = await q.range(offset, offset + limit - 1);
    if (error) throw error;
    return { items: (data ?? []).map(this.map), total: count ?? 0 };
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
    const tmp = `${this.file}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(rows, null, 2));
    await fs.rename(tmp, this.file);
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

  async listPaginated(limit: number, offset: number): Promise<PaginatedResult<T>> {
    const all = await this.list();
    return { items: all.slice(offset, offset + limit), total: all.length };
  }

  async listFiltered(
    _column: string,
    _value: unknown,
    predicate: (e: T) => boolean,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<T>> {
    const all = (await this.list()).filter(predicate);
    return { items: all.slice(offset, offset + limit), total: all.length };
  }
}

// ── Repository ─────────────────────────────────────────────────────────────
export class Repository<T> {
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

  where(column: string, value: unknown, predicate: (e: T) => boolean): Promise<T[]> {
    return this.getBackend().query(column, value, predicate);
  }

  paginate(limit: number, offset: number): Promise<PaginatedResult<T>> {
    return this.getBackend().listPaginated(limit, offset);
  }

  paginateWhere(
    column: string,
    value: unknown,
    predicate: (e: T) => boolean,
    limit: number,
    offset: number,
  ): Promise<PaginatedResult<T>> {
    return this.getBackend().listFiltered(column, value, predicate, limit, offset);
  }

  create(entity: T): Promise<void> {
    return this.getBackend().insert(entity);
  }

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

export function createRepository<T>(mapper: Mapper<T>): Repository<T> {
  const baseDir = path.join(process.cwd(), "data");
  return new Repository<T>(mapper, () => {
    const sb = getSupabase();
    return sb ? new SupabaseBackend<T>(mapper, sb) : new FileBackend<T>(mapper, baseDir);
  });
}
