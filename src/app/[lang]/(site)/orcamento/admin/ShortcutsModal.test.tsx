// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import ShortcutsModal from "./ShortcutsModal";
import AjudaGlossario from "./AjudaGlossario";

/**
 * As duas janelas da barra de topo são gémeas — o `AjudaGlossario` diz-se
 * "espelho do ShortcutsModal" no seu próprio cabeçalho. O × de fechar do
 * glossário já tinha o `alvo-toque`; o dos atalhos não, e media ~14×18 px.
 *
 * Num telemóvel isso deixa esta janela com uma saída única em que não se acerta
 * — porque a outra saída, o Escape, é uma tecla que ali não existe, e tocar no
 * fundo escuro não é um controlo, é uma coisa que se descobre por acaso. E o
 * conteúdo desta janela em concreto é uma lista de teclas: quem lá chega num
 * telemóvel chegou por engano e o que quer é sair.
 */

afterEach(cleanup);

describe("ShortcutsModal", () => {
  it("o × de fechar tem alvo de dedo — como o do glossário, que é a mesma janela", () => {
    render(<ShortcutsModal open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Fechar" }).className).toContain("alvo-toque");
  });

  it("o glossário, a gémea, continua a ter o dela", () => {
    render(<AjudaGlossario open onClose={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Fechar" }).className).toContain("alvo-toque");
  });

  it("o Escape fecha", async () => {
    const user = userEvent.setup();
    const fechar = vi.fn();
    render(<ShortcutsModal open onClose={fechar} />);
    await user.keyboard("{Escape}");
    expect(fechar).toHaveBeenCalled();
  });
});
