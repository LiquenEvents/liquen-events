// @vitest-environment jsdom
import { useState, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MAX_IMPORT_BATCH, THEME_PAGE_SIZE, type ThemeSummary } from "@/lib/theme-types";
import { ToastProvider } from "./Toast";
import ThemePicker, { __resetThemePickerState } from "./ThemePicker";

/**
 * Rede de segurança do seletor da Biblioteca de Temas.
 *
 * O que se fixa aqui é o que a Catarina sente: o teto das 40 fotos tem de ser
 * visível ANTES do clique (antes, escolhia 60 e só o servidor dizia que não);
 * nas capas escolhe-se UMA foto (a segunda substitui a primeira, não se
 * acumula); e uma importação falhada não pode perder a seleção feita à mão.
 *
 * A partir do momento em que um tema pode ter milhares de fotos, fixa-se
 * também a ESCALA: abre-se uma página (não a pasta toda), a grelha mostra a
 * miniatura, os gestos em bloco param no teto em vez de o ultrapassarem em
 * silêncio, e reabrir o diálogo não custa pedido nenhum.
 *
 * E fixa-se o que mudou de sítio: a CÓPIA já não acontece dentro do diálogo.
 * O botão fecha-o no instante em que é premido e o lote continua a caminho —
 * por isso os testes de importação verificam três coisas que antes não
 * existiam: o diálogo desaparece já, o lote sobrevive ao diálogo desaparecer,
 * e disparar duas vezes não importa a dobrar.
 */

// ── Servidor de mentira ────────────────────────────────────────────────────
// Uma resposta por `MÉTODO /caminho`; o que não estiver registado rebenta o
// teste em vez de ir à rede. O URL completo chega ao handler para se poder
// honrar a paginação (`?offset=&limit=`), que é o que está em causa.
// `headers` faz parte da resposta e não estava aqui — o duplo mentia sobre a
// forma de uma `Response`. Quando a cache do seletor passou a ler o `ETag`
// para o pedido condicional seguinte, o `res.headers` era `undefined` e a
// biblioteca deixava de abrir: 26 testes vermelhos por uma propriedade que o
// duplo devia ter desde sempre.
type Res = {
  ok: boolean;
  status: number;
  headers: { get: (nome: string) => string | null };
  json: () => Promise<unknown>;
};
type Handler = (url: string, init?: RequestInit) => Res | Promise<Res>;
const semCabecalhos = { get: () => null };
const ok = (body: unknown): Res => ({
  ok: true,
  status: 200,
  headers: semCabecalhos,
  json: async () => body,
});
const bad = (status: number, body: unknown): Res => ({
  ok: false,
  status,
  headers: semCabecalhos,
  json: async () => body,
});

let routes: Map<string, Handler>;
/** Todos os URLs pedidos, pela ordem — é aqui que se vê o que foi assinado. */
let calls: string[];
/** Os corpos enviados à rota de importação, pela ordem. */
let imported: string[][];

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
function folder(n: number, withThumbs: (i: number) => boolean = () => true, tema = "t1"): Photo[] {
  return Array.from({ length: n }, (_, i) => ({
    path: `${tema}/foto-${i + 1}.jpg`,
    url: `https://cdn.test/${tema}-foto-${i + 1}.jpg`,
    ...(withThumbs(i) ? { thumbUrl: `https://cdn.test/${tema}-thumb-${i + 1}.jpg` } : {}),
  }));
}

/** Uma foto a mais do que o lote máximo, para se poder bater no teto. */
const TOTAL = MAX_IMPORT_BATCH + 1;

const onClose = vi.fn();
const onPicked = vi.fn();
const onReserve = vi.fn();
const onDropped = vi.fn();

/** Todos os marcadores reservados, pela ordem por que o estúdio os recebeu. */
function reservados(): { marcador: string; thumbUrl?: string; sourcePath: string }[] {
  return onReserve.mock.calls.flatMap((c) => c[0]);
}

/**
 * O seletor como o estúdio o monta: aberto enquanto for preciso, DESMONTADO
 * quando fecha. É o que torna verificável a promessa nova — o lote continua a
 * caminho mesmo sem diálogo nenhum na árvore.
 */
function Host({
  multiple,
  usedThemePaths,
  usadasNoutras,
  paginaEmConstrucao,
}: {
  multiple: boolean;
  usedThemePaths?: string[];
  usadasNoutras?: Record<string, string>;
  paginaEmConstrucao?: ComponentProps<typeof ThemePicker>["paginaEmConstrucao"];
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <ThemePicker
      quoteId="LQ-001"
      multiple={multiple}
      usedThemePaths={usedThemePaths}
      usadasNoutras={usadasNoutras}
      paginaEmConstrucao={paginaEmConstrucao}
      onClose={() => {
        onClose();
        setOpen(false);
      }}
      onPicked={onPicked}
      onReserve={onReserve}
      onDropped={onDropped}
    />
  );
}

/** Abre o seletor e espera pela grelha de fotos. */
async function openPicker(
  multiple: boolean,
  usedThemePaths?: string[],
  usadasNoutras?: Record<string, string>,
  paginaEmConstrucao?: ComponentProps<typeof ThemePicker>["paginaEmConstrucao"],
) {
  const montado = render(
    <ToastProvider>
      <Host
        multiple={multiple}
        usedThemePaths={usedThemePaths}
        usadasNoutras={usadasNoutras}
        paginaEmConstrucao={paginaEmConstrucao}
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
function photo(n: number, suffix = "", count = visible()) {
  return screen.getByRole("button", { name: `Foto ${n} de ${count}${suffix}` });
}

function cells() {
  return screen.getAllByRole("button", { name: /^Foto \d+ de \d+/ });
}

/** O botão que fecha o diálogo a adicionar (mostra sempre quantas vão). */
/**
 * O botão que escolhe tudo o que já desceu.
 *
 * Chamava-se «Selecionar todas as visíveis» e era ambíguo — palavras dela:
 * «seleciona as visíveis no ecrã ou todas as do tema?». O rótulo passa a dizer
 * o número e de onde ele vem, e muda com o estado; por isso aqui procura-se
 * pela FORMA e não pelo texto exacto.
 */
function escolherTodasAsMostradas() {
  return screen.getByRole("button", { name: /^Escolher as \d+ (deste tema|já mostradas)$/ });
}

function addAndClose(n: number) {
  // «Adicionar 4 fotos»: o que se confirma é uma quantidade, e vê-la no botão é
  // a última hipótese de dar por um engano antes de as fotos entrarem.
  return screen.getByRole("button", { name: `Adicionar ${n} ${n === 1 ? "foto" : "fotos"}` });
}
function addAndStay(n: number) {
  return screen.getByRole("button", { name: `Adicionar ${n} e escolher mais` });
}

function importCalls() {
  return calls.filter((u) => u.includes("/assets/importar"));
}

beforeEach(() => {
  onClose.mockReset();
  onPicked.mockReset();
  onReserve.mockReset();
  onDropped.mockReset();
  localStorage.clear();
  // A cache da biblioteca e os lotes em curso vivem no módulo: sem isto um
  // teste abria com as fotos do anterior.
  act(() => __resetThemePickerState());
  routes = new Map();
  calls = [];
  imported = [];
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
    imported.push(paths);
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
      // O `signal` é honrado de propósito. Um duplo que o ignora deixa passar
      // um "Parar" que na realidade não corta nada: a promessa resolve à mesma
      // e o teste conclui que a foto entrou. Aqui, abortar rejeita — como no
      // browser.
      const sinal = init?.signal;
      const resposta = Promise.resolve(handler(url, init));
      if (!sinal) return resposta;
      if (sinal.aborted) {
        return Promise.reject(new DOMException("Aborted", "AbortError"));
      }
      return new Promise((resolve, reject) => {
        sinal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        resposta.then(resolve, reject);
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  act(() => __resetThemePickerState());
  vi.unstubAllGlobals();
});

/**
 * O botão de adicionar.
 *
 * O rótulo passou a trazer a CONTAGEM ("Adicionar 5 fotos") — antes dizia
 * sempre "Adicionar à proposta" e, ao lado do "Cancelar", lia-se como
 * desactivado mesmo com fotos escolhidas. Os testes procuram os dois.
 */
describe("ThemePicker", () => {
  it("trava a seleção nas 40 fotos e explica o limite", async () => {
    await openPicker(true);

    // A meio do caminho o rodapé passa a contar para o teto.
    for (let n = 1; n <= MAX_IMPORT_BATCH / 2; n++) fireEvent.click(photo(n));
    expect(
      screen.getByText(`${MAX_IMPORT_BATCH / 2} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();

    // Tocar nas 41 → ficam 40; a 41.ª nem sequer entra.
    for (let n = MAX_IMPORT_BATCH / 2 + 1; n <= TOTAL; n++) fireEvent.click(photo(n));

    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(
      screen.getByText(`Podes adicionar até ${MAX_IMPORT_BATCH} fotos de cada vez.`),
    ).toBeInTheDocument();
    expect(photo(TOTAL)).toHaveAttribute("aria-pressed", "false");
    // As que sobram ficam anunciadas como indisponíveis (mas alcançáveis).
    expect(photo(TOTAL)).toHaveAttribute("aria-disabled", "true");
    expect(photo(1)).not.toHaveAttribute("aria-disabled");

    // Tirar uma abre lugar outra vez e o aviso desaparece.
    fireEvent.click(photo(1));
    expect(
      screen.queryByText(`Podes adicionar até ${MAX_IMPORT_BATCH} fotos de cada vez.`),
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
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
    // O botão diz sempre quantas vão — e só está desligado sem seleção.
    expect(addAndClose(1)).toBeEnabled();
  });

  // ── A importação otimista ────────────────────────────────────────────────

  it("adicionar fecha o diálogo JÁ e a cópia continua sem ele", async () => {
    photos = folder(6);
    // A rota fica presa até se abrir o portão: se alguma coisa no ecrã
    // dependesse da resposta, este teste apanhava-a.
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
    fireEvent.click(photo(2));
    fireEvent.click(photo(3));
    fireEvent.click(addAndClose(3));

    // Sem esperar por nada: o diálogo já não está cá.
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    // Não há barra de progresso NENHUMA a segurar o diálogo (um lote pequeno
    // nem sequer a mostra fora dele).
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    // O que se vê é uma pastilha discreta, na proposta, com as miniaturas que
    // já estavam em memória — zero pedidos novos para as ver.
    const chip = screen.getByRole("group", { name: "Fotos a caminho da proposta" });
    expect(chip).toHaveTextContent("A adicionar 3 fotos à proposta…");
    expect(chip.querySelector("img")).toHaveAttribute("src", "https://cdn.test/t1-thumb-1.jpg");
    expect(onPicked).not.toHaveBeenCalled();

    // A cópia sobreviveu ao diálogo: quando chega, entrega ao estúdio.
    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toHaveLength(3);
    // Cada cópia sabe de que foto da biblioteca veio — é o que permite dizer
    // "já nesta proposta" da próxima vez.
    expect(onPicked.mock.calls[0][0][0]).toMatchObject({
      path: "LQ-001/copia-foto-1.jpg",
      sourcePath: "t1/foto-1.jpg",
    });
    await waitFor(() => expect(chip).toHaveTextContent("3 fotos adicionadas à proposta."));
  });

  it("disparar duas vezes não importa a dobrar", async () => {
    photos = folder(10);
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
    fireEvent.click(photo(2));

    // Duplo clique no mesmo botão (o "continuar" mantém o diálogo de pé).
    const botao = addAndStay(2);
    fireEvent.click(botao);
    fireEvent.click(botao);
    expect(importCalls()).toHaveLength(1);

    // E as que já vão a caminho não voltam a ser escolhíveis: o toque é
    // ignorado em silêncio, e os gestos em bloco saltam-nas.
    expect(photo(1, " (a adicionar)")).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(photo(1, " (a adicionar)"));
    expect(photo(1, " (a adicionar)")).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(escolherTodasAsMostradas());
    expect(screen.getByText("8 fotos selecionadas")).toBeInTheDocument();
    fireEvent.click(addAndStay(8));

    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(2));
    // Duas viagens, oito caminhos cada uma no máximo, e nenhuma repetição.
    const enviados = imported.flat();
    expect(enviados).toHaveLength(10);
    expect(new Set(enviados).size).toBe(10);
    expect(imported[0]).toEqual(["t1/foto-1.jpg", "t1/foto-2.jpg"]);
  });

  it("uma falha avisa fora do diálogo e não perde a seleção", async () => {
    photos = folder(6);
    route("POST /api/orcamento/LQ-001/assets/importar", () =>
      bad(500, { error: "Não foi possível copiar as fotos." }),
    );
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(addAndClose(1));

    const chip = await screen.findByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("1 foto não entrou na proposta."));
    expect(chip).toHaveTextContent("Não foi possível copiar as fotos.");
    expect(screen.getByRole("button", { name: "Repetir" })).toBeInTheDocument();
    expect(onPicked).not.toHaveBeenCalled();

    // Reabrir traz a seleção de volta, marcada — não se escolhe tudo de novo.
    cleanup();
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );
    const falhada = await screen.findByRole("button", { name: "Foto 1 de 6 (não entrou)" });
    expect(falhada).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
  });

  // ── O lugar guardado no instante do clique ───────────────────────────────
  //
  // O estúdio precisa de pôr a foto no mood board JÁ, e a cópia demora. O que
  // sai daqui nesse instante é um MARCADOR por foto — `pending:<uuid>`, que
  // não é caminho de coisa nenhuma —, e é ele que volta dentro da cópia
  // confirmada para o estúdio saber que lugar trocar. Quem não pede reserva
  // continua a receber só o `onPicked` de antes, a acrescentar.

  it("reserva o lugar de cada foto no instante do clique e devolve-o com o caminho", async () => {
    photos = folder(3);
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
    fireEvent.click(photo(2));
    fireEvent.click(photo(3));
    fireEvent.click(addAndClose(3));

    // Sem esperar por nada: os três lugares já estão guardados, com a
    // miniatura que a grelha JÁ desenhou (nenhum pedido novo para a ver).
    expect(onReserve).toHaveBeenCalledTimes(1);
    const lugares = reservados();
    expect(lugares).toHaveLength(3);
    expect(lugares.map((r) => r.sourcePath)).toEqual([
      "t1/foto-1.jpg",
      "t1/foto-2.jpg",
      "t1/foto-3.jpg",
    ]);
    expect(lugares[0].thumbUrl).toBe("https://cdn.test/t1-thumb-1.jpg");
    // Marcadores, não caminhos — e todos diferentes.
    expect(lugares.every((r) => r.marcador.startsWith("pending:"))).toBe(true);
    expect(new Set(lugares.map((r) => r.marcador)).size).toBe(3);
    expect(onPicked).not.toHaveBeenCalled();

    // A cópia confirma e cada foto diz que lugar vem ocupar.
    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toEqual(
      lugares.map((r, i) =>
        expect.objectContaining({
          path: `LQ-001/copia-foto-${i + 1}.jpg`,
          sourcePath: r.sourcePath,
          marcador: r.marcador,
        }),
      ),
    );
    expect(onDropped).not.toHaveBeenCalled();
  });

  it("a foto que não entra devolve o lugar, e o Repetir guarda um lugar NOVO", async () => {
    photos = folder(4);
    flaky = new Set(["t1/foto-2.jpg"]);
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    fireEvent.click(addAndClose(2));

    const primeiros = reservados();
    expect(primeiros).toHaveLength(2);

    // A que falhou larga o lugar; a que entrou fica com o dela.
    await waitFor(() => expect(onDropped).toHaveBeenCalledTimes(1));
    expect(onDropped.mock.calls[0][0]).toEqual([primeiros[1].marcador]);
    expect(onPicked.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sourcePath: "t1/foto-1.jpg", marcador: primeiros[0].marcador }),
    ]);

    // À segunda vai — com um lugar NOVO, porque o anterior já saiu do documento.
    flaky.clear();
    fireEvent.click(await screen.findByRole("button", { name: "Repetir" }));
    await waitFor(() => expect(onReserve).toHaveBeenCalledTimes(2));
    const segundo = onReserve.mock.calls[1][0];
    expect(segundo).toEqual([expect.objectContaining({ sourcePath: "t1/foto-2.jpg" })]);
    expect(segundo[0].marcador).not.toBe(primeiros[1].marcador);
    await waitFor(() =>
      expect(onPicked.mock.calls.at(-1)?.[0]).toEqual([
        expect.objectContaining({ sourcePath: "t1/foto-2.jpg", marcador: segundo[0].marcador }),
      ]),
    );
  });

  it("o Parar devolve os lugares das fotos que ficaram por copiar", async () => {
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
    fireEvent.click(escolherTodasAsMostradas());
    fireEvent.click(addAndClose(20));
    const lugares = reservados();
    expect(lugares).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    release();

    // Parar corta TAMBÉM o lote que ia a caminho — senão, com um lote só (o
    // caso comum, 8 fotos ou menos), o botão não parava rigorosamente nada.
    // Portanto os 20 lugares saem todos: nenhum vai receber foto, e um
    // marcador que ninguém vai trocar não pode ficar no documento.
    await waitFor(() => expect(onDropped).toHaveBeenCalled());
    await waitFor(() => expect(onDropped.mock.calls.flatMap((c) => c[0])).toHaveLength(20));
    expect(onDropped.mock.calls.flatMap((c) => c[0]).sort()).toEqual(
      lugares.map((r) => r.marcador).sort(),
    );
    expect(onPicked).not.toHaveBeenCalled();
  });

  it("o Parar funciona com UM lote — o caso em que ele era decorativo", async () => {
    // A regressão que este teste fixa: a paragem era lida só ENTRE lotes. Com
    // 5 fotos há um lote só, portanto a verificação já tinha passado quando o
    // botão aparecia e carregar nele não fazia nada — decorativo exactamente
    // no caso mais comum. Só falha se o pedido em voo deixar de ser cortado.
    photos = folder(5);
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
    fireEvent.click(escolherTodasAsMostradas());
    fireEvent.click(addAndClose(5));
    expect(reservados()).toHaveLength(5);

    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    release();

    const chip = screen.getByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("Parou — 5 fotos ficaram por adicionar."));
    expect(onPicked).not.toHaveBeenCalled();
    await waitFor(() => expect(onDropped.mock.calls.flatMap((c) => c[0])).toHaveLength(5));
  });

  it("num lote grande a pastilha mostra progresso — e o Parar guarda o que já entrou", async () => {
    photos = folder(30);
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
    fireEvent.click(escolherTodasAsMostradas());
    fireEvent.click(addAndClose(30));

    // O diálogo saiu; a barra ficou na proposta, fora dele.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const bar = screen.getByRole("progressbar", { name: "Progresso da importação" });
    expect(bar).toHaveAttribute("aria-valuenow", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "30");

    // Parar corta o que falta E o que ia a caminho: nenhuma das 30 entra, e a
    // pastilha guarda-as todas para o "Repetir" — nada se perde, só não entrou.
    fireEvent.click(screen.getByRole("button", { name: "Parar" }));
    release();
    const chip = screen.getByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("Parou — 30 fotos ficaram por adicionar."));
    expect(onPicked).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Repetir" })).toBeInTheDocument();
  });

  it("depois de uma falha parcial o Repetir só volta a tentar o que falhou", async () => {
    photos = folder(20);
    flaky = new Set(["t1/foto-3.jpg"]);
    await openPicker(true);

    for (let n = 1; n <= 10; n++) fireEvent.click(photo(n));
    fireEvent.click(addAndClose(10));

    const chip = await screen.findByRole("group", { name: "Fotos a caminho da proposta" });
    await waitFor(() => expect(chip).toHaveTextContent("1 foto não entrou na proposta."));
    expect(onPicked.mock.calls.flatMap((c) => c[0])).toHaveLength(9);

    // À segunda vai: repete-se só a foto que ficou para trás.
    flaky.clear();
    onPicked.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Repetir" }));
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sourcePath: "t1/foto-3.jpg" }),
    ]);
    expect(imported[imported.length - 1]).toEqual(["t1/foto-3.jpg"]);
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

  it("reabrir na mesma sessão não pede nada e volta ao mesmo tema e ao mesmo sítio", async () => {
    photos = folder(150);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: /Mostrar mais/ }));
    await waitFor(() => expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2));
    const antes = calls.length;

    cleanup();
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );

    // Sem esperar: a grelha está desenhada, com as duas páginas que ela já
    // tinha mandado vir, e sem uma única viagem nova.
    expect(cells()).toHaveLength(THEME_PAGE_SIZE * 2);
    expect(calls).toHaveLength(antes);
  });

  it("o rato a passar pelo botão que abre a biblioteca já a manda vir", async () => {
    photos = folder(6);
    // O botão vive no estúdio de propostas, não aqui: o seletor apanha o gesto
    // por delegação (pelo nome, ou por `data-biblioteca-temas`).
    render(
      <button type="button" data-teste="abrir">
        Escolher da biblioteca de temas
      </button>,
    );
    fireEvent.pointerOver(screen.getByRole("button", { name: /biblioteca de temas/ }));

    await waitFor(() => expect(calls).toContain("/api/temas"));
    await waitFor(() =>
      expect(calls).toContain(`/api/temas/t1/imagens?offset=0&limit=${THEME_PAGE_SIZE}`),
    );
    const antes = calls.length;

    // Quando ela clica mesmo, o diálogo abre com as fotos e sem pedir nada.
    cleanup();
    render(
      <ToastProvider>
        <Host multiple />
      </ToastProvider>,
    );
    expect(cells()).toHaveLength(6);
    expect(calls).toHaveLength(antes);
  });

  it("mostra a miniatura e cai no original nas fotos que ainda não a têm", async () => {
    photos = folder(4, (i) => i === 0); // só a primeira tem miniatura
    await openPicker(true);

    // A miniatura aparece já; a que não tem uma espera pela vez na fila dos
    // originais (aqui há vagas de sobra, por isso é o tempo de uma renderização).
    expect(photo(1).querySelector("img")).toHaveAttribute("src", "https://cdn.test/t1-thumb-1.jpg");
    await waitFor(() =>
      expect(photo(2).querySelector("img")).toHaveAttribute(
        "src",
        "https://cdn.test/t1-foto-2.jpg",
      ),
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
    expect(imgs()[0].getAttribute("src")).toBe("https://cdn.test/t1-foto-1.jpg");

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

  it("a página seguinte chega antes de ela a pedir", async () => {
    photos = folder(150);
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

    fireEvent.click(escolherTodasAsMostradas());

    expect(
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
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
      screen.getByText(`${MAX_IMPORT_BATCH} de ${MAX_IMPORT_BATCH} fotos selecionadas`),
    ).toBeInTheDocument();
    expect(photo(MAX_IMPORT_BATCH)).toHaveAttribute("aria-pressed", "true");
    expect(photo(55)).toHaveAttribute("aria-pressed", "false");

    // E o Shift+clique ao contrário desmarca o intervalo todo.
    fireEvent.click(photo(1), { shiftKey: true });
    expect(screen.getByText("Escolhe pelo menos uma foto.")).toBeInTheDocument();
  });

  it("marca as fotos que já estão nesta proposta", async () => {
    await openPicker(true, ["t1/foto-2.jpg"]);

    expect(photo(2, " (já nesta proposta)")).toBeInTheDocument();
    expect(screen.getAllByText("Já nesta proposta")).toHaveLength(1);
    // Continua escolhível: a mesma foto pode ir para a capa e para um board.
    fireEvent.click(photo(2, " (já nesta proposta)"));
    expect(photo(2, " (já nesta proposta)")).toHaveAttribute("aria-pressed", "true");
  });

  it("a seleção sobrevive à troca de separador de tema", async () => {
    photos = folder(6);
    route("GET /api/temas", () =>
      ok([THEME, { ...THEME, id: "t2", name: "Itália", imageCount: 3 }]),
    );
    route("GET /api/temas/t2/imagens", () =>
      ok({ ok: true, images: folder(3, () => true, "t2"), total: 3, truncated: false }),
    );
    await openPicker(true);

    fireEvent.click(photo(1));
    fireEvent.click(photo(2));
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();

    // Muda de tema: a grelha é outra, a seleção é a mesma.
    fireEvent.click(screen.getByRole("button", { name: /Itália/ }));
    await screen.findByRole("button", { name: "Foto 1 de 3" });
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();
    expect(screen.getByText("2 são de outros temas.")).toBeInTheDocument();
    fireEvent.click(photo(1, "", 3));
    expect(screen.getByText("3 fotos selecionadas")).toBeInTheDocument();

    // E de volta: as duas primeiras continuam marcadas, sem pedido novo.
    const antes = calls.length;
    fireEvent.click(screen.getByRole("button", { name: /Terracotta/ }));
    await screen.findByRole("button", { name: "Foto 1 de 6" });
    expect(calls).toHaveLength(antes);
    expect(photo(1)).toHaveAttribute("aria-pressed", "true");
    expect(photo(2)).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("1 é de outro tema.")).toBeInTheDocument();

    // O lote leva as três, de ambos os temas.
    fireEvent.click(addAndClose(3));
    await waitFor(() => expect(imported.flat()).toHaveLength(3));
    expect(imported[0]).toContain("t2/foto-1.jpg");
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
    expect(preview.querySelector("img")).toHaveAttribute("src", "https://cdn.test/t1-foto-2.jpg");

    fireEvent.click(screen.getByRole("button", { name: "Escolher esta foto" }));
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("group", { name: /em grande/ })).not.toBeInTheDocument();
    // O Esc fechou a pré-visualização, NÃO o seletor.
    expect(onClose).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(photo(2));
  });
});

describe("fotos que já foram para outro casamento", () => {
  it("diz para onde foram, no nome e na marca", async () => {
    photos = folder(4);
    await openPicker(true, undefined, { "t1/foto-2.jpg": "Ana e Rui, 12 set 2026" });

    // No NOME acessível, porque a marca visual não chega a quem não vê a
    // grelha — e é aqui que a decisão de repetir se toma.
    expect(
      screen.getByRole("button", { name: /Foto 2 de 4 \(já usada em Ana e Rui, 12 set 2026\)/ }),
    ).toBeTruthy();
    expect(screen.getAllByTitle("Já usada em Ana e Rui, 12 set 2026").length).toBeGreaterThan(0);
  });

  it("não impede nada — a foto continua a poder ser escolhida", async () => {
    // Repetir pode ser a decisão certa: é a melhor que há daquele arco, e os
    // dois casamentos estão em pontas opostas do país.
    photos = folder(4);
    await openPicker(true, undefined, { "t1/foto-2.jpg": "Ana e Rui" });
    fireEvent.click(screen.getByRole("button", { name: /Foto 2 de 4/ }));
    expect(screen.getByRole("button", { name: /Foto 2 de 4/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("uma foto que já está NESTA proposta não leva as duas marcas", async () => {
    // As duas legendas caem no mesmo sítio e tapavam-se uma à outra; a que
    // interessa primeiro é a desta proposta.
    photos = folder(4);
    await openPicker(true, ["t1/foto-2.jpg"], { "t1/foto-2.jpg": "Ana e Rui" });
    expect(screen.getByRole("button", { name: /Foto 2 de 4 \(já nesta proposta\)/ })).toBeTruthy();
    expect(screen.queryByTitle("Já usada em Ana e Rui")).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * COM MUITOS TEMAS, A GRELHA DE FOTOS TEM DE CONTINUAR ALCANÇÁVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO no telemóvel dela, com 40 temas: a lista empilhava-se em seis linhas e
 * a grelha de fotografias — que é a razão de abrir este painel — ficava
 * espremida num terço, cortada a meio. Palavras dela: «está ao contrário do que
 * devia ser».
 *
 * Passaram-se por aqui duas soluções, e a segunda substituiu a primeira:
 *
 *  1. a lista fechava-se, com um botão «Temas (40)» e o estado guardado. Tirava
 *     a lista do caminho, mas ao preço de um toque para chegar aos temas — e de
 *     um painel que abria a esconder metade do que serve para escolher;
 *  2. os CHIPS: uma linha só, que rola de lado. A lista deixa de precisar de se
 *     fechar porque nunca chega a ocupar mais do que uma linha, e os temas
 *     estão sempre à mão. É o que está.
 *
 * No computador a fila volta a quebrar, com o tecto de altura de sempre: rolar
 * de lado com um rato é mau, e num ecrã largo vêem-se os quarenta de uma vez.
 *
 * O que se prende aqui é a decisão. A altura em pixéis é do browser e mede-se
 * no `geometria-dos-alvos.spec.ts`.
 */
describe("a lista de temas não engole o ecrã", () => {
  /** Quarenta temas, como os dela. */
  const muitos = Array.from({ length: 40 }, (_, i) => ({
    ...THEME,
    id: `t${i + 1}`,
    name: `Tema ${i + 1}`,
    imageCount: 10 + i,
  }));

  const lista = () => screen.getByRole("group", { name: "Temas" });

  async function comMuitos() {
    route("GET /api/temas", () => ok(muitos));
    return openPicker(true);
  }

  it("os temas estão numa linha que rola de lado, não empilhados", async () => {
    await comMuitos();
    const classes = lista().className;
    // Uma linha: sem `flex-wrap` no telemóvel, e a rolar na horizontal.
    expect(classes).toContain("overflow-x-auto");
    expect(classes, "com `flex-wrap` no telemóvel volta a empilhar").not.toMatch(/(^|\s)flex-wrap/);
  });

  it("e no computador voltam a quebrar, com tecto — rolar de lado com rato é mau", async () => {
    await comMuitos();
    const classes = lista().className;
    expect(classes).toContain("sm:flex-wrap");
    expect(classes).toMatch(/sm:max-h-\[\d+vh\]/);
    expect(classes).toContain("sm:overflow-y-auto");
  });

  it("os quarenta continuam todos lá — a fila não corta nenhum", async () => {
    await comMuitos();
    // Controlo positivo: um «ver mais» ou um `slice` fazia este número descer.
    expect(lista().querySelectorAll("button").length).toBe(muitos.length);
  });

  it("cada chip traz o nome E a contagem — são a mesma pergunta", async () => {
    await comMuitos();
    expect(screen.getByRole("button", { name: "Tema 2, 11 fotos" })).toBeInTheDocument();
  });

  it("o tema activo distingue-se dos outros", async () => {
    await comMuitos();
    const activos = [...lista().querySelectorAll('button[aria-pressed="true"]')];
    expect(activos).toHaveLength(1);
    expect(activos[0].textContent).toContain("Tema 1");
  });

  /** Abre a procura e escreve. A caixa vive atrás de uma lupa no telemóvel —
   *  ver «a procura vive atrás de uma lupa», mais abaixo. */
  async function procurar(texto: string) {
    const lupa = screen.queryByRole("button", { name: "Procurar tema" });
    if (lupa) fireEvent.click(lupa);
    fireEvent.change(screen.getByRole("textbox", { name: "Procurar tema" }), {
      target: { value: texto },
    });
  }

  it("a procura continua a filtrar a fila", async () => {
    await comMuitos();
    await procurar("Tema 3");
    // «Tema 3», «Tema 30»…«Tema 39» — onze.
    expect(lista().querySelectorAll("button").length).toBe(11);
  });

  it("e o vazio diz o que se procurou, com o caminho de volta", async () => {
    await comMuitos();
    await procurar("zzz");
    // Era «Nenhum tema com esse nome.» — uma legenda cinzenta sem saída.
    expect(screen.getByText("Nenhum tema com «zzz».")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver os 40 temas" }));
    expect(lista().querySelectorAll("button").length).toBe(40);
  });

  it("a grelha das fotos continua a desenhar-se, com os quarenta temas lá", async () => {
    await comMuitos();
    // A razão de tudo isto: chegar às fotos.
    expect(screen.getByRole("button", { name: `Foto 1 de ${visible()}` })).toBeInTheDocument();
  });

  it("ao abrir, o tema activo é posto à vista", async () => {
    // O jsdom não implementa `scrollIntoView`; o componente só o chama quando
    // existe, e sem este duplo não haveria nada para observar.
    const espia = vi.fn();
    (Element.prototype as unknown as { scrollIntoView: unknown }).scrollIntoView = espia;
    try {
      await comMuitos();
      expect(espia).toHaveBeenCalled();
      // E é o ACTIVO, não um qualquer: numa fila de quarenta chips o escolhido
      // pode estar a três écrans de distância, para o lado.
      expect((espia.mock.instances[0] as HTMLElement).getAttribute("aria-pressed")).toBe("true");
    } finally {
      delete (Element.prototype as unknown as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("as fotos abrem a DUAS colunas no telemóvel, e a cinco no computador", async () => {
    await comMuitos();
    const grelha = screen.getByRole("button", { name: /^Foto 1 de/ }).closest(".grid")!;
    // Três colunas a 390 px dão 111 px por foto — pequeno de mais para
    // escolher decoração.
    expect(grelha.className).toMatch(/(^|\s)grid-cols-2(\s|$)/);
    expect(grelha.className).toContain("sm:grid-cols-5");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE ESCOLHE, DITO PELO NÚMERO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Este painel serve para escolher fotos, e três das frases que o diziam não
 * diziam nada:
 *
 *  · «Selecionar todas as visíveis» — palavras dela: «está solto e é ambíguo:
 *    seleciona as visíveis no ecrã ou todas as do tema?». Nenhuma das duas:
 *    escolhe as que já foram CARREGADAS;
 *  · «Adicionar e fechar» — o que se confirma é uma quantidade, e ela não
 *    estava no botão;
 *  · e no telemóvel não havia dica nenhuma sobre as duas acções que uma célula
 *    tem, escolher e ver em grande.
 */
describe("o que se escolhe, dito pelo número", () => {
  it("o botão de escolher tudo diz quantas são e de onde vêm", async () => {
    photos = folder(8);
    await openPicker(true);
    // Sem mais nada por descer, são as do tema — e o número é exacto.
    expect(screen.getByRole("button", { name: "Escolher as 8 deste tema" })).toBeInTheDocument();
  });

  it("e diz outra coisa quando o tema ainda tem mais por descer", async () => {
    // Com paginação, «deste tema» seria mentira: o botão só alcança o que já
    // desceu.
    photos = folder(THEME_PAGE_SIZE + 10);
    await openPicker(true);
    expect(
      screen.getByRole("button", { name: `Escolher as ${THEME_PAGE_SIZE} já mostradas` }),
    ).toBeInTheDocument();
  });

  it("o botão de confirmar traz o número das fotos", async () => {
    photos = folder(6);
    await openPicker(true);
    // Sem nada escolhido não há número para dizer.
    expect(screen.getByRole("button", { name: "Adicionar fotos" })).toBeDisabled();
    fireEvent.click(photo(1));
    expect(screen.getByRole("button", { name: "Adicionar 1 foto" })).toBeEnabled();
    fireEvent.click(photo(2));
    expect(screen.getByRole("button", { name: "Adicionar 2 fotos" })).toBeEnabled();
  });

  it("e o contador diz «fotos», não só o número", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(photo(1));
    expect(screen.getByText("1 foto selecionada")).toBeInTheDocument();
    fireEvent.click(photo(2));
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();
  });

  it("o segundo botão diz que NÃO fecha", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(photo(1));
    // «e continuar» não dizia continuar o quê.
    expect(screen.getByRole("button", { name: "Adicionar 1 e escolher mais" })).toBeInTheDocument();
  });

  /**
   * ── UMA INSTRUÇÃO, E OS ATALHOS ATRÁS DO «?» ────────────────────────────
   *
   * Palavras dela: «há três textos de ajuda a competir; devia ser uma
   * instrução curta e os atalhos atrás de um "?"».
   *
   * Eram três: duas versões da mesma frase na barra (uma para o dedo, outra
   * para o rato, ambas sempre visíveis) e a do rodapé. Ficou a do rodapé.
   */
  it("a barra não repete a instrução do rodapé", async () => {
    photos = folder(6);
    await openPicker(true);
    expect(screen.queryByText(/Toca para escolher/)).toBeNull();
    expect(screen.queryByText(/Shift \+ clique escolhe/)).toBeNull();
  });

  it("os atalhos estão a um toque, e não sempre no ecrã", async () => {
    photos = folder(6);
    await openPicker(true);
    const ajuda = screen.getByRole("button", { name: /como escolher fotos/i });
    // Fechado: nada do que ele explica está no ecrã.
    expect(screen.queryByText(/escolhe tudo o que está pelo meio/i)).toBeNull();
    fireEvent.click(ajuda);
    expect(screen.getByText(/escolhe tudo o que está pelo meio/i)).toBeInTheDocument();
    expect(screen.getByText(/mostra-a em grande/i)).toBeInTheDocument();
  });

  /**
   * O painel está encostado à margem direita da barra: ancorado à esquerda,
   * as 18 rem dele saíam do diálogo e lia-se metade de cada linha.
   */
  it("o painel dos atalhos abre para dentro do diálogo", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: /como escolher fotos/i }));
    const painel = screen.getByRole("note");
    expect(painel.className).toContain("right-0");
    expect(painel.className).not.toContain("left-0");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS DETALHES QUE ROUBAVAM ESPAÇO OU LEGIBILIDADE
 * ═══════════════════════════════════════════════════════════════════════════
 */
describe("a procura vive atrás de uma lupa", () => {
  const muitos = Array.from({ length: 12 }, (_, i) => ({
    ...THEME,
    id: `t${i + 1}`,
    name: `Tema ${i + 1}`,
  }));

  it("por omissão não há caixa nenhuma a ocupar uma linha", async () => {
    route("GET /api/temas", () => ok(muitos));
    await openPicker(true);
    // 55 px que a grelha não tinha.
    expect(screen.queryByRole("textbox", { name: "Procurar tema" })).toBeNull();
    expect(screen.getByRole("button", { name: "Procurar tema" })).toBeInTheDocument();
  });

  it("a lupa abre a caixa, e fechá-la limpa o que estava escrito", async () => {
    route("GET /api/temas", () => ok(muitos));
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Procurar tema" }));
    const campo = screen.getByRole("textbox", { name: "Procurar tema" });
    fireEvent.change(campo, { target: { value: "Tema 1" } });

    fireEvent.click(screen.getByRole("button", { name: "Fechar a procura" }));
    // Um filtro activo por trás de uma caixa fechada é a razão escondida por
    // que a fila mostra dois temas em vez de doze.
    expect(screen.queryByRole("textbox", { name: "Procurar tema" })).toBeNull();
    const lista = screen.getByRole("group", { name: "Temas" });
    expect(lista.querySelectorAll("button").length).toBe(12);
  });

  it("com texto escrito, a caixa não se fecha sozinha", async () => {
    route("GET /api/temas", () => ok(muitos));
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Procurar tema" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Procurar tema" }), {
      target: { value: "Tema 4" },
    });
    // O botão passa a ser o de fechar — e a caixa continua lá, com o texto.
    expect((screen.getByRole("textbox", { name: "Procurar tema" }) as HTMLInputElement).value).toBe(
      "Tema 4",
    );
  });

  it("com três temas não há lupa nenhuma — não há o que filtrar", async () => {
    route("GET /api/temas", () => ok(muitos.slice(0, 3)));
    await openPicker(true);
    expect(screen.queryByRole("button", { name: "Procurar tema" })).toBeNull();
  });
});

describe("os chips lêem-se", () => {
  it("o tom é escrito, e não o 55% do botão fantasma", async () => {
    await openPicker(true);
    const chip = screen.getByRole("button", { name: /^Terracotta,/ });
    // 55% dá ~4,5:1 — em cima da linha da AA para letra pequena, e estes chips
    // são a navegação deste painel.
    expect(chip.className).toContain("text-foreground/75");
  });
});

describe("fechar sem ser pelo ×", () => {
  it("há uma pega para arrastar, e só no telemóvel", async () => {
    const { container } = await openPicker(true);
    const pega = container.querySelector(".cursor-grab");
    expect(pega, "a única saída era o × no canto mais longe do polegar").toBeTruthy();
    expect(pega!.className).toContain("sm:hidden");
    // `touch-none` para o browser não tratar o arrasto como rolagem.
    expect(pega!.className).toContain("touch-none");
  });

  it("arrastar para baixo o suficiente fecha o painel", async () => {
    const { container } = await openPicker(true);
    const pega = container.querySelector(".cursor-grab") as HTMLElement;
    // O jsdom não implementa a captura do ponteiro.
    pega.setPointerCapture = () => {};
    fireEvent.pointerDown(pega, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(pega, { clientY: 260, pointerId: 1 });
    fireEvent.pointerUp(pega, { pointerId: 1 });
    expect(onClose).toHaveBeenCalled();
  });

  it("e um arrasto curto devolve o painel ao sítio", async () => {
    const { container } = await openPicker(true);
    const pega = container.querySelector(".cursor-grab") as HTMLElement;
    pega.setPointerCapture = () => {};
    fireEvent.pointerDown(pega, { clientY: 100, pointerId: 1 });
    fireEvent.pointerMove(pega, { clientY: 130, pointerId: 1 });
    fireEvent.pointerUp(pega, { pointerId: 1 });
    // Trinta pixéis é um toque trémulo, não um gesto.
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: /biblioteca de temas/i })).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CURADORIA E A GRELHA SÃO A MESMA SELECÇÃO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «alternar entre grelha e curadoria a qualquer momento, sem
 * perder as escolhas». Não há duas listas a sincronizar — há uma, e é a do
 * painel. Este teste é o que garante que continua a ser assim.
 */
describe("uma de cada vez", () => {
  it("a porta só aparece quando a grelha já não cabe no ecrã", async () => {
    photos = folder(6);
    await openPicker(true);
    // Com seis, a grelha mostra-as todas e uma de cada vez seria mais lento.
    expect(screen.queryByRole("button", { name: "Uma de cada vez" })).toBeNull();
  });

  it("o que se escolhe na curadoria aparece escolhido na grelha", async () => {
    photos = folder(12);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Uma de cada vez" }));

    // A grelha sai do ecrã e fica uma foto só.
    expect(screen.queryByRole("button", { name: "Foto 1 de 12" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    expect(screen.getByText("2 fotos selecionadas")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ver em grelha" }));
    expect(photo(1)).toHaveAttribute("aria-pressed", "true");
    expect(photo(2)).toHaveAttribute("aria-pressed", "true");
    expect(photo(3)).toHaveAttribute("aria-pressed", "false");
  });

  it("e o que já estava escolhido na grelha sobrevive à ida e volta", async () => {
    photos = folder(12);
    await openPicker(true);
    fireEvent.click(photo(5));
    fireEvent.click(screen.getByRole("button", { name: "Uma de cada vez" }));
    fireEvent.click(screen.getByRole("button", { name: "Ver em grelha" }));
    expect(photo(5)).toHaveAttribute("aria-pressed", "true");
  });

  it("o rodapé continua a contar o mesmo, e o botão a dizer o número", async () => {
    photos = folder(12);
    await openPicker(true);
    fireEvent.click(screen.getByRole("button", { name: "Uma de cada vez" }));
    fireEvent.click(screen.getByRole("button", { name: /Incluir/ }));
    // O cabeçalho, a fila dos temas e o rodapé não saem do sítio: a curadoria
    // substitui a grelha e mais nada.
    expect(screen.getByRole("button", { name: "Adicionar 1 foto" })).toBeEnabled();
    expect(screen.getByRole("group", { name: "Temas" })).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE VIA MAL A 390 PX
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Três defeitos medidos no telemóvel dela, num Chromium a 390×844:
 *
 *  · a LUPA de cada foto levava `.alvo-toque`, que sob `(pointer: coarse)`
 *    força 44×44 — e numa célula de 111 px o disco preto tapava o canto
 *    superior esquerdo de todas as fotografias, encostado à margem na primeira
 *    coluna. Palavras dela: «cortados pela borda esquerda e sobrepostos às
 *    imagens». O alvo estava certo; o que não podia crescer era o desenho;
 *
 *  · o RODAPÉ dizia «Toca» — uma palavra, cortada a meio de «Toca nas fotos
 *    que queres usar.». A linha era `justify-between` com o texto à esquerda e
 *    três botões à direita, que não quebram;
 *
 *  · o FUNDO era `bg-black/35` e mais nada: o título «Fazer proposta» lia-se
 *    por trás do sheet, nítido e cortado ao meio pela aresta.
 *
 * O jsdom não mede pixéis. O que se prende aqui é a decisão em cada um — que é
 * o que um refactor apaga sem dar por isso; a medida é do browser e está no
 * `geometria-dos-alvos.spec.ts`.
 */
describe("o painel a 390 px", () => {
  it("a lupa cresce em ÁREA e não em desenho", async () => {
    await openPicker(true);
    const lupa = screen.getByRole("button", { name: "Ver a foto 1 em grande" });
    // `.alvo-invisivel` estende a área tocável com um `::after`; o
    // `.alvo-toque` esticava o próprio botão.
    expect(lupa.className).toContain("alvo-invisivel");
    expect(
      lupa.className,
      "o `.alvo-toque` força 44×44 no próprio disco — é o defeito",
    ).not.toContain("alvo-toque");
    // E o desenho continua nos 24 px.
    expect(lupa.className).toMatch(/\bh-6\b/);
    expect(lupa.className).toMatch(/\bw-6\b/);
  });

  it("o rodapé quebra em vez de espremer a contagem", async () => {
    await openPicker(true);
    const contagem = screen.getByText("Escolhe pelo menos uma foto.");
    const linha = contagem.closest("div")?.parentElement;
    expect(linha?.className, "sem `flex-wrap` os botões comem o texto").toContain("flex-wrap");
    // O texto ocupa a linha toda no telemóvel e volta ao lado dos botões
    // quando há espaço.
    expect(contagem.closest("div")?.className).toContain("basis-full");
  });

  it("e a frase inteira está lá — não uma palavra cortada", async () => {
    await openPicker(true);
    // O controlo positivo do de cima: a frase que era cortada. Hoje é outra
    // — «Escolhe pelo menos uma foto.» —, e o que se prende é o mesmo: que
    // cabe inteira.
    expect(screen.getByText("Escolhe pelo menos uma foto.")).toBeInTheDocument();
  });

  /**
   * ── O BOTÃO DESLIGADO PASSA A DIZER PORQUÊ ────────────────────────────
   *
   * Palavras dela: «o botão de adicionar aparece desativado sem dizer porquê».
   * A razão já estava escrita ao lado; o que faltava era estar LIGADA ao
   * botão, para quem ouve o ecrã em vez de o ver.
   */
  it("os botões de adicionar apontam para a razão de estarem desligados", async () => {
    photos = folder(6);
    await openPicker(true);
    const razao = screen.getByText("Escolhe pelo menos uma foto.");
    expect(razao.id).toBeTruthy();
    // Os dois: o «e escolher mais» e o de confirmar. Ambos estão desligados
    // pela mesma razão, e ambos têm de a apontar.
    const botoes = screen.getAllByRole("button", { name: /^Adicionar/ });
    expect(botoes).toHaveLength(2);
    for (const b of botoes) {
      expect(b).toBeDisabled();
      expect(b.getAttribute("aria-describedby")).toBe(razao.id);
    }
  });

  it("e deixam de apontar assim que há uma foto escolhida", async () => {
    photos = folder(6);
    await openPicker(true);
    fireEvent.click(photo(1));
    for (const b of screen.getAllByRole("button", { name: /^Adicionar/ })) {
      expect(b).not.toBeDisabled();
      expect(b.getAttribute("aria-describedby")).toBeNull();
    }
  });

  it("o fundo separa o painel da página, em vez de a deixar ler", async () => {
    await openPicker(true);
    const dialogo = screen.getByRole("dialog", { name: /biblioteca de temas/i });
    const fundo = dialogo.parentElement!;
    expect(fundo.className, "`black/35` deixava o cabeçalho legível por trás").toContain(
      "bg-black/50",
    );
    expect(fundo.className).toContain("backdrop-blur");
  });

  it("e o rodapé não fica debaixo da barra de gestos do iPhone", async () => {
    await openPicker(true);
    const contagem = screen.getByText("Escolhe pelo menos uma foto.");
    const linha = contagem.closest("div")?.parentElement as HTMLElement;
    expect(linha.style.paddingBottom).toContain("safe-area-inset-bottom");
  });

  /**
   * ═════════════════════════════════════════════════════════════════════════
   * A PÁGINA A GANHAR FORMA
   * ═════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela: «deixa de se escolher às cegas e passa a compor-se». O que
   * se prende aqui não é o desenho do canto (isso é do próprio componente) mas
   * a LIGAÇÃO: o que já lá está vem do estúdio, o que vai entrar vem da
   * seleção, e as duas contas somam.
   */
  it("o canto soma o que a página já tem com o que está escolhido", async () => {
    await openPicker(true, undefined, undefined, {
      titulo: "Jardim ao entardecer",
      fotos: [{ path: "b/uma.jpg" }, { path: "b/outra.jpg" }],
      maximo: 10,
    });
    expect(screen.getByText("Jardim ao entardecer")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: `Foto 1 de ${visible()}` }));
    expect(screen.getByText("3"), "a escolhida conta antes de entrar").toBeInTheDocument();
  });

  it("e avisa quando a escolha passa do que a página imprime", async () => {
    await openPicker(true, undefined, undefined, {
      fotos: [{ path: "b/uma.jpg" }, { path: "b/outra.jpg" }],
      maximo: 2,
    });
    expect(screen.queryByText(/não entra/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: `Foto 1 de ${visible()}` }));
    expect(screen.getByText("1 não entra na página")).toBeInTheDocument();
  });

  it("sem página nenhuma para compor, o canto não existe", async () => {
    // É o caso das capas: uma foto por espaço, nenhum conjunto a compor.
    await openPicker(false);
    expect(screen.queryByLabelText("A página em construção")).toBeNull();
  });

  /** Flutuar e não empurrar: o canto não pode roubar altura às fotografias. */
  it("o canto flutua por cima da grelha", async () => {
    await openPicker(true, undefined, undefined, { fotos: [{ path: "b/uma.jpg" }], maximo: 10 });
    const canto = screen.getByLabelText("A página em construção");
    expect(canto.className).toContain("absolute");
    expect(canto.parentElement?.className, "sem `relative` o canto sai do painel").toContain(
      "relative",
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OS TEMAS AO LADO, E NÃO EM CIMA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «sete linhas de temas ocupam mais de metade da altura do
 * modal. As fotos ficam num terço no fundo, com uma linha e meia visível».
 *
 * Ao alto, os temas comem ALTURA à grelha, e a conta é implacável: 25 temas
 * embrulhados em chips fazem sete filas. Ao lado, comem LARGURA — e largura é o
 * que um seletor de fotos tem de sobra, altura é o que não tem.
 *
 * O jsdom não faz layout: não há aqui píxeis para medir. O que se prende é a
 * DECISÃO, para que ninguém a desfaça sem dar por isso — a mesma escolha do
 * `Overview.movel.test`, que afirma sobre classes pela mesma razão.
 */
describe("o seletor a partir de 1024 px", () => {
  it("a lista de temas vira uma coluna com scroll próprio", async () => {
    await openPicker(true);
    const lista = screen.getByRole("group", { name: "Temas" });
    // Coluna, sem tecto de altura, e a ocupar o que sobra da lateral.
    expect(lista.className).toContain("lg:flex-col");
    expect(lista.className).toContain("lg:max-h-none");
    expect(lista.className).toContain("lg:flex-1");
    // E abaixo disso continua a ser a fila que rola de lado, que é a resposta
    // certa para um ecrã estreito.
    expect(lista.className).toContain("overflow-x-auto");
    expect(lista.className).toContain("snap-x");
  });

  it("o painel abre mais largo, para a coluna não roubar à grelha", async () => {
    await openPicker(true);
    const painel = screen.getByRole("dialog");
    expect(painel.className).toContain("lg:max-w-[70rem]");
    // Abaixo de `lg` fica como estava.
    expect(painel.className).toContain("max-w-3xl");
  });

  it("e cada tema ocupa a linha toda, encostado à esquerda", async () => {
    await openPicker(true);
    const primeiro = screen.getByRole("group", { name: "Temas" }).querySelector("button")!;
    // Centrado, um nome curto ao lado de um comprido lê-se como duas listas.
    expect(primeiro.className).toContain("lg:w-full");
    expect(primeiro.className).toContain("lg:!justify-start");
  });
});
