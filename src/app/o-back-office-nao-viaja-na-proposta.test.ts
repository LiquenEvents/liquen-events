import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CSS DO BACK OFFICE NÃO PODE VOLTAR PARA DENTRO DA PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «umas vezes abre bem, outras vezes não abre bem, eu quero que
 * abra sempre bem». A animação já era idêntica em todo o lado — o que variava
 * era o ECRÃ BRANCO antes dela.
 *
 * A causa, medida: a cortina estava no byte 234.610 de 495.756 do documento da
 * proposta. O CSS vive no `<head>`, e o `<head>` trava a primeira pintura;
 * portanto o telemóvel tinha de descarregar metade da página antes de poder
 * pintar o pano.
 *
 * E 87,8 KB dessa folha (32%) eram utilitários que SÓ o back office usa, a
 * viajar dentro de cada proposta que um casal abre.
 *
 * O que a separação deu, medido em 4G fraca com sete aberturas de cache vazia:
 *
 *   proposta   596 ms → 488 ms
 *   sítio      628 ms → 496 ms
 *
 * E, antes de se escrever uma linha, comparou-se o conjunto de selectores da
 * folha única com o da soma das duas novas: 2113 classes antes, 2113 depois.
 * Nenhuma desapareceu.
 *
 * ── PORQUE É QUE ISTO É UM TESTE E NÃO UM COMENTÁRIO ──────────────────────
 *
 * Porque é invisível. Tirar o `@source not` devolve 88 KB à proposta e NADA se
 * parte: o site continua bonito, os testes continuam verdes, e só um casal numa
 * quinta com rede fraca é que paga. Uma regressão que não dá erro precisa de
 * alguém a olhar por ela.
 */
const globais = readFileSync("src/app/globals.css", "utf8");
const admin = readFileSync("src/app/admin.css", "utf8");
const layoutDoBackOffice = readFileSync("src/app/[lang]/(admin)/layout.tsx", "utf8");
const layoutDaProposta = readFileSync("src/app/[lang]/(privado)/layout.tsx", "utf8");
const layoutDoSitio = readFileSync("src/components/CromadoDoSitio.tsx", "utf8");

describe("o back office não viaja dentro da proposta", () => {
  it("o globals.css deixa de varrer a pasta do back office", () => {
    expect(globais, "voltou a varrer o (admin) — a proposta engordou 88 KB").toMatch(
      /@source\s+not\s+"\.\/\[lang\]\/\(admin\)"/,
    );
  });

  it("o que ficou de fora nasce no admin.css, a partir da mesma pasta", () => {
    expect(admin).toMatch(/@import\s+"tailwindcss\/utilities\.css".*source\("\.\/\[lang\]\/\(admin\)"\)/);
  });

  it("o admin.css traz o tema por referência — sem o duplicar", () => {
    // Sem `@reference`, o Tailwind não sabe o que é `bg-moss-dark` e não gera a
    // regra; com um `@import` a sério, o `:root` saía duas vezes.
    expect(admin).toMatch(/@reference\s+"\.\/globals\.css"/);
    expect(admin, "o admin.css passou a emitir o tema outra vez").not.toMatch(
      /@import\s+"tailwindcss"\s*;/,
    );
  });

  it("só o layout do back office o importa", () => {
    expect(layoutDoBackOffice).toContain("admin.css");
    for (const [onde, fonte] of [
      ["a proposta", layoutDaProposta],
      ["o sítio", layoutDoSitio],
    ] as const) {
      expect(fonte, `${onde} passou a carregar o CSS do back office`).not.toContain("admin.css");
    }
  });
});
