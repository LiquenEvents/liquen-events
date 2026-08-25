// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import type { MoodBoard, ProposalDoc, ServiceGroup } from "@/lib/proposal-doc";
import type { EstadoSeccao, Impedimento } from "@/lib/proposal-progress";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import EmailTemplates from "./EmailTemplates";
import EmailTemplatesBilingue from "./EmailTemplatesBilingue";
import NavEstudio from "./NavEstudio";
import ServicesEditor from "./ServicesEditor";
import StatsDashboard from "./StatsDashboard";
import VistaDeConjunto from "./VistaDeConjunto";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TIRAR OS CORTES QUE ESTA CASA NÃO USA — E DIZER O QUE MUDA EM CADA FAIXA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O back office tem três larguras e só três (`ui/adaptativo.ts`): `sm` (640),
 * `lg` (1024) e `wide` (1440). `md:` (768), `xl:` (1280) e `2xl:` (1536) não se
 * usam, e a razão está lá escrita: dois sistemas de cortes a competir é como um
 * ecrã acaba com uma tabela a três colunas a 800 px e a duas a 900 px sem
 * ninguém perceber porquê.
 *
 * Só que tirar um corte NÃO é arrumação: `md:hidden` → `lg:hidden` quer dizer
 * que entre 768 e 1024 px passa a ver-se outra coisa. É essa faixa que estes
 * testes prendem — cada um afirma o que aparece nas DUAS pontas dela.
 *
 * ── PORQUE É QUE O TESTE RESOLVE AS CLASSES À MÃO ───────────────────────────
 *
 * O jsdom não faz disposição e não avalia `@media`: renderizar a 768 e a 1024
 * dá exactamente o mesmo DOM, com a mesma `className`. Um teste que se ficasse
 * pelo `toContain("lg:grid-cols-4")` afirmava a ORTOGRAFIA da classe e não a
 * decisão — e passava na mesma se alguém acrescentasse um `md:grid-cols-2` ao
 * lado, que é precisamente o defeito a apanhar.
 *
 * Por isso o `efectivas()` abaixo faz o que o navegador faria: separa cada
 * classe nas suas variantes, decide quais estão ligadas àquela largura (àquele
 * contentor, àquele ponteiro) e devolve os utilitários que sobram. Uma variante
 * que ele não conheça REBENTA em vez de ser ignorada em silêncio — se alguém
 * escrever `md:` num destes ecrãs, o teste diz o nome dela.
 *
 * A geometria a sério mede-se no navegador; o que aqui se prende é a decisão.
 * É a mesma escolha do `Overview.movel.test.tsx` e do `adaptativo.test.tsx`.
 */

/** As larguras que interessam a este trabalho, em píxeis. */
const IPAD_AO_ALTO = 768;
const PORTATIL = 1024;
const ANTES_DO_PORTATIL = 1023;

type Contexto = {
  /** A largura da JANELA — é o que `sm:` e `lg:` medem. */
  largura: number;
  /** A largura do CONTENTOR — é o que `@[…]:` mede. */
  contentor?: number;
  /** `(pointer: coarse)`: o apontador principal é um dedo. */
  toque?: boolean;
};

/** Só estes três. É o contrato, e o resolvedor não conhece mais nenhum. */
const CORTES_DA_CASA: Record<string, number> = { sm: 640, lg: 1024 };

/**
 * Separa `lg:hover:bg-x` em `["lg", "hover", "bg-x"]` — sem partir os dois
 * pontos que vivem DENTRO de um valor arbitrário, como em
 * `[&::-webkit-details-marker]:hidden`.
 */
function separar(classe: string): string[] {
  const partes: string[] = [];
  let actual = "";
  let dentro = 0;
  for (const c of classe) {
    if (c === "[" || c === "(") dentro++;
    else if (c === "]" || c === ")") dentro--;
    if (c === ":" && dentro === 0) {
      partes.push(actual);
      actual = "";
      continue;
    }
    actual += c;
  }
  partes.push(actual);
  return partes;
}

/** Esta variante está ligada neste contexto? */
function ligada(variante: string, ctx: Contexto): boolean {
  if (variante in CORTES_DA_CASA) return ctx.largura >= CORTES_DA_CASA[variante];

  const ate = /^max-([a-z0-9]+)$/.exec(variante);
  if (ate && ate[1] in CORTES_DA_CASA) return ctx.largura < CORTES_DA_CASA[ate[1]];

  const emPixeis = (valor: string, unidade: string) => Number(valor) * (unidade === "rem" ? 16 : 1);

  const daJanela = /^min-\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(variante);
  if (daJanela) return ctx.largura >= emPixeis(daJanela[1], daJanela[2]);

  const doContentor = /^@\[(\d+(?:\.\d+)?)(px|rem)\]$/.exec(variante);
  if (doContentor) {
    if (ctx.contentor === undefined) {
      throw new Error(`\`${variante}\` mede o contentor e o teste não disse qual é`);
    }
    return ctx.contentor >= emPixeis(doContentor[1], doContentor[2]);
  }

  if (variante === "pointer-coarse") return ctx.toque === true;
  if (variante === "hover") return ctx.toque !== true;

  // Variantes que não são perguntas sobre LARGURA — um selector (`[&::…]`), um
  // estado (`focus-within`), um grupo. Não decidem nada aqui e ficam ligadas.
  if (/^\[.*\]$/.test(variante)) return true;
  if (
    /^(group|peer)(-|$)|^(focus|active|disabled|checked|first|last|odd|even|open|visited|target|empty|marker|placeholder|selection|file|before|after|dark|print|rtl|ltr|motion-safe|motion-reduce|forced-colors|contrast-more|aria-|data-|has-|not-|in-|supports-|\*)/.test(
      variante,
    )
  ) {
    return true;
  }

  throw new Error(
    `variante \`${variante}:\` desconhecida — se é um ponto de corte, este back office só usa \`sm:\`, \`lg:\` e o \`@[…]:\` do contentor`,
  );
}

/** Os utilitários que estão MESMO a valer nesta largura. */
function efectivas(className: string, ctx: Contexto): Set<string> {
  const fora = new Set<string>();
  for (const classe of className.split(/\s+/).filter(Boolean)) {
    const partes = separar(classe);
    const utilitario = partes.pop()!;
    if (partes.every((v) => ligada(v, ctx))) fora.add(utilitario);
  }
  return fora;
}

/**
 * Este elemento ocupa espaço nesta largura?
 *
 * `hidden` é `display:none`; qualquer `display` vindo de uma variante ganha-lhe,
 * porque o Tailwind emite as variantes DEPOIS da base e a especificidade é a
 * mesma. É o par `hidden … lg:block` de sempre.
 */
function aparece(className: string, ctx: Contexto): boolean {
  const ef = efectivas(className, ctx);
  if (!ef.has("hidden")) return true;
  return ["block", "flex", "grid", "inline-flex", "inline-block"].some((d) => ef.has(d));
}

/** As colunas da grelha, nesta largura. `undefined` = a grelha não as declara. */
const colunas = (className: string, ctx: Contexto): string | undefined =>
  [...efectivas(className, ctx)].filter((c) => c.startsWith("grid-cols-")).pop();

/** Sobe até à grelha que contém este elemento. */
const grelhaDe = (el: Element): HTMLElement => el.closest<HTMLElement>('[class*="grid-cols-"]')!;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o resolvedor de classes (senão isto passava por vacuidade)", () => {
  it("liga e desliga as variantes que a casa usa", () => {
    expect([...efectivas("grid-cols-2 lg:grid-cols-4", { largura: 1023 })]).toEqual([
      "grid-cols-2",
    ]);
    expect([...efectivas("grid-cols-2 lg:grid-cols-4", { largura: 1024 })]).toEqual([
      "grid-cols-2",
      "grid-cols-4",
    ]);
    expect(aparece("hidden lg:block", { largura: 1023 })).toBe(false);
    expect(aparece("hidden lg:block", { largura: 1024 })).toBe(true);
    expect(aparece("pointer-coarse:hidden", { largura: 375, toque: false })).toBe(true);
    expect(aparece("pointer-coarse:hidden", { largura: 1440, toque: true })).toBe(false);
    // Um valor arbitrário com dois pontos lá dentro não se parte ao meio.
    expect([...efectivas("[&::-webkit-details-marker]:hidden", { largura: 375 })]).toEqual([
      "hidden",
    ]);
  });

  it("não conhece os cortes que esta casa não usa — rebenta com o nome deles", () => {
    // É esta a rede: um `md:` que voltasse a entrar não passaria por aqui calado.
    expect(() => efectivas("md:grid-cols-4", { largura: 800 })).toThrow(/md:/);
    expect(() => efectivas("xl:block", { largura: 1300 })).toThrow(/xl:/);
    expect(() => efectivas("2xl:hidden", { largura: 1600 })).toThrow(/2xl:/);
  });
});

/**
 * ── OS OITO NÚMEROS DO PAINEL ───────────────────────────────────────────────
 *
 * ANTES: a fila de cima quebrava aos 1024 (`lg:`) e a de baixo aos 768 (`md:`).
 * Entre essas duas larguras — o iPad ao alto — liam-se dois quadrados em cima e
 * quatro em baixo, com o mesmo desenho: uma escada sem razão.
 *
 * DEPOIS: as duas leem o mesmo `@container`, portanto quebram no mesmo sítio, e
 * o sítio é a largura da COLUNA DE CONTEÚDO — que é a que conta, porque é a
 * barra lateral que a encolhe a partir de 1024 sem a janela encolher.
 */
describe("painel de números: as duas filas quebram no mesmo sítio", () => {
  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      })),
    );
  });

  /** Sem pedido nenhum o painel desenha o estado vazio e não há números. */
  const PEDIDO = {
    id: "q1",
    submittedAt: "2026-07-01T10:00:00.000Z",
    status: "aceite",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    quotedPrice: 202889,
  } as unknown as Quote;

  const filas = () => [
    grelhaDe(screen.getByText("Pedidos totais")),
    grelhaDe(screen.getByText("Este mês")),
  ];

  it("nunca discordam uma da outra, em contentor nenhum", () => {
    render(<StatsDashboard quotes={[PEDIDO]} />);
    const [cima, baixo] = filas().map((el) => el.className);
    for (const contentor of [320, 375, 639, 640, 720, 900, 1200]) {
      const ctx = { largura: 1440, contentor };
      expect(
        colunas(baixo, ctx),
        `a ${contentor} px de contentor as duas filas de números davam colunas diferentes`,
      ).toBe(colunas(cima, ctx));
    }
  });

  it("duas colunas onde o número não caberia, quatro a partir de 40rem", () => {
    render(<StatsDashboard quotes={[PEDIDO]} />);
    for (const fila of filas().map((el) => el.className)) {
      // 632 px é o que quatro quadrados com «202 889 €» pedem — a conta está
      // no comentário do `StatsDashboard`. Abaixo disso, duas colunas.
      expect(colunas(fila, { largura: 1440, contentor: 639 })).toBe("grid-cols-2");
      expect(colunas(fila, { largura: 1440, contentor: 640 })).toBe("grid-cols-4");
    }
  });

  it("a decisão deixou de ser da JANELA — um ecrã largo com coluna estreita empilha", () => {
    // O caso que o `@container` existe para acertar e que o `md:`/`lg:` erravam
    // dos dois lados: janela de 1440 com a barra lateral aberta e a coluna de
    // conteúdo estreita continua a ler dois números por linha.
    render(<StatsDashboard quotes={[PEDIDO]} />);
    for (const fila of filas().map((el) => el.className)) {
      expect(colunas(fila, { largura: 1440, contentor: 500 })).toBe("grid-cols-2");
    }
  });
});

/**
 * ── OS ATALHOS DE TECLADO ───────────────────────────────────────────────────
 *
 * ANTES: `max-md:hidden` — escondidos abaixo de 768 px.
 * DEPOIS: `pointer-coarse:hidden` — escondidos a quem escreve com o dedo.
 *
 * A faixa que muda é dos dois lados, e é o ponto: um iPad ao alto (768 px, sem
 * teclado) deixa de ler «Ctrl+Z anula», e uma janela estreita num computador
 * com teclado passa a ler.
 */
describe("atalhos de teclado: a pergunta é o ponteiro, não a largura", () => {
  const atalhos = () => screen.getByText(/Atalhos de teclado/i).closest("details")!;
  const grupos: ServiceGroup[] = [
    { id: "g1", letter: "a)", title: "Decoração Floral", items: [{ label: "Cerimónia" }] },
  ];

  const desenhar = () =>
    render(
      <ToastProvider>
        <ServicesEditor groups={grupos} onGroupsChange={() => {}} />
      </ToastProvider>,
    );

  it("num iPad ao alto (768 px, dedo) deixam de gastar altura a explicar teclas que não há", () => {
    desenhar();
    expect(aparece(atalhos().className, { largura: IPAD_AO_ALTO, toque: true })).toBe(false);
  });

  it("num ecrã ESTREITO com teclado passam a estar lá — e antes não estavam", () => {
    // É o que o corte por largura não sabia responder: uma janela de 700 px num
    // computador tem Ctrl+Z, e a linha valia-lhe tanto como no ecrã inteiro.
    desenhar();
    expect(aparece(atalhos().className, { largura: 700, toque: false })).toBe(true);
  });

  it("num ecrã LARGO de toque deixam de estar — e antes estavam", () => {
    desenhar();
    expect(aparece(atalhos().className, { largura: 1440, toque: true })).toBe(false);
  });
});

/**
 * ── OS DOIS EDITORES DE EMAIL ───────────────────────────────────────────────
 *
 * ANTES: `xl:grid-cols-2` — o par «editor | pré-visualização» só abria aos
 * 1280. Entre 1024 e 1280 (o portátil dela) havia largura para os dois e
 * escrevia-se em cima, rolando para baixo a cada alteração para ver o resultado.
 * DEPOIS: `lg:`, o corte que a casa usa para «cabem duas colunas».
 */
describe("editores de email: a pré-visualização ao lado a partir de 1024", () => {
  const MODELOS = [
    {
      key: "proposta-enviada",
      name: "Proposta enviada",
      subject: "A sua proposta",
      body: "<div>Olá {nome}</div>",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ];
  const BILINGUES = [
    {
      chave: "registo-formal",
      nome: "Registo formal",
      descricao: "O texto que já usas.",
      pt: { subject: "Proposta", body: "<p>Olá</p>", updatedAt: "" },
      en: { subject: "", body: "", updatedAt: "" },
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: RequestInfo | URL) => {
        const u = String(url);
        const corpo = u.startsWith("/api/email-templates/bilingues")
          ? BILINGUES
          : u.startsWith("/api/email-templates/versoes")
            ? []
            : u.startsWith("/api/email-templates/dados")
              ? { pedidos: [] }
              : MODELOS;
        return { ok: true, status: 200, json: async () => corpo } as unknown as Response;
      }),
    );
  });

  /** A grelha que separa o editor da pré-visualização. */
  const parDeColunas = async (rotulo: RegExp) =>
    grelhaDe(await screen.findByLabelText(rotulo)).className;

  it("clássico: uma coluna a 1023, duas a 1024", async () => {
    render(
      <ToastProvider>
        <EmailTemplates />
      </ToastProvider>,
    );
    const par = await waitFor(async () => {
      const el = grelhaDe(await screen.findByText("Pré-visualização"));
      return el.className;
    });
    expect(colunas(par, { largura: ANTES_DO_PORTATIL })).toBe("grid-cols-1");
    expect(colunas(par, { largura: PORTATIL })).toBe("grid-cols-2");
  });

  it("bilingue: uma coluna a 1023, duas a 1024", async () => {
    render(
      <ToastProvider>
        <EmailTemplatesBilingue />
      </ToastProvider>,
    );
    const par = await parDeColunas(/assunto/i);
    expect(colunas(par, { largura: ANTES_DO_PORTATIL })).toBe("grid-cols-1");
    expect(colunas(par, { largura: PORTATIL })).toBe("grid-cols-2");
  });
});

/**
 * ── A VISTA DE CONJUNTO ─────────────────────────────────────────────────────
 *
 * ANTES: 2 · 3 · 4 miniaturas, com o último degrau em `xl:` (1280).
 * DEPOIS: o mesmo desenho com o degrau no `lg`. Entre 1024 e 1280 um documento
 * de treze folhas passa de cinco linhas de três para quatro linhas de quatro.
 */
describe("vista de conjunto: quatro miniaturas por linha já no portátil", () => {
  const board = (over: Partial<MoodBoard> = {}): MoodBoard => ({
    title: "Cerimónia",
    images: ["a.jpg"],
    ...over,
  });
  const doc = {
    template: "decoracao",
    ref: "PO",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Monte da Oliveirinha",
    guests: "150 pax",
    serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
    moodBoards: [board(), board({ title: "Jantar" })],
    budgetItems: ["Decor"],
    totalLabel: "Total",
    totalText: "3.000,00 €",
    coverImages: [],
    notasImportantes: [],
    incluido: [],
    naoIncluido: [],
    condicoesGerais: [],
    observacoesGerais: [],
    faseamento: [],
    cancelamento: [],
    cronograma: [],
  } as unknown as ProposalDoc;

  it("três por linha a 1023, quatro a 1024", () => {
    const { container } = render(
      <VistaDeConjunto
        doc={doc}
        ordem={[0, 1]}
        urls={{ "a.jpg": "/a.jpg" }}
        aspetos={{ "a.jpg": 1.5 }}
        onMover={vi.fn()}
        onSaltar={vi.fn()}
        onIrParaSeccao={vi.fn()}
        onFechar={vi.fn()}
      />,
    );
    const lista = container.querySelector("ul")!.className;
    expect(colunas(lista, { largura: 375 })).toBe("grid-cols-2");
    expect(colunas(lista, { largura: 640 })).toBe("grid-cols-3");
    expect(colunas(lista, { largura: ANTES_DO_PORTATIL })).toBe("grid-cols-3");
    expect(colunas(lista, { largura: PORTATIL })).toBe("grid-cols-4");
  });
});

/**
 * ── O ÍNDICE DO ESTÚDIO ─────────────────────────────────────────────────────
 *
 * ANTES: `xl:block` — abaixo de 1280 não existia. E o que não existia não era
 * só o índice: era também a lista do que FALTA para poder enviar, que vive no
 * fim da mesma coluna. Num portátil de 1024–1440 escrevia-se a proposta inteira
 * sem saber em que secção se está nem o que a trava.
 * DEPOIS: `lg:block`. Abaixo de 1024 continua a não existir — a versão de ecrã
 * estreito é uma decisão por tomar, não um esquecimento.
 */
describe("índice do estúdio: volta ao portátil", () => {
  const seccoes: EstadoSeccao[] = [
    { id: "evento", titulo: "Evento", preenchida: true, resumo: "Ana e Rui" },
    { id: "servicos", titulo: "Serviços", preenchida: false, resumo: "0 grupos" },
  ];
  const faltas: Impedimento[] = [
    { id: "servicos", texto: "Nenhum grupo de serviços", trava: true } as Impedimento,
  ];

  it("a 1024 há índice e há a lista do que falta; a 1023 não há nem um nem outro", () => {
    const { container } = render(<NavEstudio seccoes={seccoes} faltas={faltas} />);
    const coluna = container.querySelector("nav")!;
    expect(aparece(coluna.className, { largura: ANTES_DO_PORTATIL })).toBe(false);
    expect(aparece(coluna.className, { largura: PORTATIL })).toBe(true);
    // O que se ganha na faixa não é só o índice — é o aviso do que trava o envio.
    expect(coluna.textContent).toContain("Nenhum grupo de serviços");
    expect(coluna.textContent).toContain("Serviços");
  });
});

/**
 * ── O CALENDÁRIO ────────────────────────────────────────────────────────────
 *
 * ANTES: `xl:grid-cols-[1fr_320px]` — entre 1024 e 1280 a lista do dia caía
 * para DEBAIXO da grelha do mês. Clicar num dia mandava-a rolar para fora do
 * calendário para ler o que lá estava, e subir outra vez para escolher outro.
 * DEPOIS: `lg:`, e o intervalo passa a `gap-4` empilhado / `gap-6` ao lado —
 * 24 px entre duas caixas uma em cima da outra é altura pura.
 */
describe("calendário: a lista do dia ao lado do mês já no portátil", () => {
  beforeEach(() => {
    __resetListCache();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        headers: new Headers(),
        json: async () => [],
      })),
    );
    vi.useFakeTimers({ shouldAdvanceTime: true });
    process.env.TZ = "Europe/Lisbon";
    vi.setSystemTime(new Date("2026-08-13T12:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    delete process.env.TZ;
  });

  it("empilha a 1023 com o intervalo curto, e fica ao lado a 1024 com o intervalo largo", async () => {
    render(
      <ToastProvider>
        <Calendario quotes={[]} onOpen={() => {}} />
      </ToastProvider>,
    );
    const titulo = await waitFor(() => screen.getByRole("heading", { name: "Agosto 2026" }));
    const par = grelhaDe(titulo).className;

    expect(colunas(par, { largura: ANTES_DO_PORTATIL })).toBe("grid-cols-1");
    expect(colunas(par, { largura: PORTATIL })).toBe("grid-cols-[1fr_320px]");

    const empilhado = efectivas(par, { largura: ANTES_DO_PORTATIL });
    const aoLado = efectivas(par, { largura: PORTATIL });
    expect(empilhado.has("gap-4") && !empilhado.has("gap-6")).toBe(true);
    expect(aoLado.has("gap-6")).toBe(true);
  });
});
