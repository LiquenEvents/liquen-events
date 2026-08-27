// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventMaterialPanel from "./EventMaterial";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO FOI POSSÍVEL GERAR A CHECKLIST» — POR CIMA DA CHECKLIST GERADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `gerar()` escrevia o estado e só DEPOIS montava a frase de sucesso, com
 * `r.itens.length` cru. Numa resposta 200 sem `itens` — a geração correu, mas o
 * corpo não trouxe a lista — o `.length` atirava, o `catch` apanhava, e o painel
 * ficava com a checklist no ecrã e um aviso por cima a dizer que a geração
 * falhou.
 *
 * Não é um aviso inofensivo: o passo seguinte que ele sugere é carregar em
 * «Voltar a gerar», e a geração só preserva o que está carregado, as notas e o
 * veículo — as marcações de devolvido e de em falta ficam para trás.
 *
 * E quando falha a sério, a frase tem de dizer QUAL evento: este painel vive
 * dentro da gaveta de um pedido, e quem tem seis gavetas abertas não sabe de
 * qual é o aviso.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const QUOTE = { id: "q1", name: "Casamento Ana & Rui" } as Quote;

const montar = () =>
  render(
    <ToastProvider>
      <EventMaterialPanel quote={QUOTE} />
    </ToastProvider>,
  );

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Material do evento — gerar a checklist", () => {
  it("não diz que a geração falhou quando ela correu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST"
          ? // Correu, mas o corpo não traz a lista. Era aqui que o `.length`
            // atirava depois de o estado já estar escrito.
            reply(200, { evento: { id: "e1", status: "por_carregar" } })
          : reply(200, { evento: null, itens: [] }),
      ),
    );

    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Gerar checklist/ }));

    await waitFor(() => expect(screen.getByText(/Checklist gerada/)).toBeTruthy());
    expect(
      screen.queryByText(/não deu para gerar/i),
      "dizia que a geração falhou por cima da checklist que ela tinha acabado de gerar",
    ).toBeNull();
  });

  it("e quando falha a sério, nomeia o evento e diz o que fazer", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) =>
        init?.method === "POST" ? reply(404, {}) : reply(200, { evento: null, itens: [] }),
      ),
    );

    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /Gerar checklist/ }));

    await waitFor(() => expect(screen.getByText(/já não existe/i)).toBeTruthy());
    expect(screen.getByText(/gerar a checklist de material de «Casamento Ana & Rui»/)).toBeTruthy();
    expect(screen.getByText(/recarrega a página/i)).toBeTruthy();
  });
});
