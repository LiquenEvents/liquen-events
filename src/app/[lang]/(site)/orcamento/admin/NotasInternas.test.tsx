// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NotasInternas from "./NotasInternas";

/**
 * A garantia de que estas notas não saem no PDF está no teste do desenhador.
 * O que se prende aqui é a outra metade: que quem escreve SAIBA que não saem —
 * porque a defesa contra escrever a coisa errada no sítio errado não é um
 * teste, é o campo não se parecer com os outros.
 */

afterEach(cleanup);

describe("NotasInternas", () => {
  it("diz, no rótulo, que não sai na proposta", () => {
    render(<NotasInternas valor="" onChange={() => {}} />);
    expect(screen.getByText(/só para ti, nunca sai na proposta/)).toBeTruthy();
  });

  it("o rótulo aponta para o campo, para quem usa leitor de ecrã", async () => {
    render(<NotasInternas valor="" onChange={() => {}} />);
    // `getByLabelText` só encontra se a associação existir mesmo.
    expect(screen.getByLabelText(/Notas internas/)).toBeTruthy();
  });

  it("devolve o que se escreve", async () => {
    // Controlado pelo estúdio: com `valor` fixo em "", cada tecla chega ao pai
    // sozinha. O que importa provar é que chega — quem o acumula é o pai.
    const onChange = vi.fn();
    render(<NotasInternas valor="" onChange={onChange} />);
    await userEvent.type(screen.getByLabelText(/Notas internas/), "AMARA");
    expect(onChange).toHaveBeenCalledTimes(5);
    expect(onChange.mock.calls.map(([v]) => v)).toEqual(["A", "M", "A", "R", "A"]);
  });

  it("aceita um título próprio, para as notas presas a uma secção", () => {
    render(<NotasInternas valor="" onChange={() => {}} titulo="Nota sobre o orçamento" />);
    expect(screen.getByLabelText(/Nota sobre o orçamento/)).toBeTruthy();
  });
});
