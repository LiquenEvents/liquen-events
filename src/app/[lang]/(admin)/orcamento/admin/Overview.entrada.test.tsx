// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUATRO BLOCOS À VISTA, NOVE ATRÁS DE UM TOQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para o deploy verdadeiro: «o back office está com a
 * mesma estrutura, não me diz nada — eu gostava mesmo de o levar ao nível da
 * Apple e da Pixelmatters».
 *
 * A Visão Geral tinha TREZE blocos empilhados, todos visíveis ao mesmo tempo.
 * Ficam quatro — os que respondem à pergunta de quem abre isto de manhã — e os
 * outros nove passam para dentro de um `<details>`.
 *
 * ── O QUE ESTE FICHEIRO EXISTE PARA IMPEDIR ───────────────────────────────
 *
 * Que «tirar da vista» se transforme, sem ninguém dar por isso, em «tirar do
 * ecrã». São coisas diferentes e a diferença é o produto todo:
 *
 *   · o conteúdo continua no DOM com a gaveta FECHADA — é isso que faz o ⌘F do
 *     browser encontrá-lo e abrir a gaveta sozinho. Um `{aberto && …}` em React
 *     apagava-o, e quem procurasse um nome concluía, com razão, que ele não
 *     estava no ecrã;
 *   · a gaveta diz pelo nome o que lá tem. «Mais» sozinho é uma gaveta anónima,
 *     e uma gaveta anónima não se abre: desconfia-se dela;
 *   · e os quatro da entrada ficam FORA dela.
 */

const HOJE = new Date("2026-08-14T09:00:00.000Z");

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    submittedAt: "2026-07-01T10:00:00.000Z",
    status: "cotado",
    name: "Ana e Rui",
    email: "ana@exemplo.pt",
    category: "particulares",
    eventType: "casamentos",
    guests: 100,
    ...over,
  }) as Quote;

function desenhar() {
  return render(
    <Overview
      quotes={[pedido(), pedido({ id: "q2", status: "aceite", quotedPrice: 5000 })]}
      userName="Catarina"
      onOpen={vi.fn()}
      onGoStats={vi.fn()}
      onGo={vi.fn()}
      onNew={vi.fn()}
    />,
  );
}

/** A gaveta, pelo texto com que se anuncia. */
const gaveta = () => document.querySelector("details.bo-mais") as HTMLDetailsElement | null;

/**
 * Há ALGUM nó com este texto dentro da gaveta?
 *
 * Não serve o `getByText` seco: «Fases dos pedidos» é também o rótulo de um
 * atalho no topo da vista, e esse atalho tem de continuar onde está. A
 * pergunta certa não é «existe» — é «existe lá dentro».
 */
function tituloNaGaveta(texto: RegExp): boolean {
  const g = gaveta();
  if (!g) return false;
  return screen.getAllByText(texto).some((n) => g.contains(n));
}

beforeEach(() => {
  __resetListCache?.();
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(HOJE);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("[]", { headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a entrada da Visão Geral", () => {
  it("nasce fechada — é esse o ponto", () => {
    desenhar();
    const g = gaveta();
    expect(g, "a gaveta desapareceu da Visão Geral").not.toBeNull();
    expect(g!.open).toBe(false);
  });

  it("diz pelo nome o que tem lá dentro", () => {
    desenhar();
    const resumo = gaveta()!.querySelector("summary")!.textContent ?? "";
    for (const coisa of ["agenda", "lembretes", "fases", "atividade", "atenção"]) {
      expect(resumo.toLowerCase(), `o resumo não menciona «${coisa}»`).toContain(coisa);
    }
  });

  it("com a gaveta FECHADA, o que lá está dentro continua no DOM", () => {
    // A garantia que separa «tirar da vista» de «tirar do ecrã». Sem ela, o
    // localizar-na-página deixa de encontrar o que ficou guardado.
    desenhar();
    expect(gaveta()!.open).toBe(false);
    // `getAllByText`: «Fases dos pedidos» é também o rótulo de um atalho lá em
    // cima, e o atalho tem de continuar a existir. O que se afirma é que o
    // TÍTULO da secção continua desenhado com a gaveta fechada.
    expect(tituloNaGaveta(/Fases dos pedidos/i)).toBe(true);
    expect(tituloNaGaveta(/Precisam de atenção/i)).toBe(true);
    expect(tituloNaGaveta(/Dinheiro — recebido e a receber/i)).toBe(true);
  });

  it("os quatro da entrada ficam FORA da gaveta", () => {
    desenhar();
    const g = gaveta()!;
    const dinheiro = screen.getByRole("group", { name: /ganho, à espera e recebido/i });
    expect(g.contains(dinheiro), "o bloco do dinheiro caiu para dentro da gaveta").toBe(false);
    const saudacao = screen.getByText(/Catarina\./i);
    expect(g.contains(saudacao), "a saudação caiu para dentro da gaveta").toBe(false);
    const espera = screen.getByText(/à espera de resposta/i);
    expect(g.contains(espera), "«à espera de resposta» caiu para dentro da gaveta").toBe(false);
  });

  it("e os nove ficam DENTRO", () => {
    // O contrário do caso de cima. Sem este, tirar o `<MaisDoPainel>` e deixar
    // tudo à vista outra vez passava sem ninguém reparar.
    desenhar();
    for (const titulo of [/Fases dos pedidos/i, /Precisam de atenção/i, /Pedidos ativos/i]) {
      expect(tituloNaGaveta(titulo), `${titulo} devia estar na gaveta`).toBe(true);
    }
  });

  it("se ela a abrir, fica aberta da próxima vez", () => {
    localStorage.setItem("liquen-visao-geral-mais", "1");
    desenhar();
    expect(gaveta()!.open).toBe(true);
  });

  it("a cascata de entrada existe, e cada bloco tem a SUA vez", () => {
    // ── ESTE CASO JÁ DEIXOU PASSAR UM DEFEITO, E POR ISSO ENDURECEU ────────
    //
    // A primeira versão contentava-se com «há três ou mais» e «há mais do que
    // uma ordem distinta». Passava — e o browser mostrou `0, 2, 2, 2, 3`: o
    // `2` três vezes, porque a classe tinha caído DENTRO do `.map()` dos três
    // números do dinheiro. Os três cartões animavam-se cada um por si e o
    // bloco a que pertencem não se animava de todo.
    //
    // Uma cascata de blocos que anima filhos não é uma cascata: é um tremor.
    // O que se exige agora é o que define uma: UM elemento por vez, e vezes
    // que não se repetem.
    desenhar();
    const cenas = Array.from(document.querySelectorAll<HTMLElement>(".bo-cena"));
    expect(cenas.length, "a entrada deixou de ser encenada").toBeGreaterThanOrEqual(3);
    const ordens = cenas.map((e) => e.style.getPropertyValue("--cena"));
    expect(
      ordens.length - new Set(ordens).size,
      `há blocos a partilhar a mesma vez na cascata: ${ordens.join(", ")}`,
    ).toBe(0);
    // E as vezes são números, e começam no princípio.
    expect(ordens.every((o) => /^\d+$/.test(o))).toBe(true);
    expect(Math.min(...ordens.map(Number))).toBe(0);
  });
});
