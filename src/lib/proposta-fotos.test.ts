import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * As três regras do cabeçalho de `proposta-fotos.ts`, presas uma a uma.
 *
 * Os assinadores são simulados e devolvem URLs RECONHECÍVEIS (`assinado:` /
 * `mini:`) para se poder afirmar de onde veio cada campo — a diferença entre
 * «a grelha usa a miniatura» e «a grelha usa alguma coisa».
 */

const H = vi.hoisted(() => ({
  originais: new Map<string, string>(),
  miniaturas: new Map<string, string>(),
  pedidosOriginais: [] as string[][],
  pedidosMiniaturas: [] as string[][],
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/proposal-storage", () => ({
  signProposalPaths: vi.fn(async (paths: string[]) => {
    H.pedidosOriginais.push([...paths]);
    return new Map(paths.filter((p) => H.originais.has(p)).map((p) => [p, H.originais.get(p)!]));
  }),
  signProposalThumbs: vi.fn(async (paths: string[]) => {
    H.pedidosMiniaturas.push([...paths]);
    return new Map(paths.filter((p) => H.miniaturas.has(p)).map((p) => [p, H.miniaturas.get(p)!]));
  }),
}));
vi.mock("@/lib/biblioteca-fotos-store", () => ({
  formasDeCaminhos: vi.fn(async () => new Map([["ped-42/aaa.jpg", { largura: 1600, altura: 900 }]])),
  lqipsDeCaminhos: vi.fn(async () => new Map()),
}));

const { fotosDaProposta } = await import("./proposta-fotos");

/** Um documento com as duas famílias de referência e um `pending:` pelo meio. */
const DOC = {
  coverImages: ["ped-42/capa.jpg", ""],
  moodBoards: [
    { title: "Cerimónia", images: ["ped-42/aaa.jpg", "tema:outono-quente/bbb.jpg"] },
    { title: "Copo de água", images: ["pending:ped-42/ccc.jpg", "ped-42/sem-miniatura.jpg"] },
  ],
} as unknown as Parameters<typeof fotosDaProposta>[0];

beforeEach(() => {
  H.pedidosOriginais.length = 0;
  H.pedidosMiniaturas.length = 0;
  H.originais.clear();
  H.miniaturas.clear();
  for (const p of [
    "ped-42/capa.jpg",
    "ped-42/aaa.jpg",
    "tema:outono-quente/bbb.jpg",
    "ped-42/sem-miniatura.jpg",
  ]) {
    H.originais.set(p, `https://storage.example/assinado:${p}?token=X`);
  }
  // De propósito SEM `ped-42/sem-miniatura.jpg`: as fotos anteriores ao bucket
  // das miniaturas não têm nenhuma, e a página tem de saber viver com isso.
  for (const p of ["ped-42/capa.jpg", "ped-42/aaa.jpg", "tema:outono-quente/bbb.jpg"]) {
    H.miniaturas.set(p, `https://storage.example/mini:${p}?token=X`);
  }
});

describe("regra 1 — nada do que sai é um caminho de bucket", () => {
  it("nem nas chaves, nem nos ids, nem em campo nenhum", async () => {
    const fotos = await fotosDaProposta(DOC);
    // CONTROLO POSITIVO: sem isto, uma lista vazia (ou um `fotosDaProposta`
    // que devolvesse `[]` por engano) passava este teste inteiro sem ter
    // desenhado nada. Tem de haver mesmo fotografias e URLs cá dentro.
    expect(fotos.length).toBe(4);
    expect(fotos.filter((f) => f.original).length).toBe(4);

    // Os IDs são opacos: nem o pedido, nem o ficheiro, nem a pasta do tema.
    expect(fotos.map((f) => f.id)).toEqual(["c0", "b0f0", "b0f1", "b1f1"]);

    // E o objecto inteiro, serializado, não pode conter o identificador do
    // pedido nem o nome da pasta da Biblioteca fora de um URL assinado.
    const semUrls = JSON.stringify(
      fotos.map(({ id, largura, altura, lqip }) => ({ id, largura, altura, lqip })),
    );
    expect(semUrls).not.toContain("ped-42");
    expect(semUrls).not.toContain("outono-quente");
    expect(semUrls).not.toContain("tema:");
  });
});

describe("regra 2 — só se assina o que está NAQUELE documento", () => {
  it("os assinadores recebem exactamente as referências do documento", async () => {
    await fotosDaProposta(DOC);
    const esperado = [
      "ped-42/capa.jpg",
      "ped-42/aaa.jpg",
      "tema:outono-quente/bbb.jpg",
      "ped-42/sem-miniatura.jpg",
    ];
    expect(H.pedidosOriginais).toEqual([esperado]);
    expect(H.pedidosMiniaturas).toEqual([esperado]);
  });

  it("uma foto por escrever (`pending:`) não é assinada nem desenhada", async () => {
    const fotos = await fotosDaProposta(DOC);
    expect(H.pedidosOriginais[0]).not.toContain("pending:ped-42/ccc.jpg");
    expect(fotos.map((f) => f.id)).not.toContain("b1f0");
  });

  /**
   * ── ESTE TESTE JÁ FOI OUTRO, E O OUTRO MENTIA ────────────────────────────
   *
   * Aqui esteve `expect(fotosDaProposta.length).toBe(1)` — «não há segundo
   * parâmetro por onde um caminho de fora possa entrar». MEDIDO: acrescentei
   * um `extra: string[] = []` à função e o teste **passou na mesma**, porque um
   * parâmetro com valor por omissão não conta para o `.length` de uma função
   * em JavaScript. Um teste sobre a torneira aberta que não fecha a torneira.
   *
   * O que se prende agora é a propriedade a sério, e não a forma da assinatura:
   * tudo o que for entregue aos assinadores TEM de estar escrito no documento.
   * A lista esperada é recolhida aqui, a percorrer o documento à mão — se a
   * implementação e o teste concordassem por lerem o mesmo inventário, isto não
   * provava nada.
   */
  it("tudo o que chega aos assinadores está escrito no documento", async () => {
    await fotosDaProposta(DOC);
    const noDocumento = new Set<string>([
      ...(DOC.coverImages ?? []),
      ...(DOC.moodBoards ?? []).flatMap((b) => b.images ?? []),
    ]);
    const assinados = [...H.pedidosOriginais.flat(), ...H.pedidosMiniaturas.flat()];
    // CONTROLO POSITIVO: alguma coisa foi mesmo assinada. Sem isto, uma
    // implementação que não assinasse nada passava com louvor.
    expect(assinados.length).toBeGreaterThan(0);
    const forasteiros = assinados.filter((p) => !noDocumento.has(p));
    expect(forasteiros, `assinados fora do documento: ${forasteiros.join(", ")}`).toEqual([]);
  });
});

describe("regra 3 — a grelha pede a miniatura, o original é só para a lupa", () => {
  it("os dois URLs vêm de buckets diferentes e não se confundem", async () => {
    const fotos = await fotosDaProposta(DOC);
    const capa = fotos.find((f) => f.id === "c0")!;
    expect(capa.miniatura).toContain("mini:");
    expect(capa.original).toContain("assinado:");
    expect(capa.miniatura).not.toBe(capa.original);
  });

  it("uma foto antiga SEM miniatura sai sem `miniatura` — e não sem foto", async () => {
    const fotos = await fotosDaProposta(DOC);
    const antiga = fotos.find((f) => f.id === "b1f1")!;
    expect(antiga.miniatura).toBeUndefined();
    expect(antiga.original).toContain("assinado:");
  });
});

describe("a forma da fotografia, quando se sabe", () => {
  it("chega à célula para ela não nascer com altura zero", async () => {
    const fotos = await fotosDaProposta(DOC);
    expect(fotos.find((f) => f.id === "b0f0")).toMatchObject({ largura: 1600, altura: 900 });
    // E quem não tem linha na tabela não inventa forma nenhuma.
    expect(fotos.find((f) => f.id === "c0")?.largura).toBeUndefined();
  });
});
