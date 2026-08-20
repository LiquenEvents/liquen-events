import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O PDF da proposta servido pelo LINK DO CLIENTE (/[lang]/proposta/[token]).
 *
 * O documento seguia só em anexo no email; na página onde o casal decide não
 * havia forma de o voltar a ver. Esta rota é esse botão — e o que ela tem de
 * garantir é: serve o documento DESTA proposta, e mais nada; um token que não
 * seja o dela não abre nada; e uma proposta sem documento guardado (as
 * anteriores à coluna `proposals.doc`, e as de linhas do back office) é um 404
 * limpo, nunca um 500 nem uma pista de que o id existe.
 */
const db = vi.hoisted(() => ({
  proposals: new Map<string, Record<string, unknown>>(),
  rendered: [] as unknown[],
  /** Fotos que o gerador não conseguiu meter no documento. */
  emFalta: 0,
}));

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: vi.fn((t: string) =>
    t.startsWith("bom-") ? { proposalId: t.slice(4) } : null,
  ),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (id: string) => db.proposals.get(id) ?? null),
  // Ver a nota igual no teste da página: sem isto o resolvedor rebentava, a
  // avaria era engolida e estes testes ficavam verdes pela razão errada.
  listProposalsForQuote: vi.fn(async (quoteId: string) =>
    [...db.proposals.values()].filter((p) => (p as { quoteId?: string }).quoteId === quoteId),
  ),
}));
vi.mock("@/lib/contracts-store", () => ({ getAcceptedContractByQuote: async () => null }));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return new Uint8Array([37, 80, 68, 70]); // "%PDF"
  }),
  /**
   * A cache do PDF passou a pedir o RELATÓRIO e não só os bytes: é assim que
   * uma proposta com fotos a menos deixa de sair calada para o cliente. O
   * `emFalta` é regulável por caso para se poder exercitar a recusa.
   */
  renderStoredProposalDocPdfWithReport: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return {
      pdf: new Uint8Array([37, 80, 68, 70]),
      missingImages: db.emFalta ?? 0,
      truncations: [],
    };
  }),
}));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { esvaziarCachePdf } from "@/lib/proposal-pdf-cache";
import { getProposal } from "@/lib/proposals-store";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";

// Um IP diferente por chamada: o limitador é real (12/minuto por IP) e é
// partilhado por todo o processo de testes — sem isto, um teste gastava a
// quota do seguinte e o vermelho não teria nada a ver com o que se testa.
let n = 0;
function call(token = "bom-p1") {
  const req = new Request("http://x", { headers: { "x-real-ip": `10.0.0.${++n % 250}` } });
  return GET(req, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  // A rota serve de uma cache por processo (`proposal-pdf-cache`): sem
  // esvaziar, o segundo caso deste ficheiro receberia o PDF que o primeiro
  // desenhou e nunca chegaria a exercitar o que diz exercitar.
  esvaziarCachePdf();
  db.proposals.clear();
  db.rendered = [];
  vi.clearAllMocks();
});

describe("GET /api/proposta/[token]/pdf", () => {
  it("serve com Content-Length, ETag e a promessa de pedaços", async () => {
    // O que o portal precisa para abrir um PDF não linearizado sem arrastar o
    // ficheiro todo. A razão está em `pdf-resposta.ts`.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Length")).toBe("4");
    expect(res.headers.get("Accept-Ranges")).toBe("bytes");
    expect(res.headers.get("ETag")).toBeTruthy();
  });

  it("um pedido de pedaço devolve 206 e NÃO volta a desenhar", async () => {
    // O ponto da cache: um leitor de PDF faz vários pedidos parciais para abrir
    // um ficheiro. Se cada um voltasse a desenhar, anunciar `Accept-Ranges`
    // seria uma degradação de cinco ou seis vezes em vez de uma melhoria.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
    await call();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(1);

    const req = new Request("http://x", {
      headers: { "x-real-ip": `10.0.1.${++n % 250}`, range: "bytes=0-1" },
    });
    const res = await GET(req, { params: Promise.resolve({ token: "bom-p1" }) });
    expect(res.status).toBe(206);
    expect(res.headers.get("Content-Range")).toBe("bytes 0-1/4");
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(1);
  });

  it("serve o documento guardado NA proposta do token", async () => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO Decoração" } });
    const res = await call();
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-LIQ-AAA-1.pdf");
    expect(db.rendered).toEqual([{ ref: "PO Decoração" }]);
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array([37, 80, 68, 70]));
  });

  it("404 a um token inválido/forjado, sem chegar sequer à proposta", async () => {
    const res = await call("lixo");
    expect(res.status).toBe(404);
    expect(getProposal).not.toHaveBeenCalled();
  });

  it("404 (não 500) a uma proposta ANTIGA sem documento guardado", async () => {
    // É o estado de todas as propostas anteriores à coluna `proposals.doc` e
    // das criadas por linhas em /api/propostas. A página esconde o botão; aqui
    // fecha-se a mesma porta do lado do servidor.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1" });
    const res = await call();
    expect(res.status).toBe(404);
    expect(renderStoredProposalDocPdfWithReport).not.toHaveBeenCalled();
  });

  it("404 a uma proposta que já não existe", async () => {
    const res = await call("bom-apagada");
    expect(res.status).toBe(404);
  });

  it("serve a proposta do token mesmo depois de respondida ou expirada", async () => {
    // O cliente tem de poder rever aquilo que aceitou (ou que deixou expirar).
    // A página já lhe explica que não pode responder; esconder-lhe o documento
    // seria esconder-lhe o contrato que assinou.
    db.proposals.set("p1", {
      id: "p1",
      quoteId: "LIQ-AAA-1",
      status: "aceite",
      validUntil: "2020-01-01",
      doc: { ref: "PO" },
    });
    expect((await call()).status).toBe(200);
  });

  it("NUNCA serve o documento de outra proposta (o token é que manda)", async () => {
    db.proposals.set("p1", { id: "p1", doc: { ref: "a minha" } });
    db.proposals.set("p2", { id: "p2", doc: { ref: "a do vizinho" } });
    await call("bom-p1");
    expect(db.rendered).toEqual([{ ref: "a minha" }]);
  });

  it("500 sem detalhes quando o desenho rebenta (nada do erro chega ao cliente)", async () => {
    db.proposals.set("p1", { id: "p1", doc: { ref: "PO" } });
    vi.mocked(renderStoredProposalDocPdfWithReport).mockRejectedValueOnce(
      new Error("sharp em baixo"),
    );
    const res = await call();
    expect(res.status).toBe(500);
    expect(await res.text()).toBe("");
  });

  it("429 quando o mesmo IP repete o pedido em ciclo (desenhar é caro)", async () => {
    db.proposals.set("p1", { id: "p1", doc: { ref: "PO" } });
    const mesmoIp = () =>
      GET(new Request("http://x", { headers: { "x-real-ip": "203.0.113.99" } }), {
        params: Promise.resolve({ token: "bom-p1" }),
      });
    const estados: number[] = [];
    for (let i = 0; i < 14; i++) estados.push((await mesmoIp()).status);
    expect(estados.slice(0, 12).every((s) => s === 200)).toBe(true);
    expect(estados.at(-1)).toBe(429);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * VOLTAR A DESCARREGAR DÁ A PROPOSTA NA LÍNGUA EM QUE ELA FOI FEITA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este botão redesenha o documento a partir do `doc` guardado. Enquanto a
 * língua não ficava gravada, quem redesenhava não tinha como a saber e caía em
 * português: o casal inglês recebia a proposta inglesa por email e, ao carregar
 * no botão da página onde a aceita, abria a portuguesa. O mesmo documento, duas
 * línguas, sem explicação nenhuma.
 */
describe("GET /api/proposta/[token]/pdf — a língua da proposta", () => {
  it("uma proposta INGLESA volta a sair em inglês", async () => {
    db.proposals.set("p1", {
      id: "p1",
      quoteId: "LIQ-AAA-1",
      idioma: "en",
      doc: { ref: "PO" },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "en");
  });

  it("e o ficheiro chama-se como o que seguiu no email", async () => {
    // O casal já tem um «Proposal-Liquen-….pdf» na caixa de correio: o que
    // descarrega da página tem de ser reconhecível como o mesmo documento.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", idioma: "en", doc: { ref: "PO" } });
    const res = await call();
    expect(res.headers.get("Content-Disposition")).toContain("Proposal-Liquen-LIQ-AAA-1.pdf");
  });

  it("uma proposta PORTUGUESA continua exactamente como estava", async () => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", idioma: "pt", doc: { ref: "PO" } });
    const res = await call();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "pt");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-LIQ-AAA-1.pdf");
  });

  it("uma proposta ANTIGA, sem língua gravada, é portuguesa", async () => {
    // O caso que não pode mudar de comportamento: tudo o que foi enviado antes
    // desta coluna existir foi enviado em português.
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", doc: { ref: "PO" } });
    const res = await call();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "pt");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-LIQ-AAA-1.pdf");
  });

  it("uma língua estranha na base não inventa nada: português", async () => {
    db.proposals.set("p1", { id: "p1", quoteId: "LIQ-AAA-1", idioma: "fr", doc: { ref: "PO" } });
    await call();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ ref: "PO" }, "pt");
  });
});
