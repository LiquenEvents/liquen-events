// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { porqueNaoLeu } from "@/lib/porque-nao-leu";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ESTE É O TEU PONTO DE PARTIDA» DITO A QUEM TEM CINQUENTA CASAMENTOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O ecrã de boas-vindas da Visão Geral é a primeira coisa que se lê ao abrir o
 * back office, e diz duas coisas de uma vez: que a lista está vazia, e que está
 * vazia porque nunca houve nada. A segunda metade era inventada em dois casos —
 * a leitura dos pedidos não voltou, ou está tudo arquivado.
 *
 * Continua a ser um vazio, e não um alarme. O que muda é dizer o porquê certo e
 * dar o passo que resolve aquele porquê, e não outro.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    name: "Ana e Rui",
    guests: 90,
    category: "particulares",
    eventType: "casamentos",
    status: "pendente",
    submittedAt: "2026-07-01T10:00:00.000Z",
    payments: [],
    ...over,
  }) as unknown as Quote;

function desenhar(props: Partial<React.ComponentProps<typeof Overview>> = {}) {
  return render(
    <Overview
      quotes={[]}
      userName="Rita"
      onOpen={vi.fn()}
      onGoStats={vi.fn()}
      onGo={vi.fn()}
      onNew={vi.fn()}
      {...props}
    />,
  );
}

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a Visão Geral sem pedidos activos", () => {
  it("num estúdio novo continua a dar as boas-vindas e o primeiro passo", async () => {
    const onNew = vi.fn();
    desenhar({ onNew });

    expect(screen.getByText("Ainda sem pedidos por aqui.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Criar o primeiro pedido/ }));
    expect(onNew).toHaveBeenCalledTimes(1);
  });

  /**
   * O TESTE QUE INTERESSA MAIS: uma leitura falhada não afirma que não há nada.
   */
  it("uma leitura falhada não diz que ainda não há pedidos", () => {
    desenhar({
      falhaDeLeitura: porqueNaoLeu("", { status: 500 }, { error: "Falta correr o db/schema.sql" }),
      aoTentarDeNovo: vi.fn(),
    });

    expect(screen.getByText("Não foi possível ler os pedidos")).toBeTruthy();
    expect(screen.getByText(/Falta correr o db\/schema\.sql/)).toBeTruthy();
    expect(screen.queryByText("Ainda sem pedidos por aqui.")).toBeNull();
    expect(screen.queryByText(/Este é o teu ponto de partida/)).toBeNull();
    // A saudação fica: é verdade a qualquer hora e não afirma nada sobre dados.
    expect(screen.getByText(/Rita/)).toBeTruthy();
  });

  it("com tudo arquivado diz onde é que o trabalho está, e leva lá", async () => {
    const onVerArquivados = vi.fn();
    desenhar({ arquivados: 2, onVerArquivados });

    expect(screen.getByText("Está tudo arquivado.")).toBeTruthy();
    expect(screen.getByText(/Os 2 que existem estão arquivados/)).toBeTruthy();
    expect(screen.queryByText("Ainda sem pedidos por aqui.")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: /Ver os 2 arquivados/ }));
    expect(onVerArquivados).toHaveBeenCalledTimes(1);
  });

  it("com pedidos activos nada disto aparece", () => {
    desenhar({ quotes: [pedido()], arquivados: 2 });

    expect(screen.queryByText("Ainda sem pedidos por aqui.")).toBeNull();
    expect(screen.queryByText("Está tudo arquivado.")).toBeNull();
    expect(screen.queryByText("Não foi possível ler os pedidos")).toBeNull();
  });
});
