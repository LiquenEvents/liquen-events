// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import TagsField from "./TagsField";
import type { Quote } from "@/lib/orcamento/types";

/**
 * DUAS ETIQUETAS SEGUIDAS, E A PRIMEIRA A FALHAR.
 *
 * A gravação é optimista com reversão: mostra já, e repõe se o servidor
 * recusar. O que fazia era repor o estado de ANTES da SUA gravação — e duas
 * etiquetas escritas a seguir uma à outra atropelam-se: a segunda já mandou ao
 * servidor a lista com as DUAS e foi aceite, mas a primeira, ao falhar, repunha
 * o ecrã (e a cópia do pedido no painel) como estava antes das duas. Ficavam
 * apagadas do ecrã etiquetas que o servidor tinha guardado, e a etiqueta
 * seguinte gravava por cima da lista já sem elas.
 */

const quote = { id: "q1", tags: [] as string[] } as unknown as Quote;

/** Cada PATCH fica pendurado até o teste decidir se resultou. */
let porResponder: ((res: { ok: boolean }) => void)[] = [];
const fetchMock = vi.fn(
  () => new Promise<{ ok: boolean }>((resolve) => porResponder.push(resolve)),
);

beforeEach(() => {
  porResponder = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Responde a um PATCH e deixa as promessas correrem até ao fim. */
async function responder(indice: number, ok: boolean) {
  await act(async () => {
    porResponder[indice]({ ok });
  });
}

describe("TagsField com duas gravações ao mesmo tempo", () => {
  it("uma gravação falhada não apaga a etiqueta seguinte, que resultou", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToastProvider>
        <TagsField quote={quote} suggestions={[]} onChange={onChange} />
      </ToastProvider>,
    );

    const campo = screen.getByLabelText("Etiquetas");
    await user.type(campo, "VIP{Enter}");
    await user.type(campo, "Urgente{Enter}");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // A segunda chega ao servidor com as DUAS etiquetas e é aceite; a primeira
    // morre a seguir, numa ligação que caiu.
    await responder(1, true);
    await responder(0, false);

    expect(screen.getByText("VIP")).toBeTruthy();
    expect(screen.getByText("Urgente")).toBeTruthy();
    // E o pedido, no painel à volta, fica com o mesmo que o servidor tem.
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(["VIP", "Urgente"]);
  });

  it("falhando a última, repõe o que o servidor tem — e não o que nunca lá chegou", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(
      <ToastProvider>
        <TagsField quote={quote} suggestions={[]} onChange={onChange} />
      </ToastProvider>,
    );

    const campo = screen.getByLabelText("Etiquetas");
    await user.type(campo, "VIP{Enter}");
    await user.type(campo, "Urgente{Enter}");

    // Nenhuma das duas chegou ao servidor: o ecrã tem de voltar ao que ele tem.
    await responder(0, false);
    await responder(1, false);

    expect(screen.queryByText("VIP")).toBeNull();
    expect(screen.queryByText("Urgente")).toBeNull();
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual([]);
    expect(screen.getByText(/Não foi possível guardar as etiquetas/)).toBeTruthy();
  });
});
