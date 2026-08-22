import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «USADO EM 7 PROPOSTAS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que se prende aqui é a UNIDADE da contagem — que é a única coisa que a
 * frase promete e a única que se pode enganar em silêncio. Conta-se por
 * proposta: um tema com catorze fotos no mesmo mood board foi usado UMA vez, e
 * «342 fotos usadas» seria um número grande que não quer dizer nada.
 */
const st = vi.hoisted(() => ({
  propostas: [] as Partial<Proposal>[],
  falha: null as Error | null,
}));

vi.mock("@/lib/logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock("@/lib/proposals-store", () => ({
  listAllProposals: vi.fn(async () => {
    if (st.falha) throw st.falha;
    return st.propostas;
  }),
}));

import { esquecerUsoDosTemas, usoDosTemas } from "./temas-uso";

const proposta = (id: string, doc: unknown): Partial<Proposal> =>
  ({ id, doc }) as Partial<Proposal>;
const foto = (tema: string, n: number) => `tema:${tema}/f${n}.jpg`;

beforeEach(() => {
  st.propostas = [];
  st.falha = null;
  esquecerUsoDosTemas();
});

describe("a unidade é a proposta", () => {
  it("catorze fotos do mesmo tema contam UMA vez", async () => {
    st.propostas = [
      proposta("p1", {
        moodBoards: [{ images: Array.from({ length: 14 }, (_, i) => foto("t-1", i)) }],
      }),
    ];
    expect((await usoDosTemas()).get("t-1")).toBe(1);
  });

  it("duas propostas com o mesmo tema contam duas", async () => {
    st.propostas = [
      proposta("p1", { moodBoards: [{ images: [foto("t-1", 1)] }] }),
      proposta("p2", { coverImages: [foto("t-1", 2)] }),
    ];
    expect((await usoDosTemas()).get("t-1")).toBe(2);
  });

  it("uma proposta com dois temas conta para os dois", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: [foto("t-1", 1), foto("t-2", 1)] }] })];
    const r = await usoDosTemas();
    expect(r.get("t-1")).toBe(1);
    expect(r.get("t-2")).toBe(1);
  });

  /** A varredura é do documento INTEIRO — uma foto num sítio novo conta na
   *  mesma, e é isso que impede o número de apodrecer em silêncio. */
  it("encontra a referência onde quer que ela esteja", async () => {
    st.propostas = [proposta("p1", { qualquerCoisaNova: { a: [{ b: foto("t-9", 1) }] } })];
    expect((await usoDosTemas()).get("t-9")).toBe(1);
  });
});

describe("o que não conta", () => {
  it("uma proposta sem documento não conta", async () => {
    st.propostas = [proposta("p1", undefined)];
    expect((await usoDosTemas()).size).toBe(0);
  });

  it("uma foto da pasta da proposta não é da biblioteca", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: ["pedido-1/abc.jpg"] }] })];
    expect((await usoDosTemas()).size).toBe(0);
  });

  it("uma referência mal formada não inventa um tema", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: ["tema:../../etc/passwd"] }] })];
    expect((await usoDosTemas()).size).toBe(0);
  });

  it("um tema que nunca saiu não aparece no mapa", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: [foto("t-1", 1)] }] })];
    expect((await usoDosTemas()).get("t-2")).toBeUndefined();
  });
});

describe("a contagem guardada", () => {
  it("não volta a ler as propostas dentro da validade", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: [foto("t-1", 1)] }] })];
    await usoDosTemas(1_000);
    st.propostas = [];
    expect((await usoDosTemas(2_000)).get("t-1")).toBe(1);
  });

  it("relê passada a validade", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: [foto("t-1", 1)] }] })];
    await usoDosTemas(1_000);
    st.propostas = [];
    expect((await usoDosTemas(1_000 + 6 * 60 * 1000)).size).toBe(0);
  });

  /**
   * O número é decorativo. Nenhuma parte da Biblioteca pode deixar de abrir
   * por causa dele — nem sequer com a base de dados em baixo.
   */
  it("uma leitura falhada não lança, e devolve o que já sabia", async () => {
    st.propostas = [proposta("p1", { moodBoards: [{ images: [foto("t-1", 1)] }] })];
    await usoDosTemas(1_000);
    st.falha = new Error("base em baixo");
    expect((await usoDosTemas(1_000 + 6 * 60 * 1000)).get("t-1")).toBe(1);
  });

  it("sem nada em cache, uma falha devolve um mapa vazio", async () => {
    st.falha = new Error("base em baixo");
    expect((await usoDosTemas()).size).toBe(0);
  });
});
