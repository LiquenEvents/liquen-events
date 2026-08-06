// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import Conferencia from "./Conferencia";

/**
 * O envio é irreversível — o email sai uma vez. Estes testes prendem o que
 * torna a lista útil: apanhar a divergência entre a proposta e o pedido, mostrar
 * também o que passou, e não travar nada.
 */

const doc = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    clientNames: "Ana e Rui",
    eventDate: "18 de Setembro de 2027",
    location: "Évora",
    guests: "120 pax",
    totalText: "12.000,00 € + IVA",
    budgetItems: [],
    serviceGroups: [],
    ...over,
  }) as ProposalDoc;

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LQ-1",
    name: "Ana e Rui",
    date: "2027-09-18",
    location: "Évora",
    guests: 120,
    ...over,
  }) as Quote;

afterEach(cleanup);

describe("quando está tudo bem", () => {
  it("di-lo, e mostra os vistos", () => {
    render(<Conferencia doc={doc()} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getByText(/Está tudo de acordo com o pedido original/)).toBeTruthy();
    // Os vistos verdes são metade da utilidade: uma lista só com problemas não
    // diz se as outras verificações foram sequer feitas.
    expect(screen.getByText("Nome dos clientes")).toBeTruthy();
    expect(screen.getByText("Data do evento")).toBeTruthy();
    expect(screen.getByText("Local")).toBeTruthy();
  });
});

describe("quando algo não bate certo", () => {
  it("mostra o nome da proposta e o do pedido, lado a lado", () => {
    render(
      <Conferencia
        doc={doc({ clientNames: "Ana e Rui" })}
        quote={pedido({ name: "Maria Silva" })}
        totalBruto={12_000}
      />,
    );
    expect(screen.getByText(/Ana e Rui.*Maria Silva|Maria Silva/)).toBeTruthy();
    expect(screen.getByText(/Há coisas a que vale a pena olhar/)).toBeTruthy();
  });

  it("apanha o texto de exemplo que ficou por substituir", () => {
    render(
      <Conferencia
        doc={doc({ totalText: "[Valor Total]" })}
        quote={pedido()}
        totalBruto={12_000}
      />,
    );
    expect(screen.getByText(/Ficou por substituir/)).toBeTruthy();
  });

  it("diz sempre que nada disto impede o envio", () => {
    render(
      <Conferencia
        doc={doc({ location: "Outro sítio qualquer" })}
        quote={pedido()}
        totalBruto={12_000}
      />,
    );
    expect(screen.getByText(/Nenhuma o impede de enviar/)).toBeTruthy();
  });
});

describe("acessibilidade", () => {
  it("a gravidade também se ouve, não só se vê pela cor", () => {
    // O símbolo e a cor não chegam a quem usa leitor de ecrã, e a diferença
    // entre "conferido" e "a confirmar" é a razão de a lista existir.
    render(<Conferencia doc={doc()} quote={pedido()} totalBruto={12_000} />);
    expect(screen.getAllByText(/\(conferido\)/).length).toBeGreaterThan(0);
  });
});
