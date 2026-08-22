// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ThemeSummary } from "@/lib/theme-types";
import FundirTemas, { type ThemeMergeOutcome } from "./FundirTemas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * JUNTAR DOIS TEMAS — o ciclo do lado do ecrã
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A rota leva UM lote de cada vez e diz por onde continuar; o ciclo vive aqui.
 * É este ficheiro que garante que ele:
 *
 *  · continua até a rota dizer «acabou», e não uma vez só;
 *  · leva o `nextOffset` da resposta anterior — sem isso, um tema com uma foto
 *    repetida à cabeça ficava a tentá-la para sempre;
 *  · pára a meio sem perder a conta do que já passou;
 *  · não oferece como destino nada que a rota vá recusar.
 */

const g = globalThis as unknown as { fetch: ReturnType<typeof vi.fn> };

const tema = (id: string, name: string, extra: Partial<ThemeSummary> = {}): ThemeSummary => ({
  id,
  name,
  imageCount: 3,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  ...extra,
});

/** Uma resposta da rota, com os valores neutros já postos. */
const lote = (over: Record<string, unknown> = {}) => ({
  ok: true,
  moved: 0,
  existing: 0,
  failed: 0,
  thumbsMissing: 0,
  nextOffset: 0,
  done: true,
  leftBehind: 0,
  archived: false,
  ...over,
});

function responder(...respostas: Record<string, unknown>[]) {
  let i = 0;
  g.fetch = vi.fn(async () => {
    const corpo = respostas[Math.min(i, respostas.length - 1)];
    i += 1;
    return { ok: true, json: async () => corpo } as Response;
  });
}

/** Os corpos JSON com que a rota foi chamada, pela ordem. */
function corpos(): Record<string, unknown>[] {
  return g.fetch.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
}

const origem = tema("t-1", "Italia");
const outros = [origem, tema("t-2", "Itália", { imageCount: 40 })];

function desenhar(themes = outros, onDone = vi.fn()) {
  render(<FundirTemas sourceTheme={origem} themes={themes} onClose={vi.fn()} onDone={onDone} />);
  return onDone;
}

/** Escolhe o destino e carrega em juntar. */
function juntar(nome = "Itália") {
  fireEvent.click(screen.getByRole("radio", { name: new RegExp(nome) }));
  fireEvent.click(screen.getByRole("button", { name: "Juntar os temas" }));
}

beforeEach(() => {
  responder(lote());
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("para onde se pode juntar", () => {
  it("o próprio tema não está na lista", () => {
    desenhar();
    expect(screen.queryByRole("radio", { name: /Italia\b/ })).toBeNull();
    expect(screen.getByRole("radio", { name: /Itália/ })).toBeTruthy();
  });

  /** Juntar para dentro de uma gaveta fechada é esconder o que se juntou. */
  it("um tema arquivado não é destino", () => {
    desenhar([origem, tema("t-3", "Antigo", { arquivado: true })]);
    expect(screen.queryByRole("radio", { name: /Antigo/ })).toBeNull();
    expect(screen.getByText(/Não há outro tema/)).toBeTruthy();
  });

  /** Um tema de filtro não tem pasta: as fotos dele são de outros temas. */
  it("um tema de filtro não é destino", () => {
    desenhar([origem, tema("t-4", "Verdes", { kind: "filtro" })]);
    expect(screen.queryByRole("radio", { name: /Verdes/ })).toBeNull();
  });

  it("sem destino escolhido, não dá para carregar", () => {
    desenhar();
    expect(screen.getByRole("button", { name: "Juntar os temas" })).toBeDisabled();
  });
});

describe("a consequência está escrita antes de se carregar", () => {
  it("diz que nada é apagado e que a origem fica arquivada", () => {
    desenhar();
    const aviso = screen.getByText(/Nenhuma fotografia é apagada/);
    expect(aviso.textContent).toMatch(/fica arquivado/);
    expect(aviso.textContent).toMatch(/propostas já feitas não são afetadas/);
  });
});

describe("o ciclo", () => {
  it("um lote que diz «acabou» é uma chamada só", async () => {
    const onDone = desenhar(outros, vi.fn());
    responder(lote({ moved: 3, done: true, archived: true }));
    juntar();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(g.fetch).toHaveBeenCalledTimes(1);
    const r = onDone.mock.calls[0][0] as ThemeMergeOutcome;
    expect(r.moved).toBe(3);
    expect(r.archived).toBe(true);
    expect(r.destName).toBe("Itália");
  });

  it("continua enquanto houver fotos, e soma tudo", async () => {
    const onDone = desenhar(outros, vi.fn());
    responder(
      lote({ moved: 40, done: false }),
      lote({ moved: 40, done: false }),
      lote({ moved: 7, done: true, archived: true }),
    );
    juntar();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(g.fetch).toHaveBeenCalledTimes(3);
    expect((onDone.mock.calls[0][0] as ThemeMergeOutcome).moved).toBe(87);
  });

  /**
   * O DESLOCAMENTO É O QUE FAZ ISTO ACABAR.
   *
   * Uma foto que já está no destino fica na origem. Sem levar o `nextOffset`
   * da resposta anterior, a chamada seguinte listava do princípio, voltava a
   * apanhá-la e ficava presa nela.
   */
  it("leva o deslocamento que a resposta anterior deu", async () => {
    const onDone = desenhar(outros, vi.fn());
    responder(
      lote({ moved: 38, existing: 2, nextOffset: 2, done: false }),
      lote({ moved: 5, done: true, leftBehind: 2 }),
    );
    juntar();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(corpos().map((b) => b.offset)).toEqual([0, 2]);
    const r = onDone.mock.calls[0][0] as ThemeMergeOutcome;
    expect(r.existing).toBe(2);
    expect(r.leftBehind).toBe(2);
    expect(r.archived).toBe(false);
  });

  it("manda sempre o destino escolhido", async () => {
    const onDone = desenhar(outros, vi.fn());
    juntar();
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(corpos()[0].destino).toBe("t-2");
  });
});

describe("quando corre mal", () => {
  it("uma recusa fica no ecrã com a razão, e não fecha", async () => {
    const onDone = vi.fn();
    desenhar(outros, onDone);
    g.fetch = vi.fn(async () => ({
      ok: false,
      json: async () => ({ error: "Não foi possível ler as fotos deste tema. Tenta outra vez." }),
    })) as unknown as typeof g.fetch;
    juntar();
    await waitFor(() =>
      expect(screen.getByText(/Não foi possível ler as fotos deste tema/)).toBeTruthy(),
    );
    expect(onDone).not.toHaveBeenCalled();
    // E o botão volta a estar disponível: cada volta é repetível.
    expect(screen.getByRole("button", { name: "Juntar os temas" })).not.toBeDisabled();
  });

  it("o que já passou não se perde na mensagem de erro", async () => {
    desenhar();
    let chamada = 0;
    g.fetch = vi.fn(async () => {
      chamada += 1;
      if (chamada === 1) return { ok: true, json: async () => lote({ moved: 40, done: false }) };
      return { ok: false, json: async () => ({ error: "Erro interno" }) };
    }) as unknown as typeof g.fetch;
    juntar();
    await waitFor(() => expect(screen.getByText("Erro interno")).toBeTruthy());
    expect(screen.getByText(/O que já passou está em/)).toBeTruthy();
  });
});
