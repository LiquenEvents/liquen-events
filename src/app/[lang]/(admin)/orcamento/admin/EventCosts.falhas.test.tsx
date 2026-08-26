// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventCosts from "./EventCosts";
import type { EventSupplier, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CUSTOS DO EVENTO — A GRAVAÇÃO QUE FALHA DESFAZIA A QUE PASSOU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── 1. A reversão olhava para um instante que já passou ────────────────────
 * O `persist()` fazia `const snapshot = items` ANTES do pedido e repunha-o no
 * erro. Aqui grava-se campo a campo, ao sair de cada caixa — e cada PATCH leva
 * a lista INTEIRA. Mudar o estado de um fornecedor e logo a seguir o de outro
 * põe dois no ar: o segundo já contém o primeiro, o servidor fica com os dois,
 * mas o primeiro, ao falhar, repunha o mundo anterior aos DOIS e apagava do
 * ecrã um custo que estava gravado.
 *
 * E não é um número qualquer: estes três são a receita, o custo e a margem —
 * aquilo por que ela decide se o evento vale a pena.
 *
 * ── 2. E a frase não dizia de que fornecedor falava ────────────────────────
 * «Não foi possível guardar o custo. Tenta novamente.» era a mesma para a rede
 * em baixo, a sessão expirada, o pedido apagado por outra pessoa e o servidor
 * em baixo. Com a sessão caduca, «tenta novamente» é um conselho que não pode
 * funcionar.
 *
 * ── 3. E um diretório que não se conseguiu ler passava por vazio ───────────
 * O `catch(() => {})` da leitura do diretório engolia tudo: o seletor «Do
 * diretório de fornecedores» desaparecia, e o formulário ficava igual ao de
 * quem ainda não tem fornecedores nenhuns. Escreve-se o nome à mão e a reserva
 * nasce solta do diretório.
 */

function reply(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const FORNECEDORES: EventSupplier[] = [
  {
    id: "f1",
    name: "Flores da Vila",
    category: "Floristas",
    estimatedCost: 400,
    status: "contactado",
  },
  {
    id: "f2",
    name: "Som & Luz",
    category: "Audiovisual",
    estimatedCost: 250,
    status: "contactado",
  },
];

const quoteCom = (eventSuppliers: EventSupplier[]) =>
  ({ id: "q1", name: "Casamento Ana & Rui", eventSuppliers, quotedPrice: 5000 }) as Quote;

function montar(
  eventSuppliers: EventSupplier[] = FORNECEDORES,
  onChange: (s: EventSupplier[]) => void = () => {},
) {
  return render(
    <ToastProvider>
      <EventCosts quote={quoteCom(eventSuppliers)} onChange={onChange} />
    </ToastProvider>,
  );
}

/** A linha de um fornecedor, pelo nome que lá está escrito. */
const linhaDe = (nome: string) => screen.getByText(nome).closest("div.group") as HTMLElement;

/** O botão-pastilha que faz rodar o estado da reserva. */
const estadoDe = (nome: string) =>
  within(linhaDe(nome)).getByTitle("Clica para mudar o estado") as HTMLButtonElement;

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Custos do evento — duas gravações ao mesmo tempo", () => {
  it("a que falha não apaga o custo que o servidor aceitou", async () => {
    // O primeiro PATCH fica pendurado e só depois recusa; o segundo responde
    // logo que sim. É a corrida de dois toques seguidos.
    let recusarPrimeiro: (() => void) | null = null;
    const primeiroPendente = new Promise<Response>((resolve) => {
      recusarPrimeiro = () => resolve(reply(500, { error: "não deu" }));
    });
    let n = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/fornecedores")) return reply(200, []);
        return ++n === 1 ? primeiroPendente : reply(200, { ok: true });
      }),
    );

    const user = userEvent.setup();
    const vistoPeloPai: EventSupplier[][] = [];
    montar(FORNECEDORES, (s) => vistoPeloPai.push(s));

    await user.click(estadoDe("Flores da Vila"));
    await user.click(estadoDe("Som & Luz"));
    await waitFor(() => expect(within(linhaDe("Som & Luz")).getByText("Confirmado")).toBeTruthy());

    // Só agora o servidor recusa o primeiro.
    recusarPrimeiro!();
    await waitFor(() => expect(vistoPeloPai.length).toBeGreaterThan(1));

    // Nenhum dos dois pode voltar atrás: o segundo PATCH levou a lista inteira
    // — já com a mudança das flores lá dentro — e o servidor aceitou-o. O que
    // o primeiro tentava gravar ESTÁ gravado.
    expect(
      within(linhaDe("Som & Luz")).getByText("Confirmado"),
      "a gravação falhada desfez a que o servidor tinha aceitado",
    ).toBeTruthy();
    expect(
      within(linhaDe("Flores da Vila")).getByText("Confirmado"),
      "a gravação falhada desfez a mudança que seguiu no segundo PATCH (aceite)",
    ).toBeTruthy();
    expect(vistoPeloPai.at(-1)).toEqual([
      { ...FORNECEDORES[0], status: "confirmado" },
      { ...FORNECEDORES[1], status: "confirmado" },
    ]);
    // E nada a dizer: não há nada a corrigir no ecrã.
    expect(screen.queryByText(/não deu para/i)).toBeNull();
  });

  it("com a sessão expirada, nomeia o fornecedor e manda entrar em vez de repetir", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/fornecedores")) return reply(200, []);
        return reply(401, { error: "Não autorizado" });
      }),
    );

    const user = userEvent.setup();
    montar();

    const caixa = within(linhaDe("Flores da Vila")).getByLabelText("Real (€)") as HTMLInputElement;
    await user.type(caixa, "520");
    await user.tab();

    await waitFor(() => expect(screen.getByText(/sessão expirou/i)).toBeTruthy());
    // Nomeia a coisa, e diz o que fazer — repetir aqui não podia funcionar.
    expect(screen.getByText(/guardar o custo real de «Flores da Vila»/)).toBeTruthy();
    expect(screen.getByText(/volta a entrar/i)).toBeTruthy();
    // E o valor recusado não fica no ecrã com ar de gravado.
    await waitFor(() => expect(caixa.value).toBe(""));
  });
});

describe("Custos do evento — o diretório de fornecedores não se leu", () => {
  it("diz que não deu para o ler, em vez de o mostrar vazio", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/fornecedores")) return reply(503, { error: "em baixo" });
        return reply(200, { ok: true });
      }),
    );

    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /Adicionar fornecedor ao evento/ }));

    await waitFor(() =>
      expect(
        screen.getByText(/Não deu para ler o diretório de fornecedores/),
        "um diretório que não se conseguiu ler passava por um diretório vazio",
      ).toBeTruthy(),
    );
  });

  it("e quando se lê, não diz nada", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        if (String(url).includes("/api/fornecedores"))
          return reply(200, [{ id: "s1", name: "Flores do Tejo", category: "Floristas" }]);
        return reply(200, { ok: true });
      }),
    );

    const user = userEvent.setup();
    montar();
    await user.click(screen.getByRole("button", { name: /Adicionar fornecedor ao evento/ }));

    await waitFor(() => expect(screen.getByLabelText(/Do diretório/)).toBeTruthy());
    expect(screen.queryByText(/Não deu para ler o diretório/)).toBeNull();
  });
});
