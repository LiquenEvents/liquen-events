// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import { escolher } from "./ui/escolher.testkit";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DE DETALHE E O ARRASTAR — fases 08 e 09, montadas
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As REGRAS estão provadas sem React ao lado: o que é a ordem manual em
 * `lib/tarefas/listas.test.ts`, o que se GRAVA para ela sobreviver em
 * `lib/tarefas/posicoes.test.ts`, e que nenhum campo se perde a caminho do
 * servidor em `lib/validation.tarefas.test.ts`.
 *
 * O que este ficheiro mede é a outra metade — a que nenhum dos três vê:
 *
 *  1. que o painel EXISTE e mostra a tarefa em que ela tocou (o critério de
 *     aceitação nº 7, «zero espaço morto»);
 *  2. que o que ela escreve lá dentro CHEGA ao servidor, com o nome do campo
 *     lá dentro — que é exactamente o sítio onde o `.strip()` já apagou coisas
 *     em silêncio duas vezes nesta casa;
 *  3. e que as acções da fase 09 — o menu, o prazo rápido, o mover, o teclado —
 *     estão ligadas a alguma coisa.
 *
 * O relógio fica parado numa quarta-feira, como no `Tarefas.listas.test.tsx`, e
 * pela mesma razão: «hoje» e «amanhã» são gravados como datas, e um teste de
 * datas que corre no dia em que foi escrito passa nesse dia e falha nos outros.
 */

const HOJE = new Date(2026, 8, 16, 10, 0, 0);

const PRIMEIRA = {
  id: "t1",
  title: "Confirmar florista",
  done: false,
  priority: "normal" as const,
  assignee: "Catarina",
  quoteId: "q1",
  clientName: "Melanie",
  createdAt: "2026-09-01T09:00:00.000Z",
};
const SEGUNDA = {
  id: "t2",
  title: "Rever seating plan",
  done: false,
  priority: "baixa" as const,
  createdAt: "2026-09-02T09:00:00.000Z",
};
const TERCEIRA = {
  id: "t3",
  title: "Carregar carrinha",
  done: false,
  priority: "alta" as const,
  createdAt: "2026-09-03T09:00:00.000Z",
};

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

/** Os pedidos de escrita, para se poder perguntar o que foi gravado. */
let escritas: { url: string; metodo: string; corpo: Record<string, unknown> }[] = [];

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(HOJE);
  escritas = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method && init.method !== "GET") {
        escritas.push({
          url: String(url),
          metodo: init.method,
          corpo: init.body ? JSON.parse(String(init.body)) : {},
        });
        return resposta({ ok: true });
      }
      if (String(url).includes("/api/admin/equipa")) return resposta({ ok: true, nomes: [] });
      return resposta([PRIMEIRA, SEGUNDA, TERCEIRA]);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText(/por fazer/)).toBeInTheDocument());
}

/**
 * O selector, já na forma final — a `Escolha` troca de `<select>` para combobox
 * depois de montar, e agarrar o transitório dá um nó que o React já
 * substituiu. A razão inteira está no `escolher.testkit`.
 */
async function selector(nome: string): Promise<HTMLElement> {
  let controlo: HTMLElement | null = null;
  await waitFor(() => {
    const el = screen.getByRole("combobox", { name: nome });
    expect(el.tagName, "ainda não assentou na forma final").toBe("BUTTON");
    controlo = el;
  });
  return controlo!;
}

/** Liga a ordenação manual, que é a única em que reordenar quer dizer algo. */
async function ligarOrdemManual(user: ReturnType<typeof userEvent.setup>) {
  await escolher(user, await selector("Ordenar por"), "Ordenar: Manual");
}

/** O painel de detalhe, pelo título da tarefa que ele está a mostrar. */
const painel = () => screen.getByRole("heading", { level: 2, name: "Confirmar florista" });

const abrirDetalhe = async (user: ReturnType<typeof userEvent.setup>, titulo: string) =>
  user.click(screen.getByRole("button", { name: `Abrir «${titulo}»` }));

const abrirMenu = async (user: ReturnType<typeof userEvent.setup>, titulo: string) => {
  const linha = screen.getByText(titulo).closest("div.group")!;
  await user.click(linha.querySelector('[aria-haspopup="menu"]') as HTMLElement);
};

/** O último PATCH feito a esta tarefa. */
const ultimaEscritaDe = (id: string) =>
  [...escritas].reverse().find((e) => e.url.endsWith(`/api/tarefas/${id}`));

describe("fase 08 — o painel de detalhe", () => {
  it("sem escolha nenhuma, a coluna diz o que faz em vez de ficar vazia", async () => {
    await montar();
    // «Zero espaço morto»: a coluna existe sempre no computador, e vazia
    // explica-se. O que não pode é ficar em branco.
    expect(screen.getByText(/Escolhe uma tarefa da lista/)).toBeInTheDocument();
  });

  it("tocar no título abre o detalhe da tarefa, com o evento ligado", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirDetalhe(user, "Confirmar florista");

    expect(painel()).toBeInTheDocument();
    /* A ficha lê-se sem abrir nada: quem, e de que evento. Pelo PAR
       nome/valor da `<dl>` e não pelo texto solto — «Catarina» também está na
       linha da lista, e uma procura por texto apanhava as duas. */
    expect(screen.getByText("Quem").nextElementSibling).toHaveTextContent("Catarina");
    // E o evento é uma PORTA, que é o ponto 9 da auditoria.
    const ligacao = screen.getByRole("link", { name: "Melanie" });
    expect(ligacao).toHaveAttribute("href", "/orcamento/admin/evento/q1");
  });

  it("a caixa da linha e o botão que abre o detalhe NÃO se chamam o mesmo", async () => {
    await montar();
    /* Dois elementos com o mesmo nome acessível na mesma lista mandam quem ouve
       o ecrã adivinhar em qual está — e partem qualquer passeio que procure por
       nome. A caixa chama-se pelo título; o botão diz o que faz com ele. */
    expect(screen.getByRole("checkbox", { name: "Confirmar florista" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir «Confirmar florista»" })).toBeInTheDocument();
  });

  it("a nota escrita no painel é gravada — com o campo `notas` no corpo", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirDetalhe(user, "Confirmar florista");

    const notas = screen.getByLabelText("Notas");
    await user.type(notas, "O Miguel leva as jarras na sexta.");
    // Grava ao SAIR do campo — um PATCH por tecla escrita eram quarenta
    // gravações por parágrafo.
    fireEvent.blur(notas);

    await waitFor(() => {
      const escrita = ultimaEscritaDe("t1");
      expect(escrita?.metodo).toBe("PATCH");
      expect(
        escrita?.corpo.notas,
        "o campo `notas` não chegou ao servidor — é o sítio exacto onde o `.strip()` já apagou dados duas vezes",
      ).toBe("O Miguel leva as jarras na sexta.");
    });
  });

  it("uma subtarefa juntada aparece na lista e vai inteira para o servidor", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirDetalhe(user, "Confirmar florista");

    await user.type(screen.getByLabelText("Nova subtarefa"), "Pedir orçamento{Enter}");

    await waitFor(() => {
      expect(ultimaEscritaDe("t1")?.corpo.subtarefas).toEqual([
        { id: expect.any(String), titulo: "Pedir orçamento", feita: false },
      ]);
    });
    // E o passo aparece no painel, com um nome que não se confunde com o da
    // tarefa que o contém.
    expect(
      await screen.findByRole("checkbox", { name: "Subtarefa: Pedir orçamento" }),
    ).toBeInTheDocument();
  });

  it("uma ligação que não é http não se junta — e diz porquê antes de gravar", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirDetalhe(user, "Confirmar florista");

    await user.type(screen.getByLabelText("Nova ligação"), "javascript:alert(1){Enter}");

    expect(await screen.findByText(/tem de começar por https/)).toBeInTheDocument();
    expect(ultimaEscritaDe("t1")).toBeUndefined();
  });

  it("uma ligação a sério fica guardada com o domínio por nome", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirDetalhe(user, "Confirmar florista");

    await user.type(screen.getByLabelText("Nova ligação"), "https://www.exemplo.pt/pasta{Enter}");

    await waitFor(() => {
      expect(ultimaEscritaDe("t1")?.corpo.anexos).toEqual([
        { id: expect.any(String), nome: "exemplo.pt", url: "https://www.exemplo.pt/pasta" },
      ]);
    });
  });
});

describe("fase 09 — o menu da linha, o mover e o teclado", () => {
  it("as acções da linha vivem num botão só, e o menu abre-se com o botão direito", async () => {
    const user = userEvent.setup();
    await montar();

    const linha = screen.getByText("Confirmar florista").closest("div.group")!;
    // Um botão, não três: o lápis e o caixote soltos saíram da linha.
    expect(linha.querySelector('[aria-label="Editar tarefa"]')).toBeNull();

    fireEvent.contextMenu(linha);
    expect(await screen.findByRole("menuitem", { name: "Editar tarefa" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "Marcar como concluída" })).toBeInTheDocument();
  });

  it("«Hoje» põe o prazo sem abrir o editor", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirMenu(user, "Rever seating plan");
    await user.click(await screen.findByRole("menuitem", { name: "Hoje" }));

    await waitFor(() => expect(ultimaEscritaDe("t2")?.corpo.dueDate).toBe("2026-09-16"));
  });

  it("«Amanhã» também, e é o dia seguinte", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirMenu(user, "Rever seating plan");
    await user.click(await screen.findByRole("menuitem", { name: "Amanhã" }));

    await waitFor(() => expect(ultimaEscritaDe("t2")?.corpo.dueDate).toBe("2026-09-17"));
  });

  it("sem a ordenação manual não há mover — reordenar o que o `sort` refaz é uma promessa falsa", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirMenu(user, "Confirmar florista");
    expect(await screen.findByRole("menuitem", { name: "Editar tarefa" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Mover para baixo" })).toBeNull();
  });

  it("com a ordenação manual, «Mover para baixo» troca a linha de sítio e grava a posição", async () => {
    const user = userEvent.setup();
    await montar();
    await ligarOrdemManual(user);

    const antes = screen
      .getAllByRole("checkbox")
      .map((c) => c.getAttribute("aria-label"))
      .slice(0, 3);

    await abrirMenu(user, antes[0]!);
    await user.click(await screen.findByRole("menuitem", { name: "Mover para baixo" }));

    await waitFor(() => {
      const depois = screen
        .getAllByRole("checkbox")
        .map((c) => c.getAttribute("aria-label"))
        .slice(0, 3);
      expect(depois).toEqual([antes[1], antes[0], antes[2]]);
    });
    // E a ordem foi GRAVADA: sem isto, ela arruma a lista e perde a arrumação
    // no recarregamento seguinte.
    await waitFor(() =>
      expect(escritas.some((e) => typeof e.corpo.posicao === "number")).toBe(true),
    );
  });

  it("o aviso do movimento diz a posição e oferece anular", async () => {
    const user = userEvent.setup();
    await montar();
    await ligarOrdemManual(user);

    const primeira = screen.getAllByRole("checkbox")[0].getAttribute("aria-label")!;
    await abrirMenu(user, primeira);
    await user.click(await screen.findByRole("menuitem", { name: "Mover para baixo" }));

    const aviso = await screen.findByText(new RegExp(`«${primeira}» movida — 2 de 3`));
    expect(aviso).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anular" })).toBeInTheDocument();
  });

  it("as setas passam o foco de linha em linha", async () => {
    const user = userEvent.setup();
    await montar();

    const primeira = screen.getByRole("button", { name: "Abrir «Confirmar florista»" });
    primeira.focus();
    fireEvent.keyDown(primeira, { key: "ArrowDown" });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: "Abrir «Rever seating plan»" }),
    );
  });

  it("⇧F10 abre o menu da linha focada — sem um segundo menu ao lado do primeiro", async () => {
    await montar();
    const primeira = screen.getByRole("button", { name: "Abrir «Confirmar florista»" });
    primeira.focus();
    fireEvent.keyDown(primeira, { key: "F10", shiftKey: true });

    const menu = await screen.findByRole("menu", { name: "Acções de Confirmar florista" });
    expect(within(menu).getByRole("menuitem", { name: "Editar tarefa" })).toBeInTheDocument();
  });

  it("⌘⌫ passa pela pergunta da casa, e não elimina à primeira", async () => {
    await montar();
    const primeira = screen.getByRole("button", { name: "Abrir «Confirmar florista»" });
    primeira.focus();
    fireEvent.keyDown(primeira, { key: "Backspace", metaKey: true });

    const caixa = await screen.findByRole("dialog");
    expect(caixa).toHaveTextContent("Confirmar florista");
    // Nada foi eliminado enquanto a pergunta está aberta.
    expect(escritas.some((e) => e.metodo === "DELETE")).toBe(false);
  });

  it("`Esc` fecha o detalhe", async () => {
    const user = userEvent.setup();
    await montar();
    await abrirDetalhe(user, "Confirmar florista");
    expect(painel()).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("button", { name: "Abrir «Confirmar florista»" }), {
      key: "Escape",
    });

    await waitFor(() =>
      expect(screen.getByText(/Escolhe uma tarefa da lista/)).toBeInTheDocument(),
    );
  });
});
