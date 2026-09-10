// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Glass } from "./Glass";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VIDRO MONTA-SE E — SOBRETUDO — DESMONTA-SE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A refracção não se prova aqui: precisa de `canvas` e de um motor Chromium, e
 * o `jsdom` não tem nenhum dos dois. Está provada onde se pode ver, com a
 * grelha por trás (ver a nota no `docs/LIQUID-GLASS.md`).
 *
 * O que se prova aqui é o que um teste de unidade apanha melhor do que um olho:
 * que o `destroy()` corre. Cada `attach()` pendura um `<filter>` no `<defs>` do
 * documento, e uma vista que abre e fecha vinte vezes sem desmontar deixa vinte
 * lá dentro. Ninguém VÊ isso — vê-se o vigésimo primeiro vidro a custar o dobro
 * a desenhar, três semanas depois, sem nada que ligue uma coisa à outra.
 *
 * E o `jsdom` cai sempre no caminho alternativo (não há `backdrop-filter` com
 * `url()` fora do Chromium), que é o mesmo que o Safari e o Firefox percorrem —
 * portanto este ficheiro guarda também esse.
 */

describe("a superfície de vidro", () => {
  it("marca-se como alternativa onde o motor não pode entrar", () => {
    /* Safari e Firefox ignoram a declaração INTEIRA quando ela traz um filtro
       SVG — não degrada sozinha, some. O `data-lg-fallback` é o que deixa o CSS
       dar mais corpo ao rebordo onde o material não chegou. */
    const { container } = render(
      <Glass superficie="barra">
        <p>3 fotos selecionadas</p>
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el).not.toBeNull();
    expect(el.dataset.lgFallback).toBe("true");
    expect(el.style.backdropFilter).toContain("blur(");
    cleanup();
  });

  it("desmontar limpa o que montar sujou", () => {
    const { container, unmount } = render(<Glass superficie="painel">olá</Glass>);
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el.style.backdropFilter).not.toBe("");

    /* O elemento é arrancado do documento pelo React, portanto guarda-se antes.
       O que se afirma é sobre o que o `destroy()` fez — e não sobre o React ter
       deitado a árvore fora, que faria este teste passar sozinho. */
    unmount();
    expect(el.style.backdropFilter).toBe("");
    expect(el.dataset.lgFallback).toBeUndefined();
  });

  it("guarda as classes de quem a usa, e junta a sua", () => {
    /* A `lg` é o que o `admin.css` procura para desenhar o rebordo, e é o que o
       `specular()` acende. Uma `className` que a substituísse deixava a barra
       com vidro e sem reflexo — e isso não dá erro nenhum, só fica feio. */
    const { container } = render(
      <Glass superficie="barra" className="rounded-2xl px-4">
        olá
      </Glass>,
    );
    const el = container.querySelector<HTMLElement>(".lg")!;
    expect(el.className).toContain("rounded-2xl");
    expect(el.className).toContain("px-4");
    cleanup();
  });

  it("desenha o elemento que lhe pedirem", () => {
    const { container } = render(
      <Glass superficie="barra" as="nav">
        olá
      </Glass>,
    );
    expect(container.querySelector("nav.lg")).not.toBeNull();
    cleanup();
  });
});
