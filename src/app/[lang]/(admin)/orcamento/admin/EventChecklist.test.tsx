// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import EventChecklist from "./EventChecklist";
import type { ChecklistItem, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * RISCAR DUAS TAREFAS DE SEGUIDA NÃO PODE DESRISCAR AS DUAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `persist()` guardava a checklist inteira antes do pedido e repunha-a no
 * erro. Riscar dois itens de seguida — que é como esta lista se usa, a percorrer
 * e a ir marcando — põe dois PATCH no ar ao mesmo tempo. O segundo leva a lista
 * COMPLETA, já com o primeiro item riscado dentro; quando o servidor o aceita,
 * fica com os dois. Mas o primeiro, ao falhar, repunha o instante anterior às
 * DUAS marcações e desriscava no ecrã uma que estava gravada.
 *
 * O prejuízo não é o pisca-pisca: é a edição seguinte, que grava esse ecrã por
 * cima da verdade. A tarefa volta a "por fazer" na véspera do evento.
 */

function reply(status: number, body: unknown = { ok: true }) {
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

const quoteCom = (checklist: ChecklistItem[]) => ({ id: "q1", checklist }) as Quote;

function montar(checklist: ChecklistItem[], onChange: (i: ChecklistItem[]) => void = () => {}) {
  return render(
    <ToastProvider>
      <EventChecklist quote={quoteCom(checklist)} onChange={onChange} />
    </ToastProvider>,
  );
}

const caixaDe = (label: string) => screen.getByRole("checkbox", { name: label });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Checklist do evento — duas marcações ao mesmo tempo", () => {
  it("a que falha não desmarca a que o servidor aceitou", async () => {
    let recusarPrimeiro: (() => void) | null = null;
    const primeiroPendente = new Promise<Response>((resolve) => {
      recusarPrimeiro = () => resolve(reply(503, { error: "não deu" }));
    });

    let chamadas = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => (++chamadas === 1 ? primeiroPendente : reply(200))),
    );

    const vistoPeloPai: ChecklistItem[][] = [];
    const user = userEvent.setup();
    montar(ITENS, (i) => vistoPeloPai.push(i));

    await user.click(caixaDe("Confirmar catering"));
    await user.click(caixaDe("Reservar transporte"));
    await waitFor(() =>
      expect(caixaDe("Reservar transporte").getAttribute("aria-checked")).toBe("true"),
    );

    recusarPrimeiro!();
    await new Promise((r) => setTimeout(r, 0));

    expect(
      caixaDe("Reservar transporte").getAttribute("aria-checked"),
      "a marcação que o servidor aceitou desapareceu do ecrã",
    ).toBe("true");
    expect(
      caixaDe("Confirmar catering").getAttribute("aria-checked"),
      "a marcação que seguiu no segundo PATCH (aceite) foi desfeita",
    ).toBe("true");
    expect(vistoPeloPai.at(-1)).toEqual([
      { ...ITENS[0], done: true },
      { ...ITENS[1], done: true },
    ]);
  });

  it("uma gravação falhada sozinha continua a repor e a avisar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(500, { error: "não deu" })),
    );

    const user = userEvent.setup();
    montar(ITENS);

    await user.click(caixaDe("Confirmar catering"));

    await waitFor(() =>
      expect(caixaDe("Confirmar catering").getAttribute("aria-checked")).toBe("false"),
    );
    // A frase nomeia o item e diz o que fazer a seguir — «Não foi possível
    // guardar a checklist» servia para seis situações com respostas diferentes.
    expect(screen.getByText(/não está a aceitar gravações/)).toBeTruthy();
    expect(screen.getByText(/marcar «Confirmar catering»/)).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ALVO DE TOQUE DA CAIXA DE MARCAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ecrã usa-se DE PÉ, no local do evento, com o telemóvel numa mão: riscar
 * um item é o gesto mais repetido que tem. Medida a 375 px com a checklist
 * cheia, a caixa dava 20×20 px — menos de metade dos 44 do mínimo das Human
 * Interface Guidelines, e falhá-la marca o item ao lado.
 *
 * ── PORQUE É QUE ISTO OLHA PARA UMA CLASSE E NÃO PARA UM TAMANHO ──────────
 * Os 44 px vêm de `.alvo-toque` (globals.css), que só existe dentro de
 * `@media (pointer: coarse)`. O jsdom não carrega o CSS da folha nem avalia
 * media queries — `getBoundingClientRect()` devolve zeros aqui. Medir o
 * tamanho a sério é trabalho do passeio `e2e/admin-mobile.spec.ts`, que corre
 * num browser verdadeiro com `hasTouch`.
 *
 * O que ESTE teste guarda é a outra metade, e é a que se perde numa
 * refactorização distraída: que o botão continua a ser quem leva a classe, e
 * que o quadrado desenhado continua num filho. Trocar os dois — pôr o
 * `alvo-toque` no `span` de dentro — deixa o ecrã igual no portátil e devolve
 * os 20 px no telemóvel, sem nenhum teste a queixar-se.
 */
describe("Checklist do evento — o alvo de toque da caixa de marcar", () => {
  it("o alvo é o botão, e o quadrado desenhado vive dentro dele", () => {
    montar(ITENS);

    const caixa = caixaDe("Confirmar catering");
    expect(caixa.tagName).toBe("BUTTON");
    // O botão é o alvo: é ele que cresce para os 44 px sob dedo.
    expect(caixa.className).toContain("alvo-toque");

    // E o quadrado de 20 px (`h-5 w-5`) é um FILHO — se subir para o botão,
    // volta a ser o botão a ter 20 px e a classe deixa de servir para nada.
    const quadrado = caixa.querySelector(".h-5.w-5");
    expect(quadrado).not.toBeNull();
    expect(caixa.className).not.toContain("h-5");
  });

  it("o rótulo que abre a edição também é um alvo de 44 px", () => {
    montar(ITENS);

    // O rótulo é a porta para editar o texto do item, e media 197×39 px.
    // `getAllByTitle`: há um por linha da checklist, e o primeiro serve.
    const rotulo = screen.getAllByTitle("Editar item")[0];
    expect(rotulo.className).toContain("alvo-toque");
    // Centrado por omissão pela classe; este texto é corrido e fica à esquerda.
    expect(rotulo.className).toContain("!justify-start");
  });
});
