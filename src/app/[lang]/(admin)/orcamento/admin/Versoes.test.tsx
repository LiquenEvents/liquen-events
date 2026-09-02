// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProposalDoc } from "@/lib/proposal-doc";
import Versoes, { type VersaoEnviada } from "./Versoes";

/**
 * O painel do histórico. O que se prende aqui é o que o torna de confiança:
 * não aparecer quando não há nada, comparar o ecrã com a última que seguiu, e
 * repor sem enviar.
 */

const doc = (over: Partial<ProposalDoc>): ProposalDoc => over as ProposalDoc;

const V1: VersaoEnviada = {
  id: "v1",
  enviadaEm: "2026-01-10T10:00:00.000Z",
  total: 8000,
  estado: "enviada",
  mudancas: [],
  resumo: "Primeira versão enviada",
};
const V2: VersaoEnviada = {
  id: "v2",
  enviadaEm: "2026-02-10T10:00:00.000Z",
  total: 9500,
  estado: "em_negociacao",
  mudancas: [
    { onde: "Total", tipo: "alterado", texto: "O total passou de 8000 para 9500" },
    { onde: "Orçamento", tipo: "acrescentado", texto: 'Entrou "Arco floral"' },
  ],
  resumo: "O total passou de 8000 para 9500",
};

/** O documento da última enviada, que a rota devolve com `?doc=`. */
const ULTIMO = doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [1800] });

function montar(
  versoes: VersaoEnviada[],
  noEcra: ProposalDoc,
  onRestaurar = vi.fn(),
  extra: { idioma?: "pt" | "en"; onInserirNaMensagem?: (texto: string) => void } = {},
) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.includes("?doc=")) {
        const id = u.split("?doc=")[1];
        if (!versoes.some((v) => v.id === id)) {
          return { ok: false, status: 404, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => ({ id, doc: ULTIMO }) };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true, versoes }) };
    }),
  );
  render(
    <Versoes
      quoteId="LIQ-1"
      doc={noEcra}
      onRestaurar={onRestaurar}
      idioma={extra.idioma}
      onInserirNaMensagem={extra.onInserirNaMensagem}
    />,
  );
  return onRestaurar;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quando não há envios", () => {
  it("não desenha painel nenhum", async () => {
    montar([], doc({}));
    // Um painel a dizer "0 versões" é ruído no ecrã de quem está a escrever a
    // primeira proposta.
    await waitFor(() => expect(screen.queryByText("Versões enviadas")).toBeNull());
  });
});

describe("o que mudou desde a última enviada", () => {
  it("compara o que está no ecrã com a que seguiu", async () => {
    // A última enviada tinha as flores a 1800; no ecrã estão a 2400.
    montar([V2, V1], doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [2400] }));
    await waitFor(() =>
      expect(screen.getByText(/Uma alteração desde a última enviada/)).toBeTruthy(),
    );
    expect(screen.getByText(/1800.*2400|1 800.*2 400/)).toBeTruthy();
  });

  it("diz quando está igual, em vez de não dizer nada", async () => {
    // O silêncio aqui lia-se como "ainda não carregou". A confirmação é o
    // ponto: ela quer saber que não vale a pena reenviar.
    montar([V2, V1], ULTIMO);
    await waitFor(() =>
      expect(screen.getByText("Esta versão está igual à última enviada")).toBeTruthy(),
    );
  });
});

describe("o histórico", () => {
  it("numera da mais antiga para a mais nova e mostra data, valor e estado", async () => {
    montar([V2, V1], doc({}));
    await waitFor(() => expect(screen.getByText(/Versão 2/)).toBeTruthy());
    // A mais recente é a Versão 2, e está no topo — a numeração conta desde a
    // primeira que seguiu, que é como ela fala delas ao telefone.
    expect(screen.getByText(/Versão 2 · 10 de fevereiro de 2026/)).toBeTruthy();
    expect(screen.getByText(/Versão 1 · 10 de janeiro de 2026/)).toBeTruthy();
    expect(screen.getByText("Em negociação")).toBeTruthy();
  });

  it("o detalhe do que mudou abre e fecha", async () => {
    montar([V2, V1], doc({}));
    await waitFor(() => expect(screen.getByText(/Versão 2/)).toBeTruthy());
    expect(screen.queryByText('Entrou "Arco floral"')).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Ver o que mudou" }));
    expect(screen.getByText('Entrou "Arco floral"')).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Esconder o que mudou" }));
    expect(screen.queryByText('Entrou "Arco floral"')).toBeNull();
  });
});

describe("o parágrafo do que mudou, para o email", () => {
  it("sem onInserirNaMensagem, não aparece (um botão que não faz nada é pior que não haver botão)", async () => {
    montar([V2, V1], doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [2400] }));
    await waitFor(() =>
      expect(screen.getByText(/Uma alteração desde a última enviada/)).toBeTruthy(),
    );
    expect(screen.queryByText("Para o email")).toBeNull();
  });

  it("com onInserirNaMensagem e uma mudança real, oferece o parágrafo e insere-o ao clicar", async () => {
    const onInserir = vi.fn();
    montar(
      [V2, V1],
      doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [2400] }),
      vi.fn(),
      { onInserirNaMensagem: onInserir },
    );
    await waitFor(() => expect(screen.getByText("Para o email")).toBeTruthy());
    expect(screen.getByText(/houve alterações em o orçamento/)).toBeTruthy();

    await userEvent.click(
      screen.getByRole("button", { name: "Inserir na mensagem para o cliente" }),
    );
    expect(onInserir).toHaveBeenCalledTimes(1);
    expect(onInserir.mock.calls[0][0]).toMatch(/^Desde a última proposta: houve alterações/);
  });

  it("igual à última enviada: sem parágrafo nenhum, mesmo com onInserirNaMensagem", async () => {
    const onInserir = vi.fn();
    montar([V2, V1], ULTIMO, vi.fn(), { onInserirNaMensagem: onInserir });
    await waitFor(() =>
      expect(screen.getByText("Esta versão está igual à última enviada")).toBeTruthy(),
    );
    expect(screen.queryByText("Para o email")).toBeNull();
  });

  it("primeira proposta (sem envio anterior): sem painel, logo sem parágrafo", async () => {
    montar([], doc({}), vi.fn(), { onInserirNaMensagem: vi.fn() });
    await waitFor(() => expect(screen.queryByText("Versões enviadas")).toBeNull());
    expect(screen.queryByText("Para o email")).toBeNull();
  });

  it("em inglês, o parágrafo sai em inglês", async () => {
    montar(
      [V2, V1],
      doc({ totalAmount: 9500, budgetItems: ["Flores"], budgetAmounts: [2400] }),
      vi.fn(),
      { idioma: "en", onInserirNaMensagem: vi.fn() },
    );
    await waitFor(() => expect(screen.getByText("Para o email")).toBeTruthy());
    expect(
      screen.getByText(/Since the last proposal: there were changes to the budget/),
    ).toBeTruthy();
  });
});

describe("repor", () => {
  it("devolve o documento daquela versão a quem o pediu", async () => {
    const onRestaurar = montar([V2, V1], doc({}));
    await waitFor(() => expect(screen.getByText(/Versão 1/)).toBeTruthy());
    const botoes = screen.getAllByRole("button", { name: "Repor esta versão" });
    await userEvent.click(botoes[1]); // a Versão 1, a de baixo
    await waitFor(() => expect(onRestaurar).toHaveBeenCalledWith(ULTIMO));
  });

  it("diz, à vista, que repor não envia nada", async () => {
    // É a diferença entre um botão que se carrega e um botão de que se tem
    // medo. Sem esta linha, repor parece reenviar.
    montar([V2, V1], doc({}));
    await waitFor(() => expect(screen.getByText(/não envia nada ao cliente/)).toBeTruthy());
  });

  it("dois cliques seguidos repõem a ÚLTIMA pedida, mesmo que a outra chegue depois", async () => {
    // O pior desfecho deste painel: carregar em «Repor» numa versão, achar que
    // não fez nada porque a rede está lenta, carregar noutra — e ficar com a
    // primeira no estúdio, sem nada no ecrã a dizê-lo. A partir daí o que se
    // grava é a proposta errada.
    const DOC_V1 = doc({ totalAmount: 8000 });
    const DOC_V2 = doc({ totalAmount: 9500 });
    const onRestaurar = vi.fn();

    /** Cada leitura de documento fica pendurada até o teste a soltar — é assim
     *  que se põe a rede a devolver as respostas fora de ordem. */
    const pendentes: { id: string; solta: (d: ProposalDoc) => void }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (!u.includes("?doc=")) {
          return { ok: true, status: 200, json: async () => ({ versoes: [V2, V1] }) };
        }
        const id = u.split("?doc=")[1];
        const espera = new Promise<ProposalDoc>((r) => pendentes.push({ id, solta: r }));
        return { ok: true, status: 200, json: async () => ({ doc: await espera }) };
      }),
    );

    render(<Versoes quoteId="LIQ-1" doc={doc({})} onRestaurar={onRestaurar} />);
    await waitFor(() => expect(screen.getByText(/Versão 1/)).toBeTruthy());
    // A primeira leitura é a da comparação de cima; fica pendurada, e o painel
    // de cima simplesmente não aparece.
    await waitFor(() => expect(pendentes).toHaveLength(1));

    const botoes = screen.getAllByRole("button", { name: "Repor esta versão" });
    await userEvent.click(botoes[0]); // Versão 2, a de cima
    await waitFor(() => expect(pendentes).toHaveLength(2));
    await userEvent.click(botoes[1]); // e logo a seguir a Versão 1
    await waitFor(() => expect(pendentes).toHaveLength(3));
    expect(pendentes[1].id).toBe("v2");
    expect(pendentes[2].id).toBe("v1");

    // A v1 — a ÚLTIMA pedida — chega primeiro; a v2 vem atrasada.
    pendentes[2].solta(DOC_V1);
    await waitFor(() => expect(onRestaurar).toHaveBeenCalledWith(DOC_V1));
    pendentes[1].solta(DOC_V2);
    await waitFor(() =>
      expect(screen.queryAllByRole("button", { name: "A repor…" })).toHaveLength(0),
    );

    // A resposta atrasada não pode voltar a escrever no estúdio.
    expect(onRestaurar).toHaveBeenCalledTimes(1);
    expect(onRestaurar).toHaveBeenLastCalledWith(DOC_V1);
  });
});
