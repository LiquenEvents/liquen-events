import { describe, it, expect } from "vitest";
import {
  DEFAULT_TERMS,
  TERMS_VERSION,
  termsToPlainText,
  termosPara,
  type TermsSection,
} from "./contract-terms";

describe("contract-terms — DEFAULT_TERMS invariants", () => {
  it("ships a non-trivial, complete set of sections", () => {
    expect(Array.isArray(DEFAULT_TERMS)).toBe(true);
    expect(DEFAULT_TERMS.length).toBe(9);
  });

  it("has no empty or whitespace-only heading or body", () => {
    for (const s of DEFAULT_TERMS) {
      expect(s.heading.trim().length).toBeGreaterThan(0);
      expect(s.body.trim().length).toBeGreaterThan(0);
      // No accidental leading/trailing whitespace baked into the text.
      expect(s.heading).toBe(s.heading.trim());
      expect(s.body).toBe(s.body.trim());
    }
  });

  it("numbers headings 1..9 in stable ascending order", () => {
    const numbers = DEFAULT_TERMS.map((s) => {
      const m = s.heading.match(/^(\d+)\./);
      expect(m, `heading "${s.heading}" must start with "<n>."`).not.toBeNull();
      return Number(m![1]);
    });
    expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("has unique headings and unique bodies (no copy/paste dup)", () => {
    expect(new Set(DEFAULT_TERMS.map((s) => s.heading)).size).toBe(DEFAULT_TERMS.length);
    expect(new Set(DEFAULT_TERMS.map((s) => s.body)).size).toBe(DEFAULT_TERMS.length);
  });

  it("keeps every body free of the section separator so the plain-text snapshot round-trips unambiguously", () => {
    // termsToPlainText joins sections with a blank line ("\n\n"); if a body
    // contained one, splitting a stored snapshot back into sections would drift.
    for (const s of DEFAULT_TERMS) {
      expect(s.body).not.toContain("\n\n");
      expect(s.heading).not.toContain("\n");
    }
  });

  it("uses a stable, dated TERMS_VERSION", () => {
    expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}$/);
  });

  /**
   * ── O PONTO 3 TEM DE DIZER SOBRE QUE VALOR É O SINAL ─────────────────────
   *
   * Decisão dela, 12/08/2026: o sinal é calculado sobre o total COM IVA. É o
   * que o sistema sempre facturou (`splitSinal(proposal.total, …)` sobre o
   * bruto), e é agora o que o contrato diz — porque enquanto não dizia, o
   * ponto 2 («aos valores apresentados acresce o IVA») empurrava a leitura
   * para a outra base, e as duas diferem em 169,74 € numa proposta de 2.460 €.
   *
   * Isto não guarda a frase à letra — guarda a obrigação de a haver.
   */
  it("says, in the payment section, that the deposit is calculated on the VAT-inclusive total", () => {
    const pagamento = DEFAULT_TERMS.find((s) => /^3\./.test(s.heading));
    expect(pagamento, "a secção de pagamento tem de existir").toBeDefined();
    expect(pagamento!.body).toMatch(/sinal de \d{1,2}%/i);
    expect(pagamento!.body).toMatch(/com IVA inclu/i);
  });
});

describe("contract-terms — termsToPlainText", () => {
  it("defaults to DEFAULT_TERMS and includes every heading and body", () => {
    const text = termsToPlainText();
    for (const s of DEFAULT_TERMS) {
      expect(text).toContain(s.heading);
      expect(text).toContain(s.body);
    }
  });

  it("separates sections with exactly one blank line and joins heading/body with a newline", () => {
    const text = termsToPlainText();
    const blocks = text.split("\n\n");
    expect(blocks.length).toBe(DEFAULT_TERMS.length);
    blocks.forEach((block, i) => {
      const [heading, ...bodyLines] = block.split("\n");
      expect(heading).toBe(DEFAULT_TERMS[i].heading);
      expect(bodyLines.join("\n")).toBe(DEFAULT_TERMS[i].body);
    });
  });

  it("does not add a trailing blank line or leading whitespace", () => {
    const text = termsToPlainText();
    expect(text).toBe(text.trim());
    expect(text.endsWith("\n")).toBe(false);
  });

  it("returns an empty string for an empty section list", () => {
    expect(termsToPlainText([])).toBe("");
  });

  it("serializes a single custom section without a trailing separator", () => {
    const one: TermsSection[] = [{ heading: "H", body: "B" }];
    expect(termsToPlainText(one)).toBe("H\nB");
  });

  it("preserves order and content for arbitrary custom sections", () => {
    const custom: TermsSection[] = [
      { heading: "A", body: "alpha" },
      { heading: "B", body: "beta" },
      { heading: "C", body: "gamma" },
    ];
    expect(termsToPlainText(custom)).toBe("A\nalpha\n\nB\nbeta\n\nC\ngamma");
  });

  it("passes empty heading/body straight through (no interpolation, no throw)", () => {
    expect(termsToPlainText([{ heading: "", body: "" }])).toBe("\n");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO TEM DE DIZER O SINAL QUE A FACTURA COBRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O sinal é editável por proposta e o produto inteiro já o respeita — o
 * faseamento do PDF, o livro de facturas, o painel de pagamentos, o portal e o
 * estúdio leem todos `depositPercentOf`. Estes termos eram o que faltava:
 * diziam «30%» à letra, e são a folha que o casal ACEITA. Numa proposta a 50%,
 * lia-se e aceitava-se um contrato a dizer 30% e recebia-se a seguir uma
 * factura de 50% — num evento de 12.300 €, 3.690 € escritos contra 6.150 €
 * cobrados.
 */
describe("os termos acompanham o sinal da proposta", () => {
  const ponto = (secs: TermsSection[], n: string) =>
    secs.find((s) => s.heading.startsWith(n))!.body;

  it("numa proposta a 50%, o pagamento diz 50% e o restante 50%", () => {
    const t = termosPara(50);
    expect(ponto(t, "3.")).toContain("sinal de 50% do total a pagar");
    expect(ponto(t, "3.")).toContain("O restante 50%");
    expect(ponto(t, "3.")).not.toContain("30%");
    expect(ponto(t, "4.")).toContain("O sinal de 50% destina-se");
  });

  it("sem percentagem, continua a ser a da casa — e igual ao que sempre esteve escrito", () => {
    expect(termosPara()).toEqual(DEFAULT_TERMS);
    expect(termosPara(30)).toEqual(DEFAULT_TERMS);
  });

  it("a indemnização por cancelamento NÃO acompanha o sinal", () => {
    // Os 70% do ponto 4 são outra coisa: o que o Estúdio tem direito a receber
    // num cancelamento tardio. É um número negociado, não o saldo.
    const t = termosPara(50);
    expect(ponto(t, "4.")).toContain("direito a receber 70% do valor total estipulado");
  });

  it("os pontos que não falam de dinheiro ficam exactamente iguais", () => {
    const t = termosPara(40);
    for (const s of DEFAULT_TERMS) {
      if (s.heading.startsWith("3.") || s.heading.startsWith("4.")) continue;
      expect(t.find((x) => x.heading === s.heading)!.body).toBe(s.body);
    }
  });

  it("uma percentagem absurda é contida em vez de escrever um disparate", () => {
    expect(ponto(termosPara(0), "3.")).toContain("sinal de 1%");
    expect(ponto(termosPara(140), "3.")).toContain("sinal de 99%");
    expect(ponto(termosPara(33.4), "3.")).toContain("sinal de 33%");
  });
});
