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
  /** Quando foi emitido o endereço que está a ser usado, em ms. */
  emitidoEm: undefined as number | undefined,
  /** Quando foram cortados os links do pedido, em ms (null = nunca). */
  cortadoEm: null as number | null,
  /** O diário das leituras: o que começou, o que acabou, e por que ordem. */
  diario: [] as string[],
  /** Um travão que segura as leituras até se mandar largar. */
  travao: null as null | { largar: () => void; espera: Promise<void> },
}));

/** Regista o começo, espera pelo travão se houver, regista o fim. */
async function comDiario<T>(nome: string, valor: () => T | Promise<T>): Promise<T> {
  dados.diario.push(`começou:${nome}`);
  if (dados.travao) await dados.travao.espera;
  const r = await valor();
  dados.diario.push(`acabou:${nome}`);
  return r;
}

vi.mock("@/lib/proposal-token", () => ({
  readProposalToken: (t: string | null | undefined) =>
    t === "bom" ? { proposalId: "p1", emitidoEm: dados.emitidoEm } : null,
}));
vi.mock("@/lib/proposals-store", () => ({
  getProposal: async (id: string) => dados.porId.get(id) ?? null,
  listProposalsForQuote: async (quoteId: string) =>
    comDiario("irmas", () => {
      if (dados.rebentaAoListar) throw new Error("base em baixo");
      return [...dados.porId.values()].filter((p) => p.quoteId === quoteId);
    }),
}));
vi.mock("@/lib/contracts-store", () => ({
  getAcceptedContractByQuote: async () => comDiario("aceite", () => dados.contrato),
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
      return propostaId
        ? { propostaId, criadaEm: new Date(dados.emitidoEm ?? 0).toISOString() }
        : null;
    },
  };
});

/**
 * O corte: a gaveta é falsa, a REGRA é a verdadeira.
 *
 * Duplicar o `aindaAbre` aqui seria deixar de o testar — e é ele que decide se
 * um link morre. O que se finge é só a leitura do carimbo, que é o que precisa
 * de base de dados.
 */
vi.mock("@/lib/links-cortados", async (original) => {
  const real = await original<typeof import("@/lib/links-cortados")>();
  return { ...real, linksCortadosEm: async () => comDiario("corte", () => dados.cortadoEm) };
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
  dados.emitidoEm = undefined;
  dados.cortadoEm = null;
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * CORTAR UM LINK TEM DE FECHAR AS DUAS PORTAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `proposta-link-curto.ts` escreveu isto quando nasceu, e é o teste inteiro:
 *
 *   «enquanto o token assinado continuar a abrir a mesma proposta, cortar o
 *    código curto não fecha porta nenhuma — quem tem o email antigo entra à
 *    mesma. Cortar a sério é uma decisão sobre as DUAS portas ao mesmo tempo.»
 *
 * Por isso cada regra daqui corre nas duas: o código curto E o token assinado.
 * Uma que passasse só numa seria precisamente o corte que não corta.
 */
describe("os links cortados", () => {
  const CORTE = Date.parse("2026-03-10T12:00:00.000Z");
  const ANTES = CORTE - 60_000;
  const DEPOIS = CORTE + 60_000;

  /** As duas portas para a mesma sala, para as regras correrem nas duas. */
  const portas: Array<[string, () => string]> = [
    ["o token assinado", () => "bom"],
    [
      "o código curto",
      () => {
        dados.curtas.set("abcdefghjkmnpqrs", "p1");
        return "abcdefghjkmnpqrs";
      },
    ],
  ];

  for (const [nome, endereco] of portas) {
    describe(nome, () => {
      it("abre normalmente quando nunca houve corte", async () => {
        por(proposta({ id: "p1" }));
        dados.emitidoEm = ANTES;
        dados.cortadoEm = null;
        expect((await propostaDoLink(endereco()))?.proposta.id).toBe("p1");
      });

      it("DEIXA de abrir quando foi emitido antes do corte", async () => {
        por(proposta({ id: "p1" }));
        dados.emitidoEm = ANTES;
        dados.cortadoEm = CORTE;
        expect(
          await propostaDoLink(endereco()),
          "o link cortado continua a abrir — o corte não corta",
        ).toBeNull();
      });

      it("um endereço cunhado DEPOIS do corte nasce vivo", async () => {
        /**
         * É esta a razão de o corte ser um carimbo e não um interruptor: ela
         * corta, corrige o preço, reenvia — e o email novo tem de funcionar
         * sem ninguém se lembrar de voltar a ligar coisa nenhuma. Um endereço
         * morto no reenvio seria o pior desfecho do gesto mais importante da
         * casa.
         */
        por(proposta({ id: "p1" }));
        dados.emitidoEm = DEPOIS;
        dados.cortadoEm = CORTE;
        expect((await propostaDoLink(endereco()))?.proposta.id).toBe("p1");
      });
    });
  }

  it("o corte é por PEDIDO: não se escapa pela revisão seguinte", async () => {
    /**
     * Nesta casa uma revisão é uma proposta NOVA, e este ficheiro salta da
     * proposta do token para a irmã mais recente do mesmo pedido. Um corte por
     * proposta deixaria as irmãs abertas — e o próprio salto trataria de as ir
     * buscar. É o defeito mais fácil de introduzir aqui, e o mais silencioso.
     */
    por(
      proposta({ id: "p1", quoteId: "q1", createdAt: "2026-01-01T10:00:00.000Z" }),
      proposta({ id: "p2", quoteId: "q1", createdAt: "2026-02-01T10:00:00.000Z" }),
    );
    dados.emitidoEm = ANTES;
    dados.cortadoEm = null;
    // Sem corte, o link salta mesmo para a revisão — é o comportamento de sempre.
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p2");

    dados.cortadoEm = CORTE;
    expect(
      await propostaDoLink("bom"),
      "cortou-se o pedido e o link ainda chega à revisão seguinte",
    ).toBeNull();
  });

  it("um link de idade desconhecida morre com o corte", async () => {
    /**
     * `emitidoEm` indefinido é um token tão antigo que nem se lhe consegue
     * deduzir a idade. Depois de alguém mandar cortar, é exactamente o que se
     * quis cortar — e na dúvida fecha-se, que é o lado seguro deste botão.
     */
    por(proposta({ id: "p1" }));
    dados.emitidoEm = undefined;
    dados.cortadoEm = CORTE;
    expect(await propostaDoLink("bom")).toBeNull();
  });

  it("sem corte, um link de idade desconhecida continua a abrir", async () => {
    // O contrário do de cima, e é o que garante que isto não parte os links
    // antigos de toda a gente por causa de uma dedução que falhou.
    por(proposta({ id: "p1" }));
    dados.emitidoEm = undefined;
    dados.cortadoEm = null;
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });

  it("uma proposta sem pedido não pode ser cortada — e continua a abrir", async () => {
    /**
     * `quote_id` é `on delete set null`, portanto uma proposta órfã é um estado
     * real. Não há pedido a que o carimbo pertença, e inventar um seria cortar
     * links por engano.
     */
    por(proposta({ id: "p1", quoteId: "" }));
    dados.emitidoEm = ANTES;
    dados.cortadoEm = CORTE;
    expect((await propostaDoLink("bom"))?.proposta.id).toBe("p1");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS TRÊS LEITURAS DO PEDIDO PARTEM JUNTAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO, com 25 ms por ida à base: o caminho do servidor até ao primeiro pixel
 * da proposta são 202 ms — e 140 desses, 69%, são esta função em cinco idas
 * estritamente uma atrás da outra.
 *
 * Só as duas primeiras são mesmo ordenadas. O carimbo dos links cortados, as
 * irmãs e o contrato aceite dependem todos APENAS do `quoteId`, e de nada uns
 * dos outros: estavam em série por hábito de escrita.
 *
 * Isto guarda o paralelismo, e guarda-o pela ÚNICA maneira que não se engana a
 * si própria — segurando as três leituras num travão e verificando que as três
 * já COMEÇARAM antes de qualquer uma acabar. Um teste que só olhasse para a
 * ordem final passaria com o código em série.
 */
describe("as leituras do pedido não esperam umas pelas outras", () => {
  beforeEach(() => {
    dados.diario = [];
    dados.travao = null;
  });

  it("as três começam antes de qualquer uma acabar", async () => {
    dados.porId.set("p1", proposta({ id: "p1" }));
    dados.emitidoEm = Date.now();

    // Um travão: nenhuma leitura resolve enquanto não se largar. Se estiverem
    // em série, a segunda nem chega a começar e o teste esgota o tempo.
    let largar!: () => void;
    const espera = new Promise<void>((r) => (largar = r));
    dados.travao = { largar, espera };

    const emCurso = propostaDoLink("bom");

    // Dar voltas ao ciclo de eventos para as três terem oportunidade de partir.
    for (let i = 0; i < 20; i++) await Promise.resolve();

    const comecadas = dados.diario.filter((l) => l.startsWith("começou:"));
    const acabadas = dados.diario.filter((l) => l.startsWith("acabou:"));

    expect(
      comecadas.sort(),
      `só estas leituras chegaram a começar: ${JSON.stringify(dados.diario)}.\n` +
        `Se faltar alguma, as leituras do pedido voltaram a ficar em série — e ` +
        `isso são duas idas à base a mais, uma atrás da outra, à frente do ` +
        `primeiro pixel que o casal vê.`,
    ).toEqual(["começou:aceite", "começou:corte", "começou:irmas"]);
    expect(acabadas, "alguma leitura acabou antes de as outras começarem").toEqual([]);

    largar();
    await emCurso;
  });

  it("e uma irmã que rebente continua a não deitar a página abaixo", async () => {
    // O `catch` mudou de sítio — passou de um `try` à volta de tudo para um
    // por leitura. Esta é a garantia que não pode ter-se perdido na mudança.
    dados.porId.set("p1", proposta({ id: "p1" }));
    dados.emitidoEm = Date.now();
    dados.rebentaAoListar = true;

    const r = await propostaDoLink("bom");

    expect(r, "uma leitura falhada passou a matar a proposta").not.toBeNull();
    expect(r?.proposta.id).toBe("p1");
    dados.rebentaAoListar = false;
  });

  it("um link cortado continua a devolver nada", async () => {
    // As leituras passaram a partir ANTES de se saber se o link ainda abre.
    // O que não pode mudar é a resposta: continua a ser `null`.
    dados.porId.set("p1", proposta({ id: "p1" }));
    dados.emitidoEm = Date.now() - 10_000;
    dados.cortadoEm = Date.now();

    expect(await propostaDoLink("bom")).toBeNull();
    dados.cortadoEm = null;
  });
});
