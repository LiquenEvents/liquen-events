// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MoodBoardIndice from "./MoodBoardIndice";
import type { MoodBoard } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ÍNDICE DIZ O QUE FALTA, E NÃO SÓ O QUE HÁ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Assinalar visualmente os boards INCOMPLETOS ou VAZIOS» e
 * «contador de boards prontos vs por acabar».
 *
 * O índice mostrava «vazio», que é o caso fácil. Uma página com fotos e sem
 * título lia-se exactamente como uma página pronta — e é essa que segue para o
 * cliente sem nome.
 */

afterEach(cleanup);

const board = (over: Partial<MoodBoard> = {}): MoodBoard => ({
  title: "Cerimónia",
  annotation: "Verdes e brancos.",
  images: ["a", "b"],
  ...over,
});

const desenhar = (boards: MoodBoard[], props: Record<string, unknown> = {}) =>
  render(
    <MoodBoardIndice
      boards={boards}
      ordem={boards.map((_, i) => i)}
      onSaltar={vi.fn()}
      {...props}
    />,
  );

describe("MoodBoardIndice", () => {
  it("conta as prontas, as por acabar e as vazias", () => {
    desenhar([board(), board({ title: "" }), board({ images: [] })]);
    expect(screen.getByText("1 pronta · 1 por acabar · 1 vazia")).toBeTruthy();
  });

  /** A frase que responde a «já posso enviar?». */
  it("com tudo pronto, diz isso e não uma conta", () => {
    desenhar([board(), board({ title: "Jantar" })]);
    expect(screen.getByText("Estão todas prontas.")).toBeTruthy();
  });

  it("uma página por acabar diz o que lhe falta a quem lê por voz", () => {
    desenhar([board({ annotation: "" })]);
    expect(screen.getByText(/por acabar: sem descrição/)).toBeTruthy();
  });

  it("a página vazia continua a dizer «vazio»", () => {
    desenhar([board({ images: [] })]);
    expect(screen.getByText("vazio")).toBeTruthy();
  });

  it("uma página pronta não leva marca nenhuma", () => {
    const { container } = desenhar([board()]);
    expect(container.querySelectorAll(".bg-\\[\\#c98a2e\\]")).toHaveLength(0);
  });

  /**
   * O arrasto vive no índice só quando há para onde o mandar. Sem `onMover` a
   * pega não existe — e uma pega que não faz nada é pior do que não haver pega.
   */
  it("sem `onMover` não há pegas de arrasto", () => {
    desenhar([board(), board()]);
    expect(screen.queryAllByRole("button", { name: /^Arrastar a página/ })).toHaveLength(0);
  });

  it("com `onMover`, cada página tem a sua pega — e o salto continua a saltar", () => {
    const onSaltar = vi.fn();
    desenhar([board(), board({ title: "Jantar" })], { onMover: vi.fn(), onSaltar });
    expect(screen.getAllByRole("button", { name: /^Arrastar a página/ })).toHaveLength(2);

    // A pega e o salto são alvos DIFERENTES: sem isso, arrastar e saltar eram o
    // mesmo gesto no mesmo sítio.
    screen.getByText("Jantar").click();
    expect(onSaltar).toHaveBeenCalledWith(1);
  });

  it("sem páginas nenhumas não desenha índice", () => {
    const { container } = desenhar([]);
    expect(container).toBeEmptyDOMElement();
  });
});
