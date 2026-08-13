// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EmailTemplates from "./EmailTemplates";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CLICAR NOUTRO MODELO DEITAVA FORA O QUE SE TINHA ESCRITO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `onClick={() => selectInto(t)}` substituía o assunto e o corpo do editor sem
 * guarda nenhuma — apesar de o `dirty` já estar calculado ao lado, a activar o
 * botão «Guardar». São textos longos, escritos à mão, que saem para clientes:
 * meia hora de trabalho ia-se num clique na lista da esquerda, sem pergunta,
 * sem aviso e sem nada no ecrã a dizer que tinha acontecido.
 *
 * O que estes testes prendem: nada se deita fora em silêncio. As alterações
 * por guardar ficam à espera e voltam quando se voltar ao modelo, e o ecrã
 * di-lo enquanto ainda não foram guardadas no servidor.
 */

const MODELOS = [
  {
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject: "A sua proposta",
    body: "<div>Olá {nome}</div>",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
  {
    key: "sinal-recebido",
    name: "Sinal recebido",
    subject: "Reserva confirmada",
    body: "<div>Recebemos o sinal</div>",
    updatedAt: "2026-01-01T00:00:00.000Z",
  },
];

let modelos = MODELOS.map((m) => ({ ...m }));
let guardados: unknown[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const metodo = init?.method ?? "GET";
  if (url.includes("/api/email-templates")) {
    if (metodo === "GET") {
      return { ok: true, status: 200, json: async () => modelos } as unknown as Response;
    }
    const corpo = JSON.parse(String(init?.body ?? "{}"));
    guardados.push(corpo);
    const gravado = { ...corpo, updatedAt: new Date().toISOString() };
    modelos = modelos.map((m) => (m.key === gravado.key ? gravado : m));
    return { ok: true, status: 200, json: async () => gravado } as unknown as Response;
  }
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
});

beforeEach(() => {
  localStorage.clear();
  modelos = MODELOS.map((m) => ({ ...m }));
  guardados = [];
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderModelos = () =>
  render(
    <ToastProvider>
      <EmailTemplates />
    </ToastProvider>,
  );

const assunto = () => screen.getByLabelText(/assunto/i) as HTMLInputElement;
const naLista = (nome: string) => screen.getByRole("button", { name: new RegExp(nome, "i") });

describe("trocar de modelo com alterações por guardar", () => {
  it("não deita fora o que se escreveu — está lá ao voltar", async () => {
    const user = userEvent.setup();
    renderModelos();
    await waitFor(() => expect(assunto().value).toBe("A sua proposta"));

    await user.clear(assunto());
    await user.type(assunto(), "A sua proposta de casamento");
    await user.click(naLista("Sinal recebido"));
    await waitFor(() => expect(assunto().value).toBe("Reserva confirmada"));

    await user.click(naLista("Proposta enviada"));
    await waitFor(() => expect(assunto().value).toBe("A sua proposta de casamento"));
  });

  it("diz, enquanto isso, que as alterações ainda não foram guardadas", async () => {
    const user = userEvent.setup();
    renderModelos();
    await waitFor(() => expect(assunto().value).toBe("A sua proposta"));

    await user.type(assunto(), " de casamento");
    // As mesmas palavras do estúdio: o trabalho existe, mas só neste computador.
    expect(
      await screen.findAllByText(/só neste computador/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });

  /** O trabalho tem de sobreviver ao gesto mais brutal de todos: fechar o
   *  separador e voltar a abrir o back office. */
  it("sobrevive a recarregar a página inteira", async () => {
    const user = userEvent.setup();
    const { unmount } = renderModelos();
    await waitFor(() => expect(assunto().value).toBe("A sua proposta"));
    await user.clear(assunto());
    await user.type(assunto(), "Assunto por publicar");
    // Escrito no navegador, não só na memória do React.
    await waitFor(() => expect(JSON.stringify(localStorage)).toContain("Assunto por publicar"), {
      timeout: 3000,
    });
    unmount();

    renderModelos();
    await waitFor(() => expect(assunto().value).toBe("Assunto por publicar"), { timeout: 3000 });
  });

  /**
   * E o contrário também tem de ser verdade: depois de GUARDAR, o modelo abre
   * pelo que está no servidor. Um rascunho antigo a ressuscitar por cima de
   * uma versão já publicada seria a mesma perda ao contrário.
   */
  it("depois de guardar, o rascunho deixa de existir", async () => {
    const user = userEvent.setup();
    renderModelos();
    await waitFor(() => expect(assunto().value).toBe("A sua proposta"));
    await user.clear(assunto());
    await user.type(assunto(), "Assunto publicado");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(guardados.length).toBe(1));

    await user.click(naLista("Sinal recebido"));
    await waitFor(() => expect(assunto().value).toBe("Reserva confirmada"));
    await user.click(naLista("Proposta enviada"));
    await waitFor(() => expect(assunto().value).toBe("Assunto publicado"));
    await waitFor(() => expect(screen.queryAllByText(/só neste computador/i)).toEqual([]));
  });
});
