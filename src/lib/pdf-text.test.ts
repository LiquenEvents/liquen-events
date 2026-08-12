import { describe, it, expect } from "vitest";
import { winAnsiSafe, textoParaFonte } from "./pdf-text";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS PONTOS DE INTERROGAÇÃO NAS LEGENDAS DOS MOOD BOARDS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela abriu uma proposta e viu «?» nos textos por baixo das imagens. O texto
 * que ela escreveu estava certo; quem o estragava era o gerador.
 *
 * Duas causas, e as duas estão fixadas aqui:
 *
 *  1. TEXTO COLADO traz passageiros invisíveis — espaços estreitos, espaços de
 *     largura zero, a marca de ordem de bytes, hífenes que não quebram. No
 *     ecrã não se vêem; no papel viravam um «?» cada um.
 *
 *  2. O DOCUMENTO DA PROPOSTA EMBEBE A SUA PRÓPRIA FONTE e mesmo assim passava
 *     tudo pelo filtro do WinAnsi, que é a codificação das fontes-PADRÃO. Isso
 *     castigava caracteres que a fonte embebida desenha perfeitamente.
 */

/** Uma fonte embebida de mentira, com a mesma forma por dentro que o pdf-lib
 *  dá às reais — é por aí que se lhe pergunta o que ela sabe desenhar. */
function fonteQueSabe(cobre: (cp: number) => boolean) {
  return { embedder: { font: { hasGlyphForCodePoint: cobre } } };
}

/** O que a Carlito (a fonte do documento) cobre, na parte que interessa aqui:
 *  todo o latino, mais a pontuação tipográfica — as duas riscas e os apóstrofos
 *  curvos. Não cobre emoji. */
const LATINA = fonteQueSabe(
  (cp) => cp < 0x0250 || cp === 0x2013 || cp === 0x2014 || cp === 0x2018 || cp === 0x2019,
);

describe("o que vem colado do Word e do Canva", () => {
  it("os invisíveis desaparecem em vez de virarem «?»", () => {
    // Exactamente o que sai de um copiar-colar: espaço estreito antes do «na»,
    // espaço de largura zero no meio de «mesas», marca de ordem de bytes ao
    // princípio e hífen que não quebra em «t-lights».
    const colado = "﻿Apontamentos florais nas me​sas, com t‑lights";
    expect(textoParaFonte(LATINA, colado)).toBe("Apontamentos florais nas mesas, com t-lights");
    expect(winAnsiSafe(colado)).toBe("Apontamentos florais nas mesas, com t-lights");
  });

  it("os acentos portugueses passam nos dois caminhos, venham como vierem", () => {
    // A mesma palavra nas duas formas do Unicode: composta e decomposta. Quem
    // escreve não sabe qual está a produzir, e a diferença não pode chegar ao
    // papel.
    const composta = "Decoração";
    const decomposta = "Decoração";
    for (const palavra of [composta, decomposta]) {
      expect(textoParaFonte(LATINA, palavra)).toBe("Decoração");
      expect(winAnsiSafe(palavra)).toBe("Decoração");
    }
  });

  it("nenhum «?» sobra num texto que a fonte sabe desenhar", () => {
    const legenda = "Arranjos florais — jarras, taças e t‐lights​";
    const saida = textoParaFonte(LATINA, legenda);
    expect(saida).not.toContain("?");
    expect(saida).toBe("Arranjos florais — jarras, taças e t-lights");
  });
});

describe("perguntar à fonte em vez de assumir o WinAnsi", () => {
  it("o que a fonte embebida desenha passa, mesmo fora do WinAnsi", () => {
    // «Ω» não existe no CP1252. Numa fonte que o tem, não há razão nenhuma
    // para o perder — era isto que o filtro antigo fazia.
    const grega = fonteQueSabe(() => true);
    expect(textoParaFonte(grega, "Tons Ω")).toBe("Tons Ω");
    expect(winAnsiSafe("Tons Ω")).toBe("Tons ?");
  });

  it("o que a fonte NÃO tem desaparece — nunca vira «?»", () => {
    // Um «?» a meio de uma frase parece um erro nosso na proposta que o casal
    // recebe. A ausência de um emoji não parece nada.
    expect(textoParaFonte(LATINA, "Mesa posta 🌿 com velas")).toBe("Mesa posta  com velas");
  });

  it("as quebras de linha sobrevivem — quem parte os parágrafos precisa delas", () => {
    expect(textoParaFonte(LATINA, "Primeira linha\nSegunda linha")).toBe(
      "Primeira linha\nSegunda linha",
    );
  });

  it("uma fonte que não sabe responder cai no caminho antigo, sem lançar", () => {
    // Fontes-padrão (fatura, contrato) e qualquer arrumação futura do pdf-lib
    // que mude os campos internos. Pior resultado, mas nunca um PDF por gerar.
    for (const fonte of [null, undefined, {}, { embedder: {} }, "nem sequer é um objecto"]) {
      expect(textoParaFonte(fonte, "Decoração 🌿")).toBe("Decoração ?");
    }
  });

  it("uma fonte que se engasga a responder conta como «não tem»", () => {
    const rabugenta = fonteQueSabe(() => {
      throw new Error("glifo?");
    });
    expect(() => textoParaFonte(rabugenta, "Decoração")).not.toThrow();
    expect(textoParaFonte(rabugenta, "Decoração")).toBe("");
  });
});
