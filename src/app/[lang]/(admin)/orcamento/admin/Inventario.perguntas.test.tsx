// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Inventario from "./Inventario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O `confirm()` DO BROWSER NÃO CABE NUM TELEMÓVEL — E NÃO DIZIA NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estava aqui era:
 *
 *     confirm('Remover o item "Arco de cerimónia"? Esta ação não pode ser
 *     anulada.')
 *
 * Nomeava o adereço, o que já era mais do que a maioria fazia. Mas «não pode
 * ser anulada» é a única coisa que quem carregou no botão já sabia — e a caixa
 * do sistema não cabe em 375 px sem cortar a frase, não se traduz, não tem o
 * desenho da casa e bloqueia o browser enquanto está aberta. Este inventário
 * usa-se no armazém, ao telemóvel.
 *
 * O que se mede: que a pergunta é agora a da casa (`ui/PerguntaDestrutiva`),
 * que diz o TAMANHO do que sai — a quantidade e o sítio — e que responder que
 * não não escreve nada.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ARCO = {
  id: "a1",
  name: "Arco de cerimónia",
  category: "Decoração",
  quantity: 2,
  unit: "un",
  condition: "bom" as const,
  location: "Armazém A, prateleira 3",
};

let chamadas: { metodo: string; url: string }[] = [];

function servidor() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    chamadas.push({ metodo, url: String(url) });
    if (metodo === "GET") return reply(200, [ARCO]);
    return reply(200, { ok: true });
  });
}

/** O «Remover» do cartão do telemóvel, que existe sempre. */
const removerDoArco = () =>
  within(screen.getAllByText("Arco de cerimónia")[0].closest("li")!).getByRole("button", {
    name: "Remover",
  });

async function abrirAPergunta(user: ReturnType<typeof userEvent.setup>) {
  render(
    <ToastProvider>
      <Inventario />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getAllByText("Arco de cerimónia").length).toBeGreaterThan(0));
  await user.click(removerDoArco());
  return screen.findByRole("dialog");
}

beforeEach(() => {
  __resetListCache();
  chamadas = [];
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Inventário — remover um adereço", () => {
  it("a pergunta nomeia o adereço e diz quantas unidades saem, e de onde", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);

    expect(within(caixa).getByText(/Remover «Arco de cerimónia» do inventário\?/i)).toBeTruthy();
    expect(within(caixa).getByText(/2 un registadas em Armazém A, prateleira 3/i)).toBeTruthy();
    // Onde é que a falta se vai notar: o modo de carga é o que ela usa na véspera.
    expect(within(caixa).getByText(/modo de carga/i)).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Remover do inventário$/i })).toBeTruthy();
  });

  it("cancelar não escreve nada", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chamadas.filter((c) => c.metodo === "DELETE")).toEqual([]);
    expect(screen.getAllByText("Arco de cerimónia").length).toBeGreaterThan(0);
  });

  it("responder que sim apaga mesmo", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Remover do inventário$/i }));

    await waitFor(() => expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true));
  });
});
