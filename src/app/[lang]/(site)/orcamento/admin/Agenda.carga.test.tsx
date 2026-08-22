// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Agenda from "./Agenda";
import { __resetListCache } from "./useCachedList";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CARGA DA CARRINHA A UM TOQUE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do registo do audit, o terceiro dos oito bloqueios:
 *
 *   «A checklist da carrinha — a única tarefa que É de telemóvel — está a
 *   quatro toques e não tem entrada nenhuma na navegação. É a tarefa do
 *   enunciado: de pé, ao lado da carrinha, mãos ocupadas, rede fraca — e é a
 *   que está mais fundo.»
 *
 * O caminho normal: barra de baixo → Pedidos → encontrar o pedido → «Produção»
 * → «Abrir para carregar». Quatro toques e quatro ecrãs de rolo. A Agenda já
 * mostra o evento do dia; o que lhe faltava era levar lá.
 */

const HOJE = new Date("2026-08-14T09:00:00.000Z");

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-07-01T10:00:00.000Z",
    status: "aceite",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    date: "2026-08-15",
    ...over,
  }) as Quote;

beforeEach(() => {
  __resetListCache?.();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a linha do evento na Agenda", () => {
  it("leva à carga da carrinha num toque", async () => {
    render(<Agenda quotes={[pedido()]} onOpen={vi.fn()} />);
    const atalho = await screen.findByRole("link", { name: "Carregar" });
    // Pelo id do PEDIDO: a rota da carga é indexada pelo id da CHECKLIST, que a
    // Agenda não conhece — e era essa a razão técnica de a única ligação em
    // todo o repositório estar escondida a quatro toques.
    expect(atalho.getAttribute("href")).toBe("/orcamento/admin/carregamento/pedido/q1");
  });

  /**
   * UM LINK, E NÃO UM `onClick`.
   *
   * Assim o voltar do browser funciona de borla, e a rota da carga — que o
   * service worker guarda de propósito para abrir sem rede — abre como abriria
   * escrita à mão.
   */
  it("e é mesmo um link", async () => {
    render(<Agenda quotes={[pedido()]} onOpen={vi.fn()} />);
    expect((await screen.findByRole("link", { name: "Carregar" })).tagName).toBe("A");
  });

  /**
   * E NÃO DENTRO DO BOTÃO DA LINHA.
   *
   * A linha inteira já é um botão que abre o pedido, e um link dentro de um
   * botão é HTML inválido — o toque fica entregue ao navegador e cada um decide
   * o que quer.
   */
  it("não vive dentro do botão que abre o pedido", async () => {
    render(<Agenda quotes={[pedido()]} onOpen={vi.fn()} />);
    const atalho = await screen.findByRole("link", { name: "Carregar" });
    expect(atalho.closest("button")).toBeNull();
  });

  it("abrir o pedido continua a ser a linha", async () => {
    const onOpen = vi.fn();
    render(<Agenda quotes={[pedido()]} onOpen={onOpen} />);
    const linha = await screen.findByRole("button", { name: /Ana e Rui/ });
    linha.click();
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  /** Só as linhas de EVENTO. Um pedido sem data não tem carrinha para carregar. */
  it("um pedido sem data não leva atalho de carga", async () => {
    render(<Agenda quotes={[pedido({ id: "q2", date: undefined })]} onOpen={vi.fn()} />);
    await screen.findByText(/Agenda tranquila/i);
    expect(screen.queryByRole("link", { name: "Carregar" })).toBeNull();
  });
});
