// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A BARRA LATERAL RECOLHE-SE NO COMPUTADOR — E SOZINHA AO FAZER PROPOSTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero que haja uma cruz para que dê no desktop para carregar
 * e o menu fica ocultado e a zona do back office estende de forma a aumentar o
 * espaço para fazer propostas (…) aliás eu quero que quando carregamos em fazer
 * proposta o menu oculte-se automaticamente».
 *
 * A barra mede 256 px e está sempre lá. No estúdio isso importa mais do que em
 * qualquer outro ecrã: a coluna onde ela escreve vive dentro de três outras, e
 * é a primeira a pagar quando o ecrã não é enorme.
 *
 * ── PORQUE É QUE ISTO LÊ CLASSES E NÃO MEDE PÍXEIS ─────────────────────────
 * O jsdom não faz contas de layout: `getBoundingClientRect` devolve zeros e
 * `lg:` nunca é verdade. Um teste que aqui medisse a largura media zero e
 * passava sempre. O que se prende é a DECISÃO — que a classe que encolhe a
 * coluna está lá quando tem de estar, e que os dois botões existem no estado
 * certo. Quem mede a sério é o passeio do Playwright.
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
    // A vista «Fazer proposta», que é o ecrã inteiro deste ficheiro.
    FazerProposta: stub("fazer-proposta"),
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

/** A barra lateral. É `role="complementary"` — o `<aside>`. */
const barra = () => screen.getByRole("complementary");

describe("a cruz que recolhe o menu no computador", () => {
  it("começa aberta, e a coluna não leva a classe que a encolhe", () => {
    montar(makeQuote());
    expect(barra().className).not.toMatch(/lg:w-0/);
  });

  it("carregar na cruz encolhe a coluna a zero no computador", async () => {
    montar(makeQuote());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Recolher o menu" }));
    });
    // `lg:w-0` mais `lg:overflow-hidden`: a coluna vale zero e o que está lá
    // dentro (que continua a medir 256) não transborda.
    expect(barra().className).toMatch(/lg:w-0/);
    expect(barra().className).toMatch(/lg:overflow-hidden/);
    // E o risco da direita sai com ela — 1 px sem nada de um dos lados lê-se
    // como uma coluna vazia.
    expect(barra().className).toMatch(/lg:border-r-0/);
  });

  /**
   * Uma coluna que se recolhe e não se pode trazer de volta é uma coluna que
   * se perde. Este é o caso que impede isso.
   */
  it("e há por onde a trazer de volta — que é o que a torna reversível", async () => {
    montar(makeQuote());
    // Fechada, não há porta de volta: a barra está lá, não faz falta.
    expect(screen.queryByRole("button", { name: "Mostrar o menu" })).toBeNull();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Recolher o menu" }));
    });
    const voltar = screen.getByRole("button", { name: "Mostrar o menu" });

    await act(async () => {
      fireEvent.click(voltar);
    });
    expect(barra().className).not.toMatch(/lg:w-0/);
    expect(screen.queryByRole("button", { name: "Mostrar o menu" })).toBeNull();
  });

  it("a escolha dela sobrevive ao recarregar — é por aparelho", async () => {
    montar(makeQuote());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Recolher o menu" }));
    });
    expect(localStorage.getItem("liquen-admin-menu-recolhido")).toBe("1");
    cleanup();

    montar(makeQuote());
    await act(async () => {});
    expect(barra().className).toMatch(/lg:w-0/);
  });
});

describe("entrar em «Fazer proposta» recolhe o menu sozinho", () => {
  async function irParaOEstudio() {
    await act(async () => {
      fireEvent.click(within(barra()).getByRole("button", { name: /Fazer proposta/ }));
    });
  }

  it("a barra recolhe-se sem ninguém lhe tocar", async () => {
    montar(makeQuote());
    expect(barra().className).not.toMatch(/lg:w-0/);
    await irParaOEstudio();
    expect(barra().className).toMatch(/lg:w-0/);
  });

  /**
   * ── E ABRI-LA À MÃO TEM DE AGUENTAR ───────────────────────────────────
   *
   * Sem o travão, o efeito voltava a fechá-la no render seguinte: ela carregava
   * para a abrir e o ecrã fechava-lha na cara. É o defeito que o
   * `recolhidoPeloEstudio` existe para não ter, e é por isso que tem caso.
   */
  it("mas se ela a voltar a abrir, fica aberta — o ecrã não lhe fecha na cara", async () => {
    montar(makeQuote());
    await irParaOEstudio();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mostrar o menu" }));
    });
    expect(barra().className).not.toMatch(/lg:w-0/);
    // Um render a mais não a fecha outra vez.
    await act(async () => {});
    expect(barra().className).not.toMatch(/lg:w-0/);
  });

  it("e sair do estúdio não lhe mexe — o que ela escolheu lá fica", async () => {
    montar(makeQuote());
    await irParaOEstudio();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Mostrar o menu" }));
    });
    await act(async () => {
      fireEvent.click(within(barra()).getByRole("button", { name: /Visão Geral/ }));
    });
    expect(barra().className).not.toMatch(/lg:w-0/);
  });
});
