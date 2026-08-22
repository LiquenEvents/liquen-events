// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Clientes from "./Clientes";
import { porqueNaoLeu } from "@/lib/porque-nao-leu";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «SEM CLIENTES AINDA» É UMA AFIRMAÇÃO SOBRE A AGENDA DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os clientes deste ecrã formam-se a partir dos pedidos, e os pedidos vêm do
 * desenho do servidor — que, quando a leitura rebenta, devolve uma lista vazia
 * (`getQuotes` em page.tsx engole a falha). Vista daqui, uma base de dados em
 * baixo é indistinguível de uma agenda em branco, e o ecrã escrevia, com toda
 * a confiança, que ela ainda não tem clientes nenhuns.
 *
 * Este ecrã não pode descobrir a diferença sozinho: só quem fez a leitura a
 * sabe. O que ele passa a poder fazer é RECEBÊ-LA e calar a afirmação.
 */

const BASE: Quote = {
  id: "LQ-001",
  name: "Ana Silva",
  email: "ana@exemplo.pt",
  phone: "",
  company: "",
  category: "casamento",
  eventType: "",
  guests: 80,
  date: "",
  status: "pendente",
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as Quote;

afterEach(cleanup);

describe("Clientes — quando a leitura dos pedidos falhou", () => {
  it("não afirma que ainda não há clientes", () => {
    render(
      <Clientes
        quotes={[]}
        onOpen={() => {}}
        falhaDeLeitura={porqueNaoLeu(
          "",
          { status: 500 },
          { error: "Falta correr o db/schema.sql." },
        )}
      />,
    );

    expect(screen.getByText("Não foi possível ler os pedidos")).toBeTruthy();
    // A frase do servidor ganha: é ela que resolve o problema sozinha.
    expect(screen.getByText("Falta correr o db/schema.sql.")).toBeTruthy();
    expect(
      screen.queryByText("Sem clientes ainda"),
      "o ecrã afirmou que não há clientes sem ter conseguido perguntar",
    ).toBeNull();
  });

  it("com a sessão caída não oferece um «Tentar de novo» que não pode funcionar", () => {
    const tentar = vi.fn();
    render(
      <Clientes
        quotes={[]}
        onOpen={() => {}}
        falhaDeLeitura={porqueNaoLeu("", { status: 401 })}
        aoTentarDeNovo={tentar}
      />,
    );

    expect(screen.getByText(/A sessão expirou/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar de novo" })).toBeNull();
  });

  it("numa falha passageira, o botão está lá e volta a pedir", () => {
    const tentar = vi.fn();
    render(
      <Clientes
        quotes={[]}
        onOpen={() => {}}
        falhaDeLeitura={porqueNaoLeu("", null)}
        aoTentarDeNovo={tentar}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Tentar de novo" }));
    expect(tentar).toHaveBeenCalledTimes(1);
  });

  it("sem falha nenhuma, uma agenda em branco continua a dizê-lo", () => {
    render(<Clientes quotes={[]} onOpen={() => {}} />);

    expect(screen.getByText("Sem clientes ainda")).toBeTruthy();
    expect(screen.queryByText("Não foi possível ler os pedidos")).toBeNull();
  });

  it("uma procura sem resultados continua a ser uma procura sem resultados", () => {
    render(<Clientes quotes={[BASE]} onOpen={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText(/Procurar/i), {
      target: { value: "zzz-não-existe" },
    });
    expect(screen.getByText("Nenhum cliente encontrado")).toBeTruthy();
  });
});
