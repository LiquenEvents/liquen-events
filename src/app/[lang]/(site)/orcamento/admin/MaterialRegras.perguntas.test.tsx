// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __resetListCache } from "./useCachedList";
import MaterialRegras from "./MaterialRegras";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR UMA REGRA APAGA UM AUTOMATISMO — e isso não se vê ao olhar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O «Apagar» de uma regra apagava à primeira, sem uma palavra. E o que se perde
 * aqui não é uma linha de dados: é a condição escrita à mão («quando a proposta
 * disser arco floral») e tudo o que ela acrescentava sozinha às checklists a
 * partir daí. Quem apaga por engano não dá por isso nesse dia — dá por isso no
 * evento seguinte, quando a estrutura do arco não vai na carrinha.
 *
 * Por isso a pergunta diz as duas coisas, com número: o que ela acrescentava (a
 * lista, e quantas linhas tem) e a condição que desaparece com ela. E aponta a
 * saída barata que já existia no ecrã ao lado — «Desligar» guarda a regra.
 */

const avisos = vi.hoisted(() => ({ ditos: [] as string[] }));
vi.mock("./Toast", () => ({
  useToast: () => ({ toast: (texto: string) => avisos.ditos.push(texto) }),
}));

const REGRA = {
  id: "r1",
  name: "Arco floral leva estrutura",
  enabled: true,
  matchKind: "texto" as const,
  matchValue: "arco floral",
  action: "add_list" as const,
  listId: "L2",
  position: 0,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const LISTAS = {
  listas: [{ id: "L2", name: "Estrutura e fixação", isDefault: false, position: 0 }],
  linhas: [
    { id: "l1", listId: "L2", itemId: "i1", qty: 1, critical: true, position: 0 },
    { id: "l2", listId: "L2", itemId: "i1", qty: 4, critical: false, position: 1 },
    { id: "l3", listId: "L2", itemId: "i1", qty: 2, critical: false, position: 2 },
  ],
};

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

let escritas: { metodo: string; url: string }[] = [];

function servidor() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    if (metodo === "GET") {
      if (String(url).includes("regras")) return reply(200, [REGRA]);
      if (String(url).includes("listas")) return reply(200, LISTAS);
      return reply(200, []);
    }
    escritas.push({ metodo, url: String(url) });
    return reply(200, { ok: true });
  });
}

beforeEach(() => {
  __resetListCache();
  avisos.ditos = [];
  escritas = [];
  vi.stubGlobal("fetch", servidor());
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function abrirAPergunta(user: ReturnType<typeof userEvent.setup>) {
  render(<MaterialRegras />);
  await screen.findByText("Arco floral leva estrutura");
  await user.click(screen.getByRole("button", { name: /^Apagar$/i }));
  return screen.findByRole("dialog");
}

describe("Regras — apagar uma regra", () => {
  it("a pergunta nomeia a regra e diz o que ela deixa de acrescentar, com o número", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);

    expect(within(caixa).getByText(/Apagar a regra «Arco floral leva estrutura»\?/i)).toBeTruthy();
    // O que ela acrescentava, e o tamanho disso.
    expect(within(caixa).getByText(/«Estrutura e fixação» \(3 linhas\)/i)).toBeTruthy();
    // E a condição escrita à mão, que é o que não se reescreve de cabeça.
    expect(within(caixa).getByText(/a condição escrita à mão:.*“arco floral”/i)).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Apagar a regra$/i })).toBeTruthy();
  });

  it("oferece a alternativa não destrutiva", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    // Quem está a afinar regras quase sempre quer desligar, não apagar.
    expect(within(caixa).getByText(/Desligar/i)).toBeTruthy();
  });

  it("cancelar não escreve nada", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(escritas).toEqual([]);
    expect(screen.getByText("Arco floral leva estrutura")).toBeTruthy();
  });

  it("responder que sim apaga mesmo", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Apagar a regra$/i }));

    await waitFor(() =>
      expect(escritas.some((e) => e.metodo === "DELETE" && e.url.endsWith("/r1"))).toBe(true),
    );
  });
});
