// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import VistaDeConjunto from "./VistaDeConjunto";
import type { MoodBoard, ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISTA MOSTRA O DOCUMENTO, E NÃO UM PEDAÇO DELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Todas" mostra 7 páginas quando o PDF tem cerca de 14 — uma
 * pré-visualização parcial dá falsa confiança», e «hoje vê-se um problema na
 * página 5 e tem de se procurar onde ele nasce».
 *
 * Duas coisas se prendem aqui. A primeira é a contagem: o que esta vista desenha
 * é a lista de `paginasDaProposta`, a espinha do gerador, e não os mood boards.
 * A segunda é o salto: cada miniatura leva ao sítio do formulário onde aquela
 * folha se escreve — sem isso a vista mostra o problema e esconde a solução.
 *
 * E o que já cá estava continua: as setas movem contra a inspiração VIZINHA, e
 * não contra a posição ao lado. Com uma página vazia pelo meio a seta trocava a
 * página com ESSA, o ecrã ficava igual, e lia-se como uma seta avariada.
 */

afterEach(cleanup);

const board = (over: Partial<MoodBoard> = {}): MoodBoard => ({
  title: "Cerimónia",
  images: ["a.jpg"],
  ...over,
});

const docCom = (boards: MoodBoard[]): ProposalDoc =>
  ({
    template: "decoracao",
    ref: "PO",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Monte da Oliveirinha",
    guests: "150 pax",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: boards,
    budgetItems: ["Decor Cerimónia"],
    totalLabel: "Valor Total Decoração",
    totalText: "3.000,00 € + IVA",
    coverImages: [],
    notasImportantes: [],
    incluido: [],
    naoIncluido: [],
    condicoesGerais: ["O valor não inclui IVA."],
    observacoesGerais: ["A montagem é na véspera."],
    faseamento: [],
    cancelamento: [],
    cronograma: [],
  }) as unknown as ProposalDoc;

function desenhar(
  boards: MoodBoard[],
  acoes: { onMover?: () => void; onSaltar?: () => void; onIrParaSeccao?: () => void } = {},
) {
  const props = {
    onMover: vi.fn(),
    onSaltar: vi.fn(),
    onIrParaSeccao: vi.fn(),
    ...acoes,
  };
  render(
    <VistaDeConjunto
      doc={docCom(boards)}
      ordem={boards.map((_, i) => i)}
      urls={{ "a.jpg": "/a.jpg" }}
      aspetos={{ "a.jpg": 1.5 }}
      onFechar={vi.fn()}
      {...props}
    />,
  );
  return props;
}

/**
 * ── A CONTAGEM ──────────────────────────────────────────────────────────────
 *
 * Uma proposta com dois boards com fotografias tem OITO páginas: capa,
 * apresentação, as duas de inspiração, orçamento, condições, observações e
 * contracapa. A vista antiga desenhava duas.
 */
describe("VistaDeConjunto: o documento inteiro", () => {
  it("desenha as folhas que não são de inspiração", () => {
    desenhar([board({ title: "Cocktail" }), board({ title: "Jantar" })]);
    for (const titulo of [
      "Capa",
      "Apresentação e serviços",
      "Cocktail",
      "Jantar",
      "Orçamento",
      "Condições gerais",
      "Observações e contactos",
      "Contracapa",
    ]) {
      expect(screen.getAllByText(titulo).length, `sem a página «${titulo}»`).toBeGreaterThan(0);
    }
  });

  it("cada miniatura diz que página é, e de quantas", () => {
    desenhar([board({ title: "Cocktail" }), board({ title: "Jantar" })]);
    expect(screen.getByText("Página 1 de 8")).toBeTruthy();
    expect(screen.getByText("Página 8 de 8")).toBeTruthy();
  });

  it("uma página de inspiração sem fotografias não é desenhada", () => {
    // O gerador salta-a de propósito: nunca mostrar a um cliente uma folha
    // vazia. Desenhá-la aqui era prometer uma página que não existe.
    desenhar([board({ title: "Cocktail" }), board({ title: "Vazia", images: [] })]);
    expect(screen.queryAllByText("Vazia")).toHaveLength(0);
  });

  /**
   * ── O SALTO ───────────────────────────────────────────────────────────────
   *
   * «Hoje vê-se um problema na página 5 e tem de se procurar onde ele nasce.»
   */
  it("clicar numa folha de texto abre a secção que a escreve", () => {
    const { onIrParaSeccao } = desenhar([board({ title: "Cocktail" })]);
    fireEvent.click(screen.getByLabelText(/página 4, Orçamento/));
    expect(onIrParaSeccao).toHaveBeenCalledWith("orcamento");
  });

  it("clicar numa página de inspiração vai ao board, e não só à secção", () => {
    const { onSaltar, onIrParaSeccao } = desenhar([
      board({ title: "Cocktail" }),
      board({ title: "Jantar" }),
    ]);
    fireEvent.click(screen.getByLabelText(/página 4, Jantar/));
    expect(onSaltar).toHaveBeenCalledWith(1);
    expect(onIrParaSeccao).not.toHaveBeenCalled();
  });

  it("as setas só existem onde há ordem para mudar", () => {
    desenhar([board({ title: "Cocktail" }), board({ title: "Jantar" })]);
    // A capa não troca de sítio com o orçamento.
    expect(screen.queryByLabelText("Mover a página 1 para trás")).toBeNull();
    expect(screen.queryByLabelText("Mover a página 5 para a frente")).toBeNull();
    expect(screen.getByLabelText("Mover a página 4 para trás")).toBeTruthy();
  });
});

describe("VistaDeConjunto: reordenar", () => {
  /** As duas inspirações visíveis são as páginas 3 e 4 do documento. */
  it("a seta para trás salta por cima da página vazia", () => {
    const { onMover } = desenhar([
      board({ title: "Cocktail" }),
      board({ title: "Vazia", images: [] }),
      board({ title: "Jantar" }),
    ]);
    fireEvent.click(screen.getByLabelText("Mover a página 4 para trás"));
    expect(onMover).toHaveBeenCalledWith(2, 0);
  });

  it("a seta para a frente também", () => {
    const { onMover } = desenhar([
      board({ title: "Cocktail" }),
      board({ title: "Vazia", images: [] }),
      board({ title: "Jantar" }),
    ]);
    fireEvent.click(screen.getByLabelText("Mover a página 3 para a frente"));
    expect(onMover).toHaveBeenCalledWith(0, 2);
  });

  it("nas pontas da lista visível as setas ficam desligadas", () => {
    desenhar([
      board({ title: "Cocktail" }),
      board({ title: "Vazia", images: [] }),
      board({ title: "Jantar" }),
    ]);
    expect(screen.getByLabelText("Mover a página 3 para trás").hasAttribute("disabled")).toBe(true);
    expect(screen.getByLabelText("Mover a página 4 para a frente").hasAttribute("disabled")).toBe(
      true,
    );
    expect(screen.getByLabelText("Mover a página 3 para a frente").hasAttribute("disabled")).toBe(
      false,
    );
  });

  it("a última visível não tem para onde ir, mesmo com páginas vazias por baixo", () => {
    desenhar([
      board({ title: "Cocktail" }),
      board({ title: "Jantar" }),
      board({ title: "Vazia", images: [] }),
    ]);
    expect(screen.getByLabelText("Mover a página 4 para a frente").hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("sem páginas vazias, move para a posição ao lado", () => {
    const { onMover } = desenhar([board({ title: "Cocktail" }), board({ title: "Jantar" })]);
    fireEvent.click(screen.getByLabelText("Mover a página 4 para trás"));
    expect(onMover).toHaveBeenCalledWith(1, 0);
  });
});
