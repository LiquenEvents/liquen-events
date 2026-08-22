import { describe, it, expect } from "vitest";
import { fraccaoDaBarra } from "./fraccao-da-barra";

describe("fraccaoDaBarra", () => {
  it("é a fracção quando a fracção existe", () => {
    expect(fraccaoDaBarra(1, 4)).toBe(0.25);
    expect(fraccaoDaBarra(0, 7)).toBe(0);
    expect(fraccaoDaBarra(7, 7)).toBe(1);
  });

  it("uma lista vazia dá barra vazia, e não barra cheia", () => {
    // O defeito que esta função existe para não deixar acontecer: `scaleX(NaN)`
    // é ignorado pelo browser e deixa o traço com a largura de repouso, que é
    // a barra INTEIRA. Num painel de pagamentos, «tudo recebido».
    expect(fraccaoDaBarra(0, 0)).toBe(0);
    expect(fraccaoDaBarra(3, 0)).toBe(0);
  });

  it("nada sai fora do traço", () => {
    // Uma marcação a mais do que os itens (aconteceu na checklist, com a fila
    // offline a aplicar duas vezes) não pode desenhar uma barra maior do que a
    // caixa dela.
    expect(fraccaoDaBarra(9, 4)).toBe(1);
    expect(fraccaoDaBarra(-3, 4)).toBe(0);
  });

  it("um número que não é número dá zero", () => {
    expect(fraccaoDaBarra(Number.NaN, 10)).toBe(0);
    expect(fraccaoDaBarra(10, Number.NaN)).toBe(0);
  });
});
