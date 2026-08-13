import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { logoDimsFor, logoHeight, logoCssWidth, logoSizes } from "./logo";
import logoDims from "./logo-dims.json";
import { LOGO_WIDTHS, snapLogoWidth } from "./site-image-loader";

const WIDE = "/logos/clientes/aernnova.avif"; // [304, 36] — thin wordmark
const TALL = "/logos/clientes/convento-espinheiro.avif"; // [316, 378] — upright mark
const UNKNOWN = "/logos/clientes/__missing__.avif";

describe("logoDimsFor", () => {
  it("returns the real dimensions for a known logo", () => {
    expect(logoDimsFor(WIDE)).toEqual([304, 36]);
  });

  it("returns a sensible default for an unknown logo", () => {
    expect(logoDimsFor(UNKNOWN)).toEqual([400, 120]);
  });
});

describe("logoHeight", () => {
  it("clamps a very wide logo down to the minimum height", () => {
    expect(logoHeight(WIDE)).toBe(26);
  });

  it("gives an upright logo a taller height, never above the max", () => {
    const h = logoHeight(TALL);
    expect(Number.isInteger(h)).toBe(true);
    expect(h).toBeGreaterThan(40);
    expect(h).toBeLessThanOrEqual(46);
  });

  it("uses sqrt(targetArea) when dimensions are unknown", () => {
    expect(logoHeight(UNKNOWN)).toBe(40); // round(sqrt(1600))
  });

  it("honours custom min/max bounds", () => {
    expect(logoHeight(WIDE, 1600, 30, 50)).toBe(30);
  });
});

/**
 * O `sizes` é o que decide QUANTOS BYTES de logótipo a página descarrega. Estes
 * testes protegem as duas propriedades de que isso depende:
 *
 *   1. NUNCA declarar MENOS do que se desenha (declarar a menos = logótipo
 *      desfocado, e tipografia fina desfocada vê-se logo);
 *   2. os dois componentes declararem O MESMO para o mesmo logótipo (declarar
 *      diferente = a mesma marca descarregada duas vezes em /clientes).
 */
describe("logoCssWidth / logoSizes", () => {
  const RAIZ = path.join(__dirname, "..", "..");
  const FITA = readFileSync(path.join(RAIZ, "src/components/ClientMarquee.tsx"), "utf8");
  const PAREDE = readFileSync(path.join(RAIZ, "src/components/ClientLogoGrid.tsx"), "utf8");

  /** A largura desenhada por um componente, com as suas travas de CSS. */
  function desenhada(
    src: string,
    area: number,
    min: number,
    max: number,
    alturaMax: number,
    larguraMax: number,
  ) {
    const [w, h] = logoDimsFor(src);
    return Math.min(larguraMax, Math.min(alturaMax, logoHeight(src, area, min, max)) * (w / h));
  }

  it("nunca declara menos do que a fita ou a parede desenham", () => {
    for (const src of Object.keys(logoDims)) {
      const declarada = logoCssWidth(src);
      // Fita, nos dois lados do breakpoint sm.
      expect(declarada, src).toBeGreaterThanOrEqual(desenhada(src, 1600, 26, 46, 34, 170));
      expect(declarada, src).toBeGreaterThanOrEqual(desenhada(src, 1600, 26, 46, 22, 120));
      // Parede: a célula mais larga (3 colunas a 1023px) e a mais estreita
      // (5 colunas dentro de max-w-7xl) — o `max-w-[68%]` de cada uma.
      expect(declarada, src).toBeGreaterThanOrEqual(desenhada(src, 3200, 30, 54, Infinity, 194));
      expect(declarada, src).toBeGreaterThanOrEqual(desenhada(src, 3200, 30, 54, Infinity, 129));
    }
  });

  it("declara a largura real, não a do logótipo mais largo de todos", () => {
    // O ponto todo da mudança: estes dois são desenhados a larguras muito
    // diferentes e têm de declarar valores muito diferentes.
    expect(logoCssWidth(TALL)).toBeLessThan(60); // desenhado a ~28–31px
    expect(logoCssWidth(WIDE)).toBeGreaterThan(150); // wordmark, vai aos 170px
    expect(logoSizes(TALL)).toBe(`${logoCssWidth(TALL)}px`);
    expect(logoSizes(TALL)).toMatch(/^\d+px$/);
  });

  it("não tem `vw` nenhum — senão o next/image apagava os candidatos pequenos", () => {
    // Com um `vw` na expressão, o getWidths do next/image filtra o srcset para
    // as larguras >= deviceSizes[0] * (menor vw). Os candidatos de 64 e 96px
    // desapareciam, e são precisamente os que estes logótipos precisam.
    for (const src of Object.keys(logoDims)) expect(logoSizes(src)).not.toContain("vw");
  });

  it("cai num degrau da escada pré-gerada, e a 1x nunca acima dos 256", () => {
    for (const src of Object.keys(logoDims)) {
      const declarada = logoCssWidth(src);
      // Nenhum logótipo pode declarar mais do que a célula mais larga da
      // parede: acima disso é o `max-w-[68%]` que manda, não a proporção.
      expect(declarada, src).toBeLessThanOrEqual(194);
      expect(LOGO_WIDTHS).toContain(snapLogoWidth(declarada));
      // Num ecrã 1x — o caso medido — nenhum destes logótipos justifica os
      // degraus de 384 ou 512 (esses existem para o wordmark do Navbar).
      expect(snapLogoWidth(declarada), src).toBeLessThanOrEqual(256);
    }
  });

  it("os dois componentes usam a MESMA função (senão descarregam-se duas cópias)", () => {
    expect(FITA).toContain("sizes={logoSizes(logo)}");
    expect(PAREDE).toContain("sizes={logoSizes(client.logo)}");
  });

  it("as travas de CSS que a conta assume ainda estão nos componentes", () => {
    // Se alguém mexer nestas classes sem mexer em CONTEXTOS (logo.ts), o
    // `sizes` passa a mentir — para menos, e os logótipos desfocam.
    expect(FITA).toContain("max-h-[22px] sm:max-h-[34px]");
    expect(FITA).toContain("max-w-[120px] sm:max-w-[170px]");
    expect(FITA).toContain("logoHeight(logo)");
    expect(PAREDE).toContain("max-w-[68%]");
    expect(PAREDE).toContain("logoHeight(client.logo, 3200, 30, 54)");
  });
});
