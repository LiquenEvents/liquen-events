// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import EventMaterialPanel from "./EventMaterial";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUEM FECHOU A CARRINHA, E A QUE HORAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `loadedBy` é gravado desde sempre: quem marca um item fica com o nome ao
 * lado da marca, viaja para a base de dados, entra na cópia de segurança — e
 * NÃO ERA LIDO EM LADO NENHUM. O selo do escritório dizia «Carrinha carregada»
 * e mais nada.
 *
 * É a diferença entre um registo e um reconhecimento. Alguém encheu aquela
 * carrinha às seis e doze da manhã, e o produto sabia — só não dizia.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const QUOTE = { id: "q1", name: "Casamento Ana & Rui" } as Quote;

/** O que a rota do material devolve. */
let resposta: unknown = { evento: null, itens: [] };

const item = (over: Record<string, unknown>) => ({
  id: "i1",
  name: "Escadote",
  category: "Logística",
  qty: 1,
  ...over,
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply(200, resposta)),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const montar = () =>
  render(
    <ToastProvider>
      <EventMaterialPanel quote={QUOTE} />
    </ToastProvider>,
  );

describe("o selo da carrinha carregada", () => {
  it("diz QUEM fechou e A QUE HORAS", async () => {
    resposta = {
      evento: { id: "e1", status: "carregada" },
      itens: [
        item({ id: "i1", loadedAt: "2026-08-30T05:40:00.000Z", loadedBy: "Ana" }),
        item({ id: "i2", loadedAt: "2026-08-30T06:12:00.000Z", loadedBy: "Ana" }),
      ],
    };
    montar();
    const selo = await screen.findByText(/Carrinha carregada/);
    expect(selo.textContent, "o selo continua a não dizer quem foi").toContain("por Ana");
    expect(selo.textContent).toMatch(/às \d/);
  });

  it("o ÚLTIMO a ser marcado é quem fechou", async () => {
    /**
     * A carrinha fica pronta quando a última coisa entra. Se várias pessoas
     * carregaram, é o nome de quem rematou — e é esse que responde à pergunta
     * «já saiu?».
     */
    resposta = {
      evento: { id: "e1", status: "carregada" },
      itens: [
        item({ id: "i1", loadedAt: "2026-08-30T05:00:00.000Z", loadedBy: "Ana" }),
        item({ id: "i2", loadedAt: "2026-08-30T06:12:00.000Z", loadedBy: "Catarina" }),
      ],
    };
    montar();
    const selo = await screen.findByText(/Carrinha carregada/);
    expect(selo.textContent).toContain("por Catarina");
    expect(selo.textContent).not.toContain("por Ana");
  });

  it("um carregamento ANTIGO, sem nome gravado, não diz «por undefined»", async () => {
    /**
     * Há marcações anteriores a este campo ser gravado. O selo tem de degradar
     * para a hora, e depois para a frase de sempre — nunca para uma frase
     * partida.
     */
    resposta = {
      evento: { id: "e1", status: "carregada" },
      itens: [item({ loadedAt: "2026-08-30T06:12:00.000Z" })],
    };
    montar();
    const selo = await screen.findByText(/Carrinha carregada/);
    expect(selo.textContent).not.toMatch(/undefined|null/);
    expect(selo.textContent).toMatch(/às \d/);
  });

  it("sem marcação nenhuma, fica a frase de sempre", async () => {
    resposta = { evento: { id: "e1", status: "carregada" }, itens: [item({})] };
    montar();
    const selo = await screen.findByText(/Carrinha carregada/);
    expect(selo.textContent?.trim()).toBe("Carrinha carregada");
  });

  it("o selo só aparece quando a carrinha ESTÁ carregada", async () => {
    // Um item marcado não é a carrinha fechada: o estado do evento é que manda.
    // «preparada» é o estado antes de a carrinha fechar — os três são
    // `preparada`, `carregada` e `devolvida`.
    resposta = {
      evento: { id: "e1", status: "preparada" },
      itens: [item({ loadedAt: "2026-08-30T06:12:00.000Z", loadedBy: "Ana" })],
    };
    montar();
    await waitFor(() => expect(screen.queryByText(/Escadote/)).toBeTruthy());
    expect(screen.queryByText(/Carrinha carregada/)).toBeNull();
  });
});
