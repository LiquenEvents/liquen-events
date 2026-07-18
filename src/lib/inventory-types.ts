/**
 * Client-safe inventory types + constants.
 *
 * Split out from `inventory-store.ts` so client components (e.g. the admin
 * Inventário view) can value-import `PROP_CATEGORIES` and the `PropItem` type
 * without pulling in the server-only store (which imports `repository` → `fs`
 * and would break the client bundle at build time).
 */

/** Condition of a physical prop / material. */
export type PropCondition = "novo" | "bom" | "usado" | "danificado";

export interface PropItem {
  id: string;
  name: string;
  category: string;
  quantity: number;
  unit?: string;
  condition: PropCondition;
  location?: string;
  notes?: string;
  updatedAt: string;
}

/** Decor-relevant categories (European Portuguese, AO90). */
export const PROP_CATEGORIES: string[] = [
  "Vasos e Jarras",
  "Castiçais e Velas",
  "Têxteis",
  "Mobiliário",
  "Iluminação",
  "Estruturas e Arcos",
  "Loiça e Copos",
  "Sinalética",
  "Outro",
];
