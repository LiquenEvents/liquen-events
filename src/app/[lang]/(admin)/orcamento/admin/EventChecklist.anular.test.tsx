// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventChecklist from "./EventChecklist";
import type { ChecklistItem, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A JANELA PARA ANULAR APARECE DE ALGUM SÍTIO — E NÃO SE FAZ ESPERAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Apagar um item da checklist não pergunta nada: repõe-se com um toque. Essa
 * decisão só se aguenta enquanto a tira «… Anular» for boa — e ela é montagem
 * condicional pura, ou seja, existia ou não existia, com um fotograma entre os
 * dois estados. Numa lista onde uma linha ACABOU de desaparecer, uma caixa a
 * materializar-se por cima lê-se como mais um salto.
 *
 * ── O QUE ESTE FICHEIRO GUARDA, POR ORDEM DE IMPORTÂNCIA ──────────────────
 *
 *  1. Que o «Anular» está CLICÁVEL no primeiro fotograma. Esta é a única
 *     forma de desfazer; uma animação que a atrase — ou pior, uma saída com
 *     `pointer-events: none` — transforma o desfazer num alvo que se vê e não
 *     se acerta. É a regra da casa no sítio onde ela é mais dura.
 *  2. Que a entrada é a palavra da casa e a distância certa: `.bo-entrada`
 *     nua, quatro píxeis de RÓTULO. Uma `.bo-entrada-folha` aqui seria dizer
 *     que isto vem de fora do painel, e não vem.
 *  3. Que ninguém lhe acrescenta uma saída sem ler a razão por que não a tem.
 */

function resposta(status: number, body: unknown = { ok: true }) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const ITENS: ChecklistItem[] = [
  { id: "c1", label: "Confirmar catering", done: false },
  { id: "c2", label: "Reservar transporte", done: false },
];

function montar() {
  return render(
    <ToastProvider>
      <EventChecklist quote={{ id: "q1", checklist: ITENS } as Quote} onChange={() => {}} />
    </ToastProvider>,
  );
}

/**
 * A tira, e não a região de avisos do `ToastProvider` — que também é um
 * `role="status"` e está sempre montada. Procura-se pelo TEXTO do gesto, que é
 * o que distingue as duas coisas.
 */
function tiraDeAnular(): HTMLElement {
  const no = screen.getByText(/saiu da checklist/).closest('[role="status"]');
  if (!no) throw new Error("a tira de anular não montou");
  return no as HTMLElement;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("a tira de anular da checklist", () => {
  it("entra com a palavra da casa, à distância de um rótulo", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(200)),
    );
    const user = userEvent.setup();
    montar();

    expect(screen.queryByText(/saiu da checklist/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Remover Confirmar catering" }));

    const tira = await waitFor(tiraDeAnular);
    expect(tira.className, "a tira ainda monta de repente, sem vir de sítio nenhum").toContain(
      "bo-entrada",
    );
    // Quatro píxeis, e não oito: isto nasce dentro do painel, não é uma folha
    // do telemóvel nem um aviso do canto do ecrã.
    expect(tira.className, "a distância de uma folha num rótulo").not.toContain("bo-entrada-folha");
    expect(tira.className).not.toContain("bo-entrada-fundo");
  });

  it("e o «Anular» está clicável no primeiro fotograma — a animação não o atrasa", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(200)),
    );
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Remover Confirmar catering" }));
    const tira = await waitFor(tiraDeAnular);

    // A tira está a ANIMAR neste instante (a classe está lá) e mesmo assim o
    // botão responde: nada de `pointer-events`, nada de atraso, nada de estado
    // intermédio. É a diferença entre uma entrada e uma espera.
    expect(tira.className).toContain("bo-entrada");
    const anular = screen.getByRole("button", { name: "Anular" });
    expect(anular).not.toBeDisabled();
    await user.click(anular);

    await waitFor(() => expect(screen.getByText("Confirmar catering")).toBeTruthy());
    expect(screen.queryByText(/saiu da checklist/)).toBeNull();
  });

  it("e não ganhou saída — que aqui seria um alvo que se vê e não se acerta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => resposta(200)),
    );
    const user = userEvent.setup();
    montar();

    await user.click(screen.getByRole("button", { name: "Remover Confirmar catering" }));
    const tira = await waitFor(tiraDeAnular);
    // A `.bo-saida` larga os toques dentro da própria classe, durante 200 ms.
    // Numa tira que se some sozinha ao fim de oito segundos, essa janela cai
    // exactamente no instante em que alguém se decide a carregar.
    expect(
      tira.className,
      "a tira de anular ganhou uma saída — ver a nota no ficheiro",
    ).not.toMatch(/\bbo-saida\b/);
  });
});
