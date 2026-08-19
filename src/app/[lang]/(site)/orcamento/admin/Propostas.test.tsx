// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Propostas from "./Propostas";

/**
 * UMA LINHA MÁ NÃO PODE DERRUBAR O ECRÃ TODO.
 *
 * A lista pintava a etiqueta de estado com `STATUS_META[p.status].color`. Basta
 * uma proposta gravada com um estado fora do mapa para isso ser `undefined` — e
 * como este é um componente de cliente, o erro sobe ao limite de erro e
 * substitui o BACK OFFICE INTEIRO pelo ecrã "Ocorreu um erro inesperado".
 *
 * Apanhou-se com uma linha gravada como `recusada` em vez de `rejeitada`: o
 * mapa usa `rejeitada` e mostra "Recusada" como etiqueta, por isso a troca é
 * fácil de fazer à mão na base de dados. A API valida os estados, portanto pelo
 * uso normal não acontece — acontece com dados antigos, uma migração, ou uma
 * correcção feita directamente na base de dados, que é exactamente quando ela
 * menos pode dar-se ao luxo de perder o ecrã.
 */

const proposals = [
  {
    id: "p-boa",
    quoteId: "q1",
    clientName: "Cliente Correcto",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 1000,
    vat: 230,
    total: 1230,
    status: "aceite",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  {
    id: "p-ma",
    quoteId: "q2",
    clientName: "Cliente Estado Estranho",
    clientEmail: "c@d.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 2000,
    vat: 460,
    total: 2460,
    // Fora do mapa: é este valor que rebentava a lista inteira.
    status: "recusada",
    createdAt: "2026-01-02T00:00:00.000Z",
  },
];

/** Resposta mínima que o `useCachedList` sabe ler: além do corpo, ele consulta
 *  o estado (304 = nada mudou) e o cabeçalho ETag. Sem `headers` o carregamento
 *  rebentava e a lista nunca chegava a desenhar-se. */
const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"teste"' }),
  json: async () => body,
});

beforeEach(() => {
  // A cache do `useCachedList` vive no MÓDULO e sobreviveria de um teste para o
  // outro — cada um tem de começar da mesma folha.
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      String(url).startsWith("/api/propostas") ? response(proposals) : response([]),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Propostas — estado fora do mapa", () => {
  it("desenha a lista toda, incluindo a linha com estado desconhecido", async () => {
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );

    // A linha boa aparece...
    await waitFor(() => expect(screen.getByText("Cliente Correcto")).toBeTruthy());
    // ...e a linha má TAMBÉM: nada rebentou, o ecrã não se perdeu.
    expect(screen.getByText("Cliente Estado Estranho")).toBeTruthy();
  });

  it("mostra o valor cru do estado desconhecido, para ela ver que aquela linha tem algo estranho", async () => {
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );

    await waitFor(() => expect(screen.getByText("Cliente Estado Estranho")).toBeTruthy());
    // Sem inventar uma etiqueta bonita nem esconder o problema.
    expect(screen.getByText("recusada")).toBeTruthy();
  });
});

/**
 * A MESMA LISTA EM DUAS FORMAS.
 *
 * O que aqui se guarda não é o aspecto: é que a informação que decide — cliente,
 * estado, validade, valor — está presente nas DUAS, e que nenhuma acção
 * desaparece por não haver rato.
 */
function simularAparelho(largura: number, toque: boolean) {
  vi.stubGlobal("matchMedia", (mq: string) => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("hover: hover")
        ? !toque
        : mq.includes("pointer: coarse")
          ? toque
          : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

describe("Propostas — a lista muda de forma", () => {
  it("no computador é uma tabela ordenável", async () => {
    simularAparelho(1440, false);
    render(
      <ToastProvider>
        <Propostas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole("table", { name: "Propostas" })).toBeTruthy());
    // Ordenar pelo valor é o que uma tabela faz e um cartão não: é por isso que
    // a tabela existe no ecrã grande.
    expect(screen.getByRole("button", { name: /Valor/ })).toBeTruthy();
  });

  it("no telemóvel são cartões — e não uma tabela apertada", async () => {
    simularAparelho(375, true);
    render(
      <ToastProvider>
        <Propostas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole("list", { name: "Propostas" })).toBeTruthy());
    expect(screen.queryByRole("table")).toBeNull();
    // O que decide continua lá: quem é, e quanto.
    expect(screen.getByText("Cliente Correcto")).toBeTruthy();
  });

  /**
   * Num ecrã táctil, uma acção escondida no hover não existe.
   *
   * A pergunta deixou de ser feita em JavaScript e passou a ser feita em CSS
   * (`com-rato:`, globals.css) — o hook lia `false` no servidor e o computador
   * piscava. Isso muda o que este teste pode afirmar: o jsdom não avalia media
   * queries sobre classes, portanto o que se verifica é o CONTRATO das classes.
   *
   * `opacity-0` NU é o que estava errado: é visível por omissão que o menu tem
   * de ser. `com-rato:opacity-0` contém a cadeia "opacity-0", por isso a
   * asserção tem de olhar para a palavra inteira e não para um pedaço dela —
   * um `toContain` simples passava dos dois lados e não guardava nada.
   */
  it("as acções continuam alcançáveis sem rato", async () => {
    simularAparelho(375, true);
    render(
      <ToastProvider>
        <Propostas />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByText("Cliente Correcto")).toBeTruthy());
    const menu = screen.getByRole("button", { name: "Acções de Cliente Correcto" });
    const classes = menu.className.split(/\s+/);
    expect(classes).toContain("opacity-100");
    expect(classes).not.toContain("opacity-0");
    // E o esconderijo do computador continua lá, atrás do PONTEIRO e não da
    // largura: sem isto, "sempre visível" também passaria por regressão.
    expect(classes).toContain("com-rato:opacity-0");
    expect(classes).toContain("com-rato:group-hover:opacity-100");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ACEITAR UMA PROPOSTA NÃO PODE APAGAR O HISTÓRICO DO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ao aceitar, o pedido associado passa a "Aceite" com uma linha no histórico.
 * Isso ia como `activityLog: [...tudo o que este ecrã tinha, entrada]` — e o
 * que este ecrã tem são os `quotes` que o pai carregou quando o back office
 * abriu. Entre a manhã e o clique cabe tudo o que as outras ferramentas
 * escreveram (o Quadro, a gaveta, o estúdio), e desaparecia sem erro nenhum.
 *
 * O servidor tem o caminho seguro — `activityLogAppend`, que junta ao registo
 * FRESCO. E a entrada leva o nome de quem aceitou, como todas as outras.
 */
describe("Propostas — aceitar acrescenta ao histórico, não o reescreve", () => {
  const enviada = {
    id: "p-enviada",
    quoteId: "q1",
    clientName: "Ana e Rui",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 10000,
    vat: 2300,
    total: 12300,
    status: "enviada",
    createdAt: "2026-05-01T00:00:00.000Z",
  };

  /** O pedido tal como este ecrã o tem: um retrato VELHO do histórico. */
  const pedido = {
    id: "q1",
    name: "Ana e Rui",
    status: "cotado",
    activityLog: [
      { id: "a1", at: "2026-05-01T09:00:00.000Z", kind: "note", summary: "Retrato da manhã" },
    ],
  } as unknown as Quote;

  let enviados: { url: string; body: Record<string, unknown> }[] = [];

  beforeEach(() => {
    enviados = [];
    vi.stubGlobal(
      "confirm",
      vi.fn(() => true),
    );
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (init?.method === "PATCH") {
          const body = JSON.parse(String(init.body)) as Record<string, unknown>;
          enviados.push({ url: u, body });
          if (u.startsWith("/api/orcamento/")) return response({ ...pedido, status: "aceite" });
          return response({ ...enviada, status: "aceite" });
        }
        return response(u.startsWith("/api/propostas") ? [enviada] : []);
      }),
    );
  });

  async function aceitar() {
    render(
      <ToastProvider>
        <Propostas quotes={[pedido]} onOpenQuote={() => {}} userName="Catarina" />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getAllByText("Ana e Rui").length).toBeGreaterThan(0));
    await userEvent.click(screen.getAllByRole("button", { name: "Acções de Ana e Rui" })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "Aceitar" }));
    await waitFor(() =>
      expect(enviados.some((e) => e.url.startsWith("/api/orcamento/"))).toBe(true),
    );
    return enviados.find((e) => e.url.startsWith("/api/orcamento/"))!;
  }

  it("manda `activityLogAppend` com uma entrada — e nunca o registo inteiro", async () => {
    const patch = await aceitar();
    expect(patch.body.status).toBe("aceite");
    expect(patch.body).not.toHaveProperty("activityLog");
    expect(patch.body.activityLogAppend).toHaveLength(1);
  });

  it("a entrada diz QUEM aceitou", async () => {
    const patch = await aceitar();
    const entrada = (patch.body.activityLogAppend as { actor?: string; summary: string }[])[0];
    expect(entrada.actor).toBe("Catarina");
    expect(entrada.summary).toMatch(/Proposta aceite/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA PROPOSTA GERADA MAS POR ENVIAR NÃO PODE PARECER ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quando o email não sai (SMTP em baixo, contacto errado), a proposta fica
 * gravada — tem de ficar, senão cada tentativa criava uma proposta duplicada —
 * mas fica POR ENVIAR. Antes ficava com `status:"enviada"` e este quadro
 * mostrava-a como «Enviada, à espera de resposta»: ela esperava por uma
 * resposta que não podia chegar.
 *
 * O que este ecrã tem de dizer sobre ela, e é o que se prende aqui:
 *  · o estado chama-se «Gerada, por enviar» — não «Enviada», não «Rascunho»;
 *  · há um aviso a dizer que o cliente não recebeu nada e o que fazer;
 *  · não conta como valor enviado nem como proposta à espera de resposta.
 */
describe("Propostas — a que ficou por enviar", () => {
  const porEnviar = [
    {
      id: "p-por-enviar",
      quoteId: "q9",
      clientName: "Maria & Zé",
      clientEmail: "maria@example.pt",
      currency: "EUR",
      lineItems: [],
      vatRate: 0.23,
      subtotal: 4000,
      vat: 920,
      total: 4920,
      status: "rascunho",
      createdAt: "2026-08-13T14:06:52.259Z",
    },
  ];

  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("/api/propostas") ? response(porEnviar) : response([]),
      ),
    );
  });

  const desenhar = () =>
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );

  it("diz «Gerada, por enviar», e nunca «Enviada»", async () => {
    desenhar();
    await waitFor(() => expect(screen.getByText("Maria & Zé")).toBeTruthy());
    expect(screen.getAllByText("Gerada, por enviar").length).toBeGreaterThan(0);
    expect(screen.queryByText("Enviada")).toBeNull();
  });

  it("avisa que o cliente não recebeu nada — e que reenviar não cria outra", async () => {
    desenhar();
    await waitFor(() => expect(screen.getByText("Maria & Zé")).toBeTruthy());
    expect(screen.getByText(/1 proposta gerada mas por enviar/)).toBeTruthy();
    expect(document.body.textContent).toContain("o cliente não recebeu nada");
    expect(document.body.textContent).toContain("não se cria outra");
    // E NÃO diz que está à espera de resposta do cliente: ninguém a recebeu.
    expect(document.body.textContent).not.toContain("aguarda resposta do cliente");
  });

  it("não entra no valor enviado aos clientes nem na taxa de aceitação", async () => {
    desenhar();
    await waitFor(() => expect(screen.getByText("Maria & Zé")).toBeTruthy());
    const valorEnviado = screen
      .getByText("Valor enviado aos clientes")
      .previousElementSibling?.textContent?.replace(/\s/g, "");
    expect(valorEnviado).toBe("0€");
    // Zero de zero oferecidas: contá-la baixava a taxa por uma avaria do
    // servidor de correio, que não é a resposta de ninguém.
    expect(screen.getByText("Propostas aceites").previousElementSibling?.textContent).toBe("0%");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA DO MEIO DIZIA SEMPRE 0
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A coluna chamava-se «Itens» e desenhava `p.lineItems.length`. As `lineItems`
 * são do FORMATO ANTIGO — a tabela de preços do `ProposalBuilder`, que ainda
 * existe atrás de um link no painel do pedido. A proposta do ESTÚDIO grava
 * `lineItems: []` à nascença (ver a rota `proposta-doc`) e guarda o que tem
 * dentro do `doc`: as rubricas em `doc.budgetItems`, os grupos de serviços em
 * `doc.serviceGroups`. Como hoje toda a gente usa o estúdio, a coluna era zero
 * em todas as linhas — uma coluna que nunca dizia nada.
 *
 * Passa a contar RUBRICAS DE ORÇAMENTO, e o cabeçalho di-lo. Rubricas e grupos
 * de serviços são coisas diferentes e não se somam: a proposta de referência
 * tem 40 rubricas e 1 grupo, e a coluna tem de dizer 40 — nunca 1, nunca 41.
 */
describe("Propostas — a coluna conta o que está mesmo no documento", () => {
  /** Ana & Bruno: 1 grupo de serviços, 40 rubricas de orçamento, 15 375 €. */
  const doEstudio = {
    id: "p-estudio",
    quoteId: "q-estudio",
    clientName: "Ana & Bruno",
    clientEmail: "ana@example.pt",
    currency: "EUR",
    // O estúdio grava-as vazias. É a origem do defeito.
    lineItems: [],
    vatRate: 0.23,
    subtotal: 12500,
    vat: 2875,
    total: 15375,
    status: "enviada",
    createdAt: "2026-08-01T10:00:00.000Z",
    doc: {
      ref: "PO Casamento Ana & Bruno",
      clientNames: "Ana & Bruno",
      serviceGroups: [
        { title: "Decoração Floral de Casamento", items: [{ label: "Arco de cerimónia" }] },
      ],
      moodBoards: [],
      budgetItems: Array.from({ length: 40 }, (_, i) => `Rubrica ${i + 1}`),
    },
  };

  /** O formato antigo, que ainda se pode criar: linhas com preço, sem `doc`. */
  const doFormatoAntigo = {
    id: "p-antiga",
    quoteId: "q-antiga",
    clientName: "Rita & Tomás",
    clientEmail: "rita@example.pt",
    currency: "EUR",
    lineItems: [
      { description: "Decoração de cerimónia", qty: 1, unitPrice: 2000 },
      { description: "Centros de mesa", qty: 10, unitPrice: 60 },
      { description: "Transporte e montagem", qty: 1, unitPrice: 300 },
    ],
    vatRate: 0.23,
    subtotal: 2900,
    vat: 667,
    total: 3567,
    status: "enviada",
    createdAt: "2026-08-02T10:00:00.000Z",
  };

  /** Sem documento e sem linhas: não há nada para contar. */
  const semNada = {
    id: "p-vazia",
    quoteId: "q-vazia",
    clientName: "Zulmira Sem Nada",
    clientEmail: "z@example.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 0,
    vat: 0,
    total: 0,
    status: "enviada",
    createdAt: "2026-08-03T10:00:00.000Z",
  };

  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("/api/propostas")
          ? response([doEstudio, doFormatoAntigo, semNada])
          : response([]),
      ),
    );
  });

  /** O texto da célula de `cabecalho` na linha de `nome`. */
  function celulaDa(nome: string, cabecalho: string): string {
    const tabela = screen.getByRole("table", { name: "Propostas" });
    const cabecalhos = [...tabela.querySelectorAll("thead th")].map(
      (th) => th.textContent?.trim() ?? "",
    );
    const i = cabecalhos.indexOf(cabecalho);
    if (i < 0) throw new Error(`não há coluna «${cabecalho}» — só ${JSON.stringify(cabecalhos)}`);
    const linha = [...tabela.querySelectorAll("tbody tr")].find((tr) =>
      tr.textContent?.includes(nome),
    );
    if (!linha) throw new Error(`não há linha de «${nome}»`);
    return linha.querySelectorAll("td")[i]?.textContent?.trim() ?? "";
  }

  async function desenharTabela() {
    // A coluna é `soLargo`: só existe a partir dos 1440 px.
    simularAparelho(1440, false);
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );
    await waitFor(() => expect(screen.getByRole("table", { name: "Propostas" })).toBeTruthy());
    await waitFor(() => expect(screen.getByText("Ana & Bruno")).toBeTruthy());
  }

  it("o cabeçalho diz o que está a ser contado — rubricas, não «itens»", async () => {
    await desenharTabela();
    const cabecalhos = [...screen.getByRole("table").querySelectorAll("thead th")].map((th) =>
      th.textContent?.trim(),
    );
    expect(cabecalhos).toContain("Rubricas");
    // «Itens» não dizia o quê: linhas de orçamento? serviços? fotografias?
    expect(cabecalhos).not.toContain("Itens");
  });

  it("a proposta do estúdio conta as 40 rubricas do documento — e não os grupos", async () => {
    await desenharTabela();
    expect(celulaDa("Ana & Bruno", "Rubricas")).toBe("40");
  });

  it("a proposta do formato antigo continua a contar as suas linhas", async () => {
    await desenharTabela();
    expect(celulaDa("Rita & Tomás", "Rubricas")).toBe("3");
  });

  it("sem documento e sem linhas não inventa um zero — não há nada para contar", async () => {
    await desenharTabela();
    expect(celulaDa("Zulmira Sem Nada", "Rubricas")).toBe("—");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PÁGINA CONTAVA DUAS POPULAÇÕES SEM O DIZER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Rever e reenviar é o caso normal: duas propostas para o mesmo pedido. O ecrã
 * dizia, ao mesmo tempo e sem uma palavra a explicar, «2 Propostas» (todas as
 * linhas), «Todas · 2» (idem), «1 proposta enviada aguarda resposta» (por
 * pedido) e «15 375 €» (por pedido). Nenhum número estava errado; era
 * impossível conciliá-los a olho.
 *
 * As duas contagens ficam — são duas perguntas diferentes («quantas propostas
 * fiz» e «quantos clientes estão à espera») — mas passam a estar ROTULADAS, e
 * há uma linha que as concilia para ninguém as tentar somar.
 */
describe("Propostas — duas propostas para o mesmo pedido", () => {
  const base = {
    quoteId: "q-mesmo",
    clientName: "Ana & Bruno",
    clientEmail: "ana@example.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 12500,
    vat: 2875,
    total: 15375,
    status: "enviada",
  };
  const revisoes = [
    { ...base, id: "p-1", createdAt: "2026-07-01T10:00:00.000Z" },
    { ...base, id: "p-2", createdAt: "2026-07-20T10:00:00.000Z" },
  ];

  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).startsWith("/api/propostas") ? response(revisoes) : response([]),
      ),
    );
  });

  const desenhar = () =>
    render(
      <ToastProvider>
        <Propostas quotes={[]} onOpenQuote={() => {}} onQuoteUpdated={() => {}} />
      </ToastProvider>,
    );

  it("o primeiro número passa a ser da mesma população que os outros três", async () => {
    desenhar();
    await waitFor(() => expect(screen.getAllByText("Ana & Bruno").length).toBeGreaterThan(0));
    // Era «2 Propostas» ao lado de «15 375 € enviados» e «1 à espera»: três
    // números do mesmo tamanho, dois deles por pedido e um por linha.
    const cartao = screen.getByText("Pedidos com proposta");
    expect(cartao.previousElementSibling?.textContent).toBe("1");
  });

  it("a linha de cima diz que conta por pedido", async () => {
    desenhar();
    await waitFor(() => expect(screen.getAllByText("Ana & Bruno").length).toBeGreaterThan(0));
    expect(document.body.textContent).toContain("Por pedido");
  });

  it("concilia os dois números, para ninguém os somar", async () => {
    desenhar();
    await waitFor(() => expect(screen.getAllByText("Ana & Bruno").length).toBeGreaterThan(0));
    expect(screen.getByText(/2 propostas para 1 pedido/)).toBeTruthy();
  });

  it("a lista continua a mostrar as duas — o filtro conta linhas, e diz «Todas»", async () => {
    desenhar();
    await waitFor(() => expect(screen.getAllByText("Ana & Bruno").length).toBeGreaterThan(0));
    expect(screen.getByText("Todas · 2")).toBeTruthy();
  });

  it("o valor enviado continua a contar o pedido uma vez", async () => {
    desenhar();
    await waitFor(() => expect(screen.getAllByText("Ana & Bruno").length).toBeGreaterThan(0));
    const valor = screen
      .getByText("Valor enviado aos clientes")
      .previousElementSibling?.textContent?.replace(/\s/g, "");
    // 15 375 €, e nunca 30 750 €.
    expect(valor).toBe("15375€");
  });
});
