import { describe, expect, it } from "vitest";
import { lerNumero } from "./numero-escrito";

/**
 * A regra partilhada pelos dois ecrãs que tinham o mesmo defeito. Aqui prende-se
 * o que ela decide; nos ecrãs prende-se o que se faz com a decisão.
 */

const preco = { min: 0, max: 20, nome: "preço do gasóleo", exemplo: "1,72" };

describe("o que dá um número", () => {
  it.each([
    ["1,72", 1.72],
    ["1.72", 1.72],
    ["2", 2],
    ["  2,5  ", 2.5],
    ["0", 0],
  ])("«%s» vale %s", (escrito, valor) => {
    expect(lerNumero(escrito, preco)).toEqual({ ok: true, valor });
  });
});

describe("o que não dá um número — e o que a frase diz que se faça", () => {
  it("letras: manda escrever só o número, e mostra um exemplo", () => {
    const r = lerNumero("abc", preco);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.porque).toMatch(/Escreve só o número.*1,72/);
  });

  it("a unidade colada ao valor não passa por número", () => {
    // «1,72 €» é o engano natural de quem tem o «€/litro» ao lado do campo.
    // Adivinhar unidades em cima de um preço que multiplica quilómetros é como
    // se chega a um valor errado sem ninguém reparar — diz-se o que fazer.
    const r = lerNumero("1,72 €", preco);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.porque).toMatch(/só o número/);
  });

  it("negativo: diz o mínimo pela positiva", () => {
    const r = lerNumero("-2,5", preco);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.porque).toBe("Não pode ser negativo — escreve 0 ou mais.");
  });

  it("acima do que o servidor aceita: diz o tecto, com vírgula", () => {
    const r = lerNumero("40", preco);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.porque).toMatch(/Não pode ser maior que 20/);
  });

  it("meia pessoa não é convidado nenhum", () => {
    const r = lerNumero("12,5", { min: 0, inteiro: true, exemplo: "80" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.porque).toMatch(/inteiro/);
  });

  it("infinito e notação estranha não passam", () => {
    expect(lerNumero("Infinity", preco).ok).toBe(false);
    expect(lerNumero("1,7,2", preco).ok).toBe(false);
  });
});

describe("o campo em branco", () => {
  /**
   * Onde o valor entra numa conta — o preço do gasóleo — o branco é um ERRO.
   * Não existe deslocação «sem preço de combustível»: apagar o campo é uma
   * edição a meio, e gravar o valor anterior por baixo era o defeito.
   */
  it("num número de que a conta precisa, é erro e diz o que escrever", () => {
    const r = lerNumero("   ", preco);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.porque).toMatch(/Escreve o preço do gasóleo.*1,72/);
  });

  /**
   * Onde o vazio é um estado legítimo do que se está a editar — um pedido que
   * entrou sem número de convidados — não há nada para gravar nem nada a
   * reclamar. `null` é «não mexer», e é explícito.
   */
  it("onde o vazio é um estado real, vale como «não há nada a gravar»", () => {
    expect(lerNumero("", { min: 0, vazioVale: true })).toEqual({ ok: true, valor: null });
  });
});
