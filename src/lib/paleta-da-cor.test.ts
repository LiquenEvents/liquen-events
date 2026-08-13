import { describe, it, expect } from "vitest";
import { contarPorPaleta, idDaPaleta, paletaDaCor } from "./paleta-da-cor";

describe("paletaDaCor", () => {
  it("põe os brancos e cremes em «branco», que é a paleta mais comum da casa", () => {
    for (const cor of ["#ffffff", "#f7f4ee", "#f0ece4", "#faf8f5"]) {
      expect(paletaDaCor(cor), cor).toBe("branco");
    }
  });

  it("põe cinzentos, pretos e apagados em «neutro»", () => {
    for (const cor of ["#808080", "#3a3a3a", "#0a0a0a", "#6b6560"]) {
      expect(paletaDaCor(cor), cor).toBe("neutro");
    }
  });

  it("um creme NÃO é terracotta", () => {
    // A saturação em HSL mente no cimo da escala: #f0ece4 mede s = 0,29, mais
    // do que o verde da marca, e não tem cor para o olho. Com um corte por
    // saturação caía na zona quente. Numa casa que quer CONTAR o terracotta do
    // catálogo, esse engano é a resposta ao contrário.
    expect(paletaDaCor("#f0ece4")).toBe("branco");
    expect(paletaDaCor("#faf8f5")).toBe("branco");
  });

  it("o verde da marca é verde, e não «neutro»", () => {
    // #4d6350 mede s = 0,13. Um piso de saturação demasiado alto punha a cor
    // da casa — e as folhagens, que são apagadas por natureza — em «neutro».
    expect(paletaDaCor("#4d6350")).toBe("verde");
  });

  it("não deixa um cinzento com resto de matiz virar «azul»", () => {
    // O erro clássico destas funções: o matiz existe matematicamente e não
    // existe para o olho.
    expect(paletaDaCor("#6e7276")).toBe("neutro");
  });

  it("lê os verdes, que é a outra metade do catálogo", () => {
    for (const cor of ["#3d5a40", "#4d6350", "#7a9a72"]) {
      expect(paletaDaCor(cor), cor).toBe("verde");
    }
  });

  it("lê azuis, amarelos e rosas", () => {
    expect(paletaDaCor("#1f6fd0")).toBe("azul");
    expect(paletaDaCor("#e8c33a")).toBe("amarelo");
    expect(paletaDaCor("#d98cb0")).toBe("rosa");
  });

  /**
   * A fronteira que interessa a esta casa: a missão diz «pouco terracotta»
   * como um dado do catálogo, e essa contagem só vale se as duas famílias não
   * se confundirem.
   */
  it("separa o terracotta queimado do laranja claro", () => {
    for (const cor of ["#c96f4a", "#b5643c", "#a0522d"]) {
      expect(paletaDaCor(cor), `${cor} devia ser terracotta`).toBe("terracotta");
    }
    for (const cor of ["#ff8c42", "#f59a3e"]) {
      expect(paletaDaCor(cor), `${cor} devia ser laranja`).toBe("laranja");
    }
  });

  it("devolve null ao que não é uma cor", () => {
    expect(paletaDaCor("terracotta")).toBeNull();
    expect(paletaDaCor("")).toBeNull();
  });
});

describe("idDaPaleta", () => {
  it("dá o identificador que a consulta da biblioteca já usa", () => {
    expect(idDaPaleta("terracotta")).toBe("paleta:terracotta");
  });
});

describe("contarPorPaleta", () => {
  it("conta, e devolve TAMBÉM as famílias a zero", () => {
    // O valor desta vista está nas células vazias: «muito branco e verde,
    // pouco terracotta». Uma lista que só mostra o que existe esconde
    // exactamente aquilo que se queria ver.
    const c = contarPorPaleta(["#ffffff", "#3d5a40", "#4d6350"]);
    expect(c.branco).toBe(1);
    expect(c.verde).toBe(2);
    expect(c.terracotta).toBe(0);
    expect(c.laranja).toBe(0);
  });

  it("põe à parte as fotos cuja cor ainda não se conhece", () => {
    // As carregadas antes de a cor existir. Contá-las como «neutro» inventava
    // um catálogo mais cinzento do que ele é.
    const c = contarPorPaleta(["#3d5a40", null, undefined, "lixo"]);
    expect(c.verde).toBe(1);
    expect(c.desconhecida).toBe(3);
  });
});
