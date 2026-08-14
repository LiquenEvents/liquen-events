// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import Overview from "./Overview";
import { __resetListCache } from "./useCachedList";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A VISÃO GERAL NUM TELEMÓVEL — «espaço e densidade»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Medido a 390×844, antes: cada número de dinheiro ocupava um cartão de
 * LARGURA INTEIRA, 358×109 px, empilhados em 319 → 670. Trezentos e cinquenta
 * e um píxeis — 42% do ecrã — para três números que somados têm nove
 * algarismos. E logo por baixo vinham outros três cartões iguais, com
 * contagens.
 *
 * A regra deste trabalho, nas palavras dela: um número de dinheiro não precisa
 * de um cartão inteiro; três números cabem num bloco.
 *
 * ── O QUE NÃO PODE DESAPARECER ───────────────────────────────────────────
 *
 * As frases por baixo dos três números. Foram acrescentadas de propósito («a
 * letra pequena que faltava») porque são a razão de ela poder CONFIAR nos
 * valores: sem elas, «Ganho» é uma palavra e não uma conta. Encolher o bloco à
 * custa delas seria trocar o problema pelo pior.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA CLASSES ────────────────────────────
 *
 * O jsdom não faz layout: não há aqui píxeis para medir. A geometria real está
 * medida no browser, a 390×844, e vive no relatório. O que este teste guarda é
 * a DECISÃO — mobile: um bloco só, com divisões; ≥640: a grelha de três — para
 * que ninguém a desfaça sem dar por isso. É a mesma escolha do
 * `adaptativo.test.tsx`, que afirma sobre `opacity-0`.
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

beforeEach(() => {
  __resetListCache?.();
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

/** O bloco dos três números do dinheiro, pelo nome com que se anuncia. */
const blocoDoDinheiro = () => screen.getByRole("group", { name: /ganho, à espera e recebido/i });

describe("os três números do dinheiro no telemóvel", () => {
  it("continua a explicar cada número por baixo dele", () => {
    desenhar();
    // A razão de ela poder confiar nos valores. Não sai daqui.
    expect(screen.getByText(/propostas que marcaste como ganhas/i)).toBeTruthy();
    expect(screen.getByText(/propostas enviadas, ainda sem resposta/i)).toBeTruthy();
    expect(screen.getByText(/pagamentos que já estão dados como recebidos/i)).toBeTruthy();
  });

  it("é UM bloco no telemóvel e três cartões só a partir de 640", () => {
    desenhar();
    const g = blocoDoDinheiro();
    // A moldura passa para o GRUPO: no telemóvel os três vivem dentro da mesma
    // caixa, separados por um risco, em vez de três caixas com ar entre elas.
    expect(g.className).toMatch(/\bdivide-y\b/);
    expect(g.className).toMatch(/\bborder\b/);
    // E a grelha de três só entra no corte `sm` da casa (640).
    expect(g.className).toMatch(/sm:grid-cols-3/);
    expect(g.className).toMatch(/sm:divide-y-0/);
  });

  it("os três números deixam de ser cartões de largura inteira", () => {
    desenhar();
    const filhos = Array.from(blocoDoDinheiro().children);
    expect(filhos).toHaveLength(3);
    for (const f of filhos) {
      // Sem moldura própria no telemóvel — a moldura é a do grupo.
      expect(f.className).not.toMatch(/(^|\s)border(\s|$)/);
      // Ela volta no ecrã grande, onde os três cartões estão certos.
      expect(f.className).toMatch(/sm:border\b/);
      // O número foge para a direita da linha em vez de comer uma linha só
      // para ele.
      expect(f.className).toMatch(/flex/);
    }
  });

  it("a frase de apoio usa o cinzento auditado e não um /45 que não passa AA", () => {
    desenhar();
    const frase = screen.getByText(/propostas que marcaste como ganhas/i);
    // `text-foreground/45` dá ~3.8:1 sobre branco — abaixo de AA para texto
    // pequeno, e foi lido por ela como «um cinzento-azeitona difícil de ler».
    // `--bo-text-muted` é o degrau auditado (~5.6:1).
    expect(frase.className).toMatch(/bo-text-muted/);
    expect(frase.className).not.toMatch(/text-foreground\/4/);
  });
});

describe("os quatro atalhos do topo", () => {
  it("ficam numa grelha de dois no telemóvel, com a mesma largura", () => {
    desenhar();
    const botao = screen.getByRole("button", { name: /^Novo pedido$/ });
    const grelha = botao.parentElement!;
    // Eram `flex flex-wrap`: quebravam 2+2 com larguras diferentes e deixavam
    // a coluna direita irregular. Uma grelha de duas colunas dá-lhes a mesma
    // largura sem depender do comprimento do rótulo.
    expect(grelha.className).toMatch(/grid-cols-2/);
    // Sem prefixo = telemóvel. O `lg:flex-wrap` pode (e deve) lá estar: é o
    // computador a recuperar a fila que sempre teve.
    expect(grelha.className).not.toMatch(/(^|\s)flex-wrap\b/);
    expect(grelha.className).toMatch(/lg:flex-wrap/);
  });
});
