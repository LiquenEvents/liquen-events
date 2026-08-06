// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Proposal, Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Acompanhamento from "./Acompanhamento";

/**
 * O painel existe para responder a duas perguntas de segunda-feira de manhã:
 * o que está prestes a expirar, e a quem é que eu disse que telefonava hoje.
 * Estes testes prendem essas duas, mais o registo do motivo de recusa — que é
 * o que permite, daqui a um ano, saber quantas se perderam por preço.
 */

function proposta(over: Partial<Proposal> = {}): Proposal {
  return {
    id: "p1",
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
    ...over,
  };
}

const pedido = (id: string, date: string, over: Partial<Quote> = {}): Quote =>
  ({ id, name: "Ana e Rui", date, location: "Évora", ...over }) as Quote;

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: `W/"${Math.random()}"` }),
  json: async () => body,
});

/** Datas relativas a hoje, para o teste não apodrecer com o calendário. */
function daquiA(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dias);
  return d.toISOString().slice(0, 10);
}

let enviados: { url: string; body: Record<string, unknown> }[] = [];

function montar(propostas: Proposal[], quotes: Quote[] = []) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method === "PATCH") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        enviados.push({ url: String(url), body });
        const id = String(url).split("/").pop();
        return response({ ...propostas.find((p) => p.id === id), ...body });
      }
      return response(String(url).startsWith("/api/propostas") ? propostas : []);
    }),
  );
  return render(
    <ToastProvider>
      <Acompanhamento quotes={quotes} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  enviados = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o que mostra", () => {
  it("só o que está em aberto — rascunhos e negócios fechados ficam de fora", async () => {
    montar([
      proposta({ id: "p-aberta", clientName: "Em Aberto" }),
      proposta({ id: "p-rascunho", clientName: "Rascunho", status: "rascunho" }),
      proposta({ id: "p-ganho", clientName: "Ganho", status: "aceite" }),
    ]);

    await waitFor(() => expect(screen.getByText("Em Aberto")).toBeTruthy());
    expect(screen.queryByText("Rascunho")).toBeNull();
    expect(screen.queryByText("Ganho")).toBeNull();
  });

  it("conta as que estão a poucos dias de perder a validade", async () => {
    montar([
      proposta({ id: "p-quase", clientName: "Quase", validUntil: daquiA(3) }),
      proposta({ id: "p-folgada", clientName: "Folgada", validUntil: daquiA(60) }),
    ]);

    await waitFor(() => expect(screen.getByText("Quase")).toBeTruthy());
    // O resumo diz "1" no cartão do prazo, não "2".
    const cartao = screen.getByText("Prazo a acabar").closest("div")!;
    expect(within(cartao).getByText("1")).toBeTruthy();
    expect(screen.getByText(/Validade acaba daqui a 3 dias/)).toBeTruthy();
  });

  it("põe à cabeça o que já expirou, mesmo com o casamento longe", async () => {
    montar(
      [
        proposta({ id: "p-viva", clientName: "Viva", validUntil: daquiA(10), quoteId: "q2" }),
        proposta({
          id: "p-expirada",
          clientName: "Expirada",
          validUntil: daquiA(-5),
          quoteId: "q1",
        }),
      ],
      [pedido("q1", daquiA(700)), pedido("q2", daquiA(40))],
    );

    await waitFor(() => expect(screen.getByText("Expirada")).toBeTruthy());
    const nomes = screen.getAllByText(/^(Viva|Expirada)$/).map((n) => n.textContent);
    expect(nomes[0]).toBe("Expirada");
    expect(screen.getByText(/Validade acabou há 5 dias/)).toBeTruthy();
  });
});

describe("marcar o estado", () => {
  it("passa a em negociação com um clique, e grava", async () => {
    montar([proposta()]);
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Em negociação" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].url).toBe("/api/propostas/p1");
    expect(enviados[0].body).toEqual({ status: "em_negociacao" });
  });

  it("recusar pede o motivo ANTES de gravar — o estado não muda sozinho", async () => {
    montar([proposta()]);
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Recusada" }));
    // Ainda não gravou nada: primeiro quer saber porquê.
    expect(enviados).toHaveLength(0);
    expect(screen.getByText(/Porque é que se perdeu/)).toBeTruthy();

    await userEvent.click(screen.getByRole("button", { name: "Preço" }));
    await userEvent.type(screen.getByLabelText("Detalhe do motivo"), "Ficaram 2k acima");
    await userEvent.click(screen.getByRole("button", { name: "Marcar como recusada" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body).toEqual({
      status: "rejeitada",
      lostReason: "preco",
      lostNote: "Ficaram 2k acima",
    });
  });
});

describe("seguimento", () => {
  it("marca a data e a razão, e mostra-as na linha", async () => {
    montar([proposta()]);
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Marcar seguimento" }));
    const quando = daquiA(4);
    const campo = screen.getByLabelText("Voltar a falar em") as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, quando);
    await userEvent.type(screen.getByLabelText(/Para quê/), "Mandar fotos do arco");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body).toEqual({
      followUpAt: quando,
      followUpNote: "Mandar fotos do arco",
    });
    await waitFor(() =>
      expect(screen.getByText(/Seguimento daqui a 4 dias — Mandar fotos do arco/)).toBeTruthy(),
    );
  });

  it("conta os seguimentos que já são devidos", async () => {
    montar([
      proposta({ id: "p-hoje", clientName: "Hoje", followUpAt: daquiA(0) }),
      proposta({ id: "p-tarde", clientName: "Atrasado", followUpAt: daquiA(-3) }),
      proposta({ id: "p-futuro", clientName: "Futuro", followUpAt: daquiA(9) }),
    ]);

    await waitFor(() => expect(screen.getByText("Hoje")).toBeTruthy());
    const cartao = screen.getByText("Seguimentos devidos").closest("div")!;
    expect(within(cartao).getByText("2")).toBeTruthy();
  });
});

describe("nada disto sai daqui", () => {
  it("o painel nunca fala com o cliente — só grava no próprio pedido", async () => {
    // Uma guarda contra a tentação de "avisar automaticamente que vai expirar".
    // Foi pedido explicitamente que não houvesse nada disso.
    montar([proposta({ validUntil: daquiA(1) })]);
    await waitFor(() => expect(screen.getByText("Ana e Rui")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Em negociação" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    for (const e of enviados) {
      expect(e.url.startsWith("/api/propostas/")).toBe(true);
    }
  });
});
