// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AGOSTO 2…» — O TÍTULO DA VISTA CORTADO A MEIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num telemóvel de 390×844: «Agosto 2026» mostrava **90 px** dos 103
 * de que precisa, e lia-se «Agosto 2…». No computador cabe (124 de 124).
 *
 * A causa: o título é `truncate` e divide UMA fila com o grupo de navegação do
 * mês («‹ Hoje ›», mais o «Exportar» a partir de `sm`), que é `shrink-0`.
 * Quando não cabe, quem cede é sempre o título — que é o único com `min-w-0`.
 *
 * A correcção é a lição que o `MOBILE-AUDIT.md` já tinha escrito para as
 * linhas dos grupos de serviços: **`flex-wrap` sozinho**, sem ponto de corte
 * por viewport, mais um mínimo legível no título. Quebra quando não cabe, que
 * é exactamente a pergunta certa, e não depende do aparelho — este cabeçalho
 * vive dentro de um cartão que num ecrã grande também pode ser estreito.
 *
 * Num DOM sem disposição não se afirmam píxeis; afirma-se o que os produz.
 * A medição a sério está no navegador, antes e depois.
 */

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([])),
  );
  vi.useFakeTimers({ shouldAdvanceTime: true });
  process.env.TZ = "Europe/Lisbon";
  vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

it("o título do mês não corta, e o cabeçalho quebra linha quando não cabe", async () => {
  render(
    <ToastProvider>
      <Calendario quotes={[]} onOpen={() => {}} />
    </ToastProvider>,
  );
  const titulo = await waitFor(() => screen.getByRole("heading", { name: "Agosto 2026" }));

  expect(
    titulo.className.split(/\s+/),
    "«Agosto 2026» mostrava 90 px dos 103 que precisa — não pode cortar",
  ).not.toContain("truncate");

  // A fila tem de poder quebrar, senão o título volta a ser o que cede…
  const fila = titulo.parentElement?.parentElement;
  expect(fila?.className.split(/\s+/)).toContain("flex-wrap");

  // … e precisa de um mínimo, senão `flex-wrap` nunca chega a disparar: com
  // `min-w-0` o título encolhe até 0 px em vez de empurrar os botões para baixo.
  const coluna = titulo.parentElement!;
  expect(
    coluna.className,
    "sem largura mínima, o título encolhe em vez de fazer a fila quebrar",
  ).toMatch(/min-w-\[/);
});
