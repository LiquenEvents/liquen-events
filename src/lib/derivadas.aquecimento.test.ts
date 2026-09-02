import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CAPA JÁ FABRICADA QUANDO O CASAL ABRE O LINK
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «esta foto demora imenso tempo a carregar, e eu quero que seja
 * super rápida e fluida a aparecer».
 *
 * A derivada de 1200 px passou a vir assinada, directa do CDN — mas só depois de
 * existir, e quem a fabricava era a PRIMEIRA visita. Numa proposta acabada de
 * enviar, essa primeira visita é a do casal a abrir o email: um `sharp` a
 * acontecer enquanto eles olham para um rectângulo vazio.
 *
 * O que se prende aqui é o contrato de um aquecimento: só a capa, no máximo
 * duas, e nunca a atrasar — nem muito menos a travar — o envio de uma proposta.
 *
 * O Storage é um duplo: conta-se o que foi PEDIDO e a que bucket, que é a única
 * coisa que este ficheiro decide. Fabricar a derivada é assunto do
 * `derivadaMediaAPedido`, que corre aqui a sério contra o duplo.
 */

const H = vi.hoisted(() => ({
  pedidos: [] as string[],
  demoraMs: 0,
  rebenta: false,
}));

vi.mock("server-only", () => ({}));
vi.mock("sharp", () => ({ default: () => ({}) }));
vi.mock("@/lib/supabase", () => ({
  getSupabase: () => ({
    storage: {
      from: (bucket: string) => ({
        download: async (chave: string) => {
          H.pedidos.push(`${bucket}:${chave}`);
          if (H.rebenta) throw new Error("storage em baixo");
          if (H.demoraMs) await new Promise((r) => setTimeout(r, H.demoraMs));
          // Já lá está: é o caso normal a partir da segunda vez, e o que o
          // aquecimento quer deixar montado para a visita do casal.
          return { data: { arrayBuffer: async () => new ArrayBuffer(8) } };
        },
      }),
    },
  }),
}));
vi.mock("@/lib/proposal-storage", () => ({
  PROPOSAL_BUCKET: "proposal-assets",
  PROPOSAL_MID_BUCKET: "proposal-medias",
  PROPOSAL_THUMB_BUCKET: "proposal-thumbs",
  uploadProposalMid: vi.fn(),
  uploadProposalThumb: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

const { aquecerDerivadasDaCapa } = await import("./derivadas");

beforeEach(() => {
  H.pedidos.length = 0;
  H.demoraMs = 0;
  H.rebenta = false;
});

/** Só o caminho, sem o bucket — o bucket tem a sua própria afirmação. */
const caminhos = () => H.pedidos.map((p) => p.split(":").slice(1).join(":"));

describe("aquecer a capa", () => {
  it("fabrica as fotografias da capa", async () => {
    const feitas = await aquecerDerivadasDaCapa(["ped/capa-a.jpg", "ped/capa-b.jpg"]);
    expect(caminhos()).toEqual(["ped/capa-a.jpg", "ped/capa-b.jpg"]);
    expect(feitas).toBe(2);
  });

  it("vai ao bucket das derivadas de 1200 px, que é o que a página pede", async () => {
    await aquecerDerivadasDaCapa(["ped/capa.jpg"]);
    expect(H.pedidos[0]).toBe("proposal-medias:ped/capa.jpg");
  });

  it("nunca mais do que duas — a capa tem dois lados e mais nada", async () => {
    // Fabricar quarenta e seis aqui era pôr o envio a demorar o que ela acabou
    // de pedir que não demorasse. As dos mood boards ficam para a visita.
    await aquecerDerivadasDaCapa(["a.jpg", "b.jpg", "c.jpg", "d.jpg"]);
    expect(H.pedidos).toHaveLength(2);
  });

  it("a mesma fotografia dos dois lados fabrica-se uma vez", async () => {
    await aquecerDerivadasDaCapa(["ped/mesma.jpg", "ped/mesma.jpg"]);
    expect(caminhos()).toEqual(["ped/mesma.jpg"]);
  });

  it("uma posição vazia não é uma fotografia", async () => {
    await aquecerDerivadasDaCapa(["", "   ", "ped/capa.jpg"]);
    expect(caminhos()).toEqual(["ped/capa.jpg"]);
  });

  it("uma foto embutida ou de fora não tem derivada para fabricar", async () => {
    await aquecerDerivadasDaCapa(["data:image/jpeg;base64,AAA", "https://exemplo.pt/f.jpg"]);
    expect(H.pedidos).toEqual([]);
  });

  it("sem capa nenhuma, não vai ao Storage", async () => {
    expect(await aquecerDerivadasDaCapa([])).toBe(0);
    expect(H.pedidos).toEqual([]);
  });

  /**
   * O QUE NÃO PODE ACONTECER: ATRASAR O ENVIO.
   *
   * Isto corre em paralelo com a ida ao servidor de correio. Se a fábrica
   * encravar, o envio continua e a derivada fica para a visita — como era antes.
   */
  it("passado o tecto, desiste — e não fica lá pendurado", async () => {
    H.demoraMs = 300;
    expect(await aquecerDerivadasDaCapa(["ped/capa.jpg"], 20)).toBe(0);
  });

  it("e um Storage em baixo não trava o envio de uma proposta", async () => {
    H.rebenta = true;
    await expect(aquecerDerivadasDaCapa(["ped/capa.jpg"])).resolves.toBe(0);
  });
});
