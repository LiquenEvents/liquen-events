// @vitest-environment jsdom
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * Behavioural safety net for the back-office shell.
 *
 * AdminClient is a large stateful container that the owner uses daily. Before we
 * carve its state logic into hooks, these tests pin the behaviours a refactor
 * could silently break: it renders, view navigation switches the surface,
 * opening a quote reveals its detail, and bulk selection is tracked. The heavy
 * code-split views (./lazy) are stubbed so the test exercises the shell — the
 * exact part that stays in AdminClient after the hooks move out — not their
 * innards, which have their own coverage.
 */

// Each code-split view/panel becomes a tiny marker so we can assert which
// surface is mounted without pulling in charts, next/image, or data panels.
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

// next/image renders a plain <img> in jsdom; strip framework-only props.
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

let seq = 0;
function makeQuote(over: Partial<Quote> = {}): Quote {
  seq += 1;
  return {
    id: `LQ-${String(seq).padStart(3, "0")}`,
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: `Cliente ${seq}`,
    email: `cliente${seq}@example.com`,
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
    priceBreakdown: PRICE,
    ...over,
  } as Quote;
}

function renderAdmin(quotes: Quote[]) {
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={quotes} userName="Teste" />
    </ToastProvider>,
  );
}

// The desktop sidebar (an <aside>, role "complementary") and the mobile bottom
// bar both carry nav buttons; jsdom applies no CSS so neither is hidden. Scope
// nav clicks to the sidebar to keep the button label unambiguous. Secondary
// destinations now live behind a collapsed "Mais" group, so expand it first
// when the wanted entry isn't in the always-visible core list.
function navTo(label: RegExp) {
  const sidebar = screen.getByRole("complementary");
  let btn = within(sidebar).queryByRole("button", { name: label });
  if (!btn) {
    fireEvent.click(within(sidebar).getByRole("button", { name: /^Mais$/ }));
    btn = within(sidebar).getByRole("button", { name: label });
  }
  fireEvent.click(btn);
}

beforeEach(() => {
  seq = 0;
  localStorage.clear();
  // Nothing in the shell fetches on mount (NotificationBell self-guards on the
  // missing serviceWorker), but stub fetch so a stray call can never hit the network.
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve([]) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AdminClient shell", () => {
  it("renders the back-office chrome on the default overview view", () => {
    renderAdmin([makeQuote()]);

    // Top-bar title + subtitle for the default view.
    expect(screen.getByRole("heading", { name: "Visão Geral" })).toBeInTheDocument();
    // The signed-in user's name from props.
    expect(screen.getByText("Teste")).toBeInTheDocument();
    // The overview surface (code-split, here stubbed) is mounted by default.
    expect(screen.getByTestId("view-overview")).toBeInTheDocument();
  });

  it("switches the active surface when a sidebar nav item is chosen", () => {
    renderAdmin([makeQuote({ name: "Ana Marques" }), makeQuote({ name: "Bruno Dias" })]);

    // The desktop sidebar exposes one button per nav entry (unique label text).
    navTo(/Pedidos/);

    // Header reflects the new view…
    expect(screen.getByRole("heading", { name: "Pedidos" })).toBeInTheDocument();
    // …and the inline "pedidos" list (not code-split) shows the seeded quotes.
    expect(screen.getByText("Ana Marques")).toBeInTheDocument();
    expect(screen.getByText("Bruno Dias")).toBeInTheDocument();
    // The overview stub is gone.
    expect(screen.queryByTestId("view-overview")).not.toBeInTheDocument();
  });

  it("persists the chosen view to localStorage", () => {
    renderAdmin([makeQuote()]);
    navTo(/Organização de propostas/);
    expect(localStorage.getItem("liquen-admin-view")).toBe("kanban");
    // And the kanban surface is now mounted.
    expect(screen.getByTestId("view-kanban")).toBeInTheDocument();
  });

  it("opens a quote's detail panel and closes it", () => {
    const quote = makeQuote({ id: "LQ-042", name: "Carla Nunes" });
    renderAdmin([quote]);

    navTo(/Pedidos/);
    // Before opening, the id shows once (the list row, as a shortened "Ref.");
    // no detail drawer yet.
    expect(screen.getAllByText(/LQ-042/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();

    // The list row is a button labelled by the client's name.
    fireEvent.click(screen.getByText("Carla Nunes"));

    // The detail drawer is now open: its close control exists and the id is
    // echoed a second time inside the panel header.
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(screen.getAllByText(/LQ-042/)).toHaveLength(2);

    // Closing the drawer tears it down again.
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
    expect(screen.getAllByText(/LQ-042/)).toHaveLength(1);
  });

  /**
   * O botão "Atualizar" era o programa a perguntar a quem o usa se os dados
   * estariam velhos. Foi-se, e no lugar dele a lista revalida-se sozinha ao
   * voltar ao separador. Estes dois testes existem para o botão não voltar por
   * distração e para a revalidação não morrer em silêncio.
   */
  it("já não há botão de atualizar — a lista trata disso sozinha", () => {
    renderAdmin([makeQuote()]);
    expect(screen.queryByRole("button", { name: /Atualizar/i })).not.toBeInTheDocument();
  });

  it("volta a ler os pedidos ao regressar ao separador", async () => {
    const novo = makeQuote({ name: "Filipa Nova" });
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        status: 200,
        ok: true,
        headers: { get: () => 'W/"2"' },
        json: () => Promise.resolve([novo]),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderAdmin([makeQuote({ name: "Gabriel Antigo" })]);
    navTo(/Pedidos/);
    expect(screen.getByText("Gabriel Antigo")).toBeInTheDocument();
    expect(screen.queryByText("Filipa Nova")).not.toBeInTheDocument();

    // Sair e voltar ao separador é o gesto que dispara a revalidação.
    fireEvent(document, new Event("visibilitychange"));
    await screen.findByText("Filipa Nova");

    const pedidos = fetchMock.mock.calls.filter(
      (args) => (args as unknown as [string])[0] === "/api/orcamento",
    );
    expect(pedidos).toHaveLength(1);
    expect(screen.queryByText("Gabriel Antigo")).not.toBeInTheDocument();
  });

  /**
   * A lista mostrava tudo igual, com a mesma etiqueta "Novo" num pedido de
   * ontem e num de há nove dias. Estes testes prendem o que substitui isso.
   */
  describe("urgência e contexto na lista de pedidos", () => {
    /** Um pedido entrado há N dias, ainda sem resposta. */
    const hAtras = (dias: number) => new Date(Date.now() - dias * 86400000).toISOString();

    it("põe à cabeça quem espera há mais tempo, sem ser preciso mexer na ordem", () => {
      renderAdmin([
        makeQuote({ name: "Recente", submittedAt: hAtras(1) }),
        makeQuote({ name: "Antigo", submittedAt: hAtras(12) }),
      ]);
      navTo(/Pedidos/);

      const nomes = screen.getAllByText(/^(Recente|Antigo)$/).map((n) => n.textContent);
      expect(nomes[0]).toBe("Antigo");
    });

    it("diz há quantos dias cada um espera", () => {
      renderAdmin([makeQuote({ name: "Ana", submittedAt: hAtras(4) })]);
      navTo(/Pedidos/);
      expect(screen.getByText("há 4 dias")).toBeInTheDocument();
    });

    it("não conta dias a quem já teve resposta — esse espera por eles", () => {
      renderAdmin([makeQuote({ name: "Com proposta", status: "cotado", submittedAt: hAtras(30) })]);
      navTo(/Pedidos/);
      expect(screen.queryByText(/há 30 dias/)).not.toBeInTheDocument();
    });

    it("marca o provável casamento à distância: sem data E sem local concreto", () => {
      renderAdmin([makeQuote({ name: "Longe", date: "", location: "Portugal" })]);
      navTo(/Pedidos/);
      expect(screen.getByText("Provável casamento à distância")).toBeInTheDocument();
    });

    it("uma ausência sozinha não faz um casamento à distância", () => {
      renderAdmin([makeQuote({ name: "Perto sem data", date: "", location: "Évora" })]);
      navTo(/Pedidos/);
      expect(screen.queryByText("Provável casamento à distância")).not.toBeInTheDocument();
    });

    it("mostra a região e a distância a Évora", () => {
      renderAdmin([makeQuote({ name: "Palmela", location: "Quinta X, Palmela" })]);
      navTo(/Pedidos/);
      expect(screen.getByText(/Palmela · ≈ \d+ km/)).toBeInTheDocument();
    });

    it("o filtro da espera esconde quem ainda não esperou o suficiente", () => {
      renderAdmin([
        makeQuote({ name: "Ontem", submittedAt: hAtras(1) }),
        makeQuote({ name: "Ha Muito", submittedAt: hAtras(9) }),
      ]);
      navTo(/Pedidos/);

      fireEvent.change(screen.getByLabelText("Filtrar por tempo de espera"), {
        target: { value: "7" },
      });
      expect(screen.getByText("Ha Muito")).toBeInTheDocument();
      expect(screen.queryByText("Ontem")).not.toBeInTheDocument();
    });
  });

  it("tracks bulk selection via the row checkboxes", () => {
    renderAdmin([makeQuote({ name: "Diogo Reis" }), makeQuote({ name: "Eva Lopes" })]);
    navTo(/Pedidos/);

    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar pedido de Diogo Reis" }));

    // The bulk-action bar announces the count.
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument();
  });
});

/**
 * A LISTA DE PEDIDOS MUDA DE FORMA.
 *
 * É o ecrã onde ela passa mais tempo. Num monitor, uma pilha de cartões grandes
 * mostra oito pedidos onde cabiam vinte e cinco — e não deixa fazer a pergunta
 * que decide o dia: quem está à espera há mais tempo.
 */
describe("Pedidos — cartões no telemóvel, tabela no computador", () => {
  function simularComputador() {
    vi.stubGlobal("matchMedia", (mq: string) => {
      const min = /min-width:\s*(\d+)px/.exec(mq);
      return {
        matches: min ? 1440 >= Number(min[1]) : mq.includes("hover: hover"),
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

  afterEach(() => vi.unstubAllGlobals());

  it("no computador é uma tabela, com a coluna de quem espera há mais tempo", async () => {
    simularComputador();
    renderAdmin([makeQuote({ name: "Diogo Reis" }), makeQuote({ name: "Eva Lopes" })]);
    navTo(/Pedidos/);
    await waitFor(() => expect(screen.getByRole("table", { name: "Pedidos" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: /À espera/ })).toBeInTheDocument();
  });

  /** A selecção em lote tem de continuar a funcionar nas DUAS formas — é o que
   *  permite responder a cinco pedidos de uma vez. */
  it("a selecção em lote continua a funcionar na tabela", async () => {
    simularComputador();
    renderAdmin([makeQuote({ name: "Diogo Reis" })]);
    navTo(/Pedidos/);
    await waitFor(() => expect(screen.getByRole("table", { name: "Pedidos" })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("checkbox", { name: "Selecionar pedido de Diogo Reis" }));
    expect(screen.getByText(/1 selecionado/)).toBeInTheDocument();
  });
});
