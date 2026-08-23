// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import Temas from "./Temas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TEMA QUE VOLTA À LISTA SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Arquivar é optimista, e é de propósito: esperar por uma ida à rede para ver
 * uma estrela acender não serve ninguém. O que não podia ficar assim era a
 * reversão — o cartão que ela acabou de arrumar reaparece na lista, e o aviso
 * dizia «Não foi possível guardar. Verifica a ligação.»
 *
 * Sem nomear o tema (e há aqui dezenas), sem separar a rede em baixo da sessão
 * expirada, e sem uma palavra sobre o cartão que acabou de voltar. Quem olha vê
 * a biblioteca a desarrumar-se sozinha.
 */

const T0 = "2026-01-01T00:00:00.000Z";
const TEMA: ThemeSummary = {
  id: "t1",
  name: "Bouquets Campestres",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 0,
};

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const recusa = (status: number, body: unknown = {}) => ({
  ok: false,
  status,
  json: async () => body,
});

/** As leituras respondem sempre; o PATCH responde o que o teste disser. */
function montar(gravacao: () => unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if ((init?.method ?? "GET") !== "GET") return gravacao();
      if (String(url).startsWith("/api/temas/uso")) return ok({});
      return ok([TEMA]);
    }),
  );
  return render(
    <ToastProvider>
      <Temas />
    </ToastProvider>,
  );
}

/** O cartão do tema, pelo grupo que o embrulha — o «⋯» por cima dele tem o
 *  mesmo nome, e é preciso não os confundir. */
function cartao(): HTMLElement {
  return screen.getByRole("group", { name: "Bouquets Campestres" });
}

async function arquivar() {
  await userEvent.click(within(cartao()).getAllByRole("button", { name: "Arquivar" })[0]);
}

const aviso = () => screen.getByRole("alert").textContent ?? "";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Temas — arquivar quando o servidor recusa", () => {
  it("repõe o cartão E diz que ele voltou à lista", async () => {
    montar(() => recusa(503));
    await waitFor(() => expect(cartao()).toBeTruthy());

    await arquivar();

    // O cartão volta a estar por arquivar…
    await waitFor(() =>
      expect(within(cartao()).getAllByRole("button", { name: "Arquivar" }).length).toBeGreaterThan(
        0,
      ),
    );
    // …e a frase nomeia o tema, diz porquê, e diz que ele voltou.
    expect(aviso()).toContain("Bouquets Campestres");
    expect(aviso()).toMatch(/não está a aceitar gravações/);
    expect(aviso()).toContain('"Bouquets Campestres" voltou à lista.');
    expect(aviso()).not.toMatch(/^Não foi possível guardar\./);
  });

  it("com a sessão expirada manda entrar de novo, e não repetir", async () => {
    montar(() => recusa(401, { error: "Não autorizado" }));
    await waitFor(() => expect(cartao()).toBeTruthy());

    await arquivar();

    await waitFor(() => expect(aviso()).toMatch(/sessão expirou/i));
    expect(aviso()).toMatch(/volta a entrar/i);
    expect(aviso()).toContain('"Bouquets Campestres" voltou à lista.');
  });

  it("sem rede, diz que nada se perdeu — e que o cartão voltou", async () => {
    montar(() => {
      throw new TypeError("Failed to fetch");
    });
    await waitFor(() => expect(cartao()).toBeTruthy());

    await arquivar();

    await waitFor(() => expect(aviso()).toMatch(/sem ligação/i));
    expect(aviso()).toMatch(/nada se perdeu/i);
    expect(aviso()).toContain('"Bouquets Campestres" voltou à lista.');
  });

  it("arquivar com sucesso continua a tirar o tema da lista, sem aviso nenhum", async () => {
    montar(() => ok({ ...TEMA, arquivado: true }));
    await waitFor(() => expect(cartao()).toBeTruthy());

    await arquivar();

    await waitFor(() =>
      expect(screen.queryByRole("group", { name: "Bouquets Campestres" })).toBeNull(),
    );
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });
});
