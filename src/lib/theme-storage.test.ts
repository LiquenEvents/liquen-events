import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isThemePath,
  planOrderedPage,
  themeFolder,
  themeIdOfPath,
  contentTypeForPath,
  THEME_BUCKET,
  THEME_THUMB_BUCKET,
  SIGNED_TTL,
} from "./theme-storage";

/**
 * Duplo do Supabase Storage. `getSupabase` devolve um cliente construído a
 * partir deste estado, para podermos encenar as avarias que interessam: o
 * bucket em falta, o bucket ilegível, a listagem a falhar, a cópia recusada.
 * Cada teste corre num módulo fresco (`vi.resetModules`) porque o
 * theme-storage memoiza a verificação do bucket entre chamadas.
 */
const bucketState = () => ({
  exists: true,
  error: null as unknown,
  createError: null as { message: string } | null,
  gets: 0,
  creates: 0,
});

const st = vi.hoisted(() => ({
  configured: true,
  bucket: {
    exists: true,
    error: null as unknown,
    createError: null as { message: string } | null,
    gets: 0,
    creates: 0,
  },
  // O bucket das MINIATURAS é outro, com vida própria: numa instalação antiga
  // pode nem existir, e a biblioteca tem de continuar a funcionar na mesma.
  thumbBucket: {
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
  thumbList: vi.fn(),
  thumbRemove: vi.fn(),
  thumbSigned: vi.fn(),
  thumbSignOne: vi.fn(),
  thumbUpload: vi.fn(),
  // ── Carregamento DIRETO ──────────────────────────────────────────────
  /** Esta instalação sabe emitir URLs de carregamento? Um Supabase antigo
   *  não sabe, e é isso que faz o cliente cair para o multipart. */
  hasUploadUrlApi: true,
  uploadUrl: vi.fn(),
  thumbUploadUrl: vi.fn(),
  updateBucket: vi.fn(),
}));

/** Veredicto que a verificação de dimensões devolve — encenado por teste. */
const insp = vi.hoisted(() => ({ verdict: { ok: true, reason: "" } }));

// A verificação real lê o cabeçalho da imagem por HTTP e chama o `sharp`;
// aqui o que se está a provar é OUTRA coisa (o que a confirmação faz com o
// veredicto), por isso o veredicto é encenado e o resto de `proposal-storage`
// fica real — `copyThemeImageToProposal` depende dele.
vi.mock("./proposal-storage", async () => {
  const real = await vi.importActual<typeof import("./proposal-storage")>("./proposal-storage");
  return {
    ...real,
    inspectStoredImage: vi.fn(async () => insp.verdict),
    removeStoredObject: vi.fn(async () => {}),
  };
});

vi.mock("./supabase", () => {
  const from = (bucket: string) => {
    st.buckets.push(bucket);
    const thumbs = bucket === "theme-thumbs";
    return {
      list: thumbs ? st.thumbList : st.list,
      remove: thumbs ? st.thumbRemove : st.remove,
      createSignedUrls: thumbs ? st.thumbSigned : st.signed,
      createSignedUrl: thumbs ? st.thumbSignOne : st.signOne,
      copy: st.copy,
      download: st.download,
      upload: thumbs ? st.thumbUpload : st.upload,
      ...(st.hasUploadUrlApi
        ? { createSignedUploadUrl: thumbs ? st.thumbUploadUrl : st.uploadUrl }
        : {}),
    };
  };
  const stateOf = (name: string) => (name === "theme-thumbs" ? st.thumbBucket : st.bucket);
  return {
    getSupabase: () =>
      st.configured
        ? {
            storage: {
              from,
              getBucket: async (name: string) => {
                const b = stateOf(name);
                b.gets++;
                return b.exists ? { data: { name }, error: null } : { data: null, error: b.error };
              },
              createBucket: async (name: string) => {
                const b = stateOf(name);
                b.creates++;
                return { data: null, error: b.createError };
              },
              updateBucket: st.updateBucket,
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
  st.bucket = bucketState();
  st.thumbBucket = bucketState();
  st.buckets = [];
  st.list.mockResolvedValue(page([]));
  st.thumbList.mockResolvedValue(page([]));
  st.thumbRemove.mockImplementation(async (paths: string[]) => ({
    data: paths.map((p) => ({ name: p })),
    error: null,
  }));
  // Por omissão TODAS as fotos têm miniatura; os testes que interessam mexem
  // nisto (miniatura em falta, bucket inexistente, assinatura recusada).
  st.thumbSigned.mockImplementation(async (paths: string[]) => ({
    data: paths.map((path) => ({ path, signedUrl: `https://thumb/${path}` })),
    error: null,
  }));
  st.thumbSignOne.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://thumb/${path}` },
    error: null,
  }));
  st.thumbUpload.mockResolvedValue({ data: { path: "ok" }, error: null });
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
  st.hasUploadUrlApi = true;
  insp.verdict = { ok: true, reason: "" };
  st.updateBucket.mockResolvedValue({ data: null, error: null });
  st.uploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://upload/theme-assets/${path}?token=tok`, token: "tok", path },
    error: null,
  }));
  st.thumbUploadUrl.mockImplementation(async (path: string) => ({
    data: { signedUrl: `https://upload/theme-thumbs/${path}?token=tuk`, token: "tuk", path },
    error: null,
  }));
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

  it("as miniaturas vivem noutro bucket, privado e à parte", () => {
    expect(THEME_THUMB_BUCKET).toBe("theme-thumbs");
    expect(THEME_THUMB_BUCKET).not.toBe(THEME_BUCKET);
  });
});

describe("validade dos URLs assinados", () => {
  // Eram 10 anos: num bucket com milhares de fotos, cada URL que escapasse
  // ficava a servi-las para sempre. Tem de cobrir um dia de trabalho e nada
  // mais — as rotas voltam a assinar a cada pedido.
  it("dura horas, não anos", () => {
    expect(SIGNED_TTL).toBeGreaterThanOrEqual(60 * 60);
    expect(SIGNED_TTL).toBeLessThanOrEqual(60 * 60 * 24);
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

// ── Contar sem assinar ─────────────────────────────────────────────────────
describe("countThemeFiles", () => {
  it("soma as páginas até uma página curta", async () => {
    st.list
      .mockResolvedValueOnce(page(["a.jpg", "b.jpg"]))
      .mockResolvedValueOnce(page(["c.jpg"]))
      .mockResolvedValue(page([]));
    const { countThemeFiles } = await load();
    expect(await countThemeFiles("t-1", 5, 2)).toEqual({ total: 3, ok: true, truncated: false });
    expect(st.signed).not.toHaveBeenCalled();
  });

  it("para no teto de páginas e diz que o total é um MÍNIMO", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.jpg"]));
    const { countThemeFiles } = await load();
    expect(await countThemeFiles("t-1", 2, 2)).toEqual({ total: 4, ok: true, truncated: true });
    expect(st.list).toHaveBeenCalledTimes(2);
  });

  it("uma pasta ilegível não é '0 fotos'", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { countThemeFiles } = await load();
    expect(await countThemeFiles("t-1")).toEqual({ total: 0, ok: false, truncated: false });
  });
});

// ── Uma página, assinada (originais + miniaturas) ──────────────────────────
describe("listThemeImagePage", () => {
  it("assina SÓ a página pedida, num pedido por bucket", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.png"]));
    const { listThemeImagePage } = await load();
    const res = await listThemeImagePage("t-1", 2, 0);
    expect(res.images).toEqual([
      { path: "t-1/a.jpg", url: "https://signed/t-1/a.jpg", thumbUrl: "https://thumb/t-1/a.jpg" },
      { path: "t-1/b.png", url: "https://signed/t-1/b.png", thumbUrl: "https://thumb/t-1/b.png" },
    ]);
    expect(st.signed).toHaveBeenCalledTimes(1);
    expect(st.thumbSigned).toHaveBeenCalledTimes(1);
    // A MESMA chave nos dois buckets — é o que dispensa qualquer índice.
    expect(st.signed).toHaveBeenCalledWith(["t-1/a.jpg", "t-1/b.png"], expect.any(Number));
    expect(st.thumbSigned).toHaveBeenCalledWith(["t-1/a.jpg", "t-1/b.png"], expect.any(Number));
  });

  it("pede ao Storage exatamente a janela recebida", async () => {
    const { listThemeImagePage } = await load();
    await listThemeImagePage("t-1", 40, 120);
    expect(st.list).toHaveBeenCalledWith(
      "t-1",
      expect.objectContaining({ limit: 40, offset: 120 }),
    );
  });

  it("corta um limite absurdo em vez de mandar assinar a biblioteca toda", async () => {
    const { listThemeImagePage } = await load();
    await listThemeImagePage("t-1", 5000, -3);
    expect(st.list).toHaveBeenCalledWith("t-1", expect.objectContaining({ limit: 200, offset: 0 }));
  });

  it("uma foto SEM miniatura fica com o original (fotos anteriores às miniaturas)", async () => {
    st.list.mockResolvedValue(page(["velha.jpg", "nova.jpg"]));
    // O Storage devolve erro por item para o que não existe.
    st.thumbSigned.mockResolvedValue({
      data: [
        { path: "t-1/velha.jpg", signedUrl: null, error: "Object not found" },
        { path: "t-1/nova.jpg", signedUrl: "https://thumb/t-1/nova.jpg", error: null },
      ],
      error: null,
    });
    const { listThemeImagePage } = await load();
    const { images } = await listThemeImagePage("t-1", 10, 0);
    expect(images[0]).toEqual({ path: "t-1/velha.jpg", url: "https://signed/t-1/velha.jpg" });
    expect(images[1].thumbUrl).toBe("https://thumb/t-1/nova.jpg");
  });

  it("o bucket das miniaturas nem existir não estraga nada", async () => {
    st.list.mockResolvedValue(page(["a.jpg"]));
    st.thumbSigned.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });
    const { listThemeImagePage } = await load();
    const { ok, images } = await listThemeImagePage("t-1", 10, 0);
    expect(ok).toBe(true);
    expect(images).toEqual([{ path: "t-1/a.jpg", url: "https://signed/t-1/a.jpg" }]);
    // E não o cria: um bucket vazio não serve para nada.
    expect(st.thumbBucket.creates).toBe(0);
  });

  it("a primeira página curta JÁ é o total — sem outra ida ao Storage", async () => {
    st.list.mockResolvedValue(page(["a.jpg", "b.jpg"]));
    const { listThemeImagePage } = await load();
    expect(await listThemeImagePage("t-1", 10, 0)).toMatchObject({ total: 2, truncated: false });
    expect(st.list).toHaveBeenCalledTimes(1);
  });

  it("conta a pasta quando a página vem cheia — o total não é o da página", async () => {
    st.list
      .mockResolvedValueOnce(page(["a.jpg", "b.jpg"])) // a página pedida (cheia)
      .mockResolvedValue(page(NAMES_500)); // a contagem, numa página só
    const { listThemeImagePage } = await load();
    const res = await listThemeImagePage("t-1", 2, 0);
    expect(res.images).toHaveLength(2);
    expect(res).toMatchObject({ total: 500, truncated: false });
  });

  it("pasta ilegível: ok=false e nada assinado (nunca 'tema sem fotos')", async () => {
    st.list.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { listThemeImagePage } = await load();
    expect(await listThemeImagePage("t-1", 10, 0)).toEqual({
      ok: false,
      images: [],
      total: 0,
      truncated: false,
    });
    expect(st.signed).not.toHaveBeenCalled();
    expect(st.thumbSigned).not.toHaveBeenCalled();
  });

  it("página lida mas contagem falhada: total é um mínimo honesto", async () => {
    st.list
      .mockResolvedValueOnce(page(["a.jpg", "b.jpg"]))
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const { listThemeImagePage } = await load();
    expect(await listThemeImagePage("t-1", 2, 10)).toMatchObject({
      ok: true,
      total: 12,
      truncated: true,
    });
  });
});

// ── Miniaturas: carregar, apagar, nunca mandar em nada ─────────────────────
describe("miniaturas", () => {
  it("guarda a miniatura na MESMA chave, no bucket das miniaturas", async () => {
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", {
      bytes: Buffer.from("mini"),
      contentType: "image/jpeg",
    });
    expect(res?.path).toMatch(/^t-1\/[0-9a-f-]+\.jpg$/);
    expect(res?.thumbUrl).toBe(`https://thumb/${res?.path}`);
    expect(st.thumbUpload).toHaveBeenCalledWith(
      res?.path,
      expect.any(Buffer),
      expect.objectContaining({ contentType: "image/jpeg" }),
    );
    expect(st.buckets).toContain(THEME_THUMB_BUCKET);
  });

  it("cria o bucket das miniaturas no primeiro uso — e só nesse", async () => {
    st.thumbBucket.exists = false;
    const { uploadThemeImage } = await load();
    const thumb = { bytes: Buffer.from("mini"), contentType: "image/jpeg" };
    await Promise.all([
      uploadThemeImage("t-1", Buffer.from("a"), "image/jpeg", thumb),
      uploadThemeImage("t-1", Buffer.from("b"), "image/jpeg", thumb),
    ]);
    expect(st.thumbBucket.gets).toBe(1);
    expect(st.thumbBucket.creates).toBe(1);
  });

  it("uma miniatura que falha NÃO deita o carregamento abaixo", async () => {
    st.thumbUpload.mockResolvedValue({ data: null, error: { message: "sem permissões" } });
    const { uploadThemeImage } = await load();
    const res = await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg", {
      bytes: Buffer.from("mini"),
      contentType: "image/jpeg",
    });
    expect(res?.url).toBeTruthy();
    expect(res?.thumbUrl).toBeUndefined();
  });

  it("sem miniatura enviada não se toca no bucket das miniaturas", async () => {
    const { uploadThemeImage } = await load();
    await uploadThemeImage("t-1", Buffer.from("foto"), "image/jpeg");
    expect(st.buckets).not.toContain(THEME_THUMB_BUCKET);
    expect(st.thumbUpload).not.toHaveBeenCalled();
  });

  it("apagar uma foto leva a miniatura com ela", async () => {
    const { deleteThemeImage } = await load();
    expect(await deleteThemeImage("t-1/a.jpg")).toBe(true);
    expect(st.remove).toHaveBeenCalledWith(["t-1/a.jpg"]);
    expect(st.thumbRemove).toHaveBeenCalledWith(["t-1/a.jpg"]);
  });

  it("a miniatura que não sai não impede apagar a foto", async () => {
    st.thumbRemove.mockResolvedValue({ data: null, error: { message: "boom" } });
    const { deleteThemeImage } = await load();
    expect(await deleteThemeImage("t-1/a.jpg")).toBe(true);
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

  it("leva também as miniaturas do tema", async () => {
    st.list.mockResolvedValueOnce(page(["a.jpg"])).mockResolvedValue(page([]));
    st.thumbList.mockResolvedValueOnce(page(["a.jpg"])).mockResolvedValue(page([]));
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: true, removed: 1 });
    expect(st.thumbRemove).toHaveBeenCalledWith(["t-1/a.jpg"]);
  });

  it("miniaturas que não se conseguem apagar NÃO impedem eliminar o tema", async () => {
    st.list.mockResolvedValueOnce(page(["a.jpg"])).mockResolvedValue(page([]));
    st.thumbList.mockResolvedValue({ data: null, error: { message: "Bucket not found" } });
    const { deleteThemeFolder } = await load();
    expect(await deleteThemeFolder("t-1")).toEqual({ ok: true, removed: 1 });
  });

  it("não apaga miniaturas quando as fotos ficaram por apagar", async () => {
    // Senão a grelha do tema (que continua lá) passava a puxar originais.
    st.list.mockResolvedValue(page(["a.jpg"]));
    st.remove.mockResolvedValue({ data: null, error: { message: "sem permissões" } });
    const { deleteThemeFolder } = await load();
    expect((await deleteThemeFolder("t-1")).ok).toBe(false);
    expect(st.thumbRemove).not.toHaveBeenCalled();
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

// ── A ordem arrumada à mão manda no início da lista ────────────────────────
describe("bilhetes de carregamento direto", () => {
  it("constrói o caminho NO SERVIDOR, dentro da pasta do tema", async () => {
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets("tema-1", ["image/jpeg", "image/png"]);

    expect(tickets).toHaveLength(2);
    // O que o cliente pediu foi só o TIPO; a pasta e o nome saem daqui.
    expect(tickets![0].path).toMatch(/^tema-1\/[0-9a-f-]{36}\.jpg$/);
    expect(tickets![1].path).toMatch(/^tema-1\/[0-9a-f-]{36}\.png$/);
    // Dois bilhetes nunca apontam ao mesmo sítio.
    expect(tickets![0].path).not.toBe(tickets![1].path);
    // A miniatura vai na MESMA chave, no bucket das miniaturas.
    expect(tickets![0].thumb?.path).toBe(tickets![0].path);
  });

  it("um id de tema com travessia é limpo antes de virar pasta", async () => {
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets("../../etc", ["image/jpeg"]);

    // `themeFolder` come os caracteres perigosos: sobra "etc", nunca um
    // caminho que saia do bucket.
    expect(tickets![0].path).toMatch(/^etc\//);
    expect(tickets![0].path).not.toContain("..");
  });

  it("emite sempre com upsert desligado — um bilhete não substitui nada", async () => {
    const { createThemeUploadTickets } = await load();
    await createThemeUploadTickets("tema-1", ["image/jpeg"]);

    expect(st.uploadUrl).toHaveBeenCalledWith(expect.any(String), { upsert: false });
  });

  it("corta o pedido no teto de bilhetes", async () => {
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets(
      "tema-1",
      Array.from({ length: 100 }, () => "image/jpeg"),
    );

    expect(tickets!.length).toBeLessThanOrEqual(24);
  });

  it("um Storage que não sabe emitir URLs devolve null — o cliente cai para o multipart", async () => {
    st.hasUploadUrlApi = false;
    const { createThemeUploadTickets } = await load();

    expect(await createThemeUploadTickets("tema-1", ["image/jpeg"])).toBeNull();
  });

  it("se UM bilhete falhar, não sai nenhum (nada de lotes com buracos)", async () => {
    st.uploadUrl.mockResolvedValueOnce({ data: null, error: { message: "não" } });
    const { createThemeUploadTickets } = await load();

    expect(await createThemeUploadTickets("tema-1", ["image/jpeg", "image/jpeg"])).toBeNull();
  });

  it("sem bucket de miniaturas, a foto sobe na mesma e fica sem miniatura", async () => {
    st.thumbBucket.exists = false;
    st.thumbBucket.createError = { message: "recusado" };
    const { createThemeUploadTickets } = await load();
    const tickets = await createThemeUploadTickets("tema-1", ["image/jpeg"]);

    expect(tickets).toHaveLength(1);
    expect(tickets![0].thumb).toBeNull();
  });
});

describe("confirmação de carregamentos diretos", () => {
  it("assina as boas e devolve-as com miniatura", async () => {
    const { confirmThemeUploads } = await load();
    const res = await confirmThemeUploads("tema-1", ["tema-1/foto.jpg"]);

    expect(res.rejected).toEqual([]);
    expect(res.images).toEqual([
      {
        path: "tema-1/foto.jpg",
        url: "https://signed/tema-1/foto.jpg",
        thumbUrl: "https://thumb/tema-1/foto.jpg",
      },
    ]);
  });

  it("RECUSA um caminho da pasta de outro tema, sem lhe tocar", async () => {
    const { confirmThemeUploads } = await load();
    const res = await confirmThemeUploads("tema-1", [
      "tema-2/roubada.jpg",
      "../proposal-assets/q-1/segredo.jpg",
      "tema-1/minha.jpg",
    ]);

    // Só a que é mesmo desta pasta é assinada. As outras nem chegam ao Storage.
    expect(res.images.map((i) => i.path)).toEqual(["tema-1/minha.jpg"]);
    expect(res.rejected).toContain("tema-2/roubada.jpg");
    expect(res.rejected).toContain("../proposal-assets/q-1/segredo.jpg");
  });

  it("uma imagem que não passa na verificação é APAGADA e reportada", async () => {
    insp.verdict = { ok: false, reason: "dimensoes-excessivas" };
    const { confirmThemeUploads } = await load();
    const proposal = await import("./proposal-storage");
    const res = await confirmThemeUploads("tema-1", ["tema-1/bomba.png"]);

    expect(res.images).toEqual([]);
    expect(res.rejected).toEqual(["tema-1/bomba.png"]);
    // Sai o original E a miniatura — nada de lixo órfão no bucket.
    expect(proposal.removeStoredObject).toHaveBeenCalledWith("theme-assets", "tema-1/bomba.png");
    expect(proposal.removeStoredObject).toHaveBeenCalledWith("theme-thumbs", "tema-1/bomba.png");
  });
});

describe("memória curta da contagem", () => {
  it("a segunda contagem não volta a ler a pasta", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles } = await load();

    const first = await countThemeFiles("tema-1");
    const calls = st.list.mock.calls.length;
    const second = await countThemeFiles("tema-1");

    expect(second).toEqual(first);
    expect(st.list.mock.calls.length).toBe(calls);
  });

  it("carregar uma foto deita a contagem fora", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles, uploadThemeImage } = await load();

    await countThemeFiles("tema-1");
    const calls = st.list.mock.calls.length;
    await uploadThemeImage("tema-1", Buffer.from("foto"), "image/jpeg");
    await countThemeFiles("tema-1");

    // Contou outra vez: o número que a Catarina vê muda quando ela mexe.
    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it("uma contagem TRUNCADA nunca fica guardada — é um mínimo, não um total", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles } = await load();

    // Teto de 1 página com páginas cheias: o resultado sai truncado.
    const first = await countThemeFiles("tema-1", 1, 500);
    expect(first.truncated).toBe(true);
    const calls = st.list.mock.calls.length;
    await countThemeFiles("tema-1", 1, 500);

    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });

  it("cada tema tem a sua contagem", async () => {
    st.list.mockResolvedValue(page(NAMES_500));
    const { countThemeFiles } = await load();

    await countThemeFiles("tema-1");
    const calls = st.list.mock.calls.length;
    await countThemeFiles("tema-2");

    expect(st.list.mock.calls.length).toBeGreaterThan(calls);
  });
});

describe("planOrderedPage", () => {
  const order = ["t/a.jpg", "t/b.jpg", "t/c.jpg"];

  it("serve o prefixo arrumado antes de tocar na pasta", () => {
    expect(planOrderedPage(order, 2, 0)).toEqual({
      fromOrder: ["t/a.jpg", "t/b.jpg"],
      storageSkip: 0,
      needFromStorage: 0,
    });
  });

  it("completa a página com a pasta quando o prefixo acaba a meio", () => {
    expect(planOrderedPage(order, 5, 0)).toEqual({
      fromOrder: order,
      storageSkip: 0,
      needFromStorage: 2,
    });
  });

  it("depois do prefixo, a pasta continua de onde ficou", () => {
    // Offset 5 com 3 arrumadas: já se mostraram as 3 + 2 da pasta.
    expect(planOrderedPage(order, 4, 5)).toEqual({
      fromOrder: [],
      storageSkip: 2,
      needFromStorage: 4,
    });
  });

  it("sem ordem manual é exatamente o comportamento de sempre", () => {
    expect(planOrderedPage([], 60, 120)).toEqual({
      fromOrder: [],
      storageSkip: 120,
      needFromStorage: 60,
    });
  });
});
