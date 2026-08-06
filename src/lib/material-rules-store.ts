import "server-only";
import { randomUUID } from "node:crypto";
import { createRepository, type Mapper } from "./repository";
import type { MaterialRule, MatchKind, RuleAction } from "./material-rules";

/** As regras editáveis que ligam a proposta ao material. */
export type { MaterialRule } from "./material-rules";

function numOrUndef(v: unknown): number | undefined {
  if (v === null || v === undefined) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.min(n, 1_000_000) : undefined;
}

export const mapper: Mapper<MaterialRule> = {
  table: "material_rules",
  fileName: "material-rules.json",
  getId: (r) => r.id,
  toRow: (r) => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    match_kind: r.matchKind,
    match_value: r.matchValue || null,
    action: r.action,
    list_id: r.listId || null,
    item_id: r.itemId || null,
    qty: typeof r.qty === "number" ? r.qty : null,
    qty_per_pax: typeof r.qtyPerPax === "number" ? r.qtyPerPax : null,
    position: r.position,
    updated_at: r.updatedAt || new Date().toISOString(),
  }),
  fromRow: (r) => ({
    id: String(r.id),
    name: String(r.name ?? ""),
    enabled: r.enabled !== false,
    matchKind: (r.match_kind as MatchKind) ?? "sempre",
    matchValue: (r.match_value as string) ?? undefined,
    action: (r.action as RuleAction) ?? "add_list",
    listId: (r.list_id as string) ?? undefined,
    itemId: (r.item_id as string) ?? undefined,
    qty: numOrUndef(r.qty),
    qtyPerPax: numOrUndef(r.qty_per_pax),
    position: Number(r.position) || 0,
    updatedAt: String(r.updated_at ?? new Date().toISOString()),
  }),
  order: { column: "position", ascending: true },
  fileCompare: (a, b) => a.position - b.position,
  touch: true,
  beforeUpdate: (r) => ({ ...r, updatedAt: new Date().toISOString() }),
};

const repo = createRepository(mapper);

export const listRules = (): Promise<MaterialRule[]> => repo.list();

export async function createRule(
  input: Omit<MaterialRule, "id" | "updatedAt"> & { id?: string },
): Promise<MaterialRule> {
  const r: MaterialRule = {
    ...input,
    id: input.id || randomUUID(),
    updatedAt: new Date().toISOString(),
  };
  await repo.create(r);
  return r;
}

export const updateRule = (
  id: string,
  patch: Partial<MaterialRule>,
): Promise<MaterialRule | null> => repo.update(id, patch);

export const deleteRule = (id: string): Promise<void> => repo.remove(id);
