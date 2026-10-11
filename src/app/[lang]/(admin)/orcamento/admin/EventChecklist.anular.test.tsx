// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventChecklist from "./EventChecklist";
import type { ChecklistItem, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «ANULAR» DA CHECKLIST É O DA CASA — E COBRE MAIS GESTOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «tem que haver no site todo, em tudo aquilo que se
 * faz, uma forma de voltar atrás». A checklist tinha uma tira própria de oito
 * segundos, só para remover e «Marcar todas». Passou ao aviso comum
 * (`ui/anular.ts`, 10 s), e ganharam «Anular» também «Limpar concluídas»,
 * «Gerar», os itens do modelo e o editar.
 *
 * O que se prende aqui:
 *  1. o «Anular» repõe a lista INTEIRA de antes, com a `base` da gravação;
 *  2. «Limpar concluídas» — a única que pergunta — também se anula depois;
 *  3. quando outra pessoa mexeu entretanto (409), o «Anular» não pisa o
 *     trabalho dela e NÃO diz «Anulado.».
 */

function resposta(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ITENS: ChecklistItem[] = [
  { id: "c1", label: "Confirmar catering", done: true },
  { id: "c2", label: "Reservar transporte", done: false },
  { id: "c3", label: "Levar extensões", done: true },
];

let corpos: { checklist: ChecklistItem[]; base?: { checklist: ChecklistItem[] } }[] = [];

function montar(fetchImpl?: (n: number) => Response) {
  corpos = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      corpos.push(JSON.parse(String(init?.body ?? "{}")));
      return fetchImpl ? fetchImpl(corpos.length) : resposta(200);
    }),
  );
  return render(
    <ToastProvider>
      <EventChecklist
        quote={{ id: "q1", category: "particulares", checklist: ITENS } as Quote}
        onChange={() => {}}
      />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("«Anular» na checklist", () => {
  it("remover: o aviso tem «Anular», e repõe a linha no sítio com a base certa", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: "Remover Reservar transporte" }));
    expect(await screen.findByText(/«Reservar transporte» saiu da checklist/)).toBeTruthy();

    const anular = screen.getByRole("button", { name: "Anular" });
    expect(anular).not.toBeDisabled();
    await user.click(anular);

    await waitFor(() => expect(corpos.length).toBe(2));
    expect(corpos[1].checklist.map((i) => i.label)).toEqual([
      "Confirmar catering",
      "Reservar transporte",
      "Levar extensões",
    ]);
    // A base do «Anular» é a lista que a remoção deixou — é contra ela que o
    // servidor confere se alguém mexeu pelo meio.
    expect(corpos[1].base?.checklist.map((i) => i.id)).toEqual(["c1", "c3"]);
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });

  it("«Limpar concluídas» pergunta, e depois ainda se anula", async () => {
    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /Limpar concluídas/i }));
    await user.click(await screen.findByRole("button", { name: /Remover as 2/i }));
    await waitFor(() => expect(corpos.length).toBe(1));
    expect(corpos[0].checklist.map((i) => i.id)).toEqual(["c2"]);

    expect(await screen.findByText(/2 concluídas removidas/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Anular" }));
    await waitFor(() => expect(corpos.length).toBe(2));
    expect(corpos[1].checklist.map((i) => i.id)).toEqual(["c1", "c2", "c3"]);
  });

  it("se a checklist mudou noutro sítio, o «Anular» não a pisa e não diz «Anulado.»", async () => {
    const user = userEvent.setup();
    const doServidor: ChecklistItem[] = [{ id: "x", label: "Da colega", done: false }];
    montar((n) =>
      n === 1 ? resposta(200) : resposta(409, { current: { checklist: doServidor } }),
    );
    await user.click(screen.getByRole("button", { name: "Remover Reservar transporte" }));
    await screen.findByText(/saiu da checklist/);
    await user.click(screen.getByRole("button", { name: "Anular" }));

    expect(await screen.findByText(/foi alterada noutro sítio/)).toBeTruthy();
    expect(screen.getByText("Da colega")).toBeTruthy();
    expect(screen.queryByText("Anulado.")).toBeNull();
  });
});
