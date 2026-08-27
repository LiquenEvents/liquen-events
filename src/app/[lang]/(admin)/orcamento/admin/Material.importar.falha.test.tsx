// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «A IMPORTAÇÃO FALHOU» — SOBRE UMA IMPORTAÇÃO QUE ENTROU TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `aplicarImportacao` fazia `const r = await res.json()` e logo a seguir
 * montava a frase com `${r.criados} novos`. Uma resposta 200 cujo corpo não se
 * consegue ler — um proxy pelo meio, a resposta cortada — atirava DEPOIS de as
 * centenas de linhas já terem entrado no catálogo, e o `catch` dizia «A
 * importação falhou.». Quem lê isso importa o ficheiro outra vez.
 *
 * E quando falha a sério, a frase tem de dizer QUE ficheiro e o que fazer: «A
 * importação falhou.» era a mesma para a rede em baixo, a sessão expirada, o
 * CSV recusado e o servidor em baixo — e o painel do ensaio desaparecia com
 * ela, obrigando a escolher o ficheiro de novo para repetir.
 */

function resposta(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => corpo,
  } as unknown as Response;
}

/** Um 200 cujo corpo não se consegue ler. */
const corpoIlegivel = () =>
  ({
    ok: true,
    status: 200,
    headers: new Headers(),
    json: async () => {
      throw new SyntaxError("Unexpected token < in JSON");
    },
  }) as unknown as Response;

const ITEM = {
  id: "i1",
  name: "Escadote 3 degraus",
  category: "Ferramentas",
  kind: "reutilizavel" as const,
  unit: "un",
  stock: 2,
  updatedAt: "2026-08-01T00:00:00.000Z",
};
const PLANO = { novos: 2, atualizados: 1, erros: 0, linhas: [] };

/** Monta o ecrã, escolhe um ficheiro e espera pelo botão «Gravar» do ensaio. */
async function chegarAoBotaoDeGravar(escrita: () => Response) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/material/importar")) {
        const corpo = JSON.parse(String(init?.body ?? "{}"));
        return corpo.aplicar ? escrita() : resposta(200, PLANO);
      }
      return resposta(200, [ITEM]);
    }),
  );

  const { container } = render(
    <ToastProvider>
      <Material />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Escadote 3 degraus")).toBeTruthy());

  const ficheiro = container.querySelector('input[type="file"]') as HTMLInputElement;
  await act(async () => {
    fireEvent.change(ficheiro, {
      target: {
        files: [new File(["nome,stock\nLuvas,7\n"], "material.csv", { type: "text/csv" })],
      },
    });
  });
  return await screen.findByRole("button", { name: "Gravar" });
}

beforeEach(() => {
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("importar material — o que se diz quando não corre bem", () => {
  it("não diz que a importação falhou quando ela entrou", async () => {
    const gravar = await chegarAoBotaoDeGravar(corpoIlegivel);
    fireEvent.click(gravar);

    await waitFor(() => expect(screen.getByText(/Importação gravada/)).toBeTruthy());
    expect(
      screen.queryByText(/A importação falhou/),
      "mandava repetir uma importação que já lá estava",
    ).toBeNull();
    // E não inventa uma contagem que ninguém deu.
    expect(screen.queryByText(/0 novos/)).toBeNull();
  });

  it("com a sessão expirada, nomeia o ficheiro e guarda o ensaio para repetir", async () => {
    const gravar = await chegarAoBotaoDeGravar(() => resposta(401, { error: "Não autorizado" }));
    fireEvent.click(gravar);

    await waitFor(() => expect(screen.getByText(/sessão expirou/i)).toBeTruthy());
    expect(screen.getByText(/gravar a importação de «material.csv»/)).toBeTruthy();
    expect(screen.getByText(/volta a entrar/i)).toBeTruthy();
    // O painel do ensaio fica: é dele que se repete, sem voltar a escolher o
    // ficheiro no disco.
    expect(screen.getByRole("button", { name: "Gravar" })).toBeTruthy();
  });
});
