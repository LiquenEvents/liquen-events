// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { getDictionary } from "@/lib/i18n";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS DUAS PÁGINAS QUE O CASAL ABRE — E O IDIOMA NÃO MUDA A PONTUAÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O email diz «24.600,00 €». O casal carrega em «Ver e responder online» e cai
 * numa destas duas páginas. Cada uma tinha a SUA cópia do `Intl` — e uma cópia
 * que recebia o `dateLocale` do dicionário, portanto numa proposta em inglês o
 * mesmo valor saía «€24,600.00».
 *
 * ── PORQUE É QUE O DINHEIRO FICA EM pt-PT NAS DUAS LÍNGUAS ─────────────────
 * Não é preguiça de localização; é a decisão que já se tomou quando se fez a
 * proposta em inglês, e continua a valer por três razões:
 *
 *   1. metade dos valores de uma proposta é TEXTO LIVRE escrito por ela, à
 *      portuguesa. Formatar os nossos à inglesa punha «€24,600.00» ao lado do
 *      «24.600,00 €» dela na mesma folha — e aí a vírgula e o ponto TROCAM DE
 *      PAPEL: um casal inglês pode ler «24.600» como vinte e quatro euros e
 *      sessenta;
 *   2. a FACTURA que se segue é um documento fiscal português e sai em
 *      português. O casal inglês recebe os dois;
 *   3. o PDF da proposta já escreve assim em qualquer idioma. Localizar só as
 *      páginas web punha a página a discordar do PDF que ela transporta — que
 *      é exactamente o defeito que isto veio corrigir.
 *
 * Este ficheiro existe para que ninguém «corrija» isto para `en-GB` a achar que
 * está a melhorar a vida ao cliente inglês.
 *
 * O espaço antes do «€» escreve-se \u00A0 por extenso: é inquebrável, e à letra
 * é indistinguível de um espaço normal.
 */
const EURO = "\u00A0€";

// ── A página da proposta ────────────────────────────────────────────────────
const db = vi.hoisted(() => ({ proposal: null as Record<string, unknown> | null }));

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: vi.fn(() => ({ proposalId: "p1" })),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async () => db.proposal),
  getProposalByQuote: vi.fn(async () => null),
}));
vi.mock("next/image", () => ({ default: () => null }));

import ProposalPage from "./proposta/[token]/page";
import PortalView from "./portal/[token]/PortalView";

/** A proposta de 24 600 €: base 20 000, IVA 4 600 — os três da mesma coluna. */
const proposta = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  quoteId: "LIQ-AAA-1",
  clientName: "Ana Dias",
  clientEmail: "ana@exemplo.pt",
  currency: "EUR",
  lineItems: [{ description: "Decoration", qty: 1, unitPrice: 20000 }],
  vatRate: 0.23,
  subtotal: 20000,
  vat: 4600,
  total: 24600,
  status: "enviada",
  createdAt: "2026-03-01T09:00:00.000Z",
  validUntil: "2099-12-31",
  ...over,
});

beforeEach(() => {
  db.proposal = null;
  vi.clearAllMocks();
});
afterEach(cleanup);

/** Todo o texto da página, numa corda só. */
const naPagina = () => document.body.textContent ?? "";

describe("a página onde o casal responde à proposta", () => {
  it("em INGLÊS escreve o dinheiro à portuguesa — como o PDF que a trouxe", async () => {
    db.proposal = proposta();
    render(await ProposalPage({ params: Promise.resolve({ lang: "en", token: "bom" }) }));
    const texto = naPagina();

    expect(texto).toContain(`24.600,00${EURO}`);
    expect(texto).toContain(`20.000,00${EURO}`);
    expect(texto).toContain(`4.600,00${EURO}`);
    // A forma inglesa não pode aparecer em lado nenhum: aí a vírgula e o ponto
    // trocam de papel, e «24.600» lê-se como vinte e quatro euros e sessenta.
    expect(texto).not.toContain("€24,600.00");
    expect(texto).not.toContain("24,600.00");
    // E o quatro-dígitos deixa de sair sem separador nenhum.
    expect(texto).not.toContain(`4600,00${EURO}`);
  });

  it("em português continua exactamente igual", async () => {
    db.proposal = proposta();
    render(await ProposalPage({ params: Promise.resolve({ lang: "pt", token: "bom" }) }));
    const texto = naPagina();
    expect(texto).toContain(`24.600,00${EURO}`);
    expect(texto).toContain(`4.600,00${EURO}`);
  });

  /** Três dígitos não levam separador — nem em inglês. */
  it("999 € fica sem separador nenhum nas duas línguas", async () => {
    for (const lang of ["en", "pt"]) {
      db.proposal = proposta({
        lineItems: [{ description: "Extra", qty: 1, unitPrice: 999 }],
        subtotal: 999,
        vat: 229.77,
        total: 1228.77,
      });
      render(await ProposalPage({ params: Promise.resolve({ lang, token: "bom" }) }));
      expect(naPagina(), lang).toContain(`999,00${EURO}`);
      expect(naPagina(), lang).toContain(`1.228,77${EURO}`);
      cleanup();
    }
  });
});

// ── O portal do cliente ─────────────────────────────────────────────────────

/** O portal em inglês, com o dicionário a sério — é ele que traz o `en-GB`. */
function portal(over: Record<string, unknown> = {}) {
  const t = getDictionary("en" as Parameters<typeof getDictionary>[0]).portal;
  return (
    <PortalView
      {...({
        t,
        clientName: "Ana Dias",
        eventLabel: "Wedding",
        eventName: "Ana & John",
        eventDate: "2027-05-29",
        location: "Évora",
        proposal: { total: 24600, currency: "EUR", status: "aceite" },
        pdfHref: null,
        contract: null,
        contratoPdfHref: null,
        schedule: { sinal: 7380, saldo: 17220 },
        depositPercent: 30,
        currency: "EUR",
        ...over,
      } as unknown as Parameters<typeof PortalView>[0])}
    />
  );
}

describe("o portal do cliente", () => {
  it("em INGLÊS escreve o dinheiro à portuguesa", () => {
    render(portal());
    const texto = naPagina();

    expect(texto).toContain(`24.600,00${EURO}`);
    // O total, o sinal e o saldo — todos na mesma folha e todos com a mesma
    // pontuação, mesmo com a página em inglês.
    expect(texto).toContain(`7.380,00${EURO}`);
    expect(texto).toContain(`17.220,00${EURO}`);

    expect(texto).not.toContain("€24,600.00");
    expect(texto).not.toContain("24,600.00");
    expect(texto).not.toContain(`7380,00${EURO}`);
  });

  it("999 € continua sem separador", () => {
    render(portal({ proposal: { total: 999, currency: "EUR", status: "aceite" } }));
    const texto = naPagina();
    expect(texto).toContain(`999,00${EURO}`);
    expect(texto).not.toContain(`.999,00${EURO}`);
  });
});

/**
 * A prova de que o dicionário inglês REALMENTE pede `en-GB` — sem isto, os
 * testes acima podiam estar a passar por o duplo do idioma nunca ter mudado, e
 * não por a página ter deixado de perguntar o idioma ao formatar dinheiro.
 */
describe("o dicionário inglês continua a pedir en-GB para as DATAS", () => {
  it("o `dateLocale` do inglês é `en-GB`", () => {
    const en = getDictionary("en" as Parameters<typeof getDictionary>[0]);
    expect(en.proposta.dateLocale).toBe("en-GB");
    expect(en.portal.dateLocale).toBe("en-GB");
  });
});
