import { describe, it, expect, beforeEach, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { Contract } from "@/lib/contract-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ECRÃ DE ENVIO TEM DE DIZER QUE ESTE PEDIDO JÁ TEM UM SIM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Regra dela, na Fase 2: «se a proposta já foi aceite, o que foi aceite fica
 * congelado e imutável — alterações posteriores geram uma nova versão, que tem
 * de ser aceite de novo».
 *
 * O congelamento está feito no `proposta-do-link.ts`, e cria uma coisa que ela
 * tem de saber ANTES de carregar em enviar: a revisão que está prestes a sair
 * não substitui o que o casal aceitou. Sem o aviso, ela envia a versão 3, o
 * casal abre o link e vê a versão 1 — e ninguém percebe porquê.
 */

const dados = vi.hoisted(() => ({
  contrato: null as Contract | null,
  rebenta: false,
}));

vi.mock("@/lib/admin-auth", () => ({
  isAuthed: () => true,
  /** A assinatura ESCRITA no perfil da conta. Vazio = assina a casa, que é
   *  o comportamento certo sem `ADMIN_USERS` configurado. */
  assinaturaConfigurada: () => ({}),
}));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: async (id: string) => ({ id, name: "Maria", email: "maria@example.com" }),
}));
vi.mock("@/lib/contracts-store", () => ({
  getAcceptedContractByQuote: async () => {
    if (dados.rebenta) throw new Error("base em baixo");
    return dados.contrato;
  },
}));
vi.mock("@/lib/email-quem-assina", () => ({
  nomeDeQuemEnvia: () => "Catarina",
  /** O que o PERFIL da conta diz. O ecrã mostra o nome que vai ser impresso, e
   *  quem o decide é o `assinanteDoEmail` — não o nome cru da sessão. */
  assinaturaDeQuemEnvia: () => ({ nome: "Catarina", cargo: "" }),
}));
vi.mock("@/lib/email-templates-store", () => ({ listarModelos: async () => [] }));
vi.mock("@/lib/email-rascunho-do-envio", () => ({
  valoresDoEnvio: () => ({ cliente_nome: "Maria" }),
  rascunhoDoEnvio: async () => ({
    rascunho: {
      chave: "registo",
      nome: "Registo formal",
      idioma: "pt",
      assunto: "Proposta",
      texto: "Olá Maria,",
      origem: "guardado",
      avisos: ["um aviso que já lá estava"],
    },
    porPreencher: [],
  }),
}));

const { POST } = await import("./route");

const params = Promise.resolve({ id: "q1" });
const pedido = () =>
  new Request("https://liquen.test/api/orcamento/q1/email-rascunho", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ modelo: "registo", idioma: "pt", doc: null }),
  }) as unknown as NextRequest;

const aceite = (numero?: number): Contract =>
  ({
    id: "c1",
    quoteId: "q1",
    proposalId: "p1",
    status: "aceite",
    ...(numero ? { propostaVersaoNumero: numero } : {}),
  }) as Contract;

beforeEach(() => {
  dados.contrato = null;
  dados.rebenta = false;
});

describe("POST /api/orcamento/[id]/email-rascunho — o aviso do aceite", () => {
  it("sem aceite, os avisos ficam exactamente como estavam", async () => {
    const res = await POST(pedido(), { params });
    expect(res.status).toBe(200);
    const dados200 = await res.json();
    expect(dados200.rascunho.avisos).toEqual(["um aviso que já lá estava"]);
  });

  it("com aceite, diz que o casal continua a ver o que aceitou", async () => {
    dados.contrato = aceite(1);
    const res = await POST(pedido(), { params });
    const corpo = await res.json();
    const texto = (corpo.rascunho.avisos as string[]).join(" ");
    // O aviso que já lá estava NÃO é substituído.
    expect(corpo.rascunho.avisos).toContain("um aviso que já lá estava");
    expect(texto).toMatch(/já tem uma proposta ACEITE/);
    expect(texto).toMatch(/a versão 1/);
    expect(texto).toMatch(/continua a ver/);
  });

  it("num contrato sem número de versão gravado, não se inventa nenhum", async () => {
    dados.contrato = aceite();
    const corpo = await (await POST(pedido(), { params })).json();
    const texto = (corpo.rascunho.avisos as string[]).join(" ");
    expect(texto).toMatch(/uma versão anterior/);
    expect(texto).not.toMatch(/versão 0|versão undefined|versão NaN/);
  });

  it("uma leitura que falhe não trava o ecrã onde a proposta é enviada", async () => {
    dados.rebenta = true;
    const res = await POST(pedido(), { params });
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.rascunho.avisos).toEqual(["um aviso que já lá estava"]);
  });
});
