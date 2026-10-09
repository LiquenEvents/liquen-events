// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A VERSÃO QUE MUDOU DEPOIS DO «SIM» (A6-005).
 *
 * Cabeçalho copiado de `page.test.tsx`, com o estado da versão forçado.
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
  /**
   * O link do casal passou a seguir o PEDIDO e não a linha (ver
   * `proposta-do-link.ts`), portanto a resolução lista as irmãs. Sem este
   * duplo, a chamada rebentava, o `try` do resolvedor engolia a avaria e estes
   * testes passavam a exercitar o caminho de recurso — verdes pela razão
   * errada. Uma lista vazia é o que este ficheiro quer: aqui só há uma
   * proposta, e o que se testa é a página.
   */
  listProposalsForQuote: vi.fn(async () => (db.proposal ? [db.proposal] : [])),
}));
vi.mock("@/lib/contracts-store", () => ({ getAcceptedContractByQuote: async () => null }));
// O estado da versão vem pronto: o que se testa aqui é se a página o DIZ.
const estado = vi.hoisted(() => ({ valor: "em-vigor" as string }));
vi.mock("@/lib/proposta-do-link", async (original) => {
  const real = await original<typeof import("@/lib/proposta-do-link")>();
  return {
    ...real,
    propostaDoLink: async (token: string) => {
      const r = await real.propostaDoLink(token);
      return r ? { ...r, estado: estado.valor } : r;
    },
  };
});
vi.mock("next/image", () => ({ default: () => null }));
// O bloco de resposta é um Client Component com estado próprio e testes seus;
// aqui interessa a página, por isso entra como um marcador.
/**
 * O dicionário do duplo DEPENDE da língua, ao contrário do que estava aqui
 * antes (devolvia sempre o português). Sem isso, um teste sobre «esta página
 * segue a língua da proposta» passava sem a página fazer nada: as duas línguas
 * eram a mesma folha de texto.
 */
vi.mock("@/lib/i18n", () => ({
  normalizeLocale: (l: string) => (l === "en" ? "en" : "pt"),
  htmlLang: (l: string) => (l === "en" ? "en" : "pt-PT"),
  getDictionary: (locale: string) => ({
    proposta:
      locale === "en"
        ? {
            linkInvalidTitle: "Invalid link",
            linkInvalidBody: "…",
            notFoundTitle: "Not found",
            notFoundBody: "…",
            eyebrow: "Proposal",
            greeting: "Hello",
            intro: "…",
            tableDescricao: "Description",
            tableQt: "Qty",
            tableValor: "Amount",
            subtotal: "Subtotal",
            iva: "VAT",
            total: "Total",
            validoAte: "Valid until",
            versaoNumero: "Version",
            atualizadaEm: "Updated on",
            revistaDepoisDeAceite: "This is the version you accepted.",
            verPdf: "View the full proposal (PDF)",
            footerNote: "…",
            respostaComo: "Let us know by email or by phone whether you would like to go ahead.",
            respostaExpirada: "This proposal is past its validity date.",
            dateLocale: "en-GB",
          }
        : {
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
            versaoNumero: "Versão",
            atualizadaEm: "Atualizada a",
            revistaDepoisDeAceite: "Esta é a versão que aceitou.",
            verPdf: "Ver a proposta completa (PDF)",
            footerNote: "…",
            respostaComo: "Diga-nos por e-mail ou por telefone se quer avançar com esta proposta.",
            respostaExpirada: "O prazo de validade desta proposta já passou.",
            dateLocale: "pt-PT",
          },
  }),
}));

import ProposalPage from "./page";

const proposta = {
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
  status: "aceite",
  createdAt: "2026-03-01T09:00:00.000Z",
  validUntil: "2099-12-31",
};

beforeEach(() => {
  db.proposal = proposta;
});
afterEach(cleanup);

describe("a página do casal depois de um aceite", () => {
  it("diz quando há uma versão mais recente do que a aceite", async () => {
    estado.valor = "revista";
    render(await ProposalPage({ params: Promise.resolve({ lang: "pt", token: "bom" }) }));
    expect(screen.getByRole("note").textContent).toContain("Esta é a versão que aceitou.");
  });

  it("e cala-se quando a aceite é a que está em vigor", async () => {
    estado.valor = "em-vigor";
    render(await ProposalPage({ params: Promise.resolve({ lang: "pt", token: "bom" }) }));
    expect(screen.queryByText("Esta é a versão que aceitou.")).toBeNull();
  });
});
