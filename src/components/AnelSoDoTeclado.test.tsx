// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { AnelSoDoTeclado, MARCA } from "./AnelSoDoTeclado";

/**
 * «Eu não quero estes quadrados à volta do menu» e «se há anéis desses pelo
 * site, retira» (10/10). O porquê está no componente. Prende-se o modo: o rato
 * marca o que recebe o foco (mesmo por programa), o Tab devolve o anel.
 */

afterEach(cleanup);

function montar() {
  render(
    <>
      <AnelSoDoTeclado />
      <a href="#galeria" onClick={(e) => e.preventDefault()}>
        Galeria
      </a>
      <div role="dialog" tabIndex={-1} aria-label="Fotografia" />
    </>,
  );
  // O modo vive no módulo (ver o componente): cada caso começa no do teclado.
  fireEvent.keyDown(document, { key: "Tab" });
  return {
    link: screen.getByRole("link", { name: "Galeria" }),
    visor: screen.getByRole("dialog", { name: "Fotografia" }),
  };
}

describe("o anel do teclado só para o teclado", () => {
  it("o que se carrega com o rato fica marcado — e o foco fica onde estava", () => {
    const { link } = montar();
    fireEvent.pointerDown(link);
    link.focus();
    expect(link.hasAttribute(MARCA)).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it("o foco posto por programa a seguir a um clique (abrir a fotografia) também", () => {
    const { link, visor } = montar();
    fireEvent.pointerDown(link);
    visor.focus();
    expect(visor.hasAttribute(MARCA)).toBe(true);
    // As setas, para ver a seguinte, não mudam o modo.
    fireEvent.keyDown(visor, { key: "ArrowRight" });
    expect(visor.hasAttribute(MARCA)).toBe(true);
  });

  it("o Tab devolve o modo do teclado: o que recebe o foco a seguir não se marca", () => {
    const { link, visor } = montar();
    fireEvent.pointerDown(link);
    link.focus();
    fireEvent.keyDown(link, { key: "Tab" });
    visor.focus();
    expect(link.hasAttribute(MARCA)).toBe(false);
    expect(visor.hasAttribute(MARCA)).toBe(false);
  });

  it("sem rato nenhum, nada se marca", () => {
    const { link } = montar();
    link.focus();
    expect(link.hasAttribute(MARCA)).toBe(false);
  });

  it("o globals.css cala o anel só a quem tem a marca, e o contraste forçado repõe-no", () => {
    const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
    expect(css).toMatch(/\[data-foco-do-rato\]:focus-visible\s*\{\s*outline:\s*none;/);
    const depois = css.slice(css.indexOf("[data-foco-do-rato]:focus-visible"));
    expect(depois).toMatch(
      /@media \(forced-colors: active\)\s*\{\s*:focus-visible\s*\{\s*outline:/,
    );
  });
});
