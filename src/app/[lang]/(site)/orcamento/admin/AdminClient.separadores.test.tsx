// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM PEDIDO NÃO MONTA OS TRÊS SEPARADORES DE UMA VEZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os doze `dynamic()` dos três separadores do detalhe (Produção, Financeiro,
 * "Fazer proposta") eram todos descarregados e arrancados ao abrir QUALQUER
 * pedido, mesmo para quem só queria ver um telefone. Cada separador passa a
 * montar as suas ferramentas só na PRIMEIRA vez que é aberto.
 *
 * A garantia contrária, que já existia e continua a valer, é que TROCAR de
 * separador (depois de aberto) nunca desmonta nada, só esconde. O terceiro
 * teste prende-a: escrever num campo, saltar para outro separador e voltar,
 * sem perder o que estava escrito.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  /** Um stub com UM campo de texto local: para provar que sobrevive a uma
   *  troca de separador (não voltaria a estar vazio se tivesse desmontado). */
  const stubComCampo = (name: string, rotulo: string) => {
    const C = () => (
      <div data-testid={`view-${name}`}>
        <label>
          {rotulo}
          <input aria-label={rotulo} defaultValue="" />
        </label>
      </div>
    );
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
    Contratos: stub("contratos"),
    Temas: stub("temas"),
    Inventario: stub("inventario"),
    ProposalBuilder: stub("proposal-builder"),
    ProposalStudio: stub("proposal-studio"),
    ProductionPlan: stub("production-plan"),
    ClientMessenger: stubComCampo("client-messenger", "Rascunho da mensagem"),
    EventChecklist: stub("event-checklist"),
    EventMaterial: stub("event-material"),
    EventTimeline: stub("event-timeline"),
    PaymentsPanel: stub("payments-panel"),
    EventCosts: stub("event-costs"),
    GuestList: stub("guest-list"),
    TagsField: stub("tags-field"),
    FollowUpField: stub("follow-up-field"),
    ActivityLog: stub("activity-log"),
    EventTasks: stubComCampo("event-tasks", "Título da tarefa nova"),
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

function montar(quote: Quote) {
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const m = /^\/api\/orcamento\/([^?]+)$/.exec(String(url));
      const id = m ? decodeURIComponent(m[1]) : null;
      if (id === quote.id) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(quote),
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
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={[quote]} userName="Catarina" />
    </ToastProvider>,
  );
}

/** Abre o painel de detalhe do pedido: é onde os separadores vivem. */
async function abrirPedido(nome = "Ana Marques") {
  const sidebar = screen.getByRole("complementary");
  fireEvent.click(within(sidebar).getByRole("button", { name: /Pedidos/ }));
  await act(async () => {
    fireEvent.click(screen.getByText(nome));
  });
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("abrir um pedido monta só o separador onde abre", () => {
  it("um pedido novo abre em «Fazer proposta», e Produção/Financeiro nem chegam a montar", async () => {
    montar(makeQuote());
    await abrirPedido();

    expect(screen.getByRole("tab", { name: /Fazer proposta/ }).getAttribute("aria-selected")).toBe(
      "true",
    );
    // O separador activo desenhou as suas ferramentas...
    expect(screen.getByTestId("view-client-messenger")).toBeTruthy();
    // ...mas os outros dois nem existem no DOM: não «escondidos», AUSENTES.
    expect(screen.queryByTestId("view-event-tasks")).toBeNull();
    expect(screen.queryByTestId("view-event-checklist")).toBeNull();
    expect(screen.queryByTestId("view-production-plan")).toBeNull();
    expect(screen.queryByTestId("view-guest-list")).toBeNull();
    expect(screen.queryByTestId("view-payments-panel")).toBeNull();
    expect(screen.queryByTestId("view-event-costs")).toBeNull();
  });

  it("abrir o separador Produção monta as SUAS ferramentas só nesse instante", async () => {
    montar(makeQuote());
    await abrirPedido();

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Produção/ }));
    });

    expect(screen.getByTestId("view-event-tasks")).toBeTruthy();
    expect(screen.getByTestId("view-event-checklist")).toBeTruthy();
    expect(screen.getByTestId("view-event-material")).toBeTruthy();
    // O plano/convidados vive num `<details>` recolhido dentro do MESMO
    // separador: monta com ele, mesmo fechado (só fica escondido por CSS).
    expect(screen.getByTestId("view-production-plan")).toBeTruthy();
    expect(screen.getByTestId("view-event-timeline")).toBeTruthy();
    expect(screen.getByTestId("view-guest-list")).toBeTruthy();
    // O Financeiro continua por abrir: continua ausente.
    expect(screen.queryByTestId("view-payments-panel")).toBeNull();
    expect(screen.queryByTestId("view-event-costs")).toBeNull();
  });
});

describe("trocar de separador não perde o que se estava a escrever", () => {
  it("um rascunho de mensagem sobrevive a ir a Produção e voltar", async () => {
    montar(makeQuote());
    await abrirPedido();

    const rascunho = screen.getByLabelText("Rascunho da mensagem");
    fireEvent.change(rascunho, { target: { value: "Olá, sobre o vosso casamento..." } });

    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Produção/ }));
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("tab", { name: /Fazer proposta/ }));
    });

    // Se o separador tivesse desmontado ao sair, isto tinha voltado a "".
    expect((screen.getByLabelText("Rascunho da mensagem") as HTMLInputElement).value).toBe(
      "Olá, sobre o vosso casamento...",
    );
  });
});
