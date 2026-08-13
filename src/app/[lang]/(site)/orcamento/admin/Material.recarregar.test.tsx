// @vitest-environment jsdom
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";
import MaterialListas from "./MaterialListas";
import MaterialRegras from "./MaterialRegras";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A RELEITURA DEPOIS DE GRAVAR TAMBÉM PODE FALHAR — E NINGUÉM OLHAVA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A LEITURA de arranque já estava tratada: falha → `AvisoDeFalha` com a frase
 * do servidor (ver `Material.falha.test.tsx`). O que nenhum dos três ecrãs
 * verificava era a releitura que fazem A SEGUIR A GRAVAR:
 *
 *     const lista = await fetch("/api/material").then((x) => x.json());
 *     setItems(lista);
 *
 * Sem `res.ok`, o corpo de um 401/503 — `{ error: "…" }` — entra no estado como
 * se fosse a lista. E o `setData` do `useCachedList` escreve através para a
 * cache, por isso o objecto de erro fica lá até se recarregar a página inteira.
 *
 * A partir daí cada ecrã morre à sua maneira:
 *
 *  · Catálogo e Regras fazem `.filter`/`.map` sobre esse objecto — o React
 *    aborta a árvore e o BACK OFFICE INTEIRO é substituído pelo ecrã de erro,
 *    com a gaveta aberta e o que lá estivesse por gravar a ir com ele;
 *  · as Listas base leem `data?.listas ?? []`, portanto não rebentam: ficam
 *    VAZIAS, em silêncio, a dizer "Ainda não há listas" logo a seguir a se ter
 *    criado uma. E como a cache é a mesma que as Regras leem, cada regra passa
 *    a apontar para "(lista apagada)".
 *
 * E o gatilho não é exótico: a sessão do back office caduca sozinha, e basta
 * caducar ENTRE a gravação e a releitura.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const FALTA_SCHEMA =
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cola e corre o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarrega esta página.";

const ITEM = {
  id: "i1",
  name: "Escadote 3 degraus",
  category: "Ferramentas",
  kind: "reutilizavel" as const,
  unit: "un",
  stock: 2,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const LISTA = {
  id: "l1",
  name: "Essenciais de carrinha",
  isDefault: true,
  createdAt: "2026-08-01T00:00:00.000Z",
  updatedAt: "2026-08-01T00:00:00.000Z",
};

const LINHA = { id: "ln1", listId: "l1", itemId: "i1", qty: 1, critical: true, position: 0 };

const REGRA = {
  id: "r1",
  name: "Arco floral leva estrutura",
  enabled: true,
  matchKind: "servico" as const,
  matchValue: "arco floral",
  action: "add_list" as const,
  listId: "l1",
  position: 0,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/**
 * A rede de segurança que o back office tem à volta destas vistas. Se ela
 * apanhar alguma coisa, é porque o ecrã inteiro caiu — que é exactamente o
 * desfecho em causa.
 */
class Rede extends React.Component<{ children: React.ReactNode }, { caiu: boolean }> {
  state = { caiu: false };
  static getDerivedStateFromError() {
    return { caiu: true };
  }
  render() {
    return this.state.caiu ? <p>O BACK OFFICE CAIU</p> : this.props.children;
  }
}

const montar = (no: React.ReactNode) =>
  render(
    <Rede>
      <ToastProvider>{no}</ToastProvider>
    </Rede>,
  );

const caiu = () => screen.queryByText("O BACK OFFICE CAIU") !== null;

let silenciarErros: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  __resetListCache();
  // O React escreve a árvore rebentada na consola antes de a rede a apanhar.
  silenciarErros = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  silenciarErros.mockRestore();
  vi.unstubAllGlobals();
});

describe("Catálogo — a releitura a seguir a uma importação", () => {
  it("uma releitura falhada não derruba o back office nem apaga o catálogo do ecrã", async () => {
    let catalogoEmBaixo = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/material/importar")) {
        const corpo = JSON.parse(String(init?.body ?? "{}"));
        return corpo.aplicar
          ? reply(200, { criados: 1, atualizados: 0, ignorados: 0 })
          : reply(200, { novos: 1, atualizados: 0, erros: 0, linhas: [] });
      }
      if (u === "/api/material") {
        return catalogoEmBaixo ? reply(503, { error: FALTA_SCHEMA }) : reply(200, [ITEM]);
      }
      return reply(200, []);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container } = montar(<Material />);
    await waitFor(() => expect(screen.getByText("Escadote 3 degraus")).toBeTruthy());

    // Escolher o ficheiro: a pré-visualização aparece com o botão de gravar.
    const ficheiro = container.querySelector('input[type="file"]') as HTMLInputElement;
    await act(async () => {
      fireEvent.change(ficheiro, {
        target: { files: [new File(["nome,stock\nLuvas,7\n"], "m.csv", { type: "text/csv" })] },
      });
    });
    await waitFor(() => expect(screen.getByRole("button", { name: "Gravar" })).toBeTruthy());

    // A sessão caduca entre gravar e reler.
    catalogoEmBaixo = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "Gravar" }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => String(c[0]) === "/api/material").length).toBe(2),
    );

    expect(caiu(), "o corpo de erro entrou no estado e o `.filter` do catálogo atirou").toBe(false);
    // E o que estava no ecrã continua lá: uma releitura que falhou não é um
    // catálogo vazio.
    expect(screen.getByText("Escadote 3 degraus")).toBeTruthy();
  });
});

describe("Regras — a releitura a seguir a desligar uma regra", () => {
  it("uma releitura falhada não derruba o back office nem apaga as regras do ecrã", async () => {
    let regrasEmBaixo = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/material/regras")) {
        if (init?.method === "PATCH") return reply(200, { ...REGRA, enabled: false });
        return regrasEmBaixo ? reply(503, { error: FALTA_SCHEMA }) : reply(200, [REGRA]);
      }
      if (u.includes("/listas")) return reply(200, { listas: [LISTA], linhas: [LINHA] });
      return reply(200, [ITEM]);
    });
    vi.stubGlobal("fetch", fetchMock);

    montar(<MaterialRegras />);
    await waitFor(() => expect(screen.getByText("Arco floral leva estrutura")).toBeTruthy());

    regrasEmBaixo = true;
    await userEvent.setup().click(screen.getByRole("button", { name: "Desligar" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          (c) => String(c[0]).includes("/api/material/regras") && !(c[1] as RequestInit)?.method,
        ).length,
      ).toBe(2),
    );

    expect(caiu(), "o corpo de erro entrou no estado e o `.map` das regras atirou").toBe(false);
    expect(screen.getByText("Arco floral leva estrutura")).toBeTruthy();
  });
});

describe("Listas base — a releitura a seguir a criar uma lista", () => {
  it("uma releitura falhada não faz as listas desaparecerem em silêncio", async () => {
    let listasEmBaixo = false;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/material/listas")) {
        if (init?.method === "POST") return reply(200, { ...LISTA, id: "l2", name: "Nova" });
        return listasEmBaixo
          ? reply(503, { error: FALTA_SCHEMA })
          : reply(200, { listas: [LISTA], linhas: [LINHA] });
      }
      return reply(200, [ITEM]);
    });
    vi.stubGlobal("fetch", fetchMock);

    const user = userEvent.setup();
    montar(<MaterialListas />);
    await waitFor(() => expect(screen.getByText("Essenciais de carrinha")).toBeTruthy());

    await user.type(screen.getByLabelText("Lista nova"), "Cerimónia ao ar livre");
    listasEmBaixo = true;
    await user.click(screen.getByRole("button", { name: "Criar" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.filter(
          (c) => String(c[0]).includes("/api/material/listas") && !(c[1] as RequestInit)?.method,
        ).length,
      ).toBe(2),
    );

    // A que ela tinha à frente não pode evaporar-se porque a releitura falhou —
    // e muito menos ser substituída por "Ainda não há listas", que é o convite
    // a semear os essenciais uma segunda vez.
    expect(
      screen.queryByText("Ainda não há listas"),
      "a releitura falhada apagou as listas do ecrã",
    ).toBeNull();
    expect(screen.getByText("Essenciais de carrinha")).toBeTruthy();
  });
});
