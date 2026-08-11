// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, act } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { ATRASO_DA_GRAVACAO } from "./useGravacaoAutomatica";
import { RegistoDeGravacoesProvider } from "./registo-de-gravacoes";
import BotaoGuardarTudo from "./GuardarTudo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DO PEDIDO GRAVA SOZINHO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que acontecia: escreviam-se três mil caracteres nas notas internas, tocava
 * o telefone, fechava-se o separador — e não tinha sido enviado nada. As
 * alterações viviam em estado do React até alguém carregar em «Guardar», o
 * `discardGuard` só corria em gestos DENTRO da aplicação, e um `beforeunload`
 * não havia nenhum.
 *
 * Estes testes prendem as quatro coisas que passam a valer:
 *   · o que se ESCREVE grava-se sozinho, e só o que foi tocado é enviado;
 *   · o que é uma DECISÃO (o estado do pedido) continua a exigir um clique;
 *   · fechar o separador com coisa por gravar avisa;
 *   · uma gravação recusada é DITA — nunca um visto verde a mentir.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    Overview: stub("overview"),
    Kanban: stub("kanban"),
    Clientes: stub("clientes"),
    Calendario: stub("calendario"),
    Propostas: stub("propostas"),
    Tarefas: stub("tarefas"),
    Fornecedores: stub("fornecedores"),
    StatsDashboard: stub("estatisticas"),
    EmailTemplates: stub("modelos-email"),
    Faturas: stub("faturas"),
    Contratos: stub("contratos"),
    Inventario: stub("inventario"),
    ProposalBuilder: stub("proposal-builder"),
    ProposalStudio: stub("proposal-studio"),
    ProductionPlan: stub("production-plan"),
    ClientMessenger: stub("client-messenger"),
    EventChecklist: stub("event-checklist"),
    EventMaterial: stub("event-material"),
    EventTimeline: stub("event-timeline"),
    PaymentsPanel: stub("payments-panel"),
    EventCosts: stub("event-costs"),
    GuestList: stub("guest-list"),
    TagsField: stub("tags-field"),
    FollowUpField: stub("follow-up-field"),
    ActivityLog: stub("activity-log"),
    EventTasks: stub("event-tasks"),
  };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

const PRICE = {
  basePrice: 5000,
  guestCost: 3000,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: 8000,
  iva: 1840,
  total: 9840,
  rangeMin: 8000,
  rangeMax: 12000,
  isEstimate: true,
};

function makeQuote(over: Partial<Quote> = {}): Quote {
  return {
    id: "LQ-001",
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: "Ana Marques",
    email: "ana@example.com",
    phone: "910000000",
    company: "",
    nif: "",
    category: "particulares",
    eventType: "casamentos",
    eventName: "Evento",
    date: "2026-09-20",
    endDate: "",
    location: "Évora",
    locationType: "pequena_cidade",
    guests: 80,
    duration: 8,
    isMultiDay: false,
    packageTier: "completo",
    addons: [],
    budgetRange: "15k_30k",
    urgency: "standard",
    notes: "",
    referralSource: "",
    acceptTerms: true,
    acceptMarketing: false,
    adminNotes: "",
    priceBreakdown: PRICE,
    ...over,
  } as Quote;
}

const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

/** Os PATCH que chegaram ao "servidor", pela ordem em que chegaram. */
let gravacoes: { id: string; corpo: Record<string, unknown> }[] = [];
/** O que o PATCH seguinte responde. `null` = responde bem. */
let recusarCom: number | null = null;

function montar(quote: Quote, comRegisto = false) {
  const servidor = new Map<string, Quote>([[quote.id, quote]]);
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string, init?: RequestInit) => {
      const m = /^\/api\/orcamento\/([^?]+)$/.exec(String(url));
      const id = m ? decodeURIComponent(m[1]) : null;
      const pedido = id ? servidor.get(id) : undefined;

      if (init?.method === "PATCH" && pedido) {
        const corpo = JSON.parse(String(init.body)) as Record<string, unknown>;
        gravacoes.push({ id: pedido.id, corpo });
        if (recusarCom) {
          return Promise.resolve({
            ok: false,
            status: recusarCom,
            headers: cabecalhos({}),
            json: () => Promise.resolve({ error: "não deu" }),
          });
        }
        const { activityLogAppend, ...campos } = corpo;
        void activityLogAppend;
        const actualizado = { ...pedido, ...campos } as Quote;
        servidor.set(pedido.id, actualizado);
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({}),
          json: () => Promise.resolve(actualizado),
        });
      }

      if (pedido) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(pedido),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: cabecalhos({}),
        json: () => Promise.resolve([]),
      });
    }),
  );

  const painel = <AdminClient initialQuotes={[quote]} userName="Teste" />;
  return render(
    <ToastProvider>
      {comRegisto ? (
        // Exactamente como a página o monta: o registo POR FORA do painel. O
        // botão «Guardar tudo» já vive no cabeçalho, lá dentro — sem registo
        // não se desenha, e é por isso que os outros testes deste ficheiro
        // continuam a ver o cabeçalho tal e qual como o viam.
        <RegistoDeGravacoesProvider>{painel}</RegistoDeGravacoesProvider>
      ) : (
        painel
      )}
    </ToastProvider>,
  );
}

/** Abre o painel de detalhe do pedido — é onde tudo isto acontece. */
async function abrirPedido(nome = "Ana Marques") {
  const sidebar = screen.getByRole("complementary");
  fireEvent.click(within(sidebar).getByRole("button", { name: /Pedidos/ }));
  await act(async () => {
    fireEvent.click(screen.getByText(nome));
  });
}

/** Deixa correr o relógio e as promessas que ele destranca. */
async function passar(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

const notas = () => screen.getByLabelText("Notas internas");

beforeEach(() => {
  gravacoes = [];
  recusarCom = null;
  localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Painel do pedido — o que se escreve grava-se sozinho", () => {
  it("escrever nas notas internas grava sem ninguém carregar em Guardar", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "Ligou a pedir mais mesas." } });
    expect(gravacoes).toHaveLength(0);

    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.adminNotes).toBe("Ligou a pedir mais mesas.");
  });

  /**
   * Duas pessoas no mesmo pedido escrevem por cima uma da outra porque o PATCH
   * aceita valores inteiros vindos do cliente. Gravar sozinho torna isso mais
   * frequente — por isso o que ninguém tocou não vai no pedido.
   */
  it("só vai o que foi tocado — o resto do pedido não segue na gravação", async () => {
    montar(makeQuote({ quotedPrice: 12500, assignedTo: "Catarina" }));
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "uma linha" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    const corpo = gravacoes[0].corpo;
    expect(Object.keys(corpo).filter((k) => k !== "activityLogAppend")).toEqual(["adminNotes"]);
    expect(corpo).not.toHaveProperty("status");
    expect(corpo).not.toHaveProperty("quotedPrice");
    expect(corpo).not.toHaveProperty("assignedTo");
    expect(corpo).not.toHaveProperty("guests");
  });

  it("escrever seguido não paga um pedido por tecla", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "u" } });
    fireEvent.change(notas(), { target: { value: "um" } });
    fireEvent.change(notas(), { target: { value: "uma" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.adminNotes).toBe("uma");
  });

  /**
   * O gesto que perdia trabalho: escrever a última linha e fechar o painel (ou
   * trocar de cliente) dentro dos 800 ms. O temporizador era cancelado com o
   * painel, e a linha nunca chegava a sair do ecrã.
   */
  it("fechar o painel dentro do adiamento grava o que ficou por gravar", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "a última linha" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.adminNotes).toBe("a última linha");
  });

  /**
   * Mudar o ESTADO de um pedido é uma decisão — muda a coluna do quadro, o que
   * conta como ganho, e o que a automação pode ou não fazer a seguir. Continua
   * a exigir um clique, e este teste é o que impede que isso mude por distração.
   */
  it("mudar o estado NÃO grava sozinho — é uma decisão, não um rascunho", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(screen.getByLabelText("Estado do pedido"), {
      target: { value: "cotado" },
    });
    await passar(ATRASO_DA_GRAVACAO * 4);
    expect(gravacoes).toHaveLength(0);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar alterações/ }));
    });
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.status).toBe("cotado");
  });
});

describe("Painel do pedido — o ecrã diz a verdade", () => {
  it("depois de gravar, o indicador diz a hora e o botão mostra que está guardado", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "escrito" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(screen.getByText(/guardado às \d{2}:\d{2}/)).toBeInTheDocument();
    // O botão não desaparece — e diz a verdade: já está guardado.
    const botao = screen.getByRole("button", { name: /Guardad/ });
    expect(botao).toBeDisabled();
  });

  it("uma gravação recusada é dita, e não fica um visto verde a mentir", async () => {
    montar(makeQuote());
    await abrirPedido();
    recusarCom = 500;

    fireEvent.change(notas(), { target: { value: "isto não vai chegar" } });
    // O adiamento, mais as duas pausas entre as três tentativas.
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 100);

    expect(gravacoes.length).toBeGreaterThan(1);
    expect(screen.getByText(/não chegou ao servidor/)).toBeInTheDocument();
    expect(screen.queryByText(/guardado às/)).not.toBeInTheDocument();
    // E o botão volta a estar disponível: é por onde ela tenta outra vez.
    expect(screen.getByRole("button", { name: /Tentar de novo|Guardar/ })).toBeEnabled();
  });

  it("uma gravação recusada não deita fora o que ela escreveu", async () => {
    montar(makeQuote());
    await abrirPedido();
    recusarCom = 503;

    fireEvent.change(notas(), { target: { value: "texto que tem de ficar no ecrã" } });
    await passar(ATRASO_DA_GRAVACAO + 400 + 800 + 100);

    expect(notas()).toHaveValue("texto que tem de ficar no ecrã");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAINEL DO PEDIDO NO GESTO ÚNICO DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O botão «Guardar tudo» do cabeçalho só pode falar por quem está inscrito no
 * registo. Estes testes prendem a inscrição deste painel — pelo NOME do pedido,
 * e com as duas metades dentro: o que grava sozinho e o que ainda espera por um
 * clique. Sem a segunda, o gesto único passava ao lado de trabalho feito.
 */
describe("Painel do pedido — inscrito no «Guardar tudo»", () => {
  const guardarTudo = () => screen.getByRole("button", { name: /guardar tudo|tudo guardado/i });

  it("com notas por gravar, o botão do cabeçalho conta-o e nomeia o pedido", async () => {
    montar(makeQuote(), true);
    await abrirPedido();

    await act(async () => {
      fireEvent.change(notas(), { target: { value: "três mil caracteres" } });
    });

    const botao = guardarTudo();
    expect(botao).toHaveAccessibleName(/guardar tudo \(1\)/i);
    expect(botao.getAttribute("title") ?? "").toContain("LQ-001");
  });

  /**
   * O estado do pedido é uma DECISÃO e continua a exigir um clique — mas é
   * trabalho feito à espera de um gesto, e o gesto único do back office tem de
   * o levar também. Era esta metade que ficava de fora.
   */
  it("uma alteração que exige clique é gravada pelo mesmo gesto", async () => {
    montar(makeQuote(), true);
    await abrirPedido();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Estado do pedido"), { target: { value: "cotado" } });
    });
    expect(guardarTudo()).toHaveAccessibleName(/guardar tudo \(1\)/i);

    await act(async () => {
      fireEvent.click(guardarTudo());
    });
    expect(gravacoes).toHaveLength(1);
    expect(gravacoes[0].corpo.status).toBe("cotado");
    // E a resposta é a do gesto único, com o nome do pedido lá dentro.
    expect(screen.getByText(/está tudo guardado no servidor/i)).toBeInTheDocument();
    expect(screen.getByText(/^Pedido LQ-001/)).toBeInTheDocument();
  });

  it("sem nada por gravar, o cabeçalho está calmo", async () => {
    montar(makeQuote(), true);
    await abrirPedido();
    expect(guardarTudo()).toHaveAccessibleName(/tudo guardado/i);
  });
});

describe("Painel do pedido — fechar o separador", () => {
  function fecharSeparador() {
    const evento = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(evento);
    return evento.defaultPrevented;
  }

  it("com notas por gravar, fechar o separador avisa", async () => {
    montar(makeQuote());
    await abrirPedido();

    await act(async () => {
      fireEvent.change(notas(), { target: { value: "três mil caracteres" } });
    });
    expect(fecharSeparador()).toBe(true);
  });

  it("com uma alteração que ainda exige clique, fechar o separador também avisa", async () => {
    montar(makeQuote());
    await abrirPedido();

    await act(async () => {
      fireEvent.change(screen.getByLabelText("Estado do pedido"), { target: { value: "cotado" } });
    });
    expect(fecharSeparador()).toBe(true);
  });

  it("com tudo guardado, fechar o separador não pergunta nada", async () => {
    montar(makeQuote());
    await abrirPedido();

    fireEvent.change(notas(), { target: { value: "escrito e guardado" } });
    await passar(ATRASO_DA_GRAVACAO + 50);

    expect(fecharSeparador()).toBe(false);
  });
});
