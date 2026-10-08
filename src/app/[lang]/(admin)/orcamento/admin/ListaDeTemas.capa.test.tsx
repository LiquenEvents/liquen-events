// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import ListaDeTemas from "./ListaDeTemas";

/**
 * Palavras dela, com a captura: «isto não está a funcionar» — a coluna dos
 * temas com todas as capas partidas. O `coverUrl` é a miniatura de 400 px, que
 * pode não existir; o Storage assina-a na mesma e o 404 só se vê no browser.
 * Os cartões recuavam para o original; esta coluna não. Agora recua.
 */
afterEach(cleanup);

const tema = {
  id: "t1",
  name: "Buffet Decor",
  imageCount: 9,
  coverUrl: "https://x.test/derivada-que-nao-existe.webp",
  coverFallbackUrl: "https://x.test/original.jpg",
} as unknown as ThemeSummary;

function montar() {
  return render(
    <ListaDeTemas
      temas={[tema]}
      activoId="t1"
      aoEscolher={() => {}}
      aoVoltar={() => {}}
      aoLargarFotos={() => {}}
    />,
  );
}

describe("coluna dos temas — a capa recua para o original", () => {
  it("pede primeiro a miniatura", () => {
    const { container } = montar();
    expect(container.querySelector("img")?.getAttribute("src")).toBe(tema.coverUrl);
  });

  it("se a miniatura falhar, mostra o original em vez de uma imagem partida", () => {
    const { container } = montar();
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(tema.coverFallbackUrl);
  });
});
