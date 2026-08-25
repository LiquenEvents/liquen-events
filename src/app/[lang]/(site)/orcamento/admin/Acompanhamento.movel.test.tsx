// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import ActivityLog from "./ActivityLog";
import Acompanhamento from "./Acompanhamento";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAS FILAS QUE NÃO QUEBRAVAM — ESMAGAVAM
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O jsdom não faz layout: o que estes testes guardam é a DECISÃO, lida nas
 * classes. A geometria mede-se no browser (`admin-mobile.spec.ts`).
 *
 * ── O cabeçalho do registo de atividade ────────────────────────────────────
 * `flex items-center justify-between` com o título de um lado e dois botões do
 * outro, SEM `flex-wrap`. Vive dentro do painel lateral do dossier (343 px de
 * caixa a 375) e dentro da gaveta do pedido, que é mais estreita ainda: a fila
 * não cabe e, sem permissão para quebrar, os três encolhem uns contra os
 * outros. `flex-wrap` sozinho, sem ponto de corte — a pergunta é sobre a
 * CAIXA, não sobre a janela (ver `ui/adaptativo.ts`).
 *
 * ── O resumo do Acompanhamento ─────────────────────────────────────────────
 * Três colunas cruas a 375 px dão 105 px por caixa — 73 de conteúdo — com um
 * `text-2xl` (24 px) lá dentro. Nesses 73 px «Seguimentos devidos» parte-se em
 * duas linhas e «Validade nos próximos 7 dias» em três: a fila que existia
 * para poupar altura estava a gastá-la em quebras de palavra. O comentário
 * dizia copiar o `EventCosts` — e o que o `EventCosts` faz é `grid-cols-2` com
 * `@min-[26rem]:grid-cols-3` e o herói a atravessar as duas colunas.
 */

/** O painel só desenha o resumo depois de a lista de propostas chegar; até lá
 *  está o esqueleto. A cache do `useCachedList` vive no módulo e tem de ser
 *  limpa entre testes. */
async function montarAcompanhamento() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ ETag: 'W/"1"' }),
      json: async () => [PROPOSTA],
    })),
  );
  render(
    <ToastProvider>
      <Acompanhamento quotes={[PEDIDO]} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Em aberto")).toBeTruthy());
}

beforeEach(() => __resetListCache());
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const PEDIDO = {
  id: "q1",
  name: "Ana Marques",
  email: "ana@exemplo.pt",
  status: "cotado",
  submittedAt: "2026-01-02T10:00:00.000Z",
} as unknown as Quote;

/** Uma proposta enviada chega para o resumo existir — sem nenhuma, o painel
 *  desenha o estado vazio e não há grelha nenhuma para guardar. */
const PROPOSTA = {
  id: "p1",
  quoteId: "q1",
  clientName: "Ana Marques",
  clientEmail: "ana@exemplo.pt",
  currency: "EUR",
  lineItems: [],
  vatRate: 0.23,
  subtotal: 10000,
  vat: 2300,
  total: 12300,
  status: "enviada",
  createdAt: "2026-01-02T10:00:00.000Z",
};

describe("o cabeçalho do registo de atividade", () => {
  const cabecalho = () => screen.getByText("Histórico de Atividade").parentElement!;

  it("deixa a fila quebrar em vez de a esmagar", async () => {
    render(<ActivityLog quote={PEDIDO} actor="Catarina" onAddEntry={async () => true} />);
    expect(cabecalho().className).toMatch(/\bflex-wrap\b/);
    // Sem ponto de corte nenhum: a pergunta é sobre o contentor.
    expect(cabecalho().className).not.toMatch(/(sm|lg):flex-wrap/);
  });

  it("e o título não encosta aos botões na linha em que ainda cabem todos", () => {
    render(<ActivityLog quote={PEDIDO} actor="Catarina" onAddEntry={async () => true} />);
    // `justify-between` não separa nada — só empurra cada um para o seu extremo.
    expect(cabecalho().className).toMatch(/\bjustify-between\b/);
    expect(cabecalho().className).toMatch(/\bgap-2\b/);
  });

  it("os próprios botões também quebram, e não encolhem", () => {
    render(<ActivityLog quote={PEDIDO} actor="Catarina" onAddEntry={async () => true} />);
    const fila = screen.getByRole("button", { name: /chamada/i }).parentElement!;
    expect(fila.className).toMatch(/\bflex-wrap\b/);
  });
});

describe("o resumo do Acompanhamento", () => {
  const grelha = () => screen.getByText("Em aberto").closest("div.grid")!;

  it("são duas colunas primeiro, e três só quando cabem", async () => {
    await montarAcompanhamento();
    expect(grelha().className).toMatch(/grid-cols-2/);
    expect(grelha().className).toMatch(/@min-\[26rem\]:grid-cols-3/);
    // Nunca `grid-cols-3` cru: era isso que dava as caixas de 105 px.
    expect(grelha().className).not.toMatch(/(^|\s)grid-cols-3(\s|$)/);
  });

  it("pergunta pela CAIXA e não pela janela, no mesmo limiar do EventCosts", async () => {
    await montarAcompanhamento();
    expect(grelha().closest(".\\@container")).toBeTruthy();
    expect(grelha().className).not.toMatch(/\bsm:grid-cols/);
  });

  it("o terceiro toma a linha de baixo inteira em vez de ficar a meia largura", async () => {
    await montarAcompanhamento();
    const terceiro = screen.getByText("Seguimentos devidos").parentElement!;
    expect(terceiro.className).toMatch(/col-span-2/);
    expect(terceiro.className).toMatch(/@min-\[26rem\]:col-span-1/);
  });

  it("os três números encolhem um degrau no telemóvel", async () => {
    await montarAcompanhamento();
    for (const rotulo of ["Em aberto", "Prazo a acabar", "Seguimentos devidos"]) {
      const numero = screen.getByText(rotulo).nextElementSibling!;
      // 24 px de algarismo num cartão de 105 é o que não deixava a legenda
      // caber ao lado dele.
      expect(numero.className, rotulo).toMatch(/\btext-xl\b/);
      expect(numero.className, rotulo).toMatch(/\bsm:text-2xl\b/);
    }
  });
});
