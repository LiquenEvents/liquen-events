// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import { NomesPorArrumar } from "./NomesPorArrumar";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CORRECTOR QUE NUNCA CHEGAVA AOS TEMAS QUE JÁ EXISTIAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «o erro já existia como "Seatting" e mudou de forma — continua
 * por corrigir na origem. Isto tem de ser apanhado automaticamente, não caso a
 * caso.»
 *
 * O corrector sabia a resposta desde sempre. O que faltava era ele passar pelos
 * temas que JÁ existem: a sugestão só aparecia enquanto se escrevia um nome, e
 * um tema baptizado há seis meses nunca mais passa por esse campo.
 */

const tema = (over: Partial<ThemeSummary>): ThemeSummary => ({
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  imageCount: 10,
  ...over,
});

afterEach(cleanup);

describe("os nomes por arrumar", () => {
  it("com a biblioteca em ordem, não se vê nada", () => {
    // A propriedade que faz um aviso valer a pena no dia em que aparecer.
    const { container } = render(
      <NomesPorArrumar
        themes={[tema({}), tema({ id: "t2", name: "Arcos Florais" })]}
        onRenomear={async () => true}
      />,
    );
    expect(container.textContent).toBe("");
  });

  it("apanha o «Seatings Plans» sem ninguém abrir o tema", () => {
    render(
      <NomesPorArrumar
        themes={[tema({}), tema({ id: "t2", name: "Seatings Plans" })]}
        onRenomear={async () => true}
      />,
    );
    expect(screen.getByText(/um nome de tema por arrumar/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Ver e corrigir/ }));
    expect(screen.getByText("Seatings Plans")).toBeTruthy();
    expect(screen.getByText("Seating Plans")).toBeTruthy();
  });

  it("corrigir renomeia mesmo, com o nome arrumado", async () => {
    const renomear = vi.fn(async () => true);
    render(
      <NomesPorArrumar
        themes={[tema({ id: "t2", name: "Seatings Plans" })]}
        onRenomear={renomear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ver e corrigir/ }));
    fireEvent.click(screen.getByRole("button", { name: "Corrigir" }));
    await waitFor(() => expect(renomear).toHaveBeenCalledTimes(1));
    expect(renomear.mock.calls[0][1]).toBe("Seating Plans");
  });

  /**
   * A REGRA DA CASA: PROPÕE, NÃO IMPÕE.
   *
   * Um tema pode chamar-se «lapelas» de propósito, ou levar o nome de um espaço
   * que o dicionário não conhece. Sem esta saída, a lista tornava-se uma
   * reprimenda permanente por causa de dois nomes que ela quer assim.
   */
  it("«Deixar como está» tira a linha sem tocar no tema", () => {
    const renomear = vi.fn(async () => true);
    render(
      <NomesPorArrumar
        themes={[tema({ id: "t2", name: "Seatings Plans" })]}
        onRenomear={renomear}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Ver e corrigir/ }));
    fireEvent.click(screen.getByRole("button", { name: /Deixar como está/ }));
    expect(screen.queryByText(/nome de tema por arrumar/i)).toBeNull();
    expect(renomear).not.toHaveBeenCalled();
  });

  it("conta bem quando são vários", () => {
    render(
      <NomesPorArrumar
        themes={[
          tema({ id: "t1", name: "Seatings Plans" }),
          tema({ id: "t2", name: "cerimonia simbolica" }),
          tema({ id: "t3", name: "Terracotta" }),
        ]}
        onRenomear={async () => true}
      />,
    );
    expect(screen.getByText(/2 nomes de temas por arrumar/i)).toBeTruthy();
  });
});
