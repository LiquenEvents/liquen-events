// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import Conferencia from "./Conferencia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CONFERÊNCIA A 390 px
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É AQUI que o que falta para enviar passou a viver — e a razão de ter mudado
 * de sítio é precisamente esta largura: a lista antiga estava numa coluna
 * `xl:block`, invisível em tudo o que não fosse um ecrã grande. Se não coubesse
 * aqui, a mudança não tinha resolvido nada.
 *
 * O que se prende é o que o jsdom pode mesmo garantir: nada com largura fixa
 * maior do que o ecrã, e — a armadilha que este repositório já apanhou três
 * vezes — a frase de cada linha como UM item de flex.
 */

const doc = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    ref: "Ana e Rui · Decoração",
    clientNames: "Ana e Rui",
    eventDate: "18 de Setembro de 2027",
    location: "Évora",
    guests: "120 pax",
    totalText: "12.000,00 € + IVA",
    budgetItems: [],
    serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [] }],
    moodBoards: [{ images: ["board/1.jpg"] }],
    coverImages: ["capa/1.jpg", "capa/2.jpg"],
    ...over,
  }) as ProposalDoc;

const pedido = () =>
  ({ id: "LQ-1", name: "Ana e Rui", date: "2027-09-18", location: "Sintra", guests: 120 }) as Quote;

beforeEach(() => {
  // 390×844 — o telemóvel de referência da casa.
  window.innerWidth = 390;
  window.innerHeight = 844;
});

afterEach(cleanup);

describe("a lista do que falta cabe num telemóvel de 390 px", () => {
  it("nada tem largura fixa maior do que o ecrã", () => {
    const { container } = render(
      <Conferencia doc={doc({ ref: "" })} quote={pedido()} totalBruto={12_000} onIr={() => {}} />,
    );
    const tudo = Array.from(container.querySelectorAll<HTMLElement>("*"));
    // CONTROLO POSITIVO: uma afirmação de ausência sobre uma lista vazia é
    // verdadeira e não diz nada. A lista está mesmo desenhada.
    expect(tudo.length).toBeGreaterThan(20);
    for (const el of tudo) {
      const largura = el.style.width || el.style.minWidth;
      const px = /^(\d+)px$/.exec(largura ?? "");
      if (px) expect(Number(px[1])).toBeLessThanOrEqual(390);
    }
  });

  /**
   * ── A ARMADILHA DO `alvo-toque` ──────────────────────────────────────────
   *
   * A classe põe `display: inline-flex` em ecrãs de toque. Num contentor de
   * flex, cada filho directo passa a ser uma COLUNA — e «Local — a proposta diz
   * "Évora" e o pedido dizia "Sintra"» partia-se em duas colunas lado a lado,
   * cada uma a quebrar por sua conta, com o travessão a meio do nada. Com rato,
   * sem `inline-flex`, corria sempre bem: é por isso que isto nunca se vê no
   * portátil. Um invólucro só, e lá dentro o texto volta a ser texto.
   */
  it("a frase de cada linha é UM item de flex, e não duas colunas", () => {
    render(
      <Conferencia doc={doc({ ref: "" })} quote={pedido()} totalBruto={12_000} onIr={() => {}} />,
    );
    const botoes = screen.getAllByRole("button");
    expect(botoes.length).toBeGreaterThan(0);
    for (const b of botoes) {
      expect(b.className).toContain("alvo-toque");
      expect(b.children).toHaveLength(1);
    }
  });

  it("o texto do que falta não é uma cadeia sem quebras", () => {
    // O título de um impedimento é uma frase com espaços — parte-se sozinha.
    // Aqui o que se prende é que ele CHEGA ao ecrã inteiro, e não cortado.
    render(<Conferencia doc={doc({ ref: "" })} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getByText("Falta o título interno").textContent).toBe("Falta o título interno");
  });
});
