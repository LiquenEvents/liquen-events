// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

/**
 * Os avisos empilham-se no canto de baixo à direita, um por baixo do outro, a
 * crescer para CIMA. Sem tecto isso deixa de ser um aviso e passa a ser uma
 * parede: um `Promise.all` de doze gravações que rebentam dá doze caixas de
 * ~64 px, ou seja 768 px — mais alto do que o ecrã de um telemóvel — e o que
 * fica tapado é exactamente o trabalho a que os avisos se referem.
 *
 * O tecto guarda as ÚLTIMAS: a mais recente é a que ainda diz respeito ao que
 * se acabou de fazer.
 */

function Disparador({ quantos }: { quantos: number }) {
  const { toast } = useToast();
  return (
    <button
      onClick={() => {
        for (let i = 1; i <= quantos; i++) toast(`Aviso ${i}`, "info");
      }}
    >
      disparar
    </button>
  );
}

afterEach(cleanup);

describe("ToastProvider", () => {
  it("não deixa a pilha crescer sem fim — guarda os últimos e deita fora os velhos", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Disparador quantos={12} />
      </ToastProvider>,
    );

    await user.click(screen.getByRole("button", { name: "disparar" }));

    const caixas = screen.getAllByRole("button", { name: "Fechar" });
    expect(caixas.length).toBeLessThanOrEqual(4);

    // O último entrou; o primeiro já saiu.
    expect(screen.getByText("Aviso 12")).toBeInTheDocument();
    expect(screen.queryByText("Aviso 1")).toBeNull();
  });
});
