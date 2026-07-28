// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ThemeImage, ThemeSummary } from "@/lib/theme-types";
import { THEME_PAGE_SIZE } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import Temas, { mergePage, moveItem, reinsertAt } from "./Temas";

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
    expect(photos()).toEqual([]);

    await release("POST /api/temas/t1/imagens");

    // Fica só a foto nova: a apagada não pode voltar.
    expect(photos()).toEqual([photo(2).url]);
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

    expect(photos()).toHaveLength(2);
    expect(photos()).toContain(photo(1).url);
    expect(photos()).toContain(photo(2).url);
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

    expect(await screen.findByText("Fotos indisponíveis")).toBeInTheDocument();
    expect(screen.getByText("500+ fotos")).toBeInTheDocument();
    expect(screen.getByText("1 foto")).toBeInTheDocument();
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
    expect(screen.queryByText(/Arraste para aqui/)).not.toBeInTheDocument();
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
