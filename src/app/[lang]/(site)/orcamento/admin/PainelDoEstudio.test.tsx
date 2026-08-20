// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PainelDoEstudio, { type PaginaParaOPainel } from "./PainelDoEstudio";
import type { MoodBoard } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A TERCEIRA ZONA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Uma pré-visualização grande e fixa à direita, no espaço hoje vazio.»
 *
 * As duas afirmações que aqui se prendem são as que custam dinheiro se
 * falharem: o painel NÃO EXISTE onde não cabe (e por isso não se paga a
 * desenhá-lo), e o que ele mostra é a página que ela está a editar.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O navegador diz que o ecrã é largo — ou que não é. */
const largura = (cabe: boolean) =>
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: cabe,
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));

const board = (over: Partial<MoodBoard> = {}): MoodBoard =>
  ({ title: "Cerimónia", images: ["p/a.jpg", "p/b.jpg"], ...over }) as MoodBoard;

const paginas: PaginaParaOPainel[] = [
  { bi: 0, board: board({ title: "Cerimónia" }) },
  { bi: 1, board: board({ title: "Jantar" }) },
];

const desenhar = (over: Partial<React.ComponentProps<typeof PainelDoEstudio>> = {}) =>
  render(
    <PainelDoEstudio
      paginas={paginas}
      urls={{ "p/a.jpg": "u/a", "p/b.jpg": "u/b" }}
      originais={{}}
      aspetos={{ "p/a.jpg": 1.5, "p/b.jpg": 0.7 }}
      onSaltar={() => {}}
      {...over}
    />,
  );

describe("o painel só existe onde cabe", () => {
  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("num ecrã estreito não desenha NADA — nem escondido", () => {
    // `hidden 2xl:block` esconde com CSS e o React desenha na mesma. Medido:
    // numa proposta no tecto do gerador isso chegou para o estúdio deixar de
    // responder. Quem trabalha num portátil não pode pagar o painel que não tem.
    largura(false);
    const { container } = desenhar();
    expect(container.firstChild).toBeNull();
  });

  it("num ecrã largo, desenha", () => {
    largura(true);
    desenhar();
    expect(screen.getByRole("complementary", { name: /o que vai sair/i })).toBeTruthy();
  });

  it("sem `matchMedia` nenhum, não rebenta — não desenha", () => {
    // Acontece no servidor e em ambientes de teste. Um painel que rebentasse
    // por não saber a largura era pior do que não haver painel.
    vi.stubGlobal("matchMedia", undefined);
    const { container } = desenhar();
    expect(container.firstChild).toBeNull();
  });
});

describe("o que o painel mostra", () => {
  it("a página que está a ser editada, e diz qual é de quantas", () => {
    largura(true);
    desenhar({ activa: 1 });
    expect(screen.getByText(/Página 2 de 2/)).toBeTruthy();
  });

  it("sem página activa, mostra a primeira em vez de nada", () => {
    // Abrir o estúdio e ver o painel vazio até tocar num board era um painel
    // que parece avariado.
    largura(true);
    desenhar();
    expect(screen.getByText(/Página 1 de 2/)).toBeTruthy();
  });

  it("conta as páginas ao vivo", () => {
    largura(true);
    desenhar();
    expect(screen.getByText("2 páginas")).toBeTruthy();
  });

  it("em «Todas», cada página leva ao sítio dela no editor", async () => {
    largura(true);
    const saltos: number[] = [];
    const user = userEvent.setup();
    desenhar({ onSaltar: (bi) => saltos.push(bi) });
    await user.click(screen.getByRole("tab", { name: "Todas" }));
    await user.click(screen.getByRole("button", { name: /Ir para a página 2: Jantar/ }));
    expect(saltos).toEqual([1]);
  });

  it("sem páginas nenhumas, diz o que vai acontecer em vez de ficar vazio", () => {
    largura(true);
    desenhar({ paginas: [] });
    expect(screen.getByText(/Ainda não há páginas de inspiração/i)).toBeTruthy();
  });
});
