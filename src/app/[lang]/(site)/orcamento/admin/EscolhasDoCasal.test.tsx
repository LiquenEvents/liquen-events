// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import EscolhasDoCasal from "./EscolhasDoCasal";
import type { Escolha } from "@/lib/proposta-escolhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ESCOLHA VOLTA À FICHA DO EVENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «A escolha volta ao back office e aparece na ficha do evento.» É a segunda
 * metade da frase — e o que aqui se prende são as três leituras que ela pode
 * ter de fazer antes de comprar flor:
 *
 *   escolheram      → o quê, e em que dia;
 *   não escolheram  → ainda não, e as alternativas pelo nome, para telefonar;
 *   escolheram e a opção saiu do documento → dizê-lo, com todas as letras.
 *
 * O terceiro é o que evita a conversa em que ela jura que eles nunca
 * responderam.
 */

const ESCOLHAS: Escolha[] = [
  {
    id: "e1",
    titulo: "Paleta da cerimónia",
    opcoes: [
      { id: "o1", rotulo: "Verde-oliva e branco" },
      { id: "o2", rotulo: "Terracota e creme" },
    ],
  },
  {
    id: "e2",
    titulo: "Corredor",
    opcoes: [
      { id: "c1", rotulo: "Pétalas" },
      { id: "c2", rotulo: "Velas" },
    ],
  },
];

afterEach(cleanup);

describe("sem alternativas, não há secção nenhuma", () => {
  it("um cartão vazio em todos os eventos para servir alguns é ruído", () => {
    const { container } = render(<EscolhasDoCasal escolhas={undefined} respostas={[]} />);
    expect(container.textContent).toBe("");
  });

  it("uma alternativa por acabar também não conta — o casal não a vê", () => {
    const { container } = render(
      <EscolhasDoCasal
        escolhas={[{ id: "e9", titulo: "Meia", opcoes: [{ id: "x", rotulo: "Só uma" }] }]}
        respostas={[]}
      />,
    );
    expect(container.textContent).toBe("");
  });
});

describe("o que ela lê", () => {
  it("escolheram: diz o quê e em que dia", () => {
    render(
      <EscolhasDoCasal
        escolhas={ESCOLHAS}
        respostas={[{ escolhaId: "e1", opcaoId: "o2", em: "2026-05-02T10:00:00.000Z" }]}
      />,
    );
    expect(screen.getByText("Terracota e creme")).toBeTruthy();
    expect(screen.getByText(/02 de maio de 2026/)).toBeTruthy();
  });

  it("não escolheram: nomeia as alternativas, para ela poder perguntar", () => {
    // «Ainda não escolheram a paleta» e «não havia paleta para escolher» são
    // duas conversas muito diferentes de ter ao telefone.
    render(<EscolhasDoCasal escolhas={ESCOLHAS} respostas={[]} />);
    expect(screen.getByText(/Verde-oliva e branco ou Terracota e creme/)).toBeTruthy();
    expect(screen.getByText("2 por responder")).toBeTruthy();
  });

  it("as que faltam aparecem ao lado das respondidas, e não só elas", () => {
    render(
      <EscolhasDoCasal
        escolhas={ESCOLHAS}
        respostas={[{ escolhaId: "e1", opcaoId: "o1", em: "2026-05-02T10:00:00.000Z" }]}
      />,
    );
    expect(screen.getByText("Paleta da cerimónia")).toBeTruthy();
    expect(screen.getByText("Corredor")).toBeTruthy();
    expect(screen.getByText("1 por responder")).toBeTruthy();
  });

  it("responderam e a opção saiu do documento: DI-LO, não finge silêncio", () => {
    render(
      <EscolhasDoCasal
        escolhas={ESCOLHAS}
        respostas={[{ escolhaId: "e1", opcaoId: "apagada", em: "2026-05-02T10:00:00.000Z" }]}
      />,
    );
    expect(screen.getByText(/já não está na proposta/)).toBeTruthy();
    expect(screen.getByText(/confirmar com eles antes de comprar/)).toBeTruthy();
  });
});

describe("o cabeçalho embrulha quando não cabe", () => {
  /**
   * A linha tem duas coisas — «À escolha do casal» e «N por responder» — e
   * vivia num `flex … justify-between` SEM `flex-wrap`: com um nome comprido, a
   * 375 px os dois lados apertavam-se um contra o outro.
   *
   * E a pergunta não é sobre o ECRÃ. Este cartão vive numa coluna que a barra
   * lateral encolhe sem a janela encolher — um `sm:` respondia à pergunta
   * errada. `flex-wrap` sozinho responde à certa: «cabe nesta caixa?».
   */
  const linhaDoTitulo = () => screen.getByText("À escolha do casal").parentElement!;

  it("os dois lados passam de linha em vez de se apertarem", () => {
    render(<EscolhasDoCasal escolhas={ESCOLHAS} respostas={[]} />);
    const classes = linhaDoTitulo().className.split(/\s+/);
    expect(classes).toContain("flex");
    expect(classes).toContain("flex-wrap");
  });

  it("e embrulha em TODAS as larguras — a decisão é da caixa, não do ecrã", () => {
    render(<EscolhasDoCasal escolhas={ESCOLHAS} respostas={[]} />);
    // Um `sm:flex-wrap` (ou um `lg:flex-nowrap`) seria a mesma medida presa a
    // uma largura de janela que não é a que aperta a linha.
    expect(linhaDoTitulo().className).not.toMatch(/:flex-(wrap|nowrap)\b/);
  });
});

describe("zero rastreio, também deste lado", () => {
  it("não há hora nenhuma no ecrã — só o dia", () => {
    // A hora a que o casal decidiu não é conta nossa.
    const { container } = render(
      <EscolhasDoCasal
        escolhas={ESCOLHAS}
        respostas={[{ escolhaId: "e1", opcaoId: "o1", em: "2026-05-02T23:41:00.000Z" }]}
      />,
    );
    expect(container.textContent).not.toMatch(/\d{2}:\d{2}/);
  });

  it("nem contagem de visitas, nem «viram mas não escolheram»", () => {
    const { container } = render(<EscolhasDoCasal escolhas={ESCOLHAS} respostas={[]} />);
    expect(container.textContent).not.toMatch(/vista|visita|abriu|abriram|vezes/i);
  });
});
