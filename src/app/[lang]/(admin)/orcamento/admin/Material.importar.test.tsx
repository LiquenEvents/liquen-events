// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * GRAVAR UMA IMPORTAÇÃO SÃO 5 A 30 SEGUNDOS DE ECRÃ MUDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quem carrega o catálogo de material passa o inventário todo de uma vez:
 * centenas de linhas num CSV. O ENSAIO é rápido e devolve o painel — «120
 * novos · 30 atualizados» —, mas o «Gravar» que vem a seguir escreve tudo num
 * pedido só e demora dezenas de segundos, e a única coisa que acontecia no
 * ecrã era o botão ficar apagado com «A gravar…» lá dentro.
 *
 * Aqui não há contagem: o servidor recebe o ficheiro inteiro e só fala no fim.
 * O que há é o TAMANHO, que o ensaio já mostrou por cima do botão e que a
 * espera nunca usava. É dele que sai a estimativa — e portanto uma barra que
 * anda: depressa no princípio, cada vez mais devagar, e nunca até ao fim (quem
 * a fecha é a resposta).
 *
 * O que se prende: a espera aparece ao gravar, tem uma barra que ANDA, diz
 * quantas linhas estão em causa, e desaparece quando o trabalho acaba — o
 * trabalho TODO, releitura do catálogo incluída.
 */

function resposta(status: number, corpo: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => corpo,
  } as unknown as Response;
}

const ITEM = {
  id: "i1",
  name: "Escadote 3 degraus",
  category: "Ferramentas",
  kind: "reutilizavel" as const,
  unit: "un",
  stock: 2,
  updatedAt: "2026-08-01T00:00:00.000Z",
};

/** O ensaio: 120 linhas novas e 30 a actualizar. 150 a escrever, ao todo. */
const PLANO = { novos: 120, atualizados: 30, erros: 0, linhas: [] };

/** Quanto é que o traço do `EmCurso` está cheio, lido do `scaleX`. */
function avanco(): number {
  const barra = document.querySelector("[data-barra=preenchimento]") as HTMLElement | null;
  const m = /scaleX\(([\d.]+)\)/.exec(barra?.style.transform ?? "");
  return m ? Number(m[1]) : NaN;
}

/** A escrita fica pendurada até se chamar isto — é o que a torna observável. */
let libertarEscrita: (() => void) | null = null;

beforeEach(() => {
  __resetListCache();
  libertarEscrita = null;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.includes("/api/material/importar")) {
        const corpo = JSON.parse(String(init?.body ?? "{}"));
        if (!corpo.aplicar) return resposta(200, PLANO);
        await new Promise<void>((r) => {
          libertarEscrita = r;
        });
        return resposta(200, { criados: 120, atualizados: 30, ignorados: 0 });
      }
      return resposta(200, [ITEM]);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function chegarAoBotaoDeGravar() {
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
  await waitFor(() => expect(screen.getByRole("button", { name: "Gravar" })).toBeTruthy());
}

describe("gravar a importação de material", () => {
  it("mostra uma espera com barra a andar, dimensionada pelas linhas do ensaio", async () => {
    await chegarAoBotaoDeGravar();

    // O número que o ensaio já tinha no ecrã: 120 + 30.
    expect(screen.getByText(/120/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Gravar" }));

    await waitFor(() => expect(screen.getByText("A gravar o material…")).toBeTruthy());
    // Diz quantas linhas estão em causa — é o que separa um segundo de meio
    // minuto, e é o que justifica a paciência.
    expect(screen.getByText(/150 linhas a entrar no catálogo/)).toBeTruthy();

    // Há barra (só há quando existe estimativa) e começa vazia…
    expect(avanco()).toBe(0);
    // …e anda sozinha, sem a resposta ter chegado.
    await waitFor(() => expect(avanco()).toBeGreaterThan(0), { timeout: 3000 });
    const meio = avanco();
    expect(meio).toBeLessThan(1);

    // A resposta chega, e a seguir ainda há a releitura do catálogo. A espera
    // só sai quando o trabalho todo acaba.
    await act(async () => {
      libertarEscrita?.();
    });
    await waitFor(() => expect(screen.queryByText("A gravar o material…")).toBeNull());
  });

  /** Ler o ficheiro é rápido e devolve logo o painel: aí não há espera nenhuma
   *  a desenhar, e pô-la era piscar um cartão por nada. */
  it("não põe espera nenhuma no ensaio do ficheiro", async () => {
    await chegarAoBotaoDeGravar();
    expect(screen.queryByText("A gravar o material…")).toBeNull();
  });
});
