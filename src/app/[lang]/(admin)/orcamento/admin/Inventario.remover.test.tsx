// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Inventario from "./Inventario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DESFAZER UMA REMOÇÃO NÃO PODE RESSUSCITAR OUTRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `remove()` do inventário tirava a linha do ecrã e, se o servidor recusasse,
 * repunha a lista INTEIRA como estava antes de carregar:
 *
 *     const snapshot = items;        // ← a lista como estava neste desenho
 *     setItems((prev) => prev.filter(…));
 *     …
 *     else { setItems(snapshot); }   // ← e agora, depois do `await`
 *
 * Esse `snapshot` foi lido antes do pedido, e é a lista de um instante que já
 * passou. A pergunta fecha assim que se responde e não espera pelo servidor:
 * dois «Remover» confirmados de seguida põem dois DELETE no ar, e o que falha
 * repõe o mundo anterior aos DOIS — traz de volta o adereço que o servidor já
 * apagou.
 *
 * O inventário fica a afirmar que existe um adereço que já não existe, e como o
 * `setData` do `useCachedList` escreve através para a cache, o fantasma
 * sobrevive a mudar de ecrã e voltar. É o mesmo defeito que o catálogo de
 * Material já tinha corrigido (ver `Material.remover.test.tsx`), e a mesma
 * correcção: repor SÓ a linha que falhou, e só se ela não estiver já na lista.
 *
 * A segunda metade é a frase. «Não foi possível remover o item.» não dizia qual
 * dos dois voltou ao ecrã — e servia igual para a rede em baixo, a sessão
 * expirada e o adereço que outra pessoa já tinha apagado.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const base = { category: "Decoração", unit: "un", condition: "bom" as const, location: "Armazém" };
const ARCO = { ...base, id: "a1", name: "Arco de cerimónia", quantity: 2 };
const CASTICAIS = { ...base, id: "a2", name: "Castiçais de latão", quantity: 12 };

/** O «Remover» da linha deste adereço (o dos cartões, que existe sempre). */
const removerDe = (nome: string) =>
  within(screen.getAllByText(nome)[0].closest("li")!).getByRole("button", { name: "Remover" });

/**
 * O inventário pergunta antes de remover, e a pergunta é a da casa
 * (`ui/PerguntaDestrutiva`) — não o `confirm()` do browser, que era o que
 * estava aqui. Ver `Inventario.perguntas.test.tsx` para o que ela diz; aqui
 * responde-se que sim e segue-se.
 */
async function confirmarRemocao(user: ReturnType<typeof userEvent.setup>) {
  const caixa = await screen.findByRole("dialog");
  await user.click(within(caixa).getByRole("button", { name: /^Remover do inventário$/i }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}

beforeEach(() => {
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Inventário — duas remoções ao mesmo tempo", () => {
  it("a que falha não traz de volta o adereço que o servidor apagou", async () => {
    // O apagamento do arco fica pendurado e só depois recusa; o dos castiçais
    // responde logo que sim.
    let recusarArco: (() => void) | null = null;
    const arcoPendente = new Promise<Response>((resolve) => {
      recusarArco = () => resolve(reply(500, { error: "não deu" }));
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") {
          return String(url).endsWith("/a1") ? arcoPendente : reply(200, { ok: true });
        }
        return reply(200, [ARCO, CASTICAIS]);
      }),
    );

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Inventario />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("Arco de cerimónia").length).toBeGreaterThan(0));

    await user.click(removerDe("Arco de cerimónia"));
    await confirmarRemocao(user);
    await user.click(removerDe("Castiçais de latão"));
    await confirmarRemocao(user);
    await waitFor(() => expect(screen.queryByText("Castiçais de latão")).toBeNull());

    // Só agora o servidor recusa o primeiro apagamento.
    recusarArco!();

    // O arco volta — está certo, o servidor recusou-o.
    await waitFor(() => expect(screen.getAllByText("Arco de cerimónia").length).toBeGreaterThan(0));
    // Os castiçais NÃO podem voltar: esses foram mesmo apagados.
    expect(
      screen.queryByText("Castiçais de latão"),
      "o inventário voltou a afirmar que existe um adereço que já foi apagado",
    ).toBeNull();
  });

  it("e a frase nomeia o adereço que voltou ao ecrã", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) =>
        init?.method === "DELETE" ? reply(404, {}) : reply(200, [ARCO, CASTICAIS]),
      ),
    );

    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Inventario />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("Arco de cerimónia").length).toBeGreaterThan(0));

    await user.click(removerDe("Arco de cerimónia"));
    await confirmarRemocao(user);

    // Nomeia a coisa, diz o que se passou e o que fazer — «Não foi possível
    // remover o item.» mandava tentar outra vez uma remoção que falha sempre.
    await waitFor(() => expect(screen.getByText(/já não existe/i)).toBeTruthy());
    expect(screen.getByText(/remover «Arco de cerimónia» do inventário/)).toBeTruthy();
    expect(screen.getByText(/recarrega a página/i)).toBeTruthy();
  });
});
