// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import EventMaterialPanel from "./EventMaterial";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «VOLTAR A GERAR» — O BOTÃO QUE CONVIDAVA A DEITAR FORA O REGRESSO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A geração preserva o que está CARREGADO, as notas e o veículo. NÃO preserva
 * as marcações de devolvido nem as de em falta — e essas são as que se fazem no
 * regresso, com a carrinha à porta, uma a uma, a conferir o que voltou.
 *
 * O botão dizia «Voltar a gerar» e mais nada. Pior: a mensagem de sucesso conta
 * as marcações MANTIDAS, o que se lê como «podes carregar outra vez, não custa
 * nada». Custa — e o inventário do back office deu este como um dos piores da
 * área, precisamente porque a frase convidava ao gesto.
 *
 * A pergunta CONTA o que se perde. E a primeira geração, essa, continua a não
 * perguntar nada: não há checklist, não há marcações, não há nada a perder — e
 * uma caixa ali seria atrito numa tarefa que não é destrutiva.
 */

const QUOTE = { id: "LIQ-9", name: "Casamento Ana & Rui" } as unknown as Quote;

const base = {
  eventId: "e1",
  category: "Estrutura",
  kind: "reutilizavel" as const,
  qty: 1,
  critical: false,
  origin: "base" as const,
  originLabel: "Essenciais de carrinha",
  missing: false,
};

const COM_MARCACOES = {
  evento: { id: "e1", quoteId: "LIQ-9", status: "devolvida", vehicles: [] },
  itens: [
    { ...base, id: "m1", name: "Escadote", returnedAt: "2026-08-20T10:00:00.000Z" },
    { ...base, id: "m2", name: "Extensão 25 m", returnedAt: "2026-08-20T10:00:00.000Z" },
    { ...base, id: "m3", name: "Fita-cola", missing: true },
  ],
};

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

let chamadas: { metodo: string; url: string }[] = [];

/** `estado` é o que a leitura devolve — com checklist, ou ainda sem nenhuma. */
function servidor(estado: unknown) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    chamadas.push({ metodo, url: String(url) });
    if (metodo === "GET") return reply(200, estado);
    return reply(200, { evento: { id: "e1" }, itens: [], preservadas: 0 });
  });
}

const montar = () => render(<EventMaterialPanel quote={QUOTE} />);

beforeEach(() => {
  chamadas = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Material do evento — voltar a gerar", () => {
  async function abrirAPergunta(user: ReturnType<typeof userEvent.setup>) {
    vi.stubGlobal("fetch", servidor(COM_MARCACOES));
    montar();
    await user.click(await screen.findByRole("button", { name: /^Voltar a gerar$/i }));
    return screen.findByRole("dialog");
  }

  it("a pergunta nomeia o evento e CONTA as marcações que se perdem", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);

    expect(
      within(caixa).getByText(/Voltar a gerar a checklist de «Casamento Ana & Rui»\?/i),
    ).toBeTruthy();
    expect(within(caixa).getByText(/2 devoluções marcadas no regresso/i)).toBeTruthy();
    expect(within(caixa).getByText(/1 item marcado em falta/i)).toBeTruthy();
    // E o que NÃO se perde, que é a outra metade da decisão.
    expect(within(caixa).getByText(/o que já está carregado, as notas e o veículo/i)).toBeTruthy();
    expect(within(caixa).getByRole("button", { name: /^Voltar a gerar$/i })).toBeTruthy();
  });

  it("cancelar não gera nada", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Cancelar$/i }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(chamadas.filter((c) => c.metodo === "POST")).toEqual([]);
    // E as marcações continuam lá.
    expect(screen.getByText("Escadote")).toBeTruthy();
  });

  it("responder que sim gera mesmo", async () => {
    const user = userEvent.setup();
    const caixa = await abrirAPergunta(user);
    await user.click(within(caixa).getByRole("button", { name: /^Voltar a gerar$/i }));

    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
  });

  it("a PRIMEIRA geração não pergunta nada — não há nada a perder", async () => {
    vi.stubGlobal("fetch", servidor({ evento: null, itens: [] }));
    const user = userEvent.setup();
    montar();
    await user.click(await screen.findByRole("button", { name: /^Gerar checklist$/i }));

    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
  });
});
