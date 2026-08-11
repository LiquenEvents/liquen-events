// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Faturas from "./Faturas";

/**
 * ESCREVER NO FORMULÁRIO NÃO PODE VOLTAR A DESENHAR O LIVRO DE FATURAS.
 *
 * Medido numa compilação de produção com 167 faturas e 300 pedidos: escrever o
 * nome do cliente em "Nova fatura" custava 68–71 ms por tecla até o ecrã pintar,
 * com 22 tarefas longas em 22 teclas. A causa era estrutural, não cosmética: o
 * estado do formulário vive no mesmo componente que o livro, por isso cada tecla
 * voltava a desenhar as 167 linhas — DUAS vezes, porque o layout de telemóvel e
 * o de secretária estão os dois no DOM (só escondidos por CSS) — mais as 300
 * `<option>` do seletor de evento.
 *
 * Estes testes fixam a correcção pelo lado do comportamento (o livro continua
 * completo e as ações funcionam) e pelo lado do custo: contamos quantas vezes o
 * formatador de euros é chamado, que é uma vez por linha por desenho do livro.
 * Se alguém desfizer os `memo()`, a contagem dispara e o teste falha.
 */

const { moneyCalls } = vi.hoisted(() => ({ moneyCalls: { eur: 0 } }));

vi.mock("@/lib/money", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/money")>();
  return {
    ...actual,
    eur: (n: number) => {
      moneyCalls.eur += 1;
      return actual.eur(n);
    },
  };
});

type Row = {
  id: string;
  number: string;
  quoteId: string;
  clientName: string;
  clientEmail: string;
  kind: "sinal" | "saldo" | "total";
  amount: number;
  vatRate: number;
  issuedAt: string;
  status: "emitida" | "paga" | "anulada";
};

const ROWS = 40;
const invoices: Row[] = Array.from({ length: ROWS }, (_, i) => ({
  id: `inv-${i}`,
  number: `FT 2026/${String(i + 1).padStart(4, "0")}`,
  quoteId: `q-${i}`,
  clientName: `Cliente ${i}`,
  clientEmail: `c${i}@exemplo.pt`,
  kind: i % 3 === 0 ? "sinal" : i % 3 === 1 ? "saldo" : "total",
  amount: 1000 + i,
  vatRate: 0.23,
  issuedAt: "2026-05-01",
  // 0,3,6… anuladas · 1,4,7… pagas · o resto emitidas
  status: i % 3 === 0 ? "anulada" : i % 3 === 1 ? "paga" : "emitida",
}));

const quotes = Array.from({ length: 120 }, (_, i) => ({
  id: `q-${i}`,
  name: `Par ${i}`,
  eventName: "Casamento",
  email: `c${i}@exemplo.pt`,
})) as never[];

const ok = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: 'W/"faturas"' }),
  json: async () => body,
});

beforeEach(() => {
  __resetListCache();
  moneyCalls.eur = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => (String(url).startsWith("/api/faturas") ? ok(invoices) : ok([]))),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderFaturas() {
  return render(
    <ToastProvider>
      <Faturas quotes={quotes} />
    </ToastProvider>,
  );
}

describe("Faturas — o livro", () => {
  it("desenha todas as faturas e os totais por estado nos filtros", async () => {
    renderFaturas();
    await waitFor(() => expect(screen.getAllByText("Cliente 0").length).toBeGreaterThan(0));

    // Os dois layouts (cartões + tabela) estão ambos no DOM, por isso cada
    // cliente aparece duas vezes. O que interessa é que nenhuma linha falta.
    expect(screen.getAllByText(`Cliente ${ROWS - 1}`).length).toBeGreaterThan(0);

    // Contagens dos chips, agora vindas de uma única passagem sobre a lista.
    const anuladas = invoices.filter((i) => i.status === "anulada").length;
    const pagas = invoices.filter((i) => i.status === "paga").length;
    const emitidas = invoices.filter((i) => i.status === "emitida").length;
    expect(screen.getByRole("button", { name: `Todas · ${ROWS}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Emitida · ${emitidas}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Paga · ${pagas}` })).toBeTruthy();
    expect(screen.getByRole("button", { name: `Anulada · ${anuladas}` })).toBeTruthy();
  });

  it("filtra por estado", async () => {
    const user = userEvent.setup();
    renderFaturas();
    await waitFor(() => expect(screen.getAllByText("Cliente 0").length).toBeGreaterThan(0));

    const pagas = invoices.filter((i) => i.status === "paga").length;
    await user.click(screen.getByRole("button", { name: `Paga · ${pagas}` }));

    // "Cliente 0" está anulada, portanto sai; "Cliente 1" está paga e fica.
    await waitFor(() => expect(screen.queryByText("Cliente 0")).toBeNull());
    expect(screen.getAllByText("Cliente 1").length).toBeGreaterThan(0);
  });
});

describe("Faturas — escrever no formulário não redesenha o livro", () => {
  it("não volta a formatar um único valor do livro por cada tecla", async () => {
    const user = userEvent.setup();
    renderFaturas();
    await waitFor(() => expect(screen.getAllByText("Cliente 0").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /Nova fatura/ }));
    const campo = await screen.findByLabelText("Cliente");

    // A partir daqui, contamos.
    moneyCalls.eur = 0;
    await user.type(campo, "Maria e Tomás");

    // Se o livro voltasse a desenhar-se, seriam ~2 × 40 formatações POR TECLA
    // (mais de mil no total). Com os `memo()` no sítio, o livro não é tocado —
    // toleramos uma margem folgada para não prender o teste a um número exacto.
    expect(moneyCalls.eur).toBeLessThan(ROWS);
    expect((campo as HTMLInputElement).value).toBe("Maria e Tomás");
  });

  it("mantém o livro intacto enquanto se escreve", async () => {
    const user = userEvent.setup();
    renderFaturas();
    await waitFor(() => expect(screen.getAllByText("Cliente 0").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /Nova fatura/ }));
    const campo = await screen.findByLabelText("Cliente");
    await user.type(campo, "Ana");

    expect(screen.getAllByText(`Cliente ${ROWS - 1}`).length).toBeGreaterThan(0);
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O VALOR QUE ENTRA NA FATURA É COM IVA — E JÁ ESTEVE 23 % ABAIXO
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * Escolher um evento na caixa "Evento" pré-preenchia o valor com
 * `quote.quotedPrice`, que é o campo «Preço final (SEM IVA)» do estúdio. Mas
 * `Invoice.amount` é o valor COM IVA — o PDF calcula a base dividindo por
 * (1 + taxa). Um casamento de 10 000 € + IVA passava a uma fatura de 10 000 €
 * com IVA incluído: 2 300 € por cobrar, e o documento internamente coerente,
 * portanto sem nada que denunciasse.
 *
 * Este teste não olha para a implementação: escolhe um evento e lê o campo. É a
 * pergunta que a dona faria — «o que é que aparece aqui quando escolho este
 * casamento?».
 */
describe("Faturas — o valor pré-preenchido inclui o IVA", () => {
  const COM_PRECO_LIQUIDO = [
    {
      id: "q-net",
      name: "Casal do preço final",
      eventName: "Casamento",
      email: "casal@exemplo.pt",
      quotedPrice: 10000, // «Preço final (sem IVA)»
      vatRate: 0.23,
    },
  ] as never[];

  it("10 000 € sem IVA entram como 12 300 €, não como 10 000 €", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Faturas quotes={COM_PRECO_LIQUIDO} />
      </ToastProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /nova fatura/i }));
    await user.selectOptions(screen.getByLabelText(/evento \(opcional\)/i), "q-net");

    const valor = screen.getByLabelText(/com IVA/i) as HTMLInputElement;
    await waitFor(() => expect(valor.value).not.toBe(""));
    expect(
      Number(valor.value),
      "o campo é «com IVA» — 10 000 aqui seria faturar 2 300 € a menos",
    ).toBeCloseTo(12300, 2);
  });

  it("o rótulo diz que o valor é com IVA", async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Faturas quotes={COM_PRECO_LIQUIDO} />
      </ToastProvider>,
    );
    await user.click(await screen.findByRole("button", { name: /nova fatura/i }));
    expect(screen.getByLabelText(/com IVA/i)).toBeTruthy();
  });
});

/**
 * ══════════════════════════════════════════════════════════════════════════════
 * O QUE O FORMULÁRIO PROMETE TEM DE SER O QUE O SERVIDOR EMITE
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * O "split" emite duas faturas, e a rota calcula-as com a percentagem da
 * PROPOSTA (`depositPercentOf`). Aqui a frase de pré-visualização dividia
 * sempre 30/70: numa proposta de 50%, ela lia «sinal 3.690,00 € + saldo
 * 8.610,00 €», carregava em Emitir, e no livro apareciam duas faturas de
 * 6.150,00 €. Não é um erro de contabilidade — é o ecrã a dizer uma coisa e o
 * botão a fazer outra.
 */
describe("Faturas — a divisão prometida é a da proposta", () => {
  const CASAL = [
    {
      id: "q-50",
      name: "Casal de metade",
      eventName: "Casamento",
      email: "casal@exemplo.pt",
      quotedPrice: 10000, // «Preço final (sem IVA)» → 12 300 € com IVA
      vatRate: 0.23,
    },
  ] as never[];

  const comPercentagem = (pctSinal: number) =>
    vi.fn(async (url: string) => {
      const u = String(url);
      if (u.startsWith("/api/propostas")) return ok([{ id: "p1", quoteId: "q-50", pctSinal }]);
      if (u.startsWith("/api/faturas?quoteId=")) return ok([]);
      if (u.startsWith("/api/faturas")) return ok(invoices);
      return ok([]);
    });

  it("uma proposta de 50% promete duas metades", async () => {
    vi.stubGlobal("fetch", comPercentagem(50));
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <Faturas quotes={CASAL} />
      </ToastProvider>,
    );

    await user.click(await screen.findByRole("button", { name: /nova fatura/i }));
    await user.selectOptions(screen.getByLabelText(/evento \(opcional\)/i), "q-50");

    // 12 300 € ao meio: 6 150 € + 6 150 €.
    const frase = () => screen.getByText(/Serão emitidas duas faturas/).textContent ?? "";
    await waitFor(() => expect(frase()).toMatch(/sinal 6\D?150,00/));
    expect(frase()).toMatch(/saldo 6\D?150,00/);
    expect(frase()).not.toMatch(/3\D?690,00/);
  });
});
