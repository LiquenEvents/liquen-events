// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import Acompanhamento from "./Acompanhamento";
import AnalisePropostas from "./AnalisePropostas";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS DOIS VAZIOS QUE VIVEM DA MESMA LISTA DE PROPOSTAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O Acompanhamento e a Análise lêem os dois a mesma lista leve
 * (`/api/propostas?semDoc=1`), e os dois tinham o mesmo buraco de formas
 * diferentes:
 *
 *  · o Acompanhamento explicava-se bem — dizia o que aparece ali — mas não
 *    dizia como é que alguma coisa lá chega. Um vazio sem saída é meio vazio;
 *  · a Análise DESAPARECIA (`return null`) quando não havia propostas
 *    enviadas, dentro de uma secção «Propostas» que fica aberta de propósito.
 *    Um título com espaço em branco por baixo lê-se de duas maneiras, ambas
 *    falsas: «isto avariou» ou «isto não existe». Existe, e está à espera de
 *    dados.
 *
 * Nenhum dos dois vira alarme: uma lista de acompanhamento limpa é o que se
 * quer ver, e uma primeira semana sem propostas enviadas é o normal.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

function servidorVazio() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply(200, [])),
  );
}

beforeEach(() => {
  __resetListCache();
  servidorVazio();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Acompanhamento sem nada à espera de resposta", () => {
  it("põe o primeiro passo dentro do vazio", async () => {
    const onFazerProposta = vi.fn();
    render(
      <ToastProvider>
        <Acompanhamento quotes={[]} onFazerProposta={onFazerProposta} />
      </ToastProvider>,
    );

    expect(await screen.findByText("Nenhuma proposta à espera de resposta")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Fazer uma proposta" }));
    expect(onFazerProposta).toHaveBeenCalledTimes(1);
  });

  it("sem quem trate do passo, continua a explicar-se — e sem botão a mais", async () => {
    render(
      <ToastProvider>
        <Acompanhamento quotes={[]} />
      </ToastProvider>,
    );

    expect(await screen.findByText("Nenhuma proposta à espera de resposta")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Fazer uma proposta" })).toBeNull();
  });
});

describe("a Análise das propostas sem propostas enviadas", () => {
  it("não desaparece: diz que está vazia e porquê", async () => {
    const { container } = render(<AnalisePropostas />);

    expect(
      await screen.findByText(/Ainda não seguiu nenhuma proposta, por isso não há aqui contas/),
    ).toBeTruthy();
    // O que não volta é o painel de zeros: sem propostas enviadas, nenhum
    // destes números assenta em coisa nenhuma.
    expect(screen.queryByText("Propostas enviadas")).toBeNull();
    expect(container.textContent).not.toBe("");
  });

  /** A ler não é vazio: a frase de cima é uma afirmação e só se diz depois. */
  it("enquanto lê, não afirma que não há propostas", () => {
    let resolver: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>((r) => (resolver = r))),
    );
    render(<AnalisePropostas />);

    expect(screen.getByText("A ler as propostas…")).toBeTruthy();
    expect(screen.queryByText(/Ainda não seguiu nenhuma proposta/)).toBeNull();
    resolver(reply(200, []));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «0 €» NÃO É UM PREÇO — É A AUSÊNCIA DE UM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma auditoria em produção apanhou duas clientes reais listadas com **0 €** no
 * painel «À espera de resposta». Não têm um orçamento de zero euros: têm o
 * valor por preencher. O `eur()` faz `n || 0`, e um valor em falta saía
 * formatado como um preço legítimo.
 *
 * É a diferença entre «este casamento vale zero» e «ainda não sabemos quanto
 * vale», num painel que existe para decidir a quem telefonar primeiro.
 *
 * A unidade é a outra metade, e a auditoria é dura com ela: «Quase nenhum
 * número diz se é com ou sem IVA no sítio onde aparece. Este é o problema de
 * texto que custa dinheiro.» O `total` de uma proposta é o BRUTO — o tipo tem
 * `subtotal`, `iva` e `total` lado a lado —, portanto diz-se.
 */
function servidorCom(propostas: readonly unknown[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).includes("/api/propostas") ? reply(200, propostas) : reply(200, []),
    ),
  );
}

/** Uma proposta enviada e ainda sem resposta — que e o que este painel lista. */
function propostaEnviada(over: Record<string, unknown>) {
  return {
    id: "p1",
    quoteId: "LIQ-1",
    clientName: "Ana Rita Colaco",
    status: "enviada",
    sentAt: "2026-08-01T10:00:00.000Z",
    createdAt: "2026-08-01T09:00:00.000Z",
    subtotal: 0,
    iva: 0,
    total: 0,
    ...over,
  };
}

describe("uma proposta sem valor preenchido", () => {
  it("diz «sem valor» e nao «0 €»", async () => {
    __resetListCache();
    servidorCom([propostaEnviada({ total: 0 })]);
    render(
      <ToastProvider>
        <Acompanhamento quotes={[]} />
      </ToastProvider>,
    );
    expect(await screen.findByText(/sem valor/)).toBeTruthy();
    expect(screen.queryByText(/(^|\s)0\s*€/)).toBeNull();
  });

  it("e um valor a serio diz a unidade — «c/ IVA»", async () => {
    __resetListCache();
    servidorCom([propostaEnviada({ id: "p2", clientName: "Margarida Serra", total: 13258 })]);
    render(
      <ToastProvider>
        <Acompanhamento quotes={[]} />
      </ToastProvider>,
    );
    expect(await screen.findByText(/c\/ IVA/)).toBeTruthy();
  });
});
