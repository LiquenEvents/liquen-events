import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTO DA BIBLIOTECA, VISTA DO LADO DE QUEM A LÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um documento de proposta guarda `tema:<pasta>/<ficheiro>.jpg` para as fotos
 * escolhidas da Biblioteca, e `<pedido>/<uuid>.jpg` para as que ela carregou à
 * mão. Quem lê um documento — o gerador do PDF, a grelha do estúdio — não devia
 * ter de saber a diferença, e é o `proposal-storage` que a esconde.
 *
 * O que aqui se fixa é o que acontece quando a esconde MAL:
 *
 *  · ir buscar os bytes ao bucket errado dá um PDF sem fotos, e a única pista
 *    seria uma linha nos registos;
 *  · assinar uma foto da biblioteca com o prazo das propostas (10 anos em vez
 *    de 6 horas) desfaz uma decisão de segurança sem ninguém dar por ela;
 *  · um `tema:` com uma travessia lá dentro chegaria a um `download()`.
 */

const st = vi.hoisted(() => ({
  /** Buckets tocados, pela ordem. */
  buckets: [] as string[],
  /** `(bucket, caminhos, ttl)` de cada assinatura em lote. */
  assinaturas: [] as { bucket: string; paths: string[]; ttl: number }[],
  /** `(bucket, caminho)` de cada download. */
  descarregados: [] as { bucket: string; path: string }[],
  /** Caminhos que o bucket não tem. */
  semAssinatura: new Set<string>(),
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("sharp", () => ({ default: () => ({ metadata: async () => ({}) }) }));
vi.mock("./supabase", () => ({
  isDatabaseConfigured: () => true,
  getSupabase: () => ({
    storage: {
      getBucket: async (name: string) => ({ data: { name }, error: null }),
      createBucket: async () => ({ data: null, error: null }),
      updateBucket: async () => ({ data: null, error: null }),
      from: (bucket: string) => {
        st.buckets.push(bucket);
        return {
          createSignedUrls: async (paths: string[], ttl: number) => {
            st.assinaturas.push({ bucket, paths, ttl });
            return {
              data: paths
                .filter((p) => !st.semAssinatura.has(p))
                .map((path) => ({ path, signedUrl: `https://${bucket}/${path}` })),
              error: null,
            };
          },
          download: async (path: string) => {
            st.descarregados.push({ bucket, path });
            return {
              data: { arrayBuffer: async () => new TextEncoder().encode(`${bucket}:${path}`) },
              error: null,
            };
          },
        };
      },
    },
  }),
}));

import { fetchProposalImageBytes, signProposalPaths, signProposalThumbs } from "./proposal-storage";
import { THEME_SIGNED_TTL } from "./theme-ref";

beforeEach(() => {
  st.buckets = [];
  st.assinaturas = [];
  st.descarregados = [];
  st.semAssinatura = new Set();
});

// ── Os bytes que vão para o PDF ────────────────────────────────────────────
describe("fetchProposalImageBytes", () => {
  it("vai buscar uma referência ao bucket da BIBLIOTECA, sem o prefixo", async () => {
    const bytes = await fetchProposalImageBytes("tema:italia/a.jpg");
    expect(st.descarregados).toEqual([{ bucket: "theme-assets", path: "italia/a.jpg" }]);
    expect(bytes?.toString()).toBe("theme-assets:italia/a.jpg");
  });

  it("uma foto da própria proposta continua a vir da pasta do pedido", async () => {
    await fetchProposalImageBytes("q-1/uuid.jpg");
    expect(st.descarregados).toEqual([{ bucket: "proposal-assets", path: "q-1/uuid.jpg" }]);
  });

  /**
   * O TESTE QUE INTERESSA. Um documento pode vir de uma cópia de segurança, de
   * uma versão antiga do estúdio, ou de um restauro — não é uma fonte em que
   * se confie cegamente. Uma travessia aqui escolheria que ficheiro do bucket
   * é lido e embutido num PDF que sai para um cliente.
   */
  it("um prefixo com travessia nunca chega ao Storage como caminho de tema", async () => {
    for (const mau of ["tema:../../etc/passwd", "tema:italia/../../outro/x.jpg", "tema:"]) {
      st.descarregados = [];
      await fetchProposalImageBytes(mau);
      const comoTema = st.descarregados.filter((d) => d.bucket === "theme-assets");
      expect(comoTema, `${mau} foi tratado como caminho da biblioteca`).toEqual([]);
    }
  });
});

// ── As assinaturas ─────────────────────────────────────────────────────────
describe("assinar um lote misto", () => {
  const lote = ["q-1/propria.jpg", "tema:italia/a.jpg", "tema:italia/b.jpg"];

  it("cada família ao seu bucket, e a chave devolvida é a do documento", async () => {
    const urls = await signProposalPaths(lote);
    expect(urls.get("q-1/propria.jpg")).toBe("https://proposal-assets/q-1/propria.jpg");
    // A chave mantém o `tema:` — é por ela que a grelha do estúdio procura.
    expect(urls.get("tema:italia/a.jpg")).toBe("https://theme-assets/italia/a.jpg");
    expect(urls.get("tema:italia/b.jpg")).toBe("https://theme-assets/italia/b.jpg");
  });

  it("são DOIS pedidos — um por bucket —, não um por foto", async () => {
    await signProposalPaths(lote);
    expect(st.assinaturas).toHaveLength(2);
    expect(st.assinaturas.find((a) => a.bucket === "theme-assets")?.paths).toEqual([
      "italia/a.jpg",
      "italia/b.jpg",
    ]);
  });

  /** Um lote SÓ de fotos da proposta não pode passar a custar um pedido a mais
   *  ao bucket dos temas por causa desta funcionalidade. */
  it("um lote sem referências não toca no bucket dos temas", async () => {
    await signProposalPaths(["q-1/a.jpg", "q-1/b.jpg"]);
    expect(st.assinaturas).toHaveLength(1);
    expect(st.buckets).not.toContain("theme-assets");
  });

  /**
   * A pasta de um pedido assina a 10 anos porque é a pré-visualização dela
   * própria; a biblioteca a 6 horas porque é o activo do estúdio inteiro e são
   * milhares de ficheiros. Passar a assinar a biblioteca com o prazo das
   * propostas era um empréstimo permanente, feito em silêncio.
   */
  it("cada bucket com o SEU prazo", async () => {
    await signProposalPaths(lote);
    const daBiblioteca = st.assinaturas.find((a) => a.bucket === "theme-assets");
    const daProposta = st.assinaturas.find((a) => a.bucket === "proposal-assets");
    expect(daBiblioteca?.ttl).toBe(THEME_SIGNED_TTL);
    expect(THEME_SIGNED_TTL).toBe(60 * 60 * 6);
    expect(daProposta?.ttl).toBeGreaterThan(THEME_SIGNED_TTL);
  });

  it("as miniaturas seguem a mesma regra, cada uma no seu bucket de miniaturas", async () => {
    const thumbs = await signProposalThumbs(lote);
    expect(thumbs.get("q-1/propria.jpg")).toBe("https://proposal-thumbs/q-1/propria.jpg");
    // É ESTE o URL que faz a diferença: é o mesmo que o seletor de temas já
    // pediu, portanto o service worker responde-lhe do disco.
    expect(thumbs.get("tema:italia/a.jpg")).toBe("https://theme-thumbs/italia/a.jpg");
  });

  it("uma foto sem miniatura simplesmente não aparece no mapa", async () => {
    st.semAssinatura.add("italia/a.jpg");
    const thumbs = await signProposalThumbs(lote);
    expect(thumbs.has("tema:italia/a.jpg")).toBe(false);
    expect(thumbs.has("tema:italia/b.jpg")).toBe(true);
  });
});
