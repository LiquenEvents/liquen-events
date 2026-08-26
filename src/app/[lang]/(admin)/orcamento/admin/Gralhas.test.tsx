// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Gralhas from "./Gralhas";
import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVISO DE ORTOGRAFIA DÁ SEMPRE DOIS CAMINHOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Corrigir» resolve o caso normal: falta um acento, põe-se o acento. Não
 * resolve os outros dois — a palavra pode estar assim de propósito, ou ser a
 * frase à volta dela que está errada. Nesses, o que é preciso é CHEGAR AO
 * CAMPO, e procurá-lo à mão num documento de catorze páginas é o que fazia
 * este aviso acabar ignorado.
 *
 * Por isso cada linha tem os dois botões, e é isso que aqui se prende.
 */

afterEach(cleanup);

const doc = (over: Partial<ProposalDoc> = {}) =>
  ({
    ref: "PO Decoração Casamento",
    eventType: "Casamento",
    totalLabel: "Valor Total",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    budgetExtras: [],
    ...over,
  }) as ProposalDoc;

const desenhar = (d: ProposalDoc, onIr = vi.fn(), onCorrigir = vi.fn()) => {
  render(<Gralhas doc={d} onCorrigir={onCorrigir} onCorrigirTudo={vi.fn()} onIr={onIr} />);
  return { onIr, onCorrigir };
};

describe("Gralhas", () => {
  it("não desenha nada quando está tudo escrito certo", () => {
    const { container } = render(
      <Gralhas
        doc={doc({ budgetItems: ["Decoração Cerimónia"] })}
        onCorrigir={vi.fn()}
        onCorrigirTudo={vi.fn()}
        onIr={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("mostra a palavra escrita e a proposta, lado a lado", () => {
    desenhar(doc({ budgetItems: ["Decor Floral Cerimonia"] }));
    expect(screen.getByText("Cerimonia")).toBeTruthy();
    expect(screen.getByText("Cerimónia")).toBeTruthy();
  });

  it("«Ver no campo» diz QUAL campo, e não só que há um erro", () => {
    const { onIr } = desenhar(doc({ budgetItems: ["Decor Floral Cerimonia"] }));
    screen.getByRole("button", { name: "Ver no campo" }).click();
    expect(onIr).toHaveBeenCalledTimes(1);
    expect(onIr.mock.calls[0][0].campo).toEqual({ tipo: "linhaDeOrcamento", i: 0 });
  });

  it("cada gralha tem os SEUS dois botões", () => {
    desenhar(
      doc({
        budgetItems: ["Cerimonia"],
        moodBoards: [{ id: "b1", title: "Decoracao", images: [] }],
      }),
    );
    expect(screen.getAllByRole("button", { name: "Corrigir" })).toHaveLength(2);
    expect(screen.getAllByRole("button", { name: "Ver no campo" })).toHaveLength(2);
  });

  it("o «Corrigir» de uma linha corrige AQUELA gralha", () => {
    const { onCorrigir } = desenhar(
      doc({
        budgetItems: ["Cerimonia"],
        moodBoards: [{ id: "b1", title: "Decoracao", images: [] }],
      }),
    );
    // Os mood boards vêm antes das linhas do orçamento — é a ordem por que os
    // campos aparecem no ecrã, e é a ordem por que o aviso os lista.
    screen.getAllByRole("button", { name: "Corrigir" })[0].click();
    expect(onCorrigir.mock.calls[0][0]).toMatchObject({
      escrita: "Decoracao",
      sugerida: "Decoração",
      campo: { tipo: "boardTitulo", bi: 0 },
    });
  });
});
