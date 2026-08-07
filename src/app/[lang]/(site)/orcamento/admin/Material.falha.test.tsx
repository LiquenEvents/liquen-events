// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Material from "./Material";
import MaterialListas from "./MaterialListas";
import MaterialRegras from "./MaterialRegras";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "CATÁLOGO VAZIO" NÃO PODE SER O QUE UMA AVARIA DIZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã Material apareceu vazio durante dias com a frase "Catálogo vazio —
 * adicione o material à mão". A verdade era outra: as tabelas do Material não
 * existiam na base de dados, a rota devolvia 500, e o componente ignorava o
 * `error` do `useCachedList` e olhava só para `items.length`.
 *
 * Esse é o pior desfecho possível — o ecrã ACUSA quem está a usá-lo de não ter
 * carregado nada, e a única pessoa que podia resolver o problema fica sem
 * saber que ele existe. Estes testes prendem a distinção: uma leitura que
 * falhou diz que falhou, e repete a frase do servidor.
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
  "O Material ainda não está criado na base de dados. No Supabase → SQL Editor, cole e corra o " +
  "ficheiro db/schema.sql (pode repetir-se sem risco) e recarregue esta página.";

/** Todas as rotas do Material em baixo, como quando falta o `db/schema.sql`. */
function todasEmBaixo() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply(503, { error: FALTA_SCHEMA })),
  );
}

beforeEach(() => {
  __resetListCache();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Material — quando a leitura falha", () => {
  it("não diz “Catálogo vazio”: diz o que o servidor disse", async () => {
    todasEmBaixo();
    render(
      <ToastProvider>
        <Material />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Não foi possível ler o material/)).toBeTruthy();
    expect(screen.getByText(new RegExp("db/schema.sql"))).toBeTruthy();
    // A acusação que estava aqui antes.
    expect(screen.queryByText("Catálogo vazio")).toBeNull();
  });

  it("oferece tentar de novo, e o botão volta mesmo a pedir", async () => {
    todasEmBaixo();
    render(
      <ToastProvider>
        <Material />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());

    const pedidosAntes = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    screen.getByRole("button", { name: "Tentar de novo" }).click();
    await waitFor(() =>
      expect((globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(
        pedidosAntes,
      ),
    );
  });

  it("uma falha sem explicação continua a ser tratada como falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, null)),
    );
    render(
      <ToastProvider>
        <Material />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.queryByText("Catálogo vazio")).toBeNull();
  });
});

describe("Listas base — quando a leitura falha", () => {
  it("não diz “Ainda não há listas”, e não oferece semear contra uma tabela que não existe", async () => {
    todasEmBaixo();
    render(
      <ToastProvider>
        <MaterialListas />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Não foi possível ler as listas/)).toBeTruthy();
    expect(screen.queryByText("Ainda não há listas")).toBeNull();
    expect(screen.queryByRole("button", { name: /Essenciais de carrinha/ })).toBeNull();
  });
});

/**
 * ── E o ecrã tem de DESENHAR ──────────────────────────────────────────────
 * A segunda metade do "o material não funciona" não era a base de dados: os
 * três separadores passavam um `<input>` por DENTRO do `Field`, que desenha o
 * controlo ele próprio. Um filho num elemento vazio faz o React abortar a
 * árvore inteira — o separador ficava em branco, sem mensagem nenhuma. Estes
 * testes montam cada um com dados a sério.
 */
describe("Material — com dados", () => {
  function comDados() {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/listas")) return reply(200, { listas: [], linhas: [] });
        if (String(url).includes("/regras")) return reply(200, []);
        return reply(200, [
          {
            id: "i1",
            name: "Escadote 3 degraus",
            category: "Ferramenta",
            kind: "reutilizavel",
            unit: "un",
            stock: 2,
          },
        ]);
      }),
    );
  }

  it("desenha o catálogo e abre o formulário sem rebentar", async () => {
    comDados();
    render(
      <ToastProvider>
        <Material />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Escadote 3 degraus")).toBeTruthy());

    screen.getByRole("button", { name: /Adicionar/ }).click();
    await waitFor(() => expect(screen.getByLabelText("Nome")).toBeTruthy());
    // O campo é um controlo a sério, ligado à etiqueta — e não um `<input>`
    // solto ao lado dela.
    expect((screen.getByLabelText("Nome") as HTMLInputElement).tagName).toBe("INPUT");
    expect((screen.getByLabelText("Categoria") as HTMLSelectElement).tagName).toBe("SELECT");
  });

  it("desenha as listas base", async () => {
    comDados();
    render(
      <ToastProvider>
        <MaterialListas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("Lista nova")).toBeTruthy());
  });

  it("desenha o formulário das regras", async () => {
    comDados();
    render(
      <ToastProvider>
        <MaterialRegras />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByLabelText("Nome (para si)")).toBeTruthy());
    expect((screen.getByLabelText("Quando") as HTMLSelectElement).tagName).toBe("SELECT");
  });
});

describe("Regras — quando a leitura falha", () => {
  it("não diz “Sem regras”, e esconde o formulário que ia falhar a seguir", async () => {
    todasEmBaixo();
    render(
      <ToastProvider>
        <MaterialRegras />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(screen.getByText(/Não foi possível ler as regras/)).toBeTruthy();
    expect(screen.queryByText("Sem regras")).toBeNull();
    expect(screen.queryByRole("button", { name: "Criar regra" })).toBeNull();
  });
});
