/**
 * Named event/collection rules — the SINGLE source of truth for "which shoot
 * does this file belong to". Both the gallery runtime (captions + per-photo alt
 * text) and the `gallery:sync` tooling read this same table, so registering a
 * new couple is a one-line edit to collections.json and nothing drifts.
 *
 * Each rule: a display `name`, the default event `label` (category) for the
 * shoot, and `match` — lowercase filename substrings that identify it.
 */
import rulesJson from "./collections.json";

export interface CollectionRule {
  name: string;
  label: string;
  match: string[];
}

export const COLLECTION_RULES: CollectionRule[] = rulesJson as CollectionRule[];

/**
 * Human-readable collection (event) inferred from the file name — adds a
 * curated, gallery-grade caption. Only confident matches; otherwise null.
 */
export function collectionFor(src: string): string | null {
  const f = src.toLowerCase();
  for (const rule of COLLECTION_RULES) {
    if (rule.match.some((m) => f.includes(m.toLowerCase()))) return rule.name;
  }
  return null;
}
