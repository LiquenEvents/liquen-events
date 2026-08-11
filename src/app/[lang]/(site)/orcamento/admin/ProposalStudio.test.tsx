// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalStudio, {
  avisoDeConteudoIncompleto,
  cortesDoCabecalho,
  porqueFalhouOEnvio,
} from "./ProposalStudio";
import type { Quote } from "@/lib/orcamento/types";

/** O runtime de importação do seletor, reduzido aos três momentos que o estúdio
 *  tem de saber tratar: o lugar é RESERVADO no instante do clique, a cópia
 *  CONFIRMA (e traz o caminho definitivo), ou FALHA. É por aqui que uma foto
 *  entra num mood board sem passar por um ficheiro real (o carregamento
 *  verdadeiro precisa de canvas/worker, que o jsdom não tem). */
const seletor = vi.hoisted(() => ({ tokens: [] as string[], n: 0 }));

interface FotoImportada {
  path: string;
  url: string;
  thumbUrl?: string;
  sourcePath?: string;
  token?: string;
}

vi.mock("./ThemePicker", () => ({
  default: ({
    onPicked,
    onReserve,
    onDropped,
  }: {
    onPicked: (imgs: FotoImportada[]) => void;
    onReserve?: (r: { token: string; thumbUrl?: string; sourcePath: string }[]) => void;
    onDropped?: (tokens: string[]) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => {
          const n = ++seletor.n;
          const token = `pending:tok-${n}`;
          seletor.tokens.push(token);
          onReserve?.([{ token, thumbUrl: `tema-thumb-${n}`, sourcePath: `t1/origem-${n}.jpg` }]);
        }}
      >
        reservar-foto-de-teste
      </button>
      <button
        type="button"
        onClick={() => {
          // Confirma a ÚLTIMA reservada — é o que deixa verificar que a troca é
          // no lugar dela, e não no fim da lista.
          const token = seletor.tokens.pop();
          const n = token?.replace("pending:tok-", "") ?? "0";
          onPicked([
            {
              path: `LQ-001/copia-${n}.jpg`,
              url: `u-${n}`,
              thumbUrl: `copia-thumb-${n}`,
              sourcePath: `t1/origem-${n}.jpg`,
              token,
            },
          ]);
        }}
      >
        confirmar-foto-de-teste
      </button>
      <button
        type="button"
        onClick={() => {
          const token = seletor.tokens.pop();
          if (token) onDropped?.([token]);
        }}
      >
        falhar-foto-de-teste
      </button>
      <button type="button" onClick={() => onPicked([{ path: "board/nova.jpg", url: "u" }])}>
        escolher-foto-de-teste
      </button>
    </>
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
/** O rascunho que o SERVIDOR tem guardado (null = não tem nenhum). */
let rascunhoServidor: { doc: unknown; updatedAt: string } | null = null;
/** As versões já enviadas, e o documento de cada uma (`?doc=<id>`). */
let versoesServidor: unknown[] = [];
let docsDeVersao: Record<string, unknown> = {};
/** As propostas anteriores e os modelos, para o «Criar a partir de…». */
let propostasServidor: unknown[] = [];
let modelosServidor: unknown[] = [];
/** O que /api/propostas/copiar devolve — a cópia inteira ou o mapa das fotos. */
let copiaServidor: unknown = {};
/** Tudo o que saiu daqui — é onde se lê o que foi GRAVADO e o que foi ENVIADO. */
let pedidos: { url: string; init?: RequestInit }[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const metodo = init?.method ?? "GET";
  pedidos.push({ url, init });
  if (url.includes("proposta-doc")) return propostaDoc;
  if (url.includes("proposta-rascunho")) {
    if (metodo === "GET" && rascunhoServidor) return reply({ json: { draft: rascunhoServidor } });
    return reply({ ok: false });
  }
  if (url.includes("/versoes")) {
    const qual = /[?&]doc=([^&]+)/.exec(url);
    if (qual) return reply({ json: { doc: docsDeVersao[qual[1]] ?? null } });
    return reply({ json: { versoes: versoesServidor } });
  }
  // Antes do `/propostas` genérico: senão a cópia caía na lista de resumos.
  if (url.includes("/propostas/copiar")) return reply({ json: copiaServidor });
  if (url.includes("/propostas/modelos")) return reply({ json: { modelos: modelosServidor } });
  if (url.includes("/api/propostas?")) return reply({ json: propostasServidor });
  return reply({ json: { images: [] } });
});

/** Os corpos enviados a uma rota, pela ordem. */
function corpos(parte: string, metodo = "PUT"): string[] {
  return pedidos
    .filter((p) => p.url.includes(parte) && (p.init?.method ?? "GET") === metodo)
    .map((p) => String(p.init?.body ?? ""));
}

beforeEach(() => {
  localStorage.clear();
  seletor.tokens.length = 0;
  seletor.n = 0;
  pedidos = [];
  propostaDoc = reply({ headers: {}, json: { ok: true, emailed: true } });
  rascunhoServidor = null;
  versoesServidor = [];
  docsDeVersao = {};
  propostasServidor = [];
  modelosServidor = [];
  copiaServidor = {};
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
    // A lotação subiu de 6 para 10 quando os layouts passaram a ser cinco (a
    // proposta feita à mão chega às dez numa página). O aviso é o mesmo; o
    // número é que mudou.
    seedDraft(12);
    renderStudio();
    // A décima primeira e a décima segunda ficam marcadas — as dez primeiras não.
    expect(await screen.findAllByText("fora do PDF")).toHaveLength(2);
    expect(screen.getByText(/A página deste mood board mostra 10 fotos/i).textContent).toMatch(
      /as 2 últimas.*não são impressas/i,
    );
  });

  it("avisa NO INSTANTE em que a foto a mais entra no mood board", async () => {
    // Não depois de gerar o PDF, não depois de enviar: agora, com a mão ainda
    // na foto que acabou de escolher.
    seedDraft(10);
    renderStudio();
    const user = userEvent.setup();
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
    await user.click(await screen.findByRole("button", { name: "escolher-foto-de-teste" }));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toMatch(/fica com 11 fotos e a página do PDF mostra 10/);
    expect(alerta.textContent).toMatch(/a última não entra/);
    // …e a foto a mais fica marcada, para o aviso não morrer com o toast.
    expect(await screen.findAllByText("fora do PDF")).toHaveLength(1);
  });

  it("não marca nada quando as fotos todas cabem", async () => {
    seedDraft(10);
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
    expect(texto).toMatch(/1 foto não entrou \(não foi possível ir buscá-la ou desenhá-la\)/);
    expect(texto).toMatch(/Campo «Local»: 1 linha cortada/);
  });
});

/**
 * A FOTO APARECE NO INSTANTE DO CLIQUE — E O MARCADOR NUNCA SAI DAQUI.
 *
 * Escolher fotos na Biblioteca de Temas fecha o diálogo já, mas a CÓPIA para a
 * pasta desta proposta demora. Entre o clique e a confirmação, o que ocupa o
 * lugar no documento é um marcador `pending:<uuid>` — que não é caminho de
 * coisa nenhuma. Fixa-se aqui o ciclo inteiro:
 *
 *  1. ao clicar, a foto está no mood board, esbatida e anunciada (`aria-busy`);
 *  2. ao confirmar, o marcador dá lugar ao caminho definitivo NA MESMA CÉLULA —
 *     nada reordena, nada salta;
 *  3. ao falhar, o marcador sai (e o aviso é da pastilha, não daqui);
 *  4. e — o mais importante — um marcador NUNCA é gravado no rascunho nem vai
 *     dentro do documento que gera o PDF. Gravado, sobrevivia ao recarregar da
 *     página como uma foto que não existe; enviado, era um buraco silencioso no
 *     PDF do cliente.
 */
describe("fotos da biblioteca em estado provisório", () => {
  /** As células de foto do documento, por ordem no DOM (cada uma tem o seu «×»). */
  const celulas = () =>
    screen.queryAllByRole("button", { name: "Remover imagem" }).map((b) => b.parentElement!);
  const estados = () => celulas().map((c) => c.getAttribute("aria-busy"));

  async function abrirBiblioteca(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
  }
  const reservar = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "reservar-foto-de-teste" }));
  const confirmar = (user: ReturnType<typeof userEvent.setup>) =>
    user.click(screen.getByRole("button", { name: "confirmar-foto-de-teste" }));

  /** Esquece o que já foi gravado e espera pela PRÓXIMA gravação do rascunho
   *  (que é feita com debounce). */
  async function proximaGravacao() {
    pedidos = [];
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  }

  it("a foto entra no mood board no INSTANTE do clique, em estado provisório", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    const antes = pedidos.length;
    await reservar(user);

    // Sem esperar por rede nenhuma: são duas células, a nova por assentar.
    expect(estados()).toEqual([null, "true"]);
    // Percetível por quem não vê o esbatido, e não só por opacidade.
    expect(screen.getByText("a entrar…")).toBeInTheDocument();
    // E ZERO pedidos novos: a miniatura é a que o seletor já tinha em memória.
    expect(pedidos.length).toBe(antes);
  });

  it("ao confirmar, o marcador dá lugar ao caminho definitivo NA MESMA POSIÇÃO", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);
    await reservar(user);
    expect(estados()).toEqual([null, "true", "true"]);

    // Confirma-se a SEGUNDA das duas. Se a troca fosse um "acrescentar", ela
    // ia parar ao fim da lista e a primeira descia de posição.
    await confirmar(user);
    expect(estados()).toEqual([null, "true", null]);

    await confirmar(user);
    expect(estados()).toEqual([null, null, null]);
    await proximaGravacao();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].images).toEqual([
      "board/foto-0.jpg",
      "LQ-001/copia-1.jpg",
      "LQ-001/copia-2.jpg",
    ]);
  });

  it("ao falhar, o marcador sai do documento — e o aviso não se repete", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);
    expect(estados()).toEqual([null, "true"]);

    await user.click(screen.getByRole("button", { name: "falhar-foto-de-teste" }));

    expect(estados()).toEqual([null]);
    expect(screen.queryByText("a entrar…")).not.toBeInTheDocument();
    // A pastilha do seletor é que avisa e oferece "Repetir"; o estúdio cala-se
    // (a região de avisos existe sempre, mas fica vazia).
    expect(screen.getByRole("alert").textContent).toBe("");
  });

  it("um marcador provisório NUNCA é gravado no rascunho", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);
    await proximaGravacao();

    // Nem na cópia local (documento e mapas de apoio)…
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain("pending:");
    expect(localStorage.getItem(`${DRAFT_KEY}:meta`)).not.toContain("pending:");
    // …nem na do servidor, que é a que viaja para o outro dispositivo.
    expect(corpos("proposta-rascunho").join("")).not.toContain("pending:");
    // E o que já lá estava não se perdeu no caminho.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].images).toEqual([
      "board/foto-0.jpg",
    ]);
  });

  it("a capa reservada não encolhe a outra posição (a foto da direita sai à direita)", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    // Posição 1 = capa DIREITA. Um array compactado mandava-a imprimir à esquerda.
    const daBiblioteca = await screen.findAllByRole("button", { name: "Da biblioteca de temas" });
    await user.click(daBiblioteca[1]);
    await reservar(user);
    await proximaGravacao();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).coverImages).toEqual(["", ""]);

    await confirmar(user);
    await proximaGravacao();
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).coverImages).toEqual([
      "",
      "LQ-001/copia-1.jpg",
    ]);
  });

  it("a pré-visualização sai sem o marcador e diz que a foto ainda não entrou", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);

    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    await user.click(await screen.findByRole("button", { name: /Descarregar PDF/ }));

    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "";
    expect(corpo).not.toContain("pending:");
    expect(JSON.parse(corpo).doc.moodBoards[0].images).toEqual(["board/foto-0.jpg"]);
    // E dito por extenso, senão o PDF que ela acabou de abrir parecia um erro.
    expect(
      await screen.findByText(/PDF gerado sem 1 foto que ainda está a entrar/),
    ).toBeInTheDocument();
  });

  it("o ENVIO espera pelas fotos por confirmar, e depois leva o caminho definitivo", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await abrirBiblioteca(user);
    await reservar(user);

    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    // O gesto irreversível não segue com a proposta a meio: fica travado, com
    // a razão escrita — e não uma mensagem a mandá-la preencher campos.
    expect(await screen.findByText(/1 foto ainda está a entrar na proposta/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Gerar e enviar ao cliente/ })).toBeDisabled();
    expect(corpos("proposta-doc", "POST")).toHaveLength(0);

    // Mal assenta, o envio abre sozinho — e o documento leva o caminho real.
    await confirmar(user);
    const enviar = screen.getByRole("button", { name: /Gerar e enviar ao cliente/ });
    expect(enviar).toBeEnabled();
    await user.click(enviar);
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "";
    expect(corpo).not.toContain("pending:");
    expect(JSON.parse(corpo).doc.moodBoards[0].images).toEqual([
      "board/foto-0.jpg",
      "LQ-001/copia-1.jpg",
    ]);
  });

  it("um marcador deixado num rascunho antigo não sobrevive a reabrir o estúdio", async () => {
    // Uma versão anterior (ou um rascunho corrompido) podia ter gravado um.
    // Abrir com ele seria pôr no ecrã uma foto que não existe em lado nenhum.
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        serviceGroups: [],
        moodBoards: [
          { title: "Cerimónia", annotation: "", images: ["board/foto-0.jpg", "pending:antigo"] },
        ],
        budgetItems: [],
        coverImages: ["pending:capa", "board/capa-1.jpg"],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio();

    // O TÍTULO da secção: a coluna lateral (NavEstudio) também diz "Mood
    // boards", e um `findByText` solto passou a encontrar os dois.
    await screen.findByRole("heading", { name: "Mood boards" });
    // Uma foto no mood board, uma capa — e nenhuma célula provisória.
    expect(estados()).toEqual([null, null]);
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    expect(localStorage.getItem(DRAFT_KEY)).not.toContain("pending:");
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
      "2 fotos não entraram (não foi possível ir buscá-las ou desenhá-las); " +
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

describe("linhas que escalam com os convidados", () => {
  /**
   * Metade das linhas de um orçamento de casamento é uma multiplicação, não um
   * preço. O que se prende aqui é o que a torna confiável: a conta aparece, e
   * mudar o tipo de escala não faz o total saltar debaixo dos pés.
   */
  it("mostra a conta ao lado do número quando a linha passa a ser por mesa", async () => {
    renderStudio();
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: /\+ Adicionar item/ }));
    const nome = screen.getAllByLabelText("Item de orçamento").at(-1)!;
    await user.clear(nome);
    await user.type(nome, "Arranjos de mesa");

    // O pedido de teste não traz convidados; escreve-se o número no campo do
    // Evento, que é de onde a conta os lê.
    const campoConvidados = screen.getByLabelText("Convidados");
    await user.clear(campoConvidados);
    await user.type(campoConvidados, "120 pax");

    const comoEscala = screen.getByLabelText(/Como escala Arranjos de mesa/);
    await user.selectOptions(comoEscala, "por-mesa");

    const unitario = screen.getByLabelText(/Preço por mesa de Arranjos de mesa/);
    await user.clear(unitario);
    await user.type(unitario, "45");
    await user.tab();

    // 120 convidados → 12 mesas de 10, a 45 € cada.
    await waitFor(() => expect(screen.getByText(/12 mesas × /)).toBeTruthy());
  });

  it("uma linha fixa não mostra fórmula nenhuma", async () => {
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /\+ Adicionar item/ }));
    expect(screen.queryByText(/mesas × /)).toBeNull();
    expect(screen.queryByText(/pessoas × /)).toBeNull();
  });
});

// ── A pré-visualização das fotos do documento ──────────────────────────────
describe("uma célula que não conseguiu desenhar a foto", () => {
  /**
   * O `jsdom` não descarrega imagens: um `new Image()` nunca dispara `load` nem
   * `error`. E o estúdio pré-carrega a URL nova antes de a trocar no ecrã (para
   * a célula não piscar), portanto SEM este duplo a troca nunca se observa e
   * este teste mediria o nada.
   */
  beforeEach(() => {
    class ImagemQueCarrega {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      decoding = "";
      set src(_v: string) {
        setTimeout(() => this.onload?.(), 0);
      }
    }
    vi.stubGlobal("Image", ImagemQueCarrega);
  });
  afterEach(() => vi.unstubAllGlobals());

  /** Um rascunho com UMA foto no mood board e os dois URLs dela: o que se
   *  desenha (a miniatura) e o plano B (o original). */
  function seedComFoto() {
    seedDraft(1);
    localStorage.setItem(
      `${DRAFT_KEY}:meta`,
      JSON.stringify({
        urls: { "board/foto-0.jpg": "https://storage.test/mini.jpg" },
        originais: { "board/foto-0.jpg": "https://storage.test/original.jpg" },
      }),
    );
  }

  /**
   * ════════════════════════════════════════════════════════════════════════
   * O DEFEITO QUE ELA VIU: "Guardada, mas não foi possível pré-visualizar"
   * ════════════════════════════════════════════════════════════════════════
   *
   * As duas células que desenham fotos no estúdio guardavam "falhou" num
   * estado que ninguém voltava a limpar. Bastava UM erro — um URL assinado que
   * expirou, um instante sem rede, um service worker a servir uma resposta
   * estragada — para a célula ficar para sempre com aquela frase. A fotografia
   * estava lá e o URL seguinte estava bom; a célula é que já não olhava.
   *
   * E não havia plano B: uma miniatura que não existe (assinar um caminho no
   * Storage NÃO garante que o ficheiro lá está) dava a célula por perdida com
   * a fotografia inteira a um pedido de distância.
   *
   * Os dois testes abaixo são o defeito, um de cada vez.
   */

  /** A célula da capa, e o `<img>` lá dentro. */
  const imagemDaCapa = () =>
    screen
      .queryAllByRole("button", { name: "Remover imagem" })
      .map((b) => b.parentElement!.querySelector("img"))
      .filter(Boolean)[0] as HTMLImageElement | undefined;

  const avisoDeFalha = () => screen.queryByText(/não foi possível pré-visualizar/i);

  it("tenta o ORIGINAL antes de desistir", async () => {
    seedComFoto();
    renderStudio();
    const img = await waitFor(() => {
      const i = imagemDaCapa();
      expect(i).toBeTruthy();
      return i!;
    });
    const primeiro = img.getAttribute("src");

    // A miniatura falha (é o caso de a derivada não existir no bucket).
    await act(async () => {
      img.dispatchEvent(new Event("error"));
    });

    // NÃO desiste: passa a pedir outro URL — o original.
    await waitFor(() => {
      const agora = imagemDaCapa();
      expect(agora, "a célula desistiu à primeira falha").toBeTruthy();
      expect(agora!.getAttribute("src")).not.toBe(primeiro);
    });
    expect(avisoDeFalha()).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS «VALORES ADICIONAIS» ENTRAM NO TOTAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «colocámos a deslocação da equipa Líquen, que são mil
 * quinhentos e cinquenta euros, e depois no total, naquela aba onde diz total
 * IVA e validade, isto não soma.»
 *
 * O que estava em jogo não era só o ecrã: este total é o PREÇO FINAL do pedido,
 * e é dele que saem o sinal de 30% e a factura. Uma deslocação escrita aqui
 * aparecia na proposta que o cliente lê e não entrava em nada do que se cobra.
 */
describe("os valores adicionais somam ao total", () => {
  const comPreco = (preco?: number) => ({ ...quote, quotedPrice: preco }) as Quote;
  const desenhar = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );

  async function escreverExtra(valor: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
    const campo = await screen.findByLabelText(/Valor da linha adicional/i);
    await user.type(campo, valor);
    return user;
  }

  it("escrever 1550 num valor adicional leva o total de 6875 a 8425", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
  });

  /**
   * A razão de a conta ser feita pela DIFERENÇA e não pelo valor inteiro:
   * escrever «1550» são quatro teclas, e quatro somas do valor inteiro davam um
   * total absurdo. Este teste é o que garante que a tecla a tecla converge.
   */
  it("escrever tecla a tecla não soma quatro vezes", async () => {
    desenhar(comPreco(1000));
    await escreverExtra("100");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("1100");
  });

  it("apagar o valor adicional devolve o total ao que era", async () => {
    desenhar(comPreco(6875));
    const user = await escreverExtra("1550");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    await user.click(await screen.findByRole("button", { name: /Remover linha adicional/i }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
  });

  it("um valor sem número («a definir») não mexe no total", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("a definir");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
  });

  it("a conta fica à vista, para não ter de ser feita de cabeça", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    expect(await screen.findByText(/Somado ao total:/i)).toBeTruthy();
  });

  it("e chega ao PREÇO FINAL do pedido — é dele que sai a factura", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    await vi.advanceTimersByTimeAsync(800);
    const gravacoes = fetchMock.mock.calls.filter(([, init]) => init?.method === "PATCH");
    expect(JSON.parse(String(gravacoes.at(-1)?.[1]?.body))).toMatchObject({ quotedPrice: 8425 });
    vi.useRealTimers();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ENVIADA» SÓ QUANDO FOI MESMO ENVIADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um pedido sem email de cliente válido devolvia 200 com `emailed:false` — e o
 * ecrã mostrava um aviso cinzento, marcava o passo como «Proposta enviada ✓» e
 * seguia. Ela ficava convencida de que tinha ido; o casal não recebia nada.
 *
 * É, ao pé da letra, «não dá para mandar a proposta para o cliente» — e da pior
 * maneira, porque nem sequer parecia falhar.
 */
describe("o envio não se dá por feito quando o email não saiu", () => {
  const comPreco = (preco?: number) => ({ ...quote, quotedPrice: preco }) as Quote;

  function desenhar(q: Quote) {
    return render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );
  }

  it("diz que o email NÃO saiu, e não dá o passo por feito", async () => {
    propostaDoc = reply({
      json: {
        ok: true,
        emailed: false,
        emailError: "O pedido não tem um email de cliente válido.",
        missingImages: 0,
        truncations: [],
      },
    });
    desenhar(comPreco(3000));
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent ?? "").toMatch(/email de cliente válido/i);
    // E o passo NÃO fica dado por feito: o botão continua lá para ela poder
    // corrigir o contacto e enviar a sério.
    expect(screen.queryByText(/Proposta enviada ✓/)).toBeNull();
  });
});

/**
 * Cada falha do envio tinha a MESMA frase de oito palavras, e a pior delas — o
 * tempo esgotado — nem sequer traz corpo na resposta para se poder explicar.
 */
describe("porqueFalhouOEnvio", () => {
  it("o tempo esgotado diz que demorou demais E o que fazer", () => {
    for (const status of [504, 502, 408]) {
      const frase = porqueFalhouOEnvio(status);
      expect(frase, String(status)).toMatch(/demor/i);
      expect(frase, String(status)).toMatch(/fotografias|fotos/i);
    }
  });

  it("a sessão expirada tranquiliza sobre o rascunho", () => {
    expect(porqueFalhouOEnvio(401)).toMatch(/rascunho está guardado/i);
  });

  it("e o que não se conhece leva o número, para se poder procurar", () => {
    expect(porqueFalhouOEnvio(500)).toContain("500");
  });

  it("nenhuma das frases é a antiga de oito palavras", () => {
    for (const status of [504, 401, 413, 503]) {
      expect(porqueFalhouOEnvio(status)).not.toBe("Não foi possível enviar a proposta.");
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NÚMERO É UM SÓ — E O RASCUNHO DO SERVIDOR NÃO PODE DESFAZÊ-LO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O percurso: ela corrige o preço final de 8.100 para 9.400 na Gestão do
 * pedido, sai, volta ao estúdio, e o campo volta sozinho a 8.100. Envia, e a
 * correcção desaparece dos dois lados.
 *
 * A corrida: o valor do PEDIDO é aplicado ao montar; o rascunho do servidor
 * chega 100–300 ms depois e reescreve `totalAmount`. E ganha quase sempre,
 * porque o carimbo local é escrito ANTES do PUT e o `updatedAt` do servidor
 * DEPOIS — a comparação de datas está sempre a favor do servidor.
 */
describe("o preço do pedido sobrevive ao rascunho do servidor", () => {
  /** Um rascunho de servidor com um valor JÁ ULTRAPASSADO lá dentro. */
  function rascunhoComValorVelho() {
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        // Marca para se saber que o rascunho do servidor JÁ chegou.
        location: "Herdade do Servidor",
        guests: "80 pax",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 8100,
        totalVatMode: "acrescer",
        totalText: "8100,00 € + IVA",
        totalLabel: "Valor Total Decoração",
      },
    };
  }

  const comPrecoCorrigido = { ...quote, quotedPrice: 9400 } as Quote;

  const renderComPreco = () =>
    render(
      <ToastProvider>
        <ProposalStudio quote={comPrecoCorrigido} />
      </ToastProvider>,
    );

  it("o campo do valor continua a dizer o que a Gestão do pedido diz", async () => {
    rascunhoComValorVelho();
    renderComPreco();
    // Esperar que o rascunho do servidor tenha MESMO chegado — senão o teste
    // passava por não ter havido corrida nenhuma.
    await screen.findByDisplayValue("Herdade do Servidor");
    expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("9400");
  });

  it("e o documento que se grava leva o valor corrigido, não o do rascunho", async () => {
    rascunhoComValorVelho();
    renderComPreco();
    await screen.findByDisplayValue("Herdade do Servidor");
    // 8100 + IVA são 9963; 9400 + IVA são 11562. É pelo valor do documento que
    // se vê qual dos dois ficou.
    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.length).toBeGreaterThan(0);
      expect(gravados[gravados.length - 1]).toContain('"totalAmount":9400');
    });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REPOR UMA VERSÃO E COPIAR UMA PROPOSTA TAMBÉM MEXEM NO PREÇO DO PEDIDO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Escrever no campo do valor GRAVA no pedido — é a promessa escrita ao lado do
 * campo: «Há um número só». Repor uma versão antiga e copiar uma proposta
 * trocavam o documento inteiro (valor incluído) e não gravavam nada: o estúdio
 * passava a dizer 8.000 e a Gestão do pedido, o Kanban e o dossier continuavam
 * a dizer 9.400 até ela enviar.
 */
describe("repor e copiar gravam o preço no pedido", () => {
  const comPreco = { ...quote, quotedPrice: 9400 } as Quote;

  /** Os `quotedPrice` que foram gravados no pedido, pela ordem. */
  function precosGravados(): unknown[] {
    return corpos(`/api/orcamento/${quote.id}`, "PATCH")
      .map((b) => {
        try {
          return (JSON.parse(b) as { quotedPrice?: unknown }).quotedPrice;
        } catch {
          return undefined;
        }
      })
      .filter((v) => v !== undefined);
  }

  it("repor uma versão antiga grava o valor dessa versão", async () => {
    versoesServidor = [
      {
        id: "v1",
        enviadaEm: "2026-02-01T10:00:00.000Z",
        total: 9840,
        estado: "enviada",
        mudancas: [],
        resumo: "Primeira",
      },
    ];
    docsDeVersao.v1 = {
      template: "decoracao",
      ref: "PO Decoração v1",
      clientNames: "Maria & Zé",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "80 pax",
      serviceGroups: [],
      moodBoards: [],
      budgetItems: [],
      coverImages: ["", ""],
      totalAmount: 8000,
      totalVatMode: "acrescer",
      totalLabel: "Valor Total Decoração",
    };
    render(
      <ToastProvider>
        <ProposalStudio quote={comPreco} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    // O painel das versões vive no passo do envio.
    await user.click(await screen.findByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Repor esta versão/ }));

    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("8000");
    });
    await waitFor(() => expect(precosGravados()).toContain(8000));
  });

  it("copiar uma proposta grava o valor copiado e arruma o campo", async () => {
    propostasServidor = [
      {
        id: "p1",
        quoteId: "q9",
        clientName: "Rita & Paulo",
        createdAt: "2026-01-05T10:00:00.000Z",
        status: "aceite",
        temDoc: true,
        eventType: "Casamento",
        eventDate: "1 de junho de 2026",
        location: "Estremoz",
        guests: "100 pax",
        grupos: 1,
        moodBoards: 0,
        linhas: 1,
        fotos: 0,
      },
    ];
    copiaServidor = {
      nomeDaOrigem: "Rita & Paulo",
      camposAMudar: [],
      fotosCopiadas: 0,
      fotosPartilhadas: 0,
      doc: {
        template: "decoracao",
        ref: "",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração Copiada", items: [] }],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 6000,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      },
    };
    render(
      <ToastProvider>
        <ProposalStudio quote={comPreco} />
      </ToastProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Criar a partir de…/ }));
    await user.click(await screen.findByRole("button", { name: /Rita & Paulo/ }));
    await screen.findByDisplayValue("Decoração Copiada");

    // O campo mostrava o número ANTERIOR enquanto o documento já tinha outro.
    await waitFor(() => {
      expect((screen.getByLabelText(/Valor \(sem IVA\)/) as HTMLInputElement).value).toBe("6000");
    });
    await waitFor(() => expect(precosGravados()).toContain(6000));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TROCAR DE CLIENTE A MEIO DE UMA FRASE NÃO PODE APAGAR A FRASE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A gravação é um `setTimeout` a 800 ms e a limpeza corre em QUALQUER
 * desmontagem. O «Trocar de cliente», o link «Rápida» e mudar de separador
 * desmontam o estúdio — e cancelavam a gravação. O indicador continuava a
 * dizer «Guardado às 14:32», e ao voltar faltava a última linha escrita.
 */
describe("o rascunho por gravar não se perde ao desmontar", () => {
  it("desmontar dentro dos 800 ms grava o que estava escrito", async () => {
    const { unmount } = renderStudio();
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Clientes");
    // Uma gravação já aconteceu ao semear o rascunho; contam-se as de agora.
    const antes = corpos("proposta-rascunho").length;
    await user.type(campo, "Beatriz e Nuno");
    unmount();
    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.length).toBeGreaterThan(antes);
      expect(gravados[gravados.length - 1]).toContain("Beatriz e Nuno");
    });
    expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("Beatriz e Nuno");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODELOS PARCIAIS DE MOOD BOARD
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * (a) As fotos de um modelo vêm da pasta de OUTRO pedido. Inseridas tal e qual,
 *     o documento novo aponta para lá — as células abrem sem miniatura, e no
 *     dia em que esse pedido for apagado a proposta fica sem imagens.
 * (b) O «Guardar como modelo» era único para a secção inteira e guardava sempre
 *     o PRIMEIRO mood board com título. Não havia maneira de guardar o terceiro.
 */
describe("modelos parciais de mood board", () => {
  function seedComTresBoards() {
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
          { title: "Cerimónia", annotation: "", images: [] },
          { title: "Cocktail", annotation: "", images: [] },
          { title: "Jantar", annotation: "", images: [] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
  }

  it("dá para guardar o TERCEIRO mood board, não só o primeiro", async () => {
    seedComTresBoards();
    renderStudio();
    const user = userEvent.setup();
    const guardar = await screen.findAllByRole("button", { name: /Guardar como modelo/ });
    // Um controlo por mood board (mais o da proposta inteira, no cabeçalho) —
    // senão o terceiro board não tem como ser guardado de todo.
    expect(guardar.length).toBeGreaterThanOrEqual(4);
    await user.click(guardar[guardar.length - 1]);
    const nome = await screen.findByLabelText(/Nome do modelo/);
    // O nome sugerido é o do board em que ela carregou.
    expect((nome as HTMLInputElement).value).toBe("Jantar");
    await user.click(screen.getByRole("button", { name: /^Guardar$/ }));
    await waitFor(() => {
      const corpo = corpos("/api/propostas/modelos", "POST").at(-1) ?? "";
      expect(corpo).toContain("Jantar");
      expect(corpo).not.toContain("Cerimónia");
    });
  });

  it("as fotos de um modelo são recopiadas para a pasta deste pedido", async () => {
    seedComTresBoards();
    modelosServidor = [
      {
        id: "mb1",
        nome: "Cerimónia na igreja",
        tipo: "moodboard",
        moodboard: {
          title: "Cerimónia na igreja",
          annotation: "",
          // A pasta de OUTRO pedido — é isto que não pode ficar no documento.
          images: ["LQ-999/aaa.jpg", "LQ-999/bbb.jpg"],
        },
      },
    ];
    copiaServidor = {
      fotos: { "LQ-999/aaa.jpg": "q1/nova-1.jpg", "LQ-999/bbb.jpg": "q1/nova-2.jpg" },
    };
    renderStudio();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: /De um modelo…/ }))[0]);
    await user.click(await screen.findByRole("button", { name: "Cerimónia na igreja" }));

    // Pediu a recópia…
    await waitFor(() => {
      const corpo = corpos("/api/propostas/copiar", "POST").at(-1) ?? "";
      expect(corpo).toContain("LQ-999/aaa.jpg");
    });
    // …e o documento gravado já não aponta para a pasta do outro pedido.
    await waitFor(() => {
      const gravado = corpos("proposta-rascunho").at(-1) ?? "";
      expect(gravado).toContain("q1/nova-1.jpg");
      expect(gravado).not.toContain("LQ-999/aaa.jpg");
    });
  });
});
