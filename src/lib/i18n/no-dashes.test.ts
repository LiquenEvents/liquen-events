import { describe, it, expect } from "vitest";
import { pt } from "./pt";
import { en } from "./en";
import { SERVICES, getService } from "../services-data";
import { getLegal } from "@/app/[lang]/legal/legal-content";

/**
 * SEM TRAVESSÕES NO TEXTO DO SITE.
 *
 * A Catarina pediu que o site não usasse travessões (—) em texto nenhum. Eles
 * foram todos reescritos com vírgulas, dois pontos ou frases separadas, mas as
 * cópias crescem: um texto novo escrito com travessão passaria despercebido na
 * revisão e voltava a aparecer na página.
 *
 * Este teste percorre TODO o texto que alimenta o site — os dois dicionários,
 * as páginas de serviço e os documentos legais — e falha com o caminho exacto
 * da chave que traz o travessão, para não ser preciso procurá-lo.
 *
 * Só olha para texto de conteúdo. Comentários de código continuam livres de
 * usar travessões (é a pontuação natural deles e nunca chegam ao ecrã).
 */

/** Todos os textos de um objecto/lista, com o caminho até cada um. */
function walk(value: unknown, path: string, out: { path: string; text: string }[]): void {
  if (typeof value === "string") {
    out.push({ path, text: value });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, i) => walk(v, `${path}[${i}]`, out));
    return;
  }
  if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) walk(v, path ? `${path}.${k}` : k, out);
  }
}

function dashesIn(label: string, value: unknown): string[] {
  const found: { path: string; text: string }[] = [];
  walk(value, label, found);
  return found.filter((f) => f.text.includes("—")).map((f) => `${f.path}: ${f.text.slice(0, 90)}`);
}

describe("o texto do site não usa travessões", () => {
  it("dicionário português", () => {
    expect(dashesIn("pt", pt)).toEqual([]);
  });

  it("dicionário inglês", () => {
    expect(dashesIn("en", en)).toEqual([]);
  });

  it("páginas de serviço (PT e EN)", () => {
    expect(dashesIn("SERVICES", SERVICES)).toEqual([]);
    // A versão inglesa é uma sobreposição sobre a portuguesa; lê-se pelo mesmo
    // acessor que as páginas usam, para medir o que sai mesmo no ecrã.
    const en = SERVICES.map((s) => getService(s.slug, "en"));
    expect(dashesIn("SERVICES(en)", en)).toEqual([]);
  });

  it("documentos legais (PT e EN)", () => {
    expect(dashesIn("legal(pt)", getLegal("pt"))).toEqual([]);
    expect(dashesIn("legal(en)", getLegal("en"))).toEqual([]);
  });

  it("apanha mesmo um travessão acrescentado por engano", () => {
    // Sem isto, um `walk` partido faria os testes acima passarem por vazios.
    expect(dashesIn("teste", { a: { b: ["ok", "texto — com travessão"] } })).toEqual([
      "teste.a.b[1]: texto — com travessão",
    ]);
  });
});
