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
  /** Contagens a devolver POR CHAMADA, para poder testar a segunda tentativa
   *  do envio: a primeira falha, a segunda resolve. Vazio = usa `missing`. */
  sequencia: [] as number[],
  chamadas: 0,
}));
/** O que foi gravado no pedido (para verificar o "Preço final (sem IVA)"), e o
 *  estado em que o pedido está ANTES do envio — a transição decide sobre ele. */
const updated = vi.hoisted(() => ({
  last: null as Record<string, unknown> | null,
  estado: "pendente" as string,
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => true }));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => ({
    id,
    email: "cliente@example.com",
    status: updated.estado,
  })),
  /**
   * A rota grava com `updateQuoteWith` e não com `updateQuote`: a decisão do
   * estado tem de ser tomada sobre o pedido FRESCO, e entre o `getQuote` do
   * princípio e a gravação desenha-se um PDF de uma dúzia de páginas e manda-se
   * um email. O duplo corre a mutação sobre o pedido gravado.
   */
  updateQuoteWith: vi.fn(
    async (id: string, mutar: (q: Record<string, unknown>) => Record<string, unknown>) => {
      updated.last = mutar({ id, email: "cliente@example.com", status: updated.estado });
      return updated.last;
    },
  ),
}));
/** Avaria a injetar na PRIMEIRA gravação (a segunda é sempre aceite). Serve
 *  para retratar uma base onde a coluna `proposals.doc` ainda não existe. */
const store = vi.hoisted(() => ({
  failFirstWith: null as unknown,
  attempts: 0,
  /**
   * O que ficou mesmo GRAVADO, por identificador.
   *
   * O `created.last` só sabe o que foi passado à criação — e o estado de uma
   * proposta deixou de ser decidido aí: nasce «rascunho» e só sobe a «enviada»
   * quando o servidor de correio aceita o email. Sem esta tabela não havia como
   * afirmar em que estado a proposta FICOU, que é a mentira que se está a
   * corrigir.
   */
  linhas: new Map<string, Proposal>(),
}));
vi.mock("@/lib/proposals-store", () => ({
  createProposal: vi.fn(async (p: Proposal) => {
    store.attempts++;
    if (store.attempts === 1 && store.failFirstWith) throw store.failFirstWith;
    created.last = p;
    store.linhas.set(p.id, { ...p });
  }),
  updateProposal: vi.fn(async (id: string, patch: Partial<Proposal>) => {
    const actual = store.linhas.get(id);
    if (!actual) return null;
    const novo = { ...actual, ...patch };
    store.linhas.set(id, novo);
    return novo;
  }),
  listProposalsForQuote: vi.fn(async (quoteId: string) =>
    [...store.linhas.values()]
      .filter((p) => p.quoteId === quoteId)
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
  ),
}));
// The real renderer is server-only + rasterises a PDF; stub it to a byte or two.
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async () => Buffer.from("%PDF-1.4")),
  // A rota passou a usar a variante que também conta as fotos que não
  // resolveram, para poder avisar antes de a proposta seguir para o cliente.
  renderStoredProposalDocPdfWithReport: vi.fn(async () => {
    const i = renderMock.chamadas++;
    return {
      pdf: Buffer.from("%PDF-1.4"),
      missingImages: renderMock.sequencia.length
        ? (renderMock.sequencia[i] ?? 0)
        : renderMock.missing,
      truncations: renderMock.truncations,
    };
  }),
}));
/**
 * O modelo «proposta-enviada» que ela tem GUARDADO — `null` por omissão, que é
 * o estado de quem nunca abriu o ecrã «Modelos de email»: aí sai o texto da
 * casa, exactamente como sempre saiu. Só o `getTemplate` é duplo; o
 * `renderTemplate` e as sementes são os verdadeiros.
 */
const modelo = vi.hoisted(() => ({ get: vi.fn(async (_chave: string) => null as unknown) }));
vi.mock("@/lib/email-templates-store", async (original) => {
  const real = await original<typeof import("@/lib/email-templates-store")>();
  return { ...real, getTemplate: modelo.get };
});
vi.mock("@/lib/proposal-token", () => ({ createProposalToken: vi.fn(() => "tok") }));
vi.mock("@/lib/mail", () => ({
  sendMail: vi.fn(async () => ({ sent: true })),
  // O `esc` do duplo escapa MESMO, como o verdadeiro (`src/lib/mail.ts`). Era
  // a identidade, e com ela nenhum teste conseguia ver a diferença entre um
  // texto escapado e um texto cru — que é precisamente o que a mensagem
  // pessoal (escrita à mão, com `<` e `&` lá dentro) obriga a garantir.
  esc: (v: unknown) =>
    String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;"),
  MAIL_TO: "team@example.com",
}));

import { POST } from "./route";
import { sendMail } from "@/lib/mail";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";
import { createProposal } from "@/lib/proposals-store";

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

/**
 * Um pedido com o corpo escrito à mão — é preciso poder pôr no `idioma` coisas
 * que o tipo não deixa escrever (um `"fr"`, um número, um `null`), porque é
 * exactamente disso que a rota se tem de defender.
 */
function req(corpo: Record<string, unknown>): NextRequest {
  return new Request("https://liquen.test/api/orcamento/q1/proposta-doc", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  }) as unknown as NextRequest;
}

const params = Promise.resolve({ id: "q1" });

beforeEach(() => {
  created.last = null;
  updated.last = null;
  updated.estado = "pendente";
  store.failFirstWith = null;
  store.attempts = 0;
  store.linhas.clear();
  vi.clearAllMocks();
  modelo.get.mockResolvedValue(null);
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

  // 60 dias e não 30: é o que a proposta que a Líquen fazia à mão dizia, e foi
  // a decisão dela quando as duas se contradisseram. Ver `DEFAULT_VALID_DAYS`.
  it("sets a default validUntil (~60 days out) when the doc carries no date", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "incluido" })), {
      params,
    });
    expect(res.status).toBe(200);
    const p = created.last!;
    expect(p.validUntil).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const days = (Date.parse(p.validUntil!) - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(58);
    expect(days).toBeLessThan(61);
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
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
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

// ── O DOCUMENTO fica GUARDADO com a proposta ─────────────────────────────────
//
// Durante muito tempo não ficava: a proposta era gravada sem o `doc` e o
// documento morria com o pedido HTTP. O cliente recebia o PDF por email e, na
// página onde tinha de decidir, não havia botão nenhum para o rever (a página
// só o mostra quando há `doc`); reabrir a proposta no estúdio dava uma folha
// em branco. Estes testes guardam esse comportamento.
describe("POST /api/orcamento/[id]/proposta-doc — o documento fica guardado", () => {
  it("grava o `doc` com os CAMINHOS das fotos (é o que serve o PDF do link do cliente)", async () => {
    const doc = baseDoc({
      totalAmount: 3000,
      moodBoards: [{ title: "Cerimónia", images: ["q1/foto-1.jpg"] }],
      coverImages: ["q1/capa.jpg", ""],
    });
    const res = await POST(sendReq(doc), { params });
    expect(res.status).toBe(200);
    const guardado = created.last!;
    expect(guardado.doc).toBeTruthy();
    expect(guardado.doc!.ref).toBe("PO Decoração Teste");
    expect(guardado.doc!.moodBoards[0].images).toEqual(["q1/foto-1.jpg"]);
    expect(guardado.doc!.coverImages).toEqual(["q1/capa.jpg", ""]);
    // O texto fixo do estúdio também: é o que o PDF reimprime tal e qual.
    expect(guardado.doc!.condicoesGerais.length).toBeGreaterThan(0);
  });

  it("recusa (413) um documento acima do teto, sem sequer desenhar o PDF", async () => {
    // 512 KB (MAX_PROPOSAL_DOC_BYTES). Um `ProposalDoc` real são ~13 KB, e
    // 18,5 KB no tecto de fotos — isto só acontece com um cliente avariado ou
    // com bytes de imagem enfiados onde deviam estar caminhos.
    const enorme = baseDoc({ totalAmount: 3000, budgetItems: ["x".repeat(600 * 1024)] });
    const res = await POST(sendReq(enorme), { params });
    expect(res.status).toBe(413);
    expect(created.last).toBeNull();
    expect(renderStoredProposalDocPdfWithReport).not.toHaveBeenCalled();
  });

  it("uma base sem a coluna `doc` guarda a proposta na mesma, e diz o que faltou", async () => {
    // O caso de quem publica o código antes de correr o db/schema.sql. Uma
    // proposta por enviar é um negócio parado; sem o documento é só um botão a
    // menos. Grava-se sem ele e devolve-se o motivo pelo nome.
    store.failFirstWith = {
      code: "42703",
      message: 'column "doc" of relation "proposals" does not exist',
    };
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.docSaved).toBe(false);
    expect(body.docError).toContain("db/schema.sql");
    // A proposta ficou mesmo guardada — sem documento, como antes desta coluna.
    expect(created.last).not.toBeNull();
    expect(created.last!.doc).toBeUndefined();
  });

  it("uma avaria QUALQUER a gravar continua a ser 503 (não se inventa um caminho alternativo)", async () => {
    store.failFirstWith = new Error("ligação perdida");
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(503);
    expect(created.last).toBeNull();
  });

  it("numa gravação normal a resposta NÃO leva `docSaved` (só o que falha sai pelo nome)", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const body = await res.json();
    expect("docSaved" in body).toBe(false);
    expect("docError" in body).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SEGUNDA TENTATIVA ANTES DE UMA PROPOSTA SEGUIR COM BURACOS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A causa mais comum de uma foto não resolver é passageira: um pedido ao
 * armazenamento que expirou, uma ligação que caiu a meio de oitenta. O envio
 * desenhava UMA vez e mandava o que saísse.
 *
 * Isto NÃO recusa o envio — essa decisão está tomada noutro sentido, e com
 * razão escrita («recusar seria pior: ela fica sem nada e sem perceber
 * porquê»). O que faz é dar à proposta a segunda hipótese que quase sempre
 * basta.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a segunda tentativa do envio", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
  });

  it("uma falha passageira é apanhada: a segunda tentativa resolve", async () => {
    renderMock.sequencia = [2, 0];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(2);
    // A proposta que seguiu é a SEGUNDA, a que está completa.
    expect(body.missingImages).toBe(0);
  });

  it("com tudo resolvido à primeira NÃO se desenha duas vezes", async () => {
    // Repetir sempre seria pagar o desenho a dobrar em todos os envios bons.
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(1);
  });

  it("se a segunda correr PIOR, fica-se com a primeira", async () => {
    // Repetir nunca pode deixar a proposta pior do que estava.
    renderMock.sequencia = [1, 4];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect((await res.json()).missingImages).toBe(1);
  });

  it("e continua a seguir, mesmo quando as duas falham", async () => {
    // A decisão de produto mantém-se: sai, mas avisada.
    renderMock.sequencia = [3, 3];
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).missingImages).toBe(3);
    expect(created.last).toBeTruthy();
  });

  it("a pré-visualização não repete — é onde ela DESCOBRE o que falta", async () => {
    renderMock.missing = 2;
    const res = await POST(previewReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.headers.get("X-Fotos-Em-Falta")).toBe("2");
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(1);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA COLUNA QUE FALTA NÃO PODE PARAR O NEGÓCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «detetámos que não dá para mandar a proposta para o cliente».
 *
 * O `db/schema.sql` é corrido À MÃO. Numa base onde a versão nova ainda não foi
 * aplicada, as colunas novas não existem — e o envio passou a escrever SEMPRE o
 * selo do documento (`pdf_sha256`, `pdf_bytes`). O resgate que existia tirava só
 * o `doc`, portanto a segunda tentativa levava o selo na mesma, rebentava pela
 * mesma razão, e a resposta era 503. Tentar outra vez nunca resolvia.
 *
 * A pré-visualização continuava perfeita — devolve o PDF antes de chegar à
 * gravação. O documento via-se, o envio é que nunca ia.
 *
 * ── PORQUE É QUE OS TESTES NÃO APANHARAM ISTO ────────────────────────────
 *
 * Porque o duplo da loja falhava só na PRIMEIRA tentativa, fosse o que fosse
 * que a segunda levasse. Aqui o duplo falha pela razão VERDADEIRA — a coluna
 * não existe — e portanto falha as vezes que forem precisas até o código
 * deixar de a escrever.
 */
describe("POST /api/orcamento/[id]/proposta-doc — uma base sem as colunas novas", () => {
  /** O erro que o PostgREST devolve quando a coluna não existe. */
  const semColuna = (coluna: string) =>
    Object.assign(new Error(`Could not find the '${coluna}' column of 'proposals'`), {
      code: "PGRST204",
    });

  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
    store.failFirstWith = null;
    store.attempts = 0;
    created.last = null;
  });

  it("a proposta SEGUE — sem o documento e sem o selo, mas segue", async () => {
    // Falha sempre que a gravação levar um campo que a base não conhece.
    const real = vi.mocked(createProposal);
    real.mockImplementation(async (p: Proposal) => {
      if (p.doc !== undefined) throw semColuna("doc");
      if (p.pdfSha256 !== undefined) throw semColuna("pdf_sha256");
      if (p.pdfBytes !== undefined) throw semColuna("pdf_bytes");
      created.last = p;
    });

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status, "o envio não pode morrer por causa de uma coluna").toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // A proposta ficou gravada, sem os campos que a base não aceita.
    expect(created.last).toBeTruthy();
    expect(created.last!.doc).toBeUndefined();
    expect(created.last!.pdfSha256).toBeUndefined();
    expect(created.last!.pdfBytes).toBeUndefined();
    // E o email seguiu na mesma.
    expect(body.emailed).toBe(true);
  });

  it("e diz o que se perdeu, com o nome do que é preciso correr", async () => {
    const real = vi.mocked(createProposal);
    real.mockImplementation(async (p: Proposal) => {
      if (p.doc !== undefined || p.pdfSha256 !== undefined) throw semColuna("pdf_sha256");
      created.last = p;
    });
    const body = await (await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params })).json();
    expect(body.docError, "tem de nomear o ficheiro a correr").toMatch(/db\/schema\.sql/);
    expect(body.docSaved).toBe(false);
  });

  /** Quando a base recusa mesmo o mínimo, aí sim é 503 — mas a frase deixa de
   *  mandar «tentar outra vez», que é o que nunca resolvia. */
  it("uma base que recusa tudo dá 503, e a frase diz onde procurar", async () => {
    vi.mocked(createProposal).mockImplementation(async () => {
      throw semColuna("client_name");
    });
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/db\/schema\.sql/);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * REENVIAR UMA PROPOSTA NÃO DESFAZ UM NEGÓCIO GANHO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * A rota escrevia `status: "cotado"` a seco. Rever a proposta DEPOIS do aceite
 * é coisa que acontece a sério — o cálculo do saldo (faturas/[id]) tem uma nota
 * inteira sobre isso — e bastava reenviar o documento com uma linha corrigida
 * para o casamento fechado voltar a «Proposta enviada» no quadro, com o sinal
 * já emitido e pago. Um estado que anda para trás sozinho é a maneira mais
 * rápida de ela deixar de confiar na coluna.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o estado nunca anda para trás", () => {
  // O bloco anterior deixa `createProposal` a atirar (retrata uma base sem as
  // colunas novas) e `mockImplementation` sobrevive ao `clearAllMocks`. Aqui a
  // gravação tem de correr bem, senão a rota nunca chega a tocar no pedido.
  beforeEach(() => {
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
    });
  });

  it("um pedido novo passa a «Proposta enviada»", async () => {
    updated.estado = "pendente";
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    expect(updated.last).toMatchObject({ status: "cotado", quotedPrice: 3000 });
  });

  it("um pedido já ganho fica ganho — mas o preço novo grava-se na mesma", async () => {
    updated.estado = "aceite";
    await POST(sendReq(baseDoc({ totalAmount: 5000, totalVatMode: "acrescer" })), { params });
    expect(updated.last).toMatchObject({ status: "aceite", quotedPrice: 5000 });
    // Sem transição não se escreve linha nenhuma: uma entrada «Ganho → Ganho»
    // seria ruído a esconder o que interessa numa lista que já é longa.
    expect(updated.last).not.toHaveProperty("activityLog");
  });

  it("deixa no histórico a linha que explica a mudança automática", async () => {
    updated.estado = "pendente";
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    const log = (updated.last?.activityLog ?? []) as { actor?: string; summary: string }[];
    expect(log).toHaveLength(1);
    expect(log[0].actor).toBe("Sistema");
    expect(log[0].summary).toContain("Proposta enviada");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: preparar a proposta em português e, ao gerar, poder escolher que
 * o PDF saia em inglês. A língua é um parâmetro de DESENHO — entra no pedido,
 * nunca no documento guardado (ver o cabeçalho de `proposal-doc-textos`).
 *
 * O que estes testes guardam, por esta ordem de importância:
 *
 *  1. Um pedido SEM o campo tem de sair exactamente como saía. É todo o código
 *     que existia antes desta funcionalidade — e uma proposta antiga, reaberta.
 *  2. Um valor que não é uma língua NÃO deita a geração abaixo: cai no
 *     português. Este ficheiro existe por causa de «não dá para mandar a
 *     proposta para o cliente»; uma moldura por traduzir nunca vale um 400.
 *  3. O que vai ao gerador é o que veio no pedido, e nada mais.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a língua com que se desenha", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
    // Os blocos acima deixam `createProposal` a atirar, e `mockImplementation`
    // sobrevive ao `clearAllMocks`.
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
    });
  });

  /**
   * A língua com que o gerador foi chamado à `n`-ésima vez.
   *
   * Lê os argumentos como `unknown[]` de propósito: a assinatura do gerador
   * está a ganhar o segundo parâmetro no módulo ao lado, e este teste não pode
   * depender de qual das duas versões está no disco — o que ele guarda é que a
   * rota PASSA a língua, não a forma exacta do tipo.
   */
  function idiomaDaChamada(n = 0): unknown {
    const chamada = vi.mocked(renderStoredProposalDocPdfWithReport).mock.calls[n] as unknown[];
    const segundo = chamada?.[1];
    // Aceita as duas formas — `(doc, "en")` e `(doc, { idioma: "en" })` — porque
    // o que este teste guarda é que a rota PASSA a língua, não a forma exacta
    // com que o módulo ao lado a recebe.
    return typeof segundo === "string" ? segundo : (segundo as { idioma?: unknown })?.idioma;
  }

  it("com «en», é em inglês que o documento é desenhado", async () => {
    const res = await POST(req({ mode: "preview", idioma: "en", doc: baseDoc() }), { params });
    expect(res.status).toBe(200);
    expect(idiomaDaChamada()).toBe("en");
  });

  it("sem o campo, é português — o caminho de sempre não muda", async () => {
    const res = await POST(previewReq(baseDoc()), { params });
    expect(res.status).toBe(200);
    expect(idiomaDaChamada()).toBe("pt");
    // E o resto da resposta continua a ser o que era.
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("X-Fotos-Em-Falta")).toBe("0");
  });

  it("com «pt» explícito dá exactamente o mesmo que sem o campo", async () => {
    // É o que o botão manda no caminho por omissão: dizer a escolha em vez de a
    // deixar implícita na ausência do campo.
    const comCampo = await POST(req({ mode: "preview", idioma: "pt", doc: baseDoc() }), { params });
    expect(idiomaDaChamada()).toBe("pt");
    expect(comCampo.headers.get("Content-Disposition")).toBe(
      'inline; filename="proposta-preview.pdf"',
    );
  });

  /**
   * ── PORQUE É QUE ISTO NÃO É UM 400 ────────────────────────────────────────
   *
   * Cair em português é cair na língua em que a proposta foi ESCRITA: no pior
   * caso a moldura fica por traduzir, o que é o documento que sempre saiu, e ela
   * vê-o no PDF que abre a seguir. Recusar transformava o engano de um cliente
   * numa proposta que não sai — a avaria que o cabeçalho da rota conta.
   *
   * Não é silêncio: a rota regista o valor que recebeu, senão um cliente
   * avariado ficava escondido para sempre.
   */
  it.each([["fr"], [""], ["PT"], ["en-GB"]])(
    "um idioma que não existe (%j) cai no português em vez de recusar",
    async (mau) => {
      const res = await POST(req({ mode: "preview", idioma: mau, doc: baseDoc() }), { params });
      expect(res.status).toBe(200);
      expect(idiomaDaChamada()).toBe("pt");
    },
  );

  it.each([[42], [null], [{ idioma: "en" }], [["en"]]])(
    "e o mesmo quando nem sequer é texto (%j)",
    async (lixo) => {
      const res = await POST(req({ mode: "preview", idioma: lixo, doc: baseDoc() }), { params });
      expect(res.status).toBe(200);
      expect(idiomaDaChamada()).toBe("pt");
    },
  );

  it("o nome do ficheiro da pré-visualização segue a língua", async () => {
    // Duas versões da mesma proposta na pasta de transferências têm de se
    // distinguir sem as abrir.
    const en = await POST(req({ mode: "preview", idioma: "en", doc: baseDoc() }), { params });
    expect(en.headers.get("Content-Disposition")).toBe('inline; filename="proposal-preview.pdf"');
    const pt = await POST(previewReq(baseDoc()), { params });
    expect(pt.headers.get("Content-Disposition")).toBe('inline; filename="proposta-preview.pdf"');
  });

  it("a segunda tentativa do envio repete na MESMA língua", async () => {
    // Repetir é para apanhar uma foto que não resolveu. Se a repetição mudasse
    // de língua, o casal recebia a versão que ninguém escolheu — e só na vez em
    // que alguma coisa correu mal, que é quando ninguém está a olhar.
    renderMock.sequencia = [2, 0];
    const res = await POST(
      req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }),
      {
        params,
      },
    );
    expect(res.status).toBe(200);
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(2);
    expect(idiomaDaChamada(0)).toBe("en");
    expect(idiomaDaChamada(1)).toBe("en");
  });

  /**
   * A LÍNGUA DEIXOU DE MORRER NO FIM DO PEDIDO.
   *
   * Era este o defeito de fundo: a língua desenhava o PDF, nomeava o ficheiro e
   * desaparecia. Tudo o que vinha a seguir — o email que a transportava, a
   * página do aceite, o portal, a segunda descarga — não tinha como saber em
   * que língua a proposta tinha sido feita, e caía em português.
   */
  it("o envio GRAVA a língua na proposta", async () => {
    const res = await POST(
      req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }),
      {
        params,
      },
    );
    expect(res.status).toBe(200);
    expect(idiomaDaChamada()).toBe("en");
    expect(created.last!.idioma).toBe("en");
  });

  it("mas o DOCUMENTO guardado continua a ser um só, sem língua colada", async () => {
    // O que fica no `doc` é o que ela escreveu, em português. A língua é a
    // moldura com que foi desenhado, e vive ao lado — duas cópias do mesmo
    // documento em duas línguas eram duas coisas para manter coerentes.
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    expect(created.last!.doc).toBeTruthy();
    expect(created.last!.doc).not.toHaveProperty("idioma");
  });

  it("sem língua no pedido grava-se «pt» — que é a língua com que se desenhou", async () => {
    // Não se deixa o campo em branco: a proposta FOI desenhada em português, e
    // isso é um facto sobre o PDF que o casal recebeu. Quem lê propostas
    // antigas (sem coluna nenhuma) já sabe que a ausência é português; nas
    // novas não há razão para deixar a pergunta por responder.
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(created.last!.idioma).toBe("pt");
  });

  it("a pré-visualização não grava nada — não há proposta nenhuma", async () => {
    await POST(req({ mode: "preview", idioma: "en", doc: baseDoc() }), { params });
    expect(created.last).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE LEVA A PROPOSTA FALA A LÍNGUA DELA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: as propostas têm de poder ser feitas e traduzidas «de uma
 * forma espetacularmente bem». Um PDF inglês dentro de um email português não
 * é isso: o casal inglês recebia «A sua proposta — Líquen Events», «Segue em
 * anexo…» e um botão «Ver a proposta →» para chegar a um documento
 * que percebia.
 *
 * O que este bloco guarda: o inglês é inglês do assunto ao nome do anexo, e o
 * PORTUGUÊS NÃO MUDA UMA VÍRGULA.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o email sai na língua da proposta", () => {
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as {
      subject: string;
      html: string;
      text: string;
      attachments?: { filename: string }[];
    };

  beforeEach(() => {
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
  });

  it("proposta inglesa: assunto, cumprimento, frase e botão em inglês", async () => {
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const email = enviado();
    expect(email.subject).toBe("Proposal for your event — Líquen Events");
    expect(email.html).toContain("Your proposal — Líquen Events");
    expect(email.html).toContain("Hello Maria &amp; Zé,");
    expect(email.html).toContain("Please find attached the proposal");
    expect(email.html).toContain("View the proposal");
    expect(email.text).toContain("View online:");
    // E não sobra uma palavra portuguesa do corpo antigo.
    expect(email.html).not.toContain("Olá Maria");
    expect(email.html).not.toContain("Segue em anexo");
    expect(email.text).not.toContain("Segue em anexo");
  });

  it("proposta inglesa: o anexo chama-se Proposal-… e não Proposta-…", async () => {
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const pdf = enviado().attachments?.find((a) => a.filename.endsWith(".pdf"));
    expect(pdf?.filename).toBe("Proposal-Liquen-q1.pdf");
  });

  it("proposta portuguesa: o email de sempre, palavra por palavra", async () => {
    await POST(req({ mode: "send", idioma: "pt", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const email = enviado();
    expect(email.subject).toBe("Proposta para o seu evento — Líquen Events");
    expect(email.html).toContain("A sua proposta — Líquen Events");
    expect(email.html).toContain("Olá Maria &amp; Zé,");
    expect(email.html).toContain("Segue em anexo a proposta personalizada para o seu evento.");
    expect(email.html).toContain("Ver a proposta");
    expect(enviado().attachments?.find((a) => a.filename.endsWith(".pdf"))?.filename).toBe(
      "Proposta-Liquen-q1.pdf",
    );
  });

  it("sem língua no pedido (o caminho de sempre) o email continua português", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().subject).toBe("Proposta para o seu evento — Líquen Events");
    expect(enviado().html).toContain("Segue em anexo a proposta personalizada");
  });

  /**
   * ── A ASSINATURA DA CASA NÃO SE TRADUZ, E NÃO É ESQUECIMENTO ─────────────
   *
   * Lida linha a linha (`email-assinatura.ts`), a assinatura não tem uma única
   * frase portuguesa: é o NOME dela, o cargo («Manager», que já é inglês), o
   * telefone, o email, o endereço do site e os nomes das redes. Não há ali
   * nenhum «Com os melhores cumprimentos» a traduzir — o fecho do email é o
   * bloco de contactos, e um bloco de contactos é o mesmo em qualquer língua.
   *
   * Por isso o email inglês leva a assinatura EXACTAMENTE como o português. É
   * também a decisão que não mexe nos outros cinco caminhos que a usam.
   */
  it("a assinatura da casa vai igual nas duas línguas", async () => {
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const em = enviado();
    expect(em.html).toContain("Catarina Gaspar");
    expect(em.html).toContain("Manager");
    expect(em.html).toContain("+351 919 259 820");
    expect(em.text).toContain("Catarina Gaspar");
  });

  it("a mensagem pessoal dela entra no email inglês tal e qual a escreveu", async () => {
    // O que ela escreve é dela e não se traduz — é a mesma regra do documento,
    // onde os títulos e as legendas saem como foram escritos.
    await POST(
      req({
        mode: "send",
        idioma: "en",
        doc: baseDoc({ totalAmount: 3000 }),
        mensagem: "It was a pleasure meeting you at the estate.",
      }),
      { params },
    );
    const em = enviado();
    expect(em.html).toContain("It was a pleasure meeting you at the estate.");
    expect(em.html).toContain("Please find attached the proposal");
    expect(em.text).toContain("It was a pleasure meeting you at the estate.");
  });

  /**
   * ── O MODELO EDITÁVEL DELA E UMA PROPOSTA INGLESA ────────────────────────
   *
   * O modelo «Proposta enviada» é UM texto, escrito por ela, em português — o
   * ecrã «Modelos de email» não tem versão inglesa nenhuma. Debaixo de uma
   * proposta inglesa, usá-lo era mandar o assunto e o corpo em português com um
   * PDF inglês em anexo: o defeito que se está a corrigir, pela porta do lado.
   *
   * Fica de fora, e sai o texto da casa em inglês — o MESMO recurso que a rota
   * já usa quando o modelo está vazio ou tem um marcador sem valor. Numa
   * proposta portuguesa não muda nada: o modelo dela continua a ser o que sai.
   */
  it("o modelo português dela não sai por baixo de uma proposta inglesa", async () => {
    modelo.get.mockResolvedValue({
      key: "proposta-enviada",
      name: "Proposta enviada",
      subject: "A sua proposta | Líquen",
      body: `<p>Olá {nome}, está pronta.</p>`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await POST(req({ mode: "send", idioma: "en", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    const em = enviado();
    expect(em.html).not.toContain("está pronta.");
    expect(em.subject).toBe("Proposal for your event — Líquen Events");
    expect(em.html).toContain("Please find attached the proposal");
  });

  it("e continua a sair numa proposta portuguesa", async () => {
    modelo.get.mockResolvedValue({
      key: "proposta-enviada",
      name: "Proposta enviada",
      subject: "A sua proposta | Líquen",
      body: `<p>Olá {nome}, está pronta.</p>`,
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    await POST(req({ mode: "send", idioma: "pt", doc: baseDoc({ totalAmount: 3000 }) }), {
      params,
    });
    expect(enviado().subject).toBe("A sua proposta | Líquen");
    expect(enviado().html).toContain("Olá Maria &amp; Zé, está pronta.");
  });
});

/**
 * O envio da proposta do estúdio é o irmão do `/proposta` e tinha o MESMO
 * rodapé escrito à mão. Passa pela assinatura única, com o PDF intacto.
 */
describe("POST /api/orcamento/[id]/proposta-doc — assinatura", () => {
  it("assina o email da proposta e mantém o PDF em anexo", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    const env = vi.mocked(sendMail).mock.calls.at(-1)![0];
    expect(env.html).toContain("Catarina Gaspar");
    expect(env.html).toContain("Manager");
    expect(env.html).toContain("+351 919 259 820");
    expect(env.text).toContain("Catarina Gaspar");
    expect(env.text).toContain("+351 919 259 820");
    expect(env.attachments?.some((a) => a.cid === "liquen-logo")).toBe(true);
    expect(env.attachments?.some((a) => a.filename.endsWith(".pdf"))).toBe(true);
    expect(env.html).not.toMatch(/<img[^>]+src="https?:/);
    expect(env.html).not.toContain("Líquen Events · ");
  });

  /**
   * O mesmo assunto da rota irmã, e pela mesma razão: `proposal.id.slice(0, 8)`
   * punha oito caracteres de um `randomUUID()` na caixa de correio do casal —
   * uma referência que não é a da casa (`LIQ-…`), que ninguém sabe ler, e que
   * num telemóvel rouba os caracteres do assunto que ainda se veem.
   */
  it("não põe o identificador interno da proposta no assunto", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });
    const env = vi.mocked(sendMail).mock.calls.at(-1)![0];
    expect(env.subject).toBe("Proposta para o seu evento — Líquen Events");
    expect(env.subject).not.toMatch(/[0-9a-f]{8}/i);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * A MENSAGEM QUE ELA ESCREVE E QUE SEGUE COM A PROPOSTA
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando eu vou enviar a proposta, quero que também dê para
 * enviar uma mensagem juntamente com a proposta». O email levava uma frase fixa
 * e mais nada, e ela não tinha por onde escrever ao casal — a nota pessoal ia
 * num segundo email, à mão, ou não ia.
 *
 * O que estes testes prendem é a ORDEM (o que ela escreveu primeiro, a frase da
 * casa depois), a segurança do texto dela em HTML, e a promessa de que uma
 * caixa vazia deixa o email exactamente como ele sempre foi.
 */
describe("POST /api/orcamento/[id]/proposta-doc — a mensagem pessoal", () => {
  /** O último email enviado, nas suas duas versões. */
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as { html: string; text: string };

  function envioCom(mensagem: unknown): NextRequest {
    return req({ mode: "send", doc: baseDoc({ totalAmount: 3000 }), mensagem });
  }

  it("põe a mensagem dela ANTES da frase da casa e do botão", async () => {
    await POST(envioCom("Foi um gosto conhecer-vos na quinta."), { params });
    const { html, text } = enviado();
    const dela = html.indexOf("Foi um gosto conhecer-vos na quinta.");
    expect(dela, "a mensagem dela nem sequer entrou no email").toBeGreaterThan(-1);
    // Depois do olá, antes da moldura: o que é dela é o que se lê primeiro.
    expect(dela).toBeGreaterThan(html.indexOf("Olá "));
    expect(dela).toBeLessThan(html.indexOf("Segue em anexo"));
    expect(dela).toBeLessThan(html.indexOf("Ver a proposta"));
    // A versão em texto conta a mesma história pela mesma ordem — duas
    // alternativas que divergem são, por si só, um sinal de spam.
    const noTexto = text.indexOf("Foi um gosto conhecer-vos na quinta.");
    expect(noTexto).toBeGreaterThan(text.indexOf("Olá "));
    expect(noTexto).toBeLessThan(text.indexOf("Segue em anexo"));
  });

  /**
   * Um `<` ou um `&` na mensagem dela não pode partir o email — e um `<script>`
   * escrito por engano (ou colado de outro sítio) não pode chegar ao cliente
   * como marcação.
   */
  it("escapa o texto dela no HTML e deixa-o intacto no texto simples", async () => {
    const escrito = 'Trago o arco & as flores <3 — "prometido" às 14h';
    await POST(envioCom(escrito), { params });
    const { html, text } = enviado();
    expect(html).toContain("&amp;");
    expect(html).toContain("&lt;3");
    expect(html).not.toContain("<3");
    expect(html).not.toContain("Trago o arco & as");
    // No texto simples vai tal e qual: escapar é uma preocupação de HTML.
    expect(text).toContain(escrito);
  });

  it("as linhas em branco viram parágrafos, e as simples uma quebra", async () => {
    await POST(envioCom("Primeira linha\nSegunda linha\n\nOutro parágrafo"), { params });
    const { html, text } = enviado();
    expect(html).toContain("Primeira linha<br>Segunda linha");
    expect(html).toMatch(/Segunda linha<\/p>[\s\S]*<p[^>]*>Outro parágrafo/);
    // Sem `<br>` nem `<p>` a colarem-se ao texto simples.
    expect(text).toContain("Primeira linha\nSegunda linha\n\nOutro parágrafo");
    expect(text).not.toContain("<br>");
  });

  /**
   * OPCIONAL A SÉRIO: sem mensagem (ou com uma caixa só de espaços), o email
   * tem de sair BYTE A BYTE como saía antes de esta caixa existir — nem um
   * parágrafo vazio, nem uma linha em branco a mais.
   */
  it("sem mensagem, o email sai exactamente como sempre saiu", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const semCampo = enviado();
    await POST(envioCom("   \n  "), { params });
    const soEspacos = enviado();
    expect(soEspacos.html).toBe(semCampo.html);
    expect(soEspacos.text).toBe(semCampo.text);
    // O olá encosta à frase da casa, sem nada pelo meio.
    expect(semCampo.html).toMatch(/Olá [^<]*<\/p>\s*<p[^>]*>Segue em anexo/);
    expect(semCampo.html).not.toMatch(/<p[^>]*>\s*<\/p>/);
  });

  /** Um campo que não é texto (um cliente avariado, um número) é o mesmo que
   *  não haver campo nenhum — nunca um 500 a meio de um envio. */
  it("ignora um campo que não seja texto, e envia na mesma", async () => {
    const res = await POST(envioCom({ isto: "não é texto" }), { params });
    expect(res.status).toBe(200);
    expect(enviado().html).toMatch(/Olá [^<]*<\/p>\s*<p[^>]*>Segue em anexo/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MODELO «PROPOSTA ENVIADA» TAMBÉM AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas rotas mandam o mesmo email — a proposta que segue para o cliente —,
 * por caminhos diferentes (a antiga desenha o PDF de linhas, esta desenha o
 * documento do estúdio). Se só uma respeitasse o modelo dela, o ecrã «Modelos
 * de email» continuava a mentir, agora com a agravante de depender do botão em
 * que ela carregou.
 */
describe("POST /api/orcamento/[id]/proposta-doc — o modelo «proposta-enviada»", () => {
  const enviado = () =>
    vi.mocked(sendMail).mock.calls.at(-1)![0] as unknown as {
      subject: string;
      html: string;
      text: string;
    };

  const modeloGuardado = (subject: string, body: string) => ({
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject,
    body,
    updatedAt: "2026-01-01T00:00:00.000Z",
  });

  it("sem modelo guardado sai o texto da casa — o de sempre", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().html).toContain("Segue em anexo a proposta personalizada");
  });

  it("com modelo guardado é o texto dela que vai, e o assunto dela também", async () => {
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta | Líquen", `<p>Olá {nome}, está pronta.</p>`),
    );
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const email = enviado();
    expect(email.subject).toBe("A sua proposta | Líquen");
    // O `{nome}` aqui são os NOMES DO CASAL do documento do estúdio, como o
    // texto da casa já fazia — e não o `quote.name`, que pode ser a mãe da
    // noiva ou uma wedding planner.
    expect(email.html).toContain("Olá Maria &amp; Zé, está pronta.");
    expect(email.text).toContain("Olá Maria & Zé, está pronta.");
  });

  /**
   * A MENSAGEM DELA GANHA AO MODELO, E NÃO É INDECISÃO.
   *
   * O texto da casa foi desenhado à volta da mensagem pessoal: ela entra logo
   * a seguir ao «Olá» e ANTES do botão, porque depois do botão é depois do
   * sítio onde muita gente já carregou (a nota longa está na rota). Um corpo
   * de modelo é markup opaco — não há onde lá dentro enfiar a mensagem sem
   * adivinhar. Entre despejar a nota dela no fim, depois do botão, e usar o
   * texto que tem um lugar para ela, ganha o segundo: a mensagem foi escrita
   * há um minuto para ESTE casal, e é a mais específica das duas.
   */
  it("quando ela escreve uma mensagem para acompanhar a proposta, é o texto da casa que sai", async () => {
    modelo.get.mockResolvedValue(
      modeloGuardado("A sua proposta | Líquen", `<p>Olá {nome}, está pronta.</p>`),
    );
    await POST(
      req({
        mode: "send",
        doc: baseDoc({ totalAmount: 3000 }),
        mensagem: "Foi um gosto conhecer-vos na quinta.",
      }),
      { params },
    );
    const email = enviado();
    expect(email.html).toContain("Foi um gosto conhecer-vos na quinta.");
    expect(email.html).toContain("Segue em anexo a proposta personalizada");
    expect(email.html).not.toContain("está pronta.");
  });

  it("um modelo com um marcador sem valor não deixa sair o buraco", async () => {
    // O documento do estúdio não tem empresa nenhuma.
    modelo.get.mockResolvedValue(
      modeloGuardado("Proposta para a {empresa}", `<p>Olá {nome}, da {empresa}.</p>`),
    );
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    const email = enviado();
    expect(email.subject).toBe("Proposta para o seu evento — Líquen Events");
    expect(email.html).not.toContain("da .");
  });

  it("o rodapé do modelo guardado não sai colado à assinatura da casa", async () => {
    modelo.get.mockResolvedValue(
      modeloGuardado(
        "A sua proposta",
        [
          `<div style="max-width:560px">`,
          `  <p>Olá {nome},</p>`,
          `  <hr style="border:none;border-top:1px solid #eee">`,
          `  <p style="font-size:12px;color:#999">Líquen Events · Portugal</p>`,
          `</div>`,
        ].join("\n"),
      ),
    );
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(enviado().html).not.toContain("Líquen Events · Portugal");
    // A assinatura da casa continua lá — é ela o único fecho.
    expect(enviado().text).toContain("Catarina Gaspar");
  });

  /** Os nomes do casal vêm de uma caixa de texto do estúdio: um `<` lá dentro
   *  não pode virar markup no email. */
  it("o {nome} entra escapado no corpo e legível no texto simples", async () => {
    modelo.get.mockResolvedValue(modeloGuardado("A sua proposta", `<p>Olá {nome},</p>`));
    await POST(sendReq(baseDoc({ totalAmount: 3000, clientNames: `<b>Maria</b> & Zé` })), {
      params,
    });
    const email = enviado();
    expect(email.html).toContain("&lt;b&gt;Maria&lt;/b&gt;");
    expect(email.html).not.toContain("<b>Maria</b> &");
    expect(email.text).not.toMatch(/[<>]/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ENVIADA» É UM FACTO, NÃO UMA INTENÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Com o SMTP em baixo, o estúdio dava 200, um aviso passageiro («Envio de email
 * não configurado.») — e no servidor ficava gravado
 * `{"status":"enviada","sentAt":"2026-08-13T14:06:52.259Z"}`. O aviso passa; o
 * registo fica. Passados dez minutos, o quadro «Propostas» mostrava uma
 * proposta «Enviada, à espera de resposta» que nunca saiu de casa — e ela ia
 * esperar por uma resposta que não podia chegar.
 *
 * A causa era a ordem: o estado e a hora do envio eram escritos INCONDICIONAL-
 * MENTE, antes de sequer se tentar enviar, e o `catch` do envio também não os
 * desfazia.
 *
 * ── O QUE NÃO SE PODE PARTIR AO CORRIGIR ────────────────────────────────────
 *
 * A proposta é gravada ANTES do envio de propósito, e está documentado porquê:
 * se o envio deitasse a gravação abaixo com um 500, ela tentava outra vez e
 * criava propostas fantasma — «enviada» na lista, no Acompanhamento e nas
 * contagens, sem ninguém as ter recebido. Por isso estes testes exigem as duas
 * coisas ao mesmo tempo: a proposta FICA GUARDADA nos dois casos, e o ESTADO
 * só diz «enviada» quando o email saiu mesmo.
 */
describe("POST /api/orcamento/[id]/proposta-doc — «enviada» só quando o email saiu", () => {
  beforeEach(() => {
    renderMock.missing = 0;
    renderMock.truncations = [];
    renderMock.sequencia = [];
    renderMock.chamadas = 0;
    store.linhas.clear();
    store.attempts = 0;
    store.failFirstWith = null;
    updated.estado = "pendente";
    // Os blocos acima deixam `createProposal` com uma implementação própria (e
    // `mockImplementation` sobrevive ao `clearAllMocks`): aqui a gravação tem
    // de voltar a alimentar a tabela do duplo, que é o que se afirma.
    vi.mocked(createProposal).mockImplementation(async (p: Proposal) => {
      created.last = p;
      store.linhas.set(p.id, { ...p });
    });
    vi.mocked(sendMail).mockResolvedValue({ sent: true });
  });

  /** A única proposta gravada (os testes que criam mais do que uma contam-nas). */
  const gravada = (): Proposal => [...store.linhas.values()][0];

  it("SMTP em baixo: a proposta fica guardada, mas o estado NÃO diz «enviada»", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.emailed).toBe(false);
    expect(body.emailError).toBeTruthy();

    // 1) FICA GUARDADA — a protecção contra propostas fantasma não regride.
    expect(store.linhas.size, "a proposta tem de ficar gravada na mesma").toBe(1);
    expect(gravada().doc, "e com o documento, que é a única cópia durável").toBeTruthy();

    // 2) E O ESTADO NÃO MENTE.
    expect(gravada().status).not.toBe("enviada");
    expect(gravada().sentAt, "não há hora de envio quando não houve envio").toBeUndefined();
  });

  it("o envio a atirar (credenciais erradas) deixa exactamente o mesmo", async () => {
    vi.mocked(sendMail).mockRejectedValue(new Error("EAUTH: invalid login"));

    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(false);
    expect(store.linhas.size).toBe(1);
    expect(gravada().status).not.toBe("enviada");
    expect(gravada().sentAt).toBeUndefined();
  });

  it("com o email a sair, aí sim: «enviada», com a hora a que saiu", async () => {
    const res = await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(res.status).toBe(200);
    expect((await res.json()).emailed).toBe(true);
    expect(store.linhas.size).toBe(1);
    expect(gravada().status).toBe("enviada");
    expect(Date.parse(gravada().sentAt ?? "")).toBeGreaterThan(0);
  });

  /**
   * O pedido no Quadro é a mesma mentira vista do outro lado: um pedido em
   * «Proposta enviada» sobre uma proposta que ninguém recebeu. O PREÇO grava-se
   * na mesma — foi decidido, e nada nele depende de o email ter saído.
   */
  it("sem email, o pedido não avança para «Proposta enviada» — mas o preço grava-se", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });
    updated.estado = "pendente";

    await POST(sendReq(baseDoc({ totalAmount: 3000, totalVatMode: "acrescer" })), { params });

    expect(updated.last?.status).toBe("pendente");
    expect(updated.last).not.toHaveProperty("activityLog");
    expect(updated.last?.quotedPrice).toBe(3000);
  });

  /**
   * E o reenvio: depois de o email falhar, ela corrige o SMTP e carrega outra
   * vez. Isso NÃO pode encher a lista de propostas fantasma — a proposta que
   * ficou por enviar é a MESMA que agora segue.
   */
  it("reenviar uma proposta por enviar não cria uma segunda", async () => {
    vi.mocked(sendMail).mockResolvedValue({ sent: false });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    expect(store.linhas.size).toBe(1);
    const primeira = gravada().id;

    vi.mocked(sendMail).mockResolvedValue({ sent: true });
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });

    expect(store.linhas.size, "reenviar reaproveita a que ficou por enviar").toBe(1);
    expect(gravada().id).toBe(primeira);
    expect(gravada().status).toBe("enviada");
  });

  /**
   * O contrário também tem de valer: uma proposta que JÁ seguiu para o casal
   * não se reescreve por cima. Uma revisão é uma proposta nova — é disso que
   * dependem o histórico, a análise e a guarda da proposta mais recente no
   * link do cliente (`/api/proposta`).
   */
  it("mas uma proposta já enviada nunca é reescrita: a revisão é uma proposta nova", async () => {
    await POST(sendReq(baseDoc({ totalAmount: 3000 })), { params });
    await POST(sendReq(baseDoc({ totalAmount: 4000 })), { params });
    expect(store.linhas.size).toBe(2);
    expect([...store.linhas.values()].every((p) => p.status === "enviada")).toBe(true);
  });
});
