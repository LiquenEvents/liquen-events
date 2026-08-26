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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PREÇO ZERAVA QUANDO ELA ESCREVIA A VÍRGULA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O campo era `type="number"` com `Number(e.target.value)`. Num
 * `input type="number"` a norma manda apagar o valor sempre que o conteúdo não
 * é um número de vírgula flutuante VÁLIDO — e válido, em HTML, quer dizer com
 * PONTO. A tecla decimal do teclado português é a vírgula: ela escrevia
 * `150,50`, o `.value` vinha vazio, `Number("")` é `0`, e o preço ficava a
 * zero num orçamento que seguia para o cliente.
 */
describe("ProposalBuilder — o preço escreve-se à portuguesa", () => {
  async function abrir() {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProposalBuilder quote={quote} onSent={onSent} />
      </ToastProvider>,
    );
    return user;
  }

  it("aceita a vírgula como separador decimal", async () => {
    const user = await abrir();
    const preco = screen.getByLabelText("Preço unitário da linha 1");
    await user.clear(preco);
    await user.type(preco, "150,50");
    // O que ela escreveu continua no ecrã enquanto escreve.
    expect((preco as HTMLInputElement).value).toBe("150,50");
    // E o total já conta com ele: 150,50 × 1, com IVA a 23% → 185,12 €.
    expect(await screen.findByText(/185,1/)).toBeTruthy();
  });

  it("um texto ainda por acabar não apaga o que lá estava", async () => {
    const user = await abrir();
    const preco = screen.getByLabelText("Preço unitário da linha 1");
    await user.clear(preco);
    await user.type(preco, "150");
    await user.type(preco, ",");
    // «150,» não é um número — mas o modelo tem de continuar com 150.
    expect((preco as HTMLInputElement).value).toBe("150,");
    expect(screen.queryByText(/^0,00\s*€$/)).toBeNull();
  });

  it("continua a aceitar o ponto, que é o que o teclado do computador dá", async () => {
    const user = await abrir();
    const preco = screen.getByLabelText("Preço unitário da linha 1");
    await user.clear(preco);
    await user.type(preco, "150.50");
    expect(await screen.findByText(/185,1/)).toBeTruthy();
  });

  it("dá o teclado numérico no telemóvel", async () => {
    await abrir();
    const preco = screen.getByLabelText("Preço unitário da linha 1");
    // `type="number"` sozinho dava teclado numérico e comia a vírgula; o par
    // certo é `text` + `inputMode="decimal"`.
    expect(preco.getAttribute("inputmode")).toBe("decimal");
    expect(preco.getAttribute("type")).toBe("text");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENQUANTO A PROPOSTA VAI A CAMINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, sobre o envio do Estúdio: «quero que haja uma animação que eu
 * perceba que está a ser enviado» — e depois, a olhar para o resultado, «quero
 * estes detalhes espalhados por imensas coisas».
 *
 * Este botão é o gémeo desse: a mesma rota, o mesmo trabalho, e dezenas de
 * segundos numa quinta com 4G fraco. O que havia era o botão a rodar, que diz
 * «estou ocupado» e mais nada — nem o que está a acontecer, nem para quem vai,
 * nem que o separador não se fecha.
 *
 * O que estes testes prendem é o COMPORTAMENTO, e não as classes: o cartão
 * aparece ao carregar, diz o que se está a passar e para quem, some-se quando a
 * resposta chega — e NUNCA diz «enviada» antes disso.
 */
describe("ProposalBuilder — enquanto a proposta vai a caminho", () => {
  /**
   * Um envio que fica pendurado até nós o soltarmos.
   *
   * É a única maneira de olhar para o meio da espera: com o `fetch` a responder
   * de imediato, o instante que se quer medir não chega a existir.
   */
  function envioPendurado() {
    let soltar!: (corpo: unknown) => void;
    const pendurado = new Promise<unknown>((r) => (soltar = r));
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/proposta") && (init?.method ?? "GET") === "POST") {
          const corpo = await pendurado;
          return { ok: true, status: 200, json: async () => corpo } as Response;
        }
        return { ok: true, status: 200, json: async () => ({ ok: true, draft: null }) } as Response;
      }),
    );
    return soltar;
  }

  const ENVIADA = { ok: true, total: 3690, emailed: true, pdfBase64: "JVBERi0=" };

  async function comecarOEnvio() {
    const soltar = envioPendurado();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProposalBuilder quote={quote} onSent={onSent} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: /Gerar PDF e enviar ao cliente/i }));
    return soltar;
  }

  /** O cartão da espera — pela FRASE, que é o que ela lê, e não pela classe. */
  async function cartaoDaEspera(): Promise<HTMLElement> {
    const frase = await screen.findByText(/A gerar o PDF e a enviar ao cliente/i);
    // Tem de ser uma região viva: sem isso, quem ouve o ecrã não sabe de nada.
    const cartao = frase.closest('[role="status"]');
    expect(cartao).not.toBeNull();
    return cartao as HTMLElement;
  }

  it("põe no ecrã o que está a acontecer, e para quem vai", async () => {
    await comecarOEnvio();

    const cartao = await cartaoDaEspera();
    // Para quem vai, que é o que distingue este envio do errado.
    expect(cartao).toHaveTextContent(/maria@example\.pt/);
    // E a barra que anda: é ela que responde à pergunta «isto está a andar?».
    expect(cartao.querySelector('[data-barra="preenchimento"]')).toBeTruthy();
  });

  it("NUNCA diz «enviada» enquanto a resposta não chega", async () => {
    await comecarOEnvio();
    await cartaoDaEspera();

    // Quem dá o envio por feito é a resposta, e a resposta ainda não veio.
    expect(screen.queryByText(/Enviada por e-mail/i)).toBeNull();
    expect(screen.queryByText(/Proposta criada/i)).toBeNull();
    expect(onSent).not.toHaveBeenCalled();
  });

  it("não deixa lá um segundo botão de enviar — duas propostas não se desfazem", async () => {
    await comecarOEnvio();
    await cartaoDaEspera();

    expect(screen.queryByRole("button", { name: /Gerar PDF e enviar ao cliente/i })).toBeNull();
  });

  it("some-se quando a resposta chega, e só então é que foi enviada", async () => {
    const soltar = await comecarOEnvio();
    await cartaoDaEspera();

    soltar(ENVIADA);

    await waitFor(() =>
      expect(screen.queryByText(/A gerar o PDF e a enviar ao cliente/i)).toBeNull(),
    );
    expect(await screen.findByText(/Enviada por e-mail/i)).toBeTruthy();
    expect(onSent).toHaveBeenCalledWith(3690);
  });
});
