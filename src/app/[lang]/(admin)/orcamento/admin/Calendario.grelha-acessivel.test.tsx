// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario, { diaPelaTecla } from "./Calendario";

/**
 * Achado n.º 24 da auditoria — a fase 11 do `docs/APPLE-CALENDARIO.md`. A
 * grelha do mês era um `role="group"` de `role="button"` com botões lá dentro
 * (controlos dentro de controlos). Passa a `grid` / `row` / `gridcell`, com UM
 * dia no fio do Tab e as teclas da Parte 8.
 */
describe("diaPelaTecla", () => {
  it.each([
    ["ArrowRight", "2026-01-16"],
    ["ArrowLeft", "2026-01-14"],
    ["ArrowDown", "2026-01-22"],
    ["ArrowUp", "2026-01-08"],
    ["Home", "2026-01-12"], // a semana começa à segunda
    ["End", "2026-01-18"],
    ["PageDown", "2026-02-15"],
    ["PageUp", "2025-12-15"],
  ])("%s a partir de quinta, 15 de Janeiro → %s", (tecla, esperado) => {
    expect(diaPelaTecla("2026-01-15", tecla)).toBe(esperado);
  });

  it("PageDown encosta ao fim do mês quando o dia não existe", () => {
    expect(diaPelaTecla("2026-01-31", "PageDown")).toBe("2026-02-28");
  });

  it("uma tecla que não é de navegação não leva a lado nenhum", () => {
    expect(diaPelaTecla("2026-01-15", "a")).toBeNull();
  });
});

describe("a grelha do mês", () => {
  const resposta = (body: unknown) =>
    ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta([])),
    );
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    delete process.env.TZ;
    vi.unstubAllGlobals();
  });

  const montar = async () => {
    render(
      <ToastProvider>
        <Calendario quotes={[]} onOpen={() => {}} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Janeiro 2026")).toBeInTheDocument());
  };

  it("é uma grid de linhas e dias, com hoje marcado e um só dia no Tab", async () => {
    await montar();
    const grelha = screen.getByRole("grid", { name: "Calendário de Janeiro 2026" });
    expect(grelha.querySelectorAll('[role="row"]').length).toBeGreaterThanOrEqual(4);
    const hoje = screen.getByRole("gridcell", { name: /15 de Janeiro de 2026 \(hoje\)/ });
    expect(hoje).toHaveAttribute("aria-current", "date");
    const noTab = grelha.querySelectorAll('[role="gridcell"][tabindex="0"]');
    expect(noTab).toHaveLength(1);
    expect(noTab[0]).toBe(hoje);
    expect(grelha.querySelector('[role="button"]')).toBeNull();
  });

  it("as setas levam o foco dia a dia, e o PageDown muda de mês", async () => {
    await montar();
    const hoje = screen.getByRole("gridcell", { name: /15 de Janeiro de 2026/ });
    hoje.focus();
    fireEvent.keyDown(hoje, { key: "ArrowRight" });
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("gridcell", { name: /16 de Janeiro de 2026/ }),
      ),
    );
    fireEvent.keyDown(document.activeElement!, { key: "PageDown" });
    await waitFor(() => expect(screen.getByText("Fevereiro 2026")).toBeInTheDocument());
    await waitFor(() =>
      expect(document.activeElement).toBe(
        screen.getByRole("gridcell", { name: /16 de Fevereiro de 2026/ }),
      ),
    );
  });
});
