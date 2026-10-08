// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import NewQuoteModal from "./NewQuoteModal";
import { ToastProvider } from "./Toast";

/** Achado n.º 31: «Criar pedido» desligado sem dizer porquê, e o Enter não
 *  fazia nada. */
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = () => {
  const onCreated = vi.fn();
  const fetchMock = vi.fn(async () => ({
    ok: true,
    json: async () => ({ quote: { id: "LIQ-1", name: "Ana" } }),
  }));
  vi.stubGlobal("fetch", fetchMock);
  render(
    <ToastProvider>
      <NewQuoteModal open onClose={vi.fn()} onCreated={onCreated} existingQuotes={[]} />
    </ToastProvider>,
  );
  return { onCreated, fetchMock };
};

describe("Novo pedido", () => {
  it("sem nome, «Criar pedido» diz porquê em vez de ficar só cinzento", async () => {
    const { fetchMock } = abrir();
    const user = userEvent.setup();
    const criar = screen.getByRole("button", { name: /Criar pedido/ });
    expect(criar).not.toBeDisabled();
    await user.click(criar);
    expect(await screen.findByText(/Escreve o nome do cliente/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("o Enter num campo cria o pedido", async () => {
    const { onCreated, fetchMock } = abrir();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/^Nome/), "Ana{Enter}");
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onCreated).toHaveBeenCalled());
  });
});
