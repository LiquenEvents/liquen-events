import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA TEM DE DIZER DE QUEM SE TRATA, E SE JÁ SEGUIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A conta está em `valores-inflacionados.ts` e tem os seus testes. O que aqui
 * se prende é o que a rota acrescenta à conta, e que é o que faz a lista ser
 * accionável: o NOME dos noivos (um id não diz a ninguém que casamento é), e
 * se a proposta chegou a SAIR — porque é isso que separa «corrige e segue» de
 * «telefona ao casal».
 *
 * E, sobretudo: **não há POST.** Um botão que corrigisse dinheiro já enviado
 * não é uma coisa que devesse existir ao lado de uma lista.
 */

const authed = vi.hoisted(() => ({ ok: true }));
const base = vi.hoisted(() => ({
  pedidos: [] as Record<string, unknown>[],
  propostas: [] as Record<string, unknown>[],
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => authed.ok }));
vi.mock("@/lib/supabase", () => ({ isDatabaseConfigured: () => true }));
vi.mock("@/lib/quotes-store", () => ({ listQuotes: async () => base.pedidos }));
vi.mock("@/lib/proposals-store", () => ({ listAllProposals: async () => base.propostas }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), warn: vi.fn(), info: vi.fn() } }));

import { GET } from "./route";
import * as rota from "./route";

const req = () =>
  new Request("https://liquen.test/api/admin/valores-suspeitos") as unknown as NextRequest;

/** Uma proposta inchada: 3.000 de serviços, 140 de deslocação, total em 3.420. */
const DOC_INCHADO = {
  budgetItems: [{ id: "l1", label: "Decoração" }],
  budgetAmounts: [3000],
  budgetExtras: [{ id: "e1", label: "Deslocação", valueText: "140,00 €" }],
  budgetExtrasSomam: true,
  totalAmount: 3420,
  totalVatMode: "acrescer",
  vatRate: 0.23,
};

beforeEach(() => {
  authed.ok = true;
  base.pedidos = [];
  base.propostas = [];
});

describe("/api/admin/valores-suspeitos", () => {
  it("recusa quem não entrou", async () => {
    authed.ok = false;
    expect((await GET(req())).status).toBe(401);
  });

  it("não tem escrita nenhuma", () => {
    // Escrito como uma afirmação e não como um comentário: o dia em que alguém
    // acrescentar um POST aqui, este teste diz-lhe porque é que não devia.
    expect("POST" in rota).toBe(false);
    expect("PUT" in rota).toBe(false);
    expect("DELETE" in rota).toBe(false);
  });

  it("diz o nome dos noivos e que a proposta já seguiu", async () => {
    base.pedidos = [{ id: "LIQ-7", partnerA: "Ana", partnerB: "João", quotedPrice: 3560 }];
    base.propostas = [
      {
        quoteId: "LIQ-7",
        status: "enviada",
        sentAt: "2026-06-02T09:00:00.000Z",
        createdAt: "2026-06-01T09:00:00.000Z",
        clientName: "Mãe da noiva",
        doc: DOC_INCHADO,
      },
    ];

    const corpo = await (await GET(req())).json();

    expect(corpo.examinadas).toBe(1);
    expect(corpo.suspeitas).toHaveLength(1);
    expect(corpo.suspeitas[0].nome).toBe("Ana e João");
    expect(corpo.suspeitas[0].enviada).toBe(true);
    expect(corpo.suspeitas[0].somasAMais).toBe(3);
    // O que está gravado no pedido viaja tal e qual, para ela poder confirmar.
    expect(corpo.suspeitas[0].noPedido).toBe(3560);
  });

  it("sem noivos, vale quem escreveu o pedido", async () => {
    base.pedidos = [{ id: "LIQ-8", name: "Empresa X" }];
    base.propostas = [
      { quoteId: "LIQ-8", status: "rascunho", createdAt: "2026-06-01", doc: DOC_INCHADO },
    ];

    const corpo = await (await GET(req())).json();

    expect(corpo.suspeitas[0].nome).toBe("Empresa X");
    // Sem `sentAt` não seguiu — mesmo que o estado diga outra coisa.
    expect(corpo.suspeitas[0].enviada).toBe(false);
  });

  /**
   * «Nenhuma» tanto pode ser boa notícia como uma leitura que não leu nada. O
   * número das examinadas é o que separa as duas.
   */
  it("uma proposta de linhas antiga, sem documento, não é examinada", async () => {
    base.pedidos = [{ id: "LIQ-9", name: "Antigo" }];
    base.propostas = [{ quoteId: "LIQ-9", status: "enviada", createdAt: "2024-01-01" }];

    const corpo = await (await GET(req())).json();

    expect(corpo.examinadas).toBe(0);
    expect(corpo.suspeitas).toEqual([]);
  });
});
