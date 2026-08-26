// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MoreMenu } from "./MoreMenu";

/**
 * Um menu que se abre por um botão tem de DEVOLVER o foco a esse botão quando
 * fecha — por qualquer das saídas. O Escape já o fazia; escolher uma acção não,
 * e é a saída que se usa. Como o item escolhido desaparece com o menu, o foco
 * caía no `<body>`: o Tab seguinte recomeçava no princípio da página, longe da
 * linha onde se estava a trabalhar.
 */

const ITENS = [
  { label: "Duplicar", onClick: vi.fn() },
  { label: "Imprimir folha de sala", onClick: vi.fn() },
];

/**
 * O `.hidden` do Tailwind, aplicado a sério.
 *
 * O rótulo deste botão é `hidden sm:inline` — ou seja, num telemóvel está
 * `display: none`. Sem uma folha de estilo, o jsdom tem o texto lá e o teste
 * mede um nome que ninguém ouve. Com a regra posta à mão, a conta do nome
 * acessível passa a ser a mesma que o browser faz.
 */
function esconderRotulosDeEcraPequeno() {
  const estilo = document.createElement("style");
  estilo.id = "regra-hidden";
  estilo.textContent = ".hidden { display: none; }";
  document.head.appendChild(estilo);
}

afterEach(() => {
  cleanup();
  document.getElementById("regra-hidden")?.remove();
  vi.clearAllMocks();
});

describe("MoreMenu", () => {
  /**
   * No telemóvel só sobra o glifo "⋯", que é `aria-hidden`. O nome do botão
   * vinha do rótulo escrito ao lado — e esse rótulo está escondido por CSS
   * exactamente nos ecrãs onde ele era a única fonte do nome. Resultado: um
   * leitor de ecrã anunciava «botão», sem mais nada, e não havia como saber o
   * que aquilo abre. O `MenuDeAccoes` (o gémeo em `ui/`) já resolve isto com um
   * `aria-label` próprio.
   */
  it("mantém nome acessível quando o rótulo se esconde no telemóvel", () => {
    esconderRotulosDeEcraPequeno();
    render(<MoreMenu items={ITENS} />);
    expect(screen.getByRole("button", { name: "Mais" })).toBeInTheDocument();
  });

  it("ao escolher uma acção, o foco volta ao botão que abriu o menu", async () => {
    const user = userEvent.setup();
    render(<MoreMenu items={ITENS} />);

    const abridor = screen.getByRole("button", { name: /Mais/ });
    await user.click(abridor);
    await user.click(screen.getByRole("menuitem", { name: /Duplicar/ }));

    expect(ITENS[0].onClick).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(abridor).toHaveFocus();
  });
});
