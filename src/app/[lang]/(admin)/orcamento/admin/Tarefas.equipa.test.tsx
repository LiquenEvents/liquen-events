// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

/**
 * ── ABRIR A LISTA JÁ NÃO É VER O FORMULÁRIO ──────────────────────────────
 *
 * O cartão de criar saiu do topo do ecrã: a criação passou a ser a última
 * linha da lista, que só vira formulário quando se lhe toca (fase 03 do
 * documento dela — «o formulário de criação é um cartão permanente no topo…
 * empurra para baixo aquilo que é o conteúdo da página»).
 *
 * Estes casos medem o campo do RESPONSÁVEL, que vive lá dentro. Por isso
 * passam a dar o toque que ela dá para começar a escrever uma tarefa.
 */
async function montar() {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText(TAREFA.title)).toBeInTheDocument());
  fireEvent.click(screen.getByRole("button", { name: "Nova tarefa" }));
  await screen.findByLabelText("Nova tarefa");
}

describe("com contas configuradas", () => {
  /**
   * ── A CORRIDA QUE ESTE FICHEIRO TEVE, E O QUE ELA ENSINOU ────────────────
   *
   * Estes dois testes esperavam por um `<select>` e falhavam ~4 vezes em 8,
   * medido num laço de corridas repetidas — primeiro só na CI, depois também
   * aqui. São DUAS trocas em cima uma da outra:
   *
   *  1. Os dois ramos do campo (a `Escolha` quando há equipa, o `<input>` de
   *     texto livre quando não há) passaram a ter ambos `aria-label`. Antes o
   *     `<input>` não tinha rótulo nenhum, e era ISSO, por acidente, que fazia
   *     a consulta esperar pela equipa.
   *
   *  2. A `Escolha` troca de FORMA depois de montar. Sem JavaScript sai o
   *     `<select>` nativo, para o campo funcionar na mesma; com rato torna-se
   *     um combobox do APG — `role="combobox"` num `<button>`.
   *
   * Esperar pelo `<select>` era esperar pelo estado TRANSITÓRIO. A mensagem de
   * erro dizia-o à letra — «expected 'BUTTON' to be 'SELECT'» — e eu li-a ao
   * contrário três vezes: o botão não era o acidente, era o destino.
   *
   * E em modo de botão não há `<option>` nenhuma na árvore: esta `Escolha` não
   * leva `name`, logo não há `<select>` escondido a acompanhá-la. As opções só
   * existem com a lista ABERTA. Daí o ajudante esperar pela forma final, abrir,
   * e ler por papel.
   */
  async function opcoesDoResponsavel(): Promise<string[]> {
    const gatilho = await waitFor(() => {
      const el = screen.getByLabelText(/Responsável/i);
      expect(el.tagName, "ainda não assentou na forma final").toBe("BUTTON");
      return el;
    });
    fireEvent.click(gatilho);
    const opcoes = await screen.findAllByRole("option");
    return opcoes.map((o) => (o.textContent ?? "").trim());
  }

  it("o responsável passa a escolher-se de uma lista", async () => {
    await montar();
    const nomes = await opcoesDoResponsavel();
    expect(
      nomes,
      "o responsável voltou a ser texto livre: «Ana» e «ana» seriam duas pessoas",
    ).toContain("Ana");
    expect(nomes).toContain("Catarina");
  });

  it("dá para NÃO atribuir a ninguém", async () => {
    // Uma lista sem saída obriga a escolher alguém para criar uma tarefa, e
    // muitas tarefas não são de ninguém em particular.
    await montar();
    const nomes = await opcoesDoResponsavel();
    expect(
      nomes.some((n) => /sem responsável/i.test(n)),
      `nenhuma opção diz «sem responsável» — só há: ${nomes.join(", ")}`,
    ).toBe(true);
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
