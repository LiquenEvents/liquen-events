// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Guioes from "./Guioes";
import { __resetListCache } from "./useCachedList";
import { escolher } from "./ui/escolher.testkit";
import { MODELOS_DA_CASA } from "@/lib/orcamento/guiao-modelos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DE GUIÕES TEM DE DIZER A VERDADE SEM SE ABRIR NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que esta vista promete é uma coisa só: **olhar uma vez e saber quais dos
 * eventos que aí vêm têm um problema.** Tudo o resto — a régua, os modelos, o
 * editor — é maquinaria ao serviço disso.
 *
 * Por isso o que se prende aqui é o que faz essa promessa falhar em silêncio:
 *
 *  · uma pastilha que diga o estado só com COR (a regra da casa, e já houve
 *    aqui um calendário a fazê-lo);
 *  · um filtro que mostre linhas que não pertencem ao filtro;
 *  · um evento sem guião que não se distinga de um evento com guião pronto;
 *  · e o caminho inteiro do modelo: escolher, gravar, e o guião ficar com os
 *    momentos do modelo.
 *
 * A régua em si não se mede aqui, e é deliberado: em jsdom não há disposição
 * nenhuma (`getBoundingClientRect` devolve zeros), portanto medir larguras de
 * blocos era medir zero e passar sempre. A geometria da régua está presa em
 * `lib/orcamento/guioes.test.ts` — os carris, os vazios e a janela são funções
 * puras — e o que se vê no browser é o passeio `e2e/guiao-do-dia.spec.ts`.
 */

const HOJE = new Date("2026-06-10T14:00:00");

const momento = (
  id: string,
  time: string,
  title: string,
  duracao?: number,
  owner?: string,
): TimelineItem => ({
  id,
  time,
  title,
  ...(duracao != null ? { duracao } : {}),
  ...(owner ? { owner } : {}),
});

const GUIOES = [
  {
    id: "q-pronto",
    cliente: "Ana e Rui",
    evento: "Casamento",
    data: "2026-06-20",
    local: "Herdade da Maridona",
    momentos: [momento("a1", "09:00", "Montagem", 120), momento("a2", "11:00", "Cerimónia", 60)],
  },
  {
    id: "q-choque",
    cliente: "Beatriz e Tomás",
    evento: "Casamento",
    data: "2026-06-15",
    local: "Quinta do Sobral",
    momentos: [
      momento("b1", "09:00", "Montagem", 180, "Rita"),
      momento("b2", "10:00", "Ir buscar as flores", 60, "Rita"),
    ],
  },
  {
    id: "q-vazio",
    cliente: "Carla e Diogo",
    evento: "Batizado",
    data: "2026-07-01",
    local: "Igreja de Évora",
    momentos: [],
  },
];

function resposta(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** Os PATCH do guião que chegaram ao servidor, por ordem. */
let gravados: { url: string; corpo: Record<string, unknown> }[] = [];

function ligarOServidor() {
  gravados = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (url.startsWith("/api/guioes/modelos")) {
        return resposta({ modelos: MODELOS_DA_CASA });
      }
      if (url.startsWith("/api/guioes")) {
        return resposta({ guioes: GUIOES });
      }
      gravados.push({
        url,
        corpo: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>,
      });
      return resposta({ ok: true });
    }),
  );
}

const pedidoInteiro = (id: string): Quote =>
  ({
    id,
    name: GUIOES.find((g) => g.id === id)?.cliente ?? "",
    date: GUIOES.find((g) => g.id === id)?.data ?? "",
    timeline: GUIOES.find((g) => g.id === id)?.momentos ?? [],
  }) as Quote;

function montar(
  carregar: (
    id: string,
  ) => Promise<{ ok: true; quote: Quote } | { ok: false; porque: string }> = async (id) => ({
    ok: true,
    quote: pedidoInteiro(id),
  }),
) {
  return render(
    <ToastProvider>
      <Guioes carregarPedido={carregar} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  ligarOServidor();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** A linha de um evento na lista, encontrada pelo nome acessível. */
function linhaDe(cliente: string | RegExp) {
  return screen.getByRole("button", {
    name: typeof cliente === "string" ? new RegExp(cliente) : cliente,
  });
}

describe("Timelines — a lista", () => {
  it("mostra um evento por linha, os que aí vêm primeiro", async () => {
    montar();
    await screen.findByRole("button", { name: /Beatriz e Tomás/ });

    const linhas = screen
      .getAllByRole("button")
      .map((b) => b.getAttribute("aria-label") ?? "")
      .filter((n) => n.includes("Daqui a"));
    // 15 de Junho antes de 20, e 20 antes de 1 de Julho.
    expect(linhas[0]).toContain("Beatriz e Tomás");
    expect(linhas[1]).toContain("Ana e Rui");
    expect(linhas[2]).toContain("Carla e Diogo");
  });

  it("o estado de cada timeline é COR, FORMA e PALAVRA — nunca só cor", async () => {
    montar();
    const linha = await screen.findByRole("button", { name: /Beatriz e Tomás/ });
    const pastilha = within(linha).getByText("Choque");

    // A palavra está lá…
    expect(pastilha.textContent).toBe("Choque");
    // …a forma também (um ícone dentro da mesma pastilha)…
    expect(pastilha.parentElement?.querySelector("svg")).toBeTruthy();
    // …e a frase inteira chega a quem ouve o ecrã, e não um «Choque, 1» solto.
    expect(linha.getAttribute("aria-label")).toContain("dois sítios ao mesmo tempo");
  });

  it("um evento sem timeline distingue-se de uma timeline pronta", async () => {
    montar();
    const semGuiao = await screen.findByRole("button", { name: /Carla e Diogo/ });
    const pronto = linhaDe("Ana e Rui");
    expect(within(semGuiao).getByText("Sem timeline")).toBeTruthy();
    expect(within(pronto).getByText("Pronto")).toBeTruthy();
    // CONTROLO NEGATIVO: se a linha vazia herdasse o estado da outra, isto
    // passava a encontrar «Pronto» nas duas.
    expect(within(semGuiao).queryByText("Pronto")).toBeNull();
  });

  it("o filtro «Com problema» deixa só quem tem uma pessoa em dois sítios", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Beatriz e Tomás/ });

    await user.click(screen.getByRole("radio", { name: /Com problema/ }));

    expect(screen.getByRole("button", { name: /Beatriz e Tomás/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ana e Rui/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Carla e Diogo/ })).toBeNull();
  });

  it("um filtro sem resultados diz que foi o filtro que mudou, não os dados", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/guioes/modelos")
          ? resposta({ modelos: [] })
          : resposta({ guioes: [GUIOES[0]] }),
      ),
    );
    montar();
    await screen.findByRole("button", { name: /Ana e Rui/ });

    await user.click(screen.getByRole("radio", { name: /Com problema/ }));
    expect(screen.getByText(/Mudou o filtro, não os dados/)).toBeTruthy();
  });
});

describe("Timelines — abrir e editar", () => {
  it("abrir um evento vai buscar o pedido inteiro e monta o editor", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const pedidos: string[] = [];
    montar(async (id) => {
      pedidos.push(id);
      return { ok: true, quote: pedidoInteiro(id) };
    });
    await screen.findByRole("button", { name: /Ana e Rui/ });

    await user.click(linhaDe("Ana e Rui"));

    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());
    expect(pedidos).toEqual(["q-pronto"]);
    // O guião que abre é o DAQUELE evento, e não o de outro.
    expect(screen.getByRole("button", { name: "Remover 09:00 Montagem" })).toBeTruthy();
  });

  it("uma falha a abrir diz o que se passou e oferece tentar de novo", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar(async () => ({ ok: false, porque: "A sessão expirou — volta a entrar." }));
    await screen.findByRole("button", { name: /Ana e Rui/ });

    await user.click(linhaDe("Ana e Rui"));

    await waitFor(() => expect(screen.getByText(/A sessão expirou/)).toBeTruthy());
    // E NÃO monta um editor vazio por cima da falha: um painel que parece
    // completo e não está é pior do que um aviso.
    expect(screen.queryByText("Cronograma do Dia")).toBeNull();
  });

  it("juntar um modelo grava os momentos do modelo na timeline do evento", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Carla e Diogo/ });
    await user.click(linhaDe("Carla e Diogo"));
    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());

    const escolha = await screen.findByLabelText("Juntar um modelo a esta timeline");
    const modelo = MODELOS_DA_CASA[0];
    await escolher(user, escolha, modelo.nome);

    await waitFor(() => expect(gravados).toHaveLength(1));
    expect(gravados[0].url).toBe("/api/orcamento/q-vazio");
    const timeline = gravados[0].corpo.timeline as TimelineItem[];
    expect(timeline.map((t) => t.title)).toEqual(modelo.momentos.map((t) => t.title));
    // Cada momento nasce com id próprio — sem isso, reaplicar o gesto depois de
    // um 409 punha uma segunda cópia no guião.
    expect(new Set(timeline.map((t) => t.id)).size).toBe(timeline.length);
  });

  it("a lista fica em dia com o que se editou, sem recarregar a página", async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    montar();
    await screen.findByRole("button", { name: /Carla e Diogo/ });
    await user.click(linhaDe("Carla e Diogo"));
    await waitFor(() => expect(screen.getByText("Cronograma do Dia")).toBeTruthy());

    await escolher(
      user,
      await screen.findByLabelText("Juntar um modelo a esta timeline"),
      MODELOS_DA_CASA[0].nome,
    );

    /**
     * Dois sítios a dizer coisas diferentes sobre o mesmo dia é o defeito que
     * esta vista existe para não ter. Sem a escrita de volta na lista, a
     * pastilha «Sem timeline» ficava colada à linha até alguém recarregar.
     */
    await waitFor(() => {
      const linha = screen.getByRole("button", { name: /Carla e Diogo/ });
      expect(within(linha).queryByText("Sem timeline")).toBeNull();
    });
  });
});
