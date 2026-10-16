import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS VÍDEOS DA ENTRADA NÃO PASSAM PELO SERVICE WORKER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um `<video>` pede o ficheiro aos bocados (`Range` → `206`). O `sw.js` tinha o
 * `mp4` na lista dos ficheiros a guardar em cache-first, e guardar um bocado
 * com a chave do ficheiro inteiro parte o vídeo no Safari (fica preto). Desde
 * os vídeos da entrada (15/10), qualquer pedido de vídeo vai directo à rede.
 *
 * Corre o `public/sw.js` REAL num mundo de mentira, como o sw-navegacao.test.
 */

const FONTE = readFileSync("public/sw.js", "utf-8");
const ORIGEM = "https://liquen-events.com";

function montar() {
  const ouvintes = new Map<string, (evento: unknown) => void>();
  const guardados: string[] = [];
  const caixa = {
    put: async (p: { url: string }) => void guardados.push(p.url),
    match: async () => undefined,
    keys: async () => [],
    delete: async () => true,
    add: async () => {},
  };
  const caches = {
    open: async () => caixa,
    keys: async () => [],
    delete: async () => true,
    match: async () => undefined,
  };
  const rede = vi.fn(async () => ({
    ok: true,
    status: 200,
    clone() {
      return this;
    },
  }));
  const self = {
    addEventListener: (tipo: string, fn: (evento: unknown) => void) => ouvintes.set(tipo, fn),
    skipWaiting: () => {},
    location: { origin: ORIGEM },
    clients: { claim: async () => {}, matchAll: async () => [], openWindow: async () => {} },
    registration: { showNotification: async () => {} },
  };
  new Function("self", "caches", "fetch", FONTE)(self, caches, rede);

  /** Despacha um pedido e diz se o service worker lhe respondeu. */
  function pedir(caminho: string, o: { destino?: string; range?: boolean } = {}) {
    let respondeu = false;
    const cabecalhos = new Map<string, string>(o.range ? [["range", "bytes=0-"]] : []);
    ouvintes.get("fetch")!({
      request: {
        method: "GET",
        url: `${ORIGEM}${caminho}`,
        mode: "no-cors",
        destination: o.destino ?? "",
        headers: { has: (k: string) => cabecalhos.has(k.toLowerCase()) },
      },
      respondWith: () => {
        respondeu = true;
      },
    });
    return respondeu;
  }
  return { pedir, guardados };
}

describe("service worker — vídeos", () => {
  it("um .mp4 da entrada vai directo à rede", () => {
    const sw = montar();
    expect(
      sw.pedir("/videos/entrada/v1/entrada-1-1080.mp4", { destino: "video", range: true }),
    ).toBe(false);
  });

  it("mesmo sem `destination` (Safari), o .mp4 não é apanhado", () => {
    expect(montar().pedir("/videos/entrada/v1/entrada-2-720.mp4")).toBe(false);
  });

  it("um pedido com `Range` nunca é guardado, seja do que for", () => {
    expect(montar().pedir("/imagens/qualquer.jpg", { range: true })).toBe(false);
  });

  it("as fotografias continuam a passar pela cache", () => {
    expect(montar().pedir("/imagens/qualquer.jpg", { destino: "image" })).toBe(true);
  });
});
