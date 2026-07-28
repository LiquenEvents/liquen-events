// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MAX_IMPORT_BATCH, type ThemeSummary } from "@/lib/theme-types";
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
 */

// ── Servidor de mentira ────────────────────────────────────────────────────
// Uma resposta por `MÉTODO /caminho`; o que não estiver registado rebenta o
// teste em vez de ir à rede.
type Res = { ok: boolean; status: number; json: () => Promise<unknown> };
const ok = (body: unknown): Res => ({ ok: true, status: 200, json: async () => body });
const bad = (status: number, body: unknown): Res => ({ ok: false, status, json: async () => body });

let routes: Map<string, () => Res>;

function route(key: string, handler: () => Res) {
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

/** Uma foto a mais do que o lote máximo, para se poder bater no teto. */
const TOTAL = MAX_IMPORT_BATCH + 1;
const IMAGES = Array.from({ length: TOTAL }, (_, i) => ({
  path: `t1/foto-${i + 1}.jpg`,
  url: `https://cdn.test/foto-${i + 1}.jpg`,
}));

const onClose = vi.fn();
const onPicked = vi.fn();

/** Abre o seletor e espera pela grelha de fotos. */
async function openPicker(multiple: boolean) {
  render(
    <ToastProvider>
      <ThemePicker quoteId="LQ-001" multiple={multiple} onClose={onClose} onPicked={onPicked} />
    </ToastProvider>,
  );
  await screen.findByRole("button", { name: `Foto 1 de ${TOTAL}` });
}

/** A célula da foto `n` (nome acessível estável; o estado vive no aria-pressed). */
function photo(n: number) {
  return screen.getByRole("button", { name: `Foto ${n} de ${TOTAL}` });
}

beforeEach(() => {
  onClose.mockReset();
  onPicked.mockReset();
  localStorage.clear();
  routes = new Map();
  route("GET /api/temas", () => ok([THEME]));
  route("GET /api/temas/t1/imagens", () => ok({ images: IMAGES }));
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const key = `${(init?.method ?? "GET").toUpperCase()} ${url.split("?")[0]}`;
      const handler = routes.get(key);
      if (!handler) return Promise.reject(new Error(`rota não simulada: ${key}`));
      return Promise.resolve(handler());
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
});
