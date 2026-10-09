import { describe, expect, it } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { blocosFixosNaLingua, preencherNaLingua } from "./proposal-doc-textos";

/**
 * AS CONDIÇÕES QUE CONGELAVAM — A4-004, A4-005, A4-010 (caça de bugs)
 *
 * As Condições Gerais são GRAVADAS já preenchidas. Uma proposta gravada antes
 * de haver data ficava com a redacção «válida para a data que vier a ser
 * confirmada», e essa frase já não tem marcador para voltar a ser trocada: a
 * capa dizia «12 de setembro de 2026» e as condições, três páginas à frente,
 * o contrário. Numa proposta inglesa, a mesma congelação fazia a comparação
 * com o texto da casa falhar — e o bloco inteiro saía em português.
 */

function gravadaSemData(): ProposalDoc {
  // O que fica gravado quando a proposta é guardada antes de haver data e
  // número: as duas cláusulas na redacção «sem dado».
  return withProposalDefaults({ eventDate: "", guests: "" } as Partial<ProposalDoc> as ProposalDoc);
}

describe("a redacção «sem data» volta atrás quando a data chega (A4-004)", () => {
  it("a cláusula do dia passa a dizer o dia", () => {
    const gravada = gravadaSemData();
    expect(gravada.condicoesGerais.join("\n")).toContain("que vier a ser confirmada por escrito");

    const comData = withProposalDefaults({
      ...gravada,
      eventDate: "12 de setembro de 2026",
      guests: "120 pax",
    });
    const texto = comData.condicoesGerais.join("\n");
    expect(texto).toContain("a realizar no dia 12 de setembro de 2026.");
    expect(texto).toContain("o número de 120 pax convidados");
    expect(texto).not.toContain("que vier a ser confirmada por escrito");
    expect(texto).not.toContain("que vier a ser confirmado por escrito");
  });

  it("e sem o dado continua a dizer «que vier a ser confirmada» — não volta para trás sozinha", () => {
    const gravada = gravadaSemData();
    const outraVez = withProposalDefaults({ ...gravada });
    expect(outraVez.condicoesGerais.join("\n")).toContain("que vier a ser confirmada por escrito");
  });
});

describe("uma proposta inglesa gravada sem data sai em inglês quando a data chega (A4-005)", () => {
  it("as Condições Gerais vêm da casa, em inglês", () => {
    const gravada = gravadaSemData();
    const doc = withProposalDefaults({
      ...gravada,
      eventDate: "12 de setembro de 2026",
      guests: "120 pax",
    });
    const en = blocosFixosNaLingua(doc, "en").condicoesGerais.join("\n");
    expect(en).toContain("VAT at the applicable legal rate");
    expect(en).not.toContain("Aos valores acresce o IVA");
  });
});

describe("o «a definir» numa cláusula inglesa (A4-010)", () => {
  it("uma condição escrita por ela, sem o dado, diz «to be confirmed» em inglês", () => {
    const doc = withProposalDefaults({
      eventDate: "",
      guests: "",
      condicoesGerais: ["The quote covers {CONVIDADOS} guests."],
    } as Partial<ProposalDoc> as ProposalDoc);
    expect(blocosFixosNaLingua(doc, "en").condicoesGerais).toEqual([
      "The quote covers to be confirmed guests.",
    ]);
    expect(preencherNaLingua("On {DATA}.", doc, "en")).toBe("On to be confirmed.");
    expect(preencherNaLingua("No dia {DATA}.", doc, "pt")).toBe("No dia a definir.");
  });
});
