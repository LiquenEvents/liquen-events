import { describe, it, expect } from "vitest";
import zlib from "node:zlib";
import { renderContractPdf } from "./contract-pdf";
import { termsToPlainText, DEFAULT_TERMS } from "./contract-terms";
import type { Contract } from "./contract-types";

/**
 * Adversarial coverage for the CONTRACT lifecycle & PDF — the legal-integrity
 * and robustness invariants of the e-acceptance evidence document.
 *
 * The contract PDF is a legal record: it must render the FROZEN terms snapshot
 * captured at acceptance (never re-derive live DEFAULT_TERMS, which would let a
 * later edit rewrite an already-signed contract), it must never leak degenerate
 * tokens ("undefined"/"NaN"/"Invalid Date"), and a pendente (unsigned) contract
 * must not fabricate acceptance evidence.
 */

/** Decode the drawn text out of a pdf-lib PDF (Flate streams, hex `<..> Tj`). */
function pdfText(pdf: Buffer): string {
  const raw = pdf.toString("latin1");
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let sm: RegExpExecArray | null;
  let ops = "";
  while ((sm = streamRe.exec(raw))) {
    try {
      ops += zlib.inflateSync(Buffer.from(sm[1], "latin1")).toString("latin1") + "\n";
    } catch {
      /* not a flate stream (e.g. the embedded PNG) — skip */
    }
  }
  // pdf-lib writes text as hex strings: `<48656C6C6F> Tj`.
  let out = "";
  const re = /<([0-9A-Fa-f]*)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ops))) {
    const hex = m[1];
    for (let i = 0; i + 1 < hex.length; i += 2)
      out += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
    out += "\n";
  }
  return out;
}

function accepted(over: Partial<Contract> = {}): Contract {
  return {
    id: "c-1",
    quoteId: "q-1",
    proposalId: "p-1",
    clientName: "Maria & Zé",
    clientEmail: "maria@example.com",
    termsVersion: "2026-01",
    termsSnapshot: termsToPlainText(),
    status: "aceite",
    createdAt: "2026-07-01T10:00:00.000Z",
    acceptedAt: "2026-07-02T14:32:00.000Z",
    acceptedName: "Maria Silva",
    acceptedIp: "203.0.113.7",
    ...over,
  };
}

describe("contract PDF — frozen e-acceptance evidence integrity", () => {
  it("renders the STORED terms snapshot verbatim, not live DEFAULT_TERMS (a later terms edit can't rewrite a signed contract)", async () => {
    // A contract signed under an OLD terms revision: its snapshot differs from
    // whatever DEFAULT_TERMS says today.
    const frozen = "1. Clausula Congelada\nEste texto foi aceite e nao pode mudar.";
    const pdf = await renderContractPdf(accepted({ termsSnapshot: frozen }));
    const text = pdfText(pdf);
    // The frozen wording is what appears…
    expect(text).toContain("Clausula Congelada");
    expect(text).toContain("nao pode mudar");
    // …and the CURRENT default terms wording does NOT bleed in.
    expect(text).not.toContain(DEFAULT_TERMS[0].body.slice(0, 24));
  });

  it("does not silently fall back to DEFAULT_TERMS when the snapshot is empty", async () => {
    const pdf = await renderContractPdf(accepted({ termsSnapshot: "" }));
    const text = pdfText(pdf);
    expect(text).toContain("Sem snapshot de termos guardado");
    expect(text).not.toContain(DEFAULT_TERMS[0].body.slice(0, 24));
    expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });
});

describe("contract PDF — degenerate/missing fields never surface bad tokens", () => {
  const cases: [string, Contract][] = [
    [
      "everything empty, garbage date, status aceite",
      accepted({
        id: "",
        quoteId: "",
        proposalId: "",
        clientName: "",
        clientEmail: "",
        termsVersion: "",
        termsSnapshot: "",
        createdAt: "not-a-real-date",
        acceptedAt: "also-garbage",
        acceptedName: undefined,
        acceptedIp: undefined,
      }),
    ],
    [
      "pendente with no acceptance fields",
      accepted({
        status: "pendente",
        acceptedAt: undefined,
        acceptedName: undefined,
        acceptedIp: undefined,
      }),
    ],
  ];
  for (const [name, c] of cases) {
    it(`no undefined/NaN/Invalid Date/€NaN — ${name}`, async () => {
      const pdf = await renderContractPdf(c);
      expect(pdf.subarray(0, 5).toString("latin1")).toBe("%PDF-");
      const text = pdfText(pdf);
      for (const bad of ["undefined", "NaN", "Invalid Date", "€NaN"]) {
        expect(text).not.toContain(bad);
      }
    });
  }
});

describe("contract PDF — a pendente (unsigned) contract fabricates no acceptance evidence", () => {
  it("shows the pending notice and omits the electronic-acceptance block even if stray signer data is present", async () => {
    // Defensive: even a pendente row carrying stray acceptedName/IP must not be
    // rendered as if it were signed.
    const pdf = await renderContractPdf(
      accepted({ status: "pendente", acceptedName: "Nao Assinou", acceptedIp: "9.9.9.9" }),
    );
    const text = pdfText(pdf);
    expect(text).toContain("ACEITA"); // "ACEITAÇÃO PENDENTE"
    expect(text).toContain("PENDENTE");
    expect(text).not.toContain("ACEITE ELETR"); // no "ACEITE ELETRÓNICO" evidence header
    expect(text).not.toContain("Nao Assinou");
  });
});
