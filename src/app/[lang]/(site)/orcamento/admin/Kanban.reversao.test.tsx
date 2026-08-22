// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CARTÃO QUE SALTA PARA TRÁS SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Mover um cartão é optimista: ele muda de coluna no instante do gesto e o
 * servidor é ouvido depois. Quando ele recusa, o cartão VOLTA — à frente dos
 * olhos de quem está a olhar para ele — e o aviso dizia «Não foi possível
 * atualizar».
 *
 * Três palavras que não dizem o pedido, não dizem porquê, não dizem o que
 * fazer, e sobretudo não dizem que aquilo que acabou de saltar no ecrã foi
 * isto. Num quadro com trezentos cartões, um cartão a recuar em silêncio
 * lê-se como um defeito do ecrã — e o gesto seguinte é arrastá-lo outra vez,
 * que na sessão expirada não pode funcionar nunca.
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
    // «Proposta enviada» (`cotado`) é a coluna do meio a partir da qual se
    // mede: tem colunas dos dois lados, e é o nome que o aviso tem de repetir.
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

/** Desenha o quadro e devolve o espião do estado, que é onde a reversão se vê:
 *  o Kanban não guarda os pedidos, pede ao pai que os mude. */
function desenhar() {
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
  return { onStatusChange };
}

/** Move o cartão uma coluna para a direita, pelo teclado — o mesmo caminho que
 *  o arrasto e os botões do telemóvel usam (`changeStatus`). */
async function moverParaAFrente() {
  const cartao = screen.getByRole("button", { name: /^Ana e João,/ });
  cartao.focus();
  await userEvent.keyboard("{ArrowRight}");
}

const aviso = () => screen.getByRole("alert").textContent ?? "";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Kanban — um movimento que o servidor recusa", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
  });

  it("repõe a coluna E diz para onde o cartão voltou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(503, { error: "Erro interno" })),
    );
    const { onStatusChange } = desenhar();

    await moverParaAFrente();

    // Duas chamadas: a optimista para «aceite», e a reversão para o que era.
    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
    expect(onStatusChange.mock.calls[0]).toEqual(["LIQ-1", "aceite"]);
    expect(onStatusChange.mock.calls[1]).toEqual(["LIQ-1", "cotado"]);

    // E a frase conta as quatro coisas: o pedido pelo nome, para onde ia,
    // porquê, e — a parte que faltava — para onde o cartão recuou.
    await waitFor(() => expect(aviso()).toMatch(/Ana e João/));
    expect(aviso()).toContain("Ganho");
    expect(aviso()).toMatch(/não está a aceitar gravações/);
    expect(aviso()).toContain("O cartão voltou para «Proposta enviada».");
    expect(aviso()).not.toBe("Não foi possível atualizar");
  });

  it("com a sessão expirada manda entrar de novo — e diz na mesma que o cartão recuou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, { error: "Não autorizado" })),
    );
    const { onStatusChange } = desenhar();

    await moverParaAFrente();

    await waitFor(() => expect(aviso()).toMatch(/sessão expirou/i));
    // Repetir o arrasto não pode funcionar aqui: a instrução é outra.
    expect(aviso()).toMatch(/volta a entrar/i);
    expect(aviso()).toContain("O cartão voltou para «Proposta enviada».");
    expect(onStatusChange.mock.calls.at(-1)).toEqual(["LIQ-1", "cotado"]);
  });

  it("sem rede, diz que nada se perdeu — e continua a dizer que o cartão recuou", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    const { onStatusChange } = desenhar();

    await moverParaAFrente();

    await waitFor(() => expect(aviso()).toMatch(/sem ligação/i));
    expect(aviso()).toMatch(/nada se perdeu/i);
    expect(aviso()).toContain("O cartão voltou para «Proposta enviada».");
    expect(onStatusChange.mock.calls.at(-1)).toEqual(["LIQ-1", "cotado"]);
  });

  it("um movimento que passa não reverte nada e não avisa de nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(200, { status: "aceite" })),
    );
    const { onStatusChange } = desenhar();

    await moverParaAFrente();

    await waitFor(() => expect(onStatusChange).toHaveBeenCalledTimes(2));
    // As duas são para a frente: a optimista e a confirmação do servidor.
    expect(onStatusChange.mock.calls.every((c) => c[1] === "aceite")).toBe(true);
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });
});
