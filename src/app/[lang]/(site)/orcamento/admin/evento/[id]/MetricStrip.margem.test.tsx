// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import MetricStrip from "./MetricStrip";
import { computeEventMetrics, type DossierData } from "@/lib/orcamento/dossier";
import { eur0 } from "@/lib/money";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RÓTULO DA MARGEM ESTAVA A MENTIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * `computeEventMetrics` passou a calcular a margem como receita LÍQUIDA menos
 * custos LÍQUIDOS — está lá explicado porquê (o IVA não é receita nem é custo;
 * a diferença entre dois brutos é a margem verdadeira vezes 1,23). A faixa do
 * cockpit continuou a chamar-lhe «Margem c/ IVA» e a pôr por baixo os custos
 * COM IVA, o único número bruto da célula.
 *
 * Quem lê vê 10.000 € de margem, 12.300 € de custos e um rótulo que diz "com
 * IVA": tenta fechar a conta de cabeça, não fecha, e fica sem saber qual dos
 * dois números acreditar. O número está certo; o que estava errado era o que
 * se dizia dele.
 */

const IVA23 = {
  basePrice: 0,
  guestCost: 0,
  packageMultiplier: 1,
  locationSurcharge: 0,
  weekendSurcharge: 0,
  seasonSurcharge: 0,
  urgencySurcharge: 0,
  addonsCost: 0,
  subtotal: 10_000,
  iva: 2_300,
  total: 12_300,
  rangeMin: 0,
  rangeMax: 0,
  isEstimate: false,
};

/** 20.000 € líquidos de receita contra 12.300 € de custos com IVA (10.000 €
 *  líquidos): margem verdadeira de 10.000 €. */
function metricas() {
  const quote = {
    id: "LIQ-1",
    name: "Ana Ribeiro",
    email: "ana@exemplo.pt",
    phone: "910000000",
    status: "aceite",
    submittedAt: "2026-01-10T10:00:00.000Z",
    date: "2026-08-20",
    priceBreakdown: IVA23,
    quotedPrice: 20_000,
    eventSuppliers: [
      {
        id: "f1",
        name: "Floristas",
        category: "Flores",
        estimatedCost: 12_300,
        status: "confirmado",
      },
    ],
  } as unknown as Quote;
  const d: DossierData = { quote, proposal: null, contract: null, invoices: [] };
  return computeEventMetrics(d, new Date("2026-08-13T12:00:00.000Z"));
}

/** O euro formatado em pt-PT leva espaços finos/inquebráveis; o DOM lido pelo
 *  testing-library já vem com eles normalizados. Comparamos com a mesma régua. */
const semEspacosFinos = (s: string) => s.replace(/[  \s]+/g, " ");

afterEach(cleanup);

describe("MetricStrip — a margem diz a base em que está", () => {
  it("rotula a margem como líquida, que é como é calculada", () => {
    const m = metricas();
    expect(m.margin).toBe(10_000); // pré-condição: a conta é líquida-líquida

    render(<MetricStrip metrics={m} />);

    expect(screen.getByText("Margem s/ IVA")).toBeInTheDocument();
    expect(screen.queryByText("Margem c/ IVA")).not.toBeInTheDocument();
  });

  it("os custos ao lado da margem estão na mesma base dela", () => {
    const m = metricas();
    const { container } = render(<MetricStrip metrics={m} />);
    const texto = semEspacosFinos(container.textContent ?? "");

    // 10.000 € (líquidos), não os 12.300 € com IVA que a célula mostrava.
    expect(texto).toContain(semEspacosFinos(`custos s/ IVA ${eur0(10_000)}`));
    expect(texto).not.toContain(semEspacosFinos(eur0(12_300)));
  });

  it("o valor contratado continua a ser o bruto que o rótulo promete", () => {
    const m = metricas();
    const { container } = render(<MetricStrip metrics={m} />);

    expect(screen.getByText("Valor c/ IVA")).toBeInTheDocument();
    expect(semEspacosFinos(container.textContent ?? "")).toContain(semEspacosFinos(eur0(24_600)));
  });
});
