// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ActivityEntry, Quote, QuoteMessage } from "@/lib/orcamento/types";
import CommsZone from "./CommsZone";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «MENSAGEM ENVIADA AO CLIENTE» — SOBRE UMA QUE NINGUÉM RECEBEU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido que entrou por TELEFONEMA não tem email. A rota da mensagem trata
 * disso como deve — grava-a na mesma (é o registo de que ela respondeu) e diz
 * `emailed: false` —, e o mensageiro já mostra a vermelho que o e-mail não
 * saiu. O aviso, porém, dura o tempo do ecrã aberto.
 *
 * O que fica é o HISTÓRICO, e o histórico escrevia «Mensagem enviada ao
 * cliente». É a linha que se lê meses depois, quando o cliente diz que nunca
 * soube de nada e é preciso perceber quem falhou. Uma linha que jura ter
 * enviado é pior do que não haver linha nenhuma: fecha a pergunta com a
 * resposta errada.
 *
 * A regra que estes testes prendem: o registo diz o que ACONTECEU — gravada e
 * enviada, ou gravada e não enviada. Nunca a primeira quando foi a segunda.
 */

const MENSAGENS: QuoteMessage[] = [{ at: "2026-08-13T10:00:00.000Z", body: "Olá" }];

/**
 * As ferramentas chegam por `next/dynamic`; aqui só é preciso um mensageiro que
 * faça o que o verdadeiro faz — chamar `onSent` com as mensagens E com o que a
 * rota disse do envio.
 */
vi.mock("../../lazy", () => ({
  ProposalStudio: () => null,
  ClientMessenger: ({
    onSent,
  }: {
    onSent?: (m: QuoteMessage[], envio: { emailed: boolean; emailError?: string }) => void;
  }) => (
    <>
      <button type="button" onClick={() => onSent?.(MENSAGENS, { emailed: true })}>
        enviar com email
      </button>
      <button
        type="button"
        onClick={() =>
          onSent?.(MENSAGENS, { emailed: false, emailError: "Este pedido não tem email" })
        }
      >
        enviar sem email
      </button>
    </>
  ),
}));

const QUOTE = { id: "LIQ-1", name: "Ana Ribeiro", messages: [] } as unknown as Quote;

function montar() {
  const entradas: ActivityEntry[] = [];
  render(
    <CommsZone
      quote={QUOTE}
      userName="Equipa"
      onQuoteChange={() => {}}
      onAddEntry={async (e) => {
        entradas.push(e);
        return true;
      }}
    />,
  );
  return entradas;
}

afterEach(cleanup);

describe("Zona de Comunicação — o que fica escrito no histórico", () => {
  it("e-mail que NÃO saiu: a linha não pode dizer que foi enviada", async () => {
    const user = userEvent.setup();
    const entradas = montar();

    await user.click(screen.getByRole("button", { name: "enviar sem email" }));

    expect(entradas).toHaveLength(1);
    expect(
      entradas[0].summary,
      "o histórico jurou um envio que não houve — é o que se lê meses depois",
    ).not.toBe("Mensagem enviada ao cliente");
    // E diz-se o que aconteceu de facto: ficou registada, o cliente não recebeu.
    expect(entradas[0].summary).toMatch(/registada/i);
    expect(entradas[0].summary).toMatch(/não (saiu|recebeu)/i);
  });

  it("e-mail que saiu: continua a dizer que foi enviada ao cliente", async () => {
    const user = userEvent.setup();
    const entradas = montar();

    await user.click(screen.getByRole("button", { name: "enviar com email" }));

    expect(entradas).toHaveLength(1);
    expect(entradas[0].summary).toBe("Mensagem enviada ao cliente");
    expect(entradas[0].kind).toBe("message_sent");
    expect(entradas[0].actor).toBe("Equipa");
  });

  it("sem mensagem nova, não se escreve linha nenhuma", async () => {
    // O mensageiro chama `onSent` com a lista INTEIRA; se ela não cresceu, não
    // houve resposta nova para registar.
    const user = userEvent.setup();
    const entradas: ActivityEntry[] = [];
    render(
      <CommsZone
        quote={{ ...QUOTE, messages: MENSAGENS } as Quote}
        userName="Equipa"
        onQuoteChange={() => {}}
        onAddEntry={async (e) => {
          entradas.push(e);
          return true;
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "enviar sem email" }));
    expect(entradas).toHaveLength(0);
  });
});
