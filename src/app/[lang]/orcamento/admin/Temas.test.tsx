// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import Temas from "./Temas";

/**
 * Rede de segurança da Biblioteca de Temas.
 *
 * O que aqui se testa não é o desenho do ecrã — é o estado sob concorrência,
 * que é onde este ecrã perdia fotos: a Catarina larga uma pasta de fotos,
 * arrasta mais para cima enquanto a primeira sobe, e apaga uma pelo meio. Cada
 * teste fixa um caso em que a versão anterior (que juntava o lote todo e no fim
 * fazia `[...lote, ...images]` com um `images` velho) dava a resposta errada.
 *
 * A preparação da imagem é substituída porque não há `canvas` em jsdom — mas o
 * `vi.fn` serve também para fixar o preset com que a biblioteca comprime.
 */

const prepare = vi.hoisted(() => vi.fn());
vi.mock("./image-prep", () => ({ prepareImageForUpload: prepare }));

// ── Servidor de mentira ────────────────────────────────────────────────────
// Cada rota responde por `MÉTODO /caminho` (sem query string). Uma rota pode
// ser "travada": o pedido fica pendurado até o teste o libertar, que é o que
// permite pôr dois lotes a correr ao mesmo tempo e mandar as respostas na
// ordem que interessa.
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });
const bad = (status = 500, body: unknown = {}): Res => ({
  ok: false,
  status,
  json: async () => body,
});

let handlers: Map<string, () => Res>;
let heldRoutes: Set<string>;
let queued: Map<string, (() => void)[]>;
let calls: string[];

function routeKey(url: string, init?: RequestInit) {
  return `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
}

function route(key: string, handler: () => Res) {
  handlers.set(key, handler);
}

function hold(key: string) {
  heldRoutes.add(key);
}

/** Liberta o pedido mais antigo que está pendurado nessa rota. */
async function release(key: string) {
  const next = queued.get(key)?.shift();
  if (!next) throw new Error(`Não há nenhum pedido travado em ${key}`);
  await act(async () => {
    next();
  });
}

function callsTo(key: string) {
  return calls.filter((c) => c === key).length;
}

// ── Dados ──────────────────────────────────────────────────────────────────
const T0 = "2026-01-01T00:00:00.000Z";
const THEME: ThemeSummary = {
  id: "t1",
  name: "Terracotta",
  notes: "",
  createdAt: T0,
  updatedAt: T0,
  imageCount: 0,
};

const photo = (n: number) => ({ path: `t1/foto-${n}.jpg`, url: `https://cdn.test/foto-${n}.jpg` });
const jpg = (name: string) => new File(["x"], name, { type: "image/jpeg" });

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const dropZone = () => document.querySelector("div.border-dashed") as HTMLElement;
const photos = () => Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));

function renderTemas() {
  return render(
    <ToastProvider>
      <Temas />
    </ToastProvider>,
  );
}

/** Abre a pasta de um tema e espera que a leitura das fotos assente. */
async function openFolder(name: RegExp) {
  fireEvent.click(await screen.findByRole("button", { name }));
  await screen.findByRole("button", { name: "Eliminar tema" });
  await act(async () => {});
}

/** Larga fotos no seletor de ficheiros (o botão "Adicionar fotos"). */
async function chooseFiles(...files: File[]) {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files } });
  });
}

/** Larga fotos por arrasto — o caminho que continua aberto enquanto o botão
 *  "Adicionar fotos" está ocupado com um lote anterior. */
async function dropFiles(...files: File[]) {
  await act(async () => {
    fireEvent.drop(dropZone(), { dataTransfer: { files } });
  });
}

beforeEach(() => {
  handlers = new Map();
  heldRoutes = new Set();
  queued = new Map();
  calls = [];
  prepare.mockReset();
  // Sem canvas em jsdom: a foto sobe tal e qual.
  prepare.mockImplementation(async (f: File) => f);
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = routeKey(String(url), init);
      calls.push(key);
      const res = handlers.get(key)?.() ?? ok({});
      if (!heldRoutes.has(key)) return Promise.resolve(res);
      return new Promise<Res>((resolve) => {
        const q = queued.get(key) ?? [];
        q.push(() => resolve(res));
        queued.set(key, q);
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Biblioteca de Temas", () => {
  it("comprime as fotos da biblioteca com o preset de capa, não com o de mood board", async () => {
    // Uma foto da biblioteca pode acabar numa imagem de CAPA (impressa em
    // grande). Guardá-la com o preset de mood board degradava-a para sempre.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [] }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));

    renderTemas();
    await openFolder(/Terracotta/);

    const f = jpg("praia.jpg");
    await chooseFiles(f);

    expect(prepare).toHaveBeenCalledWith(f, "cover");
  });

  it("guarda as fotos dos dois lotes quando dois carregamentos se cruzam", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [] }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    // Lote 1 pelo seletor de ficheiros; lote 2 arrastado por cima antes de o
    // primeiro terminar. As respostas chegam pela mesma ordem.
    await chooseFiles(jpg("a.jpg"));
    await dropFiles(jpg("b.jpg"));
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(2);

    await release("POST /api/temas/t1/imagens");
    await release("POST /api/temas/t1/imagens");

    expect(photos()).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remover foto 1 de 2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Remover foto 2 de 2" })).toBeInTheDocument();
  });

  it("não ressuscita uma foto apagada enquanto um lote estava a subir", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(2)] }));
    hold("POST /api/temas/t1/imagens");
    route("DELETE /api/temas/t1/imagens", () => ok({ ok: true }));

    renderTemas();
    await openFolder(/Terracotta/);
    expect(photos()).toEqual([photo(1).url]);

    // Um lote começa…
    await chooseFiles(jpg("nova.jpg"));
    // …e a foto que já lá estava é removida antes de o lote acabar.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover foto 1 de 1" }));
    });
    expect(photos()).toEqual([]);

    await release("POST /api/temas/t1/imagens");

    // Fica só a foto nova: a apagada não pode voltar.
    expect(photos()).toEqual([photo(2).url]);
  });

  it("repõe só a foto cuja remoção falhou, sem deitar fora as que chegaram entretanto", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(2)] }));
    hold("POST /api/temas/t1/imagens");
    route("DELETE /api/temas/t1/imagens", () => bad(502));
    hold("DELETE /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    await chooseFiles(jpg("nova.jpg"));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover foto 1 de 1" }));
    });

    // A foto nova chega primeiro; só depois se sabe que a remoção falhou.
    await release("POST /api/temas/t1/imagens");
    await release("DELETE /api/temas/t1/imagens");

    expect(photos()).toHaveLength(2);
    expect(photos()).toContain(photo(1).url);
    expect(photos()).toContain(photo(2).url);
  });

  it("não faz desaparecer um tema criado enquanto um DELETE falhado ia a caminho", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [] }));
    route("DELETE /api/temas/t1", () => bad(500));
    hold("DELETE /api/temas/t1");
    route("POST /api/temas", () =>
      ok({ id: "t2", name: "Itália", notes: "", createdAt: T0, updatedAt: T0, imageCount: 0 }),
    );

    renderTemas();
    await openFolder(/Terracotta/);

    // Eliminar (o servidor ainda não respondeu) e criar outro tema entretanto.
    fireEvent.click(screen.getByRole("button", { name: "Eliminar tema" }));
    fireEvent.click(screen.getByRole("button", { name: "Novo tema" }));
    const field = screen.getByLabelText(/Nome do tema/);
    fireEvent.change(field, { target: { value: "Itália" } });
    await act(async () => {
      fireEvent.keyDown(field, { key: "Enter" });
    });
    // Criar um tema abre-o logo; voltar à lista para a poder ver inteira.
    fireEvent.click(screen.getByRole("button", { name: "← Temas" }));

    // Só agora o servidor recusa a eliminação.
    await release("DELETE /api/temas/t1");

    expect(screen.getByRole("button", { name: /Terracotta/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Itália/ })).toBeInTheDocument();
  });

  it("não cria dois temas quando o Enter é carregado duas vezes", async () => {
    route("GET /api/temas", () => ok([]));
    route("POST /api/temas", () =>
      ok({ id: "t2", name: "Itália", notes: "", createdAt: T0, updatedAt: T0, imageCount: 0 }),
    );
    hold("POST /api/temas");

    renderTemas();
    await screen.findByText("Ainda não há temas");

    fireEvent.click(screen.getByRole("button", { name: "Novo tema" }));
    const field = screen.getByLabelText(/Nome do tema/);
    fireEvent.change(field, { target: { value: "Itália" } });
    fireEvent.keyDown(field, { key: "Enter" });
    fireEvent.keyDown(field, { key: "Enter" });

    expect(callsTo("POST /api/temas")).toBe(1);
    // O campo fica bloqueado enquanto grava — o Enter deixa de ter por onde.
    expect(field).toBeDisabled();
  });

  it("distingue pasta por ler de pasta vazia e assume a contagem truncada", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", imageCount: null },
        { ...THEME, id: "t2", name: "Itália", imageCount: 500, truncated: true },
        { ...THEME, id: "t3", name: "Branco & Verde", imageCount: 1 },
      ]),
    );

    renderTemas();

    expect(await screen.findByText("Fotos indisponíveis")).toBeInTheDocument();
    expect(screen.getByText("500+ fotos")).toBeInTheDocument();
    expect(screen.getByText("1 foto")).toBeInTheDocument();
  });
});
