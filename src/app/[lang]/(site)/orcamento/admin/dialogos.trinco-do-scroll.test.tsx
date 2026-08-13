// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import NewQuoteModal from "./NewQuoteModal";
import ShortcutsModal from "./ShortcutsModal";
import AjudaGlossario from "./AjudaGlossario";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FUNDO NÃO ROLA POR TRÁS DE UM DIÁLOGO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO com o navegador, com o «Novo pedido» aberto:
 *
 *   · telemóvel 390×844 — arrastar FORA do diálogo (y = 826) rolava a página
 *     de trás **0 → 892 px**;
 *   · computador 1440×900 — a roda do rato EM CIMA do próprio diálogo rolava
 *     a página de trás **0 → 771 px**.
 *
 * Fecha-se o diálogo e já não se está onde se estava. O diálogo estava bem
 * feito no resto — `role="dialog"`, `aria-modal`, armadilha de foco, Escape,
 * fecho a 44×44 —, faltava-lhe o trinco.
 *
 * O padrão já era da casa (a gaveta do pedido, a folha do telemóvel e a lupa
 * das fotos trancam com `body { overflow: hidden }`); o que faltava era estar
 * num sítio só. Está em `useTrincoDeScroll`, e é o que este teste exercita —
 * pelos diálogos, que é por onde o defeito se vê.
 */

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta({})),
  );
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
  document.body.style.paddingRight = "";
});

it("«Novo pedido» tranca o scroll do fundo enquanto está aberto", () => {
  const { rerender } = render(
    <ToastProvider>
      <NewQuoteModal open={false} onClose={() => {}} onCreated={() => {}} />
    </ToastProvider>,
  );
  expect(document.body.style.overflow).toBe("");

  rerender(
    <ToastProvider>
      <NewQuoteModal open onClose={() => {}} onCreated={() => {}} />
    </ToastProvider>,
  );
  expect(document.body.style.overflow, "o fundo rola por trás do «Novo pedido»").toBe("hidden");

  // E DESTRANCA — ao valor que lá estava, não a um "visible" inventado: quem
  // manda no eixo horizontal é o `body { overflow-x: clip }` do globals.css, e
  // escrever por cima dele deixava o back office com scroll horizontal.
  rerender(
    <ToastProvider>
      <NewQuoteModal open={false} onClose={() => {}} onCreated={() => {}} />
    </ToastProvider>,
  );
  expect(document.body.style.overflow).toBe("");
  expect(document.body.style.paddingRight).toBe("");
});

it("os outros diálogos da casa trancam pelo mesmo trinco", () => {
  for (const abrir of [
    (aberto: boolean) => <ShortcutsModal open={aberto} onClose={() => {}} />,
    (aberto: boolean) => <AjudaGlossario open={aberto} onClose={() => {}} />,
  ]) {
    const { rerender, unmount } = render(abrir(true));
    expect(document.body.style.overflow).toBe("hidden");
    rerender(abrir(false));
    expect(document.body.style.overflow).toBe("");
    unmount();
  }
});

it("dois diálogos sobrepostos: o de dentro a fechar não destranca o de fora", () => {
  const { rerender, unmount } = render(<ShortcutsModal open onClose={() => {}} />);
  expect(document.body.style.overflow).toBe("hidden");

  // Um segundo diálogo por cima, e a fechar-se primeiro. Sem contagem de
  // trincos, este destrancava a página com o primeiro ainda aberto.
  const segundo = render(<AjudaGlossario open onClose={() => {}} />);
  expect(document.body.style.overflow).toBe("hidden");
  segundo.rerender(<AjudaGlossario open={false} onClose={() => {}} />);
  expect(document.body.style.overflow, "o diálogo de fora ainda está aberto").toBe("hidden");

  rerender(<ShortcutsModal open={false} onClose={() => {}} />);
  expect(document.body.style.overflow).toBe("");
  segundo.unmount();
  unmount();
});
