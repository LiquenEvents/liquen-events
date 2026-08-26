// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { metaFor, UNKNOWN_STATUS_COLOR } from "./status-meta";
import Tarefas from "./Tarefas";
import Contratos from "./Contratos";

/**
 * UMA LINHA MÁ NÃO PODE DERRUBAR O ECRÃ TODO.
 *
 * Estas listas pintavam a etiqueta indexando um mapa com o valor da própria
 * linha — `STATUS_META[i.status].color`, `PRIORITY_META[t.priority].color`.
 * Basta um valor fora do mapa para isso ser `undefined`, e como são componentes
 * de cliente o erro sobe ao limite de erro e substitui o BACK OFFICE INTEIRO
 * pelo ecrã "Ocorreu um erro inesperado" — não só aquela linha.
 *
 * A API valida, portanto pelo uso normal não acontece. Acontece com dados
 * antigos, uma migração, ou uma correcção feita à mão na base de dados — que é
 * quando ela menos pode dar-se ao luxo de perder o ecrã.
 *
 * O mesmo defeito já tinha sido corrigido em `Propostas.tsx` (ver
 * `Propostas.test.tsx`); estas três listas tinham a mesma forma.
 */

/** O `useCachedList` lê o estado (304) e o cabeçalho ETag além do corpo. */
const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"teste"' }),
  json: async () => body,
});

function serve(routes: Record<string, unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = String(url).split("?")[0];
      return response(routes[path] ?? []);
    }),
  );
}

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("metaFor", () => {
  const MAP = { aceite: { label: "Ganho", color: "#525a2f" } };

  it("devolve a entrada do mapa quando o estado é conhecido", () => {
    expect(metaFor(MAP, "aceite")).toEqual({ label: "Ganho", color: "#525a2f" });
  });

  it("mostra o valor cru em cinzento quando o estado é desconhecido", () => {
    expect(metaFor(MAP, "revogado")).toEqual({
      label: "revogado",
      color: UNKNOWN_STATUS_COLOR,
    });
  });

  it("não devolve rótulo vazio quando o estado vem vazio ou em falta", () => {
    // Um `label` vazio desenharia uma etiqueta sem texto — pior do que um traço.
    expect(metaFor(MAP, "").label).toBe("—");
    expect(metaFor(MAP, undefined as unknown as string).label).toBe("—");
  });

  it("nunca lê propriedades de undefined (era isto que derrubava o ecrã)", () => {
    expect(() => metaFor({}, "seja-o-que-for").color).not.toThrow();
  });
});

describe("Tarefas — prioridade fora do mapa", () => {
  it("desenha a lista toda e mostra o valor cru", async () => {
    serve({
      "/api/tarefas": [
        {
          id: "t1",
          title: "Tarefa Normal",
          done: false,
          priority: "alta",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "t2",
          title: "Tarefa Estranha",
          done: false,
          // Fora do mapa (alta/normal/baixa).
          priority: "urgentissima",
          createdAt: "2026-01-02T00:00:00.000Z",
        },
      ],
    });

    render(
      <ToastProvider>
        <Tarefas />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/Tarefa Normal/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Tarefa Estranha/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("urgentissima").length).toBeGreaterThan(0);
  });
});

describe("Contratos — estado fora do mapa", () => {
  it("desenha a lista toda e mostra o valor cru", async () => {
    serve({
      "/api/contratos": [
        {
          id: "c1",
          clientName: "Contrato Normal",
          status: "aceite",
          createdAt: "2026-01-01T00:00:00.000Z",
          termsVersion: "v1",
        },
        {
          id: "c2",
          clientName: "Contrato Estranho",
          // Fora do mapa (aceite/pendente).
          status: "revogado",
          createdAt: "2026-01-02T00:00:00.000Z",
          termsVersion: "v1",
        },
      ],
    });

    render(
      <ToastProvider>
        <Contratos />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getAllByText(/Contrato Normal/).length).toBeGreaterThan(0));
    expect(screen.getAllByText(/Contrato Estranho/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("revogado").length).toBeGreaterThan(0);
  });
});
