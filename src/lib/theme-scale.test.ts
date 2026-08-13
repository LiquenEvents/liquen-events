import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * SONDA DE ESCALA da Biblioteca de Temas.
 *
 * `theme-storage.test.ts` prova o COMPORTAMENTO (uma pasta ilegível não é "0
 * fotos", uma miniatura em falta cai para o original, …) com pastas de duas ou
 * três fotos. Este ficheiro prova outra coisa, e só esta: o CUSTO. A Catarina
 * está prestes a carregar milhares de fotos, e a promessa do desenho é
 * "assina-se uma PÁGINA, não uma PASTA". Uma promessa dessas ou é medida ou é
 * uma esperança.
 *
 * O duplo do Storage aqui não devolve páginas encenadas à mão: guarda pastas
 * REAIS de 5000 e 25 000 nomes e responde a `limit`/`offset` como o Storage
 * responderia, contando cada ida e cada caminho assinado. As asserções são
 * sobre esses contadores.
 *
 * O que fica provado:
 *   · abrir um tema assina exatamente a página pedida — 60 fotos numa pasta de
 *     5000 custa 60 assinaturas + 60 de miniaturas, e nem mais uma;
 *   · esse custo é o MESMO numa pasta de 30, de 5000 ou de 25 000;
 *   · percorrer a biblioteca toda assina cada foto uma única vez;
 *   · contar, listar e apagar NUNCA assinam nada;
 *   · o número de idas ao Storage por pedido tem teto constante, mesmo com
 *     pastas absurdas.
 *
 * E o que fica REGISTADO como risco conhecido (último bloco): a contagem
 * assume que o Storage respeita o `limit` que lhe pedimos. Se ele encurtar a
 * página, a contagem dá a pasta por acabada e devolve um número mais pequeno
 * como se fosse exato — o único ponto em toda a cadeia onde uma limitação do
 * servidor viraria uma mentira em vez de um "500+".
 */

// ── Duplo do Supabase Storage, com pastas de verdade ──────────────────────
const st = vi.hoisted(() => ({
  /** pasta → nomes dos ficheiros, do mais recente para o mais antigo. */
  folders: new Map<string, string[]>(),
  /** Teto que o SERVIDOR aplica a uma página, mesmo que peçamos mais.
   *  0 = respeita o `limit` (o comportamento documentado). */
  serverPageCap: 0,
  /** A listagem falha a partir desta página (para encenar avarias). */
  failListAfter: Infinity,
  calls: {
    /** Idas ao Storage a listar (o passo barato). */
    list: 0,
    /** Pedidos de assinatura (originais / miniaturas), e caminhos em cada um. */
    sign: 0,
    signedPaths: 0,
    thumbSign: 0,
    signedThumbPaths: 0,
    /** Remoções e caminhos removidos. */
    remove: 0,
    removedPaths: 0,
  },
  /** As janelas pedidas ao Storage, para se poder ver a paginação. */
  windows: [] as { bucket: string; folder: string; limit: number; offset: number }[],
  /** Tamanho de cada lote de assinatura, para provar que nenhum é a pasta toda. */
  signBatches: [] as number[],
}));

vi.mock("./supabase", () => {
  const THUMBS = "theme-thumbs";
  const from = (bucket: string) => ({
    list: async (folder: string, opts: { limit: number; offset: number }) => {
      st.calls.list++;
      st.windows.push({ bucket, folder, limit: opts.limit, offset: opts.offset });
      if (st.calls.list > st.failListAfter) return { data: null, error: { message: "boom" } };
      // O bucket das miniaturas espelha o das fotos (mesmas chaves).
      const all = st.folders.get(folder) ?? [];
      const cap = st.serverPageCap ? Math.min(opts.limit, st.serverPageCap) : opts.limit;
      const slice = all.slice(opts.offset, opts.offset + cap);
      return { data: slice.map((name) => ({ id: `id-${name}`, name })), error: null };
    },
    createSignedUrls: async (paths: string[]) => {
      if (bucket === THUMBS) {
        st.calls.thumbSign++;
        st.calls.signedThumbPaths += paths.length;
      } else {
        st.calls.sign++;
        st.calls.signedPaths += paths.length;
        st.signBatches.push(paths.length);
      }
      return {
        data: paths.map((path) => ({ path, signedUrl: `https://${bucket}/${path}` })),
        error: null,
      };
    },
    createSignedUrl: async (path: string) => ({
      data: { signedUrl: `https://${bucket}/${path}` },
      error: null,
    }),
    remove: async (paths: string[]) => {
      st.calls.remove++;
      st.calls.removedPaths += paths.length;
      // Apagar mesmo: a limpeza da pasta das miniaturas relista sempre a
      // primeira página, e sem encolher a pasta isso nunca terminaria. Um
      // lote de cada vez (e não um `filter` por caminho): a sonda mexe em
      // dezenas de milhares de nomes e o duplo não pode ser o gargalo.
      const byFolder = new Map<string, Set<string>>();
      for (const p of paths) {
        const cut = p.indexOf("/");
        const folder = p.slice(0, cut);
        let names = byFolder.get(folder);
        if (!names) byFolder.set(folder, (names = new Set()));
        names.add(p.slice(cut + 1));
      }
      for (const [folder, gone] of byFolder) {
        const all = st.folders.get(folder);
        if (all)
          st.folders.set(
            folder,
            all.filter((n) => !gone.has(n)),
          );
      }
      return { data: paths.map((name) => ({ name })), error: null };
    },
    upload: async () => ({ data: { path: "ok" }, error: null }),
    copy: async () => ({ data: { path: "ok" }, error: null }),
    download: async () => ({ data: null, error: { message: "não usado" } }),
  });
  return {
    getSupabase: () => ({
      storage: {
        from,
        getBucket: async (name: string) => ({ data: { name }, error: null }),
        createBucket: async () => ({ data: null, error: null }),
      },
    }),
    isDatabaseConfigured: () => true,
  };
});
vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

/** Módulo fresco a cada teste: o memo do bucket recomeça. */
async function load() {
  return import("./theme-storage");
}

/** Uma pasta com `n` ficheiros, nomeados de forma estável. */
function seedFolder(folder: string, n: number): string[] {
  const names = Array.from({ length: n }, (_, i) => `f${String(i).padStart(5, "0")}.jpg`);
  st.folders.set(folder, names);
  return names;
}

/** Contadores a zero, sem mexer nas pastas. */
function resetCounters() {
  st.calls = {
    list: 0,
    sign: 0,
    signedPaths: 0,
    thumbSign: 0,
    signedThumbPaths: 0,
    remove: 0,
    removedPaths: 0,
  };
  st.windows = [];
  st.signBatches = [];
}

/** O que a Catarina tem: uma mão-cheia de temas com milhares de fotos cada. */
const BIG = "tema-grande";
const HUGE = "tema-absurdo";
const SMALL = "tema-pequeno";

/** Teto de idas ao Storage numa listagem paginada: a página + as páginas da
 *  contagem (MAX_COUNT_PAGES = 20 em theme-storage). Constante — não cresce
 *  com a pasta. */
const MAX_LIST_CALLS_PER_REQUEST = 21;

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  st.folders = new Map();
  st.serverPageCap = 0;
  st.failListAfter = Infinity;
  resetCounters();
  seedFolder(BIG, 5000);
  seedFolder(HUGE, 25_000);
  seedFolder(SMALL, 30);
});

// ── Abrir um tema: assina-se a página, não a pasta ─────────────────────────
describe("abrir um tema com 5000 fotos", () => {
  it("assina exatamente a página pedida — 60 fotos, não 5000", async () => {
    const { listThemeImagePage } = await load();
    const res = await listThemeImagePage(BIG, 60, 0);

    expect(res.ok).toBe(true);
    expect(res.images).toHaveLength(60);
    // A promessa, em números: um pedido de assinatura por bucket, com 60
    // caminhos cada. Se algum dia alguém voltar a assinar a pasta inteira,
    // estes quatro números explodem e este teste é o que o diz.
    expect(st.calls.sign).toBe(1);
    expect(st.calls.signedPaths).toBe(60);
    expect(st.calls.thumbSign).toBe(1);
    expect(st.calls.signedThumbPaths).toBe(60);
  });

  it("dá o total VERDADEIRO da pasta sem o assinar", async () => {
    const { listThemeImagePage } = await load();
    const res = await listThemeImagePage(BIG, 60, 0);

    // 5000 é exato (a contagem cabe no orçamento de páginas), e custou só
    // listagens: contar nunca assina.
    expect(res.total).toBe(5000);
    expect(res.truncated).toBe(false);
    expect(st.calls.signedPaths).toBe(60);
  });

  it("custa o mesmo número de idas ao Storage numa pasta de 5000 e de 25 000", async () => {
    const { listThemeImagePage } = await load();

    await listThemeImagePage(BIG, 60, 0);
    const big = st.calls.list;
    resetCounters();
    const huge = await listThemeImagePage(HUGE, 60, 0);
    const hugeCalls = st.calls.list;

    // O teto é constante: a contagem para nas 20 páginas e o total passa a ser
    // assumidamente um MÍNIMO ("20 000+"), em vez de a rota andar a passear
    // pela pasta sem fim.
    expect(big).toBeLessThanOrEqual(MAX_LIST_CALLS_PER_REQUEST);
    expect(hugeCalls).toBeLessThanOrEqual(MAX_LIST_CALLS_PER_REQUEST);
    expect(huge.total).toBe(20_000);
    expect(huge.truncated).toBe(true);
    // E o que é caro — assinar — não mexeu: continua a ser a página.
    expect(st.calls.signedPaths).toBe(60);
  });

  it("assina o mesmo com 30 fotos e com 5000 (a página manda, não a pasta)", async () => {
    const { listThemeImagePage } = await load();

    const small = await listThemeImagePage(SMALL, 60, 0);
    const smallSigned = st.calls.signedPaths;
    resetCounters();
    await listThemeImagePage(BIG, 60, 0);

    // Numa pasta pequena assinam-se as que existem; numa grande, as da página.
    expect(smallSigned).toBe(30);
    expect(small.total).toBe(30);
    expect(st.calls.signedPaths).toBe(60);
  });

  it("um limite absurdo é cortado ao teto — 5000 nunca chega ao Storage", async () => {
    const { listThemeImagePage } = await load();
    await listThemeImagePage(BIG, 5000, 0);

    // MAX_THEME_PAGE_SIZE = 200. A janela pedida ao Storage prova-o.
    expect(st.windows[0]).toMatchObject({ limit: 200, offset: 0 });
    expect(st.calls.signedPaths).toBe(200);
    expect(Math.max(...st.signBatches)).toBeLessThanOrEqual(200);
  });
});

// ── Percorrer a biblioteca toda ───────────────────────────────────────────
describe("percorrer as 5000 fotos, página a página", () => {
  it("assina cada foto uma vez — e nenhum lote é a pasta inteira", async () => {
    const { listThemeImagePage } = await load();
    const PAGE = 200;
    const seen = new Set<string>();

    for (let offset = 0; offset < 5000; offset += PAGE) {
      const res = await listThemeImagePage(BIG, PAGE, offset);
      expect(res.ok).toBe(true);
      for (const im of res.images) seen.add(im.path);
    }

    // Cada foto vista exatamente uma vez: a paginação não repete nem salta.
    expect(seen.size).toBe(5000);
    expect(st.calls.signedPaths).toBe(5000);
    expect(st.calls.signedThumbPaths).toBe(5000);
    // 25 páginas × 200 — nenhum pedido de assinatura maior do que uma página.
    expect(st.calls.sign).toBe(25);
    expect(Math.max(...st.signBatches)).toBe(PAGE);
  });

  it("cada página custa, por si, um número limitado de idas ao Storage", async () => {
    const { listThemeImagePage } = await load();

    // Uma página lá para o meio da pasta. O custo em listagens de UM pedido
    // tem teto constante — é o que impede um tema grande de bloquear a rota.
    //
    // NOTA HONESTA (custo conhecido, não defeito escondido): esse teto é
    // constante mas NÃO é 1. Fora da primeira página curta, cada pedido
    // reconta a pasta do princípio, porque não há contagem guardada em lado
    // nenhum — percorrer as 25 páginas desta pasta gasta ~7 listagens em cada
    // uma. São todas baratas (só metadados, zero assinaturas), mas somam.
    await listThemeImagePage(BIG, 200, 2000);
    expect(st.calls.list).toBeLessThanOrEqual(MAX_LIST_CALLS_PER_REQUEST);
    expect(st.calls.signedPaths).toBe(200);
  });
});

// ── Os passos baratos nunca assinam ───────────────────────────────────────
describe("listar e contar nunca assinam", () => {
  it("listThemeFiles: uma ida ao Storage, zero assinaturas", async () => {
    const { listThemeFiles } = await load();
    const listed = await listThemeFiles(BIG, 500, 0);

    expect(listed.ok).toBe(true);
    expect(listed.names).toHaveLength(500);
    expect(listed.truncated).toBe(true);
    expect(st.calls.list).toBe(1);
    expect(st.calls.sign + st.calls.thumbSign).toBe(0);
  });

  it("countThemeFiles: conta 5000 sem assinar nada, com teto de páginas", async () => {
    const { countThemeFiles } = await load();
    const counted = await countThemeFiles(BIG);

    expect(counted).toEqual({ total: 5000, ok: true, truncated: false });
    expect(st.calls.sign + st.calls.thumbSign).toBe(0);
    expect(st.calls.list).toBeLessThanOrEqual(MAX_LIST_CALLS_PER_REQUEST);
  });

  it("a lista de temas paga UMA listagem por tema, não por foto", async () => {
    // É a forma da rota `GET /api/temas`: uma página por tema (para a contagem
    // do cartão) e UMA assinatura em bloco para as capas de todos. Com 8 temas
    // de 5000 fotos, desenhar o ecrã custa 8 listagens e 8 assinaturas — não
    // 40 000. Aqui exercita-se a camada de Storage que a rota usa.
    const { listThemeFiles, signThemePaths } = await load();
    const themes = Array.from({ length: 8 }, (_, i) => `tema-${i}`);
    for (const t of themes) seedFolder(t, 5000);

    const listings = await Promise.all(themes.map((t) => listThemeFiles(t)));
    const covers = listings.map(({ names }, i) => `${themes[i]}/${names[0]}`);
    await signThemePaths(covers);

    expect(st.calls.list).toBe(8);
    expect(st.calls.sign).toBe(1);
    expect(st.calls.signedPaths).toBe(8);
  });
});

// ── Eliminar um tema grande ───────────────────────────────────────────────
describe("eliminar um tema de 5000 fotos", () => {
  it("apaga tudo, em lotes, sem assinar uma única foto", async () => {
    const { deleteThemeFolder } = await load();
    const res = await deleteThemeFolder(BIG);

    expect(res.ok).toBe(true);
    expect(res.removed).toBe(5000);
    // Apagar é o outro caminho que nunca pode assinar: seria pagar URLs para
    // ficheiros que estão a desaparecer.
    expect(st.calls.sign + st.calls.thumbSign).toBe(0);
    // Em lotes de 500 — não 5000 caminhos num pedido só — e a pasta ficou
    // mesmo vazia (nada de fotos órfãs e invisíveis no bucket).
    expect(st.calls.removedPaths).toBeGreaterThanOrEqual(5000);
    expect(st.folders.get(BIG)).toEqual([]);
  });

  it("uma pasta absurda (25 000) é recusada em vez de deixar fotos órfãs", async () => {
    const { deleteThemeFolder } = await load();
    // MAX_DELETE_PAGES = 40 × 500 = 20 000: acima disto o tema NÃO desaparece
    // da lista (a rota devolve 502 e a ação pode ser repetida), em vez de os
    // metadados sumirem e ficarem 20 000 fotos invisíveis no bucket.
    const res = await deleteThemeFolder(HUGE);

    expect(res.ok).toBe(false);
    expect(st.calls.sign + st.calls.thumbSign).toBe(0);
  });
});

// ── Risco conhecido, medido e deixado à vista ─────────────────────────────
describe("RISCO: a contagem confia no `limit` que pede ao Storage", () => {
  it("uma página mais curta do que o pedido é lida como fim da pasta", async () => {
    // `listThemeFiles` decide "há mais?" por `data.length >= limit`. Se o
    // Storage devolver menos do que pedimos por decisão SUA (um teto do lado
    // do servidor), a contagem termina ali e o número sai como EXATO.
    //
    // Aqui o servidor encurta todas as páginas a 100. A pasta tem 5000 fotos e
    // a contagem afirma 100, sem `truncated` — a única mentira possível em toda
    // a cadeia (o resto degrada para "500+", que é honesto).
    //
    // Não é hipotético o suficiente para se ignorar: `countThemeFiles` pede
    // páginas de 1000 e o cliente do Storage traz 100 por omissão. Confirmar
    // que o servidor honra limites acima de 100 exige um Supabase real — está
    // reportado, e este teste fixa o comportamento atual para que uma correção
    // tenha de passar por aqui.
    st.serverPageCap = 100;
    const { countThemeFiles, listThemeImagePage } = await load();

    const counted = await countThemeFiles(BIG);
    expect(counted).toEqual({ total: 100, ok: true, truncated: false });

    // E a grelha herda-o: "100 fotos" numa pasta de 5000.
    const page = await listThemeImagePage(BIG, 200, 0);
    expect(page.total).toBe(100);
    expect(page.truncated).toBe(false);
    // O que NÃO se estraga: continua a assinar-se só o que se mostra.
    expect(st.calls.signedPaths).toBe(100);
  });

  it("uma contagem falhada a meio devolve um MÍNIMO, não um total mais pequeno", async () => {
    // O outro lado da mesma moeda, e este está bem resolvido: se a listagem
    // avariar DEPOIS de a página já ter sido lida, o total nunca é menor do
    // que o que já se mostrou, e sai marcado como mínimo.
    const { listThemeImagePage } = await load();
    st.failListAfter = 2; // a página passa; a contagem parte na segunda ida
    const res = await listThemeImagePage(BIG, 200, 1000);

    expect(res.ok).toBe(true);
    expect(res.images).toHaveLength(200);
    expect(res.total).toBeGreaterThanOrEqual(1200);
    expect(res.truncated).toBe(true);
  });
});
