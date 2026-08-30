// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A EQUIPA É UMA LISTA DE PESSOAS, NÃO UMA CAIXA DE TEXTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O responsável de uma tarefa era escrito à mão. «Ana», «ana» e «Ana R.» eram
 * três colaboradoras diferentes para o produto — e uma tarefa atribuída a uma
 * delas não aparecia no filtro das outras duas. A lista de pessoas do filtro
 * nascia do que estivesse ESCRITO nas tarefas, portanto uma colaboradora sem
 * nada atribuído não existia.
 *
 * E o sistema sabia exactamente quem trabalha aqui — as contas estão
 * configuradas — e nunca o perguntava.
 *
 * ── AS DUAS COISAS QUE ISTO NÃO PODE ESTRAGAR ───────────────────────────
 *
 * 1. As tarefas ANTIGAS, atribuídas a nomes que não são conta nenhuma. Uma
 *    lista fechada apagava-as em silêncio no primeiro `select` que se tocasse.
 * 2. As instalações SEM contas nomeadas (palavra-passe partilhada). Aí não há
 *    equipa a listar, e o campo tem de continuar a ser escrito à mão. Lista
 *    vazia é «não sei quem são», não «não há ninguém».
 */

const TAREFA = {
  id: "t1",
  title: "Confirmar a tenda",
  done: false,
  priority: "normal" as const,
  createdAt: "2026-08-10T09:00:00.000Z",
};

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

/** Quem o servidor diz que trabalha aqui. `null` = instalação sem contas. */
let equipaDoServidor: string[] | null = null;
/** As tarefas que a lista devolve. */
let tarefas: unknown[] = [];

beforeEach(() => {
  __resetListCache();
  equipaDoServidor = ["Ana", "Catarina"];
  tarefas = [TAREFA];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/admin/equipa")
        ? resposta({ ok: true, nomes: equipaDoServidor ?? [] })
        : resposta(tarefas),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText(TAREFA.title)).toBeInTheDocument());
}

describe("com contas configuradas", () => {
  it("o responsável passa a escolher-se de uma lista", async () => {
    await montar();
    const campo = await screen.findByLabelText(/Responsável/i);
    expect(
      campo.tagName,
      "o responsável continua a ser texto livre: «Ana» e «ana» são duas pessoas",
    ).toBe("SELECT");
    const nomes = [...campo.querySelectorAll("option")].map((o) => o.textContent);
    expect(nomes).toContain("Ana");
    expect(nomes).toContain("Catarina");
  });

  it("dá para NÃO atribuir a ninguém", async () => {
    // Uma lista sem saída obriga a escolher alguém para criar uma tarefa, e
    // muitas tarefas não são de ninguém em particular.
    await montar();
    const campo = await screen.findByLabelText(/Responsável/i);
    const vazio = [...campo.querySelectorAll("option")].find((o) => o.getAttribute("value") === "");
    expect(vazio?.textContent).toMatch(/sem responsável/i);
  });

  it("o filtro mostra quem NÃO tem tarefas nenhumas", async () => {
    /**
     * A lista nascia do que estivesse escrito nas tarefas, portanto não havia
     * como perguntar «o que é que a Ana tem?» e receber «nada». A ausência de
     * resposta e a resposta «nada» são coisas diferentes.
     */
    await montar();
    expect(await screen.findByRole("button", { name: /^Ana/ })).toBeTruthy();
  });

  it("UM NOME ANTIGO QUE NÃO É CONTA NENHUMA NÃO SE PERDE", async () => {
    /**
     * É a regra que impede esta mudança de apagar dados. Uma tarefa atribuída
     * a «Ana R.» — que não é conta — tem de continuar a poder ser vista e
     * gravada tal e qual.
     */
    tarefas = [{ ...TAREFA, assignee: "Ana R." }];
    await montar();
    // No filtro, a seguir à equipa.
    expect(await screen.findByRole("button", { name: /^Ana R\./ })).toBeTruthy();
  });
});

describe("sem contas configuradas", () => {
  it("o campo continua a ser escrito à mão", async () => {
    /**
     * A instalação com palavra-passe partilhada não tem contas nomeadas. Uma
     * lista vazia que fechasse o campo tirava a funcionalidade a quem ainda
     * não migrou — e uma lista com uma opção só («Sem responsável») é pior do
     * que não haver lista.
     */
    equipaDoServidor = [];
    await montar();
    const campo = await screen.findByLabelText(/Responsável/i);
    expect(campo.tagName).toBe("INPUT");
  });

  it("uma leitura falhada não fecha o campo", async () => {
    // Sem rede não se sabe quem são as pessoas — e não saber não pode custar a
    // possibilidade de atribuir a tarefa.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("/api/admin/equipa")
          ? ({ ok: false, status: 500, headers: new Headers(), json: async () => ({}) } as Response)
          : resposta(tarefas),
      ),
    );
    await montar();
    expect((await screen.findByLabelText(/Responsável/i)).tagName).toBe("INPUT");
  });
});
