import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Proposal } from "@/lib/orcamento/types";
import type { Contract } from "@/lib/contract-types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LINK DO CASAL SEGUE O PEDIDO — E SÓ QUANDO PODE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ver o cabeçalho de `proposta-do-link.ts`. Duas metades, e as duas contam:
 * a revisão que ela envia TEM de chegar pelo link que o casal já tem, e um
 * rascunho a meio de ser escrito NÃO pode aparecer lá.
 */

const dados = vi.hoisted(() => ({
  porId: new Map<string, Proposal>(),
  contrato: null as Contract | null,
  rebentaAoListar: false,
  /** Código curto → proposta, a gaveta do lado do servidor. */
  curtas: new Map<string, string>(),
}));

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: (t: string | null | undefined) => (t === "bom" ? { proposalId: "p1" } : null),
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: async (id: string) => dados.porId.get(id) ?? null,
  listProposalsForQuote: async (quoteId: string) => {
    if (dados.rebentaAoListar) throw new Error("base em baixo");
    return [...dados.porId.values()].filter((p) => p.quoteId === quoteId);
  },
}));
vi.mock("@/lib/contracts-store", () => ({
  getAcceptedContractByQuote: async () => dados.contrato,
}));
/**
 * A gaveta dos endereços curtos. O `pareceCodigoCurto` é o VERDADEIRO de
 * propósito: é ele que separa as duas portas, e um duplo aqui deixava passar o
 * defeito em que um token era confundido com um código (ou o contrário).
 */
vi.mock("@/lib/proposta-link-curto", async (original) => {
  const real = await original<typeof import("@/lib/proposta-link-curto")>();
  return {
    ...real,
    lerLigacaoCurta: async (codigo: string) => {
      const propostaId = dados.curtas.get(codigo);
      return propostaId ? { propostaId } : null;
    },
  };
});

const { propostaDoLink } = await import("./proposta-do-link");

function proposta(over: Partial<Proposal> & { id: string }): Proposal {
  return {
    quoteId: "q1",
    clientName: "Maria",
    clientEmail: "maria@example.com",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 1000,
    vat: 230,
    total: 1230,
    status: "enviada",
    createdAt: "2026-01-01T10:00:00.000Z",
    ...over,
  } as Proposal;
}

function por(...ps: Proposal[]) {
  dados.porId.clear();
  for (const p of ps) dados.porId.set(p.id, p);
}

beforeEach(() => {
  dados.porId.clear();
  dados.contrato = null;
  dados.rebentaAoListar = false;
});

describe("propostaDoLink", () => {
  it("um token que não vale não abre nada", async () => {
    por(proposta({ id: "p1" }));
    expect(await propostaDoLink("mau")).toBe(null);
  });

  it("uma proposta apagada não abre nada", async () => {
    expect(await propostaDoLink("bom")).toBe(null);
  });

  it("sem revisões, mostra a proposta do token", async () => {
    por(proposta({ id: "p1" }));
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p1");
    expect(r?.seguiu).toBe(false);
  });

  it("com uma revisão enviada, o link antigo mostra a NOVA", async () => {
    por(
      proposta({ id: "p1", total: 1230 }),
      proposta({ id: "p2", total: 2000, createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p2");
    expect(r?.proposta.total).toBe(2000);
    expect(r?.seguiu).toBe(true);
    // A proposta para que o token foi emitido continua a saber-se.
    expect(r?.doToken.id).toBe("p1");
  });

  it("entre duas revisões, mostra a mais recente", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({ id: "p2", createdAt: "2026-02-01T10:00:00.000Z" }),
      proposta({ id: "p3", createdAt: "2026-03-01T10:00:00.000Z" }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p3");
  });
});

describe("o que ela ainda não enviou não existe do lado de lá", () => {
  it("um RASCUNHO de revisão nunca aparece ao casal", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({
        id: "p2",
        status: "rascunho",
        total: 9999,
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p1");
    expect(r?.seguiu).toBe(false);
  });

  it("uma proposta MAIS ANTIGA não substitui a do token", async () => {
    por(
      proposta({ id: "p1", createdAt: "2026-02-01T10:00:00.000Z" }),
      proposta({ id: "p2", createdAt: "2026-01-01T10:00:00.000Z" }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });
});

describe("as guardas que impedem o salto de virar um buraco", () => {
  it("outro PEDIDO nunca entra", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({ id: "p2", quoteId: "q2", createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });

  it("outro CLIENTE no mesmo pedido nunca entra", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({
        id: "p2",
        clientEmail: "outro@example.com",
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });

  it("email vazio não emparelha com email vazio", async () => {
    por(
      proposta({ id: "p1", clientEmail: "" }),
      proposta({ id: "p2", clientEmail: "", createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });

  it("`quoteId` vazio não emparelha com `quoteId` vazio", async () => {
    // `proposals.quote_id` é `on delete set null` — vazio é um estado REAL.
    por(
      proposta({ id: "p1", quoteId: "" }),
      proposta({ id: "p2", quoteId: "", createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });

  it("o email compara-se sem maiúsculas nem espaços", async () => {
    por(
      proposta({ id: "p1", clientEmail: "Maria@Example.com " }),
      proposta({
        id: "p2",
        clientEmail: "maria@example.com",
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p2");
  });

  it("uma leitura que falhe não deita a página abaixo — fica-se na do token", async () => {
    por(proposta({ id: "p1" }));
    dados.rebentaAoListar = true;
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p1");
    expect(r?.seguiu).toBe(false);
  });
});

describe("o aceite manda em tudo", () => {
  const aceite = (proposalId: string): Contract =>
    ({ id: "c1", quoteId: "q1", proposalId, status: "aceite" }) as Contract;

  it("havendo aceite, mostra-se a proposta ACEITE e não a mais recente", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({ id: "p2", total: 9999, createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    dados.contrato = aceite("p1");
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p1");
  });

  it("o aceite pode estar numa proposta que não é a do token", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({ id: "p2", total: 2000, createdAt: "2026-02-01T10:00:00.000Z" }),
      proposta({ id: "p3", total: 3000, createdAt: "2026-03-01T10:00:00.000Z" }),
    );
    dados.contrato = aceite("p2");
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p2");
  });

  it("um contrato mal ligado a outro cliente não revela nada", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({
        id: "p2",
        clientEmail: "outro@example.com",
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    dados.contrato = aceite("p2");
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });
});

describe("a versão que vem no resultado", () => {
  it("traz o número e a data gravados na proposta mostrada", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({
        id: "p2",
        versaoNumero: 2,
        versaoSelo: "a".repeat(64),
        versaoEm: "2026-02-01T10:00:00.000Z",
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    const r = await propostaDoLink("bom");
    expect(r?.versao).toBe(2);
    expect(r?.versaoEm).toBe("2026-02-01T10:00:00.000Z");
    expect(r?.selo).toBe("a".repeat(64));
  });

  it("uma proposta anterior às colunas de versão ganha um selo calculado", async () => {
    por(proposta({ id: "p1" }));
    const r = await propostaDoLink("bom");
    expect(r?.versao).toBeUndefined();
    expect(r?.selo).toMatch(/^[0-9a-f]{64}$/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O QUE FOI ACEITE FICA CONGELADO. O QUE MUDAR DEPOIS É UMA VERSÃO NOVA.»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A comparação faz-se entre o selo ACEITE — o do contrato, ou, num contrato
 * anterior a essa coluna, o da própria linha aceite, que nunca é reescrita — e
 * o selo do documento VIVO. Nada disto é adivinhado, e é essa a exigência: um
 * aviso adivinhado sobre dinheiro é pior do que aviso nenhum.
 */
describe("o estado da versão em relação ao aceite", () => {
  const aceiteCom = (proposalId: string, selo?: string, numero?: number): Contract =>
    ({
      id: "c1",
      quoteId: "q1",
      proposalId,
      status: "aceite",
      ...(selo ? { propostaVersaoSelo: selo } : {}),
      ...(numero ? { propostaVersaoNumero: numero } : {}),
    }) as Contract;

  const SELO_1 = "1".repeat(64);
  const SELO_2 = "2".repeat(64);

  it("sem aceite nenhum, está «por-aceitar»", async () => {
    por(proposta({ id: "p1", versaoSelo: SELO_1, versaoNumero: 1 }));
    expect((await propostaDoLink("bom"))?.estado).toBe("por-aceitar");
  });

  it("com aceite e nada mexido desde então, está «em-vigor»", async () => {
    por(proposta({ id: "p1", versaoSelo: SELO_1, versaoNumero: 1 }));
    dados.contrato = aceiteCom("p1", SELO_1, 1);
    expect((await propostaDoLink("bom"))?.estado).toBe("em-vigor");
  });

  it("revista depois do sim: mostra-se o ACEITE e diz-se «revista»", async () => {
    por(
      proposta({ id: "p1", total: 1230, versaoSelo: SELO_1, versaoNumero: 1 }),
      proposta({
        id: "p2",
        total: 9999,
        versaoSelo: SELO_2,
        versaoNumero: 2,
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    dados.contrato = aceiteCom("p1", SELO_1, 1);
    const r = await propostaDoLink("bom");
    // O casal continua a ver o que aceitou — o congelamento.
    expect(r?.proposta.id).toBe("p1");
    expect(r?.proposta.total).toBe(1230);
    expect(r?.versao).toBe(1);
    // …e sabe-se que existe uma 2 por aceitar.
    expect(r?.estado).toBe("revista");
    expect(r?.versaoVivaNumero).toBe(2);
  });

  it("num contrato anterior à coluna, o selo vem da própria proposta aceite", async () => {
    por(
      proposta({ id: "p1", versaoSelo: SELO_1 }),
      proposta({ id: "p2", versaoSelo: SELO_2, createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    // Sem `propostaVersaoSelo`: o contrato é anterior a esta coluna. O selo
    // cai para o da PRÓPRIA proposta aceite — e isso não é adivinhar: uma
    // revisão é uma proposta nova, logo a linha aceite nunca é reescrita e o
    // selo que ela traz é, por construção, o que foi aceite.
    dados.contrato = aceiteCom("p1");
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p1");
    expect(r?.estado).toBe("revista");
  });

  it("um RASCUNHO de revisão não faz a proposta aceite parecer revista", async () => {
    por(
      proposta({ id: "p1", versaoSelo: SELO_1, versaoNumero: 1 }),
      proposta({
        id: "p2",
        status: "rascunho",
        versaoSelo: SELO_2,
        versaoNumero: 2,
        createdAt: "2026-02-01T10:00:00.000Z",
      }),
    );
    dados.contrato = aceiteCom("p1", SELO_1, 1);
    const r = await propostaDoLink("bom");
    expect(r?.estado).toBe("em-vigor");
    expect(r?.versaoVivaNumero).toBe(1);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O LINK MOSTRA SEMPRE A PROPOSTA — NÃO UM RESUMO DE PREÇO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num email real enviado a uma cliente: o anexo era a proposta de 15
 * páginas, com mood boards, e o link ao lado abria uma página com a saudação, o
 * subtotal, o IVA, o total e os contactos. Sem Apresentação, sem Serviços, sem
 * Inspiração, sem Condições, e sem o botão «Ver a proposta completa (PDF)».
 *
 * A página não tem defeito nenhum: desenha o documento inteiro quando
 * `proposal.doc` existe, e o botão do PDF está na mesma condição. O que estava
 * errado era ESTA escolha — saltava para a irmã mais recente por data, e uma
 * proposta do construtor de linhas do back office não tem documento nenhum.
 */
describe("o salto para a versão nova não pode perder o documento", () => {
  const comDoc = { ref: "PO", clientNames: "Maria & João" } as unknown as Proposal["doc"];

  it("uma revisão mais recente SEM documento não desloca a que o tem", () => {
    por(
      proposta({ id: "p1", doc: comDoc }),
      // Uma proposta de linhas, criada depois para o mesmo pedido.
      proposta({ id: "p2", createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    return propostaDoLink("bom").then((r) => {
      expect(r?.proposta.id).toBe("p1");
      expect(r?.proposta.doc).toBeTruthy();
      expect(r?.seguiu).toBe(false);
    });
  });

  it("mas uma revisão mais recente COM documento desloca, como sempre", async () => {
    por(
      proposta({ id: "p1", doc: comDoc }),
      proposta({ id: "p2", doc: comDoc, createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p2");
    expect(r?.seguiu).toBe(true);
  });

  it("quando NENHUMA tem documento, a mais recente manda — as duas desenham-se igual", async () => {
    por(proposta({ id: "p1" }), proposta({ id: "p2", createdAt: "2026-02-01T10:00:00.000Z" }));
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p2");
  });

  it("a do token sem documento salta para uma mais recente que o tenha", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({ id: "p2", doc: comDoc, createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    const r = await propostaDoLink("bom");
    expect(r?.proposta.id).toBe("p2");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DUAS PORTAS PARA A MESMA SALA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os links novos levam um código de 16 caracteres; os que já foram enviados
 * levam o token assinado, e estão em caixas de correio de gente a sério. Os
 * dois têm de abrir — e é a FORMA que os distingue, sem ambiguidade possível.
 */
describe("o endereço curto abre a mesma proposta que o token", () => {
  /** Um código com a forma certa: 16 símbolos do alfabeto de Crockford. */
  const CODIGO = "k3m7p9q2rstv4wxy";

  beforeEach(() => dados.curtas.clear());

  it("um código curto conhecido abre a proposta", async () => {
    por(proposta({ id: "p1" }));
    dados.curtas.set(CODIGO, "p1");
    expect((await propostaDoLink(CODIGO))?.proposta.id).toBe("p1");
  });

  it("e segue as MESMAS regras — salta para a revisão mais recente", async () => {
    por(
      proposta({ id: "p1" }),
      proposta({ id: "p2", createdAt: "2026-02-01T10:00:00.000Z", doc: {} as never }),
    );
    dados.curtas.set(CODIGO, "p1");
    // Nada de um caminho paralelo com regras próprias: a porta muda, a sala é
    // a mesma.
    expect((await propostaDoLink(CODIGO))?.proposta.id).toBe("p2");
  });

  it("um código que ninguém emitiu não abre nada", async () => {
    por(proposta({ id: "p1" }));
    expect(await propostaDoLink(CODIGO)).toBe(null);
  });

  it("o token dos links JÁ ENVIADOS continua a abrir", async () => {
    por(proposta({ id: "p1" }));
    // Controlo positivo do que não pode partir: há emails lá fora com isto.
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });

  it("um endereço que não é nem uma coisa nem outra não abre", async () => {
    por(proposta({ id: "p1" }));
    expect(await propostaDoLink("mau")).toBe(null);
    expect(await propostaDoLink("")).toBe(null);
    expect(await propostaDoLink(undefined)).toBe(null);
  });
});
