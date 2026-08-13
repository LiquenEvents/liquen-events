// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

/**
 * A PÁGINA ONDE O CASAL DECIDE.
 *
 * O PDF da proposta seguia em anexo no email e mais nada: quem arquivasse a
 * mensagem, ou abrisse o link no telemóvel de outra pessoa, tinha de decidir
 * gastar milhares de euros a olhar para um total e um IVA. O botão para rever
 * o documento vive agora aqui — e só pode existir porque o documento passou a
 * ser GUARDADO com a proposta (coluna `proposals.doc`).
 *
 * O que se prende: com documento, o botão aponta para o PDF desta proposta;
 * sem documento (propostas anteriores à coluna, propostas de linhas do back
 * office) a página abre exatamente como abria, sem botão nenhum e sem partir.
 */
const db = vi.hoisted(() => ({ proposal: null as Record<string, unknown> | null }));

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: vi.fn((t: string) => (t === "bom" ? { proposalId: "p1" } : null)),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async () => db.proposal),
}));
vi.mock("next/image", () => ({ default: () => null }));
// O bloco de resposta é um Client Component com estado próprio e testes seus;
// aqui interessa a página, por isso entra como um marcador.
vi.mock("./ProposalResponse", () => ({ default: () => <div data-testid="resposta" /> }));
vi.mock("@/lib/i18n", () => ({
  normalizeLocale: (l: string) => l,
  getDictionary: () => ({
    proposta: {
      linkInvalidTitle: "Link inválido",
      linkInvalidBody: "…",
      notFoundTitle: "Não encontrada",
      notFoundBody: "…",
      eyebrow: "Proposta",
      greeting: "Olá",
      intro: "…",
      tableDescricao: "Descrição",
      tableQt: "Qt",
      tableValor: "Valor",
      subtotal: "Subtotal",
      iva: "IVA",
      total: "Total",
      validoAte: "Válida até",
      verPdf: "Ver a proposta completa (PDF)",
      footerNote: "…",
      dateLocale: "pt-PT",
    },
  }),
}));

import ProposalPage, * as pagina from "./page";

const proposta = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  quoteId: "LIQ-AAA-1",
  clientName: "Ana Dias",
  clientEmail: "ana@exemplo.pt",
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 10000,
  vat: 2300,
  total: 12300,
  status: "enviada",
  createdAt: "2026-03-01T09:00:00.000Z",
  validUntil: "2099-12-31",
  ...over,
});

async function abrir(token = "bom") {
  render(await ProposalPage({ params: Promise.resolve({ lang: "pt", token }) }));
}

beforeEach(() => {
  db.proposal = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

describe("página pública da proposta — o botão do PDF", () => {
  it("mostra o botão quando a proposta tem documento guardado", async () => {
    db.proposal = proposta({ doc: { ref: "PO Decoração" } });
    await abrir();
    const botao = screen.getByRole("link", { name: /proposta completa \(PDF\)/i });
    expect(botao).toHaveAttribute("href", "/api/proposta/bom/pdf");
    // Abre noutro separador: quem está a meio de aceitar não perde a página.
    expect(botao).toHaveAttribute("target", "_blank");
    expect(botao).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("NÃO mostra botão nenhum numa proposta sem documento (as antigas)", async () => {
    db.proposal = proposta();
    await abrir();
    expect(screen.queryByRole("link", { name: /PDF/i })).toBeNull();
    // E a página continua a servir para o que serve: rever o valor e responder.
    expect(screen.getByTestId("resposta")).toBeTruthy();
  });

  it("um token inválido não chega sequer a mostrar uma proposta", async () => {
    await abrir("mau");
    expect(screen.queryByRole("link", { name: /PDF/i })).toBeNull();
    expect(screen.getByText("Link inválido")).toBeTruthy();
  });
});

/**
 * ESTA PÁGINA NÃO PODE SER CONGELADA NUM CACHE.
 *
 * `[token]` não tem `generateStaticParams`, e nada aqui usa uma API de pedido
 * (o idioma vem do segmento da rota, de propósito — ver o cabeçalho de
 * src/proxy.ts). Para o Next isso é uma rota ESTÁTICA: renderiza à primeira
 * visita e guarda o HTML no Full Route Cache, sem revalidação nenhuma, até ao
 * próximo deploy.
 *
 * O que isso fazia, em concreto, com o estado que esta página lê da base de
 * dados a cada visita:
 *
 *   · o casal aceita, volta ao link (reencaminham-no, reabrem-no do email) e
 *     encontra outra vez o formulário de aceitar, como se nada tivesse
 *     acontecido — e o «Já tínhamos registado a sua resposta» nunca aparece;
 *   · a proposta expira ou o estúdio retira-a, e a página continua a oferecer
 *     um aceite que a rota vai recusar com um 409/410;
 *   · a validade (`expired`) é calculada uma única vez, no dia da primeira
 *     visita, e fica congelada nesse dia.
 *
 * `force-dynamic` também é o que põe `Cache-Control: private, no-store` na
 * resposta — numa página cujo URL é a própria credencial, não é detalhe.
 */
describe("página pública da proposta — nunca servida de um cache", () => {
  it("é renderizada a pedido, a cada visita", () => {
    expect((pagina as { dynamic?: string }).dynamic).toBe("force-dynamic");
  });
});
