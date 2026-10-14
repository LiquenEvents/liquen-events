// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Escolha } from "./Escolha";
import { EscolhaDoEstado } from "../EscolhaDoEstado";

/**
 * A LISTA NO CORPO DA PÁGINA (`noCorpo`).
 *
 * A pastilha do estado vive numa tabela com `overflow-x-auto`, e na última
 * linha a lista `absolute` era cortada pelo fundo da tabela. Com `noCorpo` ela
 * vai para o `<body>`, `fixed`, junto ao botão — e vira-se para cima quando não
 * cabe em baixo.
 */

const OPCOES = [
  { valor: "a", rotulo: "Novo" },
  { valor: "b", rotulo: "Ganho" },
];

function caixaDoBotao(top: number, bottom: number) {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    return {
      top,
      bottom,
      left: 40,
      right: 140,
      width: 100,
      height: bottom - top,
      x: 40,
      y: top,
      toJSON() {},
    } as DOMRect;
  });
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("Escolha com `noCorpo`", () => {
  it("desenha a lista no <body>, fora da caixa, colada ao botão", async () => {
    caixaDoBotao(100, 120);
    const { container } = render(
      <div style={{ overflow: "auto" }}>
        <Escolha opcoes={OPCOES} valor="a" aoMudar={() => {}} noCorpo aria-label="Estado" />
      </div>,
    );
    const botao = await screen.findByRole("combobox", { name: "Estado" });
    await waitFor(() => expect(botao.tagName).toBe("BUTTON"));
    fireEvent.click(screen.getByRole("combobox", { name: "Estado" }));

    const lista = await screen.findByRole("listbox");
    expect(container.contains(lista)).toBe(false);
    expect(lista.parentElement).toBe(document.body);
    expect(lista.className).toContain("fixed");
    // Por baixo do botão (que acaba aos 120), à mesma esquerda.
    await waitFor(() => expect(lista.style.top).toBe("124px"));
    expect(lista.style.left).toBe("40px");
    expect(lista.style.visibility).toBe("");
  });

  it("vira-se para cima quando não cabe em baixo", async () => {
    // O botão está quase no fundo de uma janela de 768 px.
    caixaDoBotao(700, 720);
    render(<Escolha opcoes={OPCOES} valor="a" aoMudar={() => {}} noCorpo aria-label="Estado" />);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Estado" }).tagName).toBe("BUTTON"),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    const lista = await screen.findByRole("listbox");
    await waitFor(() => expect(lista.style.bottom).toBe(`${window.innerHeight - 700 + 4}px`));
    expect(lista.style.top).toBe("");
  });

  it("carregar numa opção escolhe-a — não conta como carregar fora", async () => {
    caixaDoBotao(100, 120);
    const aoMudar = vi.fn();
    render(<Escolha opcoes={OPCOES} valor="a" aoMudar={aoMudar} noCorpo aria-label="Estado" />);
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Estado" }).tagName).toBe("BUTTON"),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Estado" }));
    const ganho = await screen.findByRole("option", { name: "Ganho" });
    fireEvent.pointerDown(ganho);
    fireEvent.click(ganho);
    expect(aoMudar).toHaveBeenCalledWith("b");
  });
});

describe("EscolhaDoEstado numa linha que se abre ao toque", () => {
  it("escolher o estado não abre a linha", async () => {
    caixaDoBotao(100, 120);
    const abrirLinha = vi.fn();
    const aoMudar = vi.fn();
    render(
      <table>
        <tbody>
          <tr onClick={abrirLinha}>
            <td>
              <EscolhaDoEstado
                forma="pastilha"
                estados={[
                  { id: "cotado", label: "Proposta enviada", color: "" },
                  { id: "aceite", label: "Ganho", color: "" },
                ]}
                valor="cotado"
                aoMudar={aoMudar}
                aria-label="Estado do pedido de Ana"
              />
            </td>
          </tr>
        </tbody>
      </table>,
    );
    const nome = { name: "Estado do pedido de Ana" };
    await waitFor(() => expect(screen.getByRole("combobox", nome).tagName).toBe("BUTTON"));
    fireEvent.click(screen.getByRole("combobox", nome));
    fireEvent.click(await screen.findByRole("option", { name: "Ganho" }));

    expect(aoMudar).toHaveBeenCalledWith("aceite");
    expect(abrirLinha).not.toHaveBeenCalled();
  });
});
