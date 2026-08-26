// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS ACÇÕES QUE DEITAVAM TRABALHO FORA SEM PERGUNTAR NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do inventário: 63 acções irreversíveis, 39 sem uma pergunta que diga o que se
 * perde. Neste ecrã havia duas, e nenhuma perguntava fosse o que fosse:
 *
 *  · **remover do catálogo** apagava à primeira. Numa lista de dezenas de
 *    linhas todas com o mesmo botão no mesmo sítio, o clique ao lado apaga o
 *    material errado — e a consequência não se vê aqui: vê-se na véspera do
 *    evento, quando a lista base de quem carrega a carrinha passa a dizer
 *    «(item removido do catálogo)»;
 *  · **cancelar uma importação já lida** deitava fora um ensaio de centenas de
 *    linhas que o servidor já tinha corrido, com o botão encostado ao «Gravar».
 *
 * O que se mede aqui é o que a pergunta DIZ — o nome e o número — e que
 * responder que não não escreve nada.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ESCADOTE = {
  id: "i1",
  name: "Escadote 3 degraus",
  category: "Ferramentas",
  kind: "reutilizavel" as const,
  unit: "un",
  stock: 4,
  minStock: 2,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const PLANO = {
  novos: 12,
  atualizados: 200,
  erros: 0,
  linhas: [],
};

/** Regista os métodos usados, para se provar que cancelar NÃO escreve. */
let chamadas: { metodo: string; url: string }[] = [];

function servidor() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    chamadas.push({ metodo, url: String(url) });
    if (metodo === "GET") return reply(200, [ESCADOTE]);
    if (String(url).includes("/importar")) return reply(200, PLANO);
    return reply(200, { ok: true });
  });
}

const montar = () =>
  render(
    <ToastProvider>
      <Material />
    </ToastProvider>,
  );

beforeEach(() => {
  __resetListCache();
  chamadas = [];
  vi.stubGlobal("fetch", servidor());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Catálogo — remover material", () => {
  it("a pergunta nomeia o item e diz o stock que deixa de estar registado", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Escadote 3 degraus");
    await user.click(screen.getByRole("button", { name: /^Remover$/i }));

    const caixa = await screen.findByRole("dialog");
    // Nomeia.
    expect(within(caixa).getByText(/Remover «Escadote 3 degraus» do catálogo\?/i)).toBeTruthy();
    // E diz o tamanho do que se perde, em número.
    expect(within(caixa).getByText(/4 un em stock/i)).toBeTruthy();
    expect(within(caixa).getByText(/mínimo de 2/i)).toBeTruthy();
    // E a consequência que não se vê deste ecrã.
    expect(within(caixa).getByText(/item removido do catálogo/i)).toBeTruthy();
    // O botão repete o verbo — nunca «OK».
    expect(within(caixa).getByRole("button", { name: /^Remover do catálogo$/i })).toBeTruthy();
  });

  it("cancelar não escreve nada", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Escadote 3 degraus");
    await user.click(screen.getByRole("button", { name: /^Remover$/i }));

    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chamadas.filter((c) => c.metodo === "DELETE")).toEqual([]);
    // E o item continua no catálogo.
    expect(screen.getByText("Escadote 3 degraus")).toBeTruthy();
  });

  it("responder que sim apaga mesmo", async () => {
    const user = userEvent.setup();
    montar();
    await screen.findByText("Escadote 3 degraus");
    await user.click(screen.getByRole("button", { name: /^Remover$/i }));
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Remover do catálogo$/i }));

    await waitFor(() => expect(chamadas.some((c) => c.metodo === "DELETE")).toBe(true));
  });
});

describe("Catálogo — cancelar uma importação já lida", () => {
  /** Escolhe um CSV e espera pelo painel do ensaio. */
  async function comEnsaioAberto(user: ReturnType<typeof userEvent.setup>) {
    montar();
    await screen.findByText("Escadote 3 degraus");
    const ficheiro = document.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(
      ficheiro,
      new File(["nome,categoria\nEscadote,Ferramentas\n"], "material.csv", { type: "text/csv" }),
    );
    await screen.findByText("Antes de gravar:");
  }

  it("a pergunta nomeia o ficheiro e conta as linhas que estavam à espera", async () => {
    const user = userEvent.setup();
    await comEnsaioAberto(user);
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));

    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(/Deitar fora a importação de «material\.csv»\?/i)).toBeTruthy();
    expect(within(caixa).getByText(/12 linhas novas e 200 a atualizar/i)).toBeTruthy();
    expect(within(caixa).getByText(/212 ao todo/i)).toBeTruthy();
    // A dúvida imediata de quem carregou por engano.
    expect(within(caixa).getByText(/Nada foi gravado/i)).toBeTruthy();
  });

  it("cancelar a pergunta deixa o ensaio como estava", async () => {
    const user = userEvent.setup();
    await comEnsaioAberto(user);
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    // O painel continua lá — não é preciso ir buscar o ficheiro outra vez.
    expect(screen.getByText("Antes de gravar:")).toBeTruthy();
  });

  it("responder que sim deita fora o ensaio", async () => {
    const user = userEvent.setup();
    await comEnsaioAberto(user);
    await user.click(screen.getByRole("button", { name: /^Cancelar$/i }));
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Deitar fora$/i }));

    await waitFor(() => expect(screen.queryByText("Antes de gravar:")).toBeNull());
  });
});
