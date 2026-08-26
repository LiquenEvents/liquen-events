// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Fornecedores from "./Fornecedores";
import { supplierUpdateSchema } from "@/lib/validation";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA AVALIAÇÃO QUE SE PODIA PÔR MAS NUNCA TIRAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Clicar na estrela que já está acesa devia apagar a avaliação — é o gesto que
 * toda a gente conhece e é o único caminho para desfazer um clique enganado.
 * O ecrã mandava `rating: 0`, e o `supplierUpdateSchema` da rota só aceita
 * 1 a 5 (ou nulo): a resposta era 400, as estrelas voltavam ao que estavam e
 * ela ficava com um "Não foi possível guardar as alterações" sem perceber
 * porquê — num ecrã onde tudo o resto grava.
 *
 * O `fetch` daqui corre o corpo pelo MESMO schema que a rota corre, para o teste
 * falhar pela razão verdadeira e não por uma imitação simpática do servidor.
 */

const FORNECEDOR = {
  id: "f1",
  name: "Flores do Alentejo",
  category: "Flores",
  phone: "266000000",
  email: "geral@exemplo.pt",
  location: "Évora",
  notes: "Entrega até às 10h",
  rating: 3,
};

// As mesmas chaves que o PATCH de /api/fornecedores/[id] deixa passar.
const ALLOWED = ["name", "category", "email", "phone", "location", "notes", "rating", "preferred"];

let estado: Record<string, unknown>;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetListCache();
  estado = { ...FORNECEDOR };
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
    const cabecalho = { headers: new Headers() };
    if (!init?.method || init.method === "GET") {
      return { ok: true, status: 200, ...cabecalho, json: async () => [estado] } as Response;
    }
    const body = JSON.parse(String(init.body ?? "{}")) as Record<string, unknown>;
    const picked: Record<string, unknown> = {};
    for (const k of ALLOWED) if (k in body) picked[k] = body[k];
    const parsed = supplierUpdateSchema.safeParse(picked);
    if (!parsed.success) {
      return {
        ok: false,
        status: 400,
        ...cabecalho,
        json: async () => ({ error: "Corpo inválido" }),
      } as Response;
    }
    estado = { ...estado, ...parsed.data };
    return { ok: true, status: 200, ...cabecalho, json: async () => estado } as Response;
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Fornecedores />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Flores do Alentejo")).toBeInTheDocument());
}

describe("Fornecedores — avaliação em estrelas", () => {
  it("clicar na estrela acesa apaga a avaliação, sem erro nenhum", async () => {
    const user = userEvent.setup();
    await montar();
    expect(screen.getByText("3/5")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "3 estrelas" }));

    expect(await screen.findByText("—")).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível guardar as alterações/)).not.toBeInTheDocument();
  });

  it("o corpo enviado para apagar a avaliação é aceite pelo schema da rota", async () => {
    const user = userEvent.setup();
    await montar();

    await user.click(screen.getByRole("button", { name: "3 estrelas" }));

    const patch = fetchMock.mock.calls.find((c) => (c[1] as RequestInit)?.method === "PATCH");
    const corpo = JSON.parse(String((patch![1] as RequestInit).body));
    expect(supplierUpdateSchema.safeParse(corpo).success).toBe(true);
  });

  it("mudar a avaliação para outra estrela continua a funcionar", async () => {
    const user = userEvent.setup();
    await montar();

    await user.click(screen.getByRole("button", { name: "5 estrelas" }));

    expect(await screen.findByText("5/5")).toBeInTheDocument();
    expect(screen.queryByText(/Não foi possível guardar as alterações/)).not.toBeInTheDocument();
  });
});
