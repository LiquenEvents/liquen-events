// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import DefinicoesProposta from "./DefinicoesProposta";
import Servicos from "./Servicos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * R2b — «ANULAR» NAS DEFINIÇÕES E NA BIBLIOTECA DE SERVIÇOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10, `docs/TUDO-REVERSIVEL.md`).
 *
 *  · as definições da proposta: o «Anular» repõe o que estava GRAVADO antes
 *    do «Guardar» — não o que estava escrito no campo, que muda a cada tecla;
 *  · os serviços: arquivar e corrigir anulam-se pelo mesmo PATCH.
 */

let escritas: { url: string; method: string; body: Record<string, unknown> }[] = [];

beforeEach(() => {
  escritas = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const comAviso = (ui: React.ReactElement) => render(<ToastProvider>{ui}</ToastProvider>);

describe("Definições da proposta", () => {
  it("a margem anula-se para a que estava gravada", async () => {
    let estado = {
      deslocacao: {
        base: "Évora",
        consumoLPor100Km: 9,
        precoLitro: 1.65,
        portagensPorKm: 0.09,
        desgastePorKm: 0.1,
        franquiaKm: 40,
        idaEVolta: true,
      },
      margemMinima: 35,
      definidoEm: { deslocacao: "1970-01-01T00:00:00.000Z", margem: "1970-01-01T00:00:00.000Z" },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "PUT") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          escritas.push({ url, method: "PUT", body });
          estado = { ...estado, margemMinima: (body.valor as { minima: number }).minima };
        }
        return { ok: true, status: 200, json: async () => estado };
      }),
    );
    const user = userEvent.setup();
    comAviso(<DefinicoesProposta />);
    const campo = await screen.findByLabelText(/Avisar abaixo de/);
    await user.clear(campo);
    await user.type(campo, "40");
    await user.click(screen.getByRole("button", { name: "Guardar margem" }));
    await waitFor(() => expect(escritas).toHaveLength(1));
    expect(escritas[0].body).toEqual({ id: "margem", valor: { minima: 40 } });

    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas[1].body).toEqual({ id: "margem", valor: { minima: 35 } });
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });
});

describe("Biblioteca de serviços", () => {
  const SERVICO = {
    id: "s1",
    nome: "Arranjos de mesa",
    descricao: "Arranjos baixos.",
    nomeEn: "Table arrangements",
    descricaoEn: "Low arrangements.",
    categoria: "Flores",
  };

  function montar() {
    let estado: Record<string, unknown> = { ...SERVICO };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method) {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          escritas.push({ url: String(url), method: init.method, body });
          estado = { ...estado, ...body };
          return { ok: true, status: 200, json: async () => estado };
        }
        return { ok: true, status: 200, json: async () => [estado] };
      }),
    );
    comAviso(<Servicos />);
  }

  it("arquivar anula-se desarquivando", async () => {
    montar();
    const user = userEvent.setup();
    await screen.findByText("Arranjos de mesa");
    await user.click(screen.getByRole("button", { name: "Arquivar" }));
    await user.click(await screen.findByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas.map((e) => e.body.arquivado)).toEqual([true, false]);
  });

  it("corrigir anula-se com o texto de antes", async () => {
    montar();
    const user = userEvent.setup();
    await screen.findByText("Arranjos de mesa");
    await user.click(screen.getByRole("button", { name: "Editar" }));
    const campoEn = screen.getByLabelText(/Name \(EN\)/);
    await user.clear(campoEn);
    await user.type(campoEn, "Centrepieces");
    await user.click(screen.getByRole("button", { name: "Guardar correcção" }));
    expect(await screen.findByText(/«Arranjos de mesa» corrigido/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(escritas).toHaveLength(2));
    expect(escritas[1]).toMatchObject({ method: "PATCH", url: "/api/servicos-catalogo/s1" });
    expect(escritas[1].body.nomeEn).toBe("Table arrangements");
  });
});
