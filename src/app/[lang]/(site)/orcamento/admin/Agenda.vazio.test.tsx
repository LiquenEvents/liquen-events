// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Agenda from "./Agenda";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AGENDA TRANQUILA» DITA POR CIMA DE DUAS LEITURAS QUE NÃO VOLTARAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É o caso perigoso do inventário, e o pior de todos: um vazio que pode ser
 * uma falha de rede disfarçada é pior do que um erro — porque um erro vê-se e
 * este não.
 *
 * A Agenda lê duas listas (`/api/calendario` e `/api/tarefas`) e o `data`
 * indefinido do `useCachedList` era lido como `[]` nos dois casos: lista vazia
 * e pedido rebentado. Com as duas em baixo — o que acontece assim que o cookie
 * caduca, e o back office fica aberto horas — o ecrã escrevia «Agenda
 * tranquila. Nada agendado para os próximos 14 dias.»: a única frase que
 * dispensa alguém de ir ver, dita precisamente quando ninguém conseguiu ver.
 *
 * Três estados, sempre: a ler, não deu para ler, e vazio a sério. Ver
 * `src/lib/porque-nao-leu.ts`.
 */

const HOJE = new Date("2026-08-14T09:00:00.000Z");

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-07-01T10:00:00.000Z",
    status: "aceite",
    name: "Ana e Rui",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    date: "2026-08-15",
    ...over,
  }) as unknown as Quote;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** Responde por rota: assim dá para pôr UMA das duas leituras em baixo. */
function servidor(mapa: Record<string, () => Response>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const chave = String(url).startsWith("/api/tarefas") ? "tarefas" : "calendario";
      return mapa[chave]();
    }),
  );
}

beforeEach(() => {
  __resetListCache();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const EXPLICACAO = "A base de dados não respondeu (faltam as tabelas?).";

describe("a Agenda quando as leituras não voltam", () => {
  it("com as duas em baixo NÃO diz «Agenda tranquila»", async () => {
    servidor({
      calendario: () => reply(500, { error: EXPLICACAO }),
      tarefas: () => reply(500, { error: EXPLICACAO }),
    });
    render(<Agenda quotes={[]} onOpen={vi.fn()} />);

    await waitFor(() =>
      expect(
        screen.getByText("Não foi possível ler as marcações do calendário e as tarefas"),
      ).toBeTruthy(),
    );
    // A frase do servidor ganha: numa leitura desta casa é ela que resolve o
    // problema sozinha.
    expect(screen.getByText(new RegExp(EXPLICACAO.replace(/[.()?]/g, "\\$&")))).toBeTruthy();
    expect(screen.queryByText("Agenda tranquila")).toBeNull();
    expect(screen.queryByText(/Nada agendado para os próximos/)).toBeNull();
  });

  it("nomeia só a leitura que falhou quando só uma falhou", async () => {
    servidor({
      calendario: () => reply(200, []),
      tarefas: () => reply(503, {}),
    });
    render(<Agenda quotes={[]} onOpen={vi.fn()} />);

    await waitFor(() => expect(screen.getByText("Não foi possível ler as tarefas")).toBeTruthy());
    expect(screen.queryByText("Agenda tranquila")).toBeNull();
  });

  it("com a sessão caída não oferece um «Tentar de novo» que dá o mesmo 401", async () => {
    servidor({
      calendario: () => reply(401, { error: "Não autorizado" }),
      tarefas: () => reply(401, { error: "Não autorizado" }),
    });
    render(<Agenda quotes={[]} onOpen={vi.fn()} />);

    await waitFor(() => expect(screen.getByText(/A sessão expirou/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  /**
   * Há eventos dos pedidos para mostrar, mas falta-lhe metade. Sem esta linha,
   * uma agenda incompleta é indistinguível de uma agenda completa — e a
   * diferença entre as duas é uma tarefa que ninguém faz hoje.
   */
  it("com linhas dos pedidos, desenha-as e diz o que lhe falta", async () => {
    servidor({
      calendario: () => reply(500, { error: EXPLICACAO }),
      tarefas: () => reply(500, { error: EXPLICACAO }),
    });
    render(<Agenda quotes={[pedido()]} onOpen={vi.fn()} />);

    expect(await screen.findByText("Ana e Rui")).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Falta aqui o que não deu para ler/)).toBeTruthy());
  });

  it("com as duas leituras boas e nada marcado, continua a ser um vazio calmo", async () => {
    servidor({ calendario: () => reply(200, []), tarefas: () => reply(200, []) });
    render(<Agenda quotes={[]} onOpen={vi.fn()} />);

    expect(await screen.findByText("Agenda tranquila")).toBeTruthy();
    // E agora diz porquê: já se leu tudo, e nenhuma das três origens tem nada.
    expect(
      screen.getByText(/Já li os pedidos, as marcações do calendário e as tarefas/),
    ).toBeTruthy();
    expect(screen.queryByText(/Não foi possível ler/)).toBeNull();
  });
});
