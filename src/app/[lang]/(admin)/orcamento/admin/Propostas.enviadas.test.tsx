// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";
import PropostasDoPedido from "./PropostasDoPedido";

/**
 * «SE EU QUISER VER AS PROPOSTAS QUE JÁ MANDEI NÃO CONSIGO.»
 *
 * Palavras dela. A lista estava por ordem alfabética, sem data e sem procura, e
 * nenhuma linha mostrava a proposta. Estes testes prendem o que mudou: a mais
 * recente primeiro, a procura, e as acções que mostram o que seguiu.
 */

const base = {
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 1000,
  vat: 230,
  total: 1230,
  doc: { ref: "TESTE", clientNames: "TESTE" },
};
const proposals = [
  {
    ...base,
    id: "p-antiga",
    quoteId: "q1",
    clientName: "TESTE Ana",
    clientEmail: "ana@exemplo.pt",
    status: "enviada",
    createdAt: "2026-08-01T10:00:00.000Z",
    sentAt: "2026-08-01T10:00:00.000Z",
  },
  {
    ...base,
    id: "p-recente",
    quoteId: "q2",
    clientName: "TESTE Zé",
    clientEmail: "ze@exemplo.pt",
    status: "enviada",
    createdAt: "2026-10-05T10:00:00.000Z",
    sentAt: "2026-10-05T10:00:00.000Z",
  },
  {
    ...base,
    id: "p-rascunho",
    quoteId: "q3",
    clientName: "TESTE Bia",
    clientEmail: "bia@exemplo.pt",
    status: "rascunho",
    createdAt: "2026-09-01T10:00:00.000Z",
  },
];

const resposta = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"teste"' }),
  json: async () => body,
});

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/propostas")) return resposta(proposals);
      if (u.endsWith("/versoes"))
        return resposta({
          ok: true,
          versoes: [
            {
              id: "p-recente",
              enviadaEm: "2026-10-05T10:00:00.000Z",
              total: 1230,
              estado: "enviada",
            },
          ],
        });
      return resposta([]);
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const desenhar = (procuraInicial?: string) =>
  render(
    <ToastProvider>
      <Propostas quotes={[]} procuraInicial={procuraInicial} />
    </ToastProvider>,
  );

/** Os nomes dos clientes pela ordem em que a lista os mostra. */
async function ordem() {
  await screen.findAllByText(/TESTE Zé/);
  return screen
    .getAllByText(/^TESTE (Ana|Zé|Bia)$/)
    .map((e) => e.textContent)
    .filter((t, i, todos) => todos.indexOf(t) === i);
}

describe("Propostas: ver as que já seguiram", () => {
  it("a mais recente primeiro, e não por ordem alfabética", async () => {
    desenhar();
    expect(await ordem()).toEqual(["TESTE Zé", "TESTE Bia", "TESTE Ana"]);
  });

  it("mostra quando seguiu, e diz «por enviar» na que não seguiu", async () => {
    desenhar();
    await screen.findAllByText(/TESTE Zé/);
    expect(screen.getAllByText(/por enviar/i).length).toBeGreaterThan(0);
  });

  it("a procura encontra pelo nome ou pelo email", async () => {
    const u = userEvent.setup();
    desenhar();
    await screen.findAllByText(/TESTE Zé/);
    await u.type(screen.getByRole("searchbox", { name: "Procurar propostas" }), "ana@");
    expect(screen.getAllByText("TESTE Ana").length).toBeGreaterThan(0);
    expect(screen.queryByText("TESTE Zé")).toBeNull();
  });

  it("abre com a procura que vem de outro ecrã («Ver em Propostas»)", async () => {
    desenhar("Bia");
    expect((await screen.findAllByText("TESTE Bia")).length).toBeGreaterThan(0);
    expect(screen.queryByText("TESTE Zé")).toBeNull();
  });

  it("uma enviada abre «o que seguiu»: o PDF, o link do casal e o email, numa folha só", async () => {
    const u = userEvent.setup();
    desenhar("Zé");
    await screen.findAllByText("TESTE Zé");
    await u.click(screen.getAllByRole("button", { name: /Mais acções|Acções/i })[0]);
    const menu = await screen.findByRole("menu");
    await u.click(
      within(menu).getByRole("menuitem", { name: "Ver o que foi enviado para o cliente…" }),
    );
    const folha = await screen.findByRole("dialog");
    for (const r of ["Abrir o PDF que foi enviado", "Abrir como o casal vê", "Copiar link"])
      expect(within(folha).getByRole("button", { name: r })).toBeTruthy();
    expect(within(folha).getByText("Email enviado")).toBeTruthy();
  });
});

describe("«Ver o que seguiu» está À VISTA, não só nos três pontinhos", () => {
  /**
   * Palavras dela: «eu queria algo mais visível que desse conhecimento aos
   * colaboradores da Líquen onde podem ver aquilo que está nos três
   * pontinhos». Quem não abre o menu não sabe que lá está.
   */
  it("cada enviada tem o botão escrito, e ele abre a folha", async () => {
    const u = userEvent.setup();
    desenhar("Zé");
    await screen.findAllByText("TESTE Zé");
    const botoes = screen.getAllByRole("button", {
      name: /Ver o que foi enviado para o cliente —/,
    });
    expect(botoes.length).toBeGreaterThan(0);
    await u.click(botoes[0]);
    const folha = await screen.findByRole("dialog");
    expect(within(folha).getByRole("button", { name: "Abrir como o casal vê" })).toBeTruthy();
  });

  it("um rascunho não tem o botão — não seguiu nada", async () => {
    desenhar("Bia");
    await screen.findAllByText("TESTE Bia");
    expect(
      screen.queryByRole("button", { name: /Ver o que foi enviado para o cliente —/ }),
    ).toBeNull();
  });

  it("a frase de cima diz onde se vê", async () => {
    desenhar();
    expect(
      (await screen.findAllByText(/Ver o que foi enviado para o cliente/)).length,
    ).toBeGreaterThan(0);
    expect(document.body.textContent).toMatch(
      /abres o PDF, o link e o email que o cliente recebeu/,
    );
  });

  it("no cartão do pedido, cada versão enviada também tem o botão", async () => {
    render(
      <ToastProvider>
        <PropostasDoPedido quoteId="q2" />
      </ToastProvider>,
    );
    await screen.findByText(/Versão 1/);
    expect(
      screen.getAllByRole("button", { name: /Ver o que foi enviado para o cliente —/ }).length,
    ).toBe(1);
  });
});

describe("Propostas enviadas, no pedido", () => {
  it("lista as versões que seguiram, com as acções", async () => {
    render(
      <ToastProvider>
        <PropostasDoPedido quoteId="q2" />
      </ToastProvider>,
    );
    expect(await screen.findByText(/Versão 1/)).toBeTruthy();
    expect(screen.getAllByText(/enviada/).length).toBeGreaterThan(0);
  });

  it("sem propostas, não desenha nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta({ ok: true, versoes: [] })),
    );
    const { container } = render(
      <ToastProvider>
        <PropostasDoPedido quoteId="q9" />
      </ToastProvider>,
    );
    await new Promise((r) => setTimeout(r, 20));
    expect(container.textContent).toBe("");
  });
});
