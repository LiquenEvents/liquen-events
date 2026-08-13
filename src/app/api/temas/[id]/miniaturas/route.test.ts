import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextRequest } from "next/server";
import type { ProposalTheme } from "@/lib/theme-types";

/**
 * MINIATURAS EM FALTA — a rede de segurança do remendo.
 *
 * O que aqui se fixa é o que faz esta rota poder ser usada numa biblioteca a
 * sério: que RETOMA de onde ficou, que SALTA o que já está feito, que uma foto
 * má não trava as 3999 seguintes, e — o que mais importa — que NUNCA escreve
 * no bucket dos originais nem fora da pasta do tema, por muito que o corpo do
 * pedido tente.
 */

const st = vi.hoisted(() => ({
  authed: true,
  dbConfigured: true,
  themes: [] as ProposalTheme[],
  /** Nomes na pasta das FOTOS (mais recentes primeiro). */
  photos: [] as string[],
  /** Nomes que já têm miniatura. */
  thumbs: [] as string[],
  /** A listagem da pasta das fotos falha. */
  listBroken: false,
  /** A listagem das miniaturas falha. */
  thumbListBroken: false,
  /** Fotos cujos bytes não se conseguem ler. */
  unreadable: new Set<string>(),
  /** Tudo o que foi escrito: `bucket → [{path, upsert}]`. */
  writes: [] as { bucket: string; path: string; upsert?: boolean; bytes: number }[],
  /** Buckets que existiam antes do pedido. */
  buckets: new Set<string>(),
  created: [] as string[],
}));

vi.mock("@/lib/admin-auth", () => ({ isAuthed: () => st.authed }));
vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/themes-store", () => ({
  getTheme: vi.fn(async (id: string) => st.themes.find((t) => t.id === id) ?? null),
}));

// Um JPEG a sério: a rota gera a miniatura com o `sharp` verdadeiro, por isso
// os bytes têm de ser mesmo uma imagem.
const jpegBytes = await (async () => {
  const sharp = (await import("sharp")).default;
  return sharp({
    create: { width: 1200, height: 800, channels: 3, background: { r: 200, g: 120, b: 60 } },
  })
    .jpeg()
    .toBuffer();
})();

vi.mock("@/lib/supabase", () => ({
  isDatabaseConfigured: () => st.dbConfigured,
  getSupabase: () => ({
    storage: {
      getBucket: async (b: string) => ({
        data: st.buckets.has(b) ? { name: b } : null,
        error: st.buckets.has(b) ? null : { message: "not found", status: 404 },
      }),
      createBucket: async (b: string) => {
        st.created.push(b);
        st.buckets.add(b);
        return { error: null };
      },
      from: (bucket: string) => ({
        list: async (_folder: string, opts: { limit: number; offset: number }) => {
          if (bucket === "theme-thumbs") {
            if (st.thumbListBroken) return { data: null, error: { message: "down" } };
            return {
              data: st.thumbs
                .slice(opts.offset, opts.offset + opts.limit)
                .map((name) => ({ name, id: name })),
              error: null,
            };
          }
          return { data: [], error: null };
        },
        upload: async (path: string, bytes: Buffer, o?: { upsert?: boolean }) => {
          st.writes.push({ bucket, path, upsert: o?.upsert, bytes: bytes.byteLength });
          return { error: null };
        },
      }),
    },
  }),
}));

vi.mock("@/lib/theme-storage", async () => {
  const real = await vi.importActual<typeof import("@/lib/theme-storage")>("@/lib/theme-storage");
  return {
    ...real,
    listThemeFiles: vi.fn(async (_id: string, limit: number, offset: number) => {
      if (st.listBroken) return { names: [], ok: false, truncated: false };
      const page = st.photos.slice(offset, offset + limit);
      return { names: page, ok: true, truncated: page.length >= limit };
    }),
    fetchThemeImageBytes: vi.fn(async (path: string) =>
      st.unreadable.has(path.split("/")[1]) ? null : jpegBytes,
    ),
    countThemeFiles: vi.fn(async () => ({
      total: st.photos.length,
      ok: true,
      truncated: false,
    })),
  };
});

type Handler = typeof import("./route").POST;
/** A rota guarda em memória, durante 30 s, os nomes das miniaturas que já viu
 *  (é o que evita relistar o bucket a cada lote). Cada teste recarrega o
 *  módulo para começar com essa memória limpa — senão o teste anterior
 *  respondia por este. */
let POST: Handler;

type Ctx = { params: Promise<{ id: string }> };

function post(bodyJson: unknown, id = "t-1"): [NextRequest, Ctx] {
  const r = new Request(`https://liquen.test/api/temas/${id}/miniaturas`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(bodyJson),
  }) as unknown as NextRequest;
  return [r, { params: Promise.resolve({ id }) }];
}

const names = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `foto-${String(from + i).padStart(4, "0")}.jpg`);

beforeEach(async () => {
  vi.resetModules();
  ({ POST } = await import("./route"));
  st.authed = true;
  st.dbConfigured = true;
  st.themes = [
    {
      id: "t-1",
      name: "Terracotta",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  st.photos = [];
  st.thumbs = [];
  st.listBroken = false;
  st.thumbListBroken = false;
  st.unreadable = new Set();
  st.writes = [];
  st.buckets = new Set(["theme-assets"]);
  st.created = [];
  vi.clearAllMocks();
});

describe("gerar miniaturas em falta", () => {
  it("recusa quem não tem sessão de admin", async () => {
    st.authed = false;
    const res = await POST(...post({}));
    expect(res.status).toBe(401);
    expect(st.writes).toHaveLength(0);
  });

  it("gera só o que falta e escreve SÓ no bucket das miniaturas", async () => {
    st.photos = names(3);
    st.thumbs = [st.photos[1]]; // a do meio já tem

    const res = await POST(...post({}));
    const data = await res.json();

    expect(data).toMatchObject({ ok: true, generated: 2, skipped: 1, failed: 0, scanned: 3 });
    // Fim da pasta: não há mais nada para percorrer.
    expect(data.nextCursor).toBeNull();
    // Nem um byte escrito no bucket dos ORIGINAIS — são o ativo, e esta rota
    // não tem nada que lhes tocar.
    expect(st.writes.every((w) => w.bucket === "theme-thumbs")).toBe(true);
    expect(st.writes.map((w) => w.path).sort()).toEqual(["t-1/foto-0000.jpg", "t-1/foto-0002.jpg"]);
    // A miniatura é MESMO pequena (o original de 1200 px pesa muito mais).
    expect(st.writes.every((w) => w.bytes > 0 && w.bytes < 60_000)).toBe(true);
  });

  it("a miniatura tem a mesma chave do original e escreve por cima (repetível)", async () => {
    st.photos = names(1);
    await POST(...post({}));
    await POST(...post({}));
    expect(st.writes[0].path).toBe("t-1/foto-0000.jpg");
    expect(st.writes.every((w) => w.upsert === true)).toBe(true);
  });

  it("corta o lote e devolve por onde continuar — é isto que a torna retomável", async () => {
    st.photos = names(30);

    const first = await (await POST(...post({}))).json();
    // Oito por pedido: o lote é curto de propósito, para caber no tempo de uma
    // função e para a barra andar.
    expect(first.generated).toBe(8);
    expect(first.nextCursor).toBe(8);

    // Retomar do cursor devolvido continua exatamente onde ficou.
    st.thumbs = st.writes.map((w) => w.path.split("/")[1]);
    st.writes = [];
    const second = await (await POST(...post({ cursor: first.nextCursor }))).json();
    expect(second.generated).toBe(8);
    // (a ordem de chegada não é a da pasta: o lote corre com três em voo)
    expect(st.writes.map((w) => w.path.split("/")[1]).sort()).toEqual(names(8, 8));
  });

  it("salta depressa o que já está feito, sem gastar um pedido por foto", async () => {
    // 250 fotos, todas já com miniatura: a janela de exame é larga, por isso
    // um só pedido despacha 200 — não 8.
    st.photos = names(250);
    st.thumbs = [...st.photos];
    const data = await (await POST(...post({}))).json();
    expect(data).toMatchObject({ scanned: 200, skipped: 200, generated: 0 });
    expect(data.nextCursor).toBe(200);
    expect(st.writes).toHaveLength(0);
  });

  it("uma foto ilegível conta como falha e não trava o resto do lote", async () => {
    st.photos = names(3);
    st.unreadable.add(st.photos[0]);
    const data = await (await POST(...post({}))).json();
    expect(data).toMatchObject({ generated: 2, failed: 1 });
    expect(st.writes.map((w) => w.path)).not.toContain("t-1/foto-0000.jpg");
    // E o cursor passou à frente dela: uma foto má não pode prender a pasta.
    expect(data.nextCursor).toBeNull();
  });

  it("uma pasta ilegível é 503 — e não 'já está tudo feito'", async () => {
    st.photos = names(3);
    st.listBroken = true;
    const res = await POST(...post({ cursor: 0 }));
    expect(res.status).toBe(503);
    expect(st.writes).toHaveLength(0);
  });

  it("sem conseguir ler as miniaturas existentes não refaz nada às cegas", async () => {
    st.photos = names(3);
    st.thumbListBroken = true;
    const res = await POST(...post({}));
    expect(res.status).toBe(503);
    expect(st.writes).toHaveLength(0);
  });

  it("cria o bucket das miniaturas numa instalação que ainda não o tem", async () => {
    // É o caso da biblioteca da Catarina: nunca houve uma miniatura.
    st.buckets = new Set(["theme-assets"]);
    st.photos = names(1);
    await POST(...post({}));
    expect(st.created).toEqual(["theme-thumbs"]);
  });

  it("um tema que não existe é 404, e não uma pasta nova no bucket", async () => {
    const res = await POST(...post({}, "inventado"));
    expect(res.status).toBe(404);
    expect(st.writes).toHaveLength(0);
  });

  it("o cliente só manda um número: um caminho no corpo não vai lado nenhum", async () => {
    st.photos = names(1);
    // Tudo o que não seja `cursor` é ignorado — os caminhos são construídos
    // aqui, a partir da listagem da pasta DESTE tema.
    const res = await POST(
      ...post({ cursor: 0, path: "../outro-tema/roubada.jpg", paths: ["x/y.jpg"] }),
    );
    expect(res.status).toBe(200);
    expect(st.writes.map((w) => w.path)).toEqual(["t-1/foto-0000.jpg"]);
  });

  it("um cursor absurdo não anda para trás nem rebenta", async () => {
    st.photos = names(3);
    const data = await (await POST(...post({ cursor: -5 }))).json();
    expect(data.scanned).toBe(3);
    const far = await (await POST(...post({ cursor: 9_999 }))).json();
    expect(far).toMatchObject({ scanned: 0, generated: 0 });
    expect(far.nextCursor).toBeNull();
  });
});
