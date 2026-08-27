// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import Servicos from "./Servicos";
import type { ServicoDaBiblioteca } from "./BibliotecaServicos";

/**
 * O ecrã onde a redacção se corrige. O que se prende aqui é o que o torna útil:
 * ver o que está por traduzir, corrigir sem perder o resto, e arquivar em vez
 * de apagar.
 */

const servico = (over: Partial<ServicoDaBiblioteca> = {}): ServicoDaBiblioteca => ({
  id: "s1",
  nome: "Arranjos de mesa",
  descricao: "Arranjos baixos.",
  nomeEn: "Table arrangements",
  descricaoEn: "Low arrangements.",
  categoria: "Flores",
  ...over,
});

let enviados: { url: string; method: string; body: Record<string, unknown> }[] = [];

function montar(servicos: ServicoDaBiblioteca[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      if (init?.method) {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        enviados.push({ url: String(url), method: init.method, body });
        return { ok: true, status: 200, json: async () => ({ ...servicos[0], ...body }) };
      }
      return { ok: true, status: 200, json: async () => servicos };
    }),
  );
  render(
    <ToastProvider>
      <Servicos />
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

describe("o que falta traduzir", () => {
  it("conta os que não têm inglês e diz porque é que isso importa", async () => {
    montar([servico({ id: "a" }), servico({ id: "b", nome: "Arco", nomeEn: "" })]);
    await waitFor(() => expect(screen.getByText(/1 sem versão inglesa/)).toBeTruthy());
    expect(screen.getByText(/lê-se como descuido/)).toBeTruthy();
  });

  it("com tudo traduzido não há aviso nenhum", async () => {
    montar([servico({})]);
    await waitFor(() => expect(screen.getByText("Arranjos de mesa")).toBeTruthy());
    expect(screen.queryByText(/sem versão inglesa/)).toBeNull();
  });
});

describe("corrigir", () => {
  it("abre com o que lá está e grava o que se mudou", async () => {
    montar([servico({})]);
    await waitFor(() => expect(screen.getByText("Arranjos de mesa")).toBeTruthy());

    await userEvent.click(screen.getByRole("button", { name: "Editar" }));
    const campoEn = screen.getByLabelText(/Name \(EN\)/) as HTMLInputElement;
    expect(campoEn.value).toBe("Table arrangements");

    await userEvent.clear(campoEn);
    await userEvent.type(campoEn, "Centrepieces");
    await userEvent.click(screen.getByRole("button", { name: "Guardar correcção" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].method).toBe("PATCH");
    expect(enviados[0].body.nomeEn).toBe("Centrepieces");
    // O resto vai junto e sem se perder: um PATCH parcial que só levasse o
    // campo tocado deixaria o servidor sem forma de distinguir "não mudou" de
    // "apagar".
    expect(enviados[0].body.nome).toBe("Arranjos de mesa");
  });

  it("um serviço novo vai por POST", async () => {
    montar([]);
    await waitFor(() => expect(screen.getByText(/biblioteca está vazia/)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Serviço novo" }));
    await userEvent.type(screen.getByLabelText(/Nome \(PT\)/), "Arco floral");
    await userEvent.click(screen.getByRole("button", { name: "Guardar na biblioteca" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].method).toBe("POST");
    expect(enviados[0].body.nome).toBe("Arco floral");
  });

  it("sem nome não deixa gravar", async () => {
    montar([]);
    await waitFor(() => expect(screen.getByText(/biblioteca está vazia/)).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Serviço novo" }));
    expect(screen.getByRole("button", { name: "Guardar na biblioteca" })).toBeDisabled();
  });
});

describe("arquivar", () => {
  it("arquiva e diz que continua nas propostas antigas", async () => {
    montar([servico({})]);
    await waitFor(() => expect(screen.getByText("Arranjos de mesa")).toBeTruthy());
    await userEvent.click(screen.getByRole("button", { name: "Arquivar" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body).toEqual({ arquivado: true });
    await waitFor(() => expect(screen.getByText(/continua nas propostas antigas/)).toBeTruthy());
  });

  it("os arquivados estão escondidos até se pedir para os ver", async () => {
    montar([servico({ id: "a", nome: "Antigo", arquivado: true })]);
    await waitFor(() => expect(screen.getByText(/biblioteca está vazia/)).toBeTruthy());
    await userEvent.click(screen.getByLabelText(/Ver arquivados/));
    expect(screen.getByText("Antigo")).toBeTruthy();
  });
});
