// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { InboxMessage } from "@/lib/inbox-types";
import InboxThread from "./InboxThread";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A RESPOSTA QUE FICAVA COLADA À MENSAGEM SEGUINTE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O painel de leitura não desmonta quando se abre outro email — só recebe outra
 * `message`. O compositor de resposta ficava com o estado da mensagem ANTERIOR:
 * o texto meio escrito e o aviso de «enviada» sobreviviam à troca, enquanto o
 * «Para:» ao lado deles já era o do novo remetente.
 *
 * São dois estragos diferentes e ambos são graves numa caixa partilhada:
 *
 *  · um rascunho escrito para a Ana ficava no ecrã com o endereço do João por
 *    baixo, a um clique de sair para a pessoa errada;
 *  · e abrir um email a seguir a responder a outro mostrava «✓ Resposta
 *    enviada para <o novo endereço>» — uma frase falsa sobre um email que
 *    ninguém escreveu.
 *
 * O resto do back office já resolve isto com uma `key` pela identidade da linha
 * (ver `<ClientMessenger key={quote.id}>` em `CommsZone`); aqui faltava.
 */

function mensagem(over: Partial<InboxMessage> = {}): InboxMessage {
  return {
    uid: 1,
    from: "Ana Costa",
    fromAddress: "ana@cliente.pt",
    subject: "Orçamento casamento",
    date: "2026-01-02T03:04:05.000Z",
    seen: true,
    messageId: "<m1@cliente.pt>",
    references: [],
    attachments: [],
    text: "Bom dia, gostava de um orçamento.",
    ...over,
  };
}

const OUTRA = mensagem({
  uid: 2,
  from: "João Dias",
  fromAddress: "joao@outro.pt",
  subject: "Aluguer de material",
  messageId: "<m2@outro.pt>",
  text: "Boa tarde.",
});

function renderThread(message: InboxMessage, onReply = vi.fn(async () => true)) {
  const props = {
    seen: true,
    flagged: false,
    loadingMsg: false,
    lang: "pt",
    quotes: [],
    quoteName: () => undefined,
    canOverlay: true,
    creating: false,
    onToggleSeen: vi.fn(),
    onToggleStar: vi.fn(),
    onArchive: vi.fn(),
    onUnarchive: vi.fn(),
    onSetPinned: vi.fn(),
    onToggleLabel: vi.fn(),
    onLinkQuote: vi.fn(),
    onCreateQuote: vi.fn(),
    onReply,
  };
  const utils = render(<InboxThread message={message} {...props} />);
  return {
    ...utils,
    abrir: (outra: InboxMessage) => utils.rerender(<InboxThread message={outra} {...props} />),
  };
}

const caixaDeResposta = () => screen.getByPlaceholderText(/escreve a resposta/i);

afterEach(cleanup);

describe("InboxThread — o compositor pertence à mensagem aberta", () => {
  it("não leva o rascunho da Ana para o email do João", async () => {
    const user = userEvent.setup();
    const { abrir } = renderThread(mensagem());

    await user.type(caixaDeResposta(), "Olá Ana, com todo o gosto —");
    abrir(OUTRA);

    // O «Para:» já é o do João; o texto escrito para a Ana não pode ficar cá.
    expect(screen.getByText(/Para: joao@outro\.pt/)).toBeInTheDocument();
    expect(caixaDeResposta()).toHaveValue("");
  });

  it("não diz «resposta enviada» num email a que ninguém respondeu", async () => {
    const user = userEvent.setup();
    const { abrir } = renderThread(mensagem());

    await user.type(caixaDeResposta(), "Enviamos hoje.");
    await user.click(screen.getByRole("button", { name: /enviar resposta/i }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/ana@cliente\.pt/));

    abrir(OUTRA);
    expect(screen.queryByRole("status")).toBeNull();
    expect(caixaDeResposta()).toBeInTheDocument();
  });

  it("mantém o que está escrito enquanto a mesma mensagem for recarregada", async () => {
    const user = userEvent.setup();
    // Marcar como lida devolve o MESMO email com `seen` diferente — isso não
    // pode deitar fora o rascunho de quem está a escrever.
    const { abrir } = renderThread(mensagem({ seen: false }));

    await user.type(caixaDeResposta(), "A responder…");
    abrir(mensagem({ seen: true }));

    expect(caixaDeResposta()).toHaveValue("A responder…");
  });
});
