// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import BibliotecaRevisao from "./BibliotecaRevisao";
import { ToastProvider } from "./Toast";

/**
 * A revisão em lote é o par obrigatório da migração: ela deixa 55 fotos sem
 * tipo (a pasta "Terracotta" nunca soube dizer se a foto é um bouquet), e é
 * aqui que isso se arruma. O que estes testes guardam é o que faz o ecrã valer
 * a pena — chegar depressa às fotos certas e etiquetá-las às dezenas.
 */

const ETIQUETAS = [
  { id: "tipo:bouquet", eixo: "tipo", nome: "bouquet", ordem: 10, createdAt: "2026-01-01" },
  {
    id: "tipo:seating-plan",
    eixo: "tipo",
    nome: "seating plan",
    ordem: 20,
    createdAt: "2026-01-01",
  },
  {
    id: "paleta:terracotta",
    eixo: "paleta",
    nome: "terracotta",
    ordem: 10,
    createdAt: "2026-01-01",
  },
];

const foto = (n: number, over: Record<string, unknown> = {}) => ({
  path: `terracotta/f${n}.jpg`,
  url: `https://cdn.test/f${n}.jpg`,
  thumbUrl: `https://cdn.test/t${n}.jpg`,
  etiquetas: ["paleta:terracotta"],
  porConfirmar: true,
  ...over,
});

/** Os pedidos que o ecrã fez, para se poder afirmar O QUE ele perguntou. */
let pedidos: { url: string; body?: unknown }[] = [];
let resposta = { ok: true, total: 3, fotos: [foto(1), foto(2), foto(3)] };
let mudadas = 2;

beforeEach(() => {
  pedidos = [];
  resposta = { ok: true, total: 3, fotos: [foto(1), foto(2), foto(3)] };
  mudadas = 2;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    pedidos.push({ url, body });
    if (url.startsWith("/api/biblioteca/etiquetas")) {
      return new Response(JSON.stringify(ETIQUETAS), { status: 200 });
    }
    if (url.startsWith("/api/biblioteca/fotos")) {
      return new Response(JSON.stringify(resposta), { status: 200 });
    }
    if (url.startsWith("/api/biblioteca/etiquetar")) {
      return new Response(JSON.stringify({ ok: true, pedidas: 3, mudadas }), { status: 200 });
    }
    return new Response("{}", { status: 404 });
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const abrir = () =>
  render(
    <ToastProvider>
      <BibliotecaRevisao onBack={() => {}} />
    </ToastProvider>,
  );

const fotos = () => screen.getAllByRole("button", { name: /^Foto / });
const consultas = () => pedidos.filter((p) => p.url.startsWith("/api/biblioteca/fotos"));
/** O contador da barra de selecção. Há mais `role="status"` no ecrã (os avisos
 *  do Toast também o são), por isso escolhe-se pelo texto. */
const contador = () =>
  screen.queryAllByRole("status").find((el) => /escolhidas?$/.test(el.textContent ?? ""));

describe("rever etiquetas", () => {
  it("mostra as fotos e o vocabulário dos três eixos", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    expect(screen.getByRole("button", { name: "seating plan" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "terracotta" })).toBeInTheDocument();
  });

  /** O atalho que leva ao trabalho que a migração deixou por fazer. */
  it("«sem tipo» é o que vai na pergunta ao servidor", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "sem tipo" }));
    await waitFor(() => expect(consultas().at(-1)!.url).toContain("sem=tipo"));
  });

  /**
   * Duas etiquetas escolhidas viajam as DUAS, porque o servidor exige as duas.
   * Se só uma fosse, "seating plan terracotta" devolvia terracottas que não são
   * seating plans — que é exactamente o problema que isto veio resolver.
   */
  it("duas etiquetas escolhidas vão as duas na procura", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(screen.getByRole("button", { name: "seating plan" }));
    fireEvent.click(screen.getByRole("button", { name: "terracotta" }));
    await waitFor(() => {
      const url = decodeURIComponent(consultas().at(-1)!.url);
      expect(url).toContain("tipo:seating-plan");
      expect(url).toContain("paleta:terracotta");
    });
  });

  it("clicar escolhe e volta a clicar desescolhe", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    await waitFor(() => expect(contador()?.textContent).toBe("1 foto escolhida"));
    fireEvent.click(fotos()[0]);
    await waitFor(() => expect(contador()).toBeUndefined());
  });

  /** Sem isto, apanhar uma fiada de trinta fotos eram trinta cliques — e o
   *  ecrã deixava de resolver o problema para que existe. */
  it("Shift+clique apanha tudo o que está entre as duas", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.click(fotos()[2], { shiftKey: true });
    await waitFor(() => expect(contador()?.textContent).toBe("3 fotos escolhidas"));
  });

  it("aplica a etiqueta às fotos escolhidas, e só a essas", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.click(fotos()[1]);
    fireEvent.change(screen.getByLabelText("Etiqueta a aplicar"), {
      target: { value: "tipo:bouquet" },
    });
    await waitFor(() => {
      const escrita = pedidos.find((p) => p.url.startsWith("/api/biblioteca/etiquetar"));
      expect(escrita?.body).toEqual({
        paths: ["terracotta/f1.jpg", "terracotta/f2.jpg"],
        etiquetaId: "tipo:bouquet",
        accao: "por",
      });
    });
  });

  /**
   * A conta honesta: seleccionar 3 e mudar 2 (uma já tinha a etiqueta) diz 2.
   * Dizer 3 é uma inflação que se descobre à segunda vez que se usa o ecrã, e
   * a partir daí a mensagem deixa de valer nada.
   */
  it("diz quantas MUDARAM, não quantas foram pedidas", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.click(fotos()[1], { shiftKey: true });
    fireEvent.click(fotos()[2], { shiftKey: true });
    fireEvent.change(screen.getByLabelText("Etiqueta a aplicar"), {
      target: { value: "tipo:bouquet" },
    });
    expect(await screen.findByText(/2 fotos etiquetadas com “bouquet”/)).toBeInTheDocument();
  });

  /** Pôr o tipo e a seguir a paleta ao mesmo conjunto é o gesto normal. */
  it("a selecção sobrevive a aplicar uma etiqueta", async () => {
    abrir();
    await waitFor(() => expect(fotos()).toHaveLength(3));
    fireEvent.click(fotos()[0]);
    fireEvent.change(screen.getByLabelText("Etiqueta a aplicar"), {
      target: { value: "tipo:bouquet" },
    });
    await waitFor(() =>
      expect(pedidos.some((p) => p.url.startsWith("/api/biblioteca/etiquetar"))).toBe(true),
    );
    expect(contador()?.textContent).toBe("1 foto escolhida");
  });

  it("sem nada por arrumar, diz isso em vez de um vazio mudo", async () => {
    resposta = { ok: true, total: 0, fotos: [] };
    abrir();
    fireEvent.click(await screen.findByRole("button", { name: "sem tipo" }));
    expect(await screen.findByText(/está tudo etiquetado/)).toBeInTheDocument();
  });
});
