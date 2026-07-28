import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isThemePath,
  themeFolder,
  themeIdOfPath,
  contentTypeForPath,
  THEME_BUCKET,
} from "./theme-storage";

/**
 * Duplo do Supabase Storage. `getSupabase` devolve um cliente construído a
 * partir deste estado, para podermos encenar as avarias que interessam: o
 * bucket em falta, o bucket ilegível, a listagem a falhar, a cópia recusada.
 * Cada teste corre num módulo fresco (`vi.resetModules`) porque o
 * theme-storage memoiza a verificação do bucket entre chamadas.
 */
const st = vi.hoisted(() => ({
  configured: true,
  bucket: {
    exists: true,
    error: null as unknown,
    createError: null as { message: string } | null,
    gets: 0,
    creates: 0,
  },
  buckets: [] as string[],
  list: vi.fn(),
  remove: vi.fn(),
  signed: vi.fn(),
  signOne: vi.fn(),
  copy: vi.fn(),
  download: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("./supabase", () => {
  const from = (bucket: string) => {
    st.buckets.push(bucket);
    return {
      list: st.list,
      remove: st.remove,
      createSignedUrls: st.signed,
      createSignedUrl: st.signOne,
      copy: st.copy,
      download: st.download,
      upload: st.upload,
    };
  };
  return {
    getSupabase: () =>
      st.configured
        ? {
            storage: {
              from,
              getBucket: async () => {
                st.bucket.gets++;
                return st.bucket.exists
                  ? { data: { name: THEME_BUCKET }, error: null }
                  : { data: null, error: st.bucket.error };
              },
              createBucket: async () => {
                st.bucket.creates++;
                return { data: null, error: st.bucket.createError };
              },
            },
          }
        : null,
    isDatabaseConfigured: () => st.configured,
  };
});
vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

/** Módulo fresco: o memo do bucket (e o do bucket das propostas) recomeça. */
async function load() {
  return import("./theme-storage");
}

/** Uma página de listagem do Storage, no formato que o cliente devolve. */
function page(names: string[]) {
  return { data: names.map((name) => ({ id: `id-${name}`, name })), error: null };
}

const NAMES_500 = Array.from({ length: 500 }, (_, i) => `f${i}.jpg`);

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  st.configured = true;
  st.bucket = { exists: true, error: null, createError: null, gets: 0, creates: 0 };
  st.buckets = [];
  st.list.mockResolvedValue(page([]));
  st.remove.mockImplementation(async (paths: string[]) => ({
    data: paths.map((p) => ({ name: p })),
    error: null,
  }));
  st.signed.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
    error: null,
  }));
  st.signOne.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://signed/${path}` },
    error: null,
  }));
  st.copy.mockResolvedValue({ data: { path: "copiado" }, error: null });
  st.download.mockResolvedValue({
    data: { arrayBuffer: async () => new TextEncoder().encode("foto").buffer },
    error: null,
  });
  st.upload.mockResolvedValue({ data: { path: "ok" }, error: null });
});

/**
 * As funções puras de caminhos são o guarda de segurança da biblioteca: os
 * caminhos que chegam do cliente (importar para uma proposta, remover uma
 * foto) são validados SÓ por elas antes de tocar no Storage. Um furo aqui
 * significaria ler/apagar fora da pasta do tema.
 */
describe("isThemePath", () => {
  it("aceita um ficheiro dentro da pasta de um tema", () => {
    expect(isThemePath("tema-1/8f14e45f.jpg")).toBe(true);
    expect(isThemePath("TEMA_2/foto-01.jpeg")).toBe(true);
    expect(isThemePath("t3/a.png")).toBe(true);
    expect(isThemePath("t3/a.webp")).toBe(true);
  });

  it("rejeita travessia de diretórios", () => {
    expect(isThemePath("../proposal-assets/q-1/segredo.jpg")).toBe(false);
    expect(isThemePath("tema/../../etc/passwd.jpg")).toBe(false);
    expect(isThemePath("tema/sub/foto.jpg")).toBe(false);
  });

  it("rejeita URLs, data-URIs e caminhos absolutos", () => {
    expect(isThemePath("https://exemplo.pt/foto.jpg")).toBe(false);
    expect(isThemePath("data:image/jpeg;base64,AAAA")).toBe(false);
    expect(isThemePath("/tema/foto.jpg")).toBe(false);
  });

  it("rejeita extensões não-imagem e valores que não são strings", () => {
    expect(isThemePath("tema/script.svg")).toBe(false);
    expect(isThemePath("tema/malware.exe")).toBe(false);
    expect(isThemePath("tema/sem-extensao")).toBe(false);
    expect(isThemePath("")).toBe(false);
    expect(isThemePath(null)).toBe(false);
    expect(isThemePath(42)).toBe(false);
    expect(isThemePath(["tema/a.jpg"])).toBe(false);
  });
});

describe("themeFolder", () => {
  it("mantém ids normais intactos", () => {
    expect(themeFolder("3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
    );
  });

  it("remove tudo o que poderia escapar da pasta", () => {
    expect(themeFolder("../../etc")).toBe("etc");
    expect(themeFolder("tema/outro")).toBe("temaoutro");
    expect(themeFolder("tema com espaços!")).toBe("temacomespaos");
  });
});

describe("themeIdOfPath", () => {
  it("devolve a pasta de um caminho válido", () => {
    expect(themeIdOfPath("tema-1/foto.jpg")).toBe("tema-1");
  });

  it("devolve vazio para um caminho inválido (nunca um palpite)", () => {
    expect(themeIdOfPath("../fora/foto.jpg")).toBe("");
    expect(themeIdOfPath("foto.jpg")).toBe("");
  });
});

describe("contentTypeForPath", () => {
  it("mapeia a extensão para o content-type da cópia", () => {
    expect(contentTypeForPath("t/a.png")).toBe("image/png");
    expect(contentTypeForPath("t/a.webp")).toBe("image/webp");
    expect(contentTypeForPath("t/a.jpg")).toBe("image/jpeg");
    expect(contentTypeForPath("t/a.JPEG")).toBe("image/jpeg");
  });
});

describe("bucket", () => {
  it("é separado do bucket das propostas", () => {
    expect(THEME_BUCKET).toBe("theme-assets");
  });
});

// ── Bucket: criar só quando falta mesmo ────────────────────────────────────
describe("ensureBucket", () => {
  it("cria o bucket quando ele ainda não existe", async () => {
    st.bucket.exists = false;
    const { listThemeFiles } = await load();
    expect((await listThemeFiles("t-1")).ok).toBe(true);
    expect(st.bucket.creates).toBe(1);
  });

  it("NÃO cria o bucket quando o getBucket falha por avaria — e reporta ilegível", async () => {
    // Um 500 do Storage não é "o bucket não existe": criá-lo às cegas mascarava
    // a avaria e a pasta apareceria vazia.
    st.bucket.exists = false;
    st.bucket.error = { status: 500, message: "Internal error" };
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: false, truncated: false });
    expect(st.bucket.creates).toBe(0);
  });

  it("não fixa a avaria: a chamada seguinte volta a tentar", async () => {
    st.bucket.exists = false;
    st.bucket.error = { status: 503, message: "Service unavailable" };
    const { listThemeFiles } = await load();
    expect((await listThemeFiles("t-1")).ok).toBe(false);
    st.bucket.exists = true;
    expect((await listThemeFiles("t-1")).ok).toBe(true);
  });

  it("verifica o bucket UMA vez, mesmo com listagens em paralelo", async () => {
    const { listThemeFiles } = await load();
    await Promise.all([listThemeFiles("t-1"), listThemeFiles("t-2"), listThemeFiles("t-3")]);
    expect(st.bucket.gets).toBe(1);
  });
});

// ── Listar sem assinar ─────────────────────────────────────────────────────
describe("listThemeFiles", () => {
  it("devolve os nomes dos ficheiros reais da pasta", async () => {
    st.list.mockResolvedValue({
      data: [
        { id: "1", name: "a.jpg" },
        { id: null, name: "subpasta" }, // marcador de pasta: não é ficheiro
        { id: "2", name: ".emptyFolderPlaceholder" },
        { id: "3", name: "b.png" },
      ],
      error: null,
    });
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({
      names: ["a.jpg", "b.png"],
      ok: true,
      truncated: false,
    });
  });

  it("distingue pasta VAZIA de pasta ILEGÍVEL", async () => {
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: true, truncated: false });

    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: false, truncated: false });
  });

  it("assinala truncated quando a página vem cheia (a contagem é um mínimo)", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.jpg"]));
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1", 2)).toMatchObject({ truncated: true });
    expect(await listThemeFiles("t-1", 3)).toMatchObject({ truncated: false });
  });

  it("é ilegível — não vazia — sem Storage configurado", async () => {
    st.configured = false;
    const { listThemeFiles } = await load();
    expect(await listThemeFiles("t-1")).toEqual({ names: [], ok: false, truncated: false });
  });

  it("pede a página ao Storage com o offset recebido", async () => {
    const { listThemeFiles } = await load();
    await listThemeFiles("t-1", 100, 200);
    expect(st.list).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ limit: 100, offset: 200 }),
    );
  });
});

// ── Listar com URL assinado (a camada fina por cima) ───────────────────────
describe("listThemeImages", () => {
  it("assina os caminhos de uma só vez e mantém a ordem da pasta", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.png"]));
    const { listThemeImages } = await load();
    expect(await listThemeImages("t-1")).toEqual([
      { path: "t-1/a.jpg", url: "https://signed/t-1/a.jpg" },
      { path: "t-1/b.png", url: "https://signed/t-1/b.png" },
    ]);
    expect(st.signed).toHaveBeenCalledTimes(1);
    expect(st.signed).toHaveBeenCalledWith(["t-1/a.jpg", "t-1/b.png"], expect.any(Number));
  });

  it("devolve [] sem assinar nada quando a pasta é ilegível", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { listThemeImages } = await load();
    expect(await listThemeImages("t-1")).toEqual([]);
    expect(st.signed).not.toHaveBeenCalled();
  });
});

describe("signThemePaths", () => {
  it("assina caminhos de temas DIFERENTES num único pedido", async () => {
    const { signThemePaths } = await load();
    const urls = await signThemePaths(["t-1/a.jpg", "t-2/b.jpg"]);
    expect(st.signed).toHaveBeenCalledTimes(1);
    expect(urls.get("t-2/b.jpg")).toBe("https://signed/t-2/b.jpg");
  });

  it("não toca no Storage para uma lista vazia", async () => {
    const { signThemePaths } = await load();
    expect((await signThemePaths([])).size).toBe(0);
    expect(st.signed).not.toHaveBeenCalled();
  });
});

// ── Esvaziar a pasta ao eliminar o tema ────────────────────────────────────
describe("deleteThemeFolder", () => {
  it("pagina até uma página curta — um tema com mais de 500 fotos não deixa órfãs", async () => {
    st.list
      .mockResolvedValueOnce(page(NAMES_500))
      .mockResolvedValueOnce(page(["x.jpg", "y.jpg", "z.jpg"]));
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: true, removed: 503 });
    expect(st.list.mock.calls.map((c) => (c[1] as { offset: number }).offset)).toEqual([0, 500]);
    expect(st.remove).toHaveBeenCalledTimes(2);
    expect(st.remove).toHaveBeenLastCalledWith(["t-1/x.jpg", "t-1/y.jpg", "t-1/z.jpg"]);
  });

  it("recusa (e não apaga nada) quando a listagem falha", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: false, removed: 0 });
    expect(st.remove).not.toHaveBeenCalled();
  });

  it("recusa quando a remoção falha, dizendo quantas já tinham saído", async () => {
    st.list
      .mockResolvedValueOnce(page(NAMES_500))
      .mockResolvedValueOnce(page(["x.jpg"]))
      .mockResolvedValue(page([]));
    st.remove.mockResolvedValueOnce({ data: NAMES_500.map((n) => ({ name: n })), error: null });
    st.remove.mockResolvedValueOnce({ data: null, error: { message: "sem permissões" } });
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: false, removed: 500 });
  });

  it("recusa sem Storage — o tema tem de continuar lá para se poder repetir", async () => {
    st.configured = false;
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: false, removed: 0 });
  });
});

// ── Cópia tema → proposta ──────────────────────────────────────────────────
describe("copyThemeImageToProposal", () => {
  it("copia dentro do Storage, sem puxar os bytes para cá", async () => {
    const { copyThemeImageToProposal } = await load();
    const res = await copyThemeImageToProposal("t-1/a.jpg", "q-42");
    expect(res?.path).toMatch(/^q-42\/[0-9a-f-]+\.jpg$/);
    expect(res?.url).toBe(`https://signed/${res?.path}`);
    // Destino construído no servidor, no bucket das propostas.
    expect(st.copy).toHaveBeenCalledWith("t-1/a.jpg", res?.path, {
      destinationBucket: "proposal-assets",
    });
    expect(st.download).not.toHaveBeenCalled();
    expect(st.upload).not.toHaveBeenCalled();
  });

  it("mantém a extensão da foto de origem", async () => {
    const { copyThemeImageToProposal } = await load();
    expect((await copyThemeImageToProposal("t-1/a.png", "q-1"))?.path).toMatch(/\.png$/);
    expect((await copyThemeImageToProposal("t-1/a.webp", "q-1"))?.path).toMatch(/\.webp$/);
    expect((await copyThemeImageToProposal("t-1/a.jpeg", "q-1"))?.path).toMatch(/\.jpg$/);
  });

  it("recorre a descarregar + carregar quando o Storage recusa a cópia", async () => {
    st.copy.mockResolvedValue({ data: null, error: { message: "not supported" } });
    const { copyThemeImageToProposal } = await load();
    const res = await copyThemeImageToProposal("t-1/a.jpg", "q-42");
    expect(res?.path).toMatch(/^q-42\/[0-9a-f-]+\.jpg$/);
    expect(st.download).toHaveBeenCalledWith("t-1/a.jpg");
    expect(st.upload).toHaveBeenCalledWith(
      res?.path,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
  });

  it("devolve null quando também o recurso falha", async () => {
    st.copy.mockResolvedValue({ data: null, error: { message: "não" } });
    st.download.mockResolvedValue({ data: null, error: { message: "não" } });
    const { copyThemeImageToProposal } = await load();
    expect(await copyThemeImageToProposal("t-1/a.jpg", "q-1")).toBeNull();
  });

  it("recusa um caminho que não é do bucket de temas SEM tocar no Storage", async () => {
    const { copyThemeImageToProposal } = await load();
    expect(await copyThemeImageToProposal("../proposal-assets/q-9/privada.jpg", "q-1")).toBeNull();
    expect(await copyThemeImageToProposal("https://exemplo.pt/a.jpg", "q-1")).toBeNull();
    expect(st.buckets).toEqual([]);
    expect(st.copy).not.toHaveBeenCalled();
    expect(st.download).not.toHaveBeenCalled();
  });
});
