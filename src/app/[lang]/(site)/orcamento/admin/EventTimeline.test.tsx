// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventTimeline from "./EventTimeline";
import type { Quote, TimelineItem } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * APAGAR DOIS MOMENTOS DO GUIÃO NÃO PODE RESSUSCITAR OS DOIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `persist()` guardava o guião inteiro antes do pedido e repunha-o no erro.
 * Aqui não há confirmação nenhuma a separar dois cliques no × — e o guião
 * limpa-se assim, a correr a lista. Com dois PATCH no ar, o segundo leva o guião
 * COMPLETO (já sem o primeiro momento), portanto o servidor fica com os dois
 * apagados; mas o primeiro, ao falhar, repunha o instante anterior às DUAS
 * remoções e devolvia ao ecrã um momento que já não existe.
 *
 * E é um guião que se imprime e se entrega à equipa na manhã do evento.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const MOMENTOS: TimelineItem[] = [
  { id: "t1", time: "09:00", title: "Montagem" },
  { id: "t2", time: "17:00", title: "Cerimónia" },
  { id: "t3", time: "20:00", title: "Jantar" },
];

const quoteCom = (timeline: TimelineItem[]) => ({ id: "q1", timeline }) as Quote;

function montar(timeline: TimelineItem[], onChange: (i: TimelineItem[]) => void = () => {}) {
  return render(
    <ToastProvider>
      <EventTimeline quote={quoteCom(timeline)} onChange={onChange} />
    </ToastProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Cronograma do dia — duas remoções ao mesmo tempo", () => {
  it("a que falha não traz de volta o momento que o servidor apagou", async () => {
    let recusarPrimeira: (() => void) | null = null;
    const primeiraPendente = new Promise<Response>((resolve) => {
      recusarPrimeira = () => resolve(reply(401, { error: "Não autorizado" }));
    });

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++chamadas === 1 ? primeiraPendente : reply(200))),
    );

    const vistoPeloPai: TimelineItem[][] = [];
    const user = userEvent.setup();
    montar(MOMENTOS, (i) => vistoPeloPai.push(i));

    await user.click(screen.getByRole("button", { name: "Remover 09:00 Montagem" }));
    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));
    await waitFor(() => expect(screen.queryByText("Cerimónia")).toBeNull());

    recusarPrimeira!();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      screen.queryByText("Cerimónia"),
      "o guião voltou a mostrar um momento que o servidor já apagou",
    ).toBeNull();
    expect(
      screen.queryByText("Montagem"),
      "a remoção que seguiu no segundo PATCH (aceite) foi desfeita",
    ).toBeNull();
    expect(vistoPeloPai.at(-1)).toEqual([MOMENTOS[2]]);
  });

  it("uma remoção falhada sozinha continua a repor e a avisar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: "não deu" })),
    );

    const user = userEvent.setup();
    montar(MOMENTOS);

    await user.click(screen.getByRole("button", { name: "Remover 17:00 Cerimónia" }));

    await waitFor(() => expect(screen.getByText("Cerimónia")).toBeTruthy());
    expect(screen.getByText(/Não foi possível guardar o guião/)).toBeTruthy();
  });
});
