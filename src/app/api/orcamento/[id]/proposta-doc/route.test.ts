import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { Proposal } from "@/lib/orcamento/types";
import { splitThirtySeventy } from "@/lib/money";

// ── Mock the auth + data layer + heavy PDF/mail side effects; keep the money
//    math (proposal-doc) and the route logic real ──
const created = vi.hoisted(() => ({ last: null as Proposal | null }));
/** O que o renderizador diz que ficou de fora, por teste: fotos que não
 *  resolveram (`missing`) e conteúdo que o desenho cortou (`truncations`). */
const renderMock = vi.hoisted(() => ({
  missing: 0,
  truncations: [] as { where: string; dropped: number; unit: "fotos" | "linhas" }[],
}));
/** O que foi gravado no pedido (para verificar o "Preço final (sem IVA)"). */
const updated = vi.hoisted(() => ({ last: null as Record<string, unknown> | null }));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => ({ id, email: "cliente@example.com" })),
  updateQuote: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
    updated.last = patch;
  }),
}));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: vi.fn(async (p: Proposal) => {
    created.last = p;
  }),
}));
// The real renderer is server-only + rasterises a PDF; stub it to a byte or two.
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
  // A rota passou a usar a variante que também conta as fotos que não
  // resolveram, para poder avisar antes de a proposta seguir para o cliente.
  renderStoredProposalDocPdfWithReport: vi.fn(async () => ({
    pdf: Buffer.from("%PDF-1.4"),
    missingImages: renderMock.missing,
    truncations: renderMock.truncations,
  })),
}));
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: vi.fn(() => "tok") }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  esc: (v: unknown) => String(v ?? ""),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";

/** Minimal studio doc — only `ref` + `clientNames` are validated by the route;
 *  the money fields under test are added per-case. */
function baseDoc(over: Record<string, unknown> = {}) {
  return {
    template: "decoracao",
    ref: "PO Decoração Teste",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    totalLabel: "Valor Total Decoração",
    totalText: "",
    coverImages: [],
    ...over,
  };
}

function sendReq(doc: Record<string, unknown>): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "send", doc }),
  }) as unknown as NextRequest;
}

function previewReq(doc: Record<string, unknown>): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "preview", doc }),
  }) as unknown as NextRequest;
}

const params = Promise.resolve({ id: "q1" });

beforeEach(() => {
  created.last = null;
  vi.clearAllMocks();
});

describe("POST /api/orcamento/[id]/proposta-doc — money model", () => {
  it('"+ IVA" (acrescer): grosses up the total so total = base × (1 + IVA)', async () => {
    // Structured: 3000 base, IVA acresce.
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.subtotal).toBe(3000); // base
    expect(p.vat).toBe(690); // 3000 × 0.23
    expect(p.total).toBe(3690); // gross = base × 1.23
    // The sinal must be 30% of the GROSS, not of the net.
    expect(splitThirtySeventy(p.total).sinal).toBe(1107); // 3690 × 0.3
  });

  it('"incluido": keeps total = amount and back-derives the base', async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3690, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.total).toBe(3690); // gross unchanged
    expect(p.subtotal).toBe(3000); // 3690 / 1.23
    expect(p.vat).toBe(690);
    expect(splitThirtySeventy(p.total).sinal).toBe(1107);
  });

  it("legacy free-text fallback: detects '+ IVA' in totalText and grosses up", async () => {
    // No structured fields — only the old free-text total with a "+ IVA" note.
    const res = await POST(sendReq(baseDoc({ totalText: "3.000,00 € + IVA" })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.subtotal).toBe(3000);
    expect(p.total).toBe(3690);
  });

  it("legacy free-text without a note is treated as IVA-included", async () => {
    const res = await POST(sendReq(baseDoc({ totalText: "3.690,00 €" })), { params });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.total).toBe(3690);
    expect(p.subtotal).toBe(3000);
  });

  it("sets a default validUntil (~30 days out) when the doc carries no date", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(p.validUntil!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(28);
    expect(days).toBeLessThan(31);
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — fotos em falta no ENVIO", () => {
  /**
   * A contagem nasceu porque a Catarina recebeu um PDF com fotos a menos sem
   * ninguém a avisar. Mas ficou só no caminho da PRÉ-VISUALIZAÇÃO — e os passos
   * do estúdio são clicáveis, portanto dá para ir do Conteúdo direito ao Enviar
   * sem passar por lá. Nesse caminho o número era calculado e deitado fora, ou
   * seja o caso exacto que a magoou continuava possível.
   */
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
  });

  it("o envio devolve a contagem, não só a pré-visualização", async () => {
    renderMock.missing = 3;
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.missingImages).toBe(3);
  });

  it("com tudo resolvido, a contagem vai a zero (e não ausente)", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    // Zero e não `undefined`: o cliente compara com 0, e um campo em falta
    // leria como "não sei" — que é precisamente o estado que se quer eliminar.
    expect(body.missingImages).toBe(0);
    expect(body.ok).toBe(true);
  });

  it("a proposta SEGUE à mesma, mesmo com fotos em falta", async () => {
    // Recusar o envio seria pior: ela fica sem nada e sem perceber porquê. Sai,
    // mas avisada.
    renderMock.missing = 5;
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect(created.last).toBeTruthy();
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — o preço gravado no pedido", () => {
  /**
   * O campo chama-se "Preço final (sem IVA)" no ecrã, quem o escreve à mão
   * escreve-o líquido, e o `contractedAmounts` (dossier.ts) trata-o como
   * líquido: faz `gross = quotedPrice * (1 + taxa)`. Gravar aqui o valor COM
   * IVA punha as três coisas em desacordo e inflacionava a margem do evento em
   * cerca de 23% — o número que ela usa para saber se um casamento deu lucro.
   */
  it("grava o valor SEM IVA, não o valor com IVA", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), {
      params,
    });
    expect(res.status).toBe(200);
    // 3000 + 23% = 3690. O que fica no pedido tem de ser 3000.
    expect(updated.last?.quotedPrice).toBe(3000);
    expect(updated.last?.quotedPrice).not.toBe(3690);
  });

  it("com o total já a incluir IVA, grava na mesma o líquido", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3690, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    expect(updated.last?.quotedPrice).toBe(3000);
  });

  it("o valor gravado bate certo com o subtotal da proposta criada", async () => {
    // As duas coisas são escritas no mesmo pedido a partir da mesma conta; se
    // divergirem, um dos ecrãs mente sobre o mesmo casamento.
    await POST(sendReq(baseDoc({ totalAmount: 4000, totalVatMode: "acrescer" })), { params });
    expect(updated.last?.quotedPrice).toBe(created.last!.subtotal);
  });
});

describe("POST /api/orcamento/[id]/proposta-doc — conteúdo CORTADO pelo desenho", () => {
  /**
   * A outra maneira de o documento seguir incompleto: a foto chegou, foi
   * descarregada com sucesso, e a página não a desenha (a sétima de um mood
   * board, a terceira linha do "Local"). Não pode ficar dentro do servidor: se
   * não sair na resposta, o estúdio não tem como avisar antes do envio.
   */
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
  });

  it("a pré-visualização leva o que foi cortado, com acentos intactos", async () => {
    renderMock.truncations = [{ where: "Mood board «Cerimónia»", dropped: 2, unit: "fotos" }];
    const res = await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const header = res.headers.get("X-Conteudo-Cortado")!;
    expect(JSON.parse(Buffer.from(header, "base64").toString("utf8"))).toEqual(
      renderMock.truncations,
    );
  });

  it("sem cortes, o cabeçalho vai vazio (e não ausente)", async () => {
    const res = await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    const header = res.headers.get("X-Conteudo-Cortado")!;
    expect(JSON.parse(Buffer.from(header, "base64").toString("utf8"))).toEqual([]);
  });

  it("o ENVIO também o devolve — dá para saltar a pré-visualização", async () => {
    renderMock.truncations = [{ where: "Campo «Local»", dropped: 1, unit: "linhas" }];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    expect(body.truncations).toEqual(renderMock.truncations);
  });
});
