// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalBuilder from "./ProposalBuilder";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONSTRUTOR DE PREÇOS DIZIA «ENVIADA» QUANDO O EMAIL NÃO SAÍA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O Estúdio já tratava isto bem e tem uma nota longa a explicá-lo: «o email não
 * ter saído é um ERRO, não uma informação». O construtor — a segunda
 * ferramenta, atrás do link em Comunicação — tem a MESMA rota e fazia o
 * contrário:
 *
 *   · deitava fora o `emailError` do servidor e mostrava sempre a mesma frase,
 *     «e-mail não configurado», que é a única das três avarias que manda enviar
 *     À MÃO. Nas outras duas ela enviava à mão um email que devia ter seguido
 *     sozinho, ou desistia;
 *   · chamava o `onSent`, que escreve no histórico PERMANENTE do pedido
 *     «Proposta enviada — 3.690,00 €» sobre um email que nunca saiu;
 *   · e lia o corpo com `res.json()` ANTES de olhar ao `res.ok`, portanto um
 *     504 (que devolve uma página HTML) punha no ecrã a frase crua do
 *     interpretador: «Unexpected token '<', "<!DOCTYPE "... is not valid JSON».
 */

const quote = {
  id: "q1",
  name: "Maria & Zé",
  email: "maria@example.pt",
  category: "casamentos",
  eventType: "casamentos",
  status: "novo",
  createdAt: "2026-01-01T00:00:00.000Z",
  quotedPrice: 3000,
} as unknown as Quote;

/** A resposta do envio, como a rota a devolve. */
let respostaDoEnvio: { ok: boolean; status: number; corpo: unknown; texto?: string };
const onSent = vi.fn();

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.includes("proposta-rascunho")) {
    return { ok: true, status: 200, json: async () => ({ ok: true, draft: null }) } as Response;
  }
  if (url.endsWith("/proposta") && (init?.method ?? "GET") === "POST") {
    return {
      ok: respostaDoEnvio.ok,
      status: respostaDoEnvio.status,
      json: async () => {
        // Um 504 devolve HTML: o interpretador atira, como na realidade.
        if (respostaDoEnvio.texto !== undefined) throw new SyntaxError(respostaDoEnvio.texto);
        return respostaDoEnvio.corpo;
      },
    } as Response;
  }
  return { ok: true, status: 200, json: async () => ({}) } as Response;
});

async function enviar() {
  const user = userEvent.setup();
  render(
    <ToastProvider>
      <ProposalBuilder quote={quote} onSent={onSent} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: /Gerar PDF e enviar ao cliente/i }));
}

beforeEach(() => {
  localStorage.clear();
  onSent.mockClear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("confirm", () => true);
  respostaDoEnvio = {
    ok: true,
    status: 200,
    corpo: { ok: true, total: 3690, emailed: true, pdfBase64: "JVBERi0=" },
  };
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ProposalBuilder — quando o email não sai", () => {
  it("mostra a frase do SERVIDOR, e não a de sempre", async () => {
    respostaDoEnvio = {
      ok: true,
      status: 200,
      corpo: {
        ok: true,
        total: 3690,
        emailed: false,
        pdfBase64: "JVBERi0=",
        emailError: "Este pedido não tem email do cliente. Acrescenta o email na ficha e reenvia.",
      },
    };
    await enviar();
    expect(await screen.findByText(/Acrescenta o email na ficha/i)).toBeTruthy();
    // A frase antiga mandava enviar à mão — e nesta avaria isso é o conselho errado.
    expect(screen.queryByText(/e-mail não configurado/i)).toBeNull();
  });

  it("não escreve «Proposta enviada» no histórico de um email que não saiu", async () => {
    respostaDoEnvio = {
      ok: true,
      status: 200,
      corpo: { ok: true, total: 3690, emailed: false, pdfBase64: "JVBERi0=" },
    };
    await enviar();
    await screen.findByText(/Proposta criada/i);
    expect(onSent).not.toHaveBeenCalled();
  });

  it("com o email fora, continua a haver PDF para descarregar", async () => {
    respostaDoEnvio = {
      ok: true,
      status: 200,
      corpo: { ok: true, total: 3690, emailed: false, pdfBase64: "JVBERi0=" },
    };
    await enviar();
    // A proposta fica gravada e o PDF está lá: o que não fica é a afirmação.
    expect(await screen.findByRole("button", { name: /Descarregar PDF/i })).toBeTruthy();
  });

  it("quando o email SAI, o histórico é escrito (controlo positivo)", async () => {
    await enviar();
    await waitFor(() => expect(onSent).toHaveBeenCalledWith(3690));
    expect(screen.getByText(/Enviada por e-mail/i)).toBeTruthy();
  });
});

describe("ProposalBuilder — quando o servidor nem chega a responder JSON", () => {
  it("um 504 diz o que aconteceu, em português", async () => {
    respostaDoEnvio = {
      ok: false,
      status: 504,
      corpo: null,
      texto: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`,
    };
    await enviar();
    expect(await screen.findByText(/demorou demasiado a preparar a proposta/i)).toBeTruthy();
    // A frase crua do interpretador não pode chegar ao ecrã dela.
    expect(screen.queryByText(/is not valid JSON/i)).toBeNull();
  });

  it("uma sessão expirada diz que é a sessão", async () => {
    respostaDoEnvio = { ok: false, status: 401, corpo: {} };
    await enviar();
    expect(await screen.findByText(/sessão expirou/i)).toBeTruthy();
  });
});
