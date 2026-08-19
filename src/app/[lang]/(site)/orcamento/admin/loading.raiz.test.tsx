// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import AdminLoading from "./loading";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESQUELETO TEM DE NASCER ONDE NASCE O QUE VEM A SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `<main>` público tem `pt-24` — 96 px — e o `globals.css` explica, por
 * extenso, porque é que o `padding-top: 0` da classe `admin-mode` saiu de lá
 * para o `className` de CADA raiz do back office: a classe só entra num efeito,
 * portanto o browser desenhava primeiro os 96 px e só depois os tirava, e o
 * back office inteiro saltava para cima. Valia 0,128 de CLS.
 *
 * Esta raiz ficou de fora — e é a PRIMEIRA que alguém vê, antes do painel e
 * antes do ecrã de entrada. MEDIDO a 375×667 num telemóvel:
 *
 *                        cabeçalho do esqueleto   cabeçalho a sério
 *   antes                      y = 96 px                y = 0
 *   depois                     y = 0                    y = 0
 *
 * Não é uma classe decorativa: é a diferença entre a silhueta e a coisa
 * assentarem no mesmo sítio ou o ecrã dar um salto de 96 px à chegada.
 */
describe("o esqueleto do back office", () => {
  afterEach(cleanup);

  it("cancela o `pt-24` do <main> público, como todas as outras raízes", () => {
    render(<AdminLoading />);
    expect(screen.getByRole("status")).toHaveClass("-mt-24");
  });

  it("continua a dizer que está a carregar a quem ouve o ecrã", () => {
    render(<AdminLoading />);
    const regiao = screen.getByRole("status");
    expect(regiao).toHaveAttribute("aria-busy", "true");
    expect(regiao).toHaveTextContent(/A carregar/i);
  });
});
