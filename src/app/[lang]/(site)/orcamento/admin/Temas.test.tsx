// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import {
  CHECK_CHUNK,
  MAX_THEME_COPY_BATCH,
  THEME_COPY_CHUNK,
  THEME_PAGE_SIZE,
} from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import Temas, {
  GRELHA_DE_FOTOS,
  contarFotosDaBiblioteca,
  desdeQuando,
  mergePage,
  moveItem,
  ordenarTemas,
  reinsertAt,
  temPoucasFotos,
} from "./Temas";

/**
 * Rede de segurança da Biblioteca de Temas.
 *
 * O que aqui se testa não é o desenho do ecrã — é o comportamento À ESCALA a
 * que a Catarina o vai usar (milhares de fotos, lotes de 300) e o estado sob
 * concorrência, que é onde este ecrã perdia fotos: ela larga uma pasta de
 * fotos, arrasta mais para cima enquanto a primeira sobe, e apaga uma pelo
 * meio. Cada teste fixa um caso em que uma versão anterior dava a resposta
 * errada.
 *
 * A preparação da imagem é substituída porque não há `canvas` em jsdom — mas o
 * `vi.fn` serve também para fixar o preset com que a biblioteca comprime e
 * para pôr (ou não) uma miniatura ao lado do original.
 */

const prepare = vi.hoisted(() => vi.fn());
vi.mock("./image-prep", () => ({ prepareImageWithThumb: prepare }));

/**
 * A IMPRESSÃO DIGITAL, encenada — e pela mesma razão por que a preparação da
 * imagem também é.
 *
 * A real (`crypto.subtle.digest` sobre o ficheiro inteiro) resolve-se FORA do
 * ciclo de microtarefas: o `arrayBuffer()` e o resumo terminam quando o
 * browser quiser, e isso tornava estes testes dependentes do relógio — os
 * mesmos testes passavam sozinhos e falhavam em conjunto. O resumo verdadeiro
 * está fixado à parte, em `src/lib/theme-fingerprint.test.ts`, com o
 * `crypto.subtle` a sério; aqui o que se está a provar é OUTRA coisa (o que o
 * ecrã FAZ com o veredicto), por isso o resumo é uma função do CONTEÚDO
 * declarado de cada ficheiro de mentira — que é a propriedade que interessa:
 * bytes iguais, resumo igual.
 */
const fp = vi.hoisted(() => ({
  /** `ficheiro → conteúdo`, preenchido pelos construtores de fotos falsas. */
  content: new WeakMap<File, string>(),
  hash: (s: string) => {
    // Um resumo qualquer, desde que seja 32 hex e função só do conteúdo.
    let a = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) a = Math.imul(a ^ s.charCodeAt(i), 0x01000193) >>> 0;
    return a.toString(16).padStart(8, "0").repeat(4);
  },
}));
vi.mock("@/lib/theme-fingerprint", async () => {
  const real =
    await vi.importActual<typeof import("@/lib/theme-fingerprint")>("@/lib/theme-fingerprint");
  return {
    ...real,
    fingerprintBlob: async (blob: Blob) => {
      const c = blob instanceof File ? fp.content.get(blob) : undefined;
      return c === undefined ? null : fp.hash(c);
    },
  };
});

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
/** Os pedidos completos (URL com query + corpo), para o que precisa deles. */
let requests: { url: string; init?: RequestInit }[];

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

/** Liberta TODOS os pedidos pendurados nessa rota, incluindo os que a
 *  libertação for desbloqueando (é assim que um lote inteiro escoa). */
async function releaseAll(key: string) {
  for (let guard = 0; guard < 500; guard++) {
    const next = queued.get(key)?.shift();
    if (!next) return;
    await act(async () => {
      next();
    });
  }
}

function callsTo(key: string) {
  return calls.filter((c) => c === key).length;
}

function urlsFor(key: string) {
  return requests.filter((r) => routeKey(r.url, r.init) === key).map((r) => r.url);
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

const photo = (n: number, thumb = false): ThemeImage => ({
  path: `t1/foto-${n}.jpg`,
  url: `https://cdn.test/foto-${n}.jpg`,
  ...(thumb ? { thumbUrl: `https://cdn.test/thumb-${n}.jpg` } : {}),
});
const many = (from: number, count: number, thumb = false) =>
  Array.from({ length: count }, (_, i) => photo(from + i, thumb));
/**
 * Uma foto de mentira. O CONTEÚDO é o nome, e não uma constante: desde que a
 * biblioteca reconhece fotos repetidas pelo resumo do ficheiro (SHA-256 do
 * original), dois ficheiros com os mesmos bytes SÃO a mesma foto — e um lote de
 * dez `new File(["x"])` seria corretamente reduzido a uma. Nomes distintos =
 * fotos distintas, que é o que quase todos estes testes querem dizer.
 */
const jpg = (name: string) => withContent(new File([name], name, { type: "image/jpeg" }), name);

/** A MESMA foto, com outro nome de ficheiro — o caso real de ela arrastar duas
 *  cópias do mesmo ficheiro. O resumo é do CONTEÚDO, não do nome. */
const sameAs = (file: File, name: string) =>
  withContent(
    new File([fp.content.get(file) ?? ""], name, { type: "image/jpeg" }),
    fp.content.get(file) ?? "",
  );

function withContent(file: File, content: string): File {
  fp.content.set(file, content);
  return file;
}

const fileInput = () => document.querySelector('input[type="file"]') as HTMLInputElement;
const dropZone = () => document.querySelector("div.border-dashed") as HTMLElement;
const imgs = () => Array.from(document.querySelectorAll("img"));

/**
 * As fotos que a grelha está mesmo a mostrar.
 *
 * As fotos SEM miniatura entram numa fila (só se descarregam três originais ao
 * mesmo tempo — ver `HEAVY_IMAGE_CONCURRENCY`), por isso uma célula só recebe
 * `src` quando lhe chega a vez. Em jsdom nada carrega sozinho: `settlePhotos`
 * faz o que o browser faz — dar cada foto por carregada, o que liberta a vez
 * seguinte — e só então a grelha tem todas as fotos com `src`.
 */
const photos = () => imgs().map((i) => i.getAttribute("src"));

async function settlePhotos() {
  for (let guard = 0; guard < 300; guard++) {
    const waiting = imgs().filter((i) => i.getAttribute("src") && !i.dataset.settled);
    if (waiting.length === 0) return;
    await act(async () => {
      for (const img of waiting) {
        img.dataset.settled = "1";
        fireEvent.load(img);
      }
    });
  }
  throw new Error("a fila das fotos não escoou");
}

/** Faz andar o relógio falso e deixa o React assentar. Com `ms = 0` é só
 *  "deixa as promessas resolverem". */
async function tick(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

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
  await settlePhotos();
}

/**
 * Deixa a fase de VERIFICAÇÃO assentar.
 *
 * Antes de qualquer preparação ou upload, o lote é resumido e confrontado com
 * a pasta (`POST /repetidas`, um pedido por pedaço de 50). São mais algumas
 * voltas de microtarefas do que antes desta funcionalidade, e é por isso que
 * um só `act` deixou de chegar para o primeiro carregamento sair.
 */
async function settleScreening() {
  for (let i = 0; i < 6; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

/** Larga fotos no seletor de ficheiros (o botão "Adicionar fotos"). */
async function chooseFiles(...files: File[]) {
  await act(async () => {
    fireEvent.change(fileInput(), { target: { files } });
  });
  await settleScreening();
}

/** Larga fotos por arrasto — o caminho que continua aberto enquanto o botão
 *  "Adicionar fotos" está ocupado com um lote anterior. */
async function dropFiles(...files: File[]) {
  await act(async () => {
    fireEvent.drop(dropZone(), { dataTransfer: { files } });
  });
  await settleScreening();
}

beforeEach(() => {
  handlers = new Map();
  heldRoutes = new Set();
  queued = new Map();
  calls = [];
  requests = [];
  prepare.mockReset();
  // Sem canvas em jsdom: a foto sobe tal e qual, sem miniatura.
  prepare.mockImplementation(async (f: File) => ({ file: f, thumb: null }));
  vi.spyOn(window, "confirm").mockReturnValue(true);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = routeKey(String(url), init);
      calls.push(key);
      requests.push({ url: String(url), init });
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

describe("Biblioteca de Temas — estado sob concorrência", () => {
  it("comprime as fotos da biblioteca com o preset de capa, não com o de mood board", async () => {
    // Uma foto da biblioteca pode acabar numa imagem de CAPA (impressa em
    // grande). Guardá-la com o preset de mood board degradava-a para sempre.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));

    renderTemas();
    await openFolder(/Terracotta/);

    const f = jpg("praia.jpg");
    await chooseFiles(f);

    expect(prepare).toHaveBeenCalledWith(f, "cover");
  });

  it("guarda as fotos dos dois lotes quando dois carregamentos se cruzam", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
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
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)], total: 1 }));
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
    // Do servidor não fica nada; o que está no ecrã é a foto que ela acabou de
    // largar, mostrada a partir do ficheiro que está no computador.
    expect(photos().filter((s) => !s?.startsWith("blob:"))).toEqual([]);

    await release("POST /api/temas/t1/imagens");

    // Fica só a foto nova: a apagada não pode voltar.
    expect(screen.getByRole("button", { name: "Remover foto 1 de 1" })).toBeInTheDocument();
    expect(photos()).not.toContain(photo(1).url);
  });

  it("repõe só a foto cuja remoção falhou, sem deitar fora as que chegaram entretanto", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)], total: 1 }));
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
    await settlePhotos();

    // Duas fotos na grelha: a que voltou (do servidor) e a que subiu — esta
    // mostrada da cópia local, que é a que ela própria acabou de largar.
    expect(screen.getByRole("button", { name: "Remover foto 2 de 2" })).toBeInTheDocument();
    expect(photos()).toHaveLength(2);
    expect(photos()).toContain(photo(1).url);
    expect(photos().some((s) => s?.startsWith("blob:"))).toBe(true);
  });

  it("não faz desaparecer um tema criado enquanto um DELETE falhado ia a caminho", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
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

    // "Fotos indisponíveis" é um AVISO e vai sozinho; os outros trazem também
    // a data da última alteração ("1 foto · há 3 dias"), daí o começo.
    expect(await screen.findByText("Fotos indisponíveis")).toBeInTheDocument();
    expect(screen.getByText(/^500\+ fotos\b/)).toBeInTheDocument();
    expect(screen.getByText(/^1 foto\b/)).toBeInTheDocument();
  });
});

describe("Biblioteca de Temas — milhares de fotos", () => {
  it("pede SÓ a primeira página, e o resto a pedido", async () => {
    // O ecrã anterior pedia tudo de uma vez e o servidor assinava um URL por
    // foto: 4000 fotos = 4000 assinaturas para mostrar as primeiras dezenas.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 312 }]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE) : many(THEME_PAGE_SIZE + 1, 10),
        total: 312,
        truncated: false,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);

    expect(urlsFor("GET /api/temas/t1/imagens")).toEqual([
      `/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`,
    ]);
    expect(photos()).toHaveLength(THEME_PAGE_SIZE);
    // A contagem não mente: diz o que está à vista E o que existe.
    expect(screen.getByText(`${THEME_PAGE_SIZE} de 312 fotos`)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    });

    expect(urlsFor("GET /api/temas/t1/imagens")[1]).toBe(
      `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
    );
    expect(photos()).toHaveLength(THEME_PAGE_SIZE + 10);
  });

  it("mostra a miniatura, e o original só quando não há miniatura", async () => {
    // As fotos anteriores às miniaturas continuam a funcionar — é o contrato.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: [photo(1, true), photo(2)], total: 2 }),
    );

    renderTemas();
    await openFolder(/Terracotta/);

    expect(photos()).toEqual([photo(1, true).thumbUrl, photo(2).url]);
  });

  it("a foto que está no ecrã não espera pelas que não estão", async () => {
    // O CASO DA BIBLIOTECA ANTIGA: 60 fotos sem miniatura, cada uma com o seu
    // original de ~2,6 MB. Pedidos todos ao mesmo tempo, o canal reparte-se
    // por 60 e NENHUMA aparece antes do fim (medido: 26 s até à primeira).
    // Só três de cada vez, pela ordem da grelha, põe a primeira no ecrã em ~1 s.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: many(1, THEME_PAGE_SIZE), total: THEME_PAGE_SIZE }),
    );

    renderTemas();
    fireEvent.click(await screen.findByRole("button", { name: /Terracotta/ }));
    await screen.findByRole("button", { name: "Eliminar tema" });
    await act(async () => {});

    const started = () => imgs().filter((i) => i.getAttribute("src")).length;
    // As 60 células estão desenhadas; só três é que estão a descarregar.
    expect(imgs()).toHaveLength(THEME_PAGE_SIZE);
    expect(started()).toBe(3);
    // E são as PRIMEIRAS: a fila respeita a ordem por que ela olha.
    expect(photos().slice(0, 3)).toEqual([photo(1).url, photo(2).url, photo(3).url]);

    // Cada foto que acaba liberta a vez seguinte — e nunca há mais do que três.
    await act(async () => {
      fireEvent.load(imgs()[0]);
    });
    expect(started()).toBe(4);

    await settlePhotos();
    expect(started()).toBe(THEME_PAGE_SIZE);
  });

  it("com miniatura não há fila nenhuma — 25 KB não precisam de vez", async () => {
    // Medido: pôr um tecto às miniaturas PIORA (60 × 25 KB em ondas de 6 =
    // 1019 ms, contra 350 ms sem tecto). O que é caro é o byte, não o pedido.
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () =>
      ok({ ok: true, images: many(1, THEME_PAGE_SIZE, true), total: THEME_PAGE_SIZE }),
    );

    renderTemas();
    fireEvent.click(await screen.findByRole("button", { name: /Terracotta/ }));
    await screen.findByRole("button", { name: "Eliminar tema" });
    await act(async () => {});

    expect(imgs().filter((i) => i.getAttribute("src"))).toHaveLength(THEME_PAGE_SIZE);
    // A primeira dobra não espera pelo `lazy`; o resto do rolo espera.
    expect(imgs()[0].getAttribute("loading")).toBe("eager");
    expect(imgs()[0].getAttribute("fetchpriority")).toBe("high");
    expect(imgs()[THEME_PAGE_SIZE - 1].getAttribute("loading")).toBe("lazy");
  });

  it("vai buscar a página seguinte antes de ela a pedir — e o botão não espera", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 312 }]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE, true) : many(1000, THEME_PAGE_SIZE, true),
        total: 312,
        truncated: false,
      });
    });

    // O relógio é falso desde o princípio: a espera antes de ir buscar a
    // página seguinte é agendada quando a pasta abre, e um relógio ligado a
    // meio já não a apanhava.
    vi.useFakeTimers();
    try {
      renderTemas();
      await tick();
      fireEvent.click(screen.getByRole("button", { name: /Terracotta/ }));
      await tick();
      // A primeira página não leva companhia: pedir as duas ao mesmo tempo era
      // fazer exatamente o que este trabalho veio corrigir.
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(1);

      await tick(2000);

      // A seguinte já está cá — pedida ao servidor uma vez, e uma só.
      expect(urlsFor("GET /api/temas/t1/imagens")[1]).toBe(
        `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE}&limit=${THEME_PAGE_SIZE}`,
      );
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(2);

      fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
      await tick();
      // O clique não fez pedido nenhum: as fotos já estavam em casa.
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(2);
      expect(photos()).toHaveLength(THEME_PAGE_SIZE * 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("a página adiantada é deitada fora quando a grelha muda por baixo dela", async () => {
    // Uma foto que sobe entra à CABEÇA e empurra tudo um lugar: a página que
    // estava guardada para o offset 60 passaria a saltar uma foto. Só encaixa
    // quem foi pedido para o sítio onde a grelha está agora.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 312 }]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE, true) : many(1000, THEME_PAGE_SIZE, true),
        total: 312,
      });
    });
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(900, true)] }));

    vi.useFakeTimers();
    try {
      renderTemas();
      await tick();
      fireEvent.click(screen.getByRole("button", { name: /Terracotta/ }));
      await tick();
      await tick(2000);
      expect(callsTo("GET /api/temas/t1/imagens")).toBe(2); // a adiantada

      // Sobe uma foto: a grelha passa a ter 61 e a página guardada (offset 60)
      // deixou de servir.
      fireEvent.change(fileInput(), { target: { files: [jpg("nova.jpg")] } });
      await tick();
      await tick();
      await tick(2000);

      // Foi deitada fora e pedida outra, agora com o offset certo.
      const urls = urlsFor("GET /api/temas/t1/imagens");
      expect(urls[urls.length - 1]).toBe(
        `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE + 1}&limit=${THEME_PAGE_SIZE}`,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("o offset de 'Mostrar mais' acompanha as fotos que subiram entretanto", async () => {
    // A lista do servidor é por data decrescente: uma foto nova entra à
    // CABEÇA e empurra tudo o resto um lugar para trás. Com uma contagem de
    // páginas fixa, a página seguinte saltava exatamente essas fotos.
    route("GET /api/temas", () => ok([THEME]));
    let call = 0;
    route("GET /api/temas/t1/imagens", () => {
      call += 1;
      return ok({
        ok: true,
        images: call === 1 ? many(1, THEME_PAGE_SIZE) : many(900, 5),
        total: 500,
      });
    });
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(777)] }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("nova.jpg"));
    expect(photos()).toHaveLength(THEME_PAGE_SIZE + 1);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    });

    expect(urlsFor("GET /api/temas/t1/imagens")[1]).toBe(
      `/api/temas/t1/imagens?offset=${THEME_PAGE_SIZE + 1}&limit=${THEME_PAGE_SIZE}`,
    );
  });

  it("uma pasta que não pôde ser lida não é uma pasta vazia", async () => {
    // "0 fotos" aqui leria-se como "as minhas 4000 fotos desapareceram" — e o
    // convite a arrastar fotos levaria a duplicar o que já lá está.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 300 }]));
    route("GET /api/temas/t1/imagens", () => bad(502));

    renderTemas();
    await openFolder(/Terracotta/);

    expect(screen.getByText("Fotos indisponíveis")).toBeInTheDocument();
    expect(screen.getByText(/Não foi possível ler a pasta/)).toBeInTheDocument();
    expect(screen.queryByText(/Arrasta para aqui/)).not.toBeInTheDocument();
  });

  it("procura temas por nome e por nota, sem acentos nem maiúsculas", async () => {
    route("GET /api/temas", () =>
      ok([
        { ...THEME, id: "t1", name: "Terracotta", notes: "tons quentes" },
        { ...THEME, id: "t2", name: "Itália", notes: "limões" },
        { ...THEME, id: "t3", name: "Branco & Verde", notes: "" },
        { ...THEME, id: "t4", name: "Boho", notes: "" },
        { ...THEME, id: "t5", name: "Praia", notes: "areia e tons quentes" },
      ]),
    );

    renderTemas();
    const field = await screen.findByLabelText(/Procurar tema/);

    await act(async () => {
      fireEvent.change(field, { target: { value: "ITALIA" } });
    });
    expect(screen.getByRole("button", { name: /Itália/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Terracotta/ })).not.toBeInTheDocument();

    // A nota é muitas vezes como o tema é lembrado.
    await act(async () => {
      fireEvent.change(field, { target: { value: "tons quentes" } });
    });
    expect(screen.getByRole("button", { name: /Terracotta/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Praia/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Boho/ })).not.toBeInTheDocument();
  });
});

describe("Biblioteca de Temas — as fotos aparecem enquanto sobem", () => {
  it("a foto entra na grelha ANTES de o servidor responder, vinda do ficheiro dela", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    await chooseFiles(jpg("praia.jpg"));

    // O servidor ainda não respondeu e a foto já está no ecrã — do disco dela.
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(1);
    expect(photos()).toHaveLength(1);
    expect(photos()[0]).toMatch(/^blob:/);
    expect(screen.getByText("A carregar")).toBeInTheDocument();
    // E ainda não é uma foto do tema: não se pode selecionar nem remover o que
    // ainda não existe no servidor.
    expect(screen.queryByRole("button", { name: /Remover foto/ })).toBeNull();

    await release("POST /api/temas/t1/imagens");

    // Chegou: a célula provisória dá lugar à foto verdadeira, sem piscar —
    // continua a mostrar-se a cópia local, que já está no computador dela.
    expect(screen.queryByText("A carregar")).toBeNull();
    expect(screen.getByRole("button", { name: "Remover foto 1 de 1" })).toBeInTheDocument();
    expect(photos()[0]).toMatch(/^blob:/);
  });

  it("uma foto que falha não deixa a célula pendurada no ecrã", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => bad(413, { error: "Imagem demasiado grande" }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("enorme.jpg"));

    // Fica a caixa do "tentar novamente" — e mais nada na grelha.
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
    expect(screen.queryByText("A carregar")).toBeNull();
    expect(photos()).toHaveLength(0);
  });

  it("liberta as cópias locais ao sair da pasta", async () => {
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/imagens", () => ok({ ok: true, images: [photo(1)] }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("praia.jpg"));
    const blob = photos()[0];

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "← Temas" }));
    });

    expect(revoke).toHaveBeenCalledWith(blob);
  });
});

describe("Biblioteca de Temas — lote de 300 fotos", () => {
  it("sobe no máximo quatro fotos ao mesmo tempo, e vai puxando as seguintes", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);

    await chooseFiles(...Array.from({ length: 10 }, (_, i) => jpg(`f${i}.jpg`)));
    // Sequencial subia uma; sem limite subia dez de uma vez (e rebentava a
    // memória com 300). São quatro em voo.
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(4);

    await release("POST /api/temas/t1/imagens");
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(5);

    await releaseAll("POST /api/temas/t1/imagens");
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(10);
    expect(photos()).toHaveLength(10);
  });

  it("conta o progresso de verdade — '47 de 312', não uma roda a girar", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });
    hold("POST /api/temas/t1/imagens");

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...Array.from({ length: 6 }, (_, i) => jpg(`f${i}.jpg`)));

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuemax", "6");
    await release("POST /api/temas/t1/imagens");
    await release("POST /api/temas/t1/imagens");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "2");

    await releaseAll("POST /api/temas/t1/imagens");
    // Terminado o lote, o indicador sai do ecrã.
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("um ficheiro mau não deita fora o resto do lote, e repete-se sem o voltar a escolher", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    let failNext = true;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      // A primeira falha; as outras passam. Na repetição já não falha nenhuma.
      if (failNext) {
        failNext = false;
        return bad(502, { error: "Falha ao guardar a imagem." });
      }
      return ok({ ok: true, images: [photo(n)] });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("a.jpg"), jpg("b.jpg"), jpg("c.jpg"));

    // Duas passaram — a falha não interrompeu o lote.
    expect(photos()).toHaveLength(2);
    expect(screen.getByText(/não subiu/)).toBeInTheDocument();

    // E repete-se a partir do que ficou guardado: nenhum ficheiro é escolhido
    // outra vez, o seletor nem sequer é aberto.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));
    });
    expect(photos()).toHaveLength(3);
    expect(screen.queryByText(/não subiu/)).not.toBeInTheDocument();
  });

  it("envia a miniatura ao lado do original, e só o original quando não há", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(n)] });
    });

    const original = jpg("grande.jpg");
    const thumb = jpg("grande.thumb.jpg");
    prepare.mockImplementationOnce(async () => ({ file: original, thumb }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("grande.jpg"));

    const body = requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens")
      ?.init?.body as FormData;
    expect(body.getAll("files")).toEqual([original]);
    expect(body.getAll("thumbs")).toEqual([thumb]);

    // Uma foto já pequena não gera miniatura — e o campo fica simplesmente
    // vazio, sem desalinhar a correspondência ficheiro↔miniatura.
    await chooseFiles(jpg("pequena.jpg"));
    const second = requests.filter(
      (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens",
    )[1].init?.body as FormData;
    expect(second.getAll("thumbs")).toEqual([]);
  });
});

describe("Biblioteca de Temas — miniaturas em falta", () => {
  /** Um servidor de miniaturas que percorre `total` fotos, `perLote` de cada vez. */
  function serveThumbJob(total: number, perLote = 8) {
    route("POST /api/temas/t1/miniaturas", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/miniaturas",
      );
      const cursor = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).cursor ?? 0;
      const scanned = Math.min(perLote, Math.max(0, total - cursor));
      const next = cursor + scanned;
      return ok({
        ok: true,
        scanned,
        generated: scanned,
        skipped: 0,
        failed: 0,
        nextCursor: next >= total ? null : next,
        total,
      });
    });
  }

  it("não aparece quando as fotos já têm miniatura", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));

    renderTemas();
    await openFolder(/Terracotta/);

    expect(screen.queryByRole("button", { name: /Gerar miniaturas/ })).toBeNull();
  });

  it("percorre a pasta por lotes, mostra o andamento e continua de onde ficou", async () => {
    // A BIBLIOTECA QUE JÁ EXISTE: fotos carregadas antes de haver miniaturas.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 20 }]));
    let listed = 0;
    route("GET /api/temas/t1/imagens", () => {
      listed += 1;
      // Depois de gerar, a mesma página volta a vir — agora com miniaturas.
      return ok({ ok: true, images: many(1, 20, listed > 1), total: 20 });
    });
    serveThumbJob(20);

    renderTemas();
    await openFolder(/Terracotta/);

    // A grelha está a mostrar ORIGINAIS: é isso que o cartão diz, e é verdade.
    expect(photos()[0]).toBe(photo(1).url);
    expect(screen.getByText(/Há fotos antigas sem miniatura/)).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });

    // Três lotes (8 + 8 + 4) e o cursor foi sempre o que o servidor mandou.
    const bodies = requests
      .filter((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/miniaturas")
      .map((r) => JSON.parse(String(r.init?.body)).cursor);
    expect(bodies).toEqual([0, 8, 16]);

    // No fim a grelha passa a mostrar as miniaturas — sem recarregar a página.
    await settlePhotos();
    expect(photos()[0]).toBe(photo(1, true).thumbUrl);
    expect(screen.queryByRole("button", { name: /Gerar miniaturas/ })).toBeNull();
  });

  it("parar a meio guarda o que já foi feito e não perde o resto", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 100 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 20), total: 100 }));
    serveThumbJob(100);
    hold("POST /api/temas/t1/miniaturas");

    renderTemas();
    await openFolder(/Terracotta/);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });
    await release("POST /api/temas/t1/miniaturas");

    // A meio: o andamento está à vista e há como parar.
    expect(screen.getByText(/A gerar miniaturas/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    await release("POST /api/temas/t1/miniaturas");

    // Parou — e o botão convida a continuar, não a recomeçar do zero.
    expect(screen.getByRole("button", { name: "Continuar a gerar miniaturas" })).toBeVisible();
    expect(screen.getByText(/parado a meio/)).toBeInTheDocument();
    // Dois lotes pedidos, e mais nenhum depois do "Parar".
    expect(callsTo("POST /api/temas/t1/miniaturas")).toBe(2);
  });

  it("desiste quando nada é gerado — não percorre 4000 fotos a falhar em silêncio", async () => {
    // O servidor responde 200 a dizer "vi 8, gerei 0, falharam 8": não é a
    // foto, é o Storage. Insistir seria a barra a andar sem nada acontecer.
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 4000 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 20), total: 4000 }));
    let cursor = 0;
    route("POST /api/temas/t1/miniaturas", () => {
      cursor += 8;
      return ok({
        scanned: 8,
        generated: 0,
        skipped: 0,
        failed: 8,
        nextCursor: cursor,
        total: 4000,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });

    expect(callsTo("POST /api/temas/t1/miniaturas")).toBe(3);
    expect(screen.getByText(/8 fotos sem miniatura|24 fotos sem miniatura/)).toBeInTheDocument();
  });

  it("uma falha do servidor não apaga o que já tinha sido gerado", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 100 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 20), total: 100 }));
    let n = 0;
    route("POST /api/temas/t1/miniaturas", () => {
      n += 1;
      if (n === 1) {
        return ok({ scanned: 8, generated: 8, skipped: 0, failed: 0, nextCursor: 8, total: 100 });
      }
      return bad(503, { error: "Não foi possível ler a pasta do tema." });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Gerar miniaturas em falta" }));
    });

    // (a mesma frase aparece também no aviso passageiro — chegam as duas)
    expect(screen.getAllByText(/8 miniaturas criadas/).length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: "Continuar a gerar miniaturas" })).toBeVisible();
  });
});

describe("Biblioteca de Temas — seleção e ações em bloco", () => {
  const five = { ok: true, images: many(1, 5), total: 5 };

  it("Shift+clique seleciona o intervalo e uma só confirmação remove tudo", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    route("DELETE /api/temas/t1/imagens", () => ok({ ok: true }));

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 4 de 5" }), {
      shiftKey: true,
    });
    expect(screen.getByText("4 fotos selecionadas")).toBeInTheDocument();

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    });

    // Uma pergunta para as quatro — não quatro perguntas.
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(callsTo("DELETE /api/temas/t1/imagens")).toBe(4);
    expect(photos()).toEqual([photo(5).url]);
  });

  it("as fotos que o servidor recusa apagar voltam ao sítio onde estavam", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    let n = 0;
    route("DELETE /api/temas/t1/imagens", () => {
      n += 1;
      return n === 1 ? bad(502) : ok({ ok: true });
    });

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 2 de 5" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 3 de 5" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Remover" }));
    });

    // A que falhou volta — e volta ao seu lugar na ordem, não ao fim.
    expect(photos()).toHaveLength(4);
    expect(photos()[1]).toBe(photo(2).url);
  });

  it("define uma foto como capa do tema", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(five));
    route("PATCH /api/temas/t1", () => ok({ ...THEME, coverPath: "t1/foto-3.jpg" }));

    renderTemas();
    await openFolder(/Terracotta/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 3 de 5" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Definir como capa" }));
    });

    const patch = requests.find((r) => routeKey(r.url, r.init) === "PATCH /api/temas/t1");
    expect(JSON.parse(String(patch?.init?.body))).toEqual({ coverPath: "t1/foto-3.jpg" });
    expect(screen.getByText("Capa")).toBeInTheDocument();
    // A ação de capa só faz sentido para UMA foto.
    expect(screen.queryByRole("button", { name: "Definir como capa" })).not.toBeInTheDocument();
  });
});

describe("reordenar fotos à mão", () => {
  it("tira a foto de onde está e põe-na onde deve ficar", () => {
    expect(moveItem(["a", "b", "c", "d"], 2, 0)).toEqual(["c", "a", "b", "d"]);
    expect(moveItem(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "b", "c"]);
  });

  it("nunca perde nem duplica uma foto", () => {
    const list = ["a", "b", "c", "d", "e"];
    for (let from = 0; from < list.length; from++) {
      for (let to = 0; to < list.length; to++) {
        const moved = moveItem(list, from, to);
        expect([...moved].sort()).toEqual([...list].sort());
        expect(moved).toHaveLength(list.length);
      }
    }
  });

  it("devolve a lista intacta para índices fora dela", () => {
    const list = ["a", "b"];
    expect(moveItem(list, -1, 0)).toBe(list);
    expect(moveItem(list, 0, 5)).toBe(list);
  });
});

describe("ajudantes puros da grelha", () => {
  const a = photo(1);
  const b = photo(2);
  const c = photo(3);

  it("mergePage não duplica o que já está na grelha", () => {
    // Acontece de verdade: enquanto sobem fotos, a lista do servidor desloca-se
    // e a página seguinte pode trazer de volta alguma que já mostramos.
    expect(mergePage([a, b], [b, c])).toEqual([a, b, c]);
    expect(mergePage([], [a])).toEqual([a]);
  });

  it("mergePage ignora entradas sem caminho", () => {
    expect(mergePage([a], [{ path: "", url: "x" }])).toEqual([a]);
  });

  it("reinsertAt repõe cada foto no índice onde estava", () => {
    const positions = new Map([
      [a.path, 0],
      [b.path, 1],
      [c.path, 2],
    ]);
    expect(reinsertAt([b], [a, c], positions)).toEqual([a, b, c]);
  });

  it("reinsertAt não repete uma foto que já lá está", () => {
    const positions = new Map([[a.path, 0]]);
    expect(reinsertAt([a, b], [a], positions)).toEqual([a, b]);
  });

  it("reinsertAt aguenta um índice que já não existe na lista encolhida", () => {
    const positions = new Map([[c.path, 9]]);
    expect(reinsertAt([a], [c], positions)).toEqual([a, c]);
  });
});

// ── NÃO REPETIR FOTOS QUE JÁ ESTÃO NO TEMA ─────────────────────────────────
//
// O pedido dela, pelas palavras dela: "quando eu adicionar fotos ele perceber
// se já aquela foto no tema e adicionar só as que ainda não estão". O que aqui
// se fixa é o que separa isso de fazer desaparecer uma foto boa em silêncio.

describe("Biblioteca de Temas — fotos que já lá estão", () => {
  /** O tema já tem estas fotos (a rota de pré-verificação responde por elas). */
  function themeKnows(...files: File[]) {
    const known = new Set(files.map((f) => fp.hash(fp.content.get(f) ?? "")));
    route("POST /api/temas/t1/repetidas", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/repetidas",
      );
      const asked: string[] = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).hashes;
      return ok({
        ok: true,
        known: asked.filter((h) => known.has(h)),
        complete: true,
        legacy: false,
        read: true,
      });
    });
  }

  function serveUploads() {
    let n = 0;
    route("POST /api/temas/t1/imagens", () => {
      n += 1;
      return ok({ ok: true, images: [photo(100 + n)], duplicates: [] });
    });
  }

  beforeEach(() => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: [], total: 0 }));
    route("POST /api/temas/t1/repetidas", () =>
      ok({ ok: true, known: [], complete: true, legacy: false, read: true }),
    );
    serveUploads();
  });

  it("O PEDIDO: das que ela larga, só sobem as que ainda não estão no tema", async () => {
    const ja = jpg("praia.jpg");
    const nova = jpg("mesa.jpg");
    themeKnows(ja);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(ja, nova);

    // Uma só subiu — e a repetida nem chegou a ser PREPARADA (é o que poupa os
    // 383 ms por foto, contra os 16 ms que custa resumi-la).
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(1);
    expect(prepare).toHaveBeenCalledTimes(1);
    expect(prepare).toHaveBeenCalledWith(nova, "cover");
  });

  it("o resumo do ficheiro viaja com a foto que sobe", async () => {
    const nova = jpg("mesa.jpg");
    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(nova);

    const body = requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens")
      ?.init?.body as FormData;
    expect(body.get("hashes")).toBe(fp.hash("mesa.jpg"));
    expect(body.get("force")).toBeNull();
  });

  it("A MESMA FOTO DUAS VEZES NO MESMO LOTE entra uma só vez", async () => {
    // A pré-verificação nunca as apanharia: ainda não estão na pasta.
    const a = jpg("praia.jpg");
    const copia = sameAs(a, "praia (1).jpg");

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(a, copia, jpg("outra.jpg"));

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(2);
    expect(screen.getByText(/não foi adicionada|não foram adicionadas/)).toBeInTheDocument();
    expect(screen.getByText(/repetidas dentro do mesmo arrasto/)).toBeInTheDocument();
  });

  it("LOTE METADE REPETIDO: a conta que ela lê é verdadeira", async () => {
    const velhas = Array.from({ length: 3 }, (_, i) => jpg(`velha-${i}.jpg`));
    const novas = Array.from({ length: 3 }, (_, i) => jpg(`nova-${i}.jpg`));
    themeKnows(...velhas);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...velhas, ...novas);

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(3);
    expect(screen.getByText(/3 fotos não foram adicionadas/)).toBeInTheDocument();
    expect(screen.getByText(/já estavam em/)).toBeInTheDocument();
  });

  it("TODAS REPETIDAS não é uma barra a andar e nada a acontecer", async () => {
    // Sem esta frase ela vê o progresso mexer, a grelha na mesma, e conclui
    // que o site está avariado.
    const velhas = Array.from({ length: 3 }, (_, i) => jpg(`velha-${i}.jpg`));
    themeKnows(...velhas);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...velhas);

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(0);
    expect(prepare).not.toHaveBeenCalled();
    expect(screen.getByText(/3 fotos não foram adicionadas/)).toBeInTheDocument();
  });

  it("'Adicionar mesmo assim' volta a subi-las, agora com force", async () => {
    const ja = jpg("praia.jpg");
    themeKnows(ja);

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(ja);
    expect(callsTo("POST /api/temas/t1/imagens")).toBe(0);

    fireEvent.click(screen.getByRole("button", { name: "Adicionar mesmo assim" }));
    await settleScreening();
    await act(async () => {});

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(1);
    const body = requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens")
      ?.init?.body as FormData;
    expect(body.get("force")).toBe("1");
    // O RESUMO VAI NA MESMA. Sem ele o servidor cunhava um UUID e esta foto
    // deixava de contar como "está no tema" — um buraco permanente no índice
    // por cada clique em "Adicionar mesmo assim".
    expect(body.get("hashes")).toBe(fp.hash("praia.jpg"));
    // Forçar não volta a perguntar à pasta: é uma decisão dela, já tomada.
    expect(callsTo("POST /api/temas/t1/repetidas")).toBe(1);
    expect(screen.queryByRole("button", { name: "Adicionar mesmo assim" })).toBeNull();
  });

  it("uma repetida apanhada PELO SERVIDOR conta como as outras", async () => {
    // A corrida (dois separadores) e a foto antiga de nome UUID só aparecem
    // aqui — o relatório é do que ACONTECEU, não do que se previu.
    route("POST /api/temas/t1/imagens", () =>
      ok({
        ok: true,
        images: [],
        duplicates: [{ name: "praia.jpg", path: "t1/velha.jpg", reason: "no-tema" }],
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("praia.jpg"));

    expect(screen.getByText(/1 foto não foi adicionada/)).toBeInTheDocument();
    // E NÃO é um erro: nada de caixa vermelha nem de "tentar novamente".
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    // A grelha continua vazia — a miniatura que se vê é a do painel das
    // saltadas, desenhada do ficheiro que está no computador dela.
    expect(screen.queryByRole("button", { name: /Remover foto/ })).toBeNull();
    expect(screen.queryByText("A carregar")).toBeNull();
  });

  it("a pasta ilegível não trava o carregamento — sobe tudo", async () => {
    // `read: false` = não se pôde verificar. Dizer "nenhuma repetida" seria
    // prometer uma verificação que não aconteceu; travar seria pior ainda.
    route("POST /api/temas/t1/repetidas", () => bad(503, { error: "Armazenamento indisponível." }));

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(jpg("a.jpg"), jpg("b.jpg"));

    expect(callsTo("POST /api/temas/t1/imagens")).toBe(2);
    expect(screen.queryByText(/não foram adicionadas/)).toBeNull();
  });

  it("diz uma vez, sem drama, que as fotos antigas nem sempre são reconhecidas", async () => {
    const ja = jpg("praia.jpg");
    const known = new Set([fp.hash("praia.jpg")]);
    route("POST /api/temas/t1/repetidas", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/repetidas",
      );
      const asked: string[] = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).hashes;
      return ok({
        ok: true,
        known: asked.filter((h) => known.has(h)),
        complete: true,
        legacy: true,
        read: true,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(ja);

    expect(screen.getByText(/nem sempre podem ser reconhecidas/)).toBeInTheDocument();
  });

  it("pergunta à pasta em pedaços, não o arrasto todo de uma vez", async () => {
    // Em pedaços, a primeira foto começa a subir ao fim de ~0,3 s em vez de
    // ~2 s num arrasto de 300.
    const files = Array.from({ length: CHECK_CHUNK + 5 }, (_, i) => jpg(`f${i}.jpg`));
    renderTemas();
    await openFolder(/Terracotta/);
    await chooseFiles(...files);
    expect(callsTo("POST /api/temas/t1/repetidas")).toBe(2);
  });
});

// ── LEVAR FOTOS DE UM TEMA PARA OUTRO ──────────────────────────────────────

describe("Biblioteca de Temas — copiar e mover fotos entre temas", () => {
  const OUTRO: ThemeSummary = {
    ...THEME,
    id: "t2",
    name: "Itália",
    imageCount: 7,
  };
  const cinco = { ok: true, images: many(1, 5), total: 5 };

  /** Abre o diálogo com as fotos `n` selecionadas (índices 1-based da grelha). */
  async function selectAndOpen(...indices: number[]) {
    for (const i of indices) {
      fireEvent.click(screen.getByRole("checkbox", { name: `Selecionar foto ${i} de 5` }));
    }
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar para…" }));
    });
  }

  it("o botão só existe havendo outro tema para onde levar", async () => {
    route("GET /api/temas", () => ok([THEME]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 5" }));

    expect(screen.queryByRole("button", { name: "Copiar para…" })).toBeNull();
    // A palavra "Transferir" continua a significar DESCARREGAR nesta barra.
    expect(screen.getByRole("button", { name: "Transferir" })).toBeInTheDocument();
  });

  it("copia sem mexer na grelha e soma no cartão do destino", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      ok({
        ok: true,
        copied: [
          { from: "t1/foto-1.jpg", to: "t2/foto-1.jpg" },
          { from: "t1/foto-2.jpg", to: "t2/foto-2.jpg" },
        ],
        existing: [],
        failed: [],
        requested: 2,
        thumbsMissing: 0,
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1, 2);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 2 fotos$/ }));
    });

    const body = JSON.parse(
      String(
        requests.find((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar")?.init
          ?.body,
      ),
    );
    expect(body).toEqual({
      paths: ["t1/foto-1.jpg", "t1/foto-2.jpg"],
      destino: "t2",
      modo: "copiar",
    });
    // Copiar não tira nada daqui.
    expect(photos()).toHaveLength(5);

    // O cartão do destino já conta com elas. A linha traz também a data da
    // última alteração ("9 fotos · há 3 dias"), por isso compara-se o começo.
    fireEvent.click(screen.getByRole("button", { name: "← Temas" }));
    expect(await screen.findByText(/^9 fotos\b/)).toBeInTheDocument();
  });

  it("mover tira da grelha SÓ as que o servidor confirmou", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      ok({
        ok: true,
        copied: [{ from: "t1/foto-1.jpg", to: "t2/foto-1.jpg" }],
        existing: [],
        failed: ["t1/foto-2.jpg"],
        requested: 2,
        thumbsMissing: 0,
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1, 2);

    fireEvent.click(screen.getByRole("radio", { name: "Mover" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Mover 2 fotos$/ }));
    });
    await settlePhotos();

    // A que saiu desapareceu; a que falhou continua aqui.
    expect(photos()).toHaveLength(4);
    expect(photos()).not.toContain(photo(1).url);
    expect(photos()).toContain(photo(2).url);
    // E continua SELECIONADA, para não ser preciso escolher tudo de novo.
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
    expect(screen.getByText(/1 de 2 não foi movida para/)).toBeInTheDocument();
  });

  it("'já lá estava' não é um erro e não aparece a vermelho", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      ok({
        ok: true,
        copied: [{ from: "t1/foto-1.jpg", to: "t2/foto-1.jpg" }],
        existing: ["t1/foto-2.jpg"],
        failed: [],
        requested: 2,
        thumbsMissing: 0,
      }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1, 2);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 2 fotos$/ }));
    });

    expect(screen.queryByRole("button", { name: "Tentar novamente" })).toBeNull();
    expect(screen.getByText(/1 já lá estavam|1 foto copiada/)).toBeInTheDocument();
  });

  it("um lote grande é partido em pedidos que cabem no teto do servidor", async () => {
    const grande = { ok: true, images: many(1, THEME_PAGE_SIZE), total: THEME_PAGE_SIZE };
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(grande));
    route("POST /api/temas/t1/imagens/copiar", () => {
      const last = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar",
      );
      const paths: string[] = JSON.parse(String(last[last.length - 1].init?.body ?? "{}")).paths;
      return ok({
        ok: true,
        copied: paths.map((p) => ({ from: p, to: p.replace("t1/", "t2/") })),
        existing: [],
        failed: [],
        requested: paths.length,
        thumbsMissing: 0,
      });
    });

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 60" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 60 de 60" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar para…" }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 60 fotos$/ }));
    });

    // 60 fotos em lotes de THEME_COPY_CHUNK, e nenhum acima do teto da rota.
    const bodies = requests
      .filter((r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar")
      .map((r) => JSON.parse(String(r.init?.body)).paths.length);
    expect(bodies).toEqual([THEME_COPY_CHUNK, THEME_COPY_CHUNK, THEME_COPY_CHUNK]);
    expect(Math.max(...bodies)).toBeLessThanOrEqual(MAX_THEME_COPY_BATCH);
  });

  /**
   * PARAR A MEIO NÃO PODE CUSTAR A SELEÇÃO.
   *
   * Mover 60 fotos são três pedidos. Ela carrega em "Parar" depois do primeiro:
   * 20 foram, 40 ficaram sem ser sequer tentadas. Essas 40 não estão nem em
   * `copied`, nem em `existing`, nem em `failed` — e a grelha limpava-lhes a
   * seleção, deixando o cartão a dizer "as que faltavam continuam neste tema"
   * sem o botão de retomar e sem forma de as reencontrar a não ser clicando
   * quarenta vezes.
   */
  it("parar a meio deixa selecionadas as que ainda não foram tentadas", async () => {
    const grande = { ok: true, images: many(1, THEME_PAGE_SIZE), total: THEME_PAGE_SIZE };
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(grande));
    route("POST /api/temas/t1/imagens/copiar", () => {
      const feitos = requests.filter(
        (r) => routeKey(r.url, r.init) === "POST /api/temas/t1/imagens/copiar",
      );
      const paths: string[] = JSON.parse(
        String(feitos[feitos.length - 1].init?.body ?? "{}"),
      ).paths;
      return ok({
        ok: true,
        copied: paths.map((p) => ({ from: p, to: p.replace("t1/", "t2/") })),
        existing: [],
        failed: [],
        requested: paths.length,
        thumbsMissing: 0,
      });
    });
    hold("POST /api/temas/t1/imagens/copiar");

    renderTemas();
    await openFolder(/Terracotta/);
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 1 de 60" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar foto 60 de 60" }), {
      shiftKey: true,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copiar para…" }));
    });
    fireEvent.click(screen.getByRole("radio", { name: "Mover" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Mover 60 fotos$/ }));
    });

    // "Parar" enquanto o primeiro pedido ainda vai a caminho: o que já foi
    // pedido termina, o resto nem chega a ser tentado.
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    await release("POST /api/temas/t1/imagens/copiar");
    await settlePhotos();

    // Um pedido só — os outros dois nem saíram.
    expect(callsTo("POST /api/temas/t1/imagens/copiar")).toBe(1);
    expect(photos()).toHaveLength(THEME_PAGE_SIZE - THEME_COPY_CHUNK);
    // E as que faltavam continuam escolhidas, prontas para retomar.
    expect(
      screen.getByText(`${THEME_PAGE_SIZE - THEME_COPY_CHUNK} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tentar novamente" })).toBeInTheDocument();
  });

  it("uma cópia que falha inteira deixa as fotos onde estavam", async () => {
    route("GET /api/temas", () => ok([THEME, OUTRO]));
    route("GET /api/temas/t1/imagens", () => ok(cinco));
    route("POST /api/temas/t1/imagens/copiar", () =>
      bad(502, { error: "Não foi possível copiar as fotos." }),
    );

    renderTemas();
    await openFolder(/Terracotta/);
    await selectAndOpen(1);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^Copiar 1 foto$/ }));
    });

    // O diálogo fica aberto, com a razão à vista — e a grelha intacta.
    expect(screen.getByText("Não foi possível copiar as fotos.")).toBeInTheDocument();
    expect(photos()).toHaveLength(5);
  });
});

describe("Biblioteca de Temas — ordem dos cartões", () => {
  const tema = (over: Partial<ThemeSummary>): ThemeSummary => ({ ...THEME, ...over });
  const nomes = (lista: ThemeSummary[]) => lista.map((t) => t.name);

  const A = tema({ id: "a", name: "Alfa", updatedAt: "2026-01-01T00:00:00.000Z", imageCount: 5 });
  const B = tema({ id: "b", name: "Beta", updatedAt: "2026-06-01T00:00:00.000Z", imageCount: 1 });
  const C = tema({ id: "c", name: "Gama", updatedAt: "2026-03-01T00:00:00.000Z", imageCount: 9 });

  it("A–Z, por data e por nº de fotos", () => {
    expect(nomes(ordenarTemas([C, A, B], "alfabetica"))).toEqual(["Alfa", "Beta", "Gama"]);
    expect(nomes(ordenarTemas([A, B, C], "recentes"))).toEqual(["Beta", "Gama", "Alfa"]);
    expect(nomes(ordenarTemas([A, B, C], "fotos"))).toEqual(["Gama", "Alfa", "Beta"]);
  });

  /**
   * O que FIXAR quer dizer: um tema que se usa em quase todas as propostas não
   * pode mudar de sítio porque se ordenou por data. Sem isto, "fixar" era só
   * uma estrela desenhada.
   */
  it("um favorito vem à frente seja qual for a ordem", () => {
    const fixado = { ...C, favorito: true };
    for (const ordem of ["alfabetica", "recentes", "fotos"] as const) {
      expect(nomes(ordenarTemas([A, B, fixado], ordem))[0]).toBe("Gama");
    }
  });

  /**
   * Uma pasta ilegível não sabe quantas fotos tem. Contá-la como zero punha-a
   * atrás de um tema com uma foto — ou seja, escondia no fim da lista
   * precisamente o tema que tem um problema.
   */
  it("uma pasta por ler fica no fim de 'com mais fotos', não à frente do 1 foto", () => {
    const ilegivel = tema({ id: "x", name: "Xis", imageCount: null });
    expect(nomes(ordenarTemas([ilegivel, B], "fotos"))).toEqual(["Beta", "Xis"]);
  });

  it("não mexe na lista que recebe", () => {
    const original = [C, A, B];
    ordenarTemas(original, "alfabetica");
    expect(nomes(original)).toEqual(["Gama", "Alfa", "Beta"]);
  });
});

describe("desdeQuando", () => {
  const agora = Date.parse("2026-08-05T12:00:00.000Z");
  const dias = (n: number) => new Date(agora - n * 86_400_000).toISOString();

  it("fala como se fala", () => {
    expect(desdeQuando(dias(0), agora)).toBe("hoje");
    expect(desdeQuando(dias(1), agora)).toBe("ontem");
    expect(desdeQuando(dias(9), agora)).toBe("há 9 dias");
    expect(desdeQuando(dias(60), agora)).toBe("há 2 meses");
    expect(desdeQuando(dias(400), agora)).toBe("há 1 ano");
  });

  /** Um relógio trocado (ou uma escrita acabada de acontecer) não pode produzir
   *  "há -2 dias" no cartão. */
  it("uma data no futuro conta como hoje", () => {
    expect(desdeQuando(new Date(agora + 86_400_000).toISOString(), agora)).toBe("hoje");
  });

  it("sem data, ou com lixo, não diz nada", () => {
    expect(desdeQuando(undefined, agora)).toBe("");
    expect(desdeQuando("ontem à tarde", agora)).toBe("");
  });
});

// ── Bloco 9: os números da biblioteca ──────────────────────────────────────

describe("contarFotosDaBiblioteca", () => {
  const t = (imageCount: number | null) => ({ imageCount }) as never;

  it("soma as fotos e conta os temas", () => {
    expect(contarFotosDaBiblioteca([t(10), t(4), t(0)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 0,
    });
  });

  it("uma pasta ilegível NÃO conta como zero — conta como desconhecida", () => {
    // Somá-la a zero em silêncio dava uma biblioteca mais pequena do que é, e
    // é assim que alguém conclui que faltam fotos e as volta a carregar.
    expect(contarFotosDaBiblioteca([t(10), t(null), t(4)])).toEqual({
      fotos: 14,
      temas: 3,
      ilegiveis: 1,
    });
  });

  it("aguenta uma biblioteca vazia", () => {
    expect(contarFotosDaBiblioteca([])).toEqual({ fotos: 0, temas: 0, ilegiveis: 0 });
  });
});

describe("temPoucasFotos", () => {
  it("avisa abaixo de três — o que não chega para ESCOLHER", () => {
    expect(temPoucasFotos({ imageCount: 0 })).toBe(true);
    expect(temPoucasFotos({ imageCount: 2 })).toBe(true);
    expect(temPoucasFotos({ imageCount: 3 })).toBe(false);
    expect(temPoucasFotos({ imageCount: 40 })).toBe(false);
  });

  it("cala-se quando não se sabe quantas são", () => {
    // Um aviso a partir do que não se sabe é um aviso errado.
    expect(temPoucasFotos({ imageCount: null })).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRELHA AO DEDO — o que se mede com uma régua, guardado com uma asserção
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Medido no telemóvel (Chromium a 375×667, `hasTouch`), antes desta rede
 * existir: a grelha dava três colunas de 97,7 px e cada célula levava TRÊS
 * botões de 28×28 sempre visíveis — dois terços do mínimo de 44 px que a casa
 * exige a um alvo de toque, e um deles apaga a foto.
 *
 * O jsdom não sabe medir nada: não há CSS, não há `(pointer: coarse)`, e um
 * `getBoundingClientRect` devolve zeros. Por isso o que se guarda aqui são as
 * DUAS decisões de que o tamanho depende — a grelha começar em duas colunas e
 * cada botão trazer a classe `.alvo-toque` —, que é o que uma alteração
 * distraída apagaria. A medição verdadeira está na régua; isto é o alarme.
 */
describe("Grelha de fotos de um tema — ergonomia de toque", () => {
  it("começa em DUAS colunas e só chega a três quando há largura", () => {
    // Duas colunas a 375 px dão células de 150,5 px, que é o que permite três
    // alvos de 44 px sem eles se tocarem. As três colunas voltam a 26rem.
    expect(GRELHA_DE_FOTOS).toContain("grid-cols-2");
    expect(GRELHA_DE_FOTOS).toContain("min-[26rem]:grid-cols-3");
    // A três colunas SEM condição nenhuma é exactamente o defeito medido.
    expect(GRELHA_DE_FOTOS).not.toMatch(/(^|\s)grid-cols-3(\s|$)/);
  });

  it("dá 44 px de alvo aos três botões de cada foto", async () => {
    route("GET /api/temas", () => ok([{ ...THEME, imageCount: 3 }]));
    route("GET /api/temas/t1/imagens", () => ok({ ok: true, images: many(1, 3, true), total: 3 }));

    renderTemas();
    await openFolder(/Terracotta/);

    // A segunda foto, porque o "mover para o início" não existe na primeira.
    for (const nome of [
      /^Ver a foto 2 em grande$/,
      /^Remover foto 2 de 3$/,
      /^Mover a foto 2 para o início$/,
    ]) {
      const botao = screen.getByRole("button", { name: nome });
      expect(botao.className, `${nome} sem alvo de 44 px`).toContain("alvo-toque");
    }
  });
});
