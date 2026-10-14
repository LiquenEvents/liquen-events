import { describe, it, expect } from "vitest";
import { criarCachePorBytes } from "./cache-por-bytes";

const nova = () =>
  criarCachePorBytes<Buffer>({ tecto: 30, maximoPorEntrada: 20, tamanho: (b) => b.length });

describe("criarCachePorBytes", () => {
  it("esquece primeiro o que se usou há mais tempo", () => {
    const c = nova();
    c.guardar("a", Buffer.alloc(10));
    c.guardar("b", Buffer.alloc(10));
    c.ler("a"); // «a» passa a ser a mais recente
    c.guardar("c", Buffer.alloc(15));
    expect(c.ler("b")).toBeUndefined();
    expect(c.ler("a")).toBeDefined();
    expect(c.ler("c")).toBeDefined();
    expect(c.estado().bytes).toBe(25);
  });

  it("não guarda uma entrada maior do que o máximo", () => {
    const c = nova();
    c.guardar("grande", Buffer.alloc(21));
    expect(c.ler("grande")).toBeUndefined();
    expect(c.estado()).toEqual({ entradas: 0, bytes: 0 });
  });

  it("substituir uma entrada não conta os bytes duas vezes", () => {
    const c = nova();
    c.guardar("a", Buffer.alloc(10));
    c.guardar("a", Buffer.alloc(12));
    expect(c.estado()).toEqual({ entradas: 1, bytes: 12 });
  });
});
