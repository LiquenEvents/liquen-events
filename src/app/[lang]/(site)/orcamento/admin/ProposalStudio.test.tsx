// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import ProposalStudio, {
  avisoDeConteudoIncompleto,
  contagemDePrecos,
  cortesDoCabecalho,
  modoDoAdicional,
  porqueFalhouOEnvio,
  textoDoAdicional,
  textoDoTotal,
} from "./ProposalStudio";
import { totaisDaProposta } from "@/lib/proposal-budget";
// A MESMA geometria que o gerador usa. As caixas esperadas não se escrevem à
// mão: sai daqui o que a página desenha, e é com isso que a grelha do estúdio
// tem de concordar.
import {
  ASPETO_POR_OMISSAO,
  alturaDaLegenda,
  aspetoDaCaixa,
  caixasDoMoodboard,
  linhasDaLegendaAprox,
} from "@/lib/proposal-geometria";
import { parseMoneyText } from "@/lib/proposal-doc";
import { eur } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";

/** O runtime de importação do seletor, reduzido aos três momentos que o estúdio
 *  tem de saber tratar: o lugar é RESERVADO no instante do clique, a cópia
 *  CONFIRMA (e traz o caminho definitivo), ou FALHA. É por aqui que uma foto
 *  entra num mood board sem passar por um ficheiro real (o carregamento
 *  verdadeiro precisa de canvas/worker, que o jsdom não tem). */
const seletor = vi.hoisted(() => ({ marcadores: [] as string[], n: 0 }));

interface FotoImportada {
  path: string;
  url: string;
  thumbUrl?: string;
  sourcePath?: string;
  marcador?: string;
}

vi.mock("./ThemePicker", () => ({
  default: ({
    onPicked,
    onReserve,
    onDropped,
  }: {
    onPicked: (imgs: FotoImportada[]) => void;
    onReserve?: (r: { marcador: string; thumbUrl?: string; sourcePath: string }[]) => void;
    onDropped?: (marcadores: string[]) => void;
  }) => (
    <>
      <button
        type="button"
        onClick={() => {
          const n = ++seletor.n;
          const marcador = `pending:tok-${n}`;
          seletor.marcadores.push(marcador);
          onReserve?.([
            { marcador, thumbUrl: `tema-thumb-${n}`, sourcePath: `t1/origem-${n}.jpg` },
          ]);
        }}
      >
        reservar-foto-de-teste
      </button>
      <button
        type="button"
        onClick={() => {
          // Confirma a ÚLTIMA reservada — é o que deixa verificar que a troca é
          // no lugar dela, e não no fim da lista.
          const marcador = seletor.marcadores.pop();
          const n = marcador?.replace("pending:tok-", "") ?? "0";
          onPicked([
            {
              path: `LQ-001/copia-${n}.jpg`,
              url: `u-${n}`,
              thumbUrl: `copia-thumb-${n}`,
              sourcePath: `t1/origem-${n}.jpg`,
              marcador,
            },
          ]);
        }}
      >
        confirmar-foto-de-teste
      </button>
      <button
        type="button"
        onClick={() => {
          const marcador = seletor.marcadores.pop();
          if (marcador) onDropped?.([marcador]);
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
 *  de as carregar (o estúdio restaura o rascunho local ao abrir).
 *
 *  `extra` acrescenta campos ao mood board — é como se semeia um rascunho que já
 *  traz uma disposição escolhida à mão (`{ layout: "mosaico" }`), que é o caso
 *  que distingue «apagar a escolha» de «nunca ter havido escolha». */
function seedDraft(n: number, extra: Record<string, unknown> = {}) {
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
          ...extra,
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
function reply(body: {
  ok?: boolean;
  /** O código, quando não basta «correu bem / não correu» — um 503 do rascunho
   *  não é a mesma coisa que um 500, e o estúdio trata-os de maneira diferente. */
  status?: number;
  json?: unknown;
  headers?: Record<string, string>;
}): Response {
  const headers = body.headers ?? {};
  return {
    ok: body.ok ?? true,
    status: body.status ?? (body.ok === false ? 500 : 200),
    headers: { get: (k: string) => headers[k] ?? null },
    json: async () => body.json ?? {},
    blob: async () => new Blob(["%PDF-"], { type: "application/pdf" }),
  } as unknown as Response;
}

/** O que a rota `proposta-doc` devolve neste teste (pré-visualização e envio). */
let propostaDoc: Response = reply({ headers: {}, json: { ok: true, emailed: true } });
/**
 * O RASCUNHO DO EMAIL que o servidor prepara para o passo 3.
 *
 * `null` = a rota falha (409, rede em baixo): o painel do email mostra a frase
 * e o envio segue sem corpo, exactamente como antes deste ecrã existir.
 */
let rascunhoDoEmail: Record<string, unknown> | null = {
  rascunho: {
    chave: "registo-formal",
    nome: "Registo formal",
    assunto: "A vossa proposta — Líquen Events",
    texto: "Olá Maria & Zé,\n\nSegue a proposta: {{link_proposta}}",
    origem: "guardado",
    avisos: [],
  },
  porPreencher: [],
  porOmissao: "registo-formal",
  remetente: "Catarina Gaspar",
  destinatario: { nome: "Maria & Zé", email: "cliente@exemplo.pt" },
  modelos: [{ chave: "registo-formal", nome: "Registo formal", temEsteIdioma: true }],
};
/** O rascunho que o SERVIDOR tem guardado (null = não tem nenhum). */
let rascunhoServidor: { doc: unknown; updatedAt: string } | null = null;
/**
 * Um portão para segurar a LEITURA do rascunho.
 *
 * O merge do rascunho chega 100–300 ms depois de o ecrã abrir, e é nessa
 * janela que ela começa a escrever. Sem uma forma de segurar a resposta, o
 * duplo devolve-a antes de o teste conseguir carregar uma tecla — e o defeito
 * que se quer prender fica por fora do alcance do teste.
 */
let portaoDoRascunho: Promise<void> | null = null;
let abrirPortaoDoRascunho: (() => void) | null = null;
/**
 * O que o servidor responde ao PUT do rascunho.
 *
 * Por omissão GUARDA — que é o caso normal, e era o que este duplo não fazia:
 * respondia sempre `ok: false`, ou seja, todos estes testes corriam com o
 * servidor a recusar a gravação sem nada nem ninguém dar por isso. Era
 * exactamente o problema real, reproduzido aqui dentro sem intenção.
 * A recusa passa a ter de ser PEDIDA, e há testes que a pedem.
 */
let gravacaoDoRascunho: () => Response = () =>
  reply({ json: { ok: true, guardado: true, updatedAt: new Date().toISOString() } });
/** A LEITURA do rascunho falha (rede em baixo). Diferente de «não há rascunho». */
let leituraDoRascunhoFalha = false;
/** As versões já enviadas, e o documento de cada uma (`?doc=<id>`). */
let versoesServidor: unknown[] = [];
let docsDeVersao: Record<string, unknown> = {};
/** As propostas anteriores e os modelos, para o «Criar a partir de…». */
let propostasServidor: unknown[] = [];
let modelosServidor: unknown[] = [];
/** O que /api/propostas/copiar devolve — a cópia inteira ou o mapa das fotos. */
let copiaServidor: unknown = {};
/** O servidor tem serviço de tradução configurado? Por omissão NÃO — é o
 *  estado em que a maior parte destes testes corre, e o lado seguro. */
let traducaoLigadaNoServidor = false;
/** O que a rota da tradução responde ao POST. */
let traducaoResponde: (textos: string[]) => Response = (textos) =>
  reply({ json: { textos: textos.map((t) => `EN: ${t}`) } });
/** As fotos que o servidor conhece para este pedido (`GET /assets`). */
let assetsServidor: { path: string; url: string; thumbUrl?: string; cor?: string }[] = [];
/**
 * O `/assets` FALHA (Storage em baixo, sessão caducada, rede a cair).
 *
 * É o caso que deixava a grelha inteira com caixas cinzentas a dizer «Imagem»,
 * para sempre e sem uma palavra — ver o bloco «porque é que ela não vê as
 * fotografias».
 */
let assetsFalham = false;
/** Segura a resposta do `/assets`, para se poder olhar para o ecrã ENQUANTO a
 *  lista vem a caminho. É nesse intervalo que ela tirou as capturas. */
let travaDosAssets: Promise<void> | null = null;
function segurarOsAssets(): () => void {
  let abrir = () => {};
  travaDosAssets = new Promise<void>((r) => (abrir = r));
  return () => {
    abrir();
    travaDosAssets = null;
  };
}
/** Tudo o que saiu daqui — é onde se lê o que foi GRAVADO e o que foi ENVIADO. */
let pedidos: { url: string; init?: RequestInit }[] = [];
const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const metodo = init?.method ?? "GET";
  pedidos.push({ url, init });
  if (url.includes("proposta-doc")) return propostaDoc;
  // Antes do `proposta-rascunho`: os dois têm «rascunho» no nome.
  if (url.includes("email-rascunho")) {
    return rascunhoDoEmail
      ? reply({ json: rascunhoDoEmail })
      : reply({
          ok: false,
          status: 409,
          json: { error: "Não há nenhum modelo «registo-formal»." },
        });
  }
  if (url.includes("proposta-rascunho")) {
    // A leitura RESPONDE, mesmo quando não há rascunho nenhum — «não há» é uma
    // resposta e é diferente de «não se conseguiu perguntar». É essa diferença
    // que decide se o estúdio pode reenviar o que tem preso no navegador.
    if (metodo === "GET") {
      if (portaoDoRascunho) await portaoDoRascunho;
      return leituraDoRascunhoFalha
        ? reply({ ok: false })
        : reply({ json: { ok: true, draft: rascunhoServidor } });
    }
    if (metodo === "PUT") return gravacaoDoRascunho();
    return reply({ ok: false });
  }
  if (url.includes("/versoes")) {
    const qual = /[?&]doc=([^&]+)/.exec(url);
    if (qual) return reply({ json: { doc: docsDeVersao[qual[1]] ?? null } });
    return reply({ json: { versoes: versoesServidor } });
  }
  // Antes do `/propostas` genérico: senão a cópia caía na lista de resumos.
  if (url.includes("/propostas/copiar")) return reply({ json: copiaServidor });
  // A tradução automática: o GET diz se o SERVIDOR tem serviço configurado (a
  // chave nunca chega ao browser), o POST devolve os textos traduzidos.
  if (url.includes("/propostas/traduzir")) {
    if (metodo === "GET") return reply({ json: { ligada: traducaoLigadaNoServidor } });
    const enviados = (JSON.parse(String(init?.body ?? "{}")).textos ?? []) as string[];
    return traducaoResponde(enviados);
  }
  if (url.includes("/propostas/modelos")) return reply({ json: { modelos: modelosServidor } });
  if (url.includes("/api/propostas?")) return reply({ json: propostasServidor });
  // As fotos que o SERVIDOR conhece para este pedido, com as assinaturas
  // frescas. É por aqui que a grelha volta a ter miniaturas num navegador que
  // nunca viu esta proposta — ver «o mesmo pedido, no outro endereço».
  if (url.includes("/assets")) {
    if (travaDosAssets) await travaDosAssets;
    if (assetsFalham) return reply({ ok: false, status: 500 });
    return reply({ json: { images: assetsServidor } });
  }
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
  seletor.marcadores.length = 0;
  seletor.n = 0;
  pedidos = [];
  propostaDoc = reply({ headers: {}, json: { ok: true, emailed: true } });
  rascunhoServidor = null;
  portaoDoRascunho = null;
  abrirPortaoDoRascunho = null;
  gravacaoDoRascunho = () =>
    reply({ json: { ok: true, guardado: true, updatedAt: new Date().toISOString() } });
  leituraDoRascunhoFalha = false;
  rascunhoDoEmail = {
    rascunho: {
      chave: "registo-formal",
      nome: "Registo formal",
      assunto: "A vossa proposta — Líquen Events",
      texto: "Olá Maria & Zé,\n\nSegue a proposta: {{link_proposta}}",
      origem: "guardado",
      avisos: [],
    },
    porPreencher: [],
    porOmissao: "registo-formal",
    remetente: "Catarina Gaspar",
    destinatario: { nome: "Maria & Zé", email: "cliente@exemplo.pt" },
    modelos: [{ chave: "registo-formal", nome: "Registo formal", temEsteIdioma: true }],
  };
  versoesServidor = [];
  docsDeVersao = {};
  propostasServidor = [];
  modelosServidor = [];
  copiaServidor = {};
  assetsServidor = [];
  assetsFalham = false;
  travaDosAssets = null;
  traducaoLigadaNoServidor = false;
  traducaoResponde = (textos) => reply({ json: { textos: textos.map((t) => `EN: ${t}`) } });
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

  /**
   * ── O CONTADOR, NO LUGAR DA SOMA ──────────────────────────────────────
   * «Soma das linhas: 3.250,00 €» saiu daqui: era uma das TRÊS somas que
   * apareciam ao mesmo tempo no ecrã, e a soma verdadeira vive agora no bloco
   * de totais. O que fica é o que só este sítio pode responder — quantas destas
   * caixas estão mesmo preenchidas —, que é a outra metade da resposta ao
   * `placeholder="900"`: tirar o número falso e dizer o número verdadeiro.
   */
  it("conta quantas linhas têm preço, em vez de repetir a soma", async () => {
    seedComPrecos(3250);
    renderStudio();
    expect(await screen.findByText("2 de 2 linhas com preço")).toBeTruthy();
    expect(screen.queryByText(/^Soma das linhas:/)).toBeNull();
  });

  it("com umas linhas por orçamentar, diz que a soma está incompleta", async () => {
    // Duas linhas, uma só com preço: o caso em que a soma dá um número
    // plausível e errado por baixo.
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
        budgetAmounts: [900, null],
        coverImages: ["", ""],
        totalAmount: 900,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    renderStudio();
    expect(await screen.findByText("1 de 2 linhas com preço")).toBeTruthy();
    expect(await screen.findByText(/a soma dos serviços está incompleta/i)).toBeTruthy();
  });

  /**
   * ── «0 DE 4 LINHAS COM PREÇO» NUMA PROPOSTA QUE ESTÁ CERTA ───────────────
   * Palavras dela, de uma fotografia do telemóvel: o contador lia-se como
   * erro. E lia-se bem — «0 de 2» tem a forma de um contador por preencher.
   * Só que há propostas em que as linhas NUNCA levam valor: o preço vive no
   * total e as linhas são a lista do que está incluído, que é o formato das
   * propostas desta casa há anos.
   *
   * Distingue-se por um facto, não por um palpite: nenhuma linha com preço E
   * um total escrito.
   */
  it("com o preço só no total, diz onde ele está em vez de contar «0 de 2»", async () => {
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
        budgetAmounts: [null, null],
        coverImages: ["", ""],
        totalAmount: 12500,
        totalVatMode: "acrescer",
        totalLabel: "Valor Total Decoração",
      }),
    );
    renderStudio();
    expect(
      await screen.findByText("Preço definido no total — as linhas não levam valor"),
    ).toBeTruthy();
    expect(screen.queryByText("0 de 2 linhas com preço")).toBeNull();
  });

  it("com todas as linhas orçamentadas, não avisa de soma incompleta", async () => {
    seedComPrecos(3250);
    renderStudio();
    await screen.findByText("2 de 2 linhas com preço");
    expect(screen.queryByText(/a soma dos serviços está incompleta/i)).toBeNull();
  });

  /**
   * O `placeholder="900"` era a mentira que fazia quatro campos vazios
   * parecerem preenchidos. Palavras dela: «mais cedo ou mais tarde alguém pensa
   * que já está preenchido».
   */
  it("um campo de preço vazio não sugere um número", async () => {
    seedComPrecos(3250);
    renderStudio();
    const campo = await screen.findByLabelText(/^Preço de Decor Cerimónia/);
    expect(campo.getAttribute("placeholder")).toBe("sem preço");
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
    await screen.findByText("2 de 2 linhas com preço");
    expect(screen.queryByText(/difere da soma das linhas/i)).toBeNull();
  });

  /**
   * ── «USAR X €» É UM BOTÃO PERIGOSO ────────────────────────────────────
   * Palavras dela. Escrevia o número novo por cima do preço final — o valor de
   * que saem a fatura, o sinal e o saldo — sem mostrar o que ia desaparecer.
   * Estes três testes prendem as três coisas que passou a fazer: perguntar com
   * os dois valores, deixar anular, e ficar no histórico do pedido.
   */
  it("o botão do aviso pergunta primeiro, com os dois valores à vista", async () => {
    seedComPrecos(4000);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    const pergunta = await screen.findByText(/Substituir o total de/i);
    expect(pergunta.textContent).toMatch(/4\s?000,00/);
    expect(pergunta.textContent).toMatch(/3\s?250,00/);
    // E ainda não escreveu nada.
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
  });

  it("confirmado, arruma o total e deixa dez segundos para anular", async () => {
    seedComPrecos(4000);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await user.click(await screen.findByRole("button", { name: /^Substituir$/ }));
    expect(screen.queryByText(/difere da soma das linhas/i)).toBeNull();
    expect(await screen.findByText(/Pode anular durante/i)).toBeTruthy();
    await user.click(await screen.findByRole("button", { name: /^Anular$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
  });

  it("e fica escrito no histórico do pedido", async () => {
    seedComPrecos(4000);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await user.click(await screen.findByRole("button", { name: /^Substituir$/ }));
    const registos = fetchMock.mock.calls.filter(([, init]) =>
      String(init?.body ?? "").includes("activityLogAppend"),
    );
    expect(registos.length).toBeGreaterThan(0);
    const corpo = JSON.parse(String(registos.at(-1)?.[1]?.body));
    expect(corpo.activityLogAppend[0].kind).toBe("price_set");
    expect(corpo.activityLogAppend[0].summary).toMatch(/3\s?250,00/);
  });

  /**
   * A pergunta guarda o gesto que a vai aplicar, composto com os números
   * daquele instante. Escrever entretanto no formulário torna-a uma pergunta
   * sobre um documento que já não existe — e aplicá-la escrevia por cima do
   * que se acabou de escrever.
   */
  it("a pergunta caduca se o documento mudar entretanto", async () => {
    seedComPrecos(4000);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await screen.findByText(/Substituir o total de/i);
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await waitFor(() => expect(screen.queryByText(/Substituir o total de/i)).toBeNull());
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
  });

  it("cancelado, não mexe no total nem escreve no histórico", async () => {
    seedComPrecos(4000);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Usar/ }));
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("4000");
    expect(await screen.findByText(/difere da soma das linhas/i)).toBeTruthy();
    expect(
      fetchMock.mock.calls.filter(([, init]) =>
        String(init?.body ?? "").includes("activityLogAppend"),
      ),
    ).toHaveLength(0);
  });

  /**
   * ── O BLOCO DE TOTAIS BATE CERTO COM `totaisDaProposta` ────────────────
   * É a razão de ser do bloco: os números do ecrã e os do papel saem da MESMA
   * função. Este teste compara linha a linha com o que a biblioteca devolve —
   * se alguém voltar a fazer contas na marcação, falha aqui antes de falhar
   * numa proposta.
   */
  it("o bloco de totais mostra exactamente o que `totaisDaProposta` devolve", async () => {
    seedComPrecos(4000);
    renderStudio();
    const doc = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    const esperado = totaisDaProposta(doc, 30);
    const bloco = (await screen.findByText("Totais")).parentElement!;
    for (const [rotulo, valor] of [
      ["Subtotal dos serviços", esperado.servicos],
      ["Valores adicionais", esperado.adicionais],
      ["Total sem IVA", esperado.total],
      ["Total a pagar", esperado.aPagar],
      ["Saldo 70%", esperado.saldo],
    ] as const) {
      const dt = within(bloco).getByText(rotulo);
      expect(dt.nextElementSibling?.textContent).toBe(eur(valor));
    }
    expect(within(bloco).getByText(`IVA (23%)`).nextElementSibling?.textContent).toBe(
      eur(esperado.iva),
    );
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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A COLUNA DE PREÇOS DE ORGANIZAÇÃO, DESALINHADA, VISTA ANTES DE ENVIAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O caso é o de uma proposta gerada a sério: 6.500 + 1.850 impressos numa
 * coluna, por baixo de um TOTAL de 12.500. São 4.150 € que o casal encontra ao
 * somar a coluna e que o documento não explica.
 *
 * A verificação vive em `totaisDaProposta` (com o porquê ao lado), e o que
 * ESTE teste prende é a outra metade: que ela apareça AQUI, no ecrã onde os
 * números se escrevem, e não só no registo do servidor depois de o PDF estar
 * feito. Um aviso que só se lê depois de o documento sair não é uma rede.
 */
describe("as linhas de Organização que não somam o total", () => {
  /** O rascunho da proposta do relatório, à letra. */
  function seedOrganizacao(over: Record<string, unknown> = {}) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "organizacao",
        ref: "PO Organização",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        budgetRows: [
          { item: "Coordenação e planeamento integral", price: "6.500,00 €" },
          { item: "Coordenação no dia do evento", price: "1.850,00 € + IVA (a confirmar)" },
          { item: "Gestão de fornecedores e contratos", price: "[Valor]" },
          { item: "Assessoria de imagem e papelaria", price: "" },
        ],
        coverImages: ["", ""],
        totalEstimatedText: "12.500,00 €",
        totalAmount: 12500,
        totalVatMode: "acrescer",
        ...over,
      }),
    );
  }

  it("acende o aviso no bloco de totais, com os três números", async () => {
    seedOrganizacao();
    renderStudio();
    const aviso = await screen.findByText(/As contas não fecham/);
    // O que a coluna soma, o que o quadro fecha, e a diferença que fica por
    // explicar — as três coisas que o casal vê e não consegue ligar.
    expect(aviso.textContent).toContain("8350");
    expect(aviso.textContent).toContain("12500");
    expect(aviso.textContent).toContain("4150");
  });

  it("uma proposta em que a coluna fecha não acende nada", async () => {
    // 7.890 + 2.500 = 10.390. É o caso normal, e o caso normal tem de ser
    // silencioso: um aviso que dispara em condições normais aprende-se a
    // ignorar.
    seedOrganizacao({
      budgetRows: [
        { item: "Planeamento integral", price: "7890,00 €" },
        { item: "Coordenação no dia", price: "2.500,00 €" },
      ],
      totalEstimatedText: "10.390,00 €",
      totalAmount: 10390,
    });
    renderStudio();
    // O bloco de totais está lá (é o que garante que se estaria a ver o aviso
    // se ele existisse) e o aviso não.
    expect(await screen.findByText("Totais")).toBeTruthy();
    expect(screen.queryByText(/As contas não fecham/)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO DE TEMPO, DITO ANTES DE SE BATER NELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As rotas que redesenham o documento para o CASAL morrem aos 20 segundos, e
 * uma proposta no tecto do gerador (80 fotografias) gasta 7,6 s a desenhar
 * mais 6 a 12 s a ir buscar as fotos ao armazenamento. A conta é do
 * `custo-do-pdf.ts`, com os números medidos; o que se prende aqui é que ela
 * chega ao ecrã onde as fotografias se escolhem — e não ao registo do servidor
 * no dia em que a página do casal falhar.
 */
describe("o aviso de tempo antes de gerar", () => {
  it("uma proposta no tecto do gerador avisa que a página do casal pode desistir", async () => {
    seedDraft(78);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    expect(await screen.findByText(/desiste aos 20 segundos/)).toBeTruthy();
  });

  it("uma proposta normal não diz nada sobre tempo nenhum", async () => {
    seedDraft(6);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    // A frase da estimativa continua lá — é o aviso do tecto que não aparece.
    expect(await screen.findByText(/Gerar este PDF demora/)).toBeTruthy();
    expect(screen.queryByText(/desiste aos 20 segundos/)).toBeNull();
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A DISPOSIÇÃO DAS FOTOS NA PÁGINA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os cinco arranjos e o desenho já existiam; o que faltava era ela poder
 * ESCOLHER. E escolher por uma lista de nomes não é escolher: «mosaico» e
 * «filas» só querem dizer alguma coisa depois de se ver o que dão com ESTAS
 * fotos — por isso cada opção traz o diagrama das caixas, tirado da mesma
 * geometria que o PDF usa.
 *
 * O que estes testes prendem:
 *  · escolher grava (uma proposta reaberta volta a sair como saiu);
 *  · «Automático» APAGA o campo em vez de gravar o layout sugerido — é a
 *    diferença entre acompanhar o número de fotos e ficar preso a um arranjo;
 *  · o subtítulo chega ao documento;
 *  · e os diagramas seguem as fotos que o board tem naquele momento.
 */
describe("a disposição das fotos do mood board", () => {
  /** As caixas desenhadas no diagrama de uma opção — uma por foto. */
  const caixasDe = (opcao: HTMLElement) => opcao.querySelectorAll("rect");

  it("escolher uma disposição grava-a no documento", async () => {
    seedDraft(5);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("radio", { name: "Mosaico" }));
    await waitFor(() => {
      expect(corpos("proposta-rascunho").at(-1) ?? "").toContain('"layout":"mosaico"');
    });
    expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain('"layout":"mosaico"');
    // E fica assinalada, para o ecrã dizer o que o documento diz.
    expect(screen.getByRole("radio", { name: "Mosaico" }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });

  it("«Automático» APAGA a escolha — não grava o layout sugerido", async () => {
    seedDraft(5, { layout: "mosaico" });
    renderStudio();
    const user = userEvent.setup();
    // Semeado com uma escolha à mão: é essa que está assinalada, não o automático.
    expect(
      (await screen.findByRole("radio", { name: "Mosaico" })).getAttribute("aria-checked"),
    ).toBe("true");
    pedidos = [];
    await user.click(screen.getByRole("radio", { name: /^Automático/ }));
    await waitFor(() => {
      const gravado = corpos("proposta-rascunho").at(-1) ?? "";
      expect(gravado).toContain("Cerimónia");
      expect(gravado).not.toContain('"layout"');
    });
    expect(localStorage.getItem(DRAFT_KEY) ?? "").not.toContain('"layout"');
  });

  it("o subtítulo do mood board é gravado", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.type(
      await screen.findByLabelText("Subtítulo do mood board"),
      "Ramo de Noiva (a definir com a Noiva)",
    );
    await waitFor(() => {
      expect(corpos("proposta-rascunho").at(-1) ?? "").toContain(
        "Ramo de Noiva (a definir com a Noiva)",
      );
    });
  });

  it("os diagramas seguem o número de fotos do mood board", async () => {
    seedDraft(5);
    renderStudio();
    const user = userEvent.setup();
    // Cinco fotos: o sugerido é a fila única, e o diagrama do mosaico tem cinco
    // caixas — a geometria verdadeira, não um desenho aproximado.
    const automatico = await screen.findByRole("radio", { name: /^Automático/ });
    expect(automatico.textContent).toMatch(/fila única/i);
    expect(caixasDe(screen.getByRole("radio", { name: "Mosaico" }))).toHaveLength(5);

    // Mais uma foto e tudo acompanha: outro sugerido, outro diagrama.
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
    await user.click(await screen.findByRole("button", { name: "escolher-foto-de-teste" }));
    await waitFor(() => {
      expect(screen.getByRole("radio", { name: /^Automático/ }).textContent).toMatch(/mosaico/i);
    });
    expect(caixasDe(screen.getByRole("radio", { name: "Mosaico" }))).toHaveLength(6);
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
    expect(within(alerta).getByText(/Verifica antes de enviar/)).toBeTruthy();
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * O QUE FICA CORTADO É UMA PERGUNTA ANTES DO EMAIL, NÃO UM AVISO DEPOIS
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O teste acima é o mundo antigo: o aviso chegava com o email já fora. O
   * servidor passa a parar antes de gravar e de enviar (409), e o que se prende
   * aqui é o que ela vê e o que acontece a seguir — a lista do que ficou de
   * fora, e um segundo clique que envia com a resposta dada.
   */
  it("pergunta antes de enviar, com o que ficou cortado à vista", async () => {
    seedDraft(2);
    propostaDoc = reply({
      ok: false,
      status: 409,
      json: {
        error: "O documento sai com conteúdo cortado.",
        precisaConfirmarCortes: true,
        truncations: [
          { where: "Nome na capa", dropped: 2, unit: "linhas" },
          { where: "Mood board «Cerimónia»", dropped: 3, unit: "fotos" },
        ],
      },
    });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    // A pergunta, com os dois cortes escritos por extenso.
    expect(await screen.findByText(/O documento sai com conteúdo cortado/)).toBeTruthy();
    expect(screen.getByText(/Nome na capa: 2 linhas cortadas/)).toBeTruthy();
    expect(screen.getByText(/Mood board «Cerimónia»: 3 fotos não entram no PDF/)).toBeTruthy();
    // E não se disfarça de avaria: não há «não foi possível enviar» nenhum.
    expect(screen.queryByText(/Não foi possível enviar/)).toBeNull();
    // O envio parou mesmo: o passo não ficou dado por feito.
    expect(screen.queryByRole("button", { name: /Voltar ao conteúdo/ })).toBeNull();

    // O segundo clique é o mesmo envio, com a resposta dada.
    propostaDoc = reply({ json: { ok: true, emailed: true } });
    await user.click(await screen.findByRole("button", { name: /Enviar assim mesmo/ }));
    await screen.findByRole("button", { name: /Voltar ao conteúdo/ });
    const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c || "{}"));
    expect(enviados.at(-1)?.cortesConfirmados, "o segundo envio não levou a resposta").toBe(true);
    // E o primeiro NÃO a levava — senão a pergunta nunca chegaria a ser feita.
    expect(enviados.at(-2)?.cortesConfirmados).toBeUndefined();
  });

  it("«voltar e corrigir» leva ao conteúdo e não envia nada", async () => {
    seedDraft(2);
    propostaDoc = reply({
      ok: false,
      status: 409,
      json: {
        precisaConfirmarCortes: true,
        truncations: [{ where: "Nome na capa", dropped: 2, unit: "linhas" }],
      },
    });
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));
    await user.click(await screen.findByRole("button", { name: /Voltar e corrigir/ }));

    // Um envio só — o que fez a pergunta.
    expect(corpos("proposta-doc", "POST")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: /Voltar ao conteúdo/ })).toBeNull();
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
  /**
   * As células de foto do documento, por ordem no DOM.
   *
   * Era `queryAllByRole("button", { name: "Remover imagem" })` + `parentElement`:
   * uma célula identificava-se pelo × que tinha lá dentro. O × das grelhas dos
   * mood boards mudou-se para a barra de acções (visível ao toque, que é onde
   * um botão só-com-hover não existe), e o teste passou a não encontrar
   * célula nenhuma. `[data-foto]` diz o que a célula É.
   */
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
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
    /**
     * Os pedidos de antes, DESCONTADA a gravação do rascunho.
     *
     * Este teste chegou a contar todos e a falhar de vez em quando na
     * integração: a gravação do rascunho sai com oitocentos milissegundos de
     * atraso e, com a máquina carregada, cabe dentro desta janela. É outra
     * coisa — persistência, não a fotografia — e não se controla daqui.
     * Contá-la fazia o teste ficar vermelho por uma razão que nada tem a ver
     * com o que ele afirma, e um teste que falha por acaso deixa de se ler.
     */
    const semGravacoes = (ps: typeof pedidos) =>
      ps.filter((p) => !p.url.includes("proposta-rascunho")).length;
    const antes = semGravacoes(pedidos);
    await reservar(user);

    // Sem esperar por rede nenhuma: são duas células, a nova por assentar.
    expect(estados()).toEqual([null, "true"]);
    // Percetível por quem não vê o esbatido, e não só por opacidade.
    expect(screen.getByText("a entrar…")).toBeInTheDocument();
    // E ZERO pedidos novos: a miniatura é a que o seletor já tinha em memória.
    expect(semGravacoes(pedidos)).toBe(antes);
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
    // Espera-se pela reescrita da CÓPIA LOCAL, e não pelo primeiro PUT: desde
    // que o estúdio reenvia ao abrir o rascunho que estava preso no navegador,
    // o primeiro PUT é esse reenvio — acontece antes do debounce, e chegava cá
    // com o `localStorage` ainda por limpar.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY)).not.toContain("pending:"), {
      timeout: 3000,
    });
    // E o que segue para o servidor também vai limpo, incluindo o reenvio.
    expect(corpos("proposta-rascunho").join("")).not.toContain("pending:");
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

  /** A primeira célula de foto do documento, e o `<img>` lá dentro. */
  const imagemDaCapa = () =>
    Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"))
      .map((c) => c.querySelector("img"))
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

  /**
   * O campo do valor de um adicional passou a ser NUMÉRICO e a normalizar-se ao
   * sair (`defaultValue` + `onBlur`, como o preço de uma linha): normalizar a
   * cada tecla apagava o que ela estava a escrever a meio. Escrever aqui é
   * portanto escrever E sair do campo.
   */
  async function escreverExtra(valor: string) {
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Adicionar valor adicional/i }));
    const campo = await screen.findByLabelText(/^Valor de /i);
    await user.type(campo, valor);
    await user.tab();
    return user;
  }

  /**
   * ── ESTE BLOCO DESCREVE A REGRA ANTIGA, E CONTINUA A DESCREVÊ-LA ─────────
   *
   * Uma proposta NOVA nasce hoje com «o valor escrito é só dos serviços, estas
   * linhas somam-se» — foi o que a dona pediu, e está explicado no
   * `seedDefaults`. Neste modo, escrever um adicional NÃO mexe no campo do
   * valor: os 1.550 aparecem por baixo dos 6.875 e o total efectivo passa a
   * 8.425.
   *
   * A regra antiga continua a existir, e continua a ser escolhível: o valor
   * escrito JÁ INCLUI os adicionais, e por isso escrever um faz o campo subir
   * para os incluir. É isso que estes testes prendem, e por isso trocam
   * primeiro o selector. Sem esta troca, estariam a medir uma regra que já não
   * é a de partida — e o teste seguinte, esse, mede a nova.
   */
  async function comOsAdicionaisDentroDoValor() {
    const user = userEvent.setup();
    await user.selectOptions(
      await screen.findByLabelText(/Como contam os valores adicionais/i),
      "dentro",
    );
  }

  it("com os adicionais DENTRO do valor, escrever 1550 leva o campo de 6875 a 8425", async () => {
    desenhar(comPreco(6875));
    // A troca vem ANTES de escrever: o selector diz como LER o valor escrito,
    // não reinterpreta o que já foi escrito com a outra regra.
    await comOsAdicionaisDentroDoValor();
    await escreverExtra("1550");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
  });

  it("com os adicionais a somarem, o PREÇO FINAL do pedido leva-os", async () => {
    /**
     * ── A PEÇA QUE FALTAVA, E SEM ELA A MUDANÇA ESTRAGAVA OS NÚMEROS ───────
     *
     * O «Preço final (sem IVA)» do pedido é de onde a Visão Geral, as
     * Estatísticas e o dossier leem o dinheiro dos pedidos que ainda não têm
     * proposta enviada. Com os adicionais a somarem, o campo do estúdio passa a
     * ser só os SERVIÇOS — e se fosse esse número a ir para o pedido, as
     * deslocações desapareciam desses ecrãs em silêncio.
     *
     * Por isso o que viaja para o pedido é o efectivo: 6875 + 1550 = 8425.
     */
    const gravados: number[] = [];
    const originalFetch = global.fetch;
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const corpo = String(init?.body ?? "");
      if (String(url).includes("/api/orcamento/") && corpo.includes("quotedPrice")) {
        const lido = JSON.parse(corpo) as { quotedPrice: number | null };
        if (typeof lido.quotedPrice === "number") gravados.push(lido.quotedPrice);
        return new Response(JSON.stringify({ ...quote, quotedPrice: lido.quotedPrice }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(url, init);
    }) as typeof fetch;

    try {
      desenhar(comPreco(6875));
      await escreverExtra("1550");
      await waitFor(() => expect(gravados.at(-1)).toBe(8425), { timeout: 3000 });
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("por omissão, os 1550 somam-se: o campo fica nos 6875 e o total vai a 8425", async () => {
    // A regra que ela pediu, e que uma proposta nova passa a ter de partida:
    // «não quero que a parte dos serviços apareça como base somada à
    // deslocação; quero que seja três mil mais a deslocação».
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    // O campo do preço não mexe: continua a ser o dos SERVIÇOS.
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
    // E o quadro de totais soma os dois: 6875 de serviços mais 1550 da linha
    // dão 8425 sem IVA, que é a conta que ela quer ver.
    // `findAllByText`: estes números aparecem em mais do que um sítio do ecrã
    // de propósito (o quadro de totais e a barra do fundo dizem o mesmo), e o
    // que se está a afirmar é que aparecem, não que aparecem uma só vez.
    expect((await screen.findAllByText(/6875,00/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/1550,00/)).length).toBeGreaterThan(0);
    expect((await screen.findAllByText(/8425,00/)).length).toBeGreaterThan(0);
  });

  /**
   * A razão de a conta ser feita pela DIFERENÇA e não pelo valor inteiro:
   * escrever «1550» são quatro teclas, e quatro somas do valor inteiro davam um
   * total absurdo. Este teste é o que garante que a tecla a tecla converge.
   */
  it("escrever tecla a tecla não soma quatro vezes", async () => {
    desenhar(comPreco(1000));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    await escreverExtra("100");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("1100");
  });

  /**
   * Apagar um adicional TIRA-O do total — e portanto do sinal e da fatura. Por
   * isso passou a pedir confirmação com os dois números à vista, como o «Usar
   * X €»: era o mesmo estrago atrás de um «×» de doze pixéis.
   */
  it("apagar o valor adicional devolve o total ao que era — depois de confirmar", async () => {
    desenhar(comPreco(6875));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    const user = await escreverExtra("1550");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    await user.click(await screen.findByRole("button", { name: /Remover linha adicional/i }));
    // A pergunta traz os DOIS valores, e o total ainda não mudou.
    const pergunta = await screen.findByText(/Substituir o total de/i);
    expect(pergunta.textContent).toMatch(/8\s?425,00/);
    expect(pergunta.textContent).toMatch(/6\s?875,00/);
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    await user.click(await screen.findByRole("button", { name: /^Substituir$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
  });

  it("e cancelar deixa o total exactamente como estava", async () => {
    desenhar(comPreco(6875));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    const user = await escreverExtra("1550");
    await user.click(await screen.findByRole("button", { name: /Remover linha adicional/i }));
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("8425");
    expect(screen.queryByText(/Substituir o total de/i)).toBeNull();
  });

  it("um valor sem número («a definir») não mexe no total", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("a definir");
    expect(await screen.findByLabelText(/Valor \(sem IVA\)/i)).toHaveValue("6875");
  });

  /**
   * O «Somado ao total: X» saiu daqui: era a terceira soma no mesmo ecrã. A
   * conta continua à vista, agora no BLOCO DE TOTAIS, na linha que o PDF também
   * imprime — e é a mesma `totaisDaProposta` a dizê-la nos dois sítios.
   */
  it("a conta fica à vista no bloco de totais, não numa segunda soma", async () => {
    desenhar(comPreco(6875));
    await escreverExtra("1550");
    expect(screen.queryByText(/Somado ao total:/i)).toBeNull();
    // A do bloco de totais é a que está num `dt` — a outra é o cabeçalho da
    // secção onde os adicionais se escrevem.
    const bloco = (await screen.findByText("Totais")).parentElement!;
    expect(within(bloco).getByText("Valores adicionais").nextElementSibling?.textContent).toMatch(
      /1\s?550,00/,
    );
  });

  it("e chega ao PREÇO FINAL do pedido — é dele que sai a fatura", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    desenhar(comPreco(6875));
    // Este caso descreve a regra em que o valor escrito JÁ INCLUI os
    // adicionais, e por isso troca o selector antes de escrever.
    await comOsAdicionaisDentroDoValor();
    await escreverExtra("1550");
    await vi.advanceTimersByTimeAsync(800);
    const gravacoes = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "PATCH")
      // O histórico do pedido também entra por PATCH (`activityLogAppend`); o
      // que este teste verifica é a gravação do PREÇO.
      .filter(([, init]) => String(init?.body).includes("quotedPrice"));
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «GUARDADO» SÓ SE DIZ QUANDO CHEGOU AO SERVIDOR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que aconteceu: uma colaboradora montou uma proposta inteira — imagens,
 * textos, orçamento — numa instalação onde a tabela `app_state` não existia. A
 * gravação no servidor falhava de cada vez, a falha era engolida ao longo de
 * toda a cadeia, e o indicador dizia «guardado às 14:32» porque a cópia LOCAL
 * tinha corrido bem. A dona do negócio foi ver noutro computador e não estava
 * lá nada.
 *
 * O indicador tem de ter três estados e tem de os DIZER — e o do meio, o que
 * faltava, é o que muda o comportamento de quem está a trabalhar.
 */
describe("o indicador diz onde é que o rascunho ficou", () => {
  /** A resposta da rota quando o `app_state` recusa a escrita (a instalação
   *  dela: falta correr o `db/schema.sql`). */
  const naoGuardou = () =>
    reply({
      ok: false,
      status: 503,
      json: {
        ok: false,
        guardado: false,
        motivo: "tabela-em-falta",
        permanente: true,
        erro: "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).",
      },
    });

  /**
   * Semeia um rascunho local JÁ sincronizado — o servidor tem uma cópia mais
   * recente. É preciso porque, com um rascunho local órfão, o estúdio reenvia-o
   * ao abrir (e faz bem: é o resgate, testado mais abaixo). Aqui o que se olha é
   * o indicador das gravações que vêm A SEGUIR, e o resgate só faria ruído.
   */
  function jaSincronizado() {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now() - 3600_000));
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: JSON.parse(localStorage.getItem(DRAFT_KEY)!),
    };
  }

  /** O texto do próprio indicador, que começa sempre pela palavra «guardado» —
   *  ao contrário das mensagens, que começam por outra coisa. */
  const soLocal = /^(⚠ )?guardado só neste computador/i;
  const noServidor = /^guardado às /;

  async function escrever() {
    const user = userEvent.setup();
    const campo = await screen.findByLabelText("Clientes");
    await user.type(campo, "!");
    // A gravação tem 800 ms de travão; esperar por ela é esperar pelo momento
    // em que o indicador já tem alguma coisa verdadeira para dizer.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("!"), {
      timeout: 3000,
    });
  }

  it("no caso normal continua a dizer a hora a que guardou", async () => {
    jaSincronizado();
    renderStudio();
    await escrever();
    expect(await screen.findAllByText(noServidor, undefined, { timeout: 5000 })).not.toEqual([]);
    expect(screen.queryAllByText(soLocal)).toEqual([]);
  });

  it("quando o servidor recusa, diz «só neste computador» — não «guardado»", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    await escrever();
    // Está no ecrã, por extenso, e não escondido num visto de outra cor.
    expect(await screen.findAllByText(soLocal, undefined, { timeout: 5000 })).not.toEqual([]);
    // E o que NÃO pode aparecer é a frase que a fazia fechar o portátil.
    expect(screen.queryAllByText(noServidor)).toEqual([]);
  });

  it("diz também o que é preciso fazer para o servidor voltar a aceitar", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    await escrever();
    expect(await screen.findAllByText(/schema\.sql/i, undefined, { timeout: 5000 })).not.toEqual(
      [],
    );
  });

  /** A edição NUNCA falha porque a gravação falhou: o que muda é o que se diz. */
  it("continua a deixar escrever com o servidor a recusar", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    await escrever();
    await screen.findAllByText(soLocal, undefined, { timeout: 5000 });
    const campo = (await screen.findByLabelText("Clientes")) as HTMLInputElement;
    expect(campo.disabled).toBe(false);
    expect(campo.value).toContain("!");
    // E o trabalho está mesmo salvo no navegador — é o que o resgate vai buscar.
    expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("!");
  });

  /**
   * Uma gravação que falha por rede não pode morrer à primeira — é o mesmo
   * desenho do envio da proposta. À segunda tentativa passa, e o que ela vê é
   * um rascunho guardado, sem nunca ter sabido que houve uma falha.
   */
  it("uma falha passageira é repetida, e a segunda tentativa guarda", async () => {
    let n = 0;
    gravacaoDoRascunho = () =>
      ++n === 1
        ? reply({ ok: false, status: 500, json: { ok: false } })
        : reply({ json: { ok: true, guardado: true, updatedAt: new Date().toISOString() } });
    jaSincronizado();
    renderStudio();
    await escrever();
    expect(await screen.findAllByText(noServidor, undefined, { timeout: 5000 })).not.toEqual([]);
    expect(n).toBeGreaterThan(1);
    expect(screen.queryAllByText(soLocal)).toEqual([]);
  });

  /** Uma instalação sem a tabela responde o mesmo à terceira vez que à
   *  primeira: repetir só atrasa o aviso. */
  it("uma falha permanente não é repetida", async () => {
    let n = 0;
    gravacaoDoRascunho = () => {
      n++;
      return naoGuardou();
    };
    jaSincronizado();
    renderStudio();
    await escrever();
    await screen.findAllByText(soLocal, undefined, { timeout: 5000 });
    // Uma por gravação — nunca três.
    expect(n).toBe(corpos("proposta-rascunho").length);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE FICOU PRESO NO NAVEGADOR VOLTA AO ABRIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É por aqui que o trabalho da colaboradora regressa. Enquanto o servidor
 * recusou as gravações, tudo o que ela montou ficou no `localStorage` daquele
 * portátil — intacto e invisível. O estúdio abria, via que o servidor não tinha
 * rascunho nenhum, e não fazia nada com essa informação.
 */
describe("o rascunho preso neste navegador é reenviado ao abrir", () => {
  /** Um rascunho local com marca de tempo — como o que ficou no portátil dela. */
  function rascunhoOrfaoLocal(marca: string) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: marca,
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now()));
  }

  it("um rascunho local sem nenhum no servidor é enviado, e diz-se que foi", async () => {
    rascunhoOrfaoLocal("Beatriz e Nuno");
    rascunhoServidor = null;
    renderStudio();
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(0) ?? "").toContain("Beatriz e Nuno"),
      { timeout: 3000 },
    );
    expect(
      await screen.findAllByText(/foi enviado para o servidor/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });

  it("um rascunho local MAIS RECENTE do que o do servidor também é reenviado", async () => {
    rascunhoOrfaoLocal("Beatriz e Nuno");
    rascunhoServidor = {
      // Uma hora mais velho do que a cópia deste navegador.
      updatedAt: new Date(Date.now() - 3600_000).toISOString(),
      doc: { template: "decoracao", ref: "PO", clientNames: "Versão velha do servidor" },
    };
    renderStudio();
    expect(
      await screen.findAllByText(/foi enviado para o servidor/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
    expect(corpos("proposta-rascunho").at(0) ?? "").toContain("Beatriz e Nuno");
    // E a versão velha do servidor NÃO é posta por cima do que está no ecrã.
    expect((await screen.findByLabelText("Clientes")) as HTMLInputElement).toHaveProperty(
      "value",
      "Beatriz e Nuno",
    );
  });

  it("com o servidor mais recente não se reenvia nada — seria apagar trabalho", async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ template: "decoracao", clientNames: "Velha" }),
    );
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now() - 3600_000));
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: { template: "decoracao", ref: "PO", clientNames: "Herdade do Servidor" },
    };
    renderStudio();
    await screen.findByDisplayValue("Herdade do Servidor");
    expect(corpos("proposta-rascunho").join("")).not.toContain("Velha");
  });

  /** Se o GET falhou não se sabe o que lá está: escrever por cima às cegas
   *  podia apagar uma versão mais recente feita noutro dispositivo. */
  it("não reenvia às cegas quando nem sequer se conseguiu ler o servidor", async () => {
    rascunhoOrfaoLocal("Beatriz e Nuno");
    leituraDoRascunhoFalha = true;
    renderStudio();
    await screen.findByDisplayValue("Beatriz e Nuno");
    // Sem tecla nenhuma não há gravação — e portanto nenhum reenvio cego.
    await new Promise((r) => setTimeout(r, 300));
    expect(corpos("proposta-rascunho")).toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FORÇAR A GRAVAÇÃO — O ⌘S, E O BOTÃO QUE SÓ APARECE QUANDO É PRECISO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O botão «Guardar agora» estava SEMPRE na barra, ao lado de «Tudo guardado».
 * Palavras dela: «é redundante e contraditório». É — e a gravação automática
 * cobre mesmo o que ele cobria, porque é a MESMA função (`flushDraft.current`)
 * que os dois chamam.
 *
 * O que não é redundante é o caso em que o servidor RECUSA: aí a cópia local
 * já apagou o «por gravar» e o temporizador só volta a correr à tecla seguinte
 * — carregar era a única forma de tentar outra vez. Por isso o botão fica, mas
 * só nesse estado e com o nome do que faz.
 *
 * Estes testes prendem as duas metades: o gesto de forçar continua a existir
 * (⌘S), e continua a não poder mentir sobre o que aconteceu — quem lê
 * «guardado» fecha o portátil.
 */
describe("forçar a gravação do rascunho", () => {
  const naoGuardou = () =>
    reply({
      ok: false,
      status: 503,
      json: {
        ok: false,
        guardado: false,
        motivo: "tabela-em-falta",
        permanente: true,
        erro: "A base de dados não tem a tabela dos rascunhos (falta correr o db/schema.sql no Supabase).",
      },
    });

  /** Um rascunho local já sincronizado, para o resgate da abertura não fazer
   *  ruído nas contagens de gravações (é o mesmo cuidado do indicador). */
  function jaSincronizado() {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:at`, String(Date.now() - 3600_000));
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: JSON.parse(localStorage.getItem(DRAFT_KEY)!),
    };
  }

  /** O gesto de forçar. É o ⌘S: o botão de sempre saiu da barra. */
  const forcar = (user: ReturnType<typeof userEvent.setup>) =>
    user.keyboard("{Control>}s{/Control}");

  it("ao lado de «tudo guardado» já não há botão nenhum", async () => {
    jaSincronizado();
    renderStudio();
    await screen.findByLabelText("Clientes");
    expect(screen.queryByRole("button", { name: /guardar agora/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /tentar outra vez/i })).toBeNull();
  });

  /** O único caso em que o botão não era redundante: com o servidor a recusar,
   *  era a única forma de voltar a tentar. */
  it("com o servidor a recusar, aparece o «Tentar outra vez»", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    const botaoDeRepetir = await screen.findByRole(
      "button",
      { name: /tentar outra vez/i },
      { timeout: 3000 },
    );
    const antes = corpos("proposta-rascunho").length;
    await user.click(botaoDeRepetir);
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(antes), {
      timeout: 1000,
    });
  });

  it("grava JÁ o que estava por gravar, sem esperar pelos 800 ms", async () => {
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "Beatriz e Nuno");
    const antes = corpos("proposta-rascunho").length;
    await forcar(user);
    // O tecto de 500 ms é a prova: o travão da gravação automática são 800 ms,
    // portanto uma gravação que aparece aqui só pode ter vindo do botão.
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(antes), {
      timeout: 500,
    });
    expect(corpos("proposta-rascunho").at(-1) ?? "").toContain("Beatriz e Nuno");
  });

  it("diz que guardou — depois de o servidor o ter dito, não antes", async () => {
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await forcar(user);
    expect(
      await screen.findAllByText(/rascunho guardado no servidor/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });

  it("com o servidor a recusar, diz «só neste computador» — nunca «guardado»", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await forcar(user);
    // As MESMAS palavras do indicador. Ela não pode ter de aprender duas
    // linguagens no mesmo back office.
    expect(
      await screen.findAllByText(/só neste computador/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
    expect(screen.queryAllByText(/rascunho guardado no servidor/i)).toEqual([]);
  });

  /** À segunda tentativa o aviso grande já não aparece (aparece uma vez só) —
   *  e é aí que um botão calado passaria por um botão que guardou. */
  it("continua a dizer a verdade à segunda vez que se carrega", async () => {
    gravacaoDoRascunho = naoGuardou;
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    await forcar(user);
    await screen.findAllByText(/só neste computador/i, undefined, { timeout: 3000 });
    await user.type(await screen.findByLabelText("Clientes"), "?");
    await forcar(user);
    await waitFor(
      () => expect(screen.queryAllByText(/rascunho guardado no servidor/i)).toEqual([]),
      { timeout: 1000 },
    );
    expect(screen.queryAllByText(/só neste computador/i)).not.toEqual([]);
  });

  it("sem nada por gravar, di-lo em vez de fingir que gravou", async () => {
    jaSincronizado();
    renderStudio();
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Clientes"), "!");
    // Espera pela gravação automática: a partir daqui não há nada pendente.
    await waitFor(() => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain("!"), {
      timeout: 3000,
    });
    await forcar(user);
    expect(
      await screen.findAllByText(/não havia nada por gravar/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DEIXAM DE SER CORTADAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, em duas páginas de PDF: «há imagens que estão cortadas,
 * resolve isso». Estava medido: no mosaico deitava-se fora entre 16% e 79% da
 * área de cada fotografia, no destaque entre 3% e 72%. Uma foto de um portão
 * coberto de flores chegava à proposta com dois terços do portão de fora — e a
 * página existe para mostrar o portão.
 *
 * A geometria que resolve isto já existe (`proposal-geometria`), e nasce
 * DESLIGADA de propósito: o PDF é redesenhado a cada vez que o casal abre o
 * link, e ligá-la calada mudava propostas que já foram enviadas, discutidas ao
 * telefone e talvez impressas.
 *
 * Estes testes prendem o que falta — ligá-la onde é dela ligar-se:
 *   · um mood board NOVO nasce sem recorte;
 *   · o interruptor dos que já existem liga e desliga, e isso chega ao
 *     documento gravado;
 *   · o diagrama que ela vê muda com o interruptor. Este é o que não pode
 *     falhar: escolher por um desenho e receber outro é o defeito que já custou
 *     caro neste projecto.
 */
describe("as fotografias do mood board deixam de ser cortadas", () => {
  const interruptor = () =>
    screen.getByRole("checkbox", { name: /manter a forma de cada fotografia/i });

  /** A geometria dos diagramas do selector, tal como está desenhada agora. É
   *  isto que tem de mudar quando o interruptor muda — senão ela escolhe por um
   *  desenho e recebe outro. */
  const diagramas = (container: HTMLElement) =>
    Array.from(container.querySelectorAll("svg rect"))
      .map((r) => `${r.getAttribute("width")}×${r.getAttribute("height")}`)
      .join("|");

  it("um mood board novo nasce a manter a forma das fotografias", async () => {
    seedDraft(0);
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: /Adicionar mood board/ }));
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(-1) ?? "").toContain("forma-da-foto"),
      { timeout: 3000 },
    );
  });

  it("o interruptor liga e desliga, e a escolha vai no documento gravado", async () => {
    // Um board como os que ela já tem a meio: sem o campo, portanto a sair
    // exactamente como saía antes.
    seedDraft(3, { layout: "mosaico" });
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("checkbox", { name: /manter a forma/i }));
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(-1) ?? "").toContain("forma-da-foto"),
      { timeout: 3000 },
    );

    // E desligar volta a tirá-lo do documento — não fica lá um `false` que os
    // documentos antigos não conhecem.
    await user.click(interruptor());
    await waitFor(
      () => expect(corpos("proposta-rascunho").at(-1) ?? "").not.toContain("forma-da-foto"),
      { timeout: 3000 },
    );
  });

  it("o diagrama muda com o interruptor — ela escolhe pelo que vê", async () => {
    seedDraft(3, { layout: "mosaico" });
    const { container } = renderStudio();
    const user = userEvent.setup();
    await screen.findByRole("checkbox", { name: /manter a forma/i });
    const antes = diagramas(container);
    await user.click(interruptor());
    await waitFor(() => expect(diagramas(container)).not.toEqual(antes), { timeout: 3000 });
  });

  /** Por fotografia e não por disposição: na mesma página uma panorâmica perde
   *  5% e uma vertical 69%. Um aviso por página obrigava-a a adivinhar qual. */
  it("com corte, diz quantas fotografias são cortadas e quanto perdem", async () => {
    seedDraft(3, { layout: "mosaico" });
    renderStudio();
    expect(await screen.findByText(/são cortadas/i, undefined, { timeout: 3000 })).toBeTruthy();
    // Com o interruptor ligado não há nada para avisar: a perda é zero.
    await userEvent.setup().click(screen.getByRole("checkbox", { name: /manter a forma/i }));
    await waitFor(() => expect(screen.queryByText(/são cortadas/i)).toBeNull(), { timeout: 3000 });
  });

  /**
   * A capa é o único sítio onde o corte é inevitável: a tira tem aspecto
   * 0,467:1 e nenhuma fotografia normal tem essa forma. O que se pode fazer é
   * DIZER o número, para escolher uma vertical deixar de ser sorte.
   */
  const comCapas = (capas: string[]) => {
    // O servidor CONHECE estas fotos: sem endereço assinado o `Thumb` não
    // desenha imagem nenhuma, e sem imagem não há nada para medir.
    assetsServidor = capas
      .filter(Boolean)
      .map((path) => ({ path, url: `https://exemplo.pt/${path}` }));
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        coverImages: capas,
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio();
  };

  /**
   * A miniatura mede-se sozinha no `onLoad`, e num teste as imagens não
   * carregam. Isto é o que o navegador faz por ela: dá à imagem uma forma e
   * dispara o `load`.
   */
  async function medirCapas(formas: { w: number; h: number }[]) {
    // Pelo DOM e não por papel: um `<img alt="">` é decorativo e não tem
    // papel nenhum de acessibilidade — `getAllByRole("img")` não o encontra.
    const capas = await waitFor(() => {
      const encontradas = [...document.querySelectorAll("img")].filter((i) =>
        (i.getAttribute("src") ?? "").includes("capas/"),
      );
      if (encontradas.length === 0) throw new Error("as capas ainda não estão desenhadas");
      return encontradas;
    });
    capas.forEach((img, i) => {
      const forma = formas[i];
      if (!forma) return;
      Object.defineProperty(img, "naturalWidth", { value: forma.w, configurable: true });
      Object.defineProperty(img, "naturalHeight", { value: forma.h, configurable: true });
      Object.defineProperty(img, "complete", { value: true, configurable: true });
      fireEvent.load(img);
    });
  }

  it("na capa, diz quanto é que AQUELA fotografia perde", async () => {
    comCapas(["capas/uma.jpg", ""]);
    // Deitada 3:2 — a tira da capa é quase 1:2, e o corte é grande.
    await medirCapas([{ w: 1500, h: 1000 }]);
    expect(await screen.findByText(/perde \d+% da área/i)).toBeTruthy();
  });

  /**
   * ── O AVISO ERA O MESMO PARA AS DUAS, E NÃO PODIA SER ──────────────────
   *
   * Palavras dela: «o mesmo texto aparece por baixo das duas imagens de capa,
   * embora uma seja vertical e a outra horizontal — logo, perdem áreas
   * diferentes».
   */
  it("duas fotografias de formas diferentes dão números diferentes", async () => {
    comCapas(["capas/deitada.jpg", "capas/ao-alto.jpg"]);
    await medirCapas([
      { w: 1500, h: 1000 },
      { w: 1000, h: 1500 },
    ]);
    const numeros = (await screen.findAllByText(/perde \d+% da área/i)).map(
      (p) => /(\d+)%/.exec(p.textContent ?? "")?.[1],
    );
    // Pode haver só um aviso (a vertical perde pouco e não chega ao limiar) —
    // o que NÃO pode haver é dois avisos com o mesmo número.
    expect(new Set(numeros).size).toBe(numeros.length);
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("sem a forma medida, NÃO se inventa um número", async () => {
    // Era esta a causa: por medir, a conta caía na forma por omissão — a mesma
    // para as duas — e a frase dizia «ESTA fotografia perde» sobre um número
    // que não era dela. Não saber é não saber.
    comCapas(["capas/uma.jpg", "capas/outra.jpg"]);
    await waitFor(() =>
      expect(
        [...document.querySelectorAll("img")].some((i) =>
          (i.getAttribute("src") ?? "").includes("capas/"),
        ),
      ).toBe(true),
    );
    expect(screen.queryByText(/perde \d+% da área/i)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CONTADOR DE PREÇOS, EM SI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A regra que interessa é a do meio: nenhuma linha com preço é «ainda não
 * orçamentei» e não avisa de nada; todas com preço é uma soma verdadeira. Só
 * o meio — umas sim, outras não — dá um número plausível que está errado por
 * baixo, e é esse que tem de falar.
 */
describe("contagemDePrecos", () => {
  it("conta as que têm preço e diz a frase por extenso", () => {
    expect(contagemDePrecos([900, null, 1500, null])).toMatchObject({
      comPreco: 2,
      semPreco: 2,
      total: 4,
      incompleta: true,
      frase: "2 de 4 linhas com preço",
    });
  });

  it("com uma linha só, fala no singular", () => {
    expect(contagemDePrecos([900]).frase).toBe("1 de 1 linha com preço");
  });

  it("nenhuma com preço não é uma soma incompleta — é uma proposta por orçamentar", () => {
    expect(contagemDePrecos([null, null]).incompleta).toBe(false);
  });

  it("todas com preço não é uma soma incompleta", () => {
    expect(contagemDePrecos([900, 1500]).incompleta).toBe(false);
  });

  it("zero é um preço, e não a falta dele", () => {
    // Uma linha oferecida custa zero. Contá-la como «sem preço» mandava
    // procurar um campo que está preenchido de propósito.
    expect(contagemDePrecos([0, 900])).toMatchObject({ comPreco: 2, incompleta: false });
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O IVA QUE UM VALOR ADICIONAL DECLARA, LIDO DE VOLTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo passou a numérico e o «+ IVA» passou a ser um selector — mas o que
 * se GRAVA continua a ser o texto que o PDF imprime. Estes testes prendem as
 * duas metades: que o texto sai bem composto, e que o selector lê de volta
 * exactamente o que a soma vai entender.
 */
describe("o valor de uma linha adicional", () => {
  const TAXA = 0.23;

  it("normaliza «1.500», «1500» e «1 500 €» no mesmo número", () => {
    for (const escrito of ["1.500", "1500", "1 500 €", "1500,00"]) {
      expect(textoDoAdicional(escrito, "documento")).toBe(eur(1500));
    }
  });

  it("não perde o «+ IVA» — escreve-o no texto que vai para o PDF", () => {
    expect(textoDoAdicional("895", "acrescer")).toBe(`${eur(895)} + IVA`);
    expect(textoDoAdicional("895", "incluido")).toBe(`${eur(895)} (IVA incluído)`);
  });

  it("um texto sem número («a definir») fica exactamente como foi escrito", () => {
    // É uma frase que o casal tem de ver na proposta, não um número.
    expect(textoDoAdicional("a definir", "acrescer")).toBe("a definir");
    expect(textoDoAdicional("sob consulta", "documento")).toBe("sob consulta");
  });

  it("o texto composto volta a ser lido com o mesmo sentido", () => {
    for (const modo of ["documento", "acrescer", "incluido"] as const) {
      expect(modoDoAdicional(textoDoAdicional("895", modo), TAXA)).toBe(modo);
    }
  });

  it("lê as propostas antigas pelo que elas escreveram", () => {
    expect(modoDoAdicional("895,00 € + IVA", TAXA)).toBe("acrescer");
    expect(modoDoAdicional("896,00 €", TAXA)).toBe("documento");
    expect(modoDoAdicional("1.550,00 € c/ IVA", TAXA)).toBe("incluido");
    expect(modoDoAdicional("a definir", TAXA)).toBe("documento");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CAMPO DO TOTAL ESCRITO POR CÓDIGO — CEM VEZES MAIS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo do total é texto e relê-se com `parseMoneyText`, que segue o
 * português: o ponto separa MILHARES. Quem lá escrevia por código usava
 * `String(n)`, e o JavaScript escreve os decimais com PONTO —
 * `String(3355.98)` dava «3355.98», relido como 335 598.
 *
 * Não era teórico: o botão «Usar X €» numa proposta de 2.460,00 € com uma
 * deslocação de 75,00 € lida com IVA incluído sugere 3.355,98 €, e o campo
 * ficava com 335.598,00 € — que é o número que seguia para o preço final do
 * pedido, para o sinal e para a fatura.
 */
describe("textoDoTotal", () => {
  it("um valor com cêntimos volta a ser lido pelo mesmo número", () => {
    for (const n of [3355.98, 8425.5, 2520.98, 0.99, 1500.05]) {
      expect(parseMoneyText(textoDoTotal(n))).toBe(n);
    }
  });

  it("um inteiro continua a aparecer como sempre apareceu", () => {
    expect(textoDoTotal(2460)).toBe("2460");
    expect(parseMoneyText(textoDoTotal(2460))).toBe(2460);
  });

  /**
   * ── A REDE DE BAIXO MUDOU; ESTA CONTINUA A FAZER FALTA ───────────────────
   *
   * Este teste afirmava que `parseMoneyText(String(3355.98))` dava 335 598 —
   * era esse o defeito que obrigou a escrever o `textoDoTotal`. Deixou de ser
   * verdade: o leitor passou a aceitar as duas escritas (ver o comentário em
   * `proposal-doc.ts`, escrito quando se descobriu que uma proposta INGLESA
   * importada valia três euros), e um ponto seguido de um ou dois dígitos é
   * hoje um decimal.
   *
   * O `textoDoTotal` fica na mesma, e não por hábito: o campo é o que ELA lê.
   * Um total escrito «3355.98» num ecrã português está errado à vista de
   * qualquer pessoa daqui, mesmo que a máquina já o entenda. E há uma escrita
   * que continua a ter uma só leitura possível — «3.000» são três mil, nunca
   * três —, portanto quem escreve no campo tem de escrever português.
   */
  it("o leitor já aguenta o `String(n)`, mas o campo continua a mostrar português", () => {
    expect(parseMoneyText(String(3355.98))).toBe(3355.98);
    expect(textoDoTotal(3355.98)).toBe("3355,98");
    // E a escrita ambígua continua a ler-se como sempre se leu por cá.
    expect(parseMoneyText("3.000")).toBe(3000);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * DO AVISO DE ORTOGRAFIA ATÉ AO CAMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Verificação ortográfica automática de todos os campos que
 * saem no PDF, com aviso e LINK DIRECTO PARA O CAMPO.»
 *
 * O aviso vive no passo do envio e o campo no do conteúdo — e pode estar dentro
 * de um mood board fechado. O caminho tem três degraus e todos podem partir em
 * silêncio, por isso são medidos aqui: a pega existe no controlo certo, o salto
 * volta ao conteúdo, e o campo fica com o foco.
 */
describe("o «Ver no campo» do aviso de ortografia", () => {
  it("põe a pega no controlo que a palavra habita", async () => {
    seedDraft(1, { title: "Decoracao Cerimonia" });
    renderStudio();
    const titulo = await screen.findByLabelText("Título do mood board");
    expect(titulo.getAttribute("data-campo")).toBe("boardTitulo:0");
  });

  it("leva mesmo lá — volta ao conteúdo e deixa o campo com o foco", async () => {
    seedDraft(1, { title: "Decoracao Cerimonia" });
    renderStudio();
    await screen.findByLabelText("Título do mood board");

    // Até ao passo do envio, que é onde o aviso vive.
    const utilizador = userEvent.setup();
    // Pela navegação do estúdio, como ela faz: 2 Pré-visualizar → 3 Enviar.
    await utilizador.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    await utilizador.click(await screen.findByRole("button", { name: /Rever e enviar/ }));

    const ir = await screen.findAllByRole("button", { name: "Ver no campo" });
    await act(async () => {
      ir[0].click();
    });

    const titulo = await screen.findByLabelText("Título do mood board");
    expect(document.activeElement, "o campo não ficou com o foco").toBe(titulo);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CUSTO DA GERAÇÃO, ANTES DO BOTÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «tempo estimado de geração do PDF» e «aviso se o PDF
 * ultrapassar o limite de anexo de email (8 MB)».
 *
 * Sem número nenhum, dez segundos e sessenta são a mesma coisa: uma barra a
 * rodar, sem forma de distinguir «está a demorar» de «isto encravou».
 */
describe("o custo de gerar o PDF", () => {
  const irAoPasso2 = async () => {
    const utilizador = userEvent.setup();
    await utilizador.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
  };

  it("diz quanto demora e quanto pesa, com as fotos que a proposta tem", async () => {
    seedDraft(3);
    renderStudio();
    await screen.findByLabelText("Título do mood board");
    await irAoPasso2();
    expect(await screen.findByText(/Gerar este PDF demora/)).toBeTruthy();
  });

  /** Uma proposta sem fotografias não tem custo nenhum que valha a pena dizer. */
  it("sem fotos, não diz nada", async () => {
    seedDraft(0);
    renderStudio();
    await irAoPasso2();
    expect(screen.queryByText(/Gerar este PDF demora/)).toBeNull();
  });

  /**
   * O aviso que evita o pior desfecho: o servidor de email do cliente recusa a
   * mensagem e, do lado dela, o envio parece ter corrido bem.
   */
  it("com gerações pesadas medidas, avisa que o anexo pode ser recusado", async () => {
    // Duas medições anteriores: ~1,5 MB por fotografia. Com 20 fotos a
    // estimativa passa dos 8 MB — e é isso que o aviso tem de apanhar.
    localStorage.setItem(
      "liquen-proposal-studio:geracoes",
      JSON.stringify([
        { fotos: 4, ms: 4000, bytes: 6_500_000 },
        { fotos: 8, ms: 6000, bytes: 12_500_000 },
      ]),
    );
    seedDraft(20);
    renderStudio();
    await screen.findByLabelText("Título do mood board");
    await irAoPasso2();
    expect(await screen.findByText(/pode ser recusado pelo servidor de email/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MARGEM ONDE A DECISÃO SE TOMA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «Falta o número que permite decidir com noção» — dentro do
 * bloco de Totais.
 *
 * A margem já era calculada no painel interno, onde os custos se escrevem. O
 * que faltava era estar no ecrã onde se decide baixar (ou não) o preço.
 */
describe("a margem no bloco dos totais", () => {
  const comCustos = (custos: (number | null)[], precos: number[]) => {
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
        budgetItems: precos.map((_, i) => `Linha ${i + 1}`),
        budgetAmounts: precos,
        budgetCosts: custos,
        coverImages: ["", ""],
        totalAmount: precos.reduce((a, b) => a + b, 0),
        totalVatMode: "acrescer",
      }),
    );
  };

  it("sem custos escritos, não diz nada — zero não é a mesma coisa que «não sei»", async () => {
    comCustos([null, null], [1000, 2000]);
    renderStudio();
    await waitFor(() => expect(screen.getByText("Totais")).toBeTruthy());
    expect(screen.queryByText("Só para si")).toBeNull();
  });

  it("com custos, mostra a margem em euros e em percentagem", async () => {
    comCustos([400, 600], [1000, 1000]);
    renderStudio();
    await screen.findByText("Só para si");
    // 2000 cobrados, 1000 de custos → 1000 € e 50%.
    expect(screen.getByText(/50%/)).toBeTruthy();
    expect(screen.getByText(/Não sai no PDF/)).toBeTruthy();
  });

  /** Uma margem sobre metade dos custos, dita como «a margem», seria uma
   *  mentira sempre optimista. */
  it("com custos a meio, diz que a conta é parcial", async () => {
    comCustos([400, null], [1000, 1000]);
    renderStudio();
    await screen.findByText("Só para si");
    expect(screen.getByText(/1 de 2 linhas que já têm custo/)).toBeTruthy();
  });

  it("abaixo do limite, avisa — sem impedir nada", async () => {
    comCustos([900, 900], [1000, 1000]);
    renderStudio();
    await screen.findByText("Só para si");
    expect(await screen.findByText(/Abaixo dos \d+% que definiu/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMPO DE PREÇO É DA LINHA, NÃO DA POSIÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito mais caro que esta página teve, porque grava o número errado com
 * bom aspecto. As linhas desenham-se com `key={i}` — a POSIÇÃO — e o campo do
 * preço era não-controlado (`defaultValue` + `onBlur`): apagada a linha do
 * meio, o React reaproveita o nó que sobrevive na posição e o `defaultValue`
 * não se volta a aplicar. O campo ficava com o preço da linha ANTERIOR ao lado
 * do nome da linha nova, e o `blur` seguinte gravava-o por cima do verdadeiro.
 *
 * Daí ia para o PDF, para o sinal e para a factura, sem nada a assinalar.
 */
describe("apagar uma linha do meio do orçamento", () => {
  function seedTresLinhas(extra: Record<string, unknown> = {}) {
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
        budgetItems: ["Alfa", "Beta", "Gama"],
        budgetAmounts: [100, 200, 300],
        coverImages: ["", ""],
        totalAmount: 600,
        totalVatMode: "acrescer",
        ...extra,
      }),
    );
  }

  /** Carrega no × da linha com este nome. */
  async function apagar(user: ReturnType<typeof userEvent.setup>, nome: string) {
    const campo = await screen.findByDisplayValue(nome);
    await user.click(within(campo.parentElement!).getByLabelText("Remover item"));
  }

  const gravado = () => JSON.parse(localStorage.getItem(DRAFT_KEY)!);

  it("o preço que fica no campo é o da linha que sobrou — e é esse que se grava", async () => {
    seedTresLinhas();
    renderStudio();
    const user = userEvent.setup();
    await apagar(user, "Beta");

    // A metade visível do defeito: o campo mostrava «200» ao lado da «Gama».
    const preco = await screen.findByLabelText("Preço de Gama");
    expect(preco).toHaveValue("300");

    // E a metade cara: tocar no campo e sair dele gravava o que lá estava.
    await user.click(preco);
    await user.tab();
    await waitFor(() => expect(gravado().budgetAmounts).toEqual([100, 300]));
  });

  /** O preço unitário da escala tem o mesmo mal e a mesma cura — e uma fórmula
   *  ao lado a explicar, com toda a confiança, a conta de outra linha. */
  it("o preço unitário que fica no campo é o da linha que sobrou", async () => {
    seedTresLinhas({
      budgetScales: [
        { tipo: "por-convidado", unitario: 10 },
        { tipo: "por-convidado", unitario: 20 },
        { tipo: "por-convidado", unitario: 30 },
      ],
    });
    renderStudio();
    const user = userEvent.setup();
    await apagar(user, "Beta");

    const unitario = await screen.findByLabelText("Preço por convidado de Gama");
    expect(unitario).toHaveValue("30");

    await user.click(unitario);
    await user.tab();
    await waitFor(() =>
      expect((gravado().budgetScales as { unitario: number }[]).map((e) => e.unitario)).toEqual([
        10, 30,
      ]),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «ARRUMAR EU» LEVA A MARCA DE EXTRA COM A LINHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `budgetOpcional` é um array paralelo às linhas como os preços e os custos.
 * Ficava de fora da permutação: arrumar a ordem deixava a marca «extra» na
 * rubrica errada — o PDF imprimia-a ao lado da linha que não era, e a versão
 * sem extras ficava cem euros ao lado da verdade.
 */
describe("arrumar a ordem do orçamento", () => {
  function seedForaDeOrdem() {
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
        // A ordem manda-a a lista de Serviços: primeiro a Cerimónia, depois o
        // Jantar. O orçamento está escrito ao contrário.
        serviceGroups: [
          { letter: "a)", title: "Cerimónia", items: [{ label: "Igreja" }] },
          { letter: "b)", title: "Jantar", items: [{ label: "Mesas" }] },
        ],
        moodBoards: [],
        budgetItems: ["Decor Jantar", "Decor Cerimónia"],
        budgetAmounts: [200, 100],
        // O extra está na CERIMÓNIA, que é a linha que vai mudar de sítio.
        budgetOpcional: [false, true],
        coverImages: ["", ""],
        totalAmount: 300,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("a marca «extra» viaja com a linha, como o preço", async () => {
    seedForaDeOrdem();
    renderStudio();
    const user = userEvent.setup();
    await user.click((await screen.findAllByRole("button", { name: "Arrumar eu" }))[0]);

    await waitFor(() => {
      const doc = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
      expect(doc.budgetItems).toEqual(["Decor Cerimónia", "Decor Jantar"]);
      // Os preços já viajavam; a marca de extra é que ficava para trás.
      expect(doc.budgetAmounts).toEqual([100, 200]);
      expect(doc.budgetOpcional).toEqual([true, false]);
    });

    // E o que ela vê bate certo com o que ficou gravado.
    expect(screen.getByLabelText("Decor Cerimónia é um extra opcional")).toBeChecked();
    expect(screen.getByLabelText("Decor Jantar é um extra opcional")).not.toBeChecked();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LEGENDA ROUBA ALTURA ÀS FOTOS — TAMBÉM NA GRELHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A página reserva altura para a descrição, e reserva mais quanto mais linhas
 * ela tiver. A grelha das fotos e o aviso «esta foto perde X%» pediam as caixas
 * SEM essa altura (ficavam com a omissão de 8 pt, a de quem não tem legenda
 * nenhuma), enquanto a miniatura desenhada no mesmo cartão já a contava: as
 * duas metades do cartão discordavam, e o aviso disparava — ou calava-se —
 * pelas razões erradas.
 */
describe("a grelha das fotos conta com a legenda", () => {
  /** Duas linhas de descrição, medidas por `linhasDaLegendaAprox`. */
  const LEGENDA =
    "Flores brancas e verdes, com muito verde e pouca cor, para a cerimónia toda ao ar livre, ao fim da tarde, com velas nos bancos e no altar.";

  function seedBoardComLegenda() {
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
            annotation: LEGENDA,
            layout: "mosaico",
            images: Array.from({ length: 4 }, (_, i) => `board/foto-${i}.jpg`),
          },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  // O jsdom não descarrega imagens, portanto nenhuma foto é medida e todas
  // entram com a forma por omissão — a mesma que o gerador assume.
  const aspectos = Array.from({ length: 4 }, () => ASPETO_POR_OMISSAO);
  const comLegenda = caixasDoMoodboard(
    "mosaico",
    aspectos,
    alturaDaLegenda(linhasDaLegendaAprox(LEGENDA)),
    false,
  );
  const semLegenda = caixasDoMoodboard("mosaico", aspectos, undefined, false);

  it("cada célula tem a forma da caixa que a página lhe dá", async () => {
    // Se um dia as duas geometrias coincidirem, este teste deixa de medir o
    // que diz medir — e é melhor falhar aqui do que passar por engano.
    expect(aspetoDaCaixa(comLegenda[0])).not.toBe(aspetoDaCaixa(semLegenda[0]));

    seedBoardComLegenda();
    renderStudio();
    const cartao = await waitFor(() => {
      const el = document.getElementById("mood-board-0");
      expect(el).toBeTruthy();
      return el!;
    });
    const celulas = [...cartao.querySelectorAll<HTMLElement>("[data-foto]")];
    expect(celulas).toHaveLength(4);
    // `parseFloat` porque o jsdom normaliza o `aspect-ratio` para «0.558 / 1»
    // — o número é o mesmo, a escrita é que é dele.
    expect(celulas.map((c) => parseFloat(c.style.aspectRatio))).toEqual(
      comLegenda.map((caixa) => aspetoDaCaixa(caixa)),
    );
  });

  /**
   * A conta do aviso é a mesma da grelha. Com a omissão de 8 pt, a 3.ª foto
   * aparecia na lista das cortadas (perdia 14%); com a altura verdadeira perde
   * 4% e não é caso para aviso nenhum. O aviso existe para ela ir trocar UMA
   * fotografia — apontar-lhe a errada é pior do que estar calado.
   */
  it("as percentagens de perda são as da página, não as de uma folha sem legenda", async () => {
    seedBoardComLegenda();
    renderStudio();
    const aviso = await screen.findByText(/fotografias são cortadas/);
    expect(aviso.textContent).toMatch(/3 fotografias são cortadas/);
    /**
     * ── PORQUE É QUE OS 63% MUDARAM DE FOTOGRAFIA ─────────────────────────
     *
     * Era «a 1.ª perde 63%». Passou a ser a 2.ª, e a 1.ª passou a perder 50%.
     * Não é este aviso que mudou: é o mosaico, que passou a dar mesmo a maior
     * célula à primeira posição — o comentário dele dizia-o desde sempre e o
     * código fazia o contrário, pelo que a foto marcada como principal saía
     * até 41% MAIS PEQUENA do que as outras.
     *
     * Uma caixa maior recorta menos, portanto a fotografia da frente passou a
     * perder 50% em vez de 63%, e a que lhe cedeu o lugar herdou a perda. As
     * três continuam a ser as mesmas fotografias, e a soma do que se perde na
     * página é a mesma: o que mudou foi quem fica com a caixa boa — que é o
     * ponto todo da correcção.
     */
    expect(aviso.textContent).toMatch(/a 1\.ª perde 50%/);
    expect(aviso.textContent).toMatch(/a 2\.ª perde 63%/);
    expect(aviso.textContent).toMatch(/a 4\.ª perde 50%/);
    // A 3.ª deixa de ser acusada: 4% não é um corte que se note.
    expect(aviso.textContent).not.toMatch(/a 3\.ª/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISTA DE CONJUNTO OCUPA A LARGURA TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estava dentro da grelha de duas colunas do índice, como TERCEIRO filho: por
 * colocação automática ficava com a coluna do índice e empurrava a lista dos
 * mood boards para os 11 rem — 176 px de largura para as fotografias todas, a
 * partir dos 1024 px.
 */
describe("ver as páginas lado a lado", () => {
  function seedDoisBoards() {
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
          { title: "Cerimónia", annotation: "", images: ["board/a.jpg"] },
          { title: "Jantar", annotation: "", images: ["board/b.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("não entra na grelha do índice — a grelha continua com duas colunas e dois filhos", async () => {
    seedDoisBoards();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Ver as páginas lado a lado" }));

    const vista = await screen.findByText("Vista de conjunto");
    const grelha = document.querySelector('[class*="lg:grid-cols-[11rem"]');
    expect(grelha).toBeTruthy();
    // O índice e a lista dos boards, e mais nada: um terceiro filho é o que
    // mandava a lista para a coluna de 176 px.
    expect(grelha!.children).toHaveLength(2);
    expect(grelha!.contains(vista)).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA PROPOSTA, NA LÍNGUA DO CASAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «preparamos a proposta em português e, na parte de descarregar
 * ou gerar, um botão para escolher gerar em inglês».
 *
 * A escolha vive ao lado do «Descarregar PDF» e não num menu: é uma decisão
 * sobre AQUELE clique, e o documento guardado continua a ser um só, em
 * português. O que estes testes prendem:
 *
 *  1. o caminho por omissão — português, tal e qual como era;
 *  2. a escolha viaja mesmo até ao servidor;
 *  3. a ressalva está no ecrã ANTES de se carregar, e também para quem ouve o
 *     controlo em vez de o ver. Sem ela, um PDF meio inglês parece avariado.
 */
describe("gerar a proposta em inglês", () => {
  /** O duplo do `fetch` deste ficheiro, para o repor: um teste daqui troca-o
   *  por uma resposta que nunca chega, e `mockClear` não desfaz isso. */
  const fetchDeSempre = fetchMock.getMockImplementation()!;
  /** O espião do descarregamento, quando algum teste o põe. */
  let espiaoDoClique: { mockRestore: () => void } | null = null;

  afterEach(() => {
    fetchMock.mockImplementation(fetchDeSempre);
    espiaoDoClique?.mockRestore();
    espiaoDoClique = null;
  });

  /** Chega ao passo onde se descarrega o PDF. */
  async function irParaPrever(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    return await screen.findByRole("button", { name: /Descarregar PDF/ });
  }

  /** O `idioma` do último POST à rota da proposta. */
  function idiomaEnviado(): unknown {
    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "";
    return JSON.parse(corpo || "{}").idioma;
  }

  /** Os nomes com que os ficheiros foram descarregados, pela ordem. O estúdio
   *  descarrega por uma âncora fabricada à mão — é ali que o nome se lê. */
  function espiarDescarregamentos(): string[] {
    const nomes: string[] = [];
    espiaoDoClique = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      nomes.push(this.download);
    });
    return nomes;
  }

  it("por omissão é português — e a barra diz que língua vai sair", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    const grupo = screen.getByRole("radiogroup", { name: "Idioma do PDF" });
    expect(within(grupo).getByRole("radio", { name: "Português" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(within(grupo).getByRole("radio", { name: /^Inglês/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("o caminho por omissão fica intacto: «pt», e o ficheiro chama-se proposta-…", async () => {
    seedDraft(1);
    const nomes = espiarDescarregamentos();
    renderStudio();
    const user = userEvent.setup();
    await user.click(await irParaPrever(user));

    await waitFor(() => expect(corpos("proposta-doc", "POST")).toHaveLength(1));
    expect(idiomaEnviado()).toBe("pt");
    expect(nomes).toEqual(["proposta-Maria & Zé.pdf"]);
  });

  it("escolher inglês manda «en» e o ficheiro sai com outro nome", async () => {
    seedDraft(1);
    const nomes = espiarDescarregamentos();
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));
    await user.click(screen.getByRole("button", { name: /Descarregar PDF/ }));

    await waitFor(() => expect(corpos("proposta-doc", "POST")).toHaveLength(1));
    expect(idiomaEnviado()).toBe("en");
    // Duas versões da mesma proposta na pasta de transferências têm de se
    // distinguir sem as abrir.
    expect(nomes).toEqual(["proposal-Maria & Zé.pdf"]);
  });

  it("a escolha alcança-se pelo teclado, com as setas", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    // O grupo é UMA paragem de tabulação (foco andante); a seta é que escolhe.
    screen.getByRole("radio", { name: "Português" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(screen.getByRole("radio", { name: /^Inglês/ })).toHaveAttribute("aria-checked", "true");

    await user.click(screen.getByRole("button", { name: /Descarregar PDF/ }));
    await waitFor(() => expect(idiomaEnviado()).toBe("en"));
  });

  /**
   * ── A ESCOLHA TEM DE DIZER O QUE FAZ ──────────────────────────────────────
   *
   * Só a MOLDURA é traduzida; os títulos, as descrições e as legendas que ela
   * escreveu saem tal e qual. Quem carrega em «Inglês» sem saber disto abre um
   * PDF meio inglês e conclui que está avariado.
   *
   * E a ressalva tem de nomear a DATA. É o caso que mais engana: lido no PDF
   * inglês, o cabeçalho diz «Event Date: 12 de setembro de 2026» — inglês o
   * rótulo, português a data — porque a data do evento é um campo preenchido e
   * não moldura. Uma ressalva que se ficasse por «o que escreveste» deixava-a
   * supor que as datas eram nossas e vinham traduzidas.
   */
  it("diz, antes do clique, que só a moldura muda de língua", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    // Está no ecrã ANTES de se escolher fosse o que fosse.
    const ressalva = screen.getByText(/Em inglês sai a moldura do documento/);
    expect(ressalva).toBeInTheDocument();
    // E diz, com todas as letras, que a data não vai traduzida.
    expect(ressalva.textContent).toMatch(/data/i);
  });

  it("e diz o mesmo a quem ouve o controlo em vez de o ver", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);

    const ingles = screen.getByRole("radio", { name: /^Inglês/ });
    // Começa pelo rótulo visível — o nome falado e o escrito não podem divergir.
    expect(ingles.getAttribute("aria-label")).toMatch(
      /^Inglês — sai a moldura do documento em inglês; os campos que preencheste, incluindo a data do evento, ficam como os escreveste$/,
    );
  });

  it("«A gerar…» diz em que língua está a desenhar", async () => {
    seedDraft(1);
    // A resposta da rota fica PENDURADA: o estado que se quer ver é o do meio,
    // e sem isto o botão volta a «Descarregar PDF» antes de se poder olhar.
    let libertar: (r: Response) => void = () => {};
    const pendurada = new Promise<Response>((r) => {
      libertar = r;
    });
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes("proposta-doc")) {
        pedidos.push({ url: String(input), init });
        return pendurada;
      }
      return fetchDeSempre(input, init);
    });

    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));
    await user.click(screen.getByRole("button", { name: /Descarregar PDF/ }));

    // Dezenas de segundos numa proposta com fotografias a sério — tempo que
    // chega para deixar de haver a certeza do que se escolheu.
    expect(await screen.findByRole("button", { name: /A gerar em inglês…/ })).toBeInTheDocument();
    await act(async () => {
      libertar(reply({ headers: {} }));
    });
  });

  /**
   * ── O ENVIO LEVA A LÍNGUA, E É A MESMA QUE SE PRÉ-VISUALIZOU ──────────────
   *
   * O envio não mandava língua nenhuma, e a decisão de então estava escrita: um
   * PDF inglês dentro de um email português seria pior do que os dois em
   * português. Agora o email, a página do aceite e a segunda descarga seguem a
   * língua da proposta, portanto a razão caiu — e escolher «Inglês» para
   * pré-visualizar e receber uma proposta portuguesa a seguir seria a
   * surpresa maior das duas.
   */
  it("o envio ao cliente leva a língua escolhida", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));

    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("en");
    });
  });

  it("e no caminho de sempre manda «pt», dito e não subentendido", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("pt");
    });
  });

  /**
   * A ESCOLHA TEM DE ESTAR ONDE SE ENVIA, E NÃO SÓ ONDE SE PRÉ-VISUALIZA.
   *
   * Os passos do estúdio são clicáveis: dá para ir do Conteúdo direito ao
   * Enviar sem passar pela pré-visualização. Enquanto a língua só desenhava um
   * PDF para ela ver, isso não tinha consequência nenhuma; agora decide o email
   * que o casal recebe e a página onde ele responde. Quem envia sem passar pelo
   * passo 2 tem de poder escolher — e de VER o que está escolhido.
   */
  it("o passo 3 deixa escolher a língua, e diz o que ela decide", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));

    const grupo = await screen.findByRole("radiogroup", { name: "Idioma da proposta" });
    expect(within(grupo).getByRole("radio", { name: "Português" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    // E diz, antes do clique, o que sai em inglês além do PDF.
    const nota = screen.getByText(/Em inglês, o email ao cliente/);
    expect(nota.textContent).toMatch(/página onde ele responde/);

    await user.click(within(grupo).getByRole("radio", { name: /^Inglês/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("en");
    });
  });

  /** A escolha é UMA: mudá-la no passo 3 muda a que a pré-visualização usa, e
   *  ao contrário. Duas caixas com estados diferentes eram a maneira certa de
   *  enviar em inglês um documento que ela pré-visualizou em português. */
  it("a escolha do passo 3 e a do passo 2 são a mesma", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    const grupo = await screen.findByRole("radiogroup", { name: "Idioma da proposta" });
    await user.click(within(grupo).getByRole("radio", { name: /^Inglês/ }));

    await irParaPrever(user);
    expect(
      within(screen.getByRole("radiogroup", { name: "Idioma do PDF" })).getByRole("radio", {
        name: /^Inglês/,
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A LÍNGUA ESCOLHIDA TEM DE SOBREVIVER A FECHAR O SEPARADOR
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O relato: «não estava a dar; depois mudei para inglês e deu». É o sintoma
   * exacto de uma escolha que se apaga sozinha — ela escolhe «Inglês», traduz,
   * pré-visualiza, fecha o portátil, volta no dia seguinte e o selector está em
   * «Português» outra vez, sem nada a dizê-lo. Carrega em «Inglês», e «dá».
   *
   * E o custo não é ela ter de carregar duas vezes. A língua vai GRAVADA com o
   * envio: decide o email que o casal recebe, o nome do anexo, a página onde
   * ele responde e a segunda descarga. Uma proposta escrita e revista em
   * inglês, enviada com o selector reposto, chega ao casal britânico em
   * português — e no ecrã dela nada indicou que se tinha perdido a escolha.
   *
   * Fica no `meta` do rascunho, ao lado do interruptor bilingue e da mensagem
   * ao cliente, e pela mesma razão: não é conteúdo da proposta, é a maneira
   * como ela está a trabalhar nesta.
   */
  it("a língua escolhida volta com o rascunho", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: /^Inglês/ }));

    // Fica gravada ao lado do rascunho — é o que sobrevive a fechar o separador.
    await waitFor(() =>
      expect(localStorage.getItem(`${DRAFT_KEY}:meta`) ?? "").toContain('"idioma":"en"'),
    );

    // O separador fecha e volta a abrir.
    cleanup();
    renderStudio();
    const outra = userEvent.setup();
    await irParaPrever(outra);
    expect(
      within(screen.getByRole("radiogroup", { name: "Idioma do PDF" })).getByRole("radio", {
        name: /^Inglês/,
      }),
    ).toHaveAttribute("aria-checked", "true");
  });

  /** E o envio que se segue a essa reabertura leva «en» — que é o que o casal
   *  recebe. Sem isto, o teste de cima provava um pixel e não o desfecho. */
  it("e o envio depois de reabrir leva a língua que ela tinha escolhido", async () => {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:meta`, JSON.stringify({ idioma: "en" }));
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));

    await waitFor(() => {
      const enviados = corpos("proposta-doc", "POST").map((c) => JSON.parse(c));
      expect(enviados.find((c) => c.mode === "send")?.idioma).toBe("en");
    });
  });

  /** Voltar atrás também tem de pegar: um `meta` com «en» não pode ressuscitar
   *  uma escolha que ela desfez. É a diferença entre guardar a escolha e
   *  guardar só metade dela. */
  it("e voltar a «Português» também fica guardado", async () => {
    seedDraft(1);
    localStorage.setItem(`${DRAFT_KEY}:meta`, JSON.stringify({ idioma: "en" }));
    renderStudio();
    const user = userEvent.setup();
    await irParaPrever(user);
    await user.click(screen.getByRole("radio", { name: "Português" }));

    await waitFor(() =>
      expect(localStorage.getItem(`${DRAFT_KEY}:meta`) ?? "").toContain('"idioma":"pt"'),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «COPIAR RESUMO» — PARA QUANDO O CASAL PREFERE WHATSAPP
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Toda a comunicação sai por email; o botão dá as três ou quatro linhas
 * prontas a colar noutro sítio, com os números que o estúdio já tem
 * (`totaisDaProposta`) — nunca uma conta nova.
 */
describe("o botão «Copiar resumo»", () => {
  afterEach(() => {
    // O `clipboard` não existe por omissão no ambiente de testes (é assim que
    // se prova o caminho de recurso); o que um teste lhe põe não pode
    // sobreviver para o seguinte.
    Reflect.deleteProperty(navigator, "clipboard");
  });

  /**
   * A área de transferência a funcionar: `writeText` resolve.
   *
   * `userEvent.setup()` instala o SEU PRÓPRIO duplo de `navigator.clipboard`
   * por omissão (`writeToClipboard: true`, para as suas APIs `.copy()` /
   * `.paste()`) — e o instala DEPOIS de qualquer `Object.defineProperty` feito
   * antes, apagando-o. Por isso o `user` nasce aqui, com essa instalação
   * desligada, e só depois é que se define o duplo que os testes leem.
   */
  function comClipboardAFuncionar() {
    const user = userEvent.setup({ writeToClipboard: false });
    const writeText = vi.fn(async (_texto: string) => {});
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
    return { user, writeText };
  }

  it("copia o nome, a data e o valor a pagar, sem link (a proposta ainda não foi enviada)", async () => {
    seedDraft(1);
    const { user, writeText } = comClipboardAFuncionar();
    renderStudio();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));

    await user.click(await screen.findByRole("button", { name: "Copiar resumo" }));

    // O `writeText` é assíncrono; espera-se pelo aviso de sucesso antes de
    // ler o que lhe foi passado, senão a asserção corre antes da promessa
    // resolver.
    await screen.findByText(/^Resumo copiado/);
    expect(writeText).toHaveBeenCalledTimes(1);
    const texto = writeText.mock.calls[0][0] as string;
    expect(texto).toContain("Maria & Zé");
    expect(texto).toContain("12 de setembro de 2026");
    // 3.000 € + IVA (23%) = 3.690 €, o mesmo bloco que a barra do fundo e o
    // resumo do passo mostram (`totaisDaProposta`).
    expect(texto).toContain("3.690,00");
    expect(texto).not.toContain("http");
  });

  it("depois de enviar, o resumo já leva o link — sem precisar de reabrir o estúdio", async () => {
    seedDraft(1);
    propostaDoc = reply({
      json: {
        ok: true,
        emailed: true,
        estado: "enviada",
        acceptUrl: "https://liquen-events.com/proposta/abc.sig",
      },
    });
    const { user, writeText } = comClipboardAFuncionar();
    renderStudio();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));
    await screen.findByRole("button", { name: "Enviar de novo / nova revisão" });

    await user.click(screen.getByRole("button", { name: "Copiar resumo" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const texto = writeText.mock.calls.at(-1)?.[0] as string;
    expect(texto).toContain("https://liquen-events.com/proposta/abc.sig");
  });

  it("sem área de transferência (Safari sem gesto, permissões): nunca um erro seco, o texto fica visível e seleccionado", async () => {
    seedDraft(1);
    // O `userEvent.setup()` instala SEMPRE um `navigator.clipboard` seu
    // (mesmo com `writeToClipboard: false`, que só desliga a escrita real por
    // trás dos gestos de copiar/colar) — e é um duplo A FUNCIONAR, o que
    // impediria precisamente o caminho de recurso que este teste prende.
    // Tira-se a seguir, para o `navigator.clipboard` ficar por definir de
    // propósito, como aconteceria num Safari sem o gesto ou sem permissões.
    const user = userEvent.setup({ writeToClipboard: false });
    Reflect.deleteProperty(navigator, "clipboard");
    renderStudio();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));

    await user.click(await screen.findByRole("button", { name: "Copiar resumo" }));

    const caixa = (await screen.findByRole("textbox", {
      name: "Resumo da proposta, para copiar à mão",
    })) as HTMLTextAreaElement;
    expect(caixa.tagName).toBe("TEXTAREA");
    expect(caixa.value).toContain("Maria & Zé");
    // Visível E seleccionada — pronta a copiar à mão com Cmd/Ctrl+C.
    await waitFor(() => expect(caixa.selectionStart).toBe(0));
    expect(caixa.selectionEnd).toBe(caixa.value.length);
    // Nenhum aviso de erro seco: a caixa É a resposta. (O contentor
    // `role="alert"` do `ToastProvider` existe sempre, vazio; o que se prova
    // é que não tem NENHUM aviso lá dentro.)
    expect(screen.queryByRole("alert")?.textContent ?? "").toBe("");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MENSAGEM QUE SEGUE COM A PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quando eu vou enviar a proposta, quero que também dê para
 * enviar uma mensagem juntamente com a proposta, a partir do back office na
 * parte onde envio a proposta».
 *
 * O email levava uma frase fixa («Segue em anexo a proposta personalizada…») e
 * mais nada. A caixa vive no passo 3, ao lado do resumo do que vai seguir —
 * onde ela está quando decide enviar.
 *
 * O que estes testes prendem: o texto CHEGA ao envio, uma caixa vazia não muda
 * nada, e o que ela escreveu sobrevive a fechar o separador (o estúdio já grava
 * rascunho; a mensagem entra no mesmo sítio que o resto do que não é documento).
 */
describe("a mensagem pessoal que segue com a proposta", () => {
  const SIDE_KEY = `${DRAFT_KEY}:meta`;
  const caixa = () => screen.getByLabelText("Mensagem para o cliente") as HTMLTextAreaElement;

  /** O corpo do último envio (`mode: "send"`). */
  function envio(): Record<string, unknown> {
    const corpo = corpos("proposta-doc", "POST").at(-1) ?? "{}";
    return JSON.parse(corpo);
  }

  async function enviar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));
  }

  it("o que ela escreve na caixa segue no pedido de envio", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.type(caixa(), "Foi um gosto conhecer-vos na quinta!");
    await enviar(user);

    await waitFor(() => expect(envio().mensagem).toBe("Foi um gosto conhecer-vos na quinta!"));
  });

  /** OPCIONAL A SÉRIO: em branco, o pedido é o mesmo de sempre — a rota nem
   *  chega a ver o campo, e o email sai como saía. */
  it("em branco, o envio não leva mensagem nenhuma", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await enviar(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio()).not.toHaveProperty("mensagem");
  });

  it("espaços em branco contam como caixa vazia", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.type(caixa(), "   ");
    await enviar(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio()).not.toHaveProperty("mensagem");
  });

  it("a mensagem entra no rascunho — fechar o separador não a deita fora", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.type(caixa(), "Ficamos à espera de vos ver!");

    await waitFor(
      () => expect(localStorage.getItem(SIDE_KEY) ?? "").toContain("Ficamos à espera de vos ver!"),
      { timeout: 3000 },
    );
  });

  it("e volta ao ecrã quando o estúdio reabre", async () => {
    seedDraft(1);
    localStorage.setItem(SIDE_KEY, JSON.stringify({ mensagem: "O arco fica incluído." }));
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));

    await waitFor(() => expect(caixa().value).toBe("O arco fica incluído."));
  });

  /**
   * O IRMÃO DO FECHO A DOBRAR. A assinatura da casa entra sozinha no fim de
   * todo o correio ao cliente; uma caixa que convide a assinar traz de volta o
   * defeito dos modelos de resposta rápida — dois fechos colados, e o segundo a
   * desmentir o primeiro.
   */
  it("diz-lhe que não precisa de assinar", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    // A frase é a da AJUDA DESTA CAIXA e não uma qualquer no ecrã: o passo
    // «Enviar» ganhou o painel do email, que também diz — e bem — que a
    // assinatura da casa entra sozinha. Sem este aperto, o teste passava a ser
    // verdadeiro por causa do painel do lado e deixava de guardar esta caixa.
    const ajuda = caixa().getAttribute("aria-describedby");
    expect(document.getElementById(ajuda ?? "")?.textContent).toMatch(/assinatura da Líquen/i);
  });

  /**
   * O ecrã «Modelos de email» do mesmo back office ensina-lhe que `{nome}` é um
   * campo de fusão, com botões que o inserem. Esta caixa NÃO os substitui — o
   * email já abre com «Olá Maria & Zé,» —, por isso diz-o no momento em que ela
   * o escreve, em vez de o deixar seguir cru para o casal.
   */
  it("avisa quando ela escreve um campo de fusão que esta caixa não substitui", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    // O aviso tem um `<code>{nome}</code>` no meio, portanto o texto está
    // partido por vários nós: procura-se pelo parágrafo inteiro.
    const aviso = () =>
      screen.queryAllByText((_, el) => (el?.textContent ?? "").includes("sai tal e qual"), {
        selector: "p",
      });
    expect(aviso()).toHaveLength(0);
    // `{{` é como se escreve uma chaveta literal no `userEvent` — sem isso, o
    // `{nome}` era lido como uma tecla especial e nunca chegava à caixa.
    await user.type(caixa(), "Olá {{nome}, ficamos à espera.");
    expect(caixa().value).toContain("{nome}");
    await waitFor(() => expect(aviso()).toHaveLength(1));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA BILINGUE — DUAS CAIXAS POR CAMPO, E SÓ QUANDO SE PEDEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela: cada campo de prosa passa a ter uma caixa portuguesa e uma
 * inglesa, escritas por ela. O interruptor existe porque o `ServicesEditor` é o
 * ecrã mais escrito da casa — dobrar-lhe a altura para toda a gente, incluindo
 * as propostas que nunca vão a inglês, era pagar todos os dias por um caso
 * ocasional.
 *
 * O primeiro teste é o que protege as propostas só-portuguesas: desligado, não
 * há uma única caixa inglesa no ecrã.
 */
describe("proposta bilingue", () => {
  const interruptor = () => screen.getByRole("button", { name: /Proposta bilingue/i });
  /** Todas as caixas inglesas desenhadas agora — reconhecem-se pelo `data-campo`
   *  terminado em `:en`, que é a mesma pega por onde o salto as encontra. */
  const caixasInglesas = () => document.querySelectorAll("[data-campo$=':en']");

  it("desligado, o ecrã é o de hoje: nenhuma caixa inglesa no DOM", async () => {
    seedDraft(1);
    renderStudio();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    expect(caixasInglesas()).toHaveLength(0);
  });

  it("ligado, cada campo de prosa passa a ter duas caixas", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    await waitFor(() => expect(caixasInglesas().length).toBeGreaterThan(0));
    // O par do título do mood board: a portuguesa e a inglesa, com a mesma
    // chave e o sufixo que as distingue.
    expect(document.querySelector('[data-campo="boardTitulo:0"]')).toBeTruthy();
    expect(document.querySelector('[data-campo="boardTitulo:0:en"]')).toBeTruthy();
  });

  it("a caixa inglesa diz-se em voz alta — quem ouve o ecrã ouve a diferença", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const inglesa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    expect(inglesa.getAttribute("aria-label") ?? "").toMatch(/ingl[êe]s/i);
  });

  it("escrever na caixa inglesa grava-a no rascunho", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const inglesa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    await user.type(inglesa, "Ceremony");
    await waitFor(
      () => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain('"titleEn":"Ceremony"'),
      { timeout: 3000 },
    );
    // E o português fica onde estava.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].title).toBe("Cerimónia");
  });

  /**
   * O CASO DO OUTRO PORTÁTIL.
   *
   * O interruptor vive no `meta` do rascunho, que é estado do EDITOR. Abrir a
   * proposta noutro computador, restaurá-la do servidor ou copiá-la de outra
   * deixa o `meta` para trás — e sem esta regra os textos ingleses existiam no
   * documento e o ecrã não os mostrava: invisíveis e editáveis por acidente.
   */
  it("uma proposta que já traz inglês abre com o interruptor LIGADO, sem meta nenhum", async () => {
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
        moodBoards: [{ title: "Cerimónia", titleEn: "Ceremony", images: ["board/f.jpg"] }],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    renderStudio();
    await waitFor(() => expect(caixasInglesas().length).toBeGreaterThan(0));
    expect(
      (document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement).value,
    ).toBe("Ceremony");
  });

  /**
   * O RESTAURO DO RASCUNHO É ZONA MINADA — ver o bloco «CORRE UMA VEZ SÓ» no
   * `ProposalStudio.tsx`. O `meta.bilingue` lê-se DENTRO do efeito que já
   * existe; um efeito novo a ler o `localStorage` traria de volta o defeito que
   * abria o estúdio vazio com o trabalho todo guardado.
   */
  it("o interruptor volta ligado do meta, e as traduções do rascunho ficam lá", async () => {
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
        moodBoards: [{ title: "Cerimónia", images: ["board/f.jpg"] }],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
    localStorage.setItem(`${DRAFT_KEY}:meta`, JSON.stringify({ bilingue: true }));
    renderStudio();
    await waitFor(() => expect(caixasInglesas().length).toBeGreaterThan(0));
    // E o documento restaurado é o dela, não um vazio escrito por cima.
    expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0);
  });

  it("o estado do interruptor fica gravado ao lado do rascunho, e não dentro dele", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    await waitFor(
      () => expect(localStorage.getItem(`${DRAFT_KEY}:meta`) ?? "").toContain('"bilingue":true'),
      { timeout: 3000 },
    );
    // O documento não ganhou um campo que não diz nada sobre a proposta.
    expect(localStorage.getItem(DRAFT_KEY) ?? "").not.toContain("bilingue");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE VAI SAIR EM PORTUGUÊS, DITO ANTES DE SAIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A caixa inglesa vazia cai para o português, calada e sem marca no papel. O
 * preço de o fazer calado são estes três avisos, e é por eles que a decisão
 * deixa de ser tomada por distracção: o contador em cima do botão que gera, a
 * verificação da Conferência e o painel «Por traduzir».
 */
describe("os avisos da proposta inglesa", () => {
  /** Um rascunho com prosa por traduzir: um grupo, uma linha e uma rubrica. */
  function seedPorTraduzir() {
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
        serviceGroups: [{ title: "Decoração Floral", items: [{ label: "Decor Cerimónia" }] }],
        moodBoards: [],
        budgetItems: ["Decor Cocktail"],
        coverImages: ["", ""],
        totalLabel: "Valor Total Decoração",
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  /** O selector do idioma é um `Segmented` — os segmentos são `role="radio"`,
   *  e o nome acessível vem do `ariaLabel` que explica o que a escolha faz. */
  const escolherIngles = async (user: ReturnType<typeof userEvent.setup>) => {
    await user.click(screen.getAllByRole("radio", { name: /^Inglês/ })[0]);
  };

  it("em português não há painel nem contador — o ecrã é o de sempre", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    expect(screen.queryByText(/Por traduzir/i)).toBeNull();
  });

  it("com «Inglês» escolhido, o painel lista os campos que vão sair em português", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await escolherIngles(user);
    const painel = await screen.findByRole("region", { name: /Por traduzir/i });
    expect(within(painel).getByText(/Serviços · grupo 1/)).toBeTruthy();
    expect(within(painel).getByText(/Orçamento · linha 1/)).toBeTruthy();
  });

  it("a Conferência passa a contar os campos por traduzir em vez da frase antiga", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await escolherIngles(user);
    const conferencia = await screen.findByRole("region", { name: /Conferência/i });
    await waitFor(() =>
      expect(within(conferencia).getByText(/não têm versão inglesa/i)).toBeTruthy(),
    );
    expect(conferencia.textContent).not.toContain("a proposta é escrita em português");
  });

  /**
   * «Ficar em português» transforma o esquecimento em decisão. Sem ele, um
   * campo que não precisa de tradução — «Lisianthus» — contava como falta para
   * sempre, e um aviso sempre aceso é um aviso que se aprende a ignorar.
   */
  it("«Ficar em português» copia o texto e faz a contagem baixar", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await escolherIngles(user);
    const painel = await screen.findByRole("region", { name: /Por traduzir/i });
    // Quatro: o título do grupo, a linha, a rubrica do orçamento e o rótulo do
    // total — todos com português escrito e a caixa inglesa em branco.
    expect(within(painel).getAllByRole("button", { name: /^Ficar em português$/ })).toHaveLength(4);
    // A linha do título do grupo, pelo rótulo — e não a primeira da lista: a
    // ordem é a dos campos no documento, e o rótulo do total vem antes.
    const linha = within(painel)
      .getByText(/Serviços · grupo 1/)
      .closest("li")!;
    await user.click(
      within(linha as HTMLElement).getByRole("button", { name: /^Ficar em português$/ }),
    );
    await waitFor(() =>
      expect(
        within(screen.getByRole("region", { name: /Por traduzir/i })).getAllByRole("button", {
          name: /^Ficar em português$/,
        }),
      ).toHaveLength(3),
    );
    // E o que ficou gravado é o português na caixa inglesa — a decisão, escrita.
    await waitFor(
      () => expect(localStorage.getItem(DRAFT_KEY) ?? "").toContain('"titleEn":"Decoração Floral"'),
      { timeout: 3000 },
    );
  });

  it("«Traduzir» leva ao conteúdo, acende as caixas inglesas e foca a certa", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await escolherIngles(user);
    const painel = await screen.findByRole("region", { name: /Por traduzir/i });
    await user.click(within(painel).getAllByRole("button", { name: /^Traduzir$/ })[0]);
    // O interruptor acende-se sozinho: saltar para uma caixa que não está
    // desenhada deixava-a a olhar para o campo português sem perceber porquê.
    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-campo="grupoTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    expect(caixa).toBeTruthy();
  });

  it("o contador em cima do botão que gera diz o que vai acontecer, antes do clique", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    // A frase do CONTADOR, que é diferente da da Conferência de propósito: o
    // passo «Enviar» está desenhado (escondido) ao mesmo tempo que este, e uma
    // procura por palavras comuns encontrava as duas.
    const contador = /ainda não têm versão inglesa/i;
    expect(screen.queryByText(contador)).toBeNull();
    await escolherIngles(user);
    await waitFor(() => expect(screen.getByText(contador)).toBeTruthy());
  });

  it("a ressalva já não promete que a prosa dela fica toda como está", async () => {
    seedPorTraduzir();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^2\s*Pré-visualizar$/ }));
    const ressalva = screen.getByText(/Em inglês sai a moldura do documento/i);
    expect(ressalva.textContent).toMatch(/caixas «EN»/);
    expect(ressalva.textContent).not.toMatch(/ficam como os escreveste/);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «TRADUZIR PARA INGLÊS» — O BOTÃO QUE AINDA NÃO TEM MOTOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela: o sistema traduz, ela revê o que quiser. O motor não existe —
 * não há serviço escolhido nem chave nenhuma no projecto —, e o que existe é a
 * fronteira onde ele vai entrar (`proposal-traducao.ts`).
 *
 * Enquanto não existir, o botão diz-o. Um botão que finge traduzir e não traduz
 * mandava-a enviar uma proposta a acreditar que estava traduzida — que é o
 * único desfecho pior do que não haver botão nenhum.
 */
describe("traduzir para inglês", () => {
  const interruptor = () => screen.getByRole("button", { name: /Proposta bilingue/i });
  /** O duplo do `fetch` deste ficheiro, para o repor: um teste daqui troca-o
   *  por um servidor que recusa, e `mockClear` não desfaz isso. */
  const fetchDeSempre = fetchMock.getMockImplementation()!;
  afterEach(() => {
    fetchMock.mockImplementation(fetchDeSempre);
  });

  it("o botão só aparece com a proposta bilingue ligada", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: /Traduzir para inglês/i })).toBeNull();
    await user.click(interruptor());
    expect(await screen.findByRole("button", { name: /Traduzir para inglês/i })).toBeTruthy();
  });

  it("sem motor configurado, o botão está desligado e DIZ que ainda não está ligado", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await screen.findByRole("button", { name: /Traduzir para inglês/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    // A razão está à vista, e não escondida num `title` que ninguém abre.
    expect(screen.getByText(/tradução automática ainda não está ligada/i)).toBeTruthy();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * «AINDA NÃO ESTÁ LIGADA» É UMA AFIRMAÇÃO SOBRE A CONFIGURAÇÃO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O estúdio pergunta ao servidor, uma vez, ao abrir. Se a pergunta não chegar
   * a ter resposta — sessão caducada, rede em baixo, um 500 — o botão tem de
   * ficar desligado na mesma: prometer uma tradução que não vai acontecer é
   * pior. O que NÃO pode acontecer é dizer-lhe que falta configurar uma chave.
   *
   * Essa frase manda-a à Vercel procurar uma variável de ambiente, ou fá-la
   * desistir e escrever as caixas inglesas à mão, quando o que estava avariado
   * se curava recarregando a página. É a diferença entre «isto não existe» e
   * «não consegui perguntar», e é a diferença entre uma tarde perdida e um F5.
   */
  it("uma pergunta que não teve resposta NÃO se lê como «falta a chave»", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      // A rota da tradução responde 401 — a sessão do back office caducou. Tudo
      // o resto continua a responder como sempre.
      if (String(input).includes("/propostas/traduzir")) {
        pedidos.push({ url: String(input), init });
        return reply({ ok: false, status: 401, json: { error: "Não autorizado" } });
      }
      return fetchDeSempre(input, init);
    });
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());

    // O botão fica desligado — isso é que está certo e não muda.
    const botao = await screen.findByRole("button", { name: /Traduzir para inglês/i });
    expect((botao as HTMLButtonElement).disabled).toBe(true);
    // Mas a frase não pode culpar a configuração de um problema que não é dela.
    expect(screen.queryByText(/tradução automática ainda não está ligada/i)).toBeNull();
    // Diz o que se sabe — que não se soube — e o que fazer a seguir.
    expect(screen.getByText(/não deu para saber/i)).toBeTruthy();
    expect(screen.getByText(/recarrega/i)).toBeTruthy();
  });

  it("com o serviço ligado, o botão preenche as caixas «EN» de uma vez", async () => {
    traducaoLigadaNoServidor = true;
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);
    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement;
      if (!el || !el.value) throw new Error("ainda não");
      return el;
    });
    expect(caixa.value).toBe("EN: Cerimónia");
    // O português não se mexe: a tradução vive nos campos `…En`, e é por isso
    // que ela pode corrigi-la sem perder o que escreveu.
    expect(JSON.parse(localStorage.getItem(DRAFT_KEY)!).moodBoards[0].title).toBe("Cerimónia");
  });

  it("um serviço que recusa não estraga o documento, e diz porquê", async () => {
    traducaoLigadaNoServidor = true;
    traducaoResponde = () =>
      reply({ ok: false, status: 502, json: { error: "a quota de tradução deste mês acabou" } });
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);
    // A frase vem do servidor, escrita em português, e nunca leva a chave.
    expect(await screen.findByText(/quota de tradução deste mês acabou/i)).toBeTruthy();
    const caixa = document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement;
    expect(caixa.value).toBe("");
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * METADE TRADUZIDA NÃO PODE APARECER A VERDE E MAIS NADA
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O motor manda os textos em lotes de 50, e um lote que falhe volta VAZIO nas
   * suas posições — de propósito, para não deitar fora os que já vieram. Só
   * atira quando NENHUM passa.
   *
   * Numa proposta grande, portanto, um 429 ou uma quota que acaba no segundo
   * lote devolve os primeiros campos traduzidos e o resto em português, sem
   * erro nenhum. O ecrã dizia «N campos traduzidos», a verde, e mais nada.
   *
   * Do lado dela isto lê-se como «não está a dar»: dá numa proposta pequena e
   * não dá numa grande. E o número que aparece está certo — o que faltava era a
   * outra metade da frase, e a indicação de que carregar outra vez adianta (o
   * que já veio está escrito e não se volta a pedir).
   */
  it("o que foi pedido e não voltou é DITO, e não escondido atrás do contador", async () => {
    traducaoLigadaNoServidor = true;
    // O primeiro texto volta traduzido; os outros voltam vazios — a forma de um
    // lote que falhou no meio de uma proposta grande.
    traducaoResponde = (textos) =>
      reply({ json: { textos: textos.map((t, i) => (i === 0 ? `EN: ${t}` : "")) } });
    // Um documento com prosa que chegue para haver «o primeiro» e «os outros».
    seedDraft(1);
    const rascunho = JSON.parse(localStorage.getItem(DRAFT_KEY)!);
    rascunho.serviceGroups = [
      {
        title: "Decoração Floral",
        items: [
          { label: "Decor Cerimónia", desc: "Arco e coxia" },
          { label: "Decor Jantar", desc: "Centros de mesa" },
        ],
      },
    ];
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rascunho));

    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const botao = await waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
    await user.click(botao);

    // Os que vieram entram — isso não muda.
    expect(await screen.findByText(/campo traduzido|campos traduzidos/i)).toBeTruthy();
    // E os que não vieram são ditos, com o número e o que fazer a seguir.
    const aviso = await screen.findByText(/não voltaram do serviço/i);
    expect(aviso.textContent).toMatch(/outra vez/i);
  });

  it("as caixas continuam a poder ser escritas à mão enquanto não há motor", async () => {
    // É o que impede a mudança de direcção de deixar a funcionalidade parada à
    // espera de uma chave: ela pode traduzir uma proposta hoje, à mão.
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));
    await user.click(interruptor());
    const caixa = await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]');
      if (!el) throw new Error("ainda não");
      return el as HTMLInputElement;
    });
    await user.type(caixa, "Ceremony");
    expect(caixa.value).toBe("Ceremony");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRADUZIR COM AS FOTOS A MEIO — «JÁ ESTAVA A ALTERAR FOTOS»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O relato, à letra: «quando alterou para inglês, deu, mas já estava a alterar
 * fotos». A tradução DEU — as caixas «EN» encheram-se, o toast disse que sim —
 * e as fotos que ela estava a mexer nesse intervalo desapareceram.
 *
 * A tradução é uma ida à rede: entre a carregada no botão e a resposta passam
 * segundos, e nesses segundos o estúdio continua vivo. Ela carrega uma foto,
 * tira outra, arruma a grelha. Se a resposta voltar e REPUSER o documento que
 * existia no instante do clique, tudo o que ela fez entretanto vai fora — e
 * vai fora em silêncio, porque a gravação automática grava logo a seguir a
 * versão amputada, no `localStorage` e no servidor.
 *
 * É a mesma disciplina que a cópia de fotos da biblioteca já segue, escrita lá
 * ao lado: «se ela já tiver mexido no bloco entretanto (arrastado, removido uma
 * foto), a troca acompanha na mesma em vez de escrever por cima do que ela
 * fez». A tradução tem de a seguir também.
 */
describe("traduzir com as fotos a meio", () => {
  const interruptor = () => screen.getByRole("button", { name: /Proposta bilingue/i });
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
  const fotosDoRascunho = (): string[] => {
    const cru = localStorage.getItem(DRAFT_KEY);
    if (!cru) return [];
    return (JSON.parse(cru)?.moodBoards?.[0]?.images ?? []) as string[];
  };

  /**
   * A rota da tradução fica PRESA até se soltar a corda que isto devolve.
   *
   * É a janela real: o pedido saiu, a resposta ainda não chegou, e o estúdio
   * continua a responder às mãos dela.
   */
  function traducaoPresa(): () => void {
    let soltar!: () => void;
    const espera = new Promise<void>((r) => {
      soltar = r;
    });
    traducaoResponde = (textos) =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => {
          await espera;
          return { textos: textos.map((t) => `EN: ${t}`) };
        },
      }) as unknown as Response;
    return () => soltar();
  }

  /** Liga o bilingue e devolve o botão de traduzir já activo. */
  async function botaoDeTraduzir(user: ReturnType<typeof userEvent.setup>) {
    await user.click(interruptor());
    return waitFor(async () => {
      const b = (await screen.findByRole("button", {
        name: /Traduzir para inglês/i,
      })) as HTMLButtonElement;
      if (b.disabled) throw new Error("ainda a perguntar ao servidor");
      return b;
    });
  }

  /** Espera pela caixa inglesa preenchida — a prova de que a tradução chegou. */
  async function traducaoChegou() {
    await waitFor(() => {
      const el = document.querySelector('[data-campo="boardTitulo:0:en"]') as HTMLInputElement;
      if (!el || !el.value) throw new Error("ainda não");
    });
  }

  it("uma foto acrescentada enquanto a tradução vai a caminho NÃO desaparece", async () => {
    traducaoLigadaNoServidor = true;
    const soltar = traducaoPresa();
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    const botao = await botaoDeTraduzir(user);
    await user.click(botao);

    // Ela não fica a olhar para o botão: continua a montar o mood board.
    await user.click(
      await screen.findByRole("button", { name: /Escolher da biblioteca de temas/ }),
    );
    await user.click(await screen.findByRole("button", { name: "escolher-foto-de-teste" }));
    expect(celulas()).toHaveLength(2);

    // E só agora é que a tradução responde.
    await act(async () => {
      soltar();
      await Promise.resolve();
    });
    await traducaoChegou();

    // A tradução entrou — e a foto que ela pôs continua lá, no ecrã e no
    // rascunho gravado.
    expect(celulas()).toHaveLength(2);
    await waitFor(() => expect(fotosDoRascunho()).toContain("board/nova.jpg"));
  });

  it("uma foto removida enquanto a tradução vai a caminho NÃO volta", async () => {
    traducaoLigadaNoServidor = true;
    const soltar = traducaoPresa();
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    const botao = await botaoDeTraduzir(user);
    await user.click(botao);

    const remover = document.querySelectorAll<HTMLElement>('[aria-label="Remover fotografia"]');
    await user.click(remover[0]);
    expect(celulas()).toHaveLength(1);

    await act(async () => {
      soltar();
      await Promise.resolve();
    });
    await traducaoChegou();

    expect(celulas()).toHaveLength(1);
    await waitFor(() => expect(fotosDoRascunho()).toEqual(["board/foto-1.jpg"]));
  });

  it("as fotos reordenadas enquanto a tradução vai a caminho ficam pela ordem nova", async () => {
    traducaoLigadaNoServidor = true;
    const soltar = traducaoPresa();
    seedDraft(3);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    const botao = await botaoDeTraduzir(user);
    await user.click(botao);

    // «Para trás» na segunda foto: a ordem passa a 1, 0, 2.
    const paraTras = document.querySelectorAll<HTMLElement>('[aria-label="Mover para trás"]');
    await user.click(paraTras[1]);
    await waitFor(() =>
      expect(fotosDoRascunho()).toEqual([
        "board/foto-1.jpg",
        "board/foto-0.jpg",
        "board/foto-2.jpg",
      ]),
    );

    // A partir daqui só interessa o que for gravado DEPOIS da tradução chegar:
    // o `localStorage` ainda tem a versão de há um instante, e lê-lo cedo
    // demais dava um teste verde sobre um documento que ainda vai ser
    // reescrito.
    pedidos = [];
    await act(async () => {
      soltar();
      await Promise.resolve();
    });
    await traducaoChegou();
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    const gravado = corpos("proposta-rascunho").at(-1)!;
    expect(JSON.parse(gravado).doc.moodBoards[0].images).toEqual([
      "board/foto-1.jpg",
      "board/foto-0.jpg",
      "board/foto-2.jpg",
    ]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «AS FOTOS DESAPARECERAM DEPOIS DO DEPLOYMENT»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma foto posta numa proposta são TRÊS coisas em três sítios diferentes, e
 * confundi-las é confundir o que se perdeu:
 *
 *   · os BYTES         → o bucket do Supabase (`proposal-storage.ts`). Não há
 *                        um único caminho que os escreva em disco local: sem
 *                        base de dados a rota das fotos responde 503 e o
 *                        carregamento não acontece. Um deploy não lhes toca.
 *   · as ASSINATURAS   → pedidas ao servidor a cada abertura (`/assets`).
 *                        Expiram, e voltam a nascer. Também não se perdem.
 *   · a LISTA          → quais, por que ordem, em que mood board. Isto é a
 *                        MONTAGEM, é trabalho de horas, e vive no documento do
 *                        estúdio. É a única das três que se pode perder.
 *
 * A lista tem três cópias, e só uma delas dura: o `localStorage` (por ORIGEM,
 * neste navegador), o rascunho no servidor (`app_state`) e a proposta gravada
 * ao enviar. Os dois testes que se seguem cobrem os dois desfechos.
 */
describe("a lista das fotos e o que sobrevive a um deployment", () => {
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));

  /**
   * ── A HIPÓTESE DO ENDEREÇO ──────────────────────────────────────────────
   *
   * O `localStorage` é POR ORIGEM. O endereço de pré-visualização
   * (`…-git-….vercel.app`) e o domínio de produção são origens diferentes para
   * o navegador: um rascunho montado num não existe no outro. Do lado de quem
   * trabalha isso lê-se exactamente como «as fotos desapareceram depois do
   * deployment» — sem que nada se tenha perdido.
   *
   * Este teste é a boa notícia, e é o que autoriza dizê-la: com o rascunho no
   * SERVIDOR, abrir o mesmo pedido num navegador que nunca viu esta proposta
   * (é o que um `localStorage` vazio é) devolve a montagem inteira, com as
   * fotos e as assinaturas frescas.
   */
  it("o MESMO pedido, no outro endereço: a montagem volta inteira do servidor", async () => {
    // Um navegador que nunca viu esta proposta — nem rascunho, nem `meta`, nem
    // uma única assinatura guardada. É o que a outra origem é.
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [],
        moodBoards: [
          { title: "Cerimónia", images: ["q1/a.jpg", "q1/b.jpg", "q1/c.jpg"] },
          { title: "Copo de água", images: ["q1/d.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      },
    };
    // O servidor conhece as fotos e assina-as de novo: as assinaturas não são
    // trabalho dela, nascem a cada abertura.
    assetsServidor = [
      { path: "q1/a.jpg", url: "https://sb/q1/a.jpg?assinado=1" },
      { path: "q1/b.jpg", url: "https://sb/q1/b.jpg?assinado=1" },
      { path: "q1/c.jpg", url: "https://sb/q1/c.jpg?assinado=1" },
      { path: "q1/d.jpg", url: "https://sb/q1/d.jpg?assinado=1" },
    ];
    renderStudio();

    // A montagem: os dois mood boards, com as fotos e pela ordem em que ela as
    // pôs. É isto que não pode depender do endereço.
    await screen.findByDisplayValue("Cerimónia");
    await screen.findByDisplayValue("Copo de água");
    await waitFor(() => expect(celulas()).toHaveLength(4));

    // E as células têm mesmo por onde desenhar — a assinatura fresca do
    // servidor. Sem isto o ecrã tinha quatro buracos, que se lê na mesma como
    // «as fotos desapareceram».
    await waitFor(() => {
      const fontes = Array.from(document.querySelectorAll("img")).map((i) => i.getAttribute("src"));
      expect(fontes.filter((f) => f?.includes("assinado=1")).length).toBeGreaterThanOrEqual(4);
    });
  });

  /**
   * ── O CASO EM QUE SE PERDE MESMO ────────────────────────────────────────
   *
   * Produção sem Supabase: o `app_state` cai no `data/app-state.json`, que em
   * Vercel é o disco da função — o `setState` devolve `duradouro: false` e a
   * rota di-lo por escrito, com `guardado: true`, `duradouro: false` e a frase
   * a explicar que o próximo deploy o apaga.
   *
   * O estúdio lê o `updatedAt`, o `overwrote` e o `previousBy` dessa resposta —
   * e deita fora o `duradouro`. Resultado: o indicador escreve «guardado às
   * 14:32» sobre um rascunho que o deploy seguinte leva. É a MESMA frase, sobre
   * a MESMA perda, que este ficheiro inteiro existe para não voltar a deixar
   * dizer: «"Guardado" é a palavra que faz uma pessoa fechar o portátil
   * descansada».
   */
  it("um rascunho guardado onde o deploy apaga NÃO pode ser anunciado como guardado", async () => {
    gravacaoDoRascunho = () =>
      reply({
        json: {
          ok: true,
          guardado: true,
          // O servidor diz a verdade: ficou, e não dura.
          duradouro: false,
          onde: "ficheiro-efemero",
          aviso:
            "Guardado apenas no disco do servidor, que é apagado no próximo deploy. " +
            "Liga a base de dados (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY) para o trabalho ficar mesmo guardado.",
          updatedAt: new Date().toISOString(),
          overwrote: false,
        },
      });
    seedDraft(2);
    renderStudio();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getAllByDisplayValue("Cerimónia").length).toBeGreaterThan(0));

    // Ela mexe na proposta — é o que dispara a gravação.
    await user.type(screen.getByLabelText("Clientes"), "!");
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });

    // O indicador assenta — e não pode assentar na frase de sempre, que é a
    // que faz uma pessoa fechar o portátil descansada.
    // O indicador assenta — e não pode assentar na frase de sempre, que é a
    // que faz uma pessoa fechar o portátil descansada.
    await waitFor(
      () => {
        expect(screen.queryByText(/^guardado às \d{2}:\d{2}$/)).toBeNull();
        expect(screen.getAllByText(/próximo deploy apaga/i)).not.toEqual([]);
      },
      { timeout: 3000 },
    );
    // E ela tem de ficar a saber o que se passa, com o nome das variáveis que
    // resolvem — é quem está no ecrã que pode ir falar com quem gere a
    // instalação.
    expect(
      await screen.findAllByText(/apagado no próximo deploy/i, undefined, { timeout: 3000 }),
    ).not.toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PORQUE É QUE ELA NÃO VÊ AS FOTOGRAFIAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «estava a ver, pelo back office, se conseguia ver as imagens
 * quando estava a fazer a proposta e não consigo» — em 4G, e nas capturas cada
 * célula era uma caixa cinzenta com a palavra «Imagem».
 *
 * Essa caixa era o ramo em que a célula NÃO TEM URL. Num telemóvel que nunca
 * abriu esta proposta não há `localStorage` nenhum: o mapa dos URL começa
 * vazio, e tudo depende de uma leitura só (`GET /assets`). Ela era silenciosa
 * nos dois sentidos — enquanto vinha a caminho, e quando não vinha de todo.
 *
 * MEDIDO no estúdio a 1,6 Mbps, telemóvel de 375×667, 24 células sem
 * miniatura: as **24 caixas cinzentas** no instante em que a lista chega, a
 * primeira fotografia pintada aos **34,0 s**, a grelha que está no ecrã só
 * completa aos **67,6 s**, e 1099 KB por célula (26,4 MB nas 24) para caixas de
 * 174 px. Com miniatura: 20 KB por célula, 0,4 MB, e tudo o que está no ecrã
 * pintado aos **2,5 s**.
 */
describe("porque é que ela não vê as fotografias", () => {
  const celulas = () => Array.from(document.querySelectorAll<HTMLElement>("[data-foto]"));
  const comSrc = () =>
    Array.from(document.querySelectorAll<HTMLImageElement>("[data-foto] img")).filter((i) =>
      i.getAttribute("src"),
    );

  /**
   * O ramo «a caminho». A célula não pode dizer o mesmo que uma célula
   * avariada: uma caixa parada com «Imagem» lê-se como «esta foto não existe»,
   * e foi essa leitura que fez concluir que não se via nada.
   */
  it("enquanto a lista vem a caminho, a célula diz que está a carregar — não «Imagem»", async () => {
    seedDraft(3);
    const abrirOsAssets = segurarOsAssets();
    renderStudio();
    await waitFor(() => expect(celulas()).toHaveLength(3));

    for (const c of celulas()) {
      expect(c.querySelector("[data-a-carregar]")).not.toBeNull();
      // A palavra sozinha era tudo o que havia. Não pode voltar.
      expect(c.textContent?.trim()).not.toBe("Imagem");
    }

    abrirOsAssets();
  });

  /**
   * O ramo «não veio». Era um `return` mudo: a célula ficava cinzenta para
   * sempre, sem explicação e sem saída, e a única forma de tentar outra vez era
   * recarregar a página inteira — em 4G, com tudo o que isso custa.
   */
  it("quando a lista FALHA, a célula diz-o e dá um botão para tentar outra vez", async () => {
    seedDraft(2);
    assetsFalham = true;
    renderStudio();

    const aviso = await screen.findAllByText(/Não carregou/i);
    expect(aviso.length).toBeGreaterThan(0);

    // E o botão pede MESMO a lista outra vez — com a resposta boa, as fotos
    // aparecem sem recarregar nada.
    assetsFalham = false;
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
      { path: "board/foto-1.jpg", url: "https://sb/1.jpg", thumbUrl: "https://sb/mini-1.jpg" },
    ];
    await userEvent.click(
      screen.getAllByRole("button", { name: /Ir buscar outra vez as fotografias/i })[0],
    );

    await waitFor(() => {
      const fontes = comSrc().map((i) => i.getAttribute("src"));
      expect(fontes.filter((f) => f?.includes("mini-")).length).toBe(2);
    });
  });

  /**
   * A MINIATURA GANHA AO ORIGINAL, e o original fica como plano B.
   *
   * É a diferença entre 20 KB e 1099 KB por célula — e, com 24 células, entre
   * 0,4 MB e 26,4 MB.
   */
  it("a célula desenha a miniatura, e não o original", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/original.jpg", thumbUrl: "https://sb/mini.jpg" },
    ];
    renderStudio();
    await waitFor(() => expect(comSrc()).toHaveLength(1));
    expect(comSrc()[0].getAttribute("src")).toBe("https://sb/mini.jpg");
  });

  /**
   * ── A FILA ────────────────────────────────────────────────────────────────
   *
   * Uma foto sem derivada leve puxa o ORIGINAL. Vinte e quatro ao mesmo tempo
   * repartem o canal e acabam TODAS no fim: medido, a primeira só aos 30 s. A
   * fila deixa passar três de cada vez — e as da primeira dobra não esperam por
   * ninguém, porque são as que ela está a olhar.
   *
   * O que se conta aqui são os `src` POSTOS: um `src` posto é um download
   * começado, e é por isso que uma célula à espera de vez fica sem ele.
   */
  it("com 24 fotos SEM miniatura, não são 24 downloads ao mesmo tempo", async () => {
    seedDraft(24);
    assetsServidor = Array.from({ length: 24 }, (_, i) => ({
      path: `board/foto-${i}.jpg`,
      url: `https://sb/original-${i}.jpg`,
    }));
    renderStudio();
    await waitFor(() => expect(celulas()).toHaveLength(24));
    // Sem miniatura, o `url` do servidor É o original: todas as células
    // esperam pela vez, incluindo as da primeira dobra (a prioridade não fura a
    // fila — medido, furá-la punha a primeira fotografia aos 32,0 s em vez dos
    // 16,0 s a que chega com o tecto de três).
    await waitFor(() => expect(comSrc().length).toBeGreaterThan(0));
    expect(comSrc().length).toBeLessThanOrEqual(3);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA VEIO VAZIA — QUE NÃO É A MESMA COISA QUE A LISTA NÃO TER VINDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `listProposalImages` devolve `[]` quando não alcança o bucket, em vez de
 * atirar. Do lado do estúdio isso chega como um 200 com zero fotografias: a
 * hidratação dá-se por concluída e o mapa dos URL fica vazio.
 *
 * As células ficavam cinzentas com a palavra «Imagem» — exactamente o mesmo
 * ecrã de quando a leitura falha, e exactamente o mesmo de quando a foto ainda
 * vem a caminho. Três causas, um só ecrã, nenhuma saída.
 */
describe("uma foto do documento que não veio na lista do servidor", () => {
  it("di-lo, e não fica cinzenta a dizer «Imagem»", async () => {
    seedDraft(2);
    // O servidor responde bem — e não conhece nenhuma destas fotos.
    assetsServidor = [];
    renderStudio();

    const aviso = await screen.findAllByText(/Não veio na lista/i);
    expect(aviso.length).toBeGreaterThan(0);
    // E não é a etiqueta da leitura falhada: as duas causas têm respostas
    // diferentes do lado de quem as vai investigar.
    expect(screen.queryByText(/Não carregou/i)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ESTÚDIO NO TELEMÓVEL DELA — as três coisas de que ela mandou fotografia
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um bloco só, no fim do ficheiro e de propósito: são três defeitos vistos no
 * mesmo ecrã, a 390 px, na mesma proposta.
 */
describe("o estúdio no telemóvel: fotos, acções e descrições", () => {
  /** A barra dos sete ícones — encontrada pelo primeiro botão dela. */
  const barraDasAccoes = () =>
    document.querySelector('button[aria-label="Mover para trás"]')?.closest("div") ?? null;

  /**
   * ── A BARRA QUE VOLTOU A TAPAR A CÉLULA ──────────────────────────────────
   *
   * Estava escondida com `[@media(hover:none)]` e os botões cresciam com
   * `(pointer: coarse)` (`.alvo-toque`) — duas perguntas diferentes sobre o
   * mesmo aparelho. Num iPhone com AssistiveTouch, num iPad com trackpad ou
   * num portátil de ecrã táctil, a primeira responde NÃO e a segunda SIM: a
   * barra fica e cada ícone salta de 24 px para 44. MEDIDO a 390 px nesse
   * aparelho: 89 × 328 px por cima de uma célula de 89 × 104, a subir 209 px
   * acima dela, com cinco pedaços de texto tapados.
   *
   * Aqui prende-se a REGRA, que é o que não pode voltar a divergir: a barra
   * pergunta pelo ponteiro inteiro (`com-rato`) e os botões dela não são alvos
   * de toque — porque uma barra que só existe com rato não precisa de 44 px,
   * e foi esse mínimo que a transformou numa coluna.
   */
  it("a barra de acções não existe sem rato, e os botões dela não são alvos de toque", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
    ];
    renderStudio();
    await waitFor(() => expect(barraDasAccoes()).not.toBeNull());

    const barra = barraDasAccoes()!;
    const classes = barra.className;
    expect(classes, "a barra tem de estar escondida por omissão").toContain("hidden");
    expect(classes, "e só aparecer onde há MESMO rato").toContain("com-rato:flex");
    expect(
      classes,
      "`(hover: none)` é metade da pergunta — a que falha no aparelho que trouxe isto",
    ).not.toContain("hover:none");

    for (const b of Array.from(barra.querySelectorAll("button"))) {
      expect(
        b.className,
        `«${b.getAttribute("aria-label")}» é da barra do rato e não pode ser um alvo de 44 px`,
      ).not.toContain("alvo-toque");
    }

    // E o caminho do dedo existe por omissão: é ele que fica quando a barra sai.
    const pontos = document.querySelector('button[aria-label^="Acções de"]')!;
    expect(pontos.className).toContain("com-rato:hidden");
    expect(pontos.className).toContain("alvo-toque");
  });

  /**
   * ── A DESCRIÇÃO QUE CORTAVA TEXTO A MEIO ─────────────────────────────────
   *
   * `rows={2}` e o resto a rolar por dentro. MEDIDO a 390 px: 70 px de caixa
   * para 224 px de texto português (154 px escondidos) e 276 de inglês (206
   * escondidos). O jsdom não maquetiza, portanto o que se prende aqui é a
   * causa e não o efeito: a altura deixa de estar escrita no `rows`.
   */
  it("a descrição do mood board não abre com altura fixa", async () => {
    seedDraft(1, { annotation: "uma descrição comprida ".repeat(12) });
    renderStudio();
    const campo = await waitFor(() => {
      const c = document.querySelector<HTMLTextAreaElement>('[data-campo="boardNota:0"]');
      expect(c).not.toBeNull();
      return c!;
    });
    expect(campo.rows, "a altura volta a estar presa a duas linhas").toBe(1);
  });

  /**
   * ── «GUARDADA MAS NÃO A CONSIGO MOSTRAR» QUANDO NÃO FOI ISSO ─────────────
   *
   * Uma `img-src` que não nomeia a origem do Storage faz o browser recusar a
   * fotografia ANTES de a pedir: sem pedido, sem código de estado, só o
   * `onerror` — igual, do lado do JavaScript, a um 404. E o remédio é o
   * oposto: um «Tentar novamente» vai falhar exactamente da mesma maneira
   * todas as vezes.
   *
   * O casamento é por ORIGEM, e é isso que este teste prende: o `blockedURI`
   * vem inteiro no Chromium mas a norma deixa entregá-lo cortado à origem — e
   * o telemóvel dela é um iPhone.
   */
  it("distingue «o sítio recusou» de «o ficheiro não veio»", async () => {
    seedDraft(1);
    assetsServidor = [
      {
        path: "board/foto-0.jpg",
        url: "https://storage.exemplo/0.jpg",
        thumbUrl: "https://storage.exemplo/mini-0.jpg",
      },
    ];
    renderStudio();

    // As duas moradas falham, como falham quando o browser as recusa.
    const morrer = async () => {
      const img = document.querySelector<HTMLImageElement>("[data-foto] img");
      if (!img) return;
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
    };
    await waitFor(() => expect(document.querySelector("[data-foto] img")).not.toBeNull());
    await morrer();
    await morrer();
    // Sem notícias do browser, é o ramo de sempre: «Imagem guardada» e um
    // botão para tentar outra vez.
    expect(await screen.findByText(/Imagem guardada/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Tentar novamente" })).not.toBeNull();
    expect(screen.queryByText(/O site não a deixa aparecer/i)).toBeNull();

    // O browser anuncia a recusa — com o `blockedURI` CORTADO À ORIGEM.
    await act(async () => {
      const e = new Event("securitypolicyviolation");
      Object.assign(e, {
        blockedURI: "https://storage.exemplo",
        effectiveDirective: "img-src",
        violatedDirective: "img-src",
      });
      document.dispatchEvent(e);
    });

    expect(
      await screen.findByText(/O site não a deixa aparecer/i),
      "a célula continuou a acusar a fotografia de uma coisa que não é dela",
    ).toBeTruthy();
    expect(
      screen.queryByText(/Imagem guardada/i),
      "continuou no ramo do ficheiro que não veio",
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Tentar novamente" }),
      "um botão que não pode funcionar é uma promessa vazia",
    ).toBeNull();
  });

  /**
   * ── O BOTÃO QUE NÃO PODIA FUNCIONAR ──────────────────────────────────────
   *
   * MEDIDO com a rede a devolver 503: o «Tentar novamente» repetia, ao byte,
   * os dois URL que acabavam de falhar. Contra a causa mais provável de uma
   * grelha inteira morta — assinaturas que já não servem — isso é um botão
   * que não pode funcionar por construção.
   */
  it("o «Tentar novamente» de uma célula morta vai buscar assinaturas frescas", async () => {
    seedDraft(1);
    assetsServidor = [
      { path: "board/foto-0.jpg", url: "https://sb/0.jpg", thumbUrl: "https://sb/mini-0.jpg" },
    ];
    renderStudio();
    const morrer = async () => {
      const img = document.querySelector<HTMLImageElement>("[data-foto] img");
      if (!img) return;
      await act(async () => {
        img.dispatchEvent(new Event("error"));
      });
    };
    await waitFor(() => expect(document.querySelector("[data-foto] img")).not.toBeNull());
    await morrer();
    await morrer();
    const botao = await screen.findByRole("button", { name: "Tentar novamente" });

    const leituras = () => pedidos.filter((p) => p.url.includes("/assets")).length;
    const antes = leituras();
    await userEvent.click(botao);
    await waitFor(() => expect(leituras()).toBeGreaterThan(antes));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O EMAIL QUE ELA LÊ NO ECRÃ É O EMAIL QUE SAI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel do email (`EmailDoEnvio`) prepara o texto; é o ESTÚDIO que o envia.
 * Estes testes prendem essa junta — a que não se vê em nenhum dos dois lados
 * sozinho: o que está na caixa quando ela carrega em Enviar é o que viaja, e
 * quando não há texto nenhum o envio é byte a byte o de antes deste ecrã.
 */
describe("o email do passo 3 viaja com o envio", () => {
  const caixaDoEmail = () => screen.getByLabelText("Texto do email") as HTMLTextAreaElement;

  function envio(): Record<string, unknown> {
    return JSON.parse(corpos("proposta-doc", "POST").at(-1) ?? "{}");
  }

  async function irParaEnviar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
  }

  async function enviar(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: /Gerar e enviar ao cliente/ }));
    await user.click(await screen.findByRole("button", { name: /^Confirmar$/ }));
  }

  it("o texto que está na caixa é o que segue, com o assunto e o modelo", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(caixaDoEmail().value).toContain("Olá Maria & Zé,"));
    await enviar(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio().corpo).toContain("Olá Maria & Zé,");
    expect(envio().assunto).toBe("A vossa proposta — Líquen Events");
    // A chave do modelo vai para a CÓPIA do envio — não escolhe texto nenhum.
    expect(envio().modelo).toBe("registo-formal");
  });

  it("o que ela reescreve é o que viaja", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(caixaDoEmail().value).toContain("Olá"));
    await user.clear(caixaDoEmail());
    await user.type(caixaDoEmail(), "Escrevi isto à mão.");
    await enviar(user);

    await waitFor(() => expect(envio().corpo).toBe("Escrevi isto à mão."));
  });

  /**
   * CONTROLO POSITIVO das duas ausências abaixo: os testes acima provam que o
   * campo VIAJA quando há texto. Sem rascunho preparado, o pedido tem de sair
   * exactamente como saía antes deste ecrã existir — uma rota que passasse a
   * EXIGIR o corpo partia tudo o que já a chama.
   */
  it("sem texto preparado, o envio não leva corpo nenhum", async () => {
    rascunhoDoEmail = null;
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(screen.getByText(/Não há nenhum modelo/)).toBeTruthy());
    await enviar(user);

    await waitFor(() => expect(envio().mode).toBe("send"));
    expect(envio()).not.toHaveProperty("corpo");
    expect(envio()).not.toHaveProperty("assunto");
  });

  /**
   * Com o texto editável, o que segue é o TEXTO. Uma nota pessoal que não
   * apareça lá dentro não chega ao casal — e ela via-a no ecrã, escrita.
   */
  it("avisa quando a nota pessoal não está no texto do email", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(caixaDoEmail().value).toContain("Olá"));
    await user.type(screen.getByLabelText("Mensagem para o cliente"), "Foi um gosto conhecer-vos.");
    expect(await screen.findByText(/Esta nota não aparece no texto do email/)).toBeTruthy();
  });

  /** O controlo positivo do aviso acima: escrita DENTRO do texto, cala-se. */
  it("não avisa quando a nota está lá dentro", async () => {
    seedDraft(1);
    renderStudio();
    const user = userEvent.setup();
    await irParaEnviar(user);
    await waitFor(() => expect(caixaDoEmail().value).toContain("Olá"));
    await user.type(caixaDoEmail(), " Foi um gosto conhecer-vos.");
    await user.type(screen.getByLabelText("Mensagem para o cliente"), "Foi um gosto conhecer-vos.");
    expect(screen.queryByText(/Esta nota não aparece no texto do email/)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NOTA INTERNA, MONTADA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O campo existia e não estava em lado nenhum: a única referência a
 * `NotasInternas.tsx` em todo o `src/` era o seu próprio teste. Passa a viver
 * na secção «Evento» do estúdio, e o que se escreve lá vai no rascunho — que é
 * o que faz a nota sobreviver a fechar o separador.
 *
 * A garantia de que NÃO sai no PDF está onde tem de estar, no gerador:
 * `src/lib/notas-internas-ficam-em-casa.test.ts`, com controlo positivo.
 */
describe("as notas internas vivem no estúdio", () => {
  it("o campo está montado e diz que não sai na proposta", () => {
    seedDraft(0);
    renderStudio();
    expect(screen.getByLabelText(/Notas internas/)).toBeTruthy();
    expect(screen.getByText(/só para ti, nunca sai na proposta/)).toBeTruthy();
  });

  it("o que se escreve na nota entra no rascunho gravado", async () => {
    seedDraft(0);
    renderStudio();
    const user = userEvent.setup();
    await user.type(screen.getByLabelText(/Notas internas/), "Decide a mãe");

    await waitFor(() => {
      const gravados = corpos("proposta-rascunho");
      expect(gravados.some((b) => b.includes("Decide a mãe"))).toBe(true);
    });
    // CONTROLO POSITIVO da leitura acima: o corpo gravado é MESMO o documento,
    // e o campo tem MESMO o nome por que o PDF pergunta. Sem isto, um
    // `includes` sobre um corpo qualquer passaria por acidente.
    const ultimo = corpos("proposta-rascunho").at(-1) ?? "";
    expect(JSON.parse(ultimo).doc.notasInternas).toContain("Decide a mãe");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE FALTA PARA ENVIAR DEIXA DE SER INVISÍVEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A lista vivia numa coluna lateral `xl:block` — abaixo de 1280 px ela nunca a
 * via — e o passo de envio tinha uma frase estática, sempre com as mesmas
 * palavras e sem link nenhum: «Preenche clientes, referência e um total maior
 * que 0».
 *
 * Passa a estar na Conferência, que é a lista que já se lê antes de carregar em
 * enviar e que não depende da largura do ecrã. E cada linha leva ao campo.
 */
describe("o que falta para enviar, no passo de enviar", () => {
  /** Um rascunho a que falta o nome dos clientes — o que TRAVA o envio. */
  function seedSemNome() {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
        moodBoards: [],
        budgetItems: ["Decor"],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("a frase estática saiu — no lugar dela está o nome do que falta", async () => {
    seedSemNome();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    expect(
      screen.queryByText(/Preenche clientes, referência e um total maior que 0 \(no passo/),
    ).toBeNull();
    expect(await screen.findByText(/Uma coisa impede o envio/)).toBeTruthy();
    expect(screen.getByText("Nome dos clientes")).toBeTruthy();
  });

  it("tocar na linha volta ao conteúdo e põe o cursor no campo", async () => {
    seedSemNome();
    renderStudio();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: /^3\s*Enviar$/ }));
    await user.click(await screen.findByRole("button", { name: /Nome dos clientes/ }));

    // De volta ao passo 1 — o campo vive lá.
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^1\s*Conteúdo$/ })).toHaveAttribute(
        "aria-current",
        "step",
      ),
    );
    const campo = document.querySelector<HTMLInputElement>('[data-campo="clientNames"]');
    expect(campo).not.toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(campo));
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE VEIO DO PEDIDO FICA ASSINALADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O pré-preenchimento já existia. O que não existia era dizê-lo: um campo
 * semeado a partir do formulário do casal lia-se exactamente como um campo
 * escrito por ela — e um campo escrito por ela não se relê.
 *
 * O anel laranja é o MESMO da cópia de outra proposta, e a confirmação é a
 * mesma: tocar-lhe.
 */
describe("os campos semeados do pedido ficam marcados", () => {
  const comTudo = {
    ...quote,
    date: "2026-09-12",
    location: "Évora",
    guests: 80,
    ceremonyType: "civil",
  } as unknown as Quote;

  const renderCom = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} />
      </ToastProvider>,
    );

  /** O invólucro do campo leva o anel — é lá que o `containerClassName` cai. */
  const anelDe = (rotulo: string) =>
    screen.getByLabelText(rotulo).closest("div")?.className.includes("ring-2") ?? false;

  it("acende o anel nos campos que o pedido respondeu", async () => {
    renderCom(comTudo);
    await waitFor(() => expect(anelDe("Clientes")).toBe(true));
    expect(anelDe("Data")).toBe(true);
    expect(anelDe("Local")).toBe(true);
    expect(anelDe("Convidados")).toBe(true);
    // Os três que não tinham anel nenhum antes desta alteração.
    expect(anelDe("Tipo de evento")).toBe(true);
    expect(anelDe("Cerimónia")).toBe(true);
  });

  it("não acende num campo que o pedido não soube responder", async () => {
    // CONTROLO POSITIVO do teste de cima: o mesmo ecrã, com o mesmo mecanismo
    // ligado, deixa em paz o que está vazio. Um anel à volta de uma caixa em
    // branco não pede confirmação nenhuma — pede que se ignore o anel.
    renderCom(comTudo);
    await waitFor(() => expect(anelDe("Clientes")).toBe(true));
    expect(screen.getByLabelText("Hora")).toHaveValue("");
    expect(anelDe("Hora")).toBe(false);
  });

  it("tocar no campo é a confirmação", async () => {
    renderCom(comTudo);
    const user = userEvent.setup();
    await waitFor(() => expect(anelDe("Cerimónia")).toBe(true));
    await user.type(screen.getByLabelText("Cerimónia"), " e religiosa");
    expect(anelDe("Cerimónia")).toBe(false);
    // E só nesse — confirmar um não confirma os outros.
    expect(anelDe("Local")).toBe(true);
  });

  it("um rascunho já começado não pede confirmação nenhuma", async () => {
    // O rascunho é trabalho DELA. Pedir-lhe que confirme o que ela própria
    // escreveu é o caminho mais curto para o anel deixar de querer dizer algo.
    seedDraft(0);
    renderCom(comTudo);
    await waitFor(() => expect(screen.getByLabelText("Clientes")).toHaveValue("Maria & Zé"));
    expect(anelDe("Clientes")).toBe(false);
    expect(anelDe("Local")).toBe(false);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A MESMA FOTOGRAFIA DUAS VEZES NA MESMA PROPOSTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * É o único caso em que o casal vê a mesma fotografia duas vezes no documento
 * que recebe, e é quase sempre um engano — arrastou-se em vez de mover, ou
 * duplicou-se um board e esqueceu-se de trocar uma foto.
 *
 * Assinalada NAS DUAS: assinalar só a segunda obrigava a procurar a primeira.
 */
describe("fotos repetidas dentro da mesma proposta", () => {
  /** Dois boards, com a mesma foto no primeiro lugar de cada um. */
  function seedComRepetida() {
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
          { title: "Cerimónia", images: ["board/a.jpg", "board/b.jpg"] },
          { title: "Jantar", images: ["board/a.jpg", "board/c.jpg"] },
        ],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  it("marca as DUAS células, e diz quantas vezes", async () => {
    seedComRepetida();
    renderStudio();
    const marcas = await screen.findAllByText("2× nesta proposta");
    expect(marcas).toHaveLength(2);
  });

  it("CONTROLO POSITIVO: sem repetição não marca nada", async () => {
    // O mesmo ecrã, com o mesmo mecanismo ligado. Sem isto, «duas marcas»
    // acima podia estar a passar por a grelha marcar sempre todas as fotos.
    seedDraft(3);
    renderStudio();
    // A grelha está mesmo desenhada — três células, três fotos diferentes.
    expect(await screen.findAllByLabelText(/Arrastar a fotografia/)).toHaveLength(3);
    expect(screen.queryByText(/nesta proposta$/)).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CHOQUE DE DATAS TAMBÉM AO ESCREVER A DATA AQUI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O aviso disparava só ao ESCOLHER o cliente, a partir do `quote.date`. Mas a
 * data que sai impressa é a deste documento, e este campo é texto livre: o
 * casal liga a mudar o dia, ela corrige aqui, e o aviso continuava a olhar
 * para a data do formulário.
 */
describe("o dia ocupado, a partir da data escrita na proposta", () => {
  /** Um casamento já COTADO no dia 20, a 3 km — para o choque ter matéria. */
  const jaMarcado = {
    id: "LQ-outro",
    name: "Sara e Nuno",
    status: "cotado",
    date: "2026-09-20",
    location: "Évora",
  } as unknown as Quote;

  const renderCom = (q: Quote) =>
    render(
      <ToastProvider>
        <ProposalStudio quote={q} quotes={[q, jaMarcado]} />
      </ToastProvider>,
    );

  function seedComData(data: string) {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: data,
        location: "Évora",
        guests: "80 pax",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalAmount: 3000,
        totalVatMode: "acrescer",
      }),
    );
  }

  const pedido = { ...quote, date: "2026-05-02", location: "Évora" } as unknown as Quote;

  it("avisa quando a data escrita cai em cima de um evento já marcado", async () => {
    seedComData("20 de setembro de 2026");
    renderCom(pedido);
    expect(await screen.findByText(/Já há um evento nesta data/)).toBeTruthy();
    expect(screen.getByText("Sara e Nuno")).toBeTruthy();
    // E diz que a data é a DESTE documento, não a do pedido.
    expect(screen.getByText(/data que escreveste na proposta/)).toBeTruthy();
  });

  it("cala-se quando não consegue ler a data", async () => {
    // «a definir» é uma resposta legítima deste campo. Um aviso sobre um dia
    // inventado por uma leitura falhada é pior do que aviso nenhum.
    seedComData("a definir");
    renderCom(pedido);
    await waitFor(() => expect(screen.getByLabelText("Data")).toHaveValue("a definir"));
    expect(screen.queryByText(/Já há um evento nesta data/)).toBeNull();
  });

  it("cala-se numa data que não choca com nada", async () => {
    // CONTROLO POSITIVO do teste de cima: o mecanismo está ligado e sabe ler
    // esta data — o que falta é o choque.
    seedComData("12 de setembro de 2026");
    renderCom(pedido);
    await waitFor(() =>
      expect(screen.getByLabelText("Data")).toHaveValue("12 de setembro de 2026"),
    );
    expect(screen.queryByText(/Já há um evento nesta data/)).toBeNull();
  });

  it("não repete o aviso quando a data escrita É a do pedido", async () => {
    // Aí o cartão já está no ecrã, por cima do estúdio (`FazerProposta`). O
    // mesmo cartão duas vezes na mesma página ensina a saltar os dois.
    seedComData("20 de setembro de 2026");
    renderCom({ ...pedido, date: "2026-09-20" } as unknown as Quote);
    await waitFor(() =>
      expect(screen.getByLabelText("Data")).toHaveValue("20 de setembro de 2026"),
    );
    expect(screen.queryByText(/Já há um evento nesta data/)).toBeNull();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ELA ESCREVE NO PRIMEIRO SEGUNDO NÃO É APAGADO PELO RASCUNHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio vai buscar o rascunho ao servidor ao abrir, e o merge chega
 * 100–300 ms depois. Era `{ ...d, ...doServidor }` — campo a campo, o servidor
 * ganhava. Se ela começasse a escrever nessa janela, o PRINCÍPIO do que
 * escreveu era apagado.
 *
 * MEDIDO no produto, oito rondas a escrever `ABCDEFGHIJKLMNOPQRST` meio
 * segundo depois de o ecrã abrir: SETE perderam texto. Ficaram coisas como
 * `HIJKLMNOPQRST`, `MNOPQRST`, `QRST`. Em quatro caixas diferentes — e a
 * «Cerimónia» chegou a ficar COMPLETAMENTE vazia. Sem erro e sem aviso: a
 * frase fica truncada pela frente, e é assim que vai no PDF para o casal.
 */
describe("o rascunho do servidor não escreve por cima de quem está a escrever", () => {
  function rascunhoComTudoPreenchido() {
    rascunhoServidor = {
      updatedAt: new Date().toISOString(),
      doc: {
        template: "decoracao",
        ref: "PO Decoração",
        clientNames: "Maria & Zé",
        eventType: "Casamento",
        eventDate: "12 de setembro de 2026",
        location: "Herdade do Servidor",
        guests: "80 pax",
        serviceGroups: [],
        moodBoards: [],
        budgetItems: [],
        coverImages: ["", ""],
        totalLabel: "Valor Total Decoração",
      },
    };
  }

  /** Segura a leitura do rascunho até o teste a soltar. */
  function segurarORascunho() {
    portaoDoRascunho = new Promise<void>((resolver) => {
      abrirPortaoDoRascunho = resolver;
    });
  }

  it("o que ela escreveu no Local fica — e o resto do rascunho entra à mesma", async () => {
    rascunhoComTudoPreenchido();
    segurarORascunho();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProposalStudio quote={quote} />
      </ToastProvider>,
    );

    const local = await screen.findByLabelText("Local");
    await user.clear(local);
    await user.type(local, "Monte da Oliveirinha");

    // Agora o rascunho chega — a corrida, encenada.
    abrirPortaoDoRascunho?.();

    // Prova que o merge CORREU MESMO: um campo em que ela não tocou passa a
    // ter o valor do servidor. Sem isto, o teste passava por não ter havido
    // corrida nenhuma — que é a forma mais fácil de ele deixar de servir.
    await waitFor(() => expect(screen.getByLabelText("Convidados")).toHaveValue("80 pax"));

    // E o que ela escreveu continua inteiro.
    expect(local).toHaveValue("Monte da Oliveirinha");
  });

  it("num campo em que ela NÃO tocou, o rascunho manda (controlo positivo)", async () => {
    rascunhoComTudoPreenchido();
    segurarORascunho();
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <ProposalStudio quote={quote} />
      </ToastProvider>,
    );

    const local = await screen.findByLabelText("Local");
    await user.clear(local);
    await user.type(local, "Monte da Oliveirinha");
    abrirPortaoDoRascunho?.();

    // O «Tipo de evento» não foi tocado: o rascunho tem de o preencher.
    await waitFor(() => expect(screen.getByLabelText("Tipo de evento")).toHaveValue("Casamento"));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM PEDIDO SÓ PARA LER NÃO É TRABALHO POR GRAVAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O estúdio abre, semeia o que vem do PEDIDO (os pontos de decoração que o
 * casal marcou, o preço final, a regra dos adicionais) — e essa semeadura
 * mexia no documento. O efeito que vigia o documento não distingue quem lhe
 * mexeu: marcava «por gravar», gravava no `localStorage`, e mandava um PUT do
 * rascunho ao servidor.
 *
 * Duas consequências, e a segunda é a que custa:
 *
 *   1. Uma linha de rascunho gravada em cada pedido que ela ABRE para ler.
 *   2. O «Guardar tudo (1)» aceso por nada, várias vezes por hora — e um
 *      alarme que mente é um alarme que se deixa de ver. É esse botão que ela
 *      olha antes de fechar o portátil.
 *
 * A semeadura é DERIVADA do pedido: reabrir produz exactamente o mesmo
 * documento. Não há nada para perder em não a gravar — e quando ela escrever
 * a primeira letra, grava-se tudo, semeadura incluída.
 */
describe("abrir um pedido só para ler não é trabalho por gravar", () => {
  /** O debounce da gravação é de 800 ms. Isto passa-o com folga. */
  const passarODebounce = () => new Promise((r) => setTimeout(r, 1400));

  it("não manda rascunho nenhum ao servidor", async () => {
    renderStudio();
    await screen.findByRole("heading", { name: "Mood boards" });
    await passarODebounce();
    expect(corpos("proposta-rascunho")).toEqual([]);
  });

  it("não deixa cópia local de um documento que ela não escreveu", async () => {
    renderStudio();
    await screen.findByRole("heading", { name: "Mood boards" });
    await passarODebounce();
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull();
  });

  it("e o indicador cala-se — não diz «guardado» ao que não foi feito", async () => {
    renderStudio();
    await screen.findByRole("heading", { name: "Mood boards" });
    await passarODebounce();
    expect(screen.queryByTitle(/a guardar/i)).toBeNull();
    expect(screen.queryByTitle(/guardado às/i)).toBeNull();
  });

  it("um clique que não muda nada continua a não gravar", async () => {
    // O gesto FECHA a janela de abertura, mas não é o gesto que decide: o que
    // decide é o documento ser igual ao que se abriu. Sem isto, tocar no ecrã
    // para ler acendia o alarme na mesma — e era esse o defeito.
    const user = userEvent.setup();
    renderStudio();
    await user.click(await screen.findByRole("heading", { name: "Mood boards" }));
    await passarODebounce();
    expect(corpos("proposta-rascunho")).toEqual([]);
  });

  it("escrita SEM teclas — preenchimento automático — também conta (controlo positivo)", async () => {
    // Nem toda a escrita passa por uma tecla: o preenchimento automático do
    // browser, um gestor de palavras-passe e a ditadura de voz põem o valor e
    // disparam só `input`. Se a abertura só fechasse com `keydown`, esse texto
    // ficava por gravar — e foi assim que o passeio automático das propostas
    // apanhou este buraco.
    renderStudio();
    const local = (await screen.findByLabelText("Local")) as HTMLInputElement;
    fireEvent.input(local, { target: { value: "Herdade do Automático" } });
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    expect(corpos("proposta-rascunho").at(-1)).toContain("Herdade do Automático");
  });

  it("mas com rascunho GUARDADO, abrir continua a gravar (controlo positivo)", async () => {
    // A fronteira. Abrir um pedido virgem é semear o que veio do pedido — e
    // isso re-deriva-se ao reabrir. Abrir um pedido COM rascunho é outra coisa:
    // o restauro CORRIGE o que lá está (tira marcadores de fotos que nunca
    // chegaram a existir, acerta o total pelo «Preço final» do pedido), e uma
    // correcção que não fica gravada é uma correcção que se volta a fazer
    // amanhã. Ver também «um marcador deixado num rascunho antigo» e «o preço
    // do pedido sobrevive ao rascunho do servidor».
    seedDraft(1);
    renderStudio();
    await screen.findByRole("heading", { name: "Mood boards" });
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
  });

  it("à PRIMEIRA letra dela, grava tudo — semeadura incluída (controlo positivo)", async () => {
    // Sem esta, a correcção podia ser «nunca gravar», que é muito pior do que
    // o defeito.
    const user = userEvent.setup();
    renderStudio();
    await user.type(await screen.findByLabelText("Local"), "Évora");
    await waitFor(() => expect(corpos("proposta-rascunho").length).toBeGreaterThan(0), {
      timeout: 3000,
    });
    const gravado = JSON.parse(corpos("proposta-rascunho").at(-1) ?? "{}");
    expect(gravado.doc.location).toBe("Évora");
    // A semeadura vai lá dentro: é o grupo de serviços que o estúdio abre.
    expect(gravado.doc.serviceGroups.length).toBeGreaterThan(0);
    expect(localStorage.getItem(DRAFT_KEY)).toContain("Évora");
  });
});
