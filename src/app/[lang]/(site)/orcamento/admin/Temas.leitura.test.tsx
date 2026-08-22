// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import Temas from "./Temas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PASTA ILEGÍVEL JÁ NÃO ERA UMA PASTA VAZIA — MAS A RAZÃO ERA SEMPRE A MESMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ecrã já distinguia bem os três estados: a ler (esqueleto), ilegível
 * («Não foi possível ler a pasta deste tema agora») e vazio a sério («Arrasta
 * para aqui as fotos»). Isso fica como está — o que estava errado era a linha
 * de baixo, que dizia sempre a MESMA coisa fosse qual fosse a falha:
 *
 *   «É uma falha temporária — as fotos não desapareceram. Recarrega a página
 *    daqui a pouco.»
 *
 * Com a sessão caída — que numa leitura é o caso comum, porque a Biblioteca
 * fica aberta horas — isso é falso duas vezes: não é temporária e recarregar
 * a página não a resolve. Ela recarrega, leva o mesmo 401, e conclui que o
 * ecrã está avariado.
 */

const T0 = "2026-01-01T00:00:00.000Z";
const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 300,
};

type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });
const bad = (status: number, body: unknown = null): Res => ({
  ok: false,
  status,
  json: async () => body,
});

let rotas: Map<string, () => Res>;

/** Abre a pasta do tema e deixa a leitura assentar. */
async function abrirPasta() {
  const cartoes = (await screen.findAllByRole("button", { name: /Terracotta/ })).filter(
    (b) => b.getAttribute("aria-haspopup") !== "menu",
  );
  fireEvent.click(cartoes[0]);
  await screen.findByRole("button", { name: "Eliminar tema" });
  for (let i = 0; i < 6; i++) await act(async () => {});
}

beforeEach(() => {
  rotas = new Map();
  rotas.set("GET /api/temas", () => ok([THEME]));
  rotas.set("GET /api/temas/uso", () => ok({ usos: {} }));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const chave = `${(init?.method ?? "GET").toUpperCase()} ${String(url).split("?")[0]}`;
      const handler = rotas.get(chave);
      if (!handler) return Promise.reject(new Error(`rota não simulada: ${chave}`));
      return Promise.resolve(handler());
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Biblioteca de Temas — quando a pasta não se deixa ler", () => {
  it("com a sessão caída, manda entrar em vez de mandar esperar", async () => {
    rotas.set("GET /api/temas/t1/imagens", () => bad(401, { error: "Não autorizado" }));
    render(
      <ToastProvider>
        <Temas />
      </ToastProvider>,
    );
    await abrirPasta();

    expect(screen.getByText(/Não foi possível ler a pasta deste tema/)).toBeTruthy();
    expect(screen.getAllByText(/A sessão expirou/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/falha temporária/)).toBeNull();
    // E o convite a carregar fotos continua fora do ecrã: era ele que levava a
    // duplicar uma pasta de 300 fotos que está lá inteira.
    expect(screen.queryByText(/Arrasta para aqui/)).toBeNull();
  });

  it("quando o servidor explica, é a explicação DELE que aparece", async () => {
    rotas.set("GET /api/temas/t1/imagens", () =>
      bad(503, { error: "O armazenamento está a ser migrado — volta daqui a uma hora." }),
    );
    render(
      <ToastProvider>
        <Temas />
      </ToastProvider>,
    );
    await abrirPasta();

    expect(screen.getAllByText(/armazenamento está a ser migrado/).length).toBeGreaterThan(0);
  });

  it("uma pasta mesmo vazia continua a convidar a arrastar fotos", async () => {
    rotas.set("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    render(
      <ToastProvider>
        <Temas />
      </ToastProvider>,
    );
    await abrirPasta();

    expect(screen.getByText(/Arrasta para aqui/)).toBeTruthy();
    expect(screen.queryByText(/Não foi possível ler a pasta/)).toBeNull();
  });
});
