// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import AdminClient from "./AdminClient";
import { SAIDA_MS } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GAVETA DO PEDIDO DEIXA DE FECHAR A SECO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O véu acendia em 240 ms e a gaveta desaparecia num fotograma — os dois, no
 * instante em que `selected` passava a `null`. Este ficheiro guarda o CICLO DE
 * VIDA da saída, que é a parte que o CSS não pode fazer sozinho: o nó fica
 * montado os 200 ms, com a classe certa desde o PRIMEIRO fotograma, e só
 * depois desaparece.
 *
 * A geometria não está aqui — o jsdom não tem disposição nenhuma e todo o
 * `getBoundingClientRect` dá zero. O que se vê está medido num Chromium, no
 * `e2e/entrada-da-gaveta.mjs`. O vocabulário está no
 * `entrada-do-painel-do-pedido.test.ts`.
 *
 * ── PORQUE É QUE ESTE FICHEIRO PRECISA DE UM ECRÃ DE TELEMÓVEL ────────────
 *
 * Porque a saída é da GAVETA e não da coluna do computador, e essa é uma
 * decisão e não um acidente: abaixo de `xl` o painel está FORA de fluxo e não
 * deixa espaço atrás de si; a partir de `xl` é uma coluna dentro da grelha, e
 * segurá-la 200 ms só adiava o salto da lista para a largura toda. A razão por
 * extenso está no `sairDoPainel`, no `AdminClient.tsx`.
 *
 * Sem o duplo do `matchMedia` este ficheiro media o ecrã errado e passava com
 * e sem a correcção — que é a pior espécie de teste, porque parece que prova.
 */

vi.mock("./lazy", () => {
  const stub = (name: string) => {
    const C = () => <div data-testid={`view-${name}`}>{name} stub</div>;
    C.displayName = `Lazy(${name})`;
    return C;
  };
  return {
    /**
     * A lista de Pedidos leva ao ecrã de fazer a proposta; o painel abre-se de
     * lá, no «Abrir o pedido». O duplo dá essa porta sem montar o ecrã inteiro
     * — é o mesmo que o `AdminClient.test.tsx` usa, e pela mesma razão.
     */
    FazerProposta: ({
      quotes,
      selectedId,
      onAbrirPedido,
    }: {
      quotes: Quote[];
      selectedId: string | null;
      onAbrirPedido: (q: Quote) => void;
    }) => (
      <div data-testid="view-fazer-proposta">
        <button
          type="button"
          onClick={() => {
            const q = quotes.find((x) => x.id === selectedId);
            if (q) onAbrirPedido(q);
          }}
        >
          Abrir o pedido
        </button>
      </div>
    ),
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
    Acompanhamento: stub("acompanhamento"),
    AnalisePropostas: stub("analise-propostas"),
  };
});

vi.mock("next/image", () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={typeof src === "string" ? src : ""} alt={alt} />
  ),
}));

let seq = 0;
function pedido(over: Partial<Quote> = {}): Quote {
  seq += 1;
  return {
    id: `LQ-${String(seq).padStart(3, "0")}`,
    submittedAt: "2026-05-01T10:00:00.000Z",
    lastUpdated: "2026-05-01T10:00:00.000Z",
    status: "pendente",
    name: `Cliente ${seq}`,
    email: `cliente${seq}@example.com`,
    category: "particulares",
    eventType: "casamentos",
    date: "2026-09-20",
    location: "Évora",
    guests: 80,
    ...over,
  } as Quote;
}

const servidor = new Map<string, Quote>();
const cabecalhos = (mapa: Record<string, string>) => ({ get: (k: string) => mapa[k] ?? null });

/**
 * Um `matchMedia` que diz «isto é um telemóvel».
 *
 * O que o `AdminClient` pergunta e que aqui importa é `(max-width: 1279px)` —
 * é essa que decide se o painel é gaveta ou coluna.
 */
function ecraDeTelemovel() {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: /max-width/.test(query),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

function montar(pedidos: Quote[]) {
  servidor.clear();
  for (const q of pedidos) servidor.set(q.id, q);
  return render(
    <ToastProvider>
      <AdminClient initialQuotes={pedidos} userName="Catarina" vistaInicial="pedidos" />
    </ToastProvider>,
  );
}

/** A gaveta: o nó que tem o botão «Fechar» lá dentro. */
function gaveta(): HTMLElement {
  const fechar = screen.getByRole("button", { name: "Fechar" });
  const caixa = fechar.closest("[class*='max-h-[100dvh]']");
  if (!(caixa instanceof HTMLElement)) throw new Error("não encontrei a gaveta");
  return caixa;
}

/** Abre o painel pelo caminho dela: lista → ecrã da proposta → «Abrir o pedido». */
async function abrirOPainel(nome: string) {
  await act(async () => {
    fireEvent.click(screen.getByText(nome));
  });
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /^Abrir o pedido$/ }));
  });
}

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  seq = 0;
  localStorage.clear();
  ecraDeTelemovel();
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      const m = /^\/api\/orcamento\/(.+)$/.exec(String(url));
      const q = m ? servidor.get(decodeURIComponent(m[1])) : undefined;
      if (q)
        return Promise.resolve({
          ok: true,
          headers: cabecalhos({ "x-pedido": "completo" }),
          json: () => Promise.resolve(q),
        });
      return Promise.resolve({
        ok: true,
        headers: cabecalhos({}),
        json: () => Promise.resolve([]),
      });
    }),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("a saída da gaveta do pedido", () => {
  it("segura a gaveta montada a sair — não desaparece no fotograma", async () => {
    montar([pedido({ id: "LQ-042", name: "Carla Nunes" })]);
    await abrirOPainel("Carla Nunes");
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    // Ainda lá está, e já a sair.
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
    expect(gaveta().className).toContain("bo-saida");

    avancar(SAIDA_MS);
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
  });

  it("a classe entra no PRIMEIRO fotograma, com ela os toques e o teclado saem", async () => {
    /**
     * O ponto mais importante da `.bo-saida`, e está escrito na regra: o
     * `pointer-events` larga-se DENTRO da classe, na mesma renderização que
     * marca o nó como «a sair» — aplicá-lo num `setTimeout` abre exactamente a
     * janela que ele existe para fechar. O `inert` é a mesma frase dita ao
     * teclado e ao leitor de ecrã.
     */
    montar([pedido({ id: "LQ-043", name: "Rita Sousa" })]);
    await abrirOPainel("Rita Sousa");

    vi.useFakeTimers();
    const antes = gaveta();
    expect(antes.hasAttribute("inert")).toBe(false);

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });

    // Sem avançar relógio nenhum: é o mesmo commit do React.
    expect(gaveta().className).toContain("bo-saida");
    expect(gaveta().hasAttribute("inert")).toBe(true);
  });

  it("e o véu vai-se com ela, e não fica um fotograma para trás", async () => {
    montar([pedido({ id: "LQ-044", name: "Inês Faria" })]);
    await abrirOPainel("Inês Faria");

    // O véu da gaveta, e não outro qualquer: é o único `inset-0` com esta
    // tinta e este `z-index` (o do menu lateral é `z-30` e mais escuro).
    const veu = () => document.querySelector('[class*="bg-black/50"][class*="z-40"]');
    expect(veu()?.className).toContain("bo-entrada-fundo");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    expect(veu()?.className).toContain("bo-saida-fundo");
  });

  it("o relógio da saída NÃO fecha um pedido aberto entretanto", async () => {
    /**
     * Durante os 200 ms a lista continua viva — a saída larga os toques da
     * gaveta, não os da página. Ela fecha um pedido e abre logo outro; o
     * relógio do primeiro não pode levar o segundo à frente.
     *
     * Foi por causa disto que a saída ganhou um porteiro no fim, e é o caso que
     * o `useSaidaAdiada` sozinho não resolve: ele sabe quando o tempo acaba,
     * não sabe se ainda é o mesmo sujeito.
     *
     * ── O RELÓGIO É FALSO DO PRINCÍPIO AO FIM, E ISSO É O CASO ───────────────
     *
     * Duas versões deste caso passaram com E sem o porteiro, que é a pior
     * espécie de teste. A primeira armava o relógio falso e voltava aos
     * verdadeiros a seguir — e voltar aos verdadeiros DEITA FORA a fila dos
     * falsos, portanto o relógio da saída nunca tocava. A segunda esperava em
     * tempo real, e abrir o segundo pedido no jsdom demora mais do que os
     * 200 ms: quando chegava lá, a saída do primeiro já tinha acabado sozinha e
     * não havia sobreposição nenhuma para medir.
     *
     * Com o relógio falso do princípio ao fim a sobreposição é EXACTA: 50 ms
     * de saída corrida, o segundo pedido a abrir dentro dela, e só depois o
     * tempo todo a passar.
     */
    vi.useFakeTimers();
    montar([
      pedido({ id: "LQ-045", name: "Ana Marques" }),
      pedido({ id: "LQ-046", name: "Bruno Dias" }),
    ]);
    await abrirOPainel("Ana Marques");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    avancar(50);
    expect(gaveta().className, "a saída já tinha acabado — não há sobreposição").toContain(
      "bo-saida",
    );

    // A meio da saída do primeiro, abre o segundo.
    await abrirOPainel("Bruno Dias");
    expect(gaveta().className, "o painel novo nasceu já a desaparecer").not.toContain("bo-saida");

    // E o relógio do primeiro passa sem levar este à frente.
    avancar(SAIDA_MS * 3);
    expect(screen.getByRole("button", { name: "Fechar" })).toBeInTheDocument();
  });

  it("quem pediu para não animar não espera 200 ms por uma gaveta a apagar-se", async () => {
    /**
     * A guarda tem de ser em JavaScript e não só no CSS: o que muda é o CICLO
     * DE VIDA. Com a animação desligada e o nó segurado à mesma, ficava uma
     * caixa parada e morta 200 ms em cima do que está por baixo dela.
     */
    montar([pedido({ id: "LQ-047", name: "Sara Lopes" })]);
    await abrirOPainel("Sara Lopes");

    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: /max-width/.test(query) || query.includes("prefers-reduced-motion"),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    // Sem avançar relógio nenhum: fecha no próprio instante.
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
  });
});

describe("e a coluna do computador continua a fechar de uma vez", () => {
  /**
   * A partir de `xl` o painel é uma coluna DENTRO da grelha. Segurá-la 200 ms a
   * desvanecer-se não animava a mudança de duas faixas para uma: a lista ficava
   * estreita durante a saída e SALTAVA no fim. Mesmo corte seco, 200 ms mais
   * tarde e com uma animação por cima a dizer que não era.
   */
  it("sem gaveta, sem saída adiada", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: /min-width/.test(query),
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
    montar([pedido({ id: "LQ-048", name: "Marta Reis" })]);
    await abrirOPainel("Marta Reis");

    vi.useFakeTimers();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
    });
    expect(screen.queryByRole("button", { name: "Fechar" })).not.toBeInTheDocument();
  });
});
