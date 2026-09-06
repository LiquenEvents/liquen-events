import { describe, expect, it } from "vitest";
import { referenciaCurta } from "./referencia-curta";

/**
 * A referência de um pedido é um nome de máquina de trinta caracteres. Onde se
 * mostra inteira, ocupa mais espaço do que o nome do casal ao lado — foi o que
 * a Catarina viu na coluna «Pedido» dos Contratos: «isto assim fica todo
 * estranho».
 *
 * O que se corta é o MEIO. Nunca as pontas, e é isso que estes casos guardam:
 * o princípio diz de que casa é e quando foi criado, o fim é o que distingue
 * dois pedidos do mesmo dia. Cortar por qualquer uma das pontas fazia duas
 * referências diferentes parecerem a mesma — que num sítio onde ela lê a
 * referência ao telefone é pior do que não a mostrar.
 */
describe("a referência encurta pelo meio, nunca pelas pontas", () => {
  it("guarda o princípio e os quatro últimos", () => {
    expect(referenciaCurta("LIQ-MT7CWVWU-C4BFD3877E978CFF")).toBe("LIQ-MT7CWVWU…8CFF");
  });

  it("duas referências do mesmo dia continuam a distinguir-se", () => {
    // Mesmo prefixo, mesma data — só o fim as separa. Se o corte fosse pelo
    // fim, as duas liam-se igual e ela ligava ao casal errado.
    const a = referenciaCurta("LIQ-MRR1L78R-438B649E86343C27");
    const b = referenciaCurta("LIQ-MRR1L78R-438B649E86341A9F");
    expect(a).not.toBe(b);
  });

  it("uma referência já curta fica como está", () => {
    expect(referenciaCurta("curto")).toBe("curto");
  });

  it("uma referência sem hífenes também encurta", () => {
    expect(referenciaCurta("abcdefghijklmno")).toBe("abcdefgh…lmno");
  });
});
