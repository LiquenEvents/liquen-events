// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { __resetListCache } from "./useCachedList";
import StatsDashboard from "./StatsDashboard";
import { eur0 as eur } from "@/lib/money";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «GANHO (ACEITE)» NÃO PODE ESTAR ~23% ABAIXO DE «RECEITA CONTRATADA»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Os dois números vivem na MESMA página (Estatísticas), sobre os MESMOS
 * eventos. «Ganho (aceite)» somava `q.quotedPrice`, o campo «Preço final (SEM
 * IVA)» do ecrã; «Receita contratada» (na Visão Geral, mesma base de dados)
 * vem de `computeEventMetrics().contracted`, sempre COM IVA. Um evento aceite
 * a 20.000 € (+ IVA = 24.600 €) mostrava «Ganho» 20.000 € — 4.600 € a menos,
 * exactamente o IVA.
 *
 * A correcção usa a MESMA cascata já escrita em `dossier.ts`
 * (`contractedAmounts(q).gross`) e já aplicada em `Reminders.tsx`,
 * `PaymentsPanel.tsx` e `Overview.tsx`. Nada de conta nova.
 */

const response = (body: unknown) => ({
  ok: true,
  status: 200,
  headers: new Headers({ ETag: `W/"${Math.random()}"` }),
  json: async () => body,
});

beforeEach(() => {
  __resetListCache();
  // A "Análise de propostas" vai à rede; aqui não interessa.
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => response([])),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** O valor de um KPI é o irmão anterior do seu rótulo, no mesmo cartão. */
const kpiValue = (label: string) => screen.getByText(label).previousElementSibling?.textContent;

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "q1",
    name: "Ana e Rui",
    email: "a@b.pt",
    guests: 100,
    status: "cotado",
    submittedAt: "2026-06-01T10:00:00.000Z",
    ...over,
  }) as unknown as Quote;

describe("StatsDashboard — Ganho (aceite) e Em proposta são sempre com IVA", () => {
  it("um evento aceite a 20.000 € (sem IVA) mostra Ganho 24.600 €, não 20.000 €", () => {
    render(
      <StatsDashboard
        quotes={[
          pedido({
            id: "ganho",
            status: "aceite",
            quotedPrice: 20000,
            lastUpdated: "2026-06-05T10:00:00.000Z",
          }),
        ]}
      />,
    );
    // 20 000 x 1,23 = 24 600 — a taxa efectiva por omissão do pedido.
    expect(kpiValue("Ganho (aceite, com IVA)")).toBe(eur(24600));
    expect(kpiValue("Ganho (aceite, com IVA)")).not.toBe(eur(20000));
  });

  it("«Em proposta» soma o pipeline também com IVA", () => {
    render(
      <StatsDashboard
        quotes={[pedido({ id: "pipeline", status: "cotado", quotedPrice: 10000 })]}
      />,
    );
    // 10 000 x 1,23 = 12 300.
    expect(kpiValue("Em proposta (com IVA)")).toBe(eur(12300));
    expect(kpiValue("Em proposta (com IVA)")).not.toBe(eur(10000));
  });

  it("o Ticket médio divide pelos aceites que TÊM preço, não por todos os aceites", () => {
    render(
      <StatsDashboard
        quotes={[
          pedido({
            id: "com-preco",
            status: "aceite",
            quotedPrice: 20000,
            lastUpdated: "2026-06-05T10:00:00.000Z",
            payments: [{ id: "p1", kind: "sinal", amount: 1000, date: "2026-06-10", paid: true }],
          }),
          // Aceite SEM preço — entrava no denominador antigo e diluía a média.
          pedido({
            id: "sem-preco",
            status: "aceite",
            lastUpdated: "2026-06-05T10:00:00.000Z",
          }),
        ]}
      />,
    );
    // Numerador: só o com preço, 24 600 €. Denominador: 1 (só quem tem preço),
    // não 2. Se dividisse por 2, o Ticket médio sairia 12 300 €.
    expect(kpiValue("Ticket médio (com IVA)")).toBe(eur(24600));
  });
});
