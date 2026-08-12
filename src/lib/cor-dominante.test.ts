import { describe, it, expect } from "vitest";
import {
  corDominanteDePixeis,
  corMedia,
  desviosDaPaleta,
  distancia,
  fotosQueDestoam,
  hex,
  hsl,
  lerHex,
  ordemPorCor,
  LIMIAR_DE_AVISO,
} from "./cor-dominante";

/** Píxeis RGBA a partir de uma lista de cores repetidas n vezes. */
function pixeis(...blocos: [cor: [number, number, number], vezes: number][]): number[] {
  const out: number[] = [];
  for (const [[r, g, b], vezes] of blocos) {
    for (let i = 0; i < vezes; i++) out.push(r, g, b, 255);
  }
  return out;
}

describe("hex e lerHex", () => {
  it("dão a volta sem perder nada", () => {
    expect(hex(77, 99, 80)).toBe("#4d6350");
    expect(lerHex("#4d6350")).toEqual({ r: 77, g: 99, b: 80 });
  });

  it("arredondam e prendem aos limites", () => {
    expect(hex(-10, 300, 127.6)).toBe("#00ff80");
  });

  it("recusam o que não é uma cor", () => {
    expect(lerHex("verde")).toBeNull();
    expect(lerHex("#abc")).toBeNull();
    expect(lerHex("")).toBeNull();
  });
});

describe("corDominanteDePixeis", () => {
  it("devolve a cor que mais aparece, não a média", () => {
    // Dois terços de verde escuro e um terço de branco. A média seria um verde
    // pálido que não está na fotografia; o que se quer é o verde.
    const cor = corDominanteDePixeis(pixeis([[40, 70, 45], 200], [[255, 255, 255], 100]));
    const rgb = lerHex(cor!)!;
    expect(rgb.g).toBeGreaterThan(rgb.r);
    expect(rgb.g).toBeGreaterThan(rgb.b);
    expect(rgb.g).toBeLessThan(120);
  });

  it("faz a média DENTRO da caixa vencedora, e não devolve o centro dela", () => {
    // Duas cores vizinhas que caem na mesma caixa: a resposta é o ponto entre
    // elas, o que impede a cor de saltar em degraus.
    const cor = corDominanteDePixeis(pixeis([[10, 10, 10], 1], [[20, 20, 20], 1]));
    expect(cor).toBe("#0f0f0f");
  });

  it("ignora o que é transparente", () => {
    // Um recorte: metade dos píxeis a zero e transparentes. Contá-los daria
    // preto a toda a gente.
    const dados = [255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    expect(corDominanteDePixeis(dados)).toBe("#ff0000");
  });

  it("devolve null quando não há nada que se aproveite", () => {
    expect(corDominanteDePixeis([])).toBeNull();
    expect(corDominanteDePixeis([0, 0, 0, 0])).toBeNull();
  });

  it("é estável: a mesma fotografia dá sempre a mesma cor", () => {
    const dados = pixeis([[12, 34, 56], 5], [[200, 190, 180], 5]);
    const uma = corDominanteDePixeis(dados);
    expect(corDominanteDePixeis(dados)).toBe(uma);
    expect(corDominanteDePixeis([...dados])).toBe(uma);
  });
});

describe("hsl", () => {
  it("lê o matiz das primárias", () => {
    expect(Math.round(hsl("#ff0000")!.h)).toBe(0);
    expect(Math.round(hsl("#00ff00")!.h)).toBe(120);
    expect(Math.round(hsl("#0000ff")!.h)).toBe(240);
  });

  it("dá saturação zero aos cinzentos", () => {
    expect(hsl("#808080")!.s).toBe(0);
  });
});

describe("distancia", () => {
  it("é zero entre uma cor e ela própria", () => {
    expect(distancia("#4d6350", "#4d6350")).toBe(0);
  });

  it("afasta matizes fortes e opostos", () => {
    expect(distancia("#ff0000", "#00ffff")).toBeGreaterThan(LIMIAR_DE_AVISO);
  });

  it("NÃO afasta dois pouco saturados só por terem matizes diferentes", () => {
    // Um creme e um cinzento-rosa: matizes distantes, mas nenhum tem cor que
    // chegue para destoar de uma página.
    expect(distancia("#f0ece4", "#efe6e6")).toBeLessThan(LIMIAR_DE_AVISO);
  });

  it("nota o claro contra o escuro, mas não chega para avisar", () => {
    // De propósito: uma página com uma foto clara e outra escura é uma página
    // normal. Só a luminosidade nunca pode disparar o aviso — o que o dispara é
    // o MATIZ. Registar alguma distância continua a servir o «organizar
    // automaticamente», que usa isto para encadear claros com claros.
    const d = distancia("#ffffff", "#111111");
    expect(d).toBeGreaterThan(0.1);
    expect(d).toBeLessThan(LIMIAR_DE_AVISO);
  });
});

describe("corMedia", () => {
  it("é o centro de gravidade", () => {
    expect(corMedia(["#000000", "#ffffff"])).toBe("#808080");
  });

  it("ignora o que não é cor, e devolve null quando não sobra nada", () => {
    expect(corMedia(["lixo", "#ffffff"])).toBe("#ffffff");
    expect(corMedia([])).toBeNull();
  });
});

describe("desviosDaPaleta", () => {
  it("mede cada foto contra as OUTRAS, não contra todas", () => {
    // Se a foto que destoa entrasse na sua própria referência, puxava a média
    // para si e escondia-se.
    const verdes = ["#3d5a40", "#41613f", "#3a5544", "#44603d"];
    const desvios = desviosDaPaleta([...verdes, "#1f6fd0"]);
    expect(desvios[4]!).toBeGreaterThan(desvios[0]!);
  });

  it("cala-se quando não há paleta que chegue para comparar", () => {
    expect(desviosDaPaleta(["#3d5a40", "#41613f"])).toEqual([null, null]);
  });

  it("devolve null para as fotos sem cor conhecida", () => {
    const d = desviosDaPaleta(["#3d5a40", null, "#41613f", "#3a5544", undefined]);
    expect(d[1]).toBeNull();
    expect(d[4]).toBeNull();
    expect(d[0]).not.toBeNull();
  });
});

describe("fotosQueDestoam", () => {
  it("aponta o azul no meio dos verdes", () => {
    const cores = ["#3d5a40", "#41613f", "#3a5544", "#44603d", "#1f6fd0"];
    expect(fotosQueDestoam(cores)).toEqual([4]);
  });

  it("não se queixa de uma página coerente", () => {
    // Uma página de verdes e cremes, que é o caso comum e não é um problema.
    expect(fotosQueDestoam(["#3d5a40", "#41613f", "#e8e2d4", "#efe8dc", "#3a5544"])).toEqual([]);
  });

  it("aponta os dois intrusos, do que mais destoa para o que menos", () => {
    // Seis verdes chegam para a paleta se aguentar sozinha: com só três, dois
    // intrusos de matizes diferentes puxavam a média cada um para seu lado e
    // escondiam-se um ao outro.
    const cores = [
      "#3d5a40",
      "#41613f",
      "#3a5544",
      "#44603d",
      "#3e5b42",
      "#425f41",
      "#1f6fd0",
      "#d02f2f",
    ];
    const fora = fotosQueDestoam(cores);
    expect(fora).toEqual([6, 7]);
    const desvios = desviosDaPaleta(cores);
    expect(desvios[fora[0]]!).toBeGreaterThanOrEqual(desvios[fora[1]]!);
  });

  it("cala-se numa página só de cremes, onde os matizes são distantes e fracos", () => {
    expect(fotosQueDestoam(["#f0ece4", "#efe6e6", "#eae4d8", "#f2ece2"])).toEqual([]);
  });
});

describe("ordemPorCor", () => {
  it("é uma permutação: não perde nem inventa fotos", () => {
    const cores = ["#3d5a40", "#e8e2d4", "#1f6fd0", "#41613f", "#efe8dc"];
    const ordem = ordemPorCor(cores);
    expect([...ordem].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4]);
  });

  it("põe as parecidas lado a lado", () => {
    const cores = ["#3d5a40", "#e8e2d4", "#41613f", "#efe8dc"];
    const ordem = ordemPorCor(cores);
    // Os dois verdes (0 e 2) ficam vizinhos, e os dois cremes (1 e 3) também.
    const pos = new Map(ordem.map((idx, i) => [idx, i]));
    expect(Math.abs(pos.get(0)! - pos.get(2)!)).toBe(1);
    expect(Math.abs(pos.get(1)! - pos.get(3)!)).toBe(1);
  });

  it("manda as fotos sem cor para o fim, pela ordem em que estavam", () => {
    const ordem = ordemPorCor(["#3d5a40", null, "#41613f", undefined]);
    expect(ordem.slice(-2)).toEqual([1, 3]);
  });

  it("não mexe no que não dá para arrumar", () => {
    expect(ordemPorCor([])).toEqual([]);
    expect(ordemPorCor(["#3d5a40"])).toEqual([0]);
    expect(ordemPorCor([null, null])).toEqual([0, 1]);
  });

  it("é determinista", () => {
    const cores = ["#3d5a40", "#e8e2d4", "#1f6fd0", "#41613f", "#efe8dc"];
    expect(ordemPorCor(cores)).toEqual(ordemPorCor(cores));
  });
});
