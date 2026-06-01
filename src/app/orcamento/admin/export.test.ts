import { describe, it, expect } from "vitest";
import { toCsv, quotesToCsvRows } from "./export";
import type { Quote } from "../types";

describe("toCsv", () => {
  it("joins cells with ; and rows with CRLF, prefixed by a UTF-8 BOM", () => {
    const out = toCsv([
      ["a", "b"],
      ["c", "d"],
    ]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toBe("﻿a;b\r\nc;d");
  });

  it("quotes cells containing the separator, quotes or newlines", () => {
    const out = toCsv([["plain", "has;semi", 'has"quote', "has\nnewline"]]);
    expect(out).toBe('﻿plain;"has;semi";"has""quote";"has\nnewline"');
  });

  it("renders numbers and empty values", () => {
    expect(toCsv([[1, "", 0]])).toBe("﻿1;;0");
  });
});

describe("quotesToCsvRows", () => {
  const quote = {
    id: "LQ-001",
    submittedAt: "2026-01-15T10:00:00.000Z",
    status: "aceite",
    name: "Maria",
    email: "maria@example.com",
    phone: "910000000",
    company: "ACME",
    nif: "500000000",
    category: "empresas",
    eventType: "conferencias",
    packageTier: "completo",
    guests: 120,
    date: "2026-06-20",
    location: "Évora",
    duration: 8,
    quotedPrice: 15000,
    priceBreakdown: { total: 14000 },
  } as unknown as Quote;

  it("returns a header row plus one row per quote", () => {
    const rows = quotesToCsvRows([quote, quote]);
    expect(rows).toHaveLength(3);
    expect(rows[0][0]).toBe("ID");
  });

  it("maps core fields onto the data row", () => {
    const [, row] = quotesToCsvRows([quote]);
    expect(row).toContain("LQ-001");
    expect(row).toContain("Maria");
    expect(row).toContain("maria@example.com");
    expect(row).toContain(120);
    expect(row).toContain(15000);
  });

  it("is safe with missing optional fields", () => {
    const minimal = {
      id: "LQ-002",
      submittedAt: "2026-02-01T10:00:00.000Z",
      status: "pendente",
      name: "Sem Empresa",
      email: "x@y.pt",
      phone: "",
      guests: 0,
    } as unknown as Quote;
    const rows = quotesToCsvRows([minimal]);
    expect(rows).toHaveLength(2);
    // Should not throw and should still produce a valid CSV string.
    expect(typeof toCsv(rows)).toBe("string");
  });
});
