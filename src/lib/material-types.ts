/**
 * Tipos e constantes do catálogo de material de LOGÍSTICA, seguros no cliente.
 *
 * Separados do `material-store` (que é `server-only` e puxa o repositório →
 * `fs`) para os componentes do back office poderem importar as categorias e o
 * tipo sem arrastar o servidor para o pacote do browser — o mesmo arranjo que
 * o `inventory-types` faz para os adereços.
 *
 * ── Isto NÃO é o inventário de adereços ───────────────────────────────────
 * `inventory-types.ts` guarda vasos, castiçais, têxteis, mobiliário: as coisas
 * que se veem no evento. Aqui está o que faz a montagem acontecer — escadote,
 * extensões, ferramentas, fita-cola, sacos do lixo. Os dois catálogos são
 * deliberadamente separados (MATERIAL.md §0.1).
 */

/**
 * O que decide o comportamento de um item em todo o módulo.
 *
 * `consumivel`   gasta-se: desconta do stock no regresso e, abaixo do mínimo,
 *                entra na lista de compras.
 * `reutilizavel` não se gasta, mas TEM de voltar. É o que a checklist de
 *                regresso controla, e o que não voltar fica marcado em falta
 *                com o evento e o espaço onde se perdeu.
 */
export type MaterialKind = "consumivel" | "reutilizavel";

export interface MaterialItem {
  id: string;
  name: string;
  category: string;
  kind: MaterialKind;
  /** Unidade de contagem. Livre — ver `MATERIAL_UNITS`. */
  unit?: string;
  /** Quanto existe. Decimal por causa dos metros e dos rolos. */
  stock: number;
  /** Abaixo disto entra na lista de compras. `undefined` = não vigiar. */
  minStock?: number;
  notes?: string;
  /** Caminho no Storage privado, quando há foto. */
  photoPath?: string;
  updatedAt: string;
}

/**
 * As sete categorias da logística.
 *
 * "Decoração" NÃO está aqui de propósito: é o outro catálogo. Pô-la nesta
 * lista era o primeiro passo para os dois inventários se sobreporem e a mesma
 * jarra passar a existir em ambos, com dois stocks e nenhum deles certo.
 */
export const MATERIAL_CATEGORIES: string[] = [
  "Ferramentas",
  "Consumíveis",
  "Estrutura",
  "Iluminação",
  "Limpeza",
  "Segurança",
  "Escritório",
];

/**
 * Unidades sugeridas. Sugeridas, não impostas: o campo aceita o que lá
 * escreverem, porque inventar uma unidade nova não pode obrigar a uma
 * alteração de esquema coordenada entre o formulário e o servidor.
 */
export const MATERIAL_UNITS: string[] = ["unidade", "metro", "rolo", "par", "caixa", "saco"];

export const MATERIAL_KIND_LABEL: Record<MaterialKind, string> = {
  consumivel: "Consumível",
  reutilizavel: "Reutilizável",
};

/** Está abaixo do mínimo? Sem mínimo definido, nunca está. */
export function abaixoDoMinimo(item: MaterialItem): boolean {
  return typeof item.minStock === "number" && item.stock < item.minStock;
}
