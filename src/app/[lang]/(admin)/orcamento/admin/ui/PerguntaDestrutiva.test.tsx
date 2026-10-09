// @vitest-environment jsdom
import { useState } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PerguntaDestrutiva } from "./PerguntaDestrutiva";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «CANCELAR» É O PREDEFINIDO, E O BOTÃO QUE DESTRÓI É VERMELHO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Do `docs/PROPOSTAS-E-TEMAS-APPLE.md` §5 e da Parte 10 do sistema de design:
 * «havendo destrutiva, inclui "Cancelar" e nunca a marques como default»,
 * «foco inicial no botão não destrutivo». A pergunta passa por 18 sítios do
 * back office, e todos herdam isto daqui.
 *
 * Já era assim — o «Cancelar» vem primeiro nas acções e a armadilha de foco
 * do `FolhaOuDialogo` põe o foco no primeiro controlo. Estava provado num
 * passeio só (`e2e/tarefas-acessibilidade.spec.ts`, ao eliminar uma tarefa);
 * isto prende-o no primitivo, que é por onde passam os 18.
 *
 * O jsdom não faz disposição e o `offsetParent` dá sempre `null` — a
 * armadilha lia todos os botões como escondidos e punha o foco na caixa.
 * O mesmo duplo do `useFocusTrap.test.ts`: escondido é `hidden` ou
 * `display: none`, o resto tem pai.
 */
let original: PropertyDescriptor | undefined;
beforeAll(() => {
  original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetParent");
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement): Element | null {
      if (this.hidden || this.style?.display === "none") return null;
      for (let el = this.parentElement; el; el = el.parentElement) {
        if (el.hidden || el.style?.display === "none") return null;
      }
      return this.isConnected ? this.parentElement : null;
    },
  });
});
afterAll(() => {
  if (original) Object.defineProperty(HTMLElement.prototype, "offsetParent", original);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Computador: o `FolhaOuDialogo` desenha o diálogo centrado. */
function simularComputador() {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    return {
      matches: min ? 1440 >= Number(min[1]) : mq.includes("hover: hover"),
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

function Pergunta({ onConfirmar }: { onConfirmar: () => void }) {
  const [aberto, setAberto] = useState(true);
  return (
    <PerguntaDestrutiva
      aberto={aberto}
      onFechar={() => setAberto(false)}
      titulo="Apagar o pedido de Ana e João?"
      oQueSePerde={["3 propostas, uma delas enviada ao casal"]}
      aviso="Não pode ser anulado."
      rotuloConfirmar="Apagar o pedido"
      onConfirmar={onConfirmar}
    />
  );
}

describe("a pergunta destrutiva", () => {
  it("abre com o foco no «Cancelar», e não no botão que apaga", () => {
    simularComputador();
    render(<Pergunta onConfirmar={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveFocus();
  });

  it("um Enter carregado logo ao abrir cancela — não apaga", async () => {
    simularComputador();
    const apagar = vi.fn();
    const u = userEvent.setup();
    render(<Pergunta onConfirmar={apagar} />);
    await u.keyboard("{Enter}");
    expect(apagar).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("o botão que apaga é o vermelho da casa e diz o verbo; o «Cancelar» não é", () => {
    simularComputador();
    render(<Pergunta onConfirmar={vi.fn()} />);
    const apagar = screen.getByRole("button", { name: "Apagar o pedido" });
    const cancelar = screen.getByRole("button", { name: "Cancelar" });
    expect(apagar).toHaveClass("bg-[var(--bo-perigo)]");
    expect(cancelar).not.toHaveClass("bg-[var(--bo-perigo)]");
    // «Cancelar» à esquerda: vem primeiro na ordem do documento.
    expect(
      cancelar.compareDocumentPosition(apagar) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("e só apaga quando se chega ao botão dele", async () => {
    simularComputador();
    const apagar = vi.fn();
    const u = userEvent.setup();
    render(<Pergunta onConfirmar={apagar} />);
    await u.tab();
    expect(screen.getByRole("button", { name: "Apagar o pedido" })).toHaveFocus();
    await u.keyboard("{Enter}");
    expect(apagar).toHaveBeenCalledOnce();
  });
});
