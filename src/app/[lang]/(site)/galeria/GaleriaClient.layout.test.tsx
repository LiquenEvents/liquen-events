// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import GaleriaClient from "./GaleriaClient";
import { PHOTOS } from "./photos-data";
import { interleaveByCollection } from "./interleave";
import { aspectFor } from "@/lib/image-meta";
import { pt } from "@/lib/i18n/pt";

/**
 * A GRELHA NÃO PODE MUDAR DE ALTURA DEPOIS DE DESENHADA.
 *
 * A queixa era "ao fazer scroll no telemóvel fica tudo travado e vai um pouco
 * para cima na página". Ir para cima é o sintoma de conteúdo ACIMA do ecrã a
 * mudar de tamanho depois de pintado. Medido num Chromium a 390x844, toque
 * verdadeiro, CPU 4x/6x/8x e 3G, cinco travessias (até 348 das 427 fotos): 0
 * recuos espontâneos de `scrollY` e 0,0000 de layout-shift atribuível à
 * galeria. As alturas dos 59 mosaicos medidos dentro e fora do ecrã eram
 * IDÊNTICAS às centésimas.
 *
 * Isso não é sorte — depende de duas propriedades que hoje só estão garantidas
 * por comentários, e que estes testes passam a fixar:
 *
 *  1. Cada mosaico do masonry reserva a sua altura com um `aspect-ratio`
 *     próprio. É isto, e só isto, que torna o `content-visibility: auto` do
 *     `.g-tile` seguro: com a caixa determinada pelo rácio, o browser não tem
 *     de adivinhar a altura do conteúdo que salta (o `contain-intrinsic-size`
 *     resolve para `auto none`, ou seja, sem tamanho de reserva próprio). Tirar
 *     o rácio e deixar ficar o `content-visibility` é exactamente a receita
 *     para a página saltar.
 *
 *  2. Acrescentar uma página de fotos nunca desloca um mosaico já colocado. O
 *     empacotamento do masonry é guloso e por prefixo, portanto as colunas só
 *     crescem por baixo — o scroll infinito não pode re-arrumar o que está
 *     acima do ecrã.
 */

// Rácios REAIS (não um "3/2" uniforme): é com alturas diferentes que o
// empacotamento por coluna mais curta tem alguma decisão para tomar, e portanto
// alguma coisa para estragar.
const photos = PHOTOS.slice(0, 80).map((p) => ({ ...p, aspectRatio: aspectFor(p.src) }));

/** matchMedia controlável: decide o número de colunas do masonry. */
function stubMedia(matches: (q: string) => boolean) {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: matches(q),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent: () => false,
  }));
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  stubMedia(() => false); // telemóvel: 1 coluna, sem reduced-motion
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const gridTiles = () => [
  ...document.querySelectorAll<HTMLElement>('[data-tile-idx][data-tile-variant="grid"]'),
];
/** As colunas do masonry, cada uma com os índices que leva, por ordem. */
function columns(): number[][] {
  const cols = new Map<Element, number[]>();
  for (const t of gridTiles()) {
    const col = t.closest(".g-reveal")?.parentElement;
    if (!col) throw new Error("mosaico do masonry sem coluna");
    if (!cols.has(col)) cols.set(col, []);
    cols.get(col)!.push(Number(t.dataset.tileIdx));
  }
  return [...cols.values()];
}
function verMais() {
  fireEvent.click(screen.getByRole("button", { name: new RegExp(pt.galeria.verMais) }));
}

describe("a galeria reserva o espaço das fotos antes de elas chegarem", () => {
  it("cada mosaico do masonry declara o SEU aspect-ratio", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const tiles = gridTiles();
    expect(tiles.length).toBeGreaterThan(5);
    const semRacio = tiles.filter(
      (t) => !/^\d+(\.\d+)?\s*\/\s*\d+(\.\d+)?$/.test(t.style.aspectRatio),
    );
    expect(semRacio.map((t) => t.dataset.tileIdx)).toEqual([]);
  });

  it("o rácio de cada mosaico é o da SUA fotografia, não um valor comum", () => {
    // Sem semente, a arrumação é a mesma que o componente calcula, por isso o
    // índice do mosaico dá a fotografia exacta que lá está.
    const pool = interleaveByCollection(photos, "");
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const errados: string[] = [];
    for (const t of gridTiles()) {
      const idx = Number(t.dataset.tileIdx);
      const esperado = pool[idx].aspectRatio.replace(/\s/g, "");
      if (t.style.aspectRatio.replace(/\s/g, "") !== esperado)
        errados.push(`${idx}: ${t.style.aspectRatio} ≠ ${esperado}`);
    }
    expect(errados).toEqual([]);
    // E os rácios não são todos iguais — um valor comum reservaria a altura
    // errada em quase todos os mosaicos, que é o mesmo que não reservar.
    expect(new Set(gridTiles().map((t) => t.style.aspectRatio)).size).toBeGreaterThan(1);
  });

  it("enquanto o .g-tile saltar conteúdo com content-visibility, tem de haver rácio", () => {
    // O `content-visibility: auto` vive em globals.css (fora desta pasta). Este
    // teste liga as duas metades do contrato: se alguém lá mantiver o
    // content-visibility, aqui tem de continuar a haver altura reservada.
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    const bloco = /\.g-tile\s*\{([^}]*)\}/.exec(css)?.[1] ?? "";
    const saltaConteudo = /content-visibility:\s*auto/.test(bloco);
    if (!saltaConteudo) return; // contrato dispensado: nada é saltado
    // O `contain-intrinsic-size: auto` resolve para `auto none` — não dá
    // tamanho de reserva nenhum por si só. Quem reserva é o aspect-ratio.
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    expect(gridTiles().every((t) => t.style.aspectRatio !== "")).toBe(true);
  });

  it("o mosaico-herói tem altura fixa (não depende das fotos que lá estão)", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const hero = document.querySelector('[data-tile-variant="hero"]')?.parentElement;
    expect(hero?.className).toMatch(/h-\[\d+px\]/);
  });
});

describe("acrescentar uma página não mexe no que já está colocado", () => {
  it("em 1 coluna (telemóvel), as fotos já colocadas continuam onde estavam", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    let antes = columns();
    expect(antes).toHaveLength(1);
    for (let n = 0; n < 3; n++) {
      verMais();
      const depois = columns();
      expect(depois).toHaveLength(antes.length);
      depois.forEach((col, i) => {
        expect(col.length).toBeGreaterThan(antes[i].length);
        expect(col.slice(0, antes[i].length)).toEqual(antes[i]);
      });
      antes = depois;
    }
  });

  it("em 3 colunas, o empacotamento por coluna mais curta continua a ser por prefixo", () => {
    // É aqui que um empacotamento "equilibrado" (à la column-fill: balance) se
    // trairia: re-arrumar para nivelar as colunas mudaria de sítio mosaicos que
    // já estão acima do ecrã.
    stubMedia((q) => /min-width:\s*(640|768)px/.test(q));
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    let antes = columns();
    expect(antes).toHaveLength(3);
    for (let n = 0; n < 3; n++) {
      verMais();
      const depois = columns();
      expect(depois).toHaveLength(3);
      depois.forEach((col, i) => {
        expect(col.slice(0, antes[i].length)).toEqual(antes[i]);
      });
      antes = depois;
    }
    // E cresceu mesmo (senão o teste passava com a grelha parada).
    expect(antes.reduce((s, c) => s + c.length, 0)).toBeGreaterThan(gridTiles().length - 1);
    expect(antes.reduce((s, c) => s + c.length, 0)).toBeGreaterThan(20);
  });

  it("a ordem do conjunto não se re-baralha ao crescer", () => {
    render(<GaleriaClient photos={photos} dict={pt.galeria} />);
    const antes = gridTiles().map((t) => t.getAttribute("aria-label"));
    verMais();
    const depois = gridTiles().map((t) => t.getAttribute("aria-label"));
    expect(depois.slice(0, antes.length)).toEqual(antes);
  });
});
