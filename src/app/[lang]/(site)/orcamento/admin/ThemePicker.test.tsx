// @vitest-environment jsdom
import { useState } from "react";
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
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
type Handler = (url: string, init?: RequestInit) => Res | Promise<Res>;
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });
const bad = (status: number, body: unknown): Res => ({ ok: false, status, json: async () => body });

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
function reservados(): { token: string; thumbUrl?: string; sourcePath: string }[] {
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
}: {
  multiple: boolean;
  usedThemePaths?: string[];
  usadasNoutras?: Record<string, string>;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <ThemePicker
      quoteId="LQ-001"
      multiple={multiple}
      usedThemePaths={usedThemePaths}
      usadasNoutras={usadasNoutras}
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
) {
  const montado = render(
    <ToastProvider>
      <Host multiple={multiple} usedThemePaths={usedThemePaths} usadasNoutras={usadasNoutras} />
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
function addAndClose(n: number) {
  return screen.getByRole("button", { name: `Adicionar ${n} e fechar` });
}
function addAndStay(n: number) {
  return screen.getByRole("button", { name: `Adicionar ${n} e continuar` });
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
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas as visíveis" }));
    expect(screen.getByText("8 selecionadas")).toBeInTheDocument();
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
    expect(screen.getByText("1 selecionada")).toBeInTheDocument();
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
    expect(lugares.every((r) => r.token.startsWith("pending:"))).toBe(true);
    expect(new Set(lugares.map((r) => r.token)).size).toBe(3);
    expect(onPicked).not.toHaveBeenCalled();

    // A cópia confirma e cada foto diz que lugar vem ocupar.
    release();
    await waitFor(() => expect(onPicked).toHaveBeenCalledTimes(1));
    expect(onPicked.mock.calls[0][0]).toEqual(
      lugares.map((r, i) =>
        expect.objectContaining({
          path: `LQ-001/copia-foto-${i + 1}.jpg`,
          sourcePath: r.sourcePath,
          token: r.token,
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
    expect(onDropped.mock.calls[0][0]).toEqual([primeiros[1].token]);
    expect(onPicked.mock.calls[0][0]).toEqual([
      expect.objectContaining({ sourcePath: "t1/foto-1.jpg", token: primeiros[0].token }),
    ]);

    // À segunda vai — com um lugar NOVO, porque o anterior já saiu do documento.
    flaky.clear();
    fireEvent.click(await screen.findByRole("button", { name: "Repetir" }));
    await waitFor(() => expect(onReserve).toHaveBeenCalledTimes(2));
    const segundo = onReserve.mock.calls[1][0];
    expect(segundo).toEqual([expect.objectContaining({ sourcePath: "t1/foto-2.jpg" })]);
    expect(segundo[0].token).not.toBe(primeiros[1].token);
    await waitFor(() =>
      expect(onPicked.mock.calls.at(-1)?.[0]).toEqual([
        expect.objectContaining({ sourcePath: "t1/foto-2.jpg", token: segundo[0].token }),
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
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas as visíveis" }));
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
      lugares.map((r) => r.token).sort(),
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
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas as visíveis" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Selecionar todas as visíveis" }));
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
    expect(screen.getByText("2 selecionadas")).toBeInTheDocument();

    // Muda de tema: a grelha é outra, a seleção é a mesma.
    fireEvent.click(screen.getByRole("button", { name: /Itália/ }));
    await screen.findByRole("button", { name: "Foto 1 de 3" });
    expect(screen.getByText("2 selecionadas")).toBeInTheDocument();
    expect(screen.getByText("2 são de outros temas.")).toBeInTheDocument();
    fireEvent.click(photo(1, "", 3));
    expect(screen.getByText("3 selecionadas")).toBeInTheDocument();

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
    expect(screen.getByText("1 selecionada")).toBeInTheDocument();

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
