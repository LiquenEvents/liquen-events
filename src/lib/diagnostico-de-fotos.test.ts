import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

/**
 * O QUE ESTE TESTE PRENDE: que cada uma das nove maneiras de uma fotografia
 * não aparecer saia daqui com NOME e com passo seguinte — e não como silêncio,
 * que foi o que custou um dia em produção.
 *
 * O Supabase é de mentira de propósito: cada avaria é provocada, e o que se
 * verifica é a frase que sai. Um diagnóstico que só se testa contra uma
 * instalação boa é um diagnóstico que nunca foi testado.
 */

const sb = vi.hoisted(() => ({ actual: null as unknown }));
const papel = vi.hoisted(() => ({ valor: "service_role" as string }));
const sharpRebenta = vi.hoisted(() => ({ sim: false }));

vi.mock("@/lib/supabase", () => ({
  getSupabase: () => sb.actual,
  isDatabaseConfigured: () => sb.actual !== null,
  papelDaChaveSupabase: () => papel.valor,
}));
vi.mock("./supabase", () => ({
  getSupabase: () => sb.actual,
  isDatabaseConfigured: () => sb.actual !== null,
  papelDaChaveSupabase: () => papel.valor,
}));
vi.mock("sharp", () => ({
  default: () => {
    if (sharpRebenta.sim) {
      throw new Error(
        'Could not load the "sharp" module using the linux-x64 runtime: ' +
          "libvips-cpp.so.8.18.3: cannot open shared object file",
      );
    }
    return { jpeg: () => ({ toBuffer: async () => Buffer.from([1]) }) };
  },
}));

import {
  diagnosticarFotos,
  imgSrcDe,
  urlDeAmostra,
  CATALOGO,
  type DiagnosticoDeFotos,
} from "./diagnostico-de-fotos";

const ORIGEM = "https://abcd1234.supabase.co";
const POLITICA_BOA = `default-src 'self'; img-src 'self' data: blob: ${ORIGEM}; font-src 'self'`;
const POLITICA_MA = "default-src 'self'; img-src 'self' data: blob:; font-src 'self'";

/** Um Storage de mentira que responde o que o teste mandar. */
function storageFalso(
  op: {
    buckets?: string[];
    erroAoListarBuckets?: string;
    pastas?: { name: string; id?: string }[];
    ficheiros?: { name: string; id?: string }[];
    erroAoAssinar?: string;
  } = {},
) {
  const buckets = op.buckets ?? [
    "proposal-assets",
    "proposal-thumbs",
    "theme-assets",
    "theme-thumbs",
  ];
  return {
    storage: {
      listBuckets: async () =>
        op.erroAoListarBuckets
          ? { data: null, error: { message: op.erroAoListarBuckets } }
          : { data: buckets.map((name) => ({ name })), error: null },
      from: (bucket: string) => ({
        list: async (prefixo: string) => ({
          data:
            prefixo === ""
              ? (op.pastas ?? [{ name: "p1" }])
              : (op.ficheiros ?? [{ name: "a.jpg", id: "1" }]),
          error: null,
        }),
        createSignedUrl: async (caminho: string) =>
          op.erroAoAssinar
            ? { data: null, error: { message: op.erroAoAssinar } }
            : {
                data: {
                  signedUrl: `${ORIGEM}/storage/v1/object/sign/${bucket}/${caminho}?token=t`,
                },
                error: null,
              },
      }),
    },
  };
}

const guardado = { ...process.env };

beforeEach(() => {
  process.env.SUPABASE_URL = ORIGEM;
  papel.valor = "service_role";
  sharpRebenta.sim = false;
  sb.actual = storageFalso();
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () => new Response("x", { status: 200, headers: { "content-type": "image/jpeg" } }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  for (const k of Object.keys(process.env)) if (!(k in guardado)) delete process.env[k];
  Object.assign(process.env, guardado);
});

const causas = (d: DiagnosticoDeFotos) => d.avarias.map((a) => a.causa);
const verificacao = (d: DiagnosticoDeFotos, nome: string) =>
  d.verificacoes.find((v) => v.nome === nome);

describe("diagnóstico de fotografias", () => {
  it("com tudo bem, não inventa avaria nenhuma", async () => {
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toEqual([]);
    expect(d.ok).toBe(true);
    expect(verificacao(d, "politica-de-seguranca")?.passou).toBe(true);
    expect(verificacao(d, "bytes")?.passou).toBe(true);
    expect(verificacao(d, "sharp")?.passou).toBe(true);
  });

  it("A AVARIA DA PRODUÇÃO: a img-src sem o Storage é nomeada", async () => {
    const d = await diagnosticarFotos({ politicaServida: POLITICA_MA });
    expect(causas(d)).toContain("csp-sem-storage");
    expect(d.ok).toBe(false);
    const v = verificacao(d, "politica-de-seguranca");
    expect(v?.passou).toBe(false);
    expect(v?.detalhe).toContain(ORIGEM);
    // A frase tem de dizer o que fazer, e onde.
    expect(CATALOGO["csp-sem-storage"].oQueFazer).toMatch(/BUILD/);
  });

  it("uma política que não se conseguiu ler fica por apurar, e não «passou»", async () => {
    const d = await diagnosticarFotos({ politicaServida: null });
    expect(verificacao(d, "politica-de-seguranca")?.passou).toBe(null);
    expect(causas(d)).not.toContain("csp-sem-storage");
  });

  it("sem Supabase configurado, diz que falta a configuração e pára", async () => {
    sb.actual = null;
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toEqual(["sem-configuracao"]);
    expect(verificacao(d, "baldes")).toBeUndefined();
  });

  it("a chave anon é apanhada sem ir à rede", async () => {
    papel.valor = "anon";
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toContain("chave-sem-permissao");
    expect(verificacao(d, "papel-da-chave")?.passou).toBe(false);
  });

  it("um balde em falta é dito pelo nome", async () => {
    sb.actual = storageFalso({ buckets: ["proposal-assets", "theme-assets"] });
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toContain("bucket-em-falta");
    expect(verificacao(d, "baldes")?.detalhe).toContain("proposal-thumbs");
  });

  it("o Storage sem resposta não passa por «não há fotos»", async () => {
    sb.actual = storageFalso({ erroAoListarBuckets: "fetch failed" });
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toContain("storage-sem-resposta");
  });

  it("uma assinatura recusada tem frase própria", async () => {
    sb.actual = storageFalso({ erroAoAssinar: "Invalid JWT" });
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toContain("assinatura-recusada");
  });

  it("o URL assina bem e o ficheiro não está lá — e isso distingue-se", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 400 })),
    );
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toContain("ficheiro-em-falta");
    expect(verificacao(d, "bytes")?.detalhe).toContain("400");
  });

  it("o sharp sem libvips é a mesma avaria dos temas, e é dita assim", async () => {
    sharpRebenta.sim = true;
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(causas(d)).toContain("sharp-sem-libvips");
    expect(verificacao(d, "sharp")?.detalhe).toContain("libvips");
    expect(CATALOGO["sharp-sem-libvips"].oQueFazer).toContain("outputFileTracingIncludes");
  });

  it("sem nenhuma fotografia guardada, não se acusa ninguém", async () => {
    sb.actual = storageFalso({ pastas: [], ficheiros: [] });
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(verificacao(d, "assinatura")?.passou).toBe(null);
    expect(causas(d)).toEqual([]);
  });

  it("a causa que o servidor não pode ver é dita à mesma", async () => {
    const d = await diagnosticarFotos({ politicaServida: POLITICA_BOA });
    expect(d.porObservar.map((a) => a.causa)).toEqual(["assinatura-expirada"]);
  });

  it("as nove causas têm todas título e passo seguinte", () => {
    const todas = Object.values(CATALOGO);
    expect(todas).toHaveLength(9);
    for (const a of todas) {
      expect(a.titulo.length, a.causa).toBeGreaterThan(10);
      expect(a.oQueFazer.length, a.causa).toBeGreaterThan(60);
      expect(a.oQueFazer, a.causa).not.toMatch(/ocorreu um erro|erro interno/i);
    }
  });

  it("lê a img-src de uma política e sabe quando não a há", () => {
    expect(imgSrcDe(POLITICA_BOA)).toBe(`img-src 'self' data: blob: ${ORIGEM}`);
    expect(imgSrcDe(null)).toBe("");
    expect(imgSrcDe("default-src 'self'")).toBe("");
  });

  it("a amostra é um caminho do Storage desta instalação", () => {
    expect(urlDeAmostra({ SUPABASE_URL: ORIGEM })).toContain(`${ORIGEM}/storage/v1/object/sign/`);
    expect(urlDeAmostra({})).toContain("supabase.co");
  });
});
