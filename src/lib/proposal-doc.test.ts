import { describe, it, expect } from "vitest";
import {
  DEFAULT_VALID_DAYS,
  DEFAULT_VAT_RATE,
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_NOTAS_IMPORTANTES,
  detectVatMode,
  parseMoneyText,
  resolveProposalMoney,
  resolveValidUntil,
  withProposalDefaults,
  type ProposalDoc,
} from "./proposal-doc";
import { round2 } from "./money";

describe("proposal-doc — parseMoneyText (pt-PT free text)", () => {
  it("extracts a euro amount with '+ IVA' trailing", () => {
    expect(parseMoneyText("3.000,00 € + IVA")).toBe(3000);
  });

  it("handles thousands dots and decimal comma", () => {
    expect(parseMoneyText("14.700,00 €")).toBe(14700);
    expect(parseMoneyText("1.234.567,89 €")).toBe(1234567.89);
  });

  it("handles a space thousands separator", () => {
    expect(parseMoneyText("1 500,00")).toBe(1500);
  });

  it("handles a bare integer and cents-only value", () => {
    expect(parseMoneyText("3000")).toBe(3000);
    expect(parseMoneyText("0,50 €")).toBe(0.5);
  });

  it("returns 0 for undefined, empty, or non-numeric text", () => {
    expect(parseMoneyText(undefined)).toBe(0);
    expect(parseMoneyText("")).toBe(0);
    expect(parseMoneyText("sob consulta")).toBe(0);
  });

  it("reads the first number when several appear", () => {
    expect(parseMoneyText("Decor 3.000,00 € + extras 500,00 €")).toBe(3000);
  });
});

describe("proposal-doc — detectVatMode", () => {
  it("defaults to 'incluido' for absent/plain text", () => {
    expect(detectVatMode(undefined)).toBe("incluido");
    expect(detectVatMode("3.000,00 €")).toBe("incluido");
    expect(detectVatMode("IVA incluído")).toBe("incluido");
  });

  it("detects the net-value annotations as 'acrescer'", () => {
    expect(detectVatMode("3.000,00 € + IVA")).toBe("acrescer");
    expect(detectVatMode("3000 mais IVA")).toBe("acrescer");
    expect(detectVatMode("ao valor acresce o IVA")).toBe("acrescer");
    expect(detectVatMode("valor com IVA não incluído")).toBe("acrescer");
    expect(detectVatMode("iva nao incluido")).toBe("acrescer"); // no accents
  });

  it("is case-insensitive", () => {
    expect(detectVatMode("3000 + iva")).toBe("acrescer");
    expect(detectVatMode("3000 + IVA")).toBe("acrescer");
  });
});

describe("proposal-doc — resolveProposalMoney", () => {
  // resolveProposalMoney types `totalText` as required (mirroring ProposalDoc)
  // yet handles it being falsy at runtime; default it to "" so partial inputs
  // stay type-clean without changing behavior (empty text → parseMoneyText 0).
  type MoneyInput = Parameters<typeof resolveProposalMoney>[0];
  const money = (d: Partial<MoneyInput> = {}) => resolveProposalMoney({ totalText: "", ...d });

  it("keeps base + vat === gross in 'acrescer' mode", () => {
    const m = money({ totalAmount: 3000, totalVatMode: "acrescer" });
    expect(m.base).toBe(3000);
    expect(m.vat).toBe(690);
    expect(m.gross).toBe(3690);
    expect(round2(m.base + m.vat)).toBe(m.gross);
  });

  it("keeps base + vat === gross in 'incluido' mode", () => {
    const m = money({ totalAmount: 3690, totalVatMode: "incluido" });
    expect(m.base).toBe(3000);
    expect(m.vat).toBe(690);
    expect(m.gross).toBe(3690);
    expect(round2(m.base + m.vat)).toBe(m.gross);
  });

  it("maintains the base+vat===gross invariant for awkward rounding values (both modes)", () => {
    for (const amount of [100, 99.99, 12345.67, 1, 0.03, 777.77]) {
      const inc = money({ totalAmount: amount, totalVatMode: "incluido" });
      expect(round2(inc.base + inc.vat)).toBe(inc.gross);
      expect(inc.gross).toBe(round2(amount));

      const acr = money({ totalAmount: amount, totalVatMode: "acrescer" });
      expect(round2(acr.base + acr.vat)).toBe(acr.gross);
      expect(acr.base).toBe(round2(amount));
    }
  });

  it("prefers the STRUCTURED amount over free text", () => {
    const m = money({
      totalAmount: 5000,
      totalVatMode: "acrescer",
      totalText: "9.999,00 €",
    });
    expect(m.base).toBe(5000);
  });

  it("falls back to free text when totalAmount is absent, detecting the mode from text", () => {
    const m = money({ totalText: "3.000,00 € + IVA" });
    expect(m.mode).toBe("acrescer");
    expect(m.base).toBe(3000);
    expect(m.vat).toBe(690);
    expect(m.gross).toBe(3690);
  });

  it("falls back to totalEstimatedText when totalText is missing", () => {
    const m = money({ totalEstimatedText: "12.500,00 €" });
    expect(m.gross).toBe(12500);
    expect(m.mode).toBe("incluido");
  });

  it("treats non-positive totalAmount as absent and uses text instead", () => {
    expect(money({ totalAmount: 0, totalText: "1.000,00 €" }).gross).toBe(1000);
    expect(money({ totalAmount: -5, totalText: "1.000,00 €" }).gross).toBe(1000);
  });

  it("returns an all-zero, coherent result when there is no amount at all", () => {
    const m = money({});
    expect(m).toMatchObject({ base: 0, vat: 0, gross: 0 });
    expect(m.vatRate).toBe(DEFAULT_VAT_RATE);
  });

  it("honours a custom vatRate and rejects a negative one (falls back to default)", () => {
    expect(money({ totalAmount: 1000, totalVatMode: "acrescer", vatRate: 0.06 }).vat).toBe(60);
    expect(money({ totalAmount: 1230, totalVatMode: "incluido", vatRate: -1 }).base).toBe(1000);
  });

  it("supports a 0% vat rate (base === gross, vat 0)", () => {
    const m = money({ totalAmount: 1000, totalVatMode: "acrescer", vatRate: 0 });
    expect(m).toMatchObject({ base: 1000, vat: 0, gross: 1000, vatRate: 0 });
  });

  it("lets an explicit totalVatMode override the text heuristic", () => {
    // Text says "+ IVA" (would detect acrescer) but structured mode wins.
    const m = money({
      totalAmount: 1230,
      totalVatMode: "incluido",
      totalText: "1.230,00 € + IVA",
    });
    expect(m.mode).toBe("incluido");
    expect(m.base).toBe(1000);
  });
});

describe("proposal-doc — resolveValidUntil", () => {
  const from = new Date("2026-07-20T00:00:00Z");
  const addDays = (d: Date, days: number) => {
    const x = new Date(d);
    x.setDate(x.getDate() + days);
    return x.toISOString().slice(0, 10);
  };

  it("honours an explicit yyyy-mm-dd validUntil verbatim", () => {
    expect(resolveValidUntil({ validUntil: "2026-12-31" }, from)).toBe("2026-12-31");
  });

  it("ignores a malformed validUntil and uses the day count", () => {
    expect(resolveValidUntil({ validUntil: "31/12/2026", validUntilDays: 10 }, from)).toBe(
      addDays(from, 10),
    );
  });

  it("defaults to DEFAULT_VALID_DAYS after 'from' when nothing is set", () => {
    expect(resolveValidUntil({}, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
  });

  it("honours a positive validUntilDays and floors a fractional one", () => {
    expect(resolveValidUntil({ validUntilDays: 7 }, from)).toBe(addDays(from, 7));
    expect(resolveValidUntil({ validUntilDays: 7.9 }, from)).toBe(addDays(from, 7));
  });

  it("falls back to the default for zero or negative day counts", () => {
    expect(resolveValidUntil({ validUntilDays: 0 }, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
    expect(resolveValidUntil({ validUntilDays: -5 }, from)).toBe(addDays(from, DEFAULT_VALID_DAYS));
  });

  it("rolls the month over correctly at a boundary", () => {
    expect(resolveValidUntil({ validUntilDays: 20 }, new Date("2026-01-20T00:00:00Z"))).toBe(
      "2026-02-09",
    );
  });
});

describe("proposal-doc — withProposalDefaults", () => {
  const base = (over: Partial<ProposalDoc> = {}): Parameters<typeof withProposalDefaults>[0] => ({
    ref: "PO Test",
    clientNames: "Maria & Zé",
    eventType: "Casamento",
    eventDate: "3 de julho de 2027",
    location: "Évora",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    totalLabel: "Total",
    totalText: "3.000,00 € + IVA",
    coverImages: [],
    ...over,
  });

  it("fills every boilerplate section when the doc omits them", () => {
    const doc = withProposalDefaults(base());
    expect(doc.notasImportantes).toEqual(DEFAULT_NOTAS_IMPORTANTES);
    expect(doc.incluido.length).toBeGreaterThan(0);
    expect(doc.naoIncluido.length).toBeGreaterThan(0);
    expect(doc.observacoesGerais.length).toBeGreaterThan(0);
    expect(doc.faseamento.length).toBeGreaterThan(0);
    expect(doc.cancelamento.length).toBeGreaterThan(0);
  });

  it("substitutes {DATA} and {CONVIDADOS} in the general conditions", () => {
    const doc = withProposalDefaults(base());
    const joined = doc.condicoesGerais.join("\n");
    expect(joined).toContain("3 de julho de 2027");
    expect(joined).toContain("150 pax");
    // No leftover placeholders anywhere.
    expect(joined).not.toContain("{DATA}");
    expect(joined).not.toContain("{CONVIDADOS}");
  });

  it("uses an em dash when eventDate / guests are empty strings", () => {
    const doc = withProposalDefaults(base({ eventDate: "", guests: "" }));
    const joined = doc.condicoesGerais.join("\n");
    expect(joined).not.toContain("{DATA}");
    expect(joined).not.toContain("{CONVIDADOS}");
    expect(joined).toContain("—");
  });

  it("still runs token substitution over a CUSTOM condicoesGerais array", () => {
    const doc = withProposalDefaults(
      base({ condicoesGerais: ["Evento em {DATA} para {CONVIDADOS}."] }),
    );
    expect(doc.condicoesGerais).toEqual(["Evento em 3 de julho de 2027 para 150 pax."]);
  });

  it("does not overwrite explicitly-provided boilerplate", () => {
    const custom = ["A minha nota"];
    const doc = withProposalDefaults(base({ notasImportantes: custom }));
    expect(doc.notasImportantes).toEqual(custom);
  });

  it("does not mutate the shared DEFAULT_CONDICOES_GERAIS constant", () => {
    const snapshot = [...DEFAULT_CONDICOES_GERAIS];
    withProposalDefaults(base());
    expect(DEFAULT_CONDICOES_GERAIS).toEqual(snapshot);
    // The template still carries the raw tokens for the next caller.
    expect(DEFAULT_CONDICOES_GERAIS.some((s) => s.includes("{DATA}"))).toBe(true);
  });
});
