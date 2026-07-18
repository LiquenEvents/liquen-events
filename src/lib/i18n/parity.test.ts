import { describe, it, expect } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

/**
 * Paridade estrutural PT/EN. O tipo `Dict` já obriga o `en` a ter a mesma forma
 * do `pt` em compilação, mas o `tsc` não corre em runtime nem apanha desvios em
 * objetos indexados/alargados. Este teste percorre as duas árvores em
 * profundidade e falha, listando explicitamente, qualquer caminho de chave que
 * exista num dicionário mas não no outro (nos dois sentidos) — travando o drift
 * silencioso de chaves aninhadas antes de chegar ao ecrã.
 */

type Tree = Record<string, unknown>;

/** Recolhe todos os caminhos de chave ("a.b.c") das folhas e nós da árvore. */
function keyPaths(obj: unknown, prefix = ""): string[] {
  if (obj === null || typeof obj !== "object" || Array.isArray(obj)) return [];
  const out: string[] = [];
  for (const key of Object.keys(obj as Tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    out.push(path);
    out.push(...keyPaths((obj as Tree)[key], path));
  }
  return out;
}

describe("i18n PT/EN key parity", () => {
  const ptPaths = new Set(keyPaths(pt));
  const enPaths = new Set(keyPaths(en));

  it("has no keys present in PT but missing from EN", () => {
    const missingInEn = [...ptPaths].filter((p) => !enPaths.has(p)).sort();
    expect(missingInEn, `chaves em PT sem par em EN:\n${missingInEn.join("\n")}`).toEqual([]);
  });

  it("has no keys present in EN but missing from PT", () => {
    const missingInPt = [...enPaths].filter((p) => !ptPaths.has(p)).sort();
    expect(missingInPt, `chaves em EN sem par em PT:\n${missingInPt.join("\n")}`).toEqual([]);
  });
});
