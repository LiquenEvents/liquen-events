// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { InboxItemEnriched } from "@/lib/inbox-types";
import InboxList from "./InboxList";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA CAIXA SEM MENSAGENS NÃO PODE SER UM RECTÂNGULO EM BRANCO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Sem linhas para desenhar, a lista devolvia um `<ul>` vazio: a coluna ficava
 * literalmente sem nada. E é o estado que aparece nos três momentos em que se
 * precisa MAIS de uma frase — a caixa acabada de ligar, uma pesquisa sem
 * resultados, e o IMAP em baixo (que chega aqui como uma lista vazia, igual às
 * outras duas). Quem olha não distingue «não há emails» de «isto avariou», e a
 * diferença entre as duas é a diferença entre esperar e ir chamar alguém.
 *
 * Por isso a lista diz sempre alguma coisa — e deixa o contentor, que é quem
 * sabe o porquê, escrever a linha de baixo.
 */

const item = (over: Partial<InboxItemEnriched> = {}): InboxItemEnriched => ({
  uid: 1,
  from: "Ana Costa",
  fromAddress: "ana@cliente.pt",
  subject: "Orçamento",
  date: "2026-01-02T03:04:05.000Z",
  seen: true,
  messageId: "<m1@cliente.pt>",
  references: [],
  attachments: [],
  ...over,
});

function renderList(over: Partial<Parameters<typeof InboxList>[0]> = {}) {
  return render(
    <InboxList
      items={[]}
      selectedUid={null}
      loading={false}
      flaggedUids={new Set()}
      quoteName={() => undefined}
      onOpen={vi.fn()}
      onToggleStar={vi.fn()}
      {...over}
    />,
  );
}

afterEach(cleanup);

describe("InboxList — sem mensagens para mostrar", () => {
  it("diz que não há mensagens em vez de não desenhar nada", () => {
    const { container } = renderList();
    expect(container.textContent?.trim()).not.toBe("");
    expect(screen.getByText(/sem mensagens/i)).toBeInTheDocument();
  });

  it("deixa o contentor explicar o porquê (pesquisa, arquivo, caixa em baixo)", () => {
    renderList({ emptyHint: "Não foi possível falar com a caixa de correio." });
    expect(screen.getByText(/não foi possível falar com a caixa de correio/i)).toBeInTheDocument();
  });

  it("não mostra o vazio enquanto ainda está a carregar", () => {
    renderList({ loading: true });
    expect(screen.queryByText(/sem mensagens/i)).toBeNull();
  });

  it("com mensagens, desenha as linhas e nenhum vazio", () => {
    renderList({ items: [item()] });
    expect(screen.getByText("Ana Costa")).toBeInTheDocument();
    expect(screen.queryByText(/sem mensagens/i)).toBeNull();
  });
});
