// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_IMPORT_BATCH, THEME_PAGE_SIZE, type ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import ThemePicker from "./ThemePicker";

/**
 * Rede de segurança do seletor da Biblioteca de Temas.
 *
 * O que se fixa aqui é o que a Catarina sente: o teto das 40 fotos tem de ser
 * visível ANTES do clique (antes, escolhia 60 e só o servidor dizia que não);
 * nas capas escolhe-se UMA foto (a segunda substitui a primeira, não se
 * acumula); e uma importação falhada não pode fechar o diálogo — a seleção
 * feita à mão perder-se-ia sem nada em troca.
 *
 * A partir do momento em que um tema pode ter milhares de fotos, fixa-se
 * também a ESCALA: abre-se uma página (não a pasta toda), a grelha mostra a
 * miniatura, os gestos em bloco param no teto em vez de o ultrapassarem em
 * silêncio, e uma importação de 40 fotos mostra progresso e deixa repetir só
 * o que falhou.
 */

// ── Servidor de mentira ────────────────────────────────────────────────────
// Uma resposta por `MÉTODO /caminho`; o que não estiver registado rebenta o
// teste em vez de ir à rede. O URL completo chega ao handler para se poder
// honrar a paginação (`?offset=&limit=`), que é o que está em causa.
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
type Handler = (url: string, init?: RequestInit) => Res | Promise<Res>;
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });
const bad = (status: number, body: unknown): Res => ({ ok: false, status, json: async () => body });

let routes: Map<string, Handler>;
/** Todos os URLs pedidos, pela ordem — é aqui que se vê o que foi assinado. */
let calls: string[];

function route(key: string, handler: Handler) {
  routes.set(key, handler);
}

// ── Dados ──────────────────────────────────────────────────────────────────
const T0 = "2026-01-01T00:00:00.000Z";
const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 41,
};

interface Photo {
  path: string;
  url: string;
  thumbUrl?: string;
}

/** A pasta do lado do servidor. Cada teste dimensiona-a antes de renderizar. */
let photos: Photo[];
/** Caminhos que a rota de importação recusa copiar. */
let flaky: Set<string>;

/** Uma pasta com `n` fotos; a `withThumbs` diz quais já têm miniatura. */
function folder(n: number, withThumbs: (i: number) => boolean = () => true): Photo[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `t1/foto-${i + 1}.jpg`,
    url: `https://cdn.test/foto-${i + 1}.jpg`,
    ...(withThumbs(i) ? { thumbUrl: `https://cdn.test/thumb-${i + 1}.jpg` } : {}),
  }));
}

/** Uma foto a mais do que o lote máximo, para se poder bater no teto. */
const TOTAL = MAX_IMPORT_BATCH + 1;

const onClose = vi.fn();
const onPicked = vi.fn();

/** Abre o seletor e espera pela grelha de fotos. */
async function openPicker(multiple: boolean, usedThemePaths?: string[]) {
  render(
    <ToastProvider>
      <ThemePicker
        quoteId="LQ-001"
        multiple={multiple}
        usedThemePaths={usedThemePaths}
        onClose={onClose}
        onPicked={onPicked}
      />
    </ToastProvider>,
  );
  await screen.findByRole("button", { name: `Foto 1 de ${visible()}` });
}

/** Quantas fotos a grelha mostra: uma página, ou a pasta toda se for menor. */
function visible(): number {
  return Math.min(photos.length, THEME_PAGE_SIZE);
}

/** A célula da foto `n` (nome acessível estável; o estado vive no aria-pressed). */
function photo(n: number, suffix = "") {
  return screen.getByRole("button", { name: `Foto ${n} de ${visible()}${suffix}` });
}

function cells() {
  return screen.getAllByRole("button", { name: /^Foto \d+ de \d+/ });
}

beforeEach(() => {
  onClose.mockReset();
  onPicked.mockReset();
  localStorage.clear();
  routes = new Map();
  calls = [];
  photos = folder(TOTAL, () => false); // por omissão: fotos antigas, sem miniatura
  flaky = new Set();

  route("GET /api/temas", () => ok([THEME]));
  route("GET /api/temas/t1/imagens", (url) => {
    const q = new URL(url, "http://test").searchParams;
    const offset = Number(q.get("offset") ?? 0);
    const limit = Number(q.get("limit") ?? THEME_PAGE_SIZE);
    return ok({
      ok: true,
      images: photos.slice(offset, offset + limit),
      total: photos.length,
      truncated: false,
    });
  });
  route("POST /api/orcamento/LQ-001/assets/importar", (_url, init) => {
    const paths: string[] = JSON.parse(String(init?.body ?? "{}")).paths ?? [];
    const failed = paths.filter((p) => flaky.has(p));
    const images = paths
      .filter((p) => !flaky.has(p))
      .map((p) => ({ path: `LQ-001/copia-${p.split("/")[1]}`, url: `https://cdn.test/${p}` }));
    if (images.length === 0) return bad(502, { error: "Falha ao importar as imagens." });
    return ok({ ok: true, images, requested: paths.length, failed });
  });

  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
      const handler = routes.get(key);
      if (!handler) return Promise.reject(new Error(`rota não simulada: ${key}`));
      calls.push(url);
      return Promise.resolve(handler(url, init));
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemePicker", () => {
  it("trava a seleção nas 40 fotos e explica o limite", async () => {
    await openPicker(true);

    // A meio do caminho o rodapé passa a contar para o teto.
    for (let n = 1; n <= MAX_IMPORT_BATCH / 2; n++) fireEvent.click(photo(n));
    expect(
      screen.getByText(`${MAX_IMPORT_BATCH / 2} de ${MAX_IMPORT_BATCH} selecionadas`),
    ).toBeInTheDocument();

    // Tocar nas 41 → ficam 40; a 41.ª nem sequer entra.
    for (let n = MAX_IMPORT_BATCH / 2 + 1; n <= TOTAL; n++) fireEvent.click(photo(n));

    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} selecionadas`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Pode adicionar até ${MAX_IMPORT_BATCH} fotos de cada vez.`),
    ).toBeInTheDocument();
    expect(photo(TOTAL)).toHaveAttribute("aria-pressed", "false");
    // As que sobram ficam anunciadas como indisponíveis (mas alcançáveis).
    expect(photo(TOTAL)).toHaveAttribute("aria-disabled", "true");
    expect(photo(1)).not.toHaveAttribute("aria-disabled");

    // Tirar uma abre lugar outra vez e o aviso desaparece.
    fireEvent.click(photo(1));
    expect(
      screen.queryByText(`Pode adicionar até ${MAX_IMPORT_BATCH} fotos de cada vez.`),
    ).not.toBeInTheDocument();
    fireEvent.click(photo(TOTAL));
    expect(photo(TOTAL)).toHaveAttribute("aria-pressed", "true");
  });

  it("nas capas (uma só foto) a segunda escolha substitui a primeira", async () => {
    await openPicker(false);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));

    expect(photo(1)).toHaveAttribute("aria-pressed", "false");
    expect(photo(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 selecionada")).toBeInTheDocument();
  });

  it("uma importação falhada mantém o diálogo aberto e mostra o erro", async () => {
    route("POST /api/orcamento/LQ-001/assets/importar", () =>
      bad(500, { error: "Não foi possível copiar as fotos." }),
    );
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à proposta" }));

    expect(await screen.findByText("Não foi possível copiar as fotos.")).toBeInTheDocument();
    // O diálogo continua de pé, com a seleção intacta, para se tentar de novo.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(photo(1)).toHaveAttribute("aria-pressed", "true");
    expect(onPicked).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  // ── Escala ───────────────────────────────────────────────────────────────

  it("abre um tema grande com UMA página e vai buscar as seguintes a pedido", async () => {
    photos = folder(150);
    await openPicker(true);

    // Só a primeira página está no ecrã — e só ela foi pedida (= assinada).
    expect(cells()).toHaveLength(THEME_PAGE_SIZE);
    expect(calls.filter((u) => u.includes("/imagens"))).toEqual([
      `/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
    ]);

    // O botão diz quantas faltam, e a página seguinte junta-se à grelha.
    fireEvent.click(screen.getByRole("button", { name: `Mostrar mais (faltam 90)` }));
    await waitFor(() => expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2));
    expect(calls).toContain(
      `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
    );

    // A terceira página fecha a pasta e o botão desaparece.
    fireEvent.click(screen.getByRole("button", { name: "Mostrar mais (faltam 30)" }));
    await waitFor(() => expect(cells()).toHaveLength(150));
    expect(screen.queryByRole("button", { name: /Mostrar mais/ })).not.toBeInTheDocument();
  });

  it("mostra a miniatura e cai no original nas fotos que ainda não a têm", async () => {
    photos = folder(4, (i) => i === 0); // só a primeira tem miniatura
    await openPicker(true);

    expect(photo(1).querySelector("img")).toHaveAttribute("src", "https://cdn.test/thumb-1.jpg");
    expect(photo(2).querySelector("img")).toHaveAttribute("src", "https://cdn.test/foto-2.jpg");
  });

  it("'todas as visíveis' e o Shift+clique param no teto, avisando", async () => {
    photos = folder(150);
    await openPicker(true);

    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas as visíveis" }));

    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} selecionadas`),
    ).toBeInTheDocument();
    expect(
      await screen.findByText(
        `Só cabem ${MAX_IMPORT_BATCH} fotos de cada vez — ficaram selecionadas as primeiras.`,
      ),
    ).toBeInTheDocument();
    expect(photo(MAX_IMPORT_BATCH)).toHaveAttribute("aria-pressed", "true");
    expect(photo(MAX_IMPORT_BATCH + 1)).toHaveAttribute("aria-pressed", "false");

    // Um intervalo grande com Shift também para no teto — não o ultrapassa.
    fireEvent.click(screen.getByRole("button", { name: "Limpar seleção" }));
    fireEvent.click(photo(1));
    fireEvent.click(photo(55), { shiftKey: true });
    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} selecionadas`),
    ).toBeInTheDocument();
    expect(photo(MAX_IMPORT_BATCH)).toHaveAttribute("aria-pressed", "true");
    expect(photo(55)).toHaveAttribute("aria-pressed", "false");

    // E o Shift+clique ao contrário desmarca o intervalo todo.
    fireEvent.click(photo(1), { shiftKey: true });
    expect(screen.getByText("Toque nas fotos que quer usar.")).toBeInTheDocument();
  });

  it("marca as fotos que já estão nesta proposta", async () => {
    await openPicker(true, ["t1/foto-2.jpg"]);

    expect(photo(2, " (já nesta proposta)")).toBeInTheDocument();
    expect(screen.getAllByText("Já nesta proposta")).toHaveLength(1);
    // Continua escolhível: a mesma foto pode ir para a capa e para um board.
    fireEvent.click(photo(2, " (já nesta proposta)"));
    expect(photo(2, " (já nesta proposta)")).toHaveAttribute("aria-pressed", "true");
  });

  it("importa por lotes, mostra progresso e deixa parar", async () => {
    photos = folder(20);
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const real = routes.get("POST /api/orcamento/LQ-001/assets/importar")!;
    route("POST /api/orcamento/LQ-001/assets/importar", async (url, init) => {
      await gate;
      return real(url, init);
    });

    await openPicker(true);
    for (let n = 1; n <= 10; n++) fireEvent.click(photo(n));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à proposta" }));

    // Enquanto copia: barra de progresso real e um botão para parar.
    const bar = await screen.findByRole("progressbar", { name: "Progresso da importação" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "10");
    expect(screen.getByRole("button", { name: "Parar" })).toBeInTheDocument();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // 10 fotos = dois lotes, entregues ao estúdio à medida que chegam.
    expect(onPicked).toHaveBeenCalledTimes(2);
    const first = onPicked.mock.calls[0][0];
    expect(first).toHaveLength(8);
    // Cada cópia sabe de que foto da biblioteca veio — é o que permite dizer
    // "já nesta proposta" da próxima vez.
    expect(first[0]).toMatchObject({
      path: "LQ-001/copia-foto-1.jpg",
      sourcePath: "t1/foto-1.jpg",
    });
  });

  it("depois de uma falha parcial só volta a tentar o que falhou", async () => {
    photos = folder(20);
    flaky = new Set(["t1/foto-3.jpg"]);
    await openPicker(true);

    for (let n = 1; n <= 10; n++) fireEvent.click(photo(n));
    fireEvent.click(screen.getByRole("button", { name: "Adicionar à proposta" }));

    expect(await screen.findByText("1 foto não entrou na proposta.")).toBeInTheDocument();
    // O diálogo fica aberto e a seleção passa a ser exatamente o que falhou.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByText("1 selecionada")).toBeInTheDocument();
    expect(photo(3)).toHaveAttribute("aria-pressed", "true");
    expect(photo(1)).toHaveAttribute("aria-pressed", "false");
    expect(onPicked.mock.calls.flatMap((c) => c[0])).toHaveLength(9);

    // À segunda vai: repete-se só a foto que ficou para trás.
    flaky.clear();
    onPicked.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Tentar outra vez" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(onPicked).toHaveBeenCalledTimes(1);
    expect(onPicked.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sourcePath: "t1/foto-3.jpg" }),
    ]);
  });

  // ── Teclado ──────────────────────────────────────────────────────────────
  // As células são `<button>`, por isso o Enter e o Espaço são a ativação
  // nativa (= alternar a escolha); o que se fixa aqui é o que foi preciso
  // construir: um só ponto de entrada no Tab e as setas a andar por dentro.

  it("a grelha anda com as setas mantendo um só ponto de entrada no Tab", async () => {
    photos = folder(12);
    await openPicker(true);

    expect(photo(1)).toHaveAttribute("tabindex", "0");
    expect(photo(2)).toHaveAttribute("tabindex", "-1");

    photo(1).focus();
    fireEvent.keyDown(photo(1), { key: "ArrowRight" });
    expect(document.activeElement).toBe(photo(2));
    expect(photo(2)).toHaveAttribute("tabindex", "0");
    expect(photo(1)).toHaveAttribute("tabindex", "-1");

    fireEvent.keyDown(photo(2), { key: "End" });
    expect(document.activeElement).toBe(photo(12));
    fireEvent.keyDown(photo(12), { key: "Home" });
    expect(document.activeElement).toBe(photo(1));
    // Nas pontas fica quieta em vez de dar a volta.
    fireEvent.keyDown(photo(1), { key: "ArrowLeft" });
    expect(document.activeElement).toBe(photo(1));
  });

  it("o V abre a foto em grande (o original) e o Esc volta à grelha", async () => {
    photos = folder(6);
    await openPicker(true);

    photo(2).focus();
    fireEvent.keyDown(photo(2), { key: "v" });

    const preview = screen.getByRole("group", { name: "Foto 2 de 6 em grande" });
    // Aqui — e só aqui — se puxa o ORIGINAL: é o que distingue duas mesas de
    // terracota que na miniatura são a mesma mancha.
    expect(preview.querySelector("img")).toHaveAttribute("src", "https://cdn.test/foto-2.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Escolher esta foto" }));
    expect(screen.getByText("1 selecionada")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /em grande/ })).not.toBeInTheDocument();
    // O Esc fechou a pré-visualização, NÃO o seletor.
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(photo(2));
  });
});
