// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Carregamento from "./Carregamento";
import { CHAVE_FILA, lerFila } from "@/lib/material-offline";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GESTO QUE FECHA O CARREGAMENTO TEM DE GRAVAR ALGUMA COISA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O botão «Dar por carregada» ocupava a barra inferior inteira e **não fazia
 * nada**: sem críticos por carregar, o `onClick` não executava acção nenhuma. O
 * «Seguir assim», do outro lado do aviso, só fechava o aviso.
 *
 * Ou seja: o único gesto da página que não escrevia era o que encerra a tarefa.
 * Quem estava ao lado da carrinha carregava nele, o ecrã não protestava, e o
 * escritório nunca sabia que a carrinha tinha saído.
 *
 * O que estes testes prendem:
 *
 *  1. **fechar escreve**, e escreve na fila — primeiro o telemóvel, a rede
 *     depois. Fechar a carrinha é o gesto mais provável de apanhar uma quinta
 *     sem rede: é o último, já com tudo lá dentro;
 *  2. **o desfecho aparece**, mesmo sem rede. Uma acção sem marca é
 *     indistinguível de uma que não aconteceu;
 *  3. **dá para reabrir.** Um toque enganado dentro de uma carrinha a abanar
 *     não pode ser definitivo;
 *  4. **uma fila presa diz que está presa.** O `catch` do envio estava vazio, e
 *     o vazio fazia uma fila perdida parecer uma fila a caminho.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ITENS = [
  {
    id: "i1",
    eventId: "ev1",
    name: "Escadote",
    category: "Estrutura",
    kind: "reutilizavel",
    qty: 1,
    critical: false,
    origin: "lista",
    originLabel: "Essenciais de carrinha",
    missing: false,
    loadedAt: "2026-05-01T08:00:00.000Z",
  },
];

/** Um item crítico ainda por carregar — é o que faz aparecer o aviso. */
const COM_CRITICO = [
  ...ITENS,
  {
    id: "i2",
    eventId: "ev1",
    name: "Arco de cerimónia",
    category: "Estrutura",
    kind: "reutilizavel",
    qty: 1,
    critical: true,
    origin: "lista",
    originLabel: "Essenciais de carrinha",
    missing: false,
  },
];

const montar = () =>
  render(<Carregamento quoteId="q1" eventId="ev1" titulo="Casamento · 2026-05-01" actor="Rita" />);

/** As marcações que chegaram ao servidor, por ordem. */
let enviadas: Record<string, unknown>[] = [];

/** O servidor normal: devolve a checklist «preparada» e aceita marcações. */
function servidorNormal(estadoFinal = "carregada", itens: unknown[] = ITENS) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") {
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      enviadas.push(...(corpo.marcacoes ?? []));
      return reply(200, { ok: true, aplicadas: 1, estado: estadoFinal, itens });
    }
    return reply(200, { evento: { id: "ev1", status: "preparada" }, itens });
  });
}

/** O servidor que não responde — o portão da quinta, sem rede. */
function servidorEmBaixo(itens: unknown[] = ITENS) {
  return vi.fn(async (_url: string, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "POST") throw new TypeError("Failed to fetch");
    return reply(200, { evento: { id: "ev1", status: "preparada" }, itens });
  });
}

/** O fecho que chegou ao servidor, se chegou. */
const fechoEnviado = () => enviadas.filter((m) => m.accao === "fechado");

afterEach(() => {
  enviadas = [];
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("Carregamento — o fecho", () => {
  it("«Dar por carregada» escreve na fila em vez de não fazer nada", async () => {
    vi.stubGlobal("fetch", servidorNormal());
    montar();

    const botao = await screen.findByRole("button", { name: /carrinha carregada/i });
    await userEvent.click(botao);

    // Com rede, a fila é descarregada logo a seguir — o que se mede é o que
    // CHEGOU ao servidor. Antes não chegava nada, porque nada era escrito.
    await waitFor(() => expect(fechoEnviado()).toHaveLength(1));
    expect(fechoEnviado()[0].valor).toBe("carregada");
    // Sem item: isto é sobre a checklist, não sobre nenhuma linha.
    expect(fechoEnviado()[0].itemId).toBe("");
    expect(fechoEnviado()[0].actor).toBe("Rita");
  });

  it("o ecrã diz que ficou fechada mesmo antes de a rede confirmar", async () => {
    // A rede está em baixo: é o caso normal ao portão de uma quinta.
    vi.stubGlobal("fetch", servidorEmBaixo());
    montar();

    await userEvent.click(await screen.findByRole("button", { name: /carrinha carregada/i }));

    await waitFor(() =>
      expect(screen.getByText(/carrinha dada por carregada/i)).toBeInTheDocument(),
    );
    // E o fecho continua guardado, à espera de rede.
    expect(lerFila(localStorage).some((m) => m.accao === "fechado")).toBe(true);
  });

  it("«Seguir assim» fecha mesmo, em vez de só fechar o aviso", async () => {
    vi.stubGlobal("fetch", servidorNormal("carregada", COM_CRITICO));
    montar();

    await userEvent.click(await screen.findByRole("button", { name: /dar por carregada/i }));
    // O aviso dos críticos aparece e nomeia-os (o nome também está na lista
    // por baixo — aqui interessa o do aviso).
    await screen.findByText(/faltam 1 itens críticos/i);
    await userEvent.click(screen.getByRole("button", { name: /seguir assim/i }));

    await waitFor(() => expect(fechoEnviado()).toHaveLength(1));
    await waitFor(() =>
      expect(screen.getByText(/carrinha dada por carregada/i)).toBeInTheDocument(),
    );
  });

  it("«Voltar» continua a não fechar nada", async () => {
    vi.stubGlobal("fetch", servidorNormal("carregada", COM_CRITICO));
    montar();

    await userEvent.click(await screen.findByRole("button", { name: /dar por carregada/i }));
    await userEvent.click(await screen.findByRole("button", { name: /^voltar$/i }));

    expect(lerFila(localStorage)).toEqual([]);
    expect(screen.queryByText(/dada por carregada/i)).toBeNull();
  });

  it("dá para reabrir — um toque enganado não é definitivo", async () => {
    // Sem rede de propósito: é assim que a fila fica à vista para se poder
    // provar que fechar e reabrir deixa UMA entrada e não duas.
    vi.stubGlobal("fetch", servidorEmBaixo());
    montar();

    await userEvent.click(await screen.findByRole("button", { name: /carrinha carregada/i }));
    await screen.findByText(/carrinha dada por carregada/i);
    await userEvent.click(screen.getByRole("button", { name: /reabrir/i }));

    // A fila fica com UMA entrada e não com duas: fechar e reabrir é a mesma
    // pergunta com duas respostas, e o servidor só precisa da última.
    const fila = lerFila(localStorage).filter((m) => m.accao === "fechado");
    expect(fila).toHaveLength(1);
    expect(fila[0].valor).toBe("preparada");
    await waitFor(() => expect(screen.queryByText(/dada por carregada/i)).toBeNull());
  });

  it("uma checklist que o servidor já dá como carregada abre fechada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { evento: { id: "ev1", status: "carregada" }, itens: ITENS })),
    );
    montar();

    await waitFor(() =>
      expect(screen.getByText(/carrinha dada por carregada/i)).toBeInTheDocument(),
    );
  });

  /**
   * ── O `catch` VAZIO ───────────────────────────────────────────────────
   *
   * «3 marcações guardadas para enviar» dizia-se tanto quando iam a caminho
   * como quando estavam presas. É a diferença entre fechar a carrinha
   * descansada e descobrir no dia seguinte que nada chegou.
   */
  it("uma fila que não chega ao servidor diz que não chegou", async () => {
    localStorage.setItem(
      CHAVE_FILA,
      JSON.stringify([
        {
          id: "m1",
          eventId: "ev1",
          itemId: "i1",
          accao: "loaded",
          markedAt: "2026-05-01T09:00:00.000Z",
          actor: "Rita",
        },
      ]),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") throw new TypeError("Failed to fetch");
        return reply(200, { evento: { id: "ev1", status: "preparada" }, itens: ITENS });
      }),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/não deu para enviar/i)).toBeInTheDocument());
    // E diz também que nada se perdeu, que é a parte que permite continuar.
    expect(screen.getByText(/nada se perdeu/i)).toBeInTheDocument();
  });

  it("quando passa a chegar, o aviso desaparece", async () => {
    localStorage.setItem(
      CHAVE_FILA,
      JSON.stringify([
        {
          id: "m1",
          eventId: "ev1",
          itemId: "i1",
          accao: "loaded",
          markedAt: "2026-05-01T09:00:00.000Z",
          actor: "Rita",
        },
      ]),
    );
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          posts += 1;
          if (posts === 1) throw new TypeError("Failed to fetch");
          return reply(200, { ok: true, aplicadas: 1, estado: "preparada", itens: ITENS });
        }
        return reply(200, { evento: { id: "ev1", status: "preparada" }, itens: ITENS });
      }),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/não deu para enviar/i)).toBeInTheDocument());
    // O segundo envio passa — e é o fecho que o provoca.
    await userEvent.click(await screen.findByRole("button", { name: /carrinha carregada/i }));
    await waitFor(() => expect(screen.queryByText(/não deu para enviar/i)).toBeNull());
  });
});
