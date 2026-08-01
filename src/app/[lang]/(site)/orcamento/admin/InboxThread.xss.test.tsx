// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { InboxMessage } from "@/lib/inbox-types";
import InboxThread from "./InboxThread";

/**
 * XSS ARMAZENADO NO BACK OFFICE — A PROVA DO LADO DO ECRÃ.
 *
 * Qualquer pessoa consegue enviar um email ao estúdio. Se o painel de leitura
 * interpretasse o conteúdo recebido como HTML, esse email era XSS armazenado
 * numa página autenticada: bastava escrever para a caixa.
 *
 * `inbox.untrusted.test.ts` prova a metade do servidor (o objeto entregue nunca
 * tem campo `html`). Este prova a metade do ecrã: mesmo que um campo hostil
 * chegue ao componente, ele é desenhado como TEXTO e nunca vira marcação.
 *
 * Cobre todos os campos que o remetente controla: corpo, assunto, nome, endereço
 * e nome dos anexos.
 */

const PAYLOAD = `<img src=x onerror="window.__xss=1">`;

function hostileMessage(): InboxMessage {
  return {
    uid: 42,
    from: `Ana<script>window.__xss=1</script>`,
    fromAddress: `ana@x.pt"><script>window.__xss=1</script>`,
    subject: `Orçamento ${PAYLOAD}`,
    date: "2026-01-02T03:04:05.000Z",
    seen: false,
    messageId: "<atk-1@evil.com>",
    references: [],
    attachments: [
      {
        partId: "2",
        filename: `../../../etc/passwd${PAYLOAD}`,
        size: 900,
        contentType: "application/pdf",
      },
    ],
    text: `Olá\n<script>window.__xss=1</script>\n${PAYLOAD}\n<svg/onload=window.__xss=1>`,
  };
}

function renderThread(message: InboxMessage) {
  return render(
    <InboxThread
      message={message}
      seen={false}
      flagged={false}
      loadingMsg={false}
      lang="pt"
      quotes={[]}
      quoteName={() => undefined}
      canOverlay
      creating={false}
      onToggleSeen={vi.fn()}
      onToggleStar={vi.fn()}
      onArchive={vi.fn()}
      onUnarchive={vi.fn()}
      onSetPinned={vi.fn()}
      onToggleLabel={vi.fn()}
      onLinkQuote={vi.fn()}
      onCreateQuote={vi.fn()}
      onReply={async () => true}
    />,
  );
}

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__xss;
});

describe("InboxThread — conteúdo de email é input não confiável", () => {
  it("não materializa nenhuma etiqueta viva vinda do email", () => {
    const { container } = renderThread(hostileMessage());

    // Nenhum elemento executável nasceu da carga.
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector("svg[onload]")).toBeNull();
    // O <img> da carga não pode existir de todo.
    expect(container.querySelector('img[src="x"]')).toBeNull();
    // E nada correu.
    expect((window as unknown as Record<string, unknown>).__xss).toBeUndefined();
  });

  it("mostra a carga como texto literal (escapada, não interpretada)", () => {
    const { container } = renderThread(hostileMessage());

    // O corpo aparece na página tal e qual foi recebido — como texto.
    expect(container.textContent).toContain("<script>window.__xss=1</script>");
    expect(container.textContent).toContain(PAYLOAD);

    // O assunto e o nome do anexo idem: texto, nunca marcação.
    expect(container.textContent).toContain(`Orçamento ${PAYLOAD}`);
    expect(container.textContent).toContain(`../../../etc/passwd${PAYLOAD}`);
  });

  it("não cria elementos a partir do endereço do remetente", () => {
    const { container } = renderThread(hostileMessage());
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(container.textContent).toContain(`ana@x.pt"><script>window.__xss=1</script>`);
  });
});
