import { describe, it, expect } from "vitest";
import type { Proposal, Quote } from "./types";
import { comoSeDiz, ondeJaFoi } from "./fotos-repetidas";

let n = 0;
function p(quoteId: string, origens: string[], over: Partial<Proposal> = {}): Proposal {
  n += 1;
  return {
    id: `p${n}`,
    quoteId,
    clientName: "Ana e Rui",
    clientEmail: "a@b.pt",
    currency: "EUR",
    lineItems: [],
    vatRate: 0.23,
    subtotal: 0,
    vat: 0,
    total: 0,
    status: "enviada",
    createdAt: "2026-01-01T00:00:00.000Z",
    sentAt: "2026-01-01T00:00:00.000Z",
    doc: { fotosDeBiblioteca: origens } as Proposal["doc"],
    ...over,
  };
}

const q = (id: string, over: Partial<Quote> = {}): Quote =>
  ({ id, name: "Ana e Rui", date: "2026-09-12", location: "Évora", ...over }) as Quote;

describe("onde é que a foto já foi", () => {
  it("diz o casal, a data e o sítio", () => {
    const r = ondeJaFoi("agora", [p("q1", ["temas/arco.jpg"])], [q("q1")]);
    expect(r).toHaveLength(1);
    expect(r[0].origem).toBe("temas/arco.jpg");
    expect(r[0].usos[0]).toMatchObject({
      cliente: "Ana e Rui",
      data: "2026-09-12",
      local: "Évora",
    });
  });

  it("o pedido actual não conta como repetição de si próprio", () => {
    // Uma proposta em revisão reencontra as suas próprias fotos. Se contassem,
    // a segunda versão de qualquer proposta abria com um aviso sobre si mesma.
    expect(ondeJaFoi("q1", [p("q1", ["temas/arco.jpg"])], [q("q1")])).toEqual([]);
  });

  it("um rascunho ainda não foi a lado nenhum", () => {
    const r = ondeJaFoi("agora", [p("q1", ["temas/arco.jpg"], { status: "rascunho" })], [q("q1")]);
    expect(r).toEqual([]);
  });

  it("a mesma foto em dois casamentos junta os dois, do mais recente para trás", () => {
    const r = ondeJaFoi(
      "agora",
      [
        p("q1", ["temas/arco.jpg"], { clientName: "Antigos", sentAt: "2025-01-01" }),
        p("q2", ["temas/arco.jpg"], { clientName: "Recentes", sentAt: "2026-06-01" }),
      ],
      [q("q1"), q("q2")],
    );
    expect(r[0].usos.map((u) => u.cliente)).toEqual(["Recentes", "Antigos"]);
  });

  it("a mais repetida vem primeiro", () => {
    const r = ondeJaFoi(
      "agora",
      [p("q1", ["temas/a.jpg", "temas/b.jpg"]), p("q2", ["temas/b.jpg"]), p("q3", ["temas/b.jpg"])],
      [q("q1"), q("q2"), q("q3")],
    );
    expect(r[0].origem).toBe("temas/b.jpg");
    expect(r[0].usos).toHaveLength(3);
  });

  it("propostas antigas sem o campo não partem nada", () => {
    const semCampo = p("q1", []);
    semCampo.doc = {} as Proposal["doc"];
    expect(ondeJaFoi("agora", [semCampo], [q("q1")])).toEqual([]);
  });
});

describe("a frase da marca", () => {
  it("junta o casal à data, e conta os outros", () => {
    const [f] = ondeJaFoi(
      "agora",
      [
        p("q1", ["temas/arco.jpg"], { clientName: "Ana e Rui", sentAt: "2026-06-01" }),
        p("q2", ["temas/arco.jpg"], { clientName: "Outros", sentAt: "2025-06-01" }),
      ],
      [q("q1"), q("q2")],
    );
    const frase = comoSeDiz(f);
    expect(frase).toContain("Ana e Rui");
    expect(frase).toContain("2026");
    // O "+1" diz que houve mais sem encher a legenda de uma miniatura.
    expect(frase).toContain("(+1)");
  });

  it("sem data do casamento diz só o casal", () => {
    const [f] = ondeJaFoi("agora", [p("q1", ["temas/arco.jpg"])], [q("q1", { date: "" })]);
    expect(comoSeDiz(f)).toBe("Ana e Rui");
  });
});
