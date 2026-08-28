import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A rota que assina as fotografias de uma proposta para o casal que tem o
 * token. A auditoria (`src/app/api/auth-guard-audit.test.ts`) já prende o
 * guarda — um token forjado sai em 404 sem tocar em nada. Aqui prende-se o
 * resto: o que ela devolve, o que NÃO deixa entrar, e o tecto de pedidos.
 */

const H = vi.hoisted(() => ({
  proposta: null as Record<string, unknown> | null,
  assinados: [] as string[],
  limite: { ok: true },
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: (t: string) => (t === "bom" ? { proposalId: "p1" } : null),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: async () => H.proposta,
  // Ver a nota igual no teste da página.
  listProposalsForQuote: async () => (H.proposta ? [H.proposta] : []),
}));
vi.mock("@/lib/contracts-store", () => ({ getAcceptedContractByQuote: async () => null }));
vi.mock("@/lib/rate-limit", () => ({
  clientIp: () => "1.2.3.4",
  rateLimit: async () => H.limite,
}));
vi.mock("@/lib/proposal-storage", () => ({
  signProposalPaths: async (paths: string[]) => {
    H.assinados.push(...paths);
    return new Map(paths.map((p) => [p, `https://storage.example/o/${encodeURIComponent(p)}`]));
  },
  signProposalThumbs: async (paths: string[]) => {
    H.assinados.push(...paths);
    return new Map(paths.map((p) => [p, `https://storage.example/m/${encodeURIComponent(p)}`]));
  },
  signProposalMids: async (paths: string[]) => {
    H.assinados.push(...paths);
    return new Map(paths.map((p) => [p, `https://storage.example/d/${encodeURIComponent(p)}`]));
  },
  // A oferta em AVIF: vazia, que é o caso normal de quem foi carregado antes
  // de o bucket existir. O que este ficheiro guarda é o que É assinado.
  signProposalMidsAvif: async () => new Map<string, string>(),
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  formasDeCaminhos: async () => new Map(),
  lqipsDeCaminhos: async () => new Map(),
}));

const { GET } = await import("./route");

const ctx = (token: string) => ({ params: Promise.resolve({ token }) });
const pedido = (url = "https://liquen.test/api/proposta/bom/fotos") => new Request(url);

const DOC = {
  coverImages: ["ped-7/capa.jpg"],
  moodBoards: [{ title: "Cerimónia", images: ["ped-7/uma.jpg", "tema:outono/duas.jpg"] }],
};

beforeEach(() => {
  H.assinados.length = 0;
  H.limite.ok = true;
  H.proposta = { id: "p1", doc: DOC };
});

describe("o que a rota devolve", () => {
  it("as fotografias do documento, com ids opacos e sem um caminho de bucket à vista", async () => {
    const res = await GET(pedido(), ctx("bom"));
    expect(res.status).toBe(200);
    const corpo = await res.json();
    expect(corpo.fotos.map((f: { id: string }) => f.id)).toEqual(["c0", "b0f0", "b0f1"]);
    // Os URLs assinados contêm o caminho — é inevitável, é o Storage que o
    // escreve. O que não pode aparecer é um caminho FORA de um URL: nos ids,
    // ou num campo qualquer que a rota tenha resolvido acrescentar.
    const semUrls = JSON.stringify(
      corpo.fotos.map((f: Record<string, unknown>) => ({
        ...f,
        miniatura: "",
        original: "",
        media: "",
      })),
    );
    expect(semUrls).not.toContain("ped-7");
    expect(semUrls).not.toContain("outono");
  });

  it("nenhum cache partilhado pode guardar isto", async () => {
    const res = await GET(pedido(), ctx("bom"));
    expect(res.headers.get("Cache-Control")).toContain("no-store");
    expect(res.headers.get("Cache-Control")).toContain("private");
  });

  it("uma proposta sem documento não tem fotografias — 404, como o PDF ao lado", async () => {
    H.proposta = { id: "p1" };
    expect((await GET(pedido(), ctx("bom"))).status).toBe(404);
  });
});

describe("a torneira que não existe", () => {
  /**
   * O erro que esta rota tem de tornar impossível: receber caminhos e assiná-los.
   * Com o token de um casal na mão, isso assinaria qualquer ficheiro da
   * Biblioteca de Temas — milhares de fotografias que são o activo do estúdio.
   *
   * O pedido traz aqui, à força, todos os sítios por onde um caminho poderia
   * entrar. Nenhum deles pode acabar num assinador.
   */
  it("um caminho enfiado no pedido nunca chega ao assinador", async () => {
    const intruso = "tema:pasta-alheia/roubada.jpg";
    const res = await GET(
      new Request(
        `https://liquen.test/api/proposta/bom/fotos?ref=${encodeURIComponent(intruso)}` +
          `&path=${encodeURIComponent(intruso)}&paths[]=${encodeURIComponent(intruso)}`,
        { headers: { "x-ref": intruso } },
      ),
      ctx("bom"),
    );
    expect(res.status).toBe(200);
    // CONTROLO POSITIVO: alguma coisa FOI assinada — as fotos do documento. Sem
    // esta linha, uma rota que não assinasse nada de nada passaria por segura.
    expect(H.assinados).toContain("ped-7/capa.jpg");
    expect(H.assinados).toContain("tema:outono/duas.jpg");
    // E o intruso não.
    expect(H.assinados).not.toContain(intruso);
  });
});

describe("o tecto de pedidos", () => {
  it("acima do limite responde 429 sem tocar na proposta", async () => {
    H.limite.ok = false;
    const res = await GET(pedido(), ctx("bom"));
    expect(res.status).toBe(429);
    expect(H.assinados).toEqual([]);
  });
});
