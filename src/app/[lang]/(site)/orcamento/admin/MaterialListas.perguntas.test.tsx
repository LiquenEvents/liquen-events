// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaterialListas from "./MaterialListas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PERGUNTA-SE O QUE É RARO E CARO; ANULA-SE O QUE É FREQUENTE E BARATO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas acções deste ecrã que deitam trabalho fora não levam o mesmo
 * tratamento, e é essa diferença que se mede aqui:
 *
 *  · **apagar uma lista base** é raro e é caro — uma lista leva meses a afinar,
 *    e nada a traz de volta. Leva PERGUNTA, e a pergunta diz quantas linhas vão
 *    com ela. Antes apagava à primeira, sem uma palavra;
 *  · **remover uma linha** é o gesto de arrumação de todos os dias. Uma caixa a
 *    perguntar em cada linha é um clique a mais por gesto e, à décima vez,
 *    ninguém a lê — que é como uma pergunta deixa de proteger o que quer que
 *    seja. Leva ANULAR: faz-se, e a linha volta com um toque, com a quantidade e
 *    o crítico que tinha.
 */

const avisos = vi.hoisted(() => ({ ditos: [] as string[] }));
vi.mock("./Toast", () => ({
  useToast: () => ({ toast: (texto: string) => avisos.ditos.push(texto) }),
}));

const LISTAS = {
  listas: [
    { id: "L1", name: "Essenciais de carrinha", isDefault: true, position: 0 },
    // A que «vai sempre» não se apaga — para medir o apagar é precisa uma segunda.
    { id: "L2", name: "Cerimónia ao ar livre", isDefault: false, position: 1 },
  ],
  linhas: [
    { id: "l1", listId: "L1", itemId: "i1", qty: 8, critical: true, position: 0 },
    { id: "l2", listId: "L2", itemId: "i1", qty: 2, critical: false, position: 0 },
    { id: "l3", listId: "L2", itemId: "i2", qty: 30, critical: false, position: 1 },
  ],
};
const CATALOGO = [
  { id: "i1", name: "Escadote", category: "Estrutura", kind: "reutilizavel", unit: "un" },
  { id: "i2", name: "Fita-cola", category: "Consumíveis", kind: "consumivel", unit: "rolo" },
];

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** Tudo o que foi escrito, para se poder provar que cancelar não escreve nada. */
let escritas: { metodo: string; url: string; corpo: unknown }[] = [];

function servidor() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    if (metodo === "GET") {
      return reply(200, String(url).includes("listas") ? LISTAS : CATALOGO);
    }
    escritas.push({
      metodo,
      url: String(url),
      corpo: init?.body ? JSON.parse(String(init.body)) : null,
    });
    return reply(200, { ok: true });
  });
}

beforeEach(() => {
  avisos.ditos = [];
  escritas = [];
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Listas base — apagar uma lista pergunta", () => {
  it("a pergunta nomeia a lista e conta as linhas que vão com ela", async () => {
    const user = userEvent.setup();
    render(<MaterialListas />);
    await screen.findByText("Cerimónia ao ar livre");
    await user.click(screen.getByRole("button", { name: /^Apagar$/i }));

    const caixa = await screen.findByRole("dialog");
    // Nomeia.
    expect(within(caixa).getByText(/Apagar a lista «Cerimónia ao ar livre»\?/i)).toBeTruthy();
    // E diz o tamanho do que se perde, em número.
    expect(within(caixa).getByText(/2 linhas de material/i)).toBeTruthy();
    // E responde à dúvida que vem sempre a seguir.
    expect(within(caixa).getByText(/checklists já geradas a partir dela não mudam/i)).toBeTruthy();
    // O botão repete o verbo — nunca «OK».
    expect(within(caixa).getByRole("button", { name: /^Apagar a lista$/i })).toBeTruthy();
  });

  it("cancelar não escreve nada", async () => {
    const user = userEvent.setup();
    render(<MaterialListas />);
    await screen.findByText("Cerimónia ao ar livre");
    await user.click(screen.getByRole("button", { name: /^Apagar$/i }));
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(escritas).toEqual([]);
    expect(screen.getByText("Cerimónia ao ar livre")).toBeTruthy();
  });

  it("responder que sim apaga mesmo", async () => {
    const user = userEvent.setup();
    render(<MaterialListas />);
    await screen.findByText("Cerimónia ao ar livre");
    await user.click(screen.getByRole("button", { name: /^Apagar$/i }));
    const caixa = await screen.findByRole("dialog");
    await user.click(within(caixa).getByRole("button", { name: /^Apagar a lista$/i }));

    await waitFor(() =>
      expect(escritas.some((e) => e.metodo === "DELETE" && e.url.endsWith("/L2"))).toBe(true),
    );
  });
});

describe("Listas base — remover uma linha anula-se", () => {
  /** Abre os «Essenciais de carrinha» e tira-lhe a linha do escadote. */
  async function removerOEscadote(user: ReturnType<typeof userEvent.setup>) {
    render(<MaterialListas />);
    await user.click(await screen.findByText("Essenciais de carrinha"));
    // Pela caixa da quantidade e não pelo nome: «Escadote» também aparece no
    // selector de «Acrescentar do catálogo», logo ali por baixo.
    const linha = (await screen.findByLabelText(/quantidade de escadote/i)).closest("li")!;
    await user.click(within(linha).getByRole("button", { name: /^Remover$/i }));
  }

  it("não pergunta nada — e fica um «Anular» a dizer o que saiu", async () => {
    const user = userEvent.setup();
    await removerOEscadote(user);

    // Nenhuma caixa pelo meio: o gesto é do dia a dia.
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() =>
      expect(escritas.some((e) => (e.corpo as { remover?: string })?.remover === "l1")).toBe(true),
    );
    // E a janela para voltar atrás, encostada à lista, a nomear a linha.
    const tira = await screen.findByRole("status");
    expect(within(tira).getByText(/«Escadote» saiu de «Essenciais de carrinha»/i)).toBeTruthy();
    expect(within(tira).getByRole("button", { name: /^Anular$/i })).toBeTruthy();
  });

  it("o «Anular» repõe a linha com a quantidade e o crítico que tinha", async () => {
    const user = userEvent.setup();
    await removerOEscadote(user);
    const tira = await screen.findByRole("status");
    await user.click(within(tira).getByRole("button", { name: /^Anular$/i }));

    await waitFor(() =>
      expect(escritas.some((e) => (e.corpo as { linha?: unknown })?.linha)).toBe(true),
    );
    const reposta = escritas.find((e) => (e.corpo as { linha?: unknown })?.linha)!;
    // Não basta o nome: o que volta é a linha inteira.
    expect((reposta.corpo as { linha: Record<string, unknown> }).linha).toMatchObject({
      itemId: "i1",
      qty: 8,
      critical: true,
    });
    // E a tira sai do ecrã, para dois toques não porem duas linhas iguais.
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
  });
});
