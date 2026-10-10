// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";
import MaterialRegras from "./MaterialRegras";
import Fornecedores from "./Fornecedores";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * R2b — «ANULAR» NO MATERIAL, NAS REGRAS E NOS FORNECEDORES
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10, `docs/TUDO-REVERSIVEL.md`). Nestes três ecrãs o valor de antes
 * está à mão no momento do gesto, e o «Anular» grava-o pelo mesmo caminho:
 *
 *  · editar um item do catálogo → o mesmo PATCH, com o item como estava;
 *  · acrescentar um item → apaga-se o que se criou;
 *  · ligar/desligar uma regra → o contrário;
 *  · estrelas, preferido e editar um fornecedor → os campos tocados como
 *    estavam, com `null` onde antes não havia nada.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

let escritas: { metodo: string; url: string; corpo: Record<string, unknown> | null }[] = [];

beforeEach(() => {
  __resetListCache();
  escritas = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const comAviso = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe("Catálogo de material", () => {
  const ESCADOTE = {
    id: "i1",
    name: "Escadote 3 degraus",
    category: "Ferramentas",
    kind: "reutilizavel" as const,
    unit: "un",
    stock: 2,
    minStock: null,
    notes: "",
    updatedAt: "2026-08-01T00:00:00.000Z",
  };

  function servidor() {
    let item: Record<string, unknown> = { ...ESCADOTE };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        if (metodo === "GET") return reply(200, [item]);
        const corpo = init?.body ? JSON.parse(String(init.body)) : null;
        escritas.push({ metodo, url: String(url), corpo });
        if (metodo === "PATCH") item = { ...item, ...corpo };
        if (metodo === "POST") return reply(200, { ...ESCADOTE, ...corpo, id: "novo" });
        return reply(200, metodo === "PATCH" ? item : { ok: true });
      }),
    );
  }

  it("editar anula-se gravando o item como estava", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(<Material />);
    await screen.findByText("Escadote 3 degraus");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const stock = screen.getByLabelText("Stock");
    await user.clear(stock);
    await user.type(stock, "5");
    await user.click(screen.getByRole("button", { name: "Guardar" }));
    expect(await screen.findByText(/«Escadote 3 degraus» guardado/)).toBeTruthy();
    expect(escritas[0].corpo?.stock).toBe(5);

    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas[1]).toMatchObject({ metodo: "PATCH", url: "/api/material/i1" });
    expect(escritas[1].corpo?.stock).toBe(2);
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });
});

describe("Regras de material", () => {
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

  it("desligar anula-se voltando a ligar", async () => {
    let regra = { ...REGRA };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        if (metodo === "GET") {
          if (String(url).includes("regras")) return reply(200, [regra]);
          if (String(url).includes("listas")) return reply(200, { listas: [], linhas: [] });
          return reply(200, []);
        }
        const corpo = init?.body ? JSON.parse(String(init.body)) : null;
        escritas.push({ metodo, url: String(url), corpo });
        regra = { ...regra, ...corpo };
        return reply(200, { ok: true });
      }),
    );
    const user = userEvent.setup();
    comAviso(<MaterialRegras />);
    await screen.findByText("Arco floral leva estrutura");
    await user.click(screen.getByRole("button", { name: "Desligar" }));
    expect(await screen.findByText(/Regra «Arco floral leva estrutura» desligada/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas.map((e) => e.corpo?.enabled)).toEqual([false, true]);
    expect(await screen.findByRole("button", { name: "Desligar" })).toBeTruthy();
  });
});

describe("Fornecedores", () => {
  const FORNECEDOR = {
    id: "f1",
    name: "Flores do Alentejo",
    category: "Flores",
    phone: "266000000",
    location: "Évora",
    rating: 3,
  };

  function servidor() {
    let estado: Record<string, unknown> = { ...FORNECEDOR };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        if (metodo === "GET") return reply(200, [estado]);
        const corpo = init?.body ? JSON.parse(String(init.body)) : null;
        escritas.push({ metodo, url: String(url), corpo });
        estado = { ...estado, ...corpo };
        return reply(200, estado);
      }),
    );
  }

  it("as estrelas anulam-se para a avaliação de antes", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(<Fornecedores />);
    await screen.findByText("Flores do Alentejo");
    await user.click(screen.getByRole("button", { name: "5 estrelas" }));
    expect(await screen.findByText(/«Flores do Alentejo» com 5 estrelas/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas.map((e) => e.corpo)).toEqual([{ rating: 5 }, { rating: 3 }]);
    expect(await screen.findByText("3/5")).toBeTruthy();
  });

  it("marcar como preferido anula-se com `null` — antes não havia nada", async () => {
    servidor();
    const user = userEvent.setup();
    comAviso(<Fornecedores />);
    await screen.findByText("Flores do Alentejo");
    await user.click(screen.getAllByTitle("Marcar como preferido")[0]);
    expect(await screen.findByText(/marcado como preferido/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas.map((e) => e.corpo)).toEqual([{ preferred: true }, { preferred: null }]);
  });
});
