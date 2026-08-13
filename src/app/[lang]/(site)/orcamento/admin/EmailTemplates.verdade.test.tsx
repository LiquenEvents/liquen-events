// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import EmailTemplates from "./EmailTemplates";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ECRÃ PROMETIA ENVIOS QUE NUNCA ACONTECIAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Por baixo de cada modelo estava escrito quando é que ele era enviado:
 *
 *   «Enviado ao cliente quando a proposta segue.»
 *   «Enviado quando o sinal é recebido e a reserva fica confirmada.»
 *   «Enviado na semana anterior ao evento.»
 *   «Enviado depois do evento, a agradecer ao cliente.»
 *
 * Nenhuma das quatro era verdade: o `renderTemplate` não tinha um único
 * chamador de produção, e o que saía com a proposta era HTML escrito à mão
 * dentro da rota. Ela escrevia estes textos durante meses a acreditar que
 * chegavam a alguém.
 *
 * O que estes testes prendem é a promessa nova, que é MENOR e verdadeira: um
 * sai sozinho com a proposta, três saem por um botão — e o ecrã diz onde está
 * esse botão, senão a mudança só troca uma frase falsa por uma frase inútil.
 *
 * Se algum dia se lhes ligar um agendador a sério, é AQUI que o teste falha
 * primeiro — e é isso que se quer.
 */

const MODELOS = [
  { key: "proposta-enviada", name: "Proposta enviada" },
  { key: "sinal-recebido", name: "Sinal recebido" },
  { key: "semana-evento", name: "Falta uma semana" },
  { key: "agradecimento", name: "Agradecimento pós-evento" },
].map((m) => ({
  ...m,
  subject: "Assunto",
  body: "<div><p>Olá {nome}</p></div>",
  updatedAt: "2026-01-01T00:00:00.000Z",
}));

const fetchMock = vi.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => MODELOS,
}));

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const montar = () =>
  render(
    <ToastProvider>
      <EmailTemplates />
    </ToastProvider>,
  );

describe("Modelos de email — o que o ecrã diz sobre cada modelo", () => {
  it("já não diz que o sinal, a semana e o agradecimento saem sozinhos", async () => {
    montar();
    await screen.findAllByText("Proposta enviada");
    for (const antiga of [
      "Enviado quando o sinal é recebido e a reserva fica confirmada.",
      "Enviado na semana anterior ao evento.",
      "Enviado depois do evento, a agradecer ao cliente.",
    ]) {
      expect(screen.queryByText(antiga)).toBeNull();
    }
  });

  it("o da proposta diz que sai sozinho, e com que botão", async () => {
    montar();
    const descricao = await screen.findAllByText(/Sai sozinho no email que leva a proposta/i);
    expect(descricao.length).toBeGreaterThan(0);
    expect(descricao[0].textContent).toMatch(/Enviar proposta/i);
  });

  it("os outros três dizem que NÃO saem sozinhos e onde está o botão", async () => {
    montar();
    await screen.findByText("Sinal recebido");
    const naoSaiSozinho = screen.getAllByText(/Não sai sozinho/i);
    // Três na lista da esquerda + a do modelo aberto no editor.
    expect(naoSaiSozinho.length).toBeGreaterThanOrEqual(3);
    for (const el of naoSaiSozinho) {
      expect(el.textContent).toMatch(/Dossier do evento/i);
      expect(el.textContent).toMatch(/Comunicação/i);
    }
  });

  /** O fecho é um só, e é o da casa. O ecrã tem de o dizer onde ela escreve —
   *  senão o modelo despede-se por cima da assinatura, como já acontecia nos
   *  atalhos do mensageiro. */
  it("diz que a assinatura da casa fecha o email sozinha", async () => {
    montar();
    await screen.findAllByText("Proposta enviada");
    expect(screen.getByText(/a assinatura da Líquen.*entra sozinha/i)).toBeInTheDocument();
  });
});
