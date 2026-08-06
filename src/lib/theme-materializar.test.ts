import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A REDE POR BAIXO DA REFERÊNCIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma foto escolhida da Biblioteca para um mood board deixou de ser copiada e
 * passou a ser referenciada. Isso põe uma responsabilidade neste módulo que
 * antes não existia em lado nenhum: **apagar uma foto da Biblioteca não pode
 * tirar imagens de uma proposta que já foi para um casal.**
 *
 * O que estes testes fixam é sempre a mesma coisa vista de ângulos
 * diferentes — quando há a menor dúvida de que alguém fica a perder, a
 * eliminação é RECUSADA. Uma eliminação recusada repete-se; uma foto perdida
 * numa proposta enviada, não.
 *
 * Por isso quase todos verificam duas coisas juntas: o veredicto (`ok`) e se o
 * Storage chegou a ser tocado. Um veredicto certo com a foto apagada na mesma
 * seria o pior dos mundos, e é exactamente o erro que um refactor pode
 * introduzir sem dar nas vistas.
 */

const st = vi.hoisted(() => ({
  propostas: [] as { id: string; quoteId: string; doc?: unknown }[],
  listaRebenta: false,
  gravacoes: [] as { id: string; doc: unknown }[],
  gravacaoFalha: false,
  rascunhos: {} as Record<string, { doc: unknown; updatedAt: string }>,
  varreduraCompleta: true,
  escritas: [] as { key: string; value: unknown }[],
  /** Caminhos cuja cópia de salvaguarda falha. */
  copiaFalha: new Set<string>(),
  copias: [] as { themePath: string; quoteId: string }[],
  apagouFoto: [] as string[],
  apagouPasta: [] as string[],
}));

vi.mock("./proposals-store", () => ({
  listAllProposals: async () => {
    if (st.listaRebenta) throw new Error("db em baixo");
    return st.propostas;
  },
  updateProposal: async (id: string, patch: { doc?: unknown }) => {
    if (st.gravacaoFalha) return null;
    st.gravacoes.push({ id, doc: patch.doc });
    return { id };
  },
}));

vi.mock("./app-state", () => ({
  getState: async (key: string) => st.rascunhos[key] ?? null,
  setState: async (key: string, value: unknown) => {
    st.escritas.push({ key, value });
  },
  listStateByPrefix: async (prefix: string) => ({
    entradas: Object.entries(st.rascunhos)
      .filter(([k]) => k.startsWith(prefix))
      .map(([key, value]) => ({ key, value })),
    completa: st.varreduraCompleta,
  }),
}));

vi.mock("./theme-storage", () => ({
  themeFolder: (id: string) => id,
  copyThemeImageToProposal: async (themePath: string, quoteId: string) => {
    st.copias.push({ themePath, quoteId });
    if (st.copiaFalha.has(themePath)) return null;
    return { path: `${quoteId}/copia-de-${themePath.replace("/", "-")}`, url: "https://signed/x" };
  },
  deleteThemeImage: async (path: string) => {
    st.apagouFoto.push(path);
    return true;
  },
  deleteThemeFolder: async (themeId: string) => {
    st.apagouPasta.push(themeId);
    return { ok: true, removed: 1 };
  },
}));

vi.mock("./logger", () => ({ log: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));

import {
  apagarFotoDaBiblioteca,
  apagarPastaDaBiblioteca,
  materializarAntesDeApagar,
  refsDeTemaNoDoc,
  trocarRefsNoDoc,
} from "./theme-materializar";

beforeEach(() => {
  st.propostas = [];
  st.listaRebenta = false;
  st.gravacoes = [];
  st.gravacaoFalha = false;
  st.rascunhos = {};
  st.varreduraCompleta = true;
  st.escritas = [];
  st.copiaFalha = new Set();
  st.copias = [];
  st.apagouFoto = [];
  st.apagouPasta = [];
});

// ── Encontrar as referências ───────────────────────────────────────────────
describe("refsDeTemaNoDoc", () => {
  /**
   * Percorre o documento INTEIRO em vez de conhecer `coverImages` e
   * `moodBoards` pelo nome. É a diferença entre uma varredura que continua
   * certa no dia em que se acrescentar um sítio onde cabe uma foto e uma que
   * fica calada a perder imagens meses depois.
   */
  it("encontra uma referência esteja onde estiver no documento", () => {
    const doc = {
      coverImages: ["tema:italia/a.jpg", ""],
      moodBoards: [{ images: ["q-1/propria.jpg", "tema:italia/b.jpg"] }],
      seccaoQueAindaNaoExiste: { fundo: { imagem: "tema:terracotta/c.jpg" } },
      titulo: "Casamento da Ana",
    };
    expect([...refsDeTemaNoDoc(doc)].sort()).toEqual([
      "tema:italia/a.jpg",
      "tema:italia/b.jpg",
      "tema:terracotta/c.jpg",
    ]);
  });

  it("não confunde uma foto da própria proposta com uma referência", () => {
    expect([...refsDeTemaNoDoc({ x: ["q-1/uuid.jpg", "data:image/jpeg;base64,AAA"] })]).toEqual([]);
  });

  /** `tema:` com lixo lá dentro não é uma referência — e não pode passar a
   *  ser tratada como um caminho de Storage. */
  it("recusa um prefixo com um caminho inválido", () => {
    expect([...refsDeTemaNoDoc({ x: ["tema:../../etc/passwd", "tema:sem-barra"] })]).toEqual([]);
  });
});

describe("trocarRefsNoDoc", () => {
  /**
   * `coverImages` tem duas posições fixas: a `[0]` imprime à esquerda e a
   * `[1]` à direita. Compactar a lista faria a foto escolhida para a direita
   * sair impressa à esquerda — o mesmo erro que `normaliseCoverImages` já
   * documenta.
   */
  it("preserva a POSIÇÃO, incluindo os lugares vazios da capa", () => {
    const doc = { coverImages: ["", "tema:italia/a.jpg"] };
    const saida = trocarRefsNoDoc(doc, new Map([["tema:italia/a.jpg", "q-1/nova.jpg"]]));
    expect(saida).toEqual({ coverImages: ["", "q-1/nova.jpg"] });
  });

  it("não muda o documento original", () => {
    const doc = { a: ["tema:italia/a.jpg"] };
    trocarRefsNoDoc(doc, new Map([["tema:italia/a.jpg", "q-1/nova.jpg"]]));
    expect(doc.a[0]).toBe("tema:italia/a.jpg");
  });

  it("deixa intacto o que não está no mapa", () => {
    const doc = { a: ["tema:italia/a.jpg", "tema:italia/b.jpg"] };
    expect(trocarRefsNoDoc(doc, new Map([["tema:italia/a.jpg", "q-1/nova.jpg"]]))).toEqual({
      a: ["q-1/nova.jpg", "tema:italia/b.jpg"],
    });
  });
});

// ── O caso normal ──────────────────────────────────────────────────────────
describe("apagar uma foto que ninguém usa", () => {
  it("não copia nada e apaga", async () => {
    st.propostas = [{ id: "p-1", quoteId: "q-1", doc: { coverImages: ["q-1/propria.jpg"] } }];
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(true);
    expect(st.copias, "copiou uma foto que ninguém referenciava").toEqual([]);
    expect(st.gravacoes).toEqual([]);
    expect(st.apagouFoto).toEqual(["italia/a.jpg"]);
  });
});

// ── O caso que justifica o módulo ──────────────────────────────────────────
describe("apagar uma foto que está numa proposta", () => {
  beforeEach(() => {
    st.propostas = [
      {
        id: "p-1",
        quoteId: "q-1",
        doc: {
          coverImages: ["tema:italia/a.jpg", ""],
          moodBoards: [{ images: ["tema:italia/a.jpg", "q-1/propria.jpg"] }],
        },
      },
    ];
  });

  it("copia para a pasta da proposta e reescreve lá o caminho ANTES de apagar", async () => {
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(true);
    expect(st.copias).toEqual([{ themePath: "italia/a.jpg", quoteId: "q-1" }]);
    // A mesma foto aparece duas vezes no documento e é copiada UMA vez — as
    // duas posições passam a apontar para a mesma cópia.
    expect(st.gravacoes[0].doc).toEqual({
      coverImages: ["q-1/copia-de-italia-a.jpg", ""],
      moodBoards: [{ images: ["q-1/copia-de-italia-a.jpg", "q-1/propria.jpg"] }],
    });
    expect(st.apagouFoto).toEqual(["italia/a.jpg"]);
  });

  /**
   * O TESTE QUE INTERESSA. Se a cópia de salvaguarda falha e a foto é apagada
   * na mesma, uma proposta já enviada perde uma imagem e não há como voltar
   * atrás.
   */
  it("NÃO apaga quando a cópia de salvaguarda falha", async () => {
    st.copiaFalha.add("italia/a.jpg");
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("referencias");
    expect(st.apagouFoto, "apagou uma foto que não conseguiu pôr a salvo").toEqual([]);
  });

  /** A cópia existe mas o documento não ficou a apontar para ela: apagar agora
   *  deixava a proposta a apontar para o vazio. */
  it("NÃO apaga quando o documento não pôde ser gravado", async () => {
    st.gravacaoFalha = true;
    const res = await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(res.ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  /** Não conseguir OLHAR não é o mesmo que não haver nada — e no entanto o
   *  código mais natural de escrever trataria os dois casos da mesma maneira. */
  it("NÃO apaga quando não conseguiu sequer ver as propostas", async () => {
    st.listaRebenta = true;
    expect((await apagarFotoDaBiblioteca("italia/a.jpg")).ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  it("NÃO apaga quando a varredura dos rascunhos veio truncada", async () => {
    st.propostas = [];
    st.varreduraCompleta = false;
    expect((await apagarFotoDaBiblioteca("italia/a.jpg")).ok).toBe(false);
    expect(st.apagouFoto).toEqual([]);
  });

  /** Uma proposta que use OUTRA foto do mesmo tema não é copiada por engano. */
  it("só toca em quem usa mesmo a foto", async () => {
    st.propostas.push({ id: "p-2", quoteId: "q-2", doc: { x: ["tema:italia/z.jpg"] } });
    await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(st.copias.map((c) => c.quoteId)).toEqual(["q-1"]);
  });
});

// ── Rascunhos ──────────────────────────────────────────────────────────────
describe("rascunhos do estúdio", () => {
  beforeEach(() => {
    st.rascunhos = {
      "proposal-draft:q-9": {
        doc: { moodBoards: [{ images: ["tema:italia/a.jpg"] }] },
        updatedAt: "1",
      },
    };
  });

  it("uma proposta ainda por enviar também é posta a salvo", async () => {
    expect((await apagarFotoDaBiblioteca("italia/a.jpg")).ok).toBe(true);
    expect(st.copias).toEqual([{ themePath: "italia/a.jpg", quoteId: "q-9" }]);
    expect(st.escritas[0].key).toBe("proposal-draft:q-9");
    expect(st.escritas[0].value).toMatchObject({
      doc: { moodBoards: [{ images: ["q-9/copia-de-italia-a.jpg"] }] },
    });
  });

  /**
   * Entre a varredura e a gravação ela pode ter mexido no rascunho noutro
   * separador. Gravar o que se leu há dez segundos apagava esse trabalho — por
   * isso relê-se, e aplicam-se as trocas à versão MAIS RECENTE.
   */
  it("relê o rascunho antes de gravar, para não apagar trabalho feito entretanto", async () => {
    const original = st.rascunhos["proposal-draft:q-9"];
    st.rascunhos["proposal-draft:q-9"] = {
      ...original,
      doc: {
        moodBoards: [{ images: ["tema:italia/a.jpg"] }],
        titulo: "escrito depois da varredura",
      },
    };
    await apagarFotoDaBiblioteca("italia/a.jpg");
    expect(st.escritas[0].value).toMatchObject({
      doc: {
        moodBoards: [{ images: ["q-9/copia-de-italia-a.jpg"] }],
        titulo: "escrito depois da varredura",
      },
    });
  });
});

// ── Eliminar um tema inteiro ───────────────────────────────────────────────
describe("apagarPastaDaBiblioteca", () => {
  /**
   * Pergunta "és desta pasta?" em vez de listar a pasta e comparar caminho a
   * caminho. A listagem tinha uma janela por onde uma foto podia escapar — uma
   * página a mais, uma foto carregada entretanto —, e o preço dessa janela
   * seria uma proposta enviada a perder uma imagem.
   */
  it("põe a salvo QUALQUER foto da pasta, não uma lista fixa", async () => {
    st.propostas = [
      { id: "p-1", quoteId: "q-1", doc: { a: ["tema:italia/a.jpg", "tema:italia/zzz.jpg"] } },
      { id: "p-2", quoteId: "q-2", doc: { a: ["tema:terracotta/x.jpg"] } },
    ];
    const res = await apagarPastaDaBiblioteca("italia");
    expect(res.ok).toBe(true);
    expect(st.copias.map((c) => c.themePath).sort()).toEqual(["italia/a.jpg", "italia/zzz.jpg"]);
    expect(st.apagouPasta).toEqual(["italia"]);
  });

  it("NÃO elimina o tema quando alguma salvaguarda falha", async () => {
    st.propostas = [{ id: "p-1", quoteId: "q-1", doc: { a: ["tema:italia/a.jpg"] } }];
    st.copiaFalha.add("italia/a.jpg");
    const res = await apagarPastaDaBiblioteca("italia");
    expect(res.ok).toBe(false);
    expect(res.motivo).toBe("referencias");
    expect(st.apagouPasta).toEqual([]);
  });
});

// ── O predicado, isolado ───────────────────────────────────────────────────
describe("materializarAntesDeApagar", () => {
  it("uma proposta sem documento nenhum não é um problema", async () => {
    st.propostas = [{ id: "p-1", quoteId: "q-1" }];
    expect(await materializarAntesDeApagar(() => true)).toEqual({
      ok: true,
      copiadas: 0,
      documentos: 0,
    });
  });
});
