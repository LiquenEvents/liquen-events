// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import { ToastProvider } from "./Toast";
import Contratos from "./Contratos";

/**
 * «aqui devem estar todas as propostas que nós marcamos como ganhas» — com
 * contrato ou ainda sem ele, e quem tem de agir sabe o que fazer a cada uma.
 */
const ITENS = [
  {
    tipo: "contrato",
    id: "ct-1",
    quoteId: "q1",
    proposalId: "p1",
    clientName: "TESTE Com Contrato",
    clientEmail: "c@exemplo.pt",
    termsVersion: "2026-08",
    termsSnapshot: "",
    status: "aceite",
    createdAt: "2026-09-01T10:00:00.000Z",
    acceptedAt: "2026-09-02T10:00:00.000Z",
    registadoPor: "Catarina",
  },
  {
    tipo: "sem-contrato",
    id: "p2",
    quoteId: "q2",
    proposalId: "p2",
    clientName: "TESTE Sem Contrato",
    clientEmail: "s@exemplo.pt",
    ganhoEm: "2026-09-09T10:00:00.000Z",
    marcadoPor: "Ana",
  },
  {
    tipo: "sem-contrato",
    id: "q3",
    quoteId: "q3",
    clientName: "TESTE Sem Proposta",
    clientEmail: "",
  },
];

let pedidos: { url: string; init?: RequestInit }[] = [];

function simularComputador() {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min ? 1440 >= Number(min[1]) : mq.includes("hover: hover");
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

beforeEach(() => {
  __resetListCache();
  pedidos = [];
  simularComputador();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      pedidos.push({ url: String(url), init });
      const corpo = String(url).includes("/criar") ? { ok: true } : ITENS;
      return {
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => corpo,
      } as unknown as Response;
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function montar(onOpenQuote = vi.fn()) {
  const quotes = [{ id: "q3", name: "TESTE Sem Proposta" }] as Quote[];
  render(
    <ToastProvider>
      <Contratos quotes={quotes} onOpenQuote={onOpenQuote} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getAllByText("TESTE Sem Contrato").length).toBeGreaterThan(0), {
    timeout: 5000,
  });
  // A tabela entra depois de o ecrã saber a largura (`useAdaptativo`).
  await waitFor(() => expect(screen.getByRole("table")).toBeTruthy(), { timeout: 5000 });
  return onOpenQuote;
}

describe("Propostas Aceites — todas as ganhas", () => {
  it("mostra os contratos E os ganhos que ainda não têm contrato", async () => {
    await montar();
    for (const n of ["TESTE Com Contrato", "TESTE Sem Contrato", "TESTE Sem Proposta"])
      expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Sem contrato · 2/ })).toBeTruthy();
  });

  it("«Aceite por» mostra quem a equipa registou, em vez de «—»", async () => {
    await montar();
    // No cartão vem dentro de uma frase («Aceite … · por Catarina»), na tabela
    // sozinho: procura-se o nome, venha como vier.
    expect((await screen.findAllByText(/Catarina/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/\bAna\b/)).length).toBeGreaterThan(0);
  });

  it("«Criar contrato» só onde há proposta, e chama a rota com o pedido", async () => {
    const u = userEvent.setup();
    await montar();
    const botoes = screen.getAllByRole("button", { name: "Criar contrato" });
    expect(botoes).toHaveLength(1);
    expect(screen.getByText(/Sem proposta — não há termos a registar/)).toBeTruthy();
    await u.click(botoes[0]);
    await waitFor(
      () => expect(pedidos.some((p) => p.url.includes("/api/contratos/criar"))).toBe(true),
      { timeout: 5000 },
    );
    const criar = pedidos.find((p) => p.url.includes("/criar"))!;
    expect(JSON.parse(String(criar.init?.body))).toEqual({ quoteId: "q2" });
  });

  it("um ganho sem contrato não tem «Ver termos» nem «Marcar como assinado»", async () => {
    await montar();
    // Só a linha com contrato os tem.
    expect(screen.getAllByRole("button", { name: "Ver termos" })).toHaveLength(1);
    expect(screen.queryAllByRole("button", { name: "Marcar como assinado" })).toHaveLength(0);
  });

  it("«Abrir pedido» abre o pedido", async () => {
    const u = userEvent.setup();
    const abrir = await montar();
    await u.click(screen.getByRole("button", { name: "Abrir pedido" }));
    expect(abrir).toHaveBeenCalledWith(expect.objectContaining({ id: "q3" }));
  });
});
