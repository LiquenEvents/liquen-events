// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalBuilder from "./ProposalBuilder";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FERRAMENTA ANTIGA NÃO GUARDAVA NADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As linhas do orçamento, o IVA, a validade e as notas viviam só em estado do
 * React até alguém carregar em «Gerar PDF e enviar». Não havia rascunho
 * nenhum — e este ecrã é DESMONTADO por gestos normais: trocar de cliente,
 * abrir o estúdio, mudar de separador de detalhe. Doze linhas escritas à mão
 * desapareciam sem aviso e sem nada no ecrã a dizer que tinham desaparecido.
 *
 * O que estes testes prendem é o mínimo que ela pediu: o que escreveu está lá
 * quando voltar, no mesmo pedido — e também noutro computador, que é a parte
 * que o `localStorage` sozinho nunca fez.
 */

const quote = {
  id: "q1",
  name: "Maria & Zé",
  email: "maria@example.pt",
  category: "casamentos",
  eventType: "casamentos",
  status: "novo",
  createdAt: "2026-01-01T00:00:00.000Z",
  quotedPrice: 3000,
} as unknown as Quote;

function reply(body: { ok?: boolean; status?: number; json?: unknown }): Response {
  return {
    ok: body.ok ?? true,
    status: body.status ?? (body.ok === false ? 500 : 200),
    json: async () => body.json ?? {},
  } as unknown as Response;
}

/** O rascunho que o SERVIDOR tem guardado — o duplo guarda mesmo o que recebe,
 *  porque é isso que faz a diferença entre "gravou" e "fingiu que gravou". */
let rascunhoServidor: { doc: unknown; updatedAt: string } | null = null;
/** A gravação é aceite? A recusa tem de ser PEDIDA (ver o teste do 503). */
let servidorAceita = true;
let pedidos: { url: string; init?: RequestInit }[] = [];

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const metodo = init?.method ?? "GET";
  pedidos.push({ url, init });
  if (url.includes("proposta-rascunho")) {
    if (metodo === "GET") return reply({ json: { ok: true, draft: rascunhoServidor } });
    if (metodo === "PUT") {
      if (!servidorAceita) {
        return reply({
          ok: false,
          status: 503,
          json: {
            ok: false,
            guardado: false,
            motivo: "tabela-em-falta",
            permanente: true,
            erro: "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).",
          },
        });
      }
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      rascunhoServidor = { doc: corpo.doc, updatedAt: new Date().toISOString() };
      return reply({ json: { ok: true, guardado: true, updatedAt: rascunhoServidor.updatedAt } });
    }
    if (metodo === "DELETE") {
      rascunhoServidor = null;
      return reply({ json: { ok: true, apagado: true } });
    }
  }
  return reply({ json: {} });
});

/** Os corpos enviados ao rascunho, pela ordem. */
function gravados(): string[] {
  return pedidos
    .filter((p) => p.url.includes("proposta-rascunho") && (p.init?.method ?? "GET") === "PUT")
    .map((p) => String(p.init?.body ?? ""));
}

beforeEach(() => {
  localStorage.clear();
  pedidos = [];
  rascunhoServidor = null;
  servidorAceita = true;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderBuilder = () =>
  render(
    <ToastProvider>
      <ProposalBuilder quote={quote} />
    </ToastProvider>,
  );

/** Escreve nos quatro sítios que se perdiam: descrição, preço, validade, notas. */
async function escreverUmOrcamento(user: ReturnType<typeof userEvent.setup>) {
  const descricao = await screen.findByLabelText("Descrição da linha 1");
  await user.clear(descricao);
  await user.type(descricao, "Decoração floral da capela");
  const notas = screen.getByLabelText(/Notas/);
  await user.type(notas, "Inclui montagem na véspera.");
}

describe("o orçamento escrito à mão sobrevive a sair do ecrã", () => {
  it("volta a estar lá depois de desmontar e voltar", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBuilder();
    await escreverUmOrcamento(user);
    await waitFor(() => expect(gravados().at(-1) ?? "").toContain("Decoração floral da capela"), {
      timeout: 3000,
    });
    unmount();

    renderBuilder();
    expect(((await screen.findByLabelText("Descrição da linha 1")) as HTMLInputElement).value).toBe(
      "Decoração floral da capela",
    );
    expect((screen.getByLabelText(/Notas/) as HTMLTextAreaElement).value).toContain(
      "Inclui montagem na véspera.",
    );
  });

  /** A gravação tem 800 ms de travão e a desmontagem cancela-a: sair a meio de
   *  uma frase é EXACTAMENTE o gesto que perdia trabalho. */
  it("desmontar dentro dos 800 ms grava na mesma o que estava escrito", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBuilder();
    // Espera pela leitura do servidor para a montagem não competir com a escrita.
    await screen.findByLabelText("Descrição da linha 1");
    await waitFor(() =>
      expect(pedidos.some((p) => p.url.includes("proposta-rascunho"))).toBe(true),
    );
    const notas = screen.getByLabelText(/Notas/);
    await user.type(notas, "Escrito à pressa");
    unmount();
    await waitFor(() => expect(gravados().at(-1) ?? "").toContain("Escrito à pressa"), {
      timeout: 3000,
    });
  });

  /** O `localStorage` sozinho nunca fez isto — e é o que ela pediu por
   *  palavras suas: «para quando se voltar estar lá». */
  it("está lá noutro computador, porque foi ao servidor", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBuilder();
    await escreverUmOrcamento(user);
    await waitFor(() => expect(gravados().at(-1) ?? "").toContain("Decoração floral da capela"), {
      timeout: 3000,
    });
    unmount();

    // O outro computador: mesmo pedido, navegador sem memória nenhuma.
    localStorage.clear();
    renderBuilder();
    await waitFor(
      async () =>
        expect(
          ((await screen.findByLabelText("Descrição da linha 1")) as HTMLInputElement).value,
        ).toBe("Decoração floral da capela"),
      { timeout: 3000 },
    );
  });

  /** Uma edição NUNCA falha porque a gravação falhou. O que muda é o que se diz —
   *  e diz-se com as mesmas palavras do estúdio. */
  it("com o servidor a recusar, continua a deixar escrever e di-lo", async () => {
    servidorAceita = false;
    const user = userEvent.setup();
    renderBuilder();
    await escreverUmOrcamento(user);
    expect(
      await screen.findAllByText(/só neste computador/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
    const descricao = (await screen.findByLabelText("Descrição da linha 1")) as HTMLInputElement;
    expect(descricao.disabled).toBe(false);
    expect(descricao.value).toBe("Decoração floral da capela");
    // E o trabalho ficou mesmo no navegador — é de lá que volta.
    expect(JSON.stringify(localStorage)).toContain("Decoração floral da capela");
  });

  /** Linhas acrescentadas à mão são o caso da colaboradora: doze linhas
   *  escritas uma a uma. Não podem voltar reduzidas a uma. */
  /**
   * ── O TRAVÃO DE SAÍDA TEM DE ESTAR ARMADO NO PRIMEIRO CARÁCTER ───────────
   *
   * A janela que perde trabalho são os 800 ms entre a última tecla e a
   * gravação — e é essa, e só essa, que o `beforeunload` existe para travar. O
   * efeito que o punha dependia de `estado`, que só passa a ter valor QUANDO A
   * PRIMEIRA GRAVAÇÃO COMEÇA: escrever e fechar o separador a seguir, num
   * orçamento ainda por gravar, não perguntava nada. Fechava, e as linhas
   * escritas não estavam em lado nenhum.
   */
  it("pergunta antes de fechar o separador, logo à primeira linha escrita", async () => {
    const user = userEvent.setup();
    renderBuilder();
    const descricao = await screen.findByLabelText("Descrição da linha 1");
    await user.clear(descricao);
    await user.type(descricao, "Arranjos de mesa");

    // Ainda dentro dos 800 ms: nada foi gravado, e é aqui que ela fecha.
    expect(gravados()).toEqual([]);
    const fecho = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(fecho);
    expect(fecho.defaultPrevented).toBe(true);
  });

  it("as linhas acrescentadas à mão voltam todas", async () => {
    const user = userEvent.setup();
    const { unmount } = renderBuilder();
    await user.click(await screen.findByRole("button", { name: /adicionar linha/i }));
    await user.type(await screen.findByLabelText("Descrição da linha 2"), "Arcos de flores");
    await waitFor(() => expect(gravados().at(-1) ?? "").toContain("Arcos de flores"), {
      timeout: 3000,
    });
    unmount();

    renderBuilder();
    expect(((await screen.findByLabelText("Descrição da linha 2")) as HTMLInputElement).value).toBe(
      "Arcos de flores",
    );
  });
});
