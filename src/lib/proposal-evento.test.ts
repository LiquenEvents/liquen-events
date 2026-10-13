import { describe, expect, it } from "vitest";
import { eCasamento, pedidoECasamento, tipoDoEventoDoPedido } from "./proposal-evento";

describe("é um casamento?", () => {
  it.each([
    "Casamento",
    "casamento",
    "CASAMENTO civil",
    "Wedding",
    "Matrimónio",
    "Renovação de votos",
    "Bodas de ouro",
    "Copo d'água",
  ])("«%s» é", (t) => expect(eCasamento(t)).toBe(true));
  it.each([
    "Halloween",
    "Decoração de restaurante",
    "Jantar",
    "Festa",
    "Evento Corporativo",
    "Aniversário",
    "Batizado",
    "Jantar de Natal com votos de boas festas",
    "",
    undefined,
    null,
  ])("«%s» não é", (t) => expect(eCasamento(t)).toBe(false));
});

describe("o tipo com que uma proposta nova abre", () => {
  it("o nome do tipo do pedido", () => {
    expect(tipoDoEventoDoPedido({ eventType: "casamentos", category: "particulares" })).toBe(
      "Casamento",
    );
    expect(tipoDoEventoDoPedido({ eventType: "jantares_empresa", category: "empresas" })).toBe(
      "Jantar de Empresa",
    );
  });
  it("um pedido «Outro» sem nome abre VAZIO — nunca «Casamento»", () => {
    expect(tipoDoEventoDoPedido({ eventType: null, category: "particulares" })).toBe("");
  });
  it("com o nome que o cliente deu ao evento", () => {
    expect(
      tipoDoEventoDoPedido({
        eventType: null,
        category: "particulares",
        eventName: " Halloween no restaurante ",
      }),
    ).toBe("Halloween no restaurante");
  });
  it("uma empresa sem tipo abre como «Evento Corporativo»", () => {
    expect(tipoDoEventoDoPedido({ eventType: null, category: "empresas" })).toBe(
      "Evento Corporativo",
    );
  });
  it("o pedido é um casamento só pelo tipo que o cliente escolheu", () => {
    expect(pedidoECasamento({ eventType: "casamentos" })).toBe(true);
    expect(pedidoECasamento({ eventType: null })).toBe(false);
  });
});
