import { describe, it, expect } from "vitest";
import { enderecoDaRotaDaFoto } from "./endereco-da-foto";

/**
 * O endereço da rota que fabrica uma derivada. O que se prende aqui é a
 * `marca`: sem ela o endereço só diz o LUGAR da fotografia no documento, e a
 * rota não tem como saber se pode guardá-la no telemóvel do casal por um dia.
 * A razão longa está no ficheiro ao lado.
 */
describe("o endereço da rota da fotografia", () => {
  it("leva a marca, para o endereço dizer QUAL fotografia é", () => {
    expect(enderecoDaRotaDaFoto("tk", { id: "b0f2", marca: "abc123" })).toBe(
      "/api/proposta/tk/foto/b0f2?v=abc123",
    );
  });

  it("uma fotografia trocada é um endereço NOVO — é isto que fecha o defeito", () => {
    // O mesmo lugar (`b0f2`) no mesmo link, depois de ela rever o board. Se os
    // dois endereços fossem iguais, o navegador servia o antigo da cache.
    const antes = enderecoDaRotaDaFoto("tk", { id: "b0f2", marca: "aaaaaaaaaaaa" });
    const depois = enderecoDaRotaDaFoto("tk", { id: "b0f2", marca: "bbbbbbbbbbbb" });
    expect(depois).not.toBe(antes);
  });

  it("sem marca, o endereço continua a funcionar — sem prometer nada", () => {
    expect(enderecoDaRotaDaFoto("tk", { id: "b0f2" })).toBe("/api/proposta/tk/foto/b0f2");
  });

  it("o token e o id vão escapados: nenhum deles é de confiança", () => {
    expect(enderecoDaRotaDaFoto("a/b", { id: "c d", marca: "x&y" })).toBe(
      "/api/proposta/a%2Fb/foto/c%20d?v=x%26y",
    );
  });
});
