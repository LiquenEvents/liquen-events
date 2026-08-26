// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import ThemePicker, { __resetThemePickerState } from "./ThemePicker";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SELETOR NÃO AFIRMA O QUE NÃO CONSEGUIU PERGUNTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas frases deste diálogo eram AFIRMAÇÕES sobre a biblioteca dela, escritas
 * por cima de leituras que tinham falhado:
 *
 *   «Ainda não há temas. Cria o primeiro em Temas, no menu lateral…»
 *   «Este tema ainda não tem fotos. Adiciona-as em Temas.»
 *
 * Com a sessão caída — o caso comum, porque o back office fica aberto horas e
 * este diálogo abre-se a meio de uma proposta — as duas apareciam com a
 * biblioteca inteira intacta do outro lado. E as duas mandam fazer o passo
 * caro: ir criar de novo o que já existe.
 *
 * O que ficou: a ler → esqueleto; falhou → a razão e a saída; vazio a sério →
 * o convite de sempre, que continua a ser o certo quando é verdade.
 */

type Res = {
  ok: boolean;
  status: number;
  headers: { get: (nome: string) => string | null };
  json: () => Promise<unknown>;
};
const semCabecalhos = { get: () => null };
const ok = (body: unknown): Res => ({
  ok: true,
  status: 200,
  headers: semCabecalhos,
  json: async () => body,
});
const bad = (status: number, body: unknown = null): Res => ({
  ok: false,
  status,
  headers: semCabecalhos,
  json: async () => body,
});

const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  imageCount: 12,
};

let routes: Map<string, () => Res>;

function montar() {
  return render(
    <ToastProvider>
      <ThemePicker quoteId="LQ-001" multiple onClose={() => {}} onPicked={() => {}} />
    </ToastProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  act(() => __resetThemePickerState());
  routes = new Map();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const chave = `${(init?.method ?? "GET").toUpperCase()} ${String(url).split("?")[0]}`;
      const handler = routes.get(chave);
      if (!handler) return Promise.reject(new Error(`rota não simulada: ${chave}`));
      return Promise.resolve(handler());
    }),
  );
});

afterEach(() => {
  cleanup();
  act(() => __resetThemePickerState());
  vi.unstubAllGlobals();
});

describe("ThemePicker — quando a lista de temas não vem", () => {
  it("não afirma que não há temas, e não manda criar o primeiro", async () => {
    routes.set("GET /api/temas", () => bad(500));
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler os temas/)).toBeTruthy());
    expect(
      screen.queryByText(/Ainda não há temas/),
      "o diálogo afirmou que a biblioteca está vazia sem ter conseguido perguntar",
    ).toBeNull();
  });

  it("uma biblioteca mesmo vazia continua a convidar a criar o primeiro tema", async () => {
    routes.set("GET /api/temas", () => ok([]));
    montar();

    await waitFor(() => expect(screen.getByText(/Ainda não há temas/)).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler os temas/)).toBeNull();
  });
});

describe("ThemePicker — quando as fotos do tema não vêm", () => {
  it("não afirma que o tema está sem fotos, e diz que a sessão caiu", async () => {
    routes.set("GET /api/temas", () => ok([THEME]));
    routes.set("GET /api/temas/t1/imagens", () => bad(401, { error: "Não autorizado" }));
    montar();

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível ler a pasta deste tema/)).toBeTruthy(),
    );
    // A razão certa: recarregar daqui a pouco não resolve um 401 — o que
    // resolve é voltar a entrar.
    // Duas vezes: no painel que fica na grelha e no aviso passageiro — este
    // último nomeia a coisa, porque flutua por cima de qualquer ecrã.
    expect(screen.getAllByText(/A sessão expirou/).length).toBeGreaterThan(0);
    expect(screen.getByText(/não deu para ler as fotos deste tema/)).toBeTruthy();
    expect(screen.queryByText(/falha temporária/)).toBeNull();
    expect(screen.queryByText(/ainda não tem fotos/)).toBeNull();
  });

  it("um tema mesmo sem fotos continua a dizer que está vazio", async () => {
    routes.set("GET /api/temas", () => ok([THEME]));
    routes.set("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: [], total: 0, truncated: false }),
    );
    montar();

    await waitFor(() => expect(screen.getByText(/ainda não tem fotos/)).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler a pasta/)).toBeNull();
  });

  it("com fotos, a grelha desenha-se como sempre", async () => {
    routes.set("GET /api/temas", () => ok([THEME]));
    routes.set("GET /api/temas/t1/imagens", () =>
      ok({
        ok: true,
        images: [{ path: "t1/foto-1.jpg", url: "https://cdn.test/1.jpg" }],
        total: 1,
        truncated: false,
      }),
    );
    montar();

    await waitFor(() => expect(screen.getByRole("button", { name: /^Foto 1 de 1/ })).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler/)).toBeNull();
  });
});
