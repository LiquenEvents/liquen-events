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
/**
 * A resposta é a mesma para o mesmo caminho, para sempre — e é pedida MUITO.
 *
 * MEDIDO a contar chamadas: cada mosaico da galeria pergunta três vezes (a
 * legenda, o texto alternativo e o rótulo do botão), portanto uma passagem
 * pelas 427 fotografias faz ~1281 chamadas, e cada uma faz um `toLowerCase()`
 * do caminho e até 13 `includes` sobre as 11 regras — perto de 17 000 testes de
 * substring, repetidos a cada render da grelha.
 *
 * Guardar a resposta é a coisa mais barata que há: as regras vêm de um JSON
 * estático (`collections.json`), portanto não há invalidação a fazer. O `Map`
 * vive no módulo de propósito — é partilhado pela galeria e pelo `gallery:sync`,
 * e nenhum dos dois quer pagar isto duas vezes.
 */
const cache = new Map<string, string | null>();

export function collectionFor(src: string): string | null {
  const guardado = cache.get(src);
  if (guardado !== undefined) return guardado;
  const f = src.toLowerCase();
  let nome: string | null = null;
  for (const rule of COLLECTION_RULES) {
    if (rule.match.some((m) => f.includes(m.toLowerCase()))) {
      nome = rule.name;
      break;
    }
  }
  cache.set(src, nome);
  return nome;
}
