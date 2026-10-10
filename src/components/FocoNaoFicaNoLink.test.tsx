// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FocoNaoFicaNoLink } from "./FocoNaoFicaNoLink";

/**
 * «Eu não quero estes quadrados à volta do menu» (10/10). O porquê está no
 * componente. Prende-se as duas metades: o rato larga o foco, o teclado não.
 */

afterEach(cleanup);

function montar() {
  render(
    <>
      <FocoNaoFicaNoLink />
      <a href="#galeria" onClick={(e) => e.preventDefault()}>
        Galeria
      </a>
    </>,
  );
  const link = screen.getByRole("link", { name: "Galeria" });
  link.focus();
  return link;
}

describe("o foco depois de carregar num link", () => {
  it("com o rato, o link não fica com o foco — e não há anel à primeira tecla", () => {
    const link = montar();
    fireEvent.click(link, { detail: 1 });
    expect(document.activeElement).not.toBe(link);
  });

  it("com o teclado (Enter, `detail = 0`), o foco fica onde está", () => {
    const link = montar();
    fireEvent.click(link, { detail: 0 });
    expect(document.activeElement).toBe(link);
  });
});
