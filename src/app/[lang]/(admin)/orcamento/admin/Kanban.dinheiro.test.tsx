// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type { Quote } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";
import { eur0 as eur } from "@/lib/money";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «GANHO» DO KANBAN NÃO PODE ESTAR ~23% ABAIXO DE «RECEITA CONTRATADA»
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `proposta`/`ganho` somavam `q.quotedPrice`, o campo «Preço final (SEM IVA)».
 * A «Receita contratada» das Estatísticas, sobre os mesmos pedidos, vem de
 * `computeEventMetrics().contracted`, sempre COM IVA. Um evento aceite a
 * 20.000 € (+ IVA = 24.600 €) aparecia como «Ganho» 20.000 € — 4.600 € a
 * menos, o IVA inteiro.
 *
 * A correcção usa a MESMA cascata do dossier (`contractedAmounts(q).gross`),
 * já aplicada em `Reminders.tsx`, `PaymentsPanel.tsx`, `Overview.tsx` e
 * `StatsDashboard.tsx`.
 */

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ status: "aceite" }) })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

function renderKanban(quotes: Quote[]) {
  return render(
    <ToastProvider>
      <Kanban quotes={quotes} onOpen={vi.fn()} onStatusChange={vi.fn()} userName="Catarina" />
    </ToastProvider>,
  );
}

describe("Kanban — Ganho, Em proposta e os totais de coluna são sempre com IVA", () => {
  it("um evento aceite a 20.000 € (sem IVA) mostra Ganho 24.600 €, não 20.000 €", () => {
    renderKanban([pedido({ id: "ganho", status: "aceite", quotedPrice: 20000 })]);
    const resumo = screen.getByText("Ganho (com IVA)").previousElementSibling;
    // 20 000 x 1,23 = 24 600.
    expect(resumo?.textContent).toBe(eur(24600));
    expect(resumo?.textContent).not.toBe(eur(20000));
  });

  it("o total da coluna soma o mesmo bruto que o cartão mostra", () => {
    renderKanban([pedido({ id: "pipeline", status: "cotado", quotedPrice: 10000 })]);
    // 10 000 x 1,23 = 12 300 — no KPI "Em proposta" e no rodapé da coluna.
    const resumo = screen.getByText("Em proposta (com IVA)").previousElementSibling;
    expect(resumo?.textContent).toBe(eur(12300));
    const total = screen.getByText("Total (com IVA)");
    const totalValue = total.nextElementSibling;
    expect(totalValue?.textContent).toBe(eur(12300));
    // O cartão, dentro da coluna, mostra o mesmo valor bruto: KPI + total da
    // coluna + o próprio cartão = três ocorrências do mesmo número. Comparação
    // directa ao `textContent` (não `getByText`), que normaliza os espaços do
    // separador de milhar e deixa de bater com a string tal como formatada.
    const ocorrencias = Array.from(document.querySelectorAll("span,p")).filter(
      (el) => el.textContent === eur(12300),
    );
    expect(ocorrencias).toHaveLength(3);
  });
});
