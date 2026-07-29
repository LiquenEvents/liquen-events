import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createLoadQueue, GALLERY_MAX_INFLIGHT, galleryLoadQueue } from "./load-queue";

/**
 * A fila é o que impede a galeria de repetir a rajada medida em produção (116
 * a 169 pedidos ao optimizador em voo ao mesmo tempo, p95 de 14,8s). Estes
 * testes travam as três propriedades de que isso depende: o tecto, a ordem, e
 * o facto de nenhum pedido ficar preso para sempre.
 */
describe("fila de carregamento da galeria", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("nunca deixa arrancar mais do que o tecto ao mesmo tempo", () => {
    const q = createLoadQueue(3);
    const started: number[] = [];
    const releases = Array.from({ length: 10 }, (_, i) => q.acquire(() => started.push(i)));
    expect(started).toEqual([0, 1, 2]);
    expect(q.stats()).toEqual({ inflight: 3, waiting: 7 });
    // Libertar um lugar deixa entrar exactamente mais um.
    releases[0]();
    expect(started).toEqual([0, 1, 2, 3]);
    expect(q.stats().inflight).toBe(3);
  });

  it("serve por ordem de chegada", () => {
    const q = createLoadQueue(1);
    const started: string[] = [];
    const r0 = q.acquire(() => started.push("a"));
    q.acquire(() => started.push("b"));
    q.acquire(() => started.push("c"));
    expect(started).toEqual(["a"]);
    r0();
    expect(started).toEqual(["a", "b"]);
  });

  it("desistir enquanto se espera não gasta o lugar (mosaico que desmonta)", () => {
    const q = createLoadQueue(1);
    const started: string[] = [];
    const r0 = q.acquire(() => started.push("a"));
    const cancelB = q.acquire(() => started.push("b"));
    cancelB();
    expect(q.stats().waiting).toBe(0);
    r0();
    expect(started).toEqual(["a"]);
  });

  it("libertar duas vezes não corrompe a contagem", () => {
    const q = createLoadQueue(2);
    const r = q.acquire(() => {});
    q.acquire(() => {});
    r();
    r();
    r();
    expect(q.stats().inflight).toBe(1);
  });

  it("um pedido que nunca resolve liberta o lugar pelo cão-de-guarda", () => {
    // Esta é a defesa contra a cauda de 19,2s medida no optimizador: sem ela,
    // um único pedido pendurado bloqueava uma das 6 vias para sempre.
    const q = createLoadQueue(1, 5_000);
    const started: string[] = [];
    q.acquire(() => started.push("preso"));
    q.acquire(() => started.push("seguinte"));
    expect(started).toEqual(["preso"]);
    vi.advanceTimersByTime(4_999);
    expect(started).toEqual(["preso"]);
    vi.advanceTimersByTime(2);
    expect(started).toEqual(["preso", "seguinte"]);
  });

  it("o cão-de-guarda de um pedido já concluído não desconta o lugar duas vezes", () => {
    // Se o timer de um slot já libertado ainda descontasse, `inflight` ficava
    // negativo e o tecto deixava de existir — o inverso exacto do que a fila
    // serve para fazer.
    const q = createLoadQueue(1, 1_000);
    const started: string[] = [];
    const r = q.acquire(() => started.push("a"));
    r();
    q.acquire(() => started.push("b"));
    expect(q.stats().inflight).toBe(1);
    vi.advanceTimersByTime(5_000); // dispara o cão-de-guarda de "a" e de "b"
    expect(q.stats().inflight).toBe(0);
    q.acquire(() => started.push("c"));
    q.acquire(() => started.push("d"));
    expect(started).toEqual(["a", "b", "c"]); // "d" fica à espera: tecto intacto
  });

  it("a instância partilhada usa o tecto de 6 (o do HTTP/1.1 que protegeu o local)", () => {
    expect(GALLERY_MAX_INFLIGHT).toBe(6);
    const releases = Array.from({ length: 9 }, () => galleryLoadQueue.acquire(() => {}));
    expect(galleryLoadQueue.stats().inflight).toBe(6);
    releases.forEach((r) => r());
    expect(galleryLoadQueue.stats()).toEqual({ inflight: 0, waiting: 0 });
  });
});
