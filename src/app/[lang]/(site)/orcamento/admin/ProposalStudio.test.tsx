// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalStudio, { avisoDeConteudoIncompleto, cortesDoCabecalho } from "./ProposalStudio";
import type { Quote } from "@/lib/orcamento/types";

/** A biblioteca de temas, reduzida a um botão que devolve uma foto escolhida —
 *  é o caminho por onde uma foto entra num mood board sem passar por um ficheiro
 *  real (o carregamento verdadeiro precisa de canvas/worker, que o jsdom não tem). */
vi.mock("./ThemePicker", () => ({
  default: ({ onPicked }: { onPicked: (imgs: { path: string; url: string }[]) => void }) => (
    <button type="button" onClick={() => onPicked([{ path: "board/nova.jpg", url: "u" }])}>
      escolher-foto-de-teste
    </button>
  ),
}));

/**
 * NADA SE PODE PERDER EM SILÊNCIO ENTRE O ESTÚDIO E O PDF.
 *
 * A página de mood board do documento desenha 6 fotos. A sétima era carregada,
 * ficava guardada, aparecia na miniatura — e não era impressa. Ninguém avisava:
 * nem ao pôr a foto, nem ao gerar o PDF, nem ao enviar. A proposta seguia para
 * um noivo com menos fotos do que a Catarina escolheu, e a primeira pessoa a
 * dar por isso era ele.
 *
 * Estes testes prendem os dois momentos em que ela tem de saber:
 *  1. AO MONTAR — a foto que não vai ser impressa fica marcada nesse instante;
 *  2. ANTES DE SEGUIR — o aviso do PDF diz o que ficou de fora, tanto o que não
 *     chegou (fotos em falta) como o que não coube (conteúdo cortado).
 */

const quote = {
  id: "q1",
  name: "Maria & Zé",
  email: "maria@example.pt",
  category: "casamentos",
  eventType: "casamentos",
  status: "novo",
  createdAt: "2026-01-01T00:00:00.000Z",
} as unknown as Quote;

const DRAFT_KEY = `liquen-proposal-studio-${quote.id}`;

/** Um rascunho já com um mood board de `n` fotos, como se ela tivesse acabado
 *  de as carregar (o estúdio restaura o rascunho local ao abrir). */
function seedDraft(n: number) {
  localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({
      template: "decoracao",
      ref: "PO Decoração",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [],
      moodBoards: [
        {
          title: "Cerimónia",
          annotation: "",
          images: Array.from({ length: n }, (_, i) => `board/foto-${i}.jpg`),
        },
      ],
      budgetItems: [],
      coverImages: ["", ""],
      totalAmount: 3000,
      totalVatMode: "acrescer",
    }),
  );
}

/** Resposta mínima que o estúdio sabe ler. */
function reply(body: { ok?: boolean; json?: unknown; headers?: Record<string, string> }): Response {
  const headers = body.headers ?? {};
  return {
    ok: body.ok ?? true,
    status: body.ok === false ? 500 : 200,
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body.json ?? {},
    blob: async () => new Blob(["%PDF-"], { type: "application/pdf" }),
  } as unknown as Response;
}

/** O que a rota `proposta-doc` devolve neste teste (pré-visualização e envio). */
let propostaDoc: Response = reply({ headers: {}, json: { ok: true, emailed: true } });
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  void init; // registado nas chamadas — é onde se vê o que foi GRAVADO
  const url = String(input);
  if (url.includes("proposta-doc")) return propostaDoc;
  if (url.includes("proposta-rascunho")) return reply({ ok: false });
  return reply({ json: { images: [] } });
});

beforeEach(() => {
  localStorage.clear();
  propostaDoc = reply({ headers: {}, json: { ok: true, emailed: true } });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  // O descarregamento do PDF passa por um blob: URL, que o jsdom não tem.
  vi.stubGlobal(
    "URL",
    Object.assign(URL, { createObjectURL: () => "blob:x", revokeObjectURL() {} }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const renderStudio = () =>
  render(
    <ToastProvider>
      <ProposalStudio quote={quote} />
    </ToastProvider>,
  );

/**
 * O CASO DA CATARINA MARTINS.
 *
 * A proposta saiu com cinco pontos de decoração; a resposta dela foi «pode me
 * atualizar o orçamento apenas para» três, e o trabalho teve de ser refeito.
 * Agora o casal escolhe no pedido — e o estúdio abre já com esses pontos.
 *
 * O teste que interessa não é o feliz: é o de baixo, que garante que quem NÃO
 * escolheu nada continua a ver o estúdio de sempre, em vez de uma proposta
 * inventada por mim.
 */
/**
 * O ORÇAMENTO QUE SE SOMA SOZINHO.
 *
 * Palavras dela: «altero um item e esqueço-me de atualizar o total». O aviso
 * existe para esse esquecimento ter voz.
 */
/**
 * LIMPAR O RASCUNHO — a única acção destrutiva da página.
 *
 * Tinha uma caixa de confirmação. A caixa pergunta ANTES, quando ela ainda
 * não viu o que ia perder, e a resposta certa é quase sempre "sim" — por isso
 * carrega-se sem ler. A anulação pergunta DEPOIS, com o estrago à vista.
 */
describe("limpar o rascunho pode ser anulado", () => {
  function seedComConteudo() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia"],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  it("não pergunta antes — limpa e oferece anular", async () => {
    seedComConteudo();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Limpar rascunho/ }));
    expect(await screen.findByText(/Pode anular durante/i)).toBeTruthy();
    // E limpou mesmo: o grupo que lá estava desapareceu.
    expect(screen.queryByDisplayValue("Decoração Floral")).toBeNull();
  });

  it("anular devolve o que lá estava", async () => {
    seedComConteudo();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Limpar rascunho/ }));
    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));
    expect(await screen.findByDisplayValue("Decoração Floral")).toBeTruthy();
    expect(screen.getByDisplayValue("Igreja")).toBeTruthy();
    // E a oferta desaparece — anulada uma vez, não fica lá a pedir de novo.
    expect(screen.queryByText(/Pode anular durante/i)).toBeNull();
  });
});

describe("total desalinhado da soma das linhas", () => {
  function seedComPrecos(total: number) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: ["Decor Cerimónia", "Decor Jantar"],
        budgetAmounts: [900, 2350],
        coverImages: ["", ""],
        totalAmount: total,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  it("mostra a soma das linhas ao lado do botão de acrescentar", async () => {
    seedComPrecos(3250);
    renderStudio();
    // O `^` não é preciosismo: "Bate certo com a soma das linhas" também
    // contém a frase, e sem a âncora o teste apanhava as duas.
    expect(await screen.findByText(/^Soma das linhas:/)).toBeTruthy();
  });

  it("avisa quando o total escrito à mão já não bate certo", async () => {
    seedComPrecos(4000);
    renderStudio();
    const aviso = await screen.findByText(/difere da soma das linhas/i);
    expect(aviso.textContent).toMatch(/750/);
  });

  it("cala-se quando o total bate certo", async () => {
    seedComPrecos(3250);
    renderStudio();
    await screen.findByText(/^Soma das linhas:/);
    expect(screen.queryByText(/difere da soma das linhas/i)).toBeNull();
  });

  it("o botão do aviso arruma o total", async () => {
    // Dizer que está errado sem dar o gesto que o corrige é meio trabalho.
    seedComPrecos(4000);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    expect(screen.queryByText(/difere da soma das linhas/i)).toBeNull();
  });

  it("mostra as duas leituras do IVA lado a lado", async () => {
    // Para ela ver o que o cliente vai ver, antes de decidir.
    seedComPrecos(3250);
    renderStudio();
    // A barra fixa do fundo também diz "o cliente paga", precedida de
    // "sem IVA ·" — daí a âncora no início.
    expect(await screen.findAllByText(/^o cliente paga/)).toHaveLength(2);
  });
});

describe("pontos de decoração escolhidos no pedido", () => {
  const comEscolhas = {
    ...quote,
    decorPoints: ["cocktail", "seating", "mesas"],
  } as unknown as Quote;

  const renderCom = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );

  it("abre a proposta já com as linhas que o casal pediu", async () => {
    renderCom(comEscolhas);
    // As palavras são as do quadro "3. Orçamento Proposto" das propostas
    // reais — o que o casal marcou e o que ela vê no estúdio têm de ser
    // reconhecivelmente a mesma coisa.
    expect(await screen.findAllByDisplayValue("Decoração Cocktail")).not.toHaveLength(0);
    expect(screen.getAllByDisplayValue("Design Floral e Decoração Mesas")).not.toHaveLength(0);
    expect(
      screen.getAllByDisplayValue("Seating Plan e Decor Floral Seating Plan"),
    ).not.toHaveLength(0);
  });

  it("não semeia o que o casal NÃO pediu", async () => {
    renderCom(comEscolhas);
    await screen.findAllByDisplayValue("Decoração Cocktail");
    // A cerimónia e os complementos dos noivos foram exactamente os dois
    // pontos que a Catarina mandou tirar. Não podem reaparecer sozinhos.
    expect(screen.queryByDisplayValue("Decoração Cerimónia")).toBeNull();
    expect(screen.queryByDisplayValue("Complementos dos Noivos")).toBeNull();
  });

  it("um pedido sem escolhas abre o estúdio como sempre abriu", async () => {
    renderCom(quote);
    // Um grupo vazio à espera de ser escrito — nada semeado.
    const grupo = await screen.findByPlaceholderText("Decoração Floral de Casamento");
    expect((grupo as HTMLInputElement).value).toBe("");
  });
});

describe("mood board com mais fotos do que a página desenha", () => {
  it("marca AO MONTAR as fotos que não vão ser impressas", async () => {
    seedDraft(8);
    renderStudio();
    // A sétima e a oitava ficam marcadas — as seis primeiras não.
    expect(await screen.findAllByText("fora do PDF")).toHaveLength(2);
    expect(screen.getByText(/A página deste mood board mostra 6 fotos/i).textContent).toMatch(
      /as 2 últimas.*não são impressas/i,
    );
  });

  it("avisa NO INSTANTE em que a sétima foto entra no mood board", async () => {
    // Não depois de gerar o PDF, não depois de enviar: agora, com a mão ainda
    // na foto que acabou de escolher.
    seedDraft(6);
    renderStudio();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
    await user.click(await screen.findByRole("button", { name: "escolher-foto-de-teste" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/fica com 7 fotos e a página do PDF mostra 6/);
    expect(alerta.textContent).toMatch(/a última não entra/);
    // …e a foto a mais fica marcada, para o aviso não morrer com o toast.
    expect(await screen.findAllByText("fora do PDF")).toHaveLength(1);
  });

  it("não marca nada quando as fotos todas cabem", async () => {
    seedDraft(6);
    renderStudio();
    // O título da SECÇÃO. A coluna lateral também diz "Mood boards", e sem
    // esta distinção o teste apanhava os dois e falhava por ambiguidade.
    await screen.findByRole("heading", { name: "Mood boards" });
    expect(screen.queryByText("fora do PDF")).toBeNull();
    expect(screen.queryByText(/A página deste mood board mostra/i)).toBeNull();
  });
});

describe("aviso antes de a proposta seguir para o cliente", () => {
  it("a pré-visualização diz o que o desenho cortou", async () => {
    seedDraft(8);
    const cortes = [{ where: "Mood board «Cerimónia»", dropped: 2, unit: "fotos" }];
    propostaDoc = reply({
      headers: {
        "X-Fotos-Em-Falta": "0",
        "X-Conteudo-Cortado": Buffer.from(JSON.stringify(cortes), "utf8").toString("base64"),
      },
    });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    await user.click(await screen.findByRole("button", { name: /Descarregar PDF/ }));

    const alerta = await screen.findByRole("alert");
    expect(
      within(alerta).getByText(/Mood board «Cerimónia»: 2 fotos não entram no PDF/),
    ).toBeTruthy();
    expect(within(alerta).getByText(/Verifique antes de enviar/)).toBeTruthy();
  });

  it("o envio avisa das duas perdas ao mesmo tempo, sem as confundir", async () => {
    seedDraft(2);
    propostaDoc = reply({
      json: {
        ok: true,
        emailed: true,
        missingImages: 1,
        truncations: [{ where: "Campo «Local»", dropped: 1, unit: "linhas" }],
      },
    });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    // Enviar exige duas carregadas: a acção e a confirmação.
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    const alerta = await screen.findByRole("alert");
    const texto = alerta.textContent ?? "";
    expect(texto).toMatch(/1 foto não entrou \(não foi possível ir buscá-la\)/);
    expect(texto).toMatch(/Campo «Local»: 1 linha cortada/);
  });
});

describe("a frase do aviso", () => {
  it("junta as duas perdas mantendo-as distintas", () => {
    expect(
      avisoDeConteudoIncompleto(2, [
        { where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" },
        { where: "Nome na capa", dropped: 1, unit: "linhas" },
      ]),
    ).toBe(
      "2 fotos não entraram (não foi possível ir buscá-las); " +
        "Mood board «Cerimónia»: 3 fotos não entram no PDF; " +
        "Nome na capa: 1 linha cortada",
    );
  });

  it("cala-se quando o documento vai completo", () => {
    expect(avisoDeConteudoIncompleto(0, [])).toBeNull();
  });

  it("lê o cabeçalho com acentos e ignora lixo em vez de rebentar", () => {
    const cortes = [{ where: "Descrição do mood board «Cerimónia»", dropped: 4, unit: "linhas" }];
    const header = Buffer.from(JSON.stringify(cortes), "utf8").toString("base64");
    expect(cortesDoCabecalho(header)).toEqual(cortes);
    expect(cortesDoCabecalho(null)).toEqual([]);
    expect(cortesDoCabecalho("isto-não-é-base64-de-json")).toEqual([]);
    expect(cortesDoCabecalho(Buffer.from('[{"where":1}]').toString("base64"))).toEqual([]);
  });
});

describe("O valor é UM só — o do pedido", () => {
  /**
   * O defeito: havia duas caixas com o mesmo número (aqui e na Gestão do
   * pedido) e elas podiam DISCORDAR. O estúdio só copiava o preço quando ainda
   * não havia rascunho; a partir daí, alterar o "Preço final" no pedido não
   * mexia aqui, e o PDF seguia para o cliente com o valor antigo — sem nada no
   * ecrã a dizê-lo.
   */
  const comPreco = (preco?: number) => ({ ...quote, quotedPrice: preco }) as Quote;

  function desenhar(q: Quote, onQuoteUpdated?: (q: Quote) => void) {
    return render(
      <ToastProvider>
        <ProposalStudio quote={q} onQuoteUpdated={onQuoteUpdated} />
      </ToastProvider>,
    );
  }

  it("abre com o preço do pedido, mesmo havendo já um rascunho com outro valor", async () => {
    // Este é o caso que se partia: o rascunho tem 3000, o pedido passou a 4500.
    seedDraft(2);
    desenhar(comPreco(4500));
    const campo = await screen.findByLabelText(/Valor \(sem IVA\)/i);
    expect(campo).toHaveValue("4500");
  });

  it("escrever aqui GRAVA no preço do pedido", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    const atualizado = vi.fn();
    desenhar(comPreco(3000), atualizado);

    const campo = await screen.findByLabelText(/Valor \(sem IVA\)/i);
    await user.clear(campo);
    await user.type(campo, "4200");
    // A gravação tem a mão travada — quatro teclas não podem ser quatro
    // gravações.
    await vi.advanceTimersByTimeAsync(800);

    const gravacoes = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(gravacoes.length, "escreveu uma vez por tecla").toBe(1);
    expect(JSON.parse(String(gravacoes[0][1]?.body))).toMatchObject({ quotedPrice: 4200 });
    vi.useRealTimers();
  });

  it("apagar o valor grava NULL — senão o pedido ficava com o preço antigo", async () => {
    // `undefined` desaparece no JSON e o merge parcial do servidor mantinha o
    // valor velho: apagar nunca chegava a gravar.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    desenhar(comPreco(3000));
    await user.clear(await screen.findByLabelText(/Valor \(sem IVA\)/i));
    await vi.advanceTimersByTimeAsync(800);

    const gravacoes = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(gravacoes.at(-1)?.[1]?.body))).toMatchObject({ quotedPrice: null });
    vi.useRealTimers();
  });

  it("trocar o modo de IVA não mexe na base — muda o que o cliente vê", async () => {
    const user = userEvent.setup();
    desenhar(comPreco(3000));
    const campo = await screen.findByLabelText(/Valor \(sem IVA\)/i);
    expect(campo).toHaveValue("3000");

    await user.click(screen.getByRole("radio", { name: /IVA incluído/i }));
    // O número do pedido é a BASE, e continua a ser 3000 — o rótulo "(sem IVA)"
    // da Gestão do pedido tem de continuar verdadeiro nos dois modos.
    expect(campo).toHaveValue("3000");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS ACÇÕES DE UM GRUPO DE SERVIÇOS, NUM TELEMÓVEL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cabeçalho de cada grupo tinha quatro coisas na mesma linha: a letra, o
 * título, duas setas e o ×. Num ecrã de 375 px são três alvos de 44 px a
 * competir com o campo do título, presentes o tempo todo para acções que se
 * fazem uma vez por proposta.
 *
 * Passaram a ter dois caminhos, e o que estes testes guardam é que são MESMO
 * dois — porque um gesto escondido sem alternativa visível é o defeito, não a
 * correcção:
 *
 *  1. TOQUE LONGO no cabeçalho → uma folha com mover e remover;
 *  2. o botão "Reordenar" ao lado do título da secção, para quem nunca
 *     descobrir o gesto.
 */
describe("grupos de serviços — mover e remover sem encher a linha", () => {
  /** Um rascunho com três grupos, que é onde a ordem passa a interessar. */
  function seedGrupos(quantos = 3) {
    const nomes = ["Cerimónia", "Copo de água", "Festa"];
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: nomes
          .slice(0, quantos)
          .map((title, i) => ({ letter: `${"abc"[i]})`, title, items: [] })),
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  /** O rascunho é restaurado num efeito; sem esperar por ele mede-se o estúdio
   *  vazio. */
  const desenharComGrupos = async (quantos = 3) => {
    seedGrupos(quantos);
    renderStudio();
    await screen.findAllByLabelText("Título do grupo");
  };

  const titulos = () =>
    screen.getAllByLabelText("Título do grupo").map((i) => (i as HTMLInputElement).value);

  /** O cabeçalho do grupo `i` — a caixa que ouve o toque longo. */
  const cabecalhoDoGrupo = (i: number) =>
    screen.getAllByLabelText("Título do grupo")[i].parentElement!.parentElement!;

  /**
   * O toque longo do `useToqueLongo`: dedo pousado, 550 ms parado, sem sair de
   * cima. Um `click` não serve — o gesto é outro, e é o gesto que se testa.
   *
   * Os temporizadores falsos ficam ligados só durante o gesto: com eles ligados
   * o `findBy*` da testing-library nunca resolve, porque espera em temporizador
   * real. Foi o que fez a primeira versão destes testes esgotar o tempo toda.
   */
  async function toqueLongo(el: Element, { mover }: { mover?: { x: number; y: number } } = {}) {
    vi.useFakeTimers();
    try {
      el.dispatchEvent(
        new PointerEvent("pointerdown", {
          pointerType: "touch",
          clientX: 100,
          clientY: 100,
          bubbles: true,
        }),
      );
      if (mover) {
        el.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerType: "touch",
            clientX: mover.x,
            clientY: mover.y,
            bubbles: true,
          }),
        );
      }
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600);
      });
    } finally {
      vi.useRealTimers();
    }
  }

  /**
   * As acções DENTRO da folha.
   *
   * Procurar `screen.getByRole("button", { name: /Mover para cima/ })` no
   * documento inteiro encontra também as setas que cada grupo tem na linha —
   * no browser estão escondidas por CSS abaixo de `sm`, mas o jsdom não corre
   * CSS nenhum e vê-as todas. A pergunta certa é sempre "dentro da folha".
   */
  const naFolha = async () => within(await screen.findByRole("dialog"));

  it("o toque longo abre as acções do grupo, com o nome dele à vista", async () => {
    await desenharComGrupos();
    await toqueLongo(cabecalhoDoGrupo(1));

    // O nome do grupo no título da folha: um menu que diz só "Remover" depois
    // de um toque longo é a forma fácil de apagar o grupo errado.
    const folha = await naFolha();
    expect(folha.getByRole("heading", { name: "Copo de água" })).toBeInTheDocument();
    expect(folha.getByRole("button", { name: /Mover para cima/ })).toBeInTheDocument();
    expect(folha.getByRole("button", { name: /Remover grupo/ })).toBeInTheDocument();
  });

  it("mover para cima pela folha muda mesmo a ordem", async () => {
    const user = userEvent.setup();
    await desenharComGrupos();
    expect(titulos()).toEqual(["Cerimónia", "Copo de água", "Festa"]);

    await toqueLongo(cabecalhoDoGrupo(1));
    await user.click((await naFolha()).getByRole("button", { name: /Mover para cima/ }));

    expect(titulos()).toEqual(["Copo de água", "Cerimónia", "Festa"]);
  });

  it("remover pela folha tira o grupo certo", async () => {
    const user = userEvent.setup();
    await desenharComGrupos();

    await toqueLongo(cabecalhoDoGrupo(2));
    await user.click((await naFolha()).getByRole("button", { name: /Remover grupo/ }));

    expect(titulos()).toEqual(["Cerimónia", "Copo de água"]);
  });

  /**
   * A metade que impede isto de ser um gesto escondido. Se o "Reordenar"
   * desaparecesse, mover um grupo passava a depender de adivinhar um toque
   * longo — e quem não o adivinhasse ficava sem forma nenhuma de o fazer.
   */
  it("há um caminho visível que não depende de adivinhar o gesto", async () => {
    await desenharComGrupos();
    expect(screen.getByRole("button", { name: "Reordenar" })).toBeInTheDocument();
    expect(screen.getByText(/Toque sem largar num grupo/)).toBeInTheDocument();
  });

  it("o modo de reordenar diz que está ligado, e sai", async () => {
    const user = userEvent.setup();
    await desenharComGrupos();

    await user.click(screen.getByRole("button", { name: "Reordenar" }));
    expect(screen.getByText(/A arrumar a ordem dos grupos/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Concluir" }));
    expect(screen.queryByText(/A arrumar a ordem dos grupos/)).not.toBeInTheDocument();
  });

  /** Com um grupo só não há ordem nenhuma para arrumar, e o botão seria ruído. */
  it("sem grupos que cheguem, o botão de reordenar não aparece", async () => {
    await desenharComGrupos(1);
    expect(screen.queryByRole("button", { name: "Reordenar" })).not.toBeInTheDocument();
  });

  /**
   * O gesto NÃO pode disparar em cima de um campo de texto: pousar o dedo e
   * não largar é como se põe o cursor a meio de uma palavra no iOS, e abrir
   * aqui um menu tirava-lhe isso a cada hesitação a escrever.
   */
  it("pousar o dedo no campo do título não abre menu nenhum", async () => {
    await desenharComGrupos();
    await toqueLongo(screen.getAllByLabelText("Título do grupo")[1]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /** Um dedo que se move está a rolar a lista, não a pedir um menu. */
  it("começar a rolar com o dedo pousado cancela o gesto", async () => {
    await desenharComGrupos();
    await toqueLongo(cabecalhoDoGrupo(1), { mover: { x: 100, y: 160 } });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
