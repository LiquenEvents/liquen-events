import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Auditoria externa, C5: o texto do aviso de cookies estava em `text-white/80`
 * — 4,48:1 sobre a página branca, abaixo dos 4,5 do AA. Passa a branco (5,92:1)
 * e fica em 12,5 px para a barra não crescer além da reserva medida.
 */
const fonte = readFileSync(join(process.cwd(), "src/components/ConsentBanner.tsx"), "utf8");

describe("aviso de cookies — contraste do texto (C5)", () => {
  it("o parágrafo é branco inteiro, no mesmo corpo", () => {
    expect(fonte).toContain('<p className="text-[12.5px] leading-relaxed text-white">');
    expect(fonte).not.toContain("leading-relaxed text-white/80");
  });
});
