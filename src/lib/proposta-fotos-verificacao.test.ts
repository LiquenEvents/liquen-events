import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE FALTAM — APANHADAS ANTES DE O CASAL AS NÃO VER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito real: quatro barras cinzentas na secção «Decoração Seatting Plan»
 * de uma proposta que já tinha seguido. A causa não é o carregamento: é que
 * ASSINAR UM CAMINHO NÃO PROVA QUE O FICHEIRO EXISTE — o Storage devolve um
 * endereço válido para um objecto que lá não está, e o 404 só acontece no
 * navegador do casal.
 *
 * O que se prende aqui é sobretudo a honestidade da resposta:
 *
 *   1. uma foto que falta é NOMEADA pelo sítio onde está, não por um caminho;
 *   2. uma listagem que FALHA não acusa ninguém — «não consegui perguntar» e
 *      «está tudo bem» são a mesma coisa vista do ecrã, e não podem ser;
 *   3. e o custo é uma ida ao Storage por PASTA, não por fotografia.
 */

const H = vi.hoisted(() => ({
  /** bucket::pasta → nomes de ficheiro, ou `null` para «a listagem falhou». */
  pastas: new Map<string, string[] | null>(),
  /** Quantas vezes o Storage foi consultado — o custo, medido. */
  listagens: [] as string[],
  temSupabase: true,
}));

vi.mock("server-only", () => ({}));
vi.mock("./logger", () => ({
  log: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));
vi.mock("./supabase", () => ({
  getSupabase: () =>
    H.temSupabase
      ? {
          storage: {
            from: (bucket: string) => ({
              list: async (pasta: string) => {
                H.listagens.push(`${bucket}::${pasta}`);
                const nomes = H.pastas.get(`${bucket}::${pasta}`);
                if (nomes === null) return { data: null, error: new Error("storage em baixo") };
                return {
                  data: (nomes ?? []).map((name) => ({ id: `id-${name}`, name })),
                  error: null,
                };
              },
            }),
          },
        }
      : null,
}));

const { verificarFotosDaProposta, PORQUE_FALTA } = await import("./proposta-fotos-verificacao");

beforeEach(() => {
  H.pastas.clear();
  H.listagens.length = 0;
  H.temSupabase = true;
});

/** Uma pasta do bucket das propostas, com os ficheiros que lá estão mesmo. */
const naPastaDoPedido = (pasta: string, nomes: string[] | null) =>
  H.pastas.set(`proposal-assets::${pasta}`, nomes);
const naBiblioteca = (pasta: string, nomes: string[] | null) =>
  H.pastas.set(`theme-assets::${pasta}`, nomes);

const doc = (over: Record<string, unknown> = {}) => ({
  coverImages: [],
  moodBoards: [],
  ...over,
});

describe("o que está lá, está", () => {
  it("um documento com todas as fotos no sítio não acusa nada", async () => {
    naPastaDoPedido("LIQ-9", ["uma.jpg", "duas.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Cerimónia", images: ["LIQ-9/uma.jpg", "LIQ-9/duas.jpg"] }] }),
    );
    expect(r.emFalta).toEqual([]);
    expect(r.total).toBe(2);
    expect(r.verificou).toBe(true);
  });

  it("um documento sem fotos nenhumas responde sim, e sem ir ao Storage", async () => {
    const r = await verificarFotosDaProposta(doc());
    expect(r).toEqual({ total: 0, emFalta: [], naoVerificaveis: 0, verificou: true });
    expect(H.listagens).toEqual([]);
  });
});

describe("o que falta é nomeado pelo sítio, não pelo caminho", () => {
  it("uma foto que não está no bucket sai com o mood board e a posição", async () => {
    // «Mood board «Decoração Seating Plan» · foto 1» é o que ela precisa de
    // ler para saber onde ir; `LIQ-9/3f2a….jpg` não é nada para ninguém.
    naPastaDoPedido("LIQ-9", ["duas.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({
        moodBoards: [
          { title: "Decoração Seating Plan", images: ["LIQ-9/uma.jpg", "LIQ-9/duas.jpg"] },
        ],
      }),
    );
    expect(r.emFalta).toEqual([
      { id: "b0f0", onde: "Mood board «Decoração Seating Plan» · foto 1", motivo: "nao-esta-no-bucket" },
    ]);
  });

  it("as capas dizem qual das duas", async () => {
    naPastaDoPedido("LIQ-9", []);
    const r = await verificarFotosDaProposta(doc({ coverImages: ["LIQ-9/capa.jpg"] }));
    expect(r.emFalta[0].onde).toBe("Capa · esquerda");
  });

  it("um mood board sem título é nomeado pela posição, não por um vazio", async () => {
    naPastaDoPedido("LIQ-9", []);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "  ", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.emFalta[0].onde).toBe("Mood board 1 · foto 1");
  });

  it("as fotos das ALTERNATIVAS entram na conta", async () => {
    // Nasceram hoje (Fase 3) e falham exactamente da mesma maneira. Deixá-las
    // de fora seria uma foto partida numa secção que a verificação jura limpa.
    naPastaDoPedido("LIQ-9", []);
    const r = await verificarFotosDaProposta(
      doc({
        escolhas: [
          {
            id: "e1",
            titulo: "Paleta",
            opcoes: [{ id: "o1", rotulo: "Terracota", imagem: "LIQ-9/paleta.jpg" }],
          },
        ],
      }),
    );
    expect(r.emFalta).toEqual([
      { id: "e0o0", onde: "Escolha «Paleta» · Terracota", motivo: "nao-esta-no-bucket" },
    ]);
  });

  it("uma foto da Biblioteca que já lá não está tem um motivo PRÓPRIO", async () => {
    // A causa é outra (foi apagada de um tema) e a resolução é outra. Misturá-la
    // com «não está no bucket do pedido» manda-a procurar no sítio errado.
    naBiblioteca("outono", ["outra.jpg"]);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["tema:outono/sumida.jpg"] }] }),
    );
    expect(r.emFalta[0].motivo).toBe("saiu-da-biblioteca");
  });

  it("uma foto reservada e nunca copiada conta como falta", async () => {
    // `pending:` é um lugar guardado; se a cópia nunca aconteceu, é um buraco.
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["pending:tok-1"] }] }),
    );
    expect(r.emFalta).toEqual([
      { id: "b0f0", onde: "Mood board «Mesa» · foto 1", motivo: "por-copiar" },
    ]);
    // E nem chega a ir ao Storage por causa dela.
    expect(H.listagens).toEqual([]);
  });
});

describe("o que não se sabe não se dá por sabido", () => {
  it("sem Storage configurado, a resposta diz que NÃO verificou", async () => {
    // O caso do ambiente local. Uma lista vazia aqui lê-se como «está tudo
    // bem» — e seria a mesma mentira que este módulo existe para acabar.
    H.temSupabase = false;
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.verificou).toBe(false);
    expect(r.emFalta).toEqual([]);
  });

  it("uma listagem que falha não acusa a foto de faltar", async () => {
    naPastaDoPedido("LIQ-9", null);
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["LIQ-9/uma.jpg"] }] }),
    );
    expect(r.verificou).toBe(false);
    expect(r.emFalta).toEqual([]);
  });

  it("um endereço de fora conta-se à parte — nem bom nem mau", async () => {
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["https://exemplo.pt/foto.jpg"] }] }),
    );
    expect(r.naoVerificaveis).toBe(1);
    expect(r.emFalta).toEqual([]);
    expect(r.verificou).toBe(true);
  });

  it("uma foto com os bytes lá dentro não pode faltar", async () => {
    // As propostas anteriores ao Storage são todas assim.
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: ["data:image/jpeg;base64,AAAA"] }] }),
    );
    expect(r.emFalta).toEqual([]);
    expect(r.naoVerificaveis).toBe(0);
  });
});

describe("o custo", () => {
  it("é uma ida ao Storage por PASTA, não por fotografia", async () => {
    // Quarenta e seis fotos da mesma pasta: uma listagem. Descarregar cada uma
    // para confirmar seriam dezenas de megabytes e uma rota que estoura.
    const muitas = Array.from({ length: 46 }, (_, i) => `LIQ-9/f${i}.jpg`);
    naPastaDoPedido(
      "LIQ-9",
      muitas.map((p) => p.split("/")[1]),
    );
    const r = await verificarFotosDaProposta(
      doc({ moodBoards: [{ title: "Mesa", images: muitas }] }),
    );
    expect(r.total).toBe(46);
    expect(r.emFalta).toEqual([]);
    expect(H.listagens).toEqual(["proposal-assets::LIQ-9"]);
  });

  it("duas origens são duas listagens, e não uma por foto", async () => {
    naPastaDoPedido("LIQ-9", ["uma.jpg"]);
    naBiblioteca("outono", ["duas.jpg"]);
    await verificarFotosDaProposta(
      doc({
        moodBoards: [
          { title: "Mesa", images: ["LIQ-9/uma.jpg", "tema:outono/duas.jpg", "LIQ-9/uma.jpg"] },
        ],
      }),
    );
    expect(H.listagens.sort()).toEqual(["proposal-assets::LIQ-9", "theme-assets::outono"]);
  });
});

describe("cada motivo explica-se a quem o lê", () => {
  it("nenhuma explicação é um rótulo técnico", () => {
    for (const [motivo, frase] of Object.entries(PORQUE_FALTA)) {
      expect(frase.length, motivo).toBeGreaterThan(40);
      expect(frase, motivo).not.toMatch(/bucket.*\/|undefined|null/);
    }
  });
});
