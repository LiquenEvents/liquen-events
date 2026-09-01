import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O AQUECIMENTO NÃO PODE FAZER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este trabalho existe para responder à pergunta dela: «mesmo nas propostas em
 * que já enviamos (…) se também vai acontecer nestas propostas que já
 * enviamos». Desenha de noite os PDF que faltam, para nenhum casal os pagar de
 * dia.
 *
 * E corre DENTRO da cópia de segurança, que é a coisa mais importante que este
 * sistema faz automaticamente. Portanto o que se guarda aqui não é sobretudo
 * que ele aqueça — é que ele saiba PARAR:
 *
 *   1. QUE NÃO COMEÇA SEM TEMPO. Um desenho cortado a meio pelo tecto da
 *      função não deixa ficheiro nenhum e gastou o tempo à mesma.
 *   2. QUE PÁRA A MEIO quando o tempo acaba, em vez de levar a função abaixo
 *      com a cópia já feita mas o registo por escrever.
 *   3. QUE NÃO REDESENHA O QUE JÁ EXISTE. É o caso normal, e se ele
 *      redesenhasse gastava as seis vagas da noite a fabricar o que já lá
 *      está.
 *   4. QUE NUNCA GUARDA UM PDF COM BURACOS. Esta é a mais importante de todas:
 *      a rota do casal serve um documento incompleto de propósito, porque a
 *      alternativa é um botão que não faz nada. Aqui a alternativa é não
 *      guardar — e um ficheiro com uma fotografia a menos GRAVADO no
 *      armazenamento fica a ser servido para sempre, mesmo depois de ela repor
 *      a foto.
 *   5. QUE UMA QUE FALHA NÃO COME O ORÇAMENTO TODAS AS NOITES, e que uma que
 *      se corrige deixa de estar marcada.
 */

const est = vi.hoisted(() => ({
  propostas: [] as unknown[],
  existentes: new Set<string>(),
  estado: null as unknown,
  gravado: null as unknown,
  desenhadas: [] as { id: string; servirIncompleto: boolean; idioma: string }[],
  rebentaEm: new Map<string, number>(),
  msPorDesenho: 0,
  agora: 0,
  esvaziou: 0,
}));

vi.mock("@/lib/proposals-store", () => ({
  listAllProposals: async () => est.propostas,
}));

vi.mock("@/lib/proposal-pdf-guardado", () => ({
  existePdfDaProposta: async (id: string, chave: string) => est.existentes.has(`${id}/${chave}`),
}));

vi.mock("@/lib/app-state", () => ({
  getState: async () => est.estado,
  setState: async (_k: string, v: unknown) => {
    est.gravado = v;
    return { gravado: true, duradouro: true, onde: "servidor" };
  },
}));

vi.mock("@/lib/proposal-pdf-cache", () => ({
  pdfDaPropostaEmCache: async (
    _doc: unknown,
    idioma: string,
    servirIncompleto: boolean,
    id: string,
  ) => {
    est.agora += est.msPorDesenho;
    est.desenhadas.push({ id, servirIncompleto, idioma });
    const emFalta = est.rebentaEm.get(id);
    if (emFalta !== undefined) {
      const erro = new Error("incompleta") as Error & { emFalta: number };
      erro.emFalta = emFalta;
      throw erro;
    }
    return Buffer.from("PDF");
  },
  esvaziarCachePdf: () => {
    est.esvaziou++;
  },
}));

/** A chave é um `sha256` do documento; aqui basta ser estável e distinta. */
vi.mock("@/lib/proposal-pdf-chave", () => ({
  chaveDoPdf: (doc: { v?: string }, idioma: string) => `k-${doc?.v ?? "x"}-${idioma}`,
}));

import {
  aquecerPdfsEmFalta,
  CHAO_MS,
  ORCAMENTO_MS,
  TECTO_POR_NOITE,
  TENTATIVAS_ATE_DESISTIR,
  ESPERA_APOS_FALHA_MS,
  CHAVE_DO_ESTADO,
  type EstadoDoAquecimento,
} from "./aquecimento-de-pdf";

/** Um relógio que só anda quando o desenho o faz andar — o tempo real desta
 *  máquina não pode decidir se um teste passa. */
function relogioParado() {
  est.agora = 1_000_000;
  vi.spyOn(Date, "now").mockImplementation(() => est.agora);
}

function proposta(id: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    doc: { v: id },
    sentAt: "2026-08-01T10:00:00.000Z",
    idioma: "pt",
    ...extra,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
  est.propostas = [];
  est.existentes = new Set();
  est.estado = null;
  est.gravado = null;
  est.desenhadas = [];
  est.rebentaEm = new Map();
  est.msPorDesenho = 0;
  est.esvaziou = 0;
  relogioParado();
});

describe("o aquecimento sabe parar", () => {
  it("não começa nada quando já não há tempo", async () => {
    est.propostas = [proposta("p1")];
    // Chegou aqui com quase todo o orçamento gasto.
    const r = await aquecerPdfsEmFalta(ORCAMENTO_MS - CHAO_MS + 1);

    expect(r.semTempo, "arrancou sem tempo para acabar um desenho").toBe(true);
    expect(est.desenhadas, "desenhou uma proposta sem tempo para a acabar").toEqual([]);
  });

  it("pára a meio quando o tempo acaba, em vez de levar a função abaixo", async () => {
    est.propostas = ["p1", "p2", "p3", "p4"].map((id) => proposta(id));
    // Cada desenho gasta quase tudo o que sobra: dá para um, não para dois.
    est.msPorDesenho = ORCAMENTO_MS - CHAO_MS + 1;
    const r = await aquecerPdfsEmFalta(0);

    expect(r.aquecidas).toBe(1);
    expect(r.semTempo, "não registou que ficou trabalho por fazer").toBe(true);
    expect(est.desenhadas).toHaveLength(1);
  });

  it("não desenha mais do que o tecto de uma noite", async () => {
    est.propostas = Array.from({ length: TECTO_POR_NOITE + 4 }, (_, i) => proposta(`p${i}`));
    const r = await aquecerPdfsEmFalta(0);

    expect(r.aquecidas).toBe(TECTO_POR_NOITE);
    expect(est.desenhadas).toHaveLength(TECTO_POR_NOITE);
  });
});

describe("o aquecimento escolhe bem o que faz", () => {
  it("não redesenha o que já está guardado", async () => {
    est.propostas = [proposta("p1"), proposta("p2")];
    est.existentes.add("p1/k-p1-pt");
    const r = await aquecerPdfsEmFalta(0);

    expect(r.jaTinham).toBe(1);
    expect(
      est.desenhadas.map((d) => d.id),
      "redesenhou um ficheiro que já existia",
    ).toEqual(["p2"]);
  });

  it("só olha para propostas que seguiram para um casal e têm documento", async () => {
    est.propostas = [
      proposta("enviada"),
      proposta("por-enviar", { sentAt: null }),
      proposta("de-linhas", { doc: undefined }),
    ];
    await aquecerPdfsEmFalta(0);

    expect(est.desenhadas.map((d) => d.id)).toEqual(["enviada"]);
  });

  it("começa pelas mais recentes, que são as que ainda se abrem", async () => {
    est.propostas = [
      proposta("velha", { sentAt: "2024-01-01T00:00:00.000Z" }),
      proposta("nova", { sentAt: "2026-08-30T00:00:00.000Z" }),
      proposta("meio", { sentAt: "2025-06-01T00:00:00.000Z" }),
    ];
    est.msPorDesenho = ORCAMENTO_MS - CHAO_MS + 1; // só dá para uma
    await aquecerPdfsEmFalta(0);

    expect(est.desenhadas.map((d) => d.id)).toEqual(["nova"]);
  });

  it("desenha na língua em que a proposta foi feita", async () => {
    est.propostas = [proposta("ingles", { idioma: "en" })];
    await aquecerPdfsEmFalta(0);

    expect(est.desenhadas[0]?.idioma).toBe("en");
  });
});

describe("um PDF com buracos não fica guardado", () => {
  /**
   * A regra que mais importa neste ficheiro.
   *
   * A rota do casal chama isto com `servirIncompleto = true` de propósito:
   * entre um botão que não faz nada e um documento sem uma fotografia, dá-se o
   * documento. Aqui é o contrário — o que este trabalho faz é GRAVAR, e um
   * ficheiro com um buraco gravado no armazenamento passa a ser servido a
   * todos os casais para sempre, mesmo depois de ela repor a foto.
   */
  it("pede o documento COMPLETO, e nunca o de recurso", async () => {
    est.propostas = [proposta("p1")];
    await aquecerPdfsEmFalta(0);

    expect(
      est.desenhadas[0]?.servirIncompleto,
      "o aquecimento passou a gravar documentos incompletos",
    ).toBe(false);
  });

  it("uma proposta a que falta uma foto não fica gravada — fica anotada", async () => {
    est.propostas = [proposta("p1")];
    est.rebentaEm.set("p1", 4);
    const r = await aquecerPdfsEmFalta(0);

    expect(r.aquecidas).toBe(0);
    expect(r.incompletas).toBe(1);
    const guardado = est.gravado as EstadoDoAquecimento;
    expect(guardado.falhadas["p1"]?.emFalta).toBe(4);
    expect(guardado.falhadas["p1"]?.tentativas).toBe(1);
  });
});

describe("a memória das que falharam", () => {
  it("uma que falhou há pouco não gasta o orçamento das outras", async () => {
    est.propostas = [proposta("falhada"), proposta("boa")];
    est.estado = {
      falhadas: {
        falhada: { emFalta: 2, tentadaEm: new Date(est.agora - 1000).toISOString(), tentativas: 1 },
      },
    };
    const r = await aquecerPdfsEmFalta(0);

    expect(r.adiadas).toBe(1);
    expect(est.desenhadas.map((d) => d.id)).toEqual(["boa"]);
  });

  it("mas volta a tentar passada a espera", async () => {
    est.propostas = [proposta("falhada")];
    est.estado = {
      falhadas: {
        falhada: {
          emFalta: 2,
          tentadaEm: new Date(est.agora - ESPERA_APOS_FALHA_MS - 1000).toISOString(),
          tentativas: 1,
        },
      },
    };
    await aquecerPdfsEmFalta(0);

    expect(est.desenhadas.map((d) => d.id)).toEqual(["falhada"]);
  });

  it("ao fim de três tentativas deixa de se tentar", async () => {
    // Uma foto que não está no armazenamento não se resolve sozinha: resolve-se
    // no estúdio, e aí a chave muda e isto volta a ser uma proposta nova.
    est.propostas = [proposta("teimosa")];
    est.estado = {
      falhadas: {
        teimosa: {
          emFalta: 2,
          tentadaEm: new Date(est.agora - ESPERA_APOS_FALHA_MS - 1000).toISOString(),
          tentativas: TENTATIVAS_ATE_DESISTIR,
        },
      },
    };
    await aquecerPdfsEmFalta(0);

    expect(est.desenhadas).toEqual([]);
  });

  it("uma que se corrigiu deixa de estar marcada", async () => {
    est.propostas = [proposta("curada")];
    est.estado = {
      falhadas: {
        curada: {
          emFalta: 2,
          tentadaEm: new Date(est.agora - ESPERA_APOS_FALHA_MS - 1000).toISOString(),
          tentativas: 1,
        },
      },
    };
    await aquecerPdfsEmFalta(0);

    const guardado = est.gravado as EstadoDoAquecimento;
    expect(guardado.falhadas["curada"], "ficou marcada por uma falha que já não existe").toBe(
      undefined,
    );
  });

  it("e a que já estava guardada também se desmarca, sem se desenhar", async () => {
    est.propostas = [proposta("curada")];
    est.existentes.add("curada/k-curada-pt");
    est.estado = {
      falhadas: {
        curada: { emFalta: 2, tentadaEm: new Date(est.agora).toISOString(), tentativas: 1 },
      },
    };
    await aquecerPdfsEmFalta(0);

    expect(est.desenhadas).toEqual([]);
    expect((est.gravado as EstadoDoAquecimento).falhadas["curada"]).toBe(undefined);
  });
});

describe("o que fica para trás quando acaba", () => {
  it("larga os PDF que desenhou, em vez de os deixar na memória do contentor", async () => {
    // Seis ficheiros de vários megabytes num processo cujo trabalho acabou. O
    // que interessa ficou no armazenamento.
    est.propostas = [proposta("p1")];
    await aquecerPdfsEmFalta(0);

    expect(est.esvaziou, "os PDF desenhados ficaram retidos na memória").toBe(1);
  });

  it("uma noite sem nada a fazer não escreve nada", async () => {
    est.propostas = [proposta("p1")];
    est.existentes.add("p1/k-p1-pt");
    await aquecerPdfsEmFalta(0);

    expect(est.gravado, "escreveu estado numa noite em que nada mudou").toBe(null);
    expect(est.esvaziou).toBe(0);
  });

  it("uma base que não responde não leva a cópia de segurança abaixo", async () => {
    // Isto corre DEPOIS de a cópia ter seguido. Trocar uma cópia
    // bem-sucedida por um 500 por causa do aquecimento seria vender o
    // essencial pelo acessório.
    est.propostas = [proposta("p1")];
    const { aquecerPdfsEmFalta: comFalha } = await import("./aquecimento-de-pdf");
    vi.doMock("@/lib/proposals-store", () => ({
      listAllProposals: async () => {
        throw new Error("a base não responde");
      },
    }));
    await expect(comFalha(0)).resolves.toBeTruthy();
  });

  it("a chave do estado é a mesma que ficou escrita", () => {
    // Se alguém lhe mudar o nome, a memória das falhas começa do zero em
    // silêncio e as propostas partidas voltam a comer o orçamento todo.
    expect(CHAVE_DO_ESTADO).toBe("aquecimento-pdf:estado");
  });
});
