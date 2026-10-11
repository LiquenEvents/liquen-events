// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Reciclagem from "./Reciclagem";
import { useDepoisDeApagar } from "./ui/depois-de-apagar";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DA RECICLAGEM, E O «ANULAR» DEPOIS DE APAGAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase R3 de `docs/TUDO-REVERSIVEL.md` («Reciclagem 30 dias»). Prende-se:
 *  1. a lista diz o quê, o tipo e quem apagou;
 *  2. «Repor» chama o servidor e a linha sai da lista;
 *  3. «Apagar de vez» pergunta antes — é a única coisa sem volta;
 *  4. sem a tabela, o ecrã diz que a Reciclagem não está ligada;
 *  5. depois de apagar noutro ecrã, o aviso traz «Anular», que repõe pela
 *     Reciclagem; e sem ela, diz que apagou de vez.
 */

const ENTRADA = {
  id: "r1",
  tipo: "tarefa",
  tipoNome: "Tarefa",
  rotulo: "TESTE Confirmar a tenda",
  apagadoEm: "2026-10-09T10:00:00.000Z",
  apagadoPor: "Catarina",
  saiEm: "2099-11-08T10:00:00.000Z",
};

const resposta = (status: number, body: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  }) as Response;

let escritas: { url: string; method: string }[] = [];
let lista: { ligada: boolean; itens: (typeof ENTRADA)[] };

beforeEach(() => {
  __resetListCache();
  escritas = [];
  lista = { ligada: true, itens: [ENTRADA] };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method ?? "GET";
      if (method === "GET") return resposta(200, lista);
      escritas.push({ url: String(url), method });
      lista = { ...lista, itens: [] };
      return resposta(200, { ok: true });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const desenhar = () =>
  render(
    <ToastProvider>
      <Reciclagem />
    </ToastProvider>,
  );

describe("o ecrã da Reciclagem", () => {
  it("lista o quê, o tipo e quem apagou", async () => {
    desenhar();
    expect((await screen.findAllByText("TESTE Confirmar a tenda")).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Tarefa/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Catarina/).length).toBeGreaterThan(0);
  });

  it("«Repor» chama o servidor, e a linha sai da lista", async () => {
    const user = userEvent.setup();
    desenhar();
    await user.click((await screen.findAllByRole("button", { name: "Repor" }))[0]);
    await waitFor(() =>
      expect(escritas).toEqual([{ url: "/api/reciclagem/r1/repor", method: "POST" }]),
    );
    expect(await screen.findByText(/reposto/)).toBeTruthy();
    expect(await screen.findByText("Nada na Reciclagem")).toBeTruthy();
  });

  it("«Apagar de vez» pergunta antes, e só então apaga", async () => {
    const user = userEvent.setup();
    desenhar();
    await user.click((await screen.findAllByRole("button", { name: "Apagar de vez" }))[0]);
    const caixa = await screen.findByRole("dialog");
    expect(within(caixa).getByText(/não pode ser reposto/)).toBeTruthy();
    expect(escritas).toEqual([]);
    await user.click(within(caixa).getByRole("button", { name: "Apagar de vez" }));
    await waitFor(() =>
      expect(escritas).toEqual([{ url: "/api/reciclagem/r1", method: "DELETE" }]),
    );
  });

  it("sem a tabela, diz que a Reciclagem ainda não está ligada", async () => {
    lista = { ligada: false, itens: [] };
    desenhar();
    expect(await screen.findByText("A Reciclagem ainda não está ligada")).toBeTruthy();
    expect(screen.queryByText("Nada na Reciclagem")).toBeNull();
  });
});

describe("depois de apagar noutro ecrã", () => {
  const comAviso = ({ children }: { children: React.ReactNode }) => (
    <ToastProvider>{children}</ToastProvider>
  );

  it("com a Reciclagem, o aviso traz «Anular», que repõe pela Reciclagem", async () => {
    const user = userEvent.setup();
    const relido = vi.fn();
    const { result } = renderHook(() => useDepoisDeApagar(), { wrapper: comAviso });
    act(() => result.current({ ok: true, reciclagem: { id: "r9" } }, "«X» eliminada.", relido));
    expect(await screen.findByText(/Fica 30 dias na Reciclagem/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() =>
      expect(escritas).toEqual([{ url: "/api/reciclagem/r9/repor", method: "POST" }]),
    );
    await waitFor(() => expect(relido).toHaveBeenCalled());
    expect(await screen.findByText("Reposto.")).toBeTruthy();
  });

  it("sem a Reciclagem, não promete volta: diz que apagou de vez", async () => {
    const { result } = renderHook(() => useDepoisDeApagar(), { wrapper: comAviso });
    act(() => result.current({ ok: true, reciclagem: false }, "«X» eliminada."));
    expect(await screen.findByText(/Apagado de vez/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Anular" })).toBeNull();
  });
});
