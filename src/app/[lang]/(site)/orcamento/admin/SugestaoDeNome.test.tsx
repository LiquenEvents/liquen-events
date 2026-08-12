// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { SugestaoDeNome } from "./SugestaoDeNome";

afterEach(() => cleanup());

describe("a sugestão de nome de tema", () => {
  it("propõe a grafia arrumada", () => {
    render(<SugestaoDeNome valor="Seatings Plans" onAceitar={() => {}} />);
    expect(screen.getByRole("button", { name: /Seating Plans/ })).toBeInTheDocument();
  });

  it("cala-se quando o nome já está bem", () => {
    render(<SugestaoDeNome valor="Bouquets Branco e Amarelo" onAceitar={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("cala-se enquanto o nome ainda é curto de mais para significar alguma coisa", () => {
    // «bou» viraria «Bou», e uma sugestão a cada tecla é ruído.
    render(<SugestaoDeNome valor="bo" onAceitar={() => {}} />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("devolve o nome arrumado a quem a chamou", async () => {
    const u = userEvent.setup();
    const aceitar = vi.fn();
    render(<SugestaoDeNome valor="cerimonia simbolica" onAceitar={aceitar} />);
    await u.click(screen.getByRole("button"));
    expect(aceitar).toHaveBeenCalledWith("Cerimónia Simbólica");
  });

  /**
   * O caso que parte isto em silêncio.
   *
   * No campo de renomear, o `onBlur` GRAVA. Sem o `preventDefault` no
   * `mousedown`, carregar na sugestão tirava o foco primeiro, gravava o nome
   * por arrumar, e o clique chegava tarde. O teste imita esse campo.
   */
  it("não deixa o campo perder o foco antes do clique", async () => {
    const u = userEvent.setup();
    const gravou: string[] = [];

    function CampoComoODeRenomear() {
      const [nome, setNome] = useState("Seatings Plans");
      return (
        <div>
          <input
            aria-label="Nome do tema"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            onBlur={() => gravou.push(nome)}
          />
          <SugestaoDeNome valor={nome} onAceitar={setNome} />
        </div>
      );
    }

    render(<CampoComoODeRenomear />);
    await u.click(screen.getByLabelText("Nome do tema"));
    await u.click(screen.getByRole("button", { name: /Seating Plans/ }));

    // O nome arrumou-se…
    expect(screen.getByLabelText("Nome do tema")).toHaveValue("Seating Plans");
    // …e nada foi gravado pelo caminho: o campo nunca perdeu o foco.
    expect(gravou).toEqual([]);
  });
});
