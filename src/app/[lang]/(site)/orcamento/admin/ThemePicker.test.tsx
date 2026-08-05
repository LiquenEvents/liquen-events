// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_IMPORT_BATCH, THEME_PAGE_SIZE, type ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import ThemePicker from "./ThemePicker";
import { esquecerBiblioteca } from "./theme-picker-cache";

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
  const montado = render(
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
  // Devolvido para os testes que precisam de FECHAR e reabrir — é aí que se vê
  // se a cache entre aberturas funciona.
  return montado;
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
  // A cache do seletor vive no MÓDULO, de propósito — é o que a faz
  // sobreviver ao diálogo fechar. Sem a limpar aqui, cada teste herdava as
  // fotos do anterior e a rede nem chegava a ser chamada.
  esquecerBiblioteca();
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

/**
 * O botão de adicionar.
 *
 * O rótulo passou a trazer a CONTAGEM ("Adicionar 5 fotos") — antes dizia
 * sempre "Adicionar à proposta" e, ao lado do "Cancelar", lia-se como
 * desactivado mesmo com fotos escolhidas. Os testes procuram os dois.
 */
const botaoAdicionar = () =>
  screen.getByRole("button", { name: /^Adicionar (à proposta|\d+ fotos?)$/ });

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
    // 41 cliques numa grelha de 41 células = 41 renderizações completas do
    // diálogo. Não é lento por acidente, é o que este teste faz — e os 5 s por
    // omissão não chegam num runner de CI partilhado.
  }, 20_000);

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
    fireEvent.click(botaoAdicionar());

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

    // A miniatura aparece já; a que não tem uma espera pela vez na fila dos
    // originais (aqui há vagas de sobra, por isso é o tempo de uma renderização).
    expect(photo(1).querySelector("img")).toHaveAttribute("src", "https://cdn.test/thumb-1.jpg");
    await waitFor(() =>
      expect(photo(2).querySelector("img")).toHaveAttribute("src", "https://cdn.test/foto-2.jpg"),
    );
  });

  it("as fotos sem miniatura entram numa fila — a que está à vista não espera pelas outras", async () => {
    // O caso da biblioteca antiga: 60 fotos, cada uma com o seu original de
    // ~2,6 MB. Medido em Chromium a 50 Mbit/s: com os 60 downloads ao mesmo
    // tempo (o que o browser faz por omissão), a PRIMEIRA foto só aparece aos
    // 26 s. Três de cada vez, pela ordem da grelha, põe-na lá em ~1,4 s.
    photos = folder(THEME_PAGE_SIZE, () => false);
    await openPicker(true);

    const imgs = () => cells().map((c) => c.querySelector("img") as HTMLImageElement);
    const started = () => imgs().filter((i) => i.getAttribute("src")).length;

    expect(cells()).toHaveLength(THEME_PAGE_SIZE);
    await waitFor(() => expect(started()).toBe(3));
    expect(imgs()[0].getAttribute("src")).toBe("https://cdn.test/foto-1.jpg");

    // Cada uma que acaba liberta a vez seguinte.
    fireEvent.load(imgs()[0]);
    await waitFor(() => expect(started()).toBe(4));
  });

  it("com miniatura não há fila: 25 KB não precisam de vez", async () => {
    photos = folder(THEME_PAGE_SIZE);
    await openPicker(true);

    const imgs = () => cells().map((c) => c.querySelector("img") as HTMLImageElement);
    await waitFor(() =>
      expect(imgs().filter((i) => i.getAttribute("src"))).toHaveLength(THEME_PAGE_SIZE),
    );
    // A primeira dobra não espera pelo `lazy`; o resto do rolo espera.
    expect(imgs()[0]).toHaveAttribute("loading", "eager");
    expect(imgs()[0]).toHaveAttribute("fetchpriority", "high");
    expect(imgs()[THEME_PAGE_SIZE - 1]).toHaveAttribute("loading", "lazy");
  });

  /**
   * MUDAR DE TEMA NÃO PODE APAGAR O QUE JÁ FOI ESCOLHIDO.
   *
   * Antes apagava — o que obrigava a uma importação por tema e tornava
   * impossível montar um mood board com fotos de dois sítios sem repetir o
   * percurso todo. A seleção é um conjunto de CAMINHOS, por isso guardá-la
   * entre temas não custa nada.
   */
  it("a seleção sobrevive à troca de tema", async () => {
    route("GET /api/temas", () =>
      ok([THEME, { ...THEME, id: "t2", name: "Itália", imageCount: 2 }]),
    );
    route("GET /api/temas/t2/imagens", () =>
      ok({ ok: true, images: folder(2), total: 2, truncated: false }),
    );
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    expect(screen.getByText("2 selecionadas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Itália/ }));
    await waitFor(() => expect(cells()).toHaveLength(2));

    // As duas do primeiro tema continuam contadas, e o botão diz quantas vão.
    expect(screen.getByText("2 selecionadas")).toBeInTheDocument();
    expect(botaoAdicionar()).toHaveAccessibleName("Adicionar 2 fotos");
  });

  it("a página seguinte chega antes de ela a pedir, e mudar de tema deita-a fora", async () => {
    photos = folder(150);
    route("GET /api/temas", () =>
      ok([THEME, { ...THEME, id: "t2", name: "Itália", imageCount: 2 }]),
    );
    route("GET /api/temas/t2/imagens", () =>
      ok({ ok: true, images: folder(2), total: 2, truncated: false }),
    );
    await openPicker(true);

    const pageCalls = () => calls.filter((c) => c.includes("/api/temas/t1/imagens")).length;
    expect(pageCalls()).toBe(1);

    // Passado o tempo de espera, a página seguinte já foi buscada — uma só.
    await waitFor(() => expect(pageCalls()).toBe(2), { timeout: 4000 });
    expect(calls[calls.length - 1]).toContain(`offset=${THEME_PAGE_SIZE}`);

    // O "Mostrar mais" não faz pedido nenhum: as fotos já cá estão.
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    await waitFor(() => expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2));
    expect(pageCalls()).toBe(2);
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
    fireEvent.click(botaoAdicionar());

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

  it("reabrir na mesma sessão não gasta um único pedido", async () => {
    // O seletor abre-se uma vez por mood board. Antes, cada abertura repetia
    // os dois pedidos do zero — incluindo a lista de temas, que não muda de um
    // minuto para o outro.
    const { unmount } = await openPicker(true);
    const naPrimeira = calls.length;
    expect(naPrimeira).toBeGreaterThan(0);

    unmount();
    await openPicker(true);

    expect(
      calls.length,
      `A reabertura gastou ${calls.length - naPrimeira} pedido(s): ` +
        calls.slice(naPrimeira).join(", "),
    ).toBe(naPrimeira);
    // E não é um ecrã vazio: as fotos estão lá, sem terem sido pedidas.
    expect(photo(1)).toBeInTheDocument();
  });

  it("mexer na Biblioteca faz a abertura seguinte ir buscar de novo", async () => {
    // A contrapartida de guardar: o que ela acabou de carregar TEM de
    // aparecer. `esquecerBiblioteca` é o que o ecrã da Biblioteca chama à
    // saída, e é isto que prova que funciona.
    const { unmount } = await openPicker(true);
    const naPrimeira = calls.length;
    unmount();

    esquecerBiblioteca();
    await openPicker(true);

    expect(calls.length, "a abertura seguinte reaproveitou dados velhos").toBeGreaterThan(
      naPrimeira,
    );
  });

  it("com UMA foto não mostra barra de progresso — 0% parecia avariado", async () => {
    // A queixa concreta: "A adicionar 0 de 1 foto… 0%". A barra conta LOTES,
    // e com 8 fotos ou menos há um lote só — logo tinha exactamente dois
    // estados, 0% e acabou. Está tecnicamente certo e lê-se como encravado.
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
    fireEvent.click(photo(1));
    fireEvent.click(botaoAdicionar());

    // Continua a dizer que está a acontecer — o "Parar" só aparece a importar.
    expect(await screen.findByRole("button", { name: "Parar" })).toBeInTheDocument();
    // Mas sem inventar uma medida que não existe.
    expect(
      screen.queryByRole("progressbar", { name: "Progresso da importação" }),
      "com um lote só, a barra não tem nada para mostrar",
    ).not.toBeInTheDocument();

    release();
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("o 'Parar' corta mesmo o pedido em voo, e não é tratado como avaria", async () => {
    // Antes, o pedido de paragem só era lido ENTRE lotes: com um lote só, a
    // verificação já tinha passado e carregar no botão não fazia nada.
    photos = folder(20);
    let abortado = false;
    route(
      "POST /api/orcamento/LQ-001/assets/importar",
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            abortado = true;
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    await openPicker(true);
    fireEvent.click(photo(1));
    fireEvent.click(botaoAdicionar());

    fireEvent.click(await screen.findByRole("button", { name: "Parar" }));

    await waitFor(() => expect(abortado, "o pedido em voo não foi cortado").toBe(true));
    // Uma paragem pedida por ela não é um erro: o diálogo fica aberto e a foto
    // volta para a selecção, para se poder tentar outra vez sem a reescolher.
    await waitFor(() =>
      expect(screen.getByText("1 foto não entrou na proposta.")).toBeInTheDocument(),
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it("depois de uma falha parcial só volta a tentar o que falhou", async () => {
    photos = folder(20);
    flaky = new Set(["t1/foto-3.jpg"]);
    await openPicker(true);

    for (let n = 1; n <= 10; n++) fireEvent.click(photo(n));
    fireEvent.click(botaoAdicionar());

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
