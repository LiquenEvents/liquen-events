// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";

/**
 * UMA LINHA MÁ NÃO PODE DERRUBAR O ECRÃ TODO.
 *
 * A lista pintava a etiqueta de estado com `STATUS_META[p.status].color`. Basta
 * uma proposta gravada com um estado fora do mapa para isso ser `undefined` — e
 * como este é um componente de cliente, o erro sobe ao limite de erro e
 * substitui o BACK OFFICE INTEIRO pelo ecrã "Ocorreu um erro inesperado".
 *
 * Apanhou-se com uma linha gravada como `recusada` em vez de `rejeitada`: o
 * mapa usa `rejeitada` e mostra "Recusada" como etiqueta, por isso a troca é
 * fácil de fazer à mão na base de dados. A API valida os estados, portanto pelo
 * uso normal não acontece — acontece com dados antigos, uma migração, ou uma
 * correcção feita directamente na base de dados, que é exactamente quando ela
 * menos pode dar-se ao luxo de perder o ecrã.
 */

const proposals = [
  {
    id: "p-boa",
    quoteId: "q1",
    clientName: "Cliente Correcto",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 1000,
    vat: 230,
    total: 1230,
    status: "aceite",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "p-ma",
    quoteId: "q2",
    clientName: "Cliente Estado Estranho",
    clientEmail: "c@d.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 2000,
    vat: 460,
    total: 2460,
    // Fora do mapa: é este valor que rebentava a lista inteira.
    status: "recusada",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

/** Resposta mínima que o `useCachedList` sabe ler: além do corpo, ele consulta
 *  o estado (304 = nada mudou) e o cabeçalho ETag. Sem `headers` o carregamento
 *  rebentava e a lista nunca chegava a desenhar-se. */
const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"teste"' }),
  json: async () => body,
});

beforeEach(() => {
  // A cache do `useCachedList` vive no MÓDULO e sobreviveria de um teste para o
  // outro — cada um tem de começar da mesma folha.
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas") ? response(proposals) : response([]),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Propostas — estado fora do mapa", () => {
  it("desenha a lista toda, incluindo a linha com estado desconhecido", async () => {
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );

    // A linha boa aparece...
    await waitFor(() => expect(screen.getByText("Cliente Correcto")).toBeTruthy());
    // ...e a linha má TAMBÉM: nada rebentou, o ecrã não se perdeu.
    expect(screen.getByText("Cliente Estado Estranho")).toBeTruthy();
  });

  it("mostra o valor cru do estado desconhecido, para ela ver que aquela linha tem algo estranho", async () => {
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByText("Cliente Estado Estranho")).toBeTruthy());
    // Sem inventar uma etiqueta bonita nem esconder o problema.
    expect(screen.getByText("recusada")).toBeTruthy();
  });
});

/**
 * A MESMA LISTA EM DUAS FORMAS.
 *
 * O que aqui se guarda não é o aspecto: é que a informação que decide — cliente,
 * estado, validade, valor — está presente nas DUAS, e que nenhuma acção
 * desaparece por não haver rato.
 */
function simularAparelho(largura: number, toque: boolean) {
  vi.stubGlobal("matchMedia", (mq: string) => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("hover: hover")
        ? !toque
        : mq.includes("pointer: coarse")
          ? toque
          : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

describe("Propostas — a lista muda de forma", () => {
  it("no computador é uma tabela ordenável", async () => {
    simularAparelho(1440, false);
    render(
      <ToastProvider>
        <Propostas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole("table", { name: "Propostas" })).toBeTruthy());
    // Ordenar pelo valor é o que uma tabela faz e um cartão não: é por isso que
    // a tabela existe no ecrã grande.
    expect(screen.getByRole("button", { name: /Valor/ })).toBeTruthy();
  });

  it("no telemóvel são cartões — e não uma tabela apertada", async () => {
    simularAparelho(375, true);
    render(
      <ToastProvider>
        <Propostas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole("list", { name: "Propostas" })).toBeTruthy());
    expect(screen.queryByRole("table")).toBeNull();
    // O que decide continua lá: quem é, e quanto.
    expect(screen.getByText("Cliente Correcto")).toBeTruthy();
  });

  /** Num ecrã táctil, uma acção escondida no hover não existe. */
  it("as acções continuam alcançáveis sem rato", async () => {
    simularAparelho(375, true);
    render(
      <ToastProvider>
        <Propostas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Cliente Correcto")).toBeTruthy());
    const menu = screen.getByRole("button", { name: "Acções de Cliente Correcto" });
    expect(menu.className).not.toContain("opacity-0");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACEITAR UMA PROPOSTA NÃO PODE APAGAR O HISTÓRICO DO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ao aceitar, o pedido associado passa a "Aceite" com uma linha no histórico.
 * Isso ia como `activityLog: [...tudo o que este ecrã tinha, entrada]` — e o
 * que este ecrã tem são os `quotes` que o pai carregou quando o back office
 * abriu. Entre a manhã e o clique cabe tudo o que as outras ferramentas
 * escreveram (o Quadro, a gaveta, o estúdio), e desaparecia sem erro nenhum.
 *
 * O servidor tem o caminho seguro — `activityLogAppend`, que junta ao registo
 * FRESCO. E a entrada leva o nome de quem aceitou, como todas as outras.
 */
describe("Propostas — aceitar acrescenta ao histórico, não o reescreve", () => {
  const enviada = {
    id: "p-enviada",
    quoteId: "q1",
    clientName: "Ana e Rui",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 10000,
    vat: 2300,
    total: 12300,
    status: "enviada",
    createdAt: "2026-05-01T00:00:00.000Z",
  };

  /** O pedido tal como este ecrã o tem: um retrato VELHO do histórico. */
  const pedido = {
    id: "q1",
    name: "Ana e Rui",
    status: "cotado",
    activityLog: [
      { id: "a1", at: "2026-05-01T09:00:00.000Z", kind: "note", summary: "Retrato da manhã" },
    ],
  } as unknown as Quote;

  let enviados: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    enviados = [];
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          enviados.push({ url: u, body });
          if (u.startsWith("/api/orcamento/")) return response({ ...pedido, status: "aceite" });
          return response({ ...enviada, status: "aceite" });
        }
        return response(u.startsWith("/api/propostas") ? [enviada] : []);
      }),
    );
  });

  async function aceitar() {
    render(
      <ToastProvider>
        <Propostas quotes={[pedido]} onOpenQuote={() => {}} userName="Catarina" />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByRole("button", { name: "Acções de Ana e Rui" })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Aceitar" }));
    await waitFor(() =>
      expect(enviados.some((e) => e.url.startsWith("/api/orcamento/"))).toBe(true),
    );
    return enviados.find((e) => e.url.startsWith("/api/orcamento/"))!;
  }

  it("manda `activityLogAppend` com uma entrada — e nunca o registo inteiro", async () => {
    const patch = await aceitar();
    expect(patch.body.status).toBe("aceite");
    expect(patch.body).not.toHaveProperty("activityLog");
    expect(patch.body.activityLogAppend).toHaveLength(1);
  });

  it("a entrada diz QUEM aceitou", async () => {
    const patch = await aceitar();
    const entrada = (patch.body.activityLogAppend as { actor?: string; summary: string }[])[0];
    expect(entrada.actor).toBe("Catarina");
    expect(entrada.summary).toMatch(/Proposta aceite/);
  });
});
