// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * MOVER UM CARTÃO TEM VOLTA ATRÁS — «ANULAR» NO AVISO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Tem que haver no site todo, em tudo aquilo que se faz, uma forma de voltar
 * atrás» (10/10, `docs/TUDO-REVERSIVEL.md`). Um cartão arrastado para a
 * coluna errada volta com um toque, e o servidor fica a saber: o estado volta,
 * e o histórico diz «· anulado». Desfazer um «Ganho» leva de volta o que ele
 * arrastou (`desfazerGanho`).
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana e João",
    email: "ana@exemplo.pt",
    phone: "",
    company: "",
    guests: 100,
    date: "2027-06-12",
    location: "Évora",
    notes: "",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: "2026-01-10T10:00:00.000Z",
    status: "cotado",
    ...over,
  }) as unknown as Quote;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kanban — «Anular» depois de mover", () => {
  it("repõe a coluna, grava o estado anterior com a linha «anulado» e desfaz o Ganho", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const corpo = JSON.parse(String(init?.body ?? "{}"));
      return reply(200, { ...pedido(), status: corpo.status });
    });
    vi.stubGlobal("fetch", fetchMock);
    const onStatusChange = vi.fn();
    render(
      <ToastProvider>
        <Kanban
          quotes={[pedido()]}
          onOpen={() => {}}
          onStatusChange={onStatusChange}
          userName="Catarina"
        />
      </ToastProvider>,
    );

    const cartao = screen.getByRole("button", { name: /^Ana e João,/ });
    cartao.focus();
    await userEvent.keyboard("{ArrowRight}");

    const anular = await screen.findByRole("button", { name: "Anular" });
    expect(onStatusChange.mock.calls.at(-1)).toEqual(["LIQ-1", "aceite"]);
    await userEvent.click(anular);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/orcamento/LIQ-1");
    expect(init?.method).toBe("PATCH");
    const corpo = JSON.parse(String(init?.body));
    expect(corpo.status).toBe("cotado");
    expect(corpo.desfazerGanho).toBe(true);
    expect(corpo.activityLogAppend[0].summary).toBe("Ganho → Proposta enviada · anulado");
    expect(corpo.activityLogAppend[0].actor).toBe("Catarina");
    await waitFor(() => expect(onStatusChange.mock.calls.at(-1)).toEqual(["LIQ-1", "cotado"]));
    expect(await screen.findByText("Anulado.")).toBeTruthy();
  });

  it("se o servidor recusar o «Anular», diz porquê — nunca «Anulado.»", async () => {
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        ++n === 1
          ? reply(200, { ...pedido(), status: "aceite" })
          : reply(409, { error: "Outra pessoa mudou este pedido." }),
      ),
    );
    render(
      <ToastProvider>
        <Kanban quotes={[pedido()]} onOpen={() => {}} onStatusChange={() => {}} userName="Rita" />
      </ToastProvider>,
    );
    const cartao = screen.getByRole("button", { name: /^Ana e João,/ });
    cartao.focus();
    await userEvent.keyboard("{ArrowRight}");
    await userEvent.click(await screen.findByRole("button", { name: "Anular" }));
    expect(await screen.findByText("Outra pessoa mudou este pedido.")).toBeTruthy();
    expect(screen.queryByText("Anulado.")).toBeNull();
  });
});
