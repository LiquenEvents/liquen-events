import { describe, it, expect, vi, beforeEach } from "vitest";

// ── The portal proposal PDF must serve the ACCEPTED proposal, not the newest ──
// The portal page (page.tsx) resolves the proposal accepted-first (via the
// accepted contract) and only shows the PDF link for that accepted proposal.
// This route must serve the SAME document — otherwise a client who accepted
// proposal A downloads a later internal draft B (different price/terms) they
// never agreed to. We mock the stores and make the renderer echo which doc it
// was handed so we can assert on identity without a real PDF.
const db = vi.hoisted(() => ({
  quotes: new Map<string, Record<string, unknown>>(),
  proposalsById: new Map<string, Record<string, unknown>>(),
  newestByQuote: new Map<string, Record<string, unknown>>(),
  acceptedContractByQuote: new Map<string, Record<string, unknown>>(),
  rendered: [] as unknown[],
  /** Fotos que o gerador não conseguiu meter no documento. */
  emFalta: 0,
  /** O endereço assinado do ficheiro já desenhado. `null` = não está guardado,
   *  que é o caso normal aqui; só o bloco do fim o liga. */
  urlDirecto: null as string | null,
}));

vi.mock("@/lib/portal-token", () => ({
  readPortalToken: vi.fn((t: string) => (t === "good" ? { quoteId: "q-1" } : null)),
}));
vi.mock("@/lib/quotes-store", () => ({
  getQuote: vi.fn(async (id: string) => db.quotes.get(id) ?? null),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: vi.fn(async (id: string) => db.proposalsById.get(id) ?? null),
  getProposalByQuote: vi.fn(async (qid: string) => db.newestByQuote.get(qid) ?? null),
}));
vi.mock("@/lib/contracts-store", () => ({
  getAcceptedContractByQuote: vi.fn(
    async (qid: string) => db.acceptedContractByQuote.get(qid) ?? null,
  ),
}));
vi.mock("@/lib/proposal-doc-render", () => ({
  renderStoredProposalDocPdf: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return new Uint8Array([1, 2, 3]);
  }),
  /**
   * A cache do PDF passou a pedir o RELATÓRIO e não só os bytes: é assim que
   * uma proposta com fotos a menos deixa de sair calada para o cliente. O
   * `emFalta` é regulável por caso para se poder exercitar a recusa.
   */
  renderStoredProposalDocPdfWithReport: vi.fn(async (doc: unknown) => {
    db.rendered.push(doc);
    return { pdf: new Uint8Array([1, 2, 3]), missingImages: db.emFalta ?? 0, truncations: [] };
  }),
}));
vi.mock("@/lib/proposal-pdf-guardado", () => ({
  urlDoPdfDaProposta: vi.fn(async () => db.urlDirecto),
  guardarPdfDaProposta: vi.fn(async () => true),
  lerPdfDaProposta: vi.fn(async () => null),
}));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import { GET } from "./route";
import { esvaziarCachePdf } from "@/lib/proposal-pdf-cache";
import { renderStoredProposalDocPdfWithReport } from "@/lib/proposal-doc-render";

function call(token = "good") {
  return GET(new Request("http://x"), { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  // A rota serve de uma cache por processo (`proposal-pdf-cache`): sem
  // esvaziar, o segundo caso deste ficheiro receberia o PDF que o primeiro
  // desenhou e nunca chegaria a exercitar o que diz exercitar.
  esvaziarCachePdf();
  db.quotes.clear();
  db.proposalsById.clear();
  db.newestByQuote.clear();
  db.acceptedContractByQuote.clear();
  db.rendered = [];
  db.emFalta = 0;
  db.urlDirecto = null;
  db.quotes.set("q-1", { id: "q-1", name: "Cliente" });
  vi.clearAllMocks();
});

describe("portal proposta-pdf — serves the accepted proposal's document", () => {
  it("renders the ACCEPTED proposal doc even when a newer draft exists", async () => {
    db.proposalsById.set("p-acc", {
      id: "p-acc",
      quoteId: "q-1",
      doc: { which: "accepted" },
    });
    db.newestByQuote.set("q-1", {
      id: "p-new",
      quoteId: "q-1",
      doc: { which: "draft-revision" },
    });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-acc", status: "aceite" });

    const res = await call();
    expect(res.status).toBe(200);
    // The client must receive exactly what they accepted, not the newer draft.
    expect(db.rendered).toEqual([{ which: "accepted" }]);
  });

  it("falls back to the newest proposal when there is no accepted contract", async () => {
    db.newestByQuote.set("q-1", { id: "p-open", quoteId: "q-1", doc: { which: "open" } });

    const res = await call();
    expect(res.status).toBe(200);
    expect(db.rendered).toEqual([{ which: "open" }]);
  });

  it("404s on a bad token without touching the stores", async () => {
    const res = await call("bad");
    expect(res.status).toBe(404);
    expect(db.rendered).toEqual([]);
  });

  it("404s when the accepted proposal has no stored doc", async () => {
    db.proposalsById.set("p-acc", { id: "p-acc", quoteId: "q-1", doc: null });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-acc", status: "aceite" });

    const res = await call();
    expect(res.status).toBe(404);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════
 * UM PDF COM BURACOS NÃO SAI PARA O CASAL
 * ══════════════════════════════════════════════════════════════════════════
 *
 * Esta rota serve o documento ao CLIENTE. Até aqui deitava fora o relatório do
 * gerador: uma fotografia que não resolvesse desaparecia da proposta e o
 * ficheiro seguia na mesma, bonito e incompleto. Ninguém dava por nada — a
 * moldura não fica vazia, simplesmente não existe.
 */
describe("portal proposta-pdf — fotos em falta", () => {
  it("tenta SEGUNDA vez antes de desistir: a falha mais comum é passageira", async () => {
    db.newestByQuote.set("q-1", { id: "p", quoteId: "q-1", doc: { which: "x" } });
    db.emFalta = 2;
    // A segunda passagem corre com o Storage a responder.
    // `Buffer` e não `Uint8Array`: a assinatura devolve `Buffer<ArrayBuffer>`, e
    // um mock com o tipo errado é um mock que não prova nada sobre o real.
    const bytes = () => Buffer.from([1, 2, 3]) as Buffer<ArrayBuffer>;
    vi.mocked(renderStoredProposalDocPdfWithReport).mockImplementationOnce(async (doc) => {
      db.rendered.push(doc);
      return { pdf: bytes(), missingImages: 2, truncations: [] };
    });
    vi.mocked(renderStoredProposalDocPdfWithReport).mockImplementationOnce(async (doc) => {
      db.rendered.push(doc);
      return { pdf: bytes(), missingImages: 0, truncations: [] };
    });

    const res = await call();
    expect(res.status).toBe(200);
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledTimes(2);
  });

  /**
   * ── E DEPOIS DA SEGUNDA, SERVE-SE NA MESMA ─────────────────────────────
   *
   * Aqui estava um 503 sem corpo. Palavras dela, com o telemóvel na mão:
   * «quero que este botão ver a proposta de PDF funcione porque não está a
   * funcionar». Estava a responder 503 porque quatro fotografias tinham
   * desaparecido do armazenamento — e o botão «VER A PROPOSTA COMPLETA (PDF)»
   * não fazia nada. Nem abria, nem explicava.
   *
   * Entre não dar nada ao casal e dar-lhe o documento sem uma fotografia,
   * dá-se o documento: este botão REDESENHA para ecrã uma coisa que eles já
   * receberam por email. A recusa fica onde foi pedida — no ANEXO do email,
   * que é o documento de registo e passa por outro caminho.
   *
   * E o aviso mudou de destinatário: passou para o estúdio, ANTES do envio,
   * com o nome do mood board e a posição da foto.
   */
  it("com fotos a menos, SERVE na mesma — um botão que não faz nada é pior", async () => {
    db.newestByQuote.set("q-1", { id: "p", quoteId: "q-1", doc: { which: "x" } });
    db.emFalta = 1;

    const res = await call();
    expect(res.status).toBe(200);
    expect((await res.arrayBuffer()).byteLength).toBeGreaterThan(0);
  });

  /**
   * O ERRO QUE ISTO IMPEDE: guardar o documento com buracos em cache.
   *
   * A falta é passageira por definição. Guardá-la fixava-a até ao próximo
   * arranque a frio — mesmo depois de ela repor a fotografia. É o mesmo
   * "gravar uma falha como se fosse um facto" que já apareceu na cache de
   * fotografias e na célula do estúdio.
   */
  it("o documento incompleto NÃO fica em cache: a chamada seguinte volta a desenhar", async () => {
    db.newestByQuote.set("q-1", { id: "p", quoteId: "q-1", doc: { which: "x" } });
    db.emFalta = 1;
    expect((await call()).status).toBe(200);
    const desenhosAteAgora = db.rendered.length;

    db.emFalta = 0;
    expect((await call()).status).toBe(200);
    // Voltou a desenhar — não respondeu do que tinha guardado.
    expect(db.rendered.length).toBeGreaterThan(desenhosAteAgora);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PORTAL DÁ O DOCUMENTO NA LÍNGUA EM QUE A PROPOSTA FOI FEITA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A mesma exigência do link do casal, e pelo mesmo motivo: este botão redesenha
 * o documento a partir do `doc`, e sem a língua gravada caía sempre em
 * português. Um casal que aceitou uma proposta inglesa voltava ao portal meses
 * depois — para reler o que combinou — e descarregava outro documento.
 *
 * A língua é a da proposta que o portal SERVE (a aceite, quando há aceite), e
 * não a do visitante nem a do segmento da rota.
 */
describe("portal proposta-pdf — a língua da proposta", () => {
  it("uma proposta INGLESA volta a sair em inglês, e com o nome do email", async () => {
    db.newestByQuote.set("q-1", {
      id: "p-open",
      quoteId: "q-1",
      idioma: "en",
      doc: { which: "open" },
    });
    const res = await call();
    expect(res.status).toBe(200);
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ which: "open" }, "en");
    expect(res.headers.get("Content-Disposition")).toContain("Proposal-Liquen-q-1.pdf");
  });

  it("a língua é a da proposta ACEITE, não a da revisão mais recente", async () => {
    // O portal serve o documento que o casal aceitou; a língua tem de vir do
    // mesmo sítio, senão o ficheiro sai desenhado com a moldura de uma proposta
    // que o cliente nunca viu.
    db.proposalsById.set("p-acc", {
      id: "p-acc",
      quoteId: "q-1",
      idioma: "en",
      doc: { which: "accepted" },
    });
    db.newestByQuote.set("q-1", {
      id: "p-new",
      quoteId: "q-1",
      idioma: "pt",
      doc: { which: "draft-revision" },
    });
    db.acceptedContractByQuote.set("q-1", { proposalId: "p-acc", status: "aceite" });

    await call();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ which: "accepted" }, "en");
  });

  it("uma proposta ANTIGA, sem língua gravada, continua portuguesa", async () => {
    db.newestByQuote.set("q-1", { id: "p-open", quoteId: "q-1", doc: { which: "open" } });
    const res = await call();
    expect(renderStoredProposalDocPdfWithReport).toHaveBeenCalledWith({ which: "open" }, "pt");
    expect(res.headers.get("Content-Disposition")).toContain("Proposta-Liquen-q-1.pdf");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ATALHO QUE ESTA PORTA NÃO TINHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A porta do email (`api/proposta/[token]/pdf`) já reencaminhava para o ficheiro
 * guardado. Esta não — servia sempre os bytes através da função, o que são duas
 * viagens (armazenamento → função → telemóvel) e megabytes a passar por um
 * sítio que não precisa de os ver, com um arranque a frio pelo meio.
 *
 * As duas portas partilham o ficheiro, porque a chave é o conteúdo.
 */
describe("portal proposta-pdf — quando o ficheiro já está guardado", () => {
  /**
   * ── IP PRÓPRIO, E NÃO É UMA MANIA ──────────────────────────────────────
   *
   * A rota trava a 12 pedidos por IP por minuto (desenhar é caro), e o
   * limitador é de MÓDULO: sobrevive entre casos. O `call()` do ficheiro não
   * põe cabeçalho de IP nenhum, portanto todos os casos partilham o mesmo
   * balde — o ficheiro já ia em dez, e estes três empurravam-no para lá do
   * tecto. O sintoma não se parece nada com a causa: o caso a seguir recebia
   * 429 e falhava a dizer que o reencaminhamento não trazia `Cache-Control`.
   *
   * É o mesmo remédio que o ficheiro irmão usa no caso do 429: quem precisa de
   * um orçamento de pedidos só seu, pede-o por um IP só seu.
   */
  const chamar = () =>
    GET(new Request("http://x", { headers: { "x-real-ip": "198.51.100.7" } }), {
      params: Promise.resolve({ token: "good" }),
    });

  beforeEach(() => {
    db.proposalsById.set("p-1", { id: "p-1", quoteId: "q-1", doc: { ref: "PO" } });
    db.newestByQuote.set("q-1", { id: "p-1", quoteId: "q-1", doc: { ref: "PO" } });
  });

  it("reencaminha para o ficheiro em vez de o reenviar", async () => {
    db.urlDirecto = "https://cdn.exemplo/pdf-assinado";

    const res = await chamar();

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cdn.exemplo/pdf-assinado");
    // E não se desenhou nada — era esse o custo que isto existe para não pagar.
    expect(db.rendered).toHaveLength(0);
  });

  it("o reencaminhamento não fica guardado por cache nenhuma", async () => {
    // O endereço assinado expira em minutos: guardá-lo servia um link morto a
    // quem carregasse a seguir.
    db.urlDirecto = "https://cdn.exemplo/pdf-assinado";
    const res = await chamar();
    expect(res.headers.get("Cache-Control")).toMatch(/no-store/);
  });

  it("não estando guardado, desenha e serve como sempre", async () => {
    db.urlDirecto = null;
    const res = await chamar();
    expect(res.status).toBe(200);
    expect(db.rendered).toHaveLength(1);
  });
});
