import { describe, it, expect } from "vitest";
import { CEREMONY_TYPES, ceremonyTypeLabel } from "./data";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ENCURTAR UM FORMULÁRIO NÃO É APAGAR ARQUIVO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Retira esta opção», sobre a «Civil e religiosa». Saiu da lista que o
 * formulário oferece.
 *
 * Mas o `ceremonyType` fica gravado no pedido pelo ID, e o `ceremonyTypeLabel`
 * devolve VAZIO para um id que não conheça. Apagá-la da tabela punha em branco
 * a linha «Cerimónia» de todos os pedidos que já a tinham escolhido — e um
 * pedido é a resposta de um casal: o que eles disseram não deixa de ser
 * verdade por nós termos mudado o formulário depois.
 *
 * Conhecida para LER, desconhecida para ESCOLHER. É essa a diferença, e é ela
 * que este teste guarda — nas duas direcções, porque uma sozinha não chega:
 * sem a primeira a opção volta ao formulário, sem a segunda o arquivo apaga-se.
 */
describe("a cerimónia que saiu do formulário", () => {
  it("já não se pode escolher", () => {
    expect(
      CEREMONY_TYPES.map((c) => c.id),
      "a «Civil e religiosa» voltou às opções do formulário",
    ).not.toContain("civil-religiosa");
    // E as três que ficam continuam lá — senão isto passava com a lista vazia.
    expect(CEREMONY_TYPES.map((c) => c.id)).toEqual(["civil", "religiosa", "simbolica"]);
  });

  it("mas os pedidos que já a escolheram continuam a dizê-lo", () => {
    expect(
      ceremonyTypeLabel("civil-religiosa"),
      "um pedido antigo passou a mostrar a cerimónia em branco",
    ).toBe("Civil e religiosa");
    expect(ceremonyTypeLabel("civil-religiosa", "en")).toBe("Civil and religious");
  });

  it("e um id que nunca existiu continua a não dizer nada", () => {
    // O controlo do teste de cima: se a função passasse a inventar rótulos, o
    // outro teste passava por engano.
    expect(ceremonyTypeLabel("nunca-existiu")).toBe("");
  });
});
