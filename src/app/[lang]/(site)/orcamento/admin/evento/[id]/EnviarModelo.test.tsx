// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import EnviarModelo from "./EnviarModelo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO É O ÚNICO CAMINHO — E NÃO DISPARA POR SI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra que estes testes prendem: **nada aqui envia um email sem dois gestos
 * dela** — escolher o modelo (que só PRÉ-VISUALIZA) e confirmar. E o segundo
 * gesto acontece com o destinatário à vista, porque um email a um cliente não
 * se desfaz.
 */

const QUOTE = { id: "LIQ-1", name: "Ana Ribeiro", email: "ana@x.pt" } as unknown as Quote;

const fetchMock = vi.fn();

function respostaDe(corpo: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: async () => corpo,
  } as Response);
}

/** O último corpo enviado ao servidor, já em objecto. */
function ultimoPedido(): { chave?: string; enviar?: boolean } {
  const [, init] = fetchMock.mock.calls.at(-1)!;
  return JSON.parse((init as RequestInit).body as string);
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PREVISTO = {
  ok: true,
  destinatario: "ana@x.pt",
  assunto: "Obrigado por nos ter escolhido",
  texto: "Olá Ana,\n\nObrigado por nos ter confiado um dia tão especial.",
};

async function escolherAgradecimento(previsao: unknown = PREVISTO) {
  fetchMock.mockReturnValueOnce(respostaDe(previsao));
  await userEvent.click(screen.getByRole("button", { name: /Agradecimento/i }));
}

describe("EnviarModelo — escolher um modelo apenas pré-visualiza", () => {
  it("carregar num modelo NÃO envia: pede a pré-visualização", async () => {
    render(<EnviarModelo quote={QUOTE} />);
    await escolherAgradecimento();
    expect(ultimoPedido()).toEqual({ chave: "agradecimento" });
    expect(ultimoPedido().enviar).toBeUndefined();
  });

  it("mostra o DESTINATÁRIO, o assunto e o texto antes de confirmar", async () => {
    render(<EnviarModelo quote={QUOTE} />);
    await escolherAgradecimento();
    // O endereço aparece no cabeçalho da zona E na confirmação: o que importa
    // é que esteja debaixo do «Para», ao lado do botão em que ela vai carregar.
    expect(await screen.findByText("Para")).toBeInTheDocument();
    expect(screen.getAllByText("ana@x.pt").length).toBeGreaterThan(1);
    expect(screen.getByText("Obrigado por nos ter escolhido")).toBeInTheDocument();
    expect(screen.getByText(/Obrigado por nos ter confiado/)).toBeInTheDocument();
  });

  it("o modelo da proposta não está aqui — esse sai com a proposta", () => {
    render(<EnviarModelo quote={QUOTE} />);
    expect(screen.queryByRole("button", { name: /Proposta enviada/i })).toBeNull();
  });
});

describe("EnviarModelo — a recusa por marcador em falta", () => {
  it("mostra a frase do servidor e NÃO oferece o botão de enviar", async () => {
    render(<EnviarModelo quote={QUOTE} />);
    fetchMock.mockReturnValueOnce(
      respostaDe({
        ok: false,
        motivo:
          "O modelo «Falta uma semana» usa data do evento ({data_evento}), e este pedido não tem esse dado. O email NÃO foi enviado.",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /Falta uma semana/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent("{data_evento}");
    expect(screen.queryByRole("button", { name: /^Enviar ao cliente$/ })).toBeNull();
  });
});

describe("EnviarModelo — confirmar", () => {
  it("só o segundo gesto envia, e só então diz que foi enviado", async () => {
    const onEnviado = vi.fn();
    render(<EnviarModelo quote={QUOTE} onEnviado={onEnviado} />);
    await escolherAgradecimento();
    expect(onEnviado).not.toHaveBeenCalled();

    fetchMock.mockReturnValueOnce(
      respostaDe({ ok: true, emailed: true, assunto: PREVISTO.assunto }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^Enviar ao cliente$/ }));

    expect(ultimoPedido()).toEqual({ chave: "agradecimento", enviar: true });
    expect(onEnviado).toHaveBeenCalledWith(
      "Agradecimento pós-evento",
      expect.objectContaining({ emailed: true }),
    );
  });

  /**
   * O e-mail não ter saído é um ERRO, não um rodapé — a mesma decisão do
   * mensageiro. Um pedido que entrou por telefonema não tem email, e o que não
   * pode ficar por dizer é que o cliente não recebeu nada.
   */
  it("quando o email não sai, di-lo a vermelho com a razão do servidor", async () => {
    const onEnviado = vi.fn();
    render(<EnviarModelo quote={QUOTE} onEnviado={onEnviado} />);
    await escolherAgradecimento();
    fetchMock.mockReturnValueOnce(
      respostaDe({
        ok: true,
        emailed: false,
        emailError: "Este pedido não tem email de cliente — não foi enviado nada.",
      }),
    );
    await userEvent.click(screen.getByRole("button", { name: /^Enviar ao cliente$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("não tem email de cliente");
    expect(onEnviado).toHaveBeenCalledWith(
      "Agradecimento pós-evento",
      expect.objectContaining({ emailed: false }),
    );
  });

  it("cancelar fecha a confirmação sem enviar nada", async () => {
    render(<EnviarModelo quote={QUOTE} />);
    await escolherAgradecimento();
    await userEvent.click(screen.getByRole("button", { name: /Cancelar/i }));
    expect(screen.queryByText("Para")).toBeNull();
    expect(screen.queryByText("Obrigado por nos ter escolhido")).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("um 400 do servidor aparece como erro e não como envio", async () => {
    const onEnviado = vi.fn();
    render(<EnviarModelo quote={QUOTE} onEnviado={onEnviado} />);
    await escolherAgradecimento();
    fetchMock.mockReturnValueOnce(respostaDe({ error: "O modelo está vazio." }, 400));
    await userEvent.click(screen.getByRole("button", { name: /^Enviar ao cliente$/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent("O modelo está vazio.");
    expect(onEnviado).not.toHaveBeenCalled();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENQUANTO O EMAIL ESTÁ A SAIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Isto fala com o SMTP: 3 a 10 segundos, irreversível, e feito várias vezes por
 * evento. O que havia era o botão a rodar — e o «Cancelar» ao lado, aceso, a
 * convidar a carregar outra vez.
 *
 * O que estes testes prendem é o comportamento, e não as classes: o cartão
 * aparece ao confirmar, diz o que está a acontecer e para quem, some-se quando
 * a resposta chega — e NUNCA diz «enviado» antes disso.
 */
describe("EnviarModelo — enquanto o email está a sair", () => {
  /** Um envio pendurado: sem isto, o meio da espera não chega a existir. */
  function envioPendurado() {
    let soltar!: (corpo: unknown) => void;
    const pendurado = new Promise<unknown>((r) => (soltar = r));
    fetchMock.mockReturnValueOnce(
      pendurado.then((corpo) => ({ ok: true, status: 200, json: async () => corpo }) as Response),
    );
    return soltar;
  }

  async function confirmar() {
    const soltar = envioPendurado();
    await userEvent.click(screen.getByRole("button", { name: /^Enviar ao cliente$/ }));
    return soltar;
  }

  it("diz o que está a acontecer, e para quem", async () => {
    render(<EnviarModelo quote={QUOTE} />);
    await escolherAgradecimento();
    await confirmar();

    const frase = await screen.findByText(/A enviar «Agradecimento pós-evento»/i);
    const cartao = frase.closest('[role="status"]');
    expect(cartao).not.toBeNull();
    expect(cartao).toHaveTextContent("ana@x.pt");
    // A barra que anda: é ela que responde a «isto está a andar?».
    expect(cartao!.querySelector('[data-barra="preenchimento"]')).toBeTruthy();
  });

  it("NUNCA diz «enviado» antes de a resposta chegar, e não deixa reenviar", async () => {
    const onEnviado = vi.fn();
    render(<EnviarModelo quote={QUOTE} onEnviado={onEnviado} />);
    await escolherAgradecimento();
    await confirmar();
    await screen.findByText(/A enviar «Agradecimento pós-evento»/i);

    expect(screen.queryByText(/enviado para/i)).toBeNull();
    expect(onEnviado).not.toHaveBeenCalled();
    // Um email a um cliente não se desfaz: enquanto este vai, não há segundo
    // botão para carregar — nem um «Cancelar» que já não cancela nada.
    expect(screen.queryByRole("button", { name: /^Enviar ao cliente$/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /^Cancelar$/ })).toBeNull();
  });

  it("some-se quando a resposta chega, e só então é que foi enviado", async () => {
    const onEnviado = vi.fn();
    render(<EnviarModelo quote={QUOTE} onEnviado={onEnviado} />);
    await escolherAgradecimento();
    const soltar = await confirmar();
    await screen.findByText(/A enviar «Agradecimento pós-evento»/i);

    soltar({ ok: true, emailed: true, assunto: PREVISTO.assunto });

    await waitFor(() =>
      expect(screen.queryByText(/A enviar «Agradecimento pós-evento»/i)).toBeNull(),
    );
    expect(
      await screen.findByText(/«Agradecimento pós-evento» enviado para ana@x\.pt/),
    ).toBeTruthy();
    expect(onEnviado).toHaveBeenCalledWith(
      "Agradecimento pós-evento",
      expect.objectContaining({ emailed: true }),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FRASE QUE MANDAVA PROCURAR UM ECRÃ SEM PORTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Achado F-14. Dizia «O texto edita-se em "Modelos de email"», e uma auditoria
 * em produção procurou essa secção no menu e em Definições sem a encontrar.
 *
 * O ecrã EXISTE e funciona — está escondido, a pedido dela. Mas o
 * `modelos-email` também não está no `NAV`, e é dele que saem o menu «Mais» e a
 * paleta ⌘K: nada no back office lá chega.
 *
 * Não se corrige revelando o ecrã — quem o mandou esconder foi ela. Corrige-se
 * tirando a promessa: uma instrução para um sítio inalcançável é pior do que
 * não haver instrução nenhuma, porque manda procurar.
 */
describe("a frase de rodapé", () => {
  it("não manda editar num ecrã a que não se chega", () => {
    render(<EnviarModelo quote={QUOTE} />);
    expect(document.body.textContent).not.toContain("Modelos de email");
  });

  it("mas continua a dizer o que interessa — que nada sai sozinho", () => {
    render(<EnviarModelo quote={QUOTE} />);
    expect(document.body.textContent).toContain("Nenhum destes emails sai sozinho");
  });
});
