// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadName, downloadOne, downloadMany } from "./photo-download";
import type { ThemeImage } from "@/lib/theme-types";

const img = (path: string): ThemeImage => ({ path, url: `https://cdn.test/${path}` });

describe("downloadName", () => {
  it("usa o nome do tema e a posição, não o UUID do Storage", () => {
    // O caminho no Storage é um UUID. Uma pasta de transferências cheia de
    // "9f3a...jpg" não diz nada a quem a abre depois.
    expect(downloadName(img("italia/9f3a-4b.jpg"), "Itália", 0)).toBe("italia-01.jpg");
    expect(downloadName(img("italia/9f3a-4b.jpg"), "Itália", 11)).toBe("italia-12.jpg");
  });

  it("mantém a extensão real da foto", () => {
    expect(downloadName(img("t/a.PNG"), "Terracotta", 0)).toBe("terracotta-01.png");
    expect(downloadName(img("t/a.webp"), "Terracotta", 0)).toBe("terracotta-01.webp");
  });

  it("aguenta um nome de tema que não dá slug nenhum", () => {
    expect(downloadName(img("t/a.jpg"), "?!", 0)).toBe("tema-01.jpg");
  });

  it("assume jpg quando o caminho não traz extensão", () => {
    expect(downloadName(img("t/sem-extensao"), "Itália", 0)).toBe("italia-01.jpg");
  });
});

describe("downloadOne", () => {
  const clicks: string[] = [];

  beforeEach(() => {
    clicks.length = 0;
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    // Um <a> a sério, mas sem navegar de facto.
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      clicks.push(this.download);
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("puxa os bytes e guarda com o nome pedido", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) })),
    );
    expect(await downloadOne("https://cdn.test/a.jpg", "italia-01.jpg")).toBe(true);
    expect(clicks).toEqual(["italia-01.jpg"]);
  });

  it("devolve false (e não lança) quando a resposta não presta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: false, blob: async () => new Blob() })),
    );
    expect(await downloadOne("https://cdn.test/a.jpg", "a.jpg")).toBe(false);
    expect(clicks).toEqual([]);
  });

  it("devolve false quando a rede falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await downloadOne("https://cdn.test/a.jpg", "a.jpg")).toBe(false);
  });
});

describe("downloadMany", () => {
  beforeEach(() => {
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn(() => "blob:fake"),
      revokeObjectURL: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("uma foto falhada não trava as outras", async () => {
    // É o ponto todo de contar falhas em vez de lançar: num lote de 40, a
    // número 7 estar corrompida não pode custar as 33 seguintes.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: !url.includes("mau"),
        blob: async () => new Blob(["x"]),
      })),
    );
    const p = await downloadMany(
      [
        { url: "https://cdn.test/a.jpg", filename: "a.jpg" },
        { url: "https://cdn.test/mau.jpg", filename: "b.jpg" },
        { url: "https://cdn.test/c.jpg", filename: "c.jpg" },
      ],
      () => {},
    );
    expect(p).toEqual({ done: 3, total: 3, failed: 1 });
  });

  it("vai dando conta do progresso, uma a uma", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) })),
    );
    const seen: number[] = [];
    await downloadMany(
      [1, 2, 3].map((n) => ({ url: `https://cdn.test/${n}.jpg`, filename: `${n}.jpg` })),
      (p) => seen.push(p.done),
    );
    expect(seen).toEqual([1, 2, 3]);
  });

  it("desiste a meio quando lhe pedem, e guarda o que já tinha feito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, blob: async () => new Blob(["x"]) })),
    );
    const ctrl = new AbortController();
    const p = await downloadMany(
      [1, 2, 3, 4].map((n) => ({ url: `https://cdn.test/${n}.jpg`, filename: `${n}.jpg` })),
      (prog) => {
        if (prog.done === 2) ctrl.abort();
      },
      ctrl.signal,
    );
    expect(p.done).toBe(2);
  });
});
