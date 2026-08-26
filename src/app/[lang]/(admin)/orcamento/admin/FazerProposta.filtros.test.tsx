// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import FazerProposta from "./FazerProposta";

/**
 * A LISTA DE «PARA QUEM É A PROPOSTA».
 *
 * Três queixas de um telemóvel a 390 px, e um teste por cada uma:
 *
 *  1. os estados e o alerta de data andavam à direita do nome, misturados, e
 *     «Aguardar resposta» encostado à margem lia-se como um botão;
 *  2. «Data ocupada» — a informação com mais dinheiro em jogo — era a etiqueta
 *     mais apagada da lista;
 *  3. novos, enviados e perdidos apareciam todos na mesma lista.
 *
 * O que estes testes prendem é o comportamento, não o desenho: onde é que a
 * etiqueta está NA ORDEM DO CARTÃO, e quem é que a fila de estados deixa ver.
 */

// O estúdio é pesado e não entra em nenhum destes testes (só é desenhado depois
// de escolher o cliente). Fica de fora para o ficheiro correr em milissegundos.
vi.mock("./lazy", () => ({ ProposalStudio: () => null }));

let n = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  n += 1;
  return {
    id: `LQ-${n}`,
    submittedAt: "2026-01-01T10:00:00.000Z",
    lastUpdated: "2026-01-01T10:00:00.000Z",
    status: "pendente" as QuoteStatus,
    name: `Casal ${n}`,
    email: `c${n}@exemplo.pt`,
    phone: "910000000",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Casamento",
    date: "2027-09-18",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 120,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    acceptTerms: true,
    acceptMarketing: false,
    ...over,
  } as Quote;
}

function desenhar(quotes: Quote[]) {
  return render(
    <FazerProposta
      quotes={quotes}
      selectedId={null}
      onSelect={() => {}}
      onNovoPedido={() => {}}
      onSent={() => {}}
      onQuoteUpdated={() => {}}
    />,
  );
}

/** O cartão (o botão) de um pedido, pelo nome do cliente. */
function cartao(nome: string): HTMLElement {
  return screen.getByRole("button", { name: new RegExp(nome) });
}

afterEach(cleanup);

describe("lista de pedidos — as etiquetas", () => {
  it("põe o estado antes do nome, e não ao lado dele", () => {
    desenhar([pedido({ name: "Marta e Gonçalo", status: "em_revisao" })]);

    const texto = cartao("Marta e Gonçalo").textContent ?? "";
    expect(texto.indexOf("Aguardar resposta")).toBeGreaterThanOrEqual(0);
    expect(
      texto.indexOf("Aguardar resposta"),
      "o estado tem de vir antes do nome no cartão",
    ).toBeLessThan(texto.indexOf("Marta e Gonçalo"));
  });

  it("põe «Data ocupada» à frente de tudo, incluindo do estado", () => {
    // Dois eventos no mesmo dia — é o que faz nascer o alerta.
    const quotes = [
      pedido({ name: "Marta e Gonçalo", date: "2027-09-18", status: "pendente" }),
      pedido({ name: "Rita e João", date: "2027-09-18", status: "aceite" }),
    ];
    desenhar(quotes);

    const texto = cartao("Marta e Gonçalo").textContent ?? "";
    expect(texto).toContain("Data ocupada");
    expect(
      texto.indexOf("Data ocupada"),
      "«Data ocupada» é a primeira coisa do cartão",
    ).toBeLessThan(texto.indexOf("Novo"));
    expect(texto.indexOf("Data ocupada")).toBeLessThan(texto.indexOf("Marta e Gonçalo"));
  });

  it("não inventa «Data ocupada» quando as datas não se tocam", () => {
    desenhar([
      pedido({ name: "Marta e Gonçalo", date: "2027-09-18" }),
      pedido({ name: "Rita e João", date: "2027-11-30" }),
    ]);
    expect(cartao("Marta e Gonçalo").textContent).not.toContain("Data ocupada");
  });
});

describe("lista de pedidos — a fila de estados", () => {
  const quotes = () => [
    pedido({ name: "Ana e Pedro", status: "pendente", date: "2027-03-01" }),
    pedido({ name: "Rita e João", status: "cotado", date: "2027-04-01" }),
    pedido({ name: "Sofia e Luís", status: "rejeitado", date: "2027-05-01" }),
  ];

  it("esconde os perdidos por omissão", () => {
    desenhar(quotes());
    expect(screen.getByRole("button", { name: /Ana e Pedro/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Rita e João/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sofia e Luís/ })).toBeNull();
  });

  it("mostra-os quando se toca na pastilha «Perdido»", async () => {
    const u = userEvent.setup();
    desenhar(quotes());
    const fila = screen.getByRole("group", { name: "Filtrar por estado" });
    await u.click(within(fila).getByRole("button", { name: /Perdido/ }));

    expect(screen.getByRole("button", { name: /Sofia e Luís/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ana e Pedro/ })).toBeNull();
  });

  it("conta quantos há em cada estado", () => {
    desenhar([...quotes(), pedido({ name: "Beatriz e Nuno", status: "pendente" })]);
    const fila = screen.getByRole("group", { name: "Filtrar por estado" });
    expect(within(fila).getByRole("button", { name: "Activos · 3" })).toBeTruthy();
    expect(within(fila).getByRole("button", { name: "Novo · 2" })).toBeTruthy();
    expect(within(fila).getByRole("button", { name: "Perdido · 1" })).toBeTruthy();
  });

  it("não mostra a pastilha «Perdido» quando não há nenhum", () => {
    desenhar([pedido({ name: "Ana e Pedro", status: "pendente" })]);
    const fila = screen.getByRole("group", { name: "Filtrar por estado" });
    expect(within(fila).queryByRole("button", { name: /Perdido/ })).toBeNull();
  });

  it("as contagens são do que a procura deixou passar, não da lista toda", async () => {
    const u = userEvent.setup();
    desenhar([
      pedido({ name: "Ana e Pedro", status: "pendente" }),
      pedido({ name: "Beatriz e Nuno", status: "pendente" }),
    ]);
    await u.type(screen.getByRole("searchbox", { name: "Procurar cliente" }), "Ana");

    const fila = screen.getByRole("group", { name: "Filtrar por estado" });
    expect(await within(fila).findByRole("button", { name: "Novo · 1" })).toBeTruthy();
  });

  it("quando o filtro esvazia a lista, não manda criar um cliente que ela já tem", async () => {
    const u = userEvent.setup();
    desenhar([pedido({ name: "Ana e Pedro", status: "pendente" })]);
    const fila = screen.getByRole("group", { name: "Filtrar por estado" });
    await u.click(within(fila).getByRole("button", { name: /^Ganho/ }));

    expect(screen.getByText("Nada neste estado")).toBeTruthy();
    expect(screen.queryByText("Ainda não há pedidos")).toBeNull();
    await u.click(screen.getByRole("button", { name: "Ver os activos" }));
    expect(screen.getByRole("button", { name: /Ana e Pedro/ })).toBeTruthy();
  });
});
