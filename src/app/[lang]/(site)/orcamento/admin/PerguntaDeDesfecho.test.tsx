// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PerguntaDeDesfecho from "./PerguntaDeDesfecho";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O GESTO QUE FALTAVA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem isto marcado, o pedido fica eternamente em «Proposta enviada» e o «ganho»
 * da Visão Geral fica a zero com o dinheiro já na conta. O que estes testes
 * guardam é o gesto: dois botões, um valor já preenchido, e nenhuma pergunta
 * quando se perde.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-08-01T10:00:00.000Z",
    status: "cotado",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    guests: 100,
    quotedPrice: 4600,
    ...over,
  }) as Quote;

/** As respostas que o `fetch` falso devolve, por ordem de chamada. */
let respostas: { ok: boolean; status?: number; corpo?: unknown }[] = [];
const chamadas: { url: string; init?: RequestInit }[] = [];

const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
  chamadas.push({ url, init });
  const r = respostas.shift() ?? { ok: true, corpo: {} };
  return {
    ok: r.ok,
    status: r.status ?? (r.ok ? 200 : 500),
    json: async () => r.corpo ?? {},
  } as unknown as Response;
});

/** O corpo JSON do enésimo pedido feito ao servidor. */
const corpoDa = (i: number) => JSON.parse(String(chamadas[i]?.init?.body ?? "{}"));

beforeEach(() => {
  respostas = [];
  chamadas.length = 0;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a quem se pergunta", () => {
  it("um pedido sem proposta enviada não mostra a pergunta", () => {
    render(
      <PerguntaDeDesfecho
        quote={pedido({ status: "pendente" })}
        quem="Catarina"
        onGravado={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^ganho$/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /^perdido$/i })).toBeNull();
  });

  it("um pedido já ganho não volta a ser perguntado", () => {
    render(
      <PerguntaDeDesfecho
        quote={pedido({ status: "aceite" })}
        quem="Catarina"
        onGravado={vi.fn()}
      />,
    );
    expect(screen.queryByRole("button", { name: /^ganho$/i })).toBeNull();
  });

  it("uma proposta enviada mostra as duas saídas, e nada mais", () => {
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^ganho$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^perdido$/i })).toBeInTheDocument();
    // Sem menus e sem selector de estado escondido.
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("os dois botões são alvos de dedo", () => {
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);
    expect(screen.getByRole("button", { name: /^ganho$/i }).className).toContain("alvo-toque");
    expect(screen.getByRole("button", { name: /^perdido$/i }).className).toContain("alvo-toque");
  });
});

describe("marcar ganho", () => {
  it("o valor da proposta aparece já preenchido, e um toque confirma-o", async () => {
    const user = userEvent.setup();
    const onGravado = vi.fn();
    respostas = [
      { ok: true, corpo: pedido() }, // a releitura antes de gravar
      { ok: true, corpo: pedido({ status: "aceite" }) }, // o PATCH
    ];
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={onGravado} />);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    const campo = screen.getByLabelText(/valor combinado/i) as HTMLInputElement;
    expect(campo.value).toBe("4600");

    await user.click(screen.getByRole("button", { name: /confirmar/i }));
    await waitFor(() => expect(chamadas).toHaveLength(2));
    expect(chamadas[1].init?.method).toBe("PATCH");
    expect(corpoDa(1)).toMatchObject({ status: "aceite", quotedPrice: 4600 });
    await waitFor(() => expect(onGravado).toHaveBeenCalled());
  });

  it("um valor negociado escrito à portuguesa é o que fica gravado", async () => {
    const user = userEvent.setup();
    respostas = [
      { ok: true, corpo: pedido() },
      { ok: true, corpo: pedido({ status: "aceite", quotedPrice: 5250.5 }) },
    ];
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    const campo = screen.getByLabelText(/valor combinado/i);
    await user.clear(campo);
    await user.type(campo, "5.250,50");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(chamadas).toHaveLength(2));
    expect(corpoDa(1).quotedPrice).toBe(5250.5);
  });

  it("um valor de zero escrito de propósito grava-se", async () => {
    const user = userEvent.setup();
    respostas = [
      { ok: true, corpo: pedido() },
      { ok: true, corpo: pedido({ status: "aceite", quotedPrice: 0 }) },
    ];
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    const campo = screen.getByLabelText(/valor combinado/i);
    await user.clear(campo);
    await user.type(campo, "0");
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(chamadas).toHaveLength(2));
    expect(corpoDa(1).quotedPrice).toBe(0);
  });

  it("o campo vazio não grava nada e diz o que falta", async () => {
    const user = userEvent.setup();
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    await user.clear(screen.getByLabelText(/valor combinado/i));
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    expect(chamadas).toHaveLength(0);
    expect(screen.getByRole("alert")).toHaveTextContent(/valor/i);
  });

  it("um pedido sem preço nenhum abre o campo vazio, e não a mentir zero", async () => {
    const user = userEvent.setup();
    render(
      <PerguntaDeDesfecho
        quote={pedido({ quotedPrice: undefined })}
        quem="Catarina"
        onGravado={vi.fn()}
      />,
    );
    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    expect((screen.getByLabelText(/valor combinado/i) as HTMLInputElement).value).toBe("");
  });
});

describe("marcar perdido", () => {
  it("não interroga: um toque e está marcado", async () => {
    const user = userEvent.setup();
    respostas = [
      { ok: true, corpo: pedido() },
      { ok: true, corpo: pedido({ status: "rejeitado" }) },
    ];
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^perdido$/i }));
    await waitFor(() => expect(chamadas).toHaveLength(2));
    expect(corpoDa(1)).toMatchObject({ status: "rejeitado" });
    expect("lostReason" in corpoDa(1)).toBe(false);
  });

  it("enquanto grava não aparece campo de valor nenhum — perder não tem preço", async () => {
    const user = userEvent.setup();
    let libertar: (() => void) | null = null;
    const pendurado = new Promise<void>((r) => {
      libertar = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await pendurado;
        return {
          ok: true,
          status: 200,
          json: async () => pedido({ status: "rejeitado" }),
        } as unknown as Response;
      }),
    );
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^perdido$/i }));
    expect(screen.queryByLabelText(/valor combinado/i)).toBeNull();
    libertar!();
  });

  /**
   * O motivo passou a ser botões de uma lista fechada (`MotivoDeRecusa`), não
   * uma caixa de texto: é o que faz «perdi seis por preço este ano» uma
   * frase que a contagem de `analise-de-propostas.ts` consegue responder.
   */
  it("o motivo aparece depois, como botões — e é opcional", async () => {
    const user = userEvent.setup();
    respostas = [
      { ok: true, corpo: pedido() },
      { ok: true, corpo: pedido({ status: "rejeitado" }) },
      { ok: true, corpo: pedido({ status: "rejeitado", lostReason: "preco" }) },
    ];
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^perdido$/i }));
    await waitFor(() => expect(screen.getByText(/motivo.*opcional/i)).toBeInTheDocument());
    const botaoPreco = screen.getByRole("button", { name: /^preço$/i });
    expect(botaoPreco).toBeInTheDocument();

    await user.click(botaoPreco);
    await waitFor(() => expect(chamadas).toHaveLength(3));
    expect(corpoDa(2)).toEqual({ lostReason: "preco" });
  });

  it("o detalhe livre viaja junto do botão que se carrega, à parte do motivo", async () => {
    const user = userEvent.setup();
    respostas = [
      { ok: true, corpo: pedido() },
      { ok: true, corpo: pedido({ status: "rejeitado" }) },
      { ok: true, corpo: pedido({ status: "rejeitado", lostReason: "outro" }) },
    ];
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: /^perdido$/i }));
    await waitFor(() => expect(screen.getByText(/motivo.*opcional/i)).toBeInTheDocument());
    await user.type(screen.getByPlaceholderText(/detalhe/i), "escolheram fazer em casa");
    await user.click(screen.getByRole("button", { name: /^outro$/i }));

    await waitFor(() => expect(chamadas).toHaveLength(3));
    expect(corpoDa(2)).toEqual({ lostReason: "outro", lostNote: "escolheram fazer em casa" });
  });
});

describe("dois separadores ao mesmo tempo", () => {
  it("o segundo não grava por cima — mostra o que já lá estava", async () => {
    const user = userEvent.setup();
    // O separador da frente já marcou este pedido como ganho por 5.000 €.
    respostas = [{ ok: true, corpo: pedido({ status: "aceite", quotedPrice: 5000 }) }];
    const onGravado = vi.fn();
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={onGravado} />);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    // Uma leitura, e NENHUM PATCH: os 4.600 € deste separador não podem
    // apagar os 5.000 € negociados no outro.
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/já/i));
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].init?.method ?? "GET").toBe("GET");
    await waitFor(() =>
      expect(onGravado).toHaveBeenCalledWith(expect.objectContaining({ status: "aceite" })),
    );
  });
});

describe("quando o servidor recusa", () => {
  it("diz-se, e o gesto continua por fazer", async () => {
    const user = userEvent.setup();
    respostas = [
      { ok: true, corpo: pedido() },
      { ok: false, status: 401, corpo: { error: "Não autorizado" } },
    ];
    const onGravado = vi.fn();
    render(<PerguntaDeDesfecho quote={pedido()} quem="Catarina" onGravado={onGravado} />);

    await user.click(screen.getByRole("button", { name: /^ganho$/i }));
    await user.click(screen.getByRole("button", { name: /confirmar/i }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(/sessão|não foi/i));
    expect(onGravado).not.toHaveBeenCalled();
    // O campo continua lá, com o número escrito, para se tentar outra vez.
    expect(screen.getByLabelText(/valor combinado/i)).toBeInTheDocument();
  });
});
