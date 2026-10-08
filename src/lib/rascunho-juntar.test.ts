import { describe, it, expect } from "vitest";
import { camposMudados, juntarRascunhos, mesmoValor } from "./rascunho-juntar";

/** Achado n.º 6: duas pessoas, campos diferentes — ganhava a última gravação
 *  inteira e o campo da outra desaparecia do rascunho. */
describe("rascunho-juntar", () => {
  const lido = { eventLocation: "Sintra", eventTime: "16h", clientNames: "Ana & Rui" };

  it("cada pessoa fica com o campo que mudou", () => {
    const ana = { ...lido, eventLocation: "Évora" };
    const cat = { ...lido, eventTime: "17h" };
    // A Ana grava primeiro (sem conflito); a Catarina grava a seguir.
    const { campos, base } = camposMudados(lido, cat);
    expect(campos).toEqual(["eventTime"]);
    const j = juntarRascunhos(ana, cat, campos, base);
    expect(j.doc).toEqual({ ...lido, eventLocation: "Évora", eventTime: "17h" });
    expect(j.conflitos).toEqual([]);
  });

  it("o mesmo campo pelas duas: fica o último, e diz-se", () => {
    const ana = { ...lido, eventLocation: "Évora" };
    const cat = { ...lido, eventLocation: "Porto" };
    const { campos, base } = camposMudados(lido, cat);
    const j = juntarRascunhos(ana, cat, campos, base);
    expect(j.doc.eventLocation).toBe("Porto");
    expect(j.conflitos).toEqual(["eventLocation"]);
  });

  it("as duas escreveram a mesma coisa: não é conflito", () => {
    const ana = { ...lido, eventLocation: "Évora" };
    const { campos, base } = camposMudados(lido, ana);
    expect(juntarRascunhos(ana, ana, campos, base).conflitos).toEqual([]);
  });

  it("apagar um campo também é uma mudança", () => {
    const { clientNames: _, ...semNomes } = lido;
    const { campos, base } = camposMudados(lido, semNomes);
    expect(campos).toEqual(["clientNames"]);
    const outro = { ...lido, eventTime: "18h" };
    const j = juntarRascunhos(outro, semNomes, campos, base);
    expect("clientNames" in j.doc).toBe(false);
    expect(j.doc.eventTime).toBe("18h");
  });

  it("um campo que aparece de novo e não existia na base", () => {
    const meu = { ...lido, eventDate: "2027-06-12" };
    const { campos, base } = camposMudados(lido, meu);
    expect(campos).toEqual(["eventDate"]);
    expect(base).toEqual({});
    expect(juntarRascunhos(lido, meu, campos, base).doc.eventDate).toBe("2027-06-12");
  });

  it("um campo que falta no servidor não desaparece da junção", () => {
    // Um rascunho parcial (ou de uma versão antiga) gravado por outro lado:
    // sem `serviceGroups`. Quem chega não mexeu nos Serviços, mas também não
    // os pode perder — sem eles o editor dos Serviços rebenta.
    const meu = { ...lido, serviceGroups: [{ title: "Flores", items: [] }], eventTime: "17h" };
    const { campos, base } = camposMudados({ ...lido, serviceGroups: meu.serviceGroups }, meu);
    expect(campos).toEqual(["eventTime"]);
    const parcial = { clientNames: lido.clientNames };
    const j = juntarRascunhos(parcial, meu, campos, base);
    expect(j.doc.serviceGroups).toEqual(meu.serviceGroups);
    expect(j.doc.eventTime).toBe("17h");
  });

  it("ausente e null são o mesmo valor", () => {
    expect(mesmoValor(undefined, null)).toBe(true);
    expect(mesmoValor([{ a: 1 }], [{ a: 1 }])).toBe(true);
    expect(mesmoValor("a", "b")).toBe(false);
  });
});
