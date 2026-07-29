import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * CARREGAMENTO DIRETO no estúdio de propostas.
 *
 * O guarda desta camada é `isProposalPath`: com escrita direta, o caminho que
 * chega à confirmação vem do navegador, e é só esta função que impede que ele
 * aponte para a pasta de OUTRO pedido — ou para fora do bucket. É pura, e é
 * testada como tal.
 *
 * O resto prova que a verificação de dimensões que a rota multipart fazia com
 * `sharp` ANTES de guardar não desapareceu: passou para a confirmação, e uma
 * imagem que não passa é apagada em vez de ficar no bucket à espera do gerador
 * de PDF.
 */
const st = vi.hoisted(() => ({
  /** O que o `sharp` diz do cabeçalho lido — é assim que se encena uma foto
   *  normal, uma bomba de descompressão e um ficheiro ilegível. */
  meta: { width: 3000, height: 2000 } as { width?: number; height?: number },
  metaThrows: false,
  removed: [] as string[],
  signed: vi.fn(),
  uploadUrl: vi.fn(),
  hasUploadUrlApi: true,
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("./supabase", () => ({
  isDatabaseConfigured: () => true,
  getSupabase: () => ({
    storage: {
      getBucket: async (name: string) => ({ data: { name }, error: null }),
      createBucket: async () => ({ data: null, error: null }),
      updateBucket: async () => ({ data: null, error: null }),
      from: () => ({
        createSignedUrls: st.signed,
        createSignedUrl: async (path: string) => ({
          data: { signedUrl: `https://storage.test/${path}` },
          error: null,
        }),
        remove: async (paths: string[]) => {
          st.removed.push(...paths);
          return { data: paths.map((name) => ({ name })), error: null };
        },
        ...(st.hasUploadUrlApi ? { createSignedUploadUrl: st.uploadUrl } : {}),
      }),
    },
  }),
}));

// O `sharp` é o único pedaço que não vale a pena correr a sério aqui (exigia
// bytes de uma imagem verdadeira); tudo o resto — o pedido do cabeçalho, o
// corte de bytes, a decisão, a remoção — é o código real.
vi.mock("sharp", () => ({
  default: () => ({
    metadata: async () => {
      if (st.metaThrows) throw new Error("não é uma imagem");
      return st.meta;
    },
  }),
}));

async function load() {
  return import("./proposal-storage");
}

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  st.meta = { width: 3000, height: 2000 };
  st.metaThrows = false;
  st.removed = [];
  // O Storage devolve o cabeçalho pedido; `fetchHeader` é código real.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(new Uint8Array(1024))),
  );
  st.hasUploadUrlApi = true;
  st.signed.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
    error: null,
  }));
  st.uploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://up/${path}?token=tok`, token: "tok", path },
    error: null,
  }));
});

describe("isProposalPath", () => {
  it("aceita um ficheiro dentro da pasta DESTE pedido", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    expect(isProposalPath("q-1/8f14e45f.jpg", "q-1")).toBe(true);
    expect(isProposalPath("q-1/foto.png", "q-1")).toBe(true);
    expect(isProposalPath("q-1/foto.webp", "q-1")).toBe(true);
  });

  it("RECUSA a pasta de outro pedido", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    // É este o furo que o guarda existe para tapar: uma proposta não pode
    // confirmar (nem assinar) fotos de outra.
    expect(isProposalPath("q-2/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-10/foto.jpg", "q-1")).toBe(false);
  });

  it("recusa travessia de diretórios e subpastas", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    expect(isProposalPath("../theme-assets/t-1/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-1/../q-2/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-1/sub/foto.jpg", "q-1")).toBe(false);
    expect(isProposalPath("q-1/foto.svg", "q-1")).toBe(false);
    expect(isProposalPath(42, "q-1")).toBe(false);
  });

  it("compara com o id JÁ limpo, como o resto do módulo", async () => {
    const { isProposalPath } = await import("./proposal-storage");

    // `uploadProposalImage` grava em `<id limpo>/…`; o guarda tem de usar a
    // mesma regra, senão recusava caminhos que ele próprio criou.
    expect(isProposalPath("q1/foto.jpg", "q/1")).toBe(true);
  });
});

describe("createProposalUploadTickets", () => {
  it("constrói o caminho no servidor, na pasta do pedido", async () => {
    const { createProposalUploadTickets } = await load();
    const tickets = await createProposalUploadTickets("q-1", ["image/jpeg", "image/webp"]);

    expect(tickets).toHaveLength(2);
    expect(tickets![0].path).toMatch(/^q-1\/[0-9a-f-]{36}\.jpg$/);
    expect(tickets![1].path).toMatch(/^q-1\/[0-9a-f-]{36}\.webp$/);
    expect(st.uploadUrl).toHaveBeenCalledWith(expect.any(String), { upsert: false });
  });

  it("um Storage sem esta API devolve null — o cliente cai para o multipart", async () => {
    st.hasUploadUrlApi = false;
    const { createProposalUploadTickets } = await load();

    expect(await createProposalUploadTickets("q-1", ["image/jpeg"])).toBeNull();
  });

  it("se um bilhete falhar, não sai nenhum", async () => {
    st.uploadUrl.mockResolvedValueOnce({ data: null, error: { message: "não" } });
    const { createProposalUploadTickets } = await load();

    expect(await createProposalUploadTickets("q-1", ["image/jpeg", "image/jpeg"])).toBeNull();
  });
});

describe("confirmProposalUploads", () => {
  it("assina as boas", async () => {
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/a.jpg"]);

    expect(res.images).toEqual([{ path: "q-1/a.jpg", url: "https://signed/q-1/a.jpg" }]);
    expect(res.rejected).toEqual([]);
  });

  it("RECUSA um caminho de outro pedido sem lhe tocar", async () => {
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-2/roubada.jpg", "q-1/minha.jpg"]);

    expect(res.images.map((i) => i.path)).toEqual(["q-1/minha.jpg"]);
    expect(res.rejected).toEqual(["q-2/roubada.jpg"]);
    // Não foi apagada: não é nossa para apagar.
    expect(st.removed).not.toContain("q-2/roubada.jpg");
  });

  it("uma BOMBA de descompressão é apagada e reportada", async () => {
    // 100 000 × 100 000 = 10 gigapixéis: uns KB de PNG que dariam cabo da
    // memória do gerador de PDF ao serem descodificados.
    st.meta = { width: 100_000, height: 100_000 };
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/bomba.png"]);

    expect(res.images).toEqual([]);
    expect(res.rejected).toEqual(["q-1/bomba.png"]);
    // O guarda que a rota multipart fazia com `sharp` continua a existir: o
    // que não presta não FICA no bucket à espera do gerador de PDF.
    expect(st.removed).toContain("q-1/bomba.png");
  });

  it("um ficheiro que nem é imagem é apagado", async () => {
    st.metaThrows = true;
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/disfarce.jpg"]);

    expect(res.rejected).toEqual(["q-1/disfarce.jpg"]);
    expect(st.removed).toContain("q-1/disfarce.jpg");
  });

  it("uma imagem sem dimensões legíveis é apagada", async () => {
    st.meta = {};
    const { confirmProposalUploads } = await load();
    const res = await confirmProposalUploads("q-1", ["q-1/vazia.jpg"]);

    expect(res.rejected).toEqual(["q-1/vazia.jpg"]);
    expect(st.removed).toContain("q-1/vazia.jpg");
  });
});
