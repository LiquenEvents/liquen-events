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

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENTER DA CAIXA DE TEXTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «zona da piscina. ?Arranjo Floral no bar» — o «?» está exactamente onde ela
 * carregou no Enter. Uma caixa de texto de um navegador devolve `\r\n`; o `\r`
 * não é imprimível e virava «?», colado à primeira letra da linha seguinte.
 */
describe("as quebras de linha escritas no editor", () => {
  const LATINA2 = fonteQueSabe((cp) => cp < 0x0250);
  const escrito = "Arranjos na zona da piscina.\r\nArranjo Floral no bar, num dos cantos.";

  it("o retorno de carreto não deixa um «?» no papel", () => {
    expect(textoParaFonte(LATINA2, escrito)).toBe(
      "Arranjos na zona da piscina.\nArranjo Floral no bar, num dos cantos.",
    );
    expect(textoParaFonte(LATINA2, escrito)).not.toContain("?");
  });

  it("o mesmo no caminho das fontes-padrão, que a fatura e o contrato usam", () => {
    expect(winAnsiSafe(escrito)).toBe(
      "Arranjos na zona da piscina.\nArranjo Floral no bar, num dos cantos.",
    );
    expect(winAnsiSafe(escrito)).not.toContain("?");
  });

  it("o retorno sozinho, do mundo antigo do Mac, também é uma quebra", () => {
    expect(textoParaFonte(LATINA2, "Primeira\rSegunda")).toBe("Primeira\nSegunda");
    expect(winAnsiSafe("Primeira\rSegunda")).toBe("Primeira\nSegunda");
  });

  it("duas quebras seguidas continuam a ser duas — um parágrafo em branco é intenção", () => {
    expect(textoParaFonte(LATINA2, "Um\r\n\r\nDois")).toBe("Um\n\nDois");
  });

  /**
   * AS OUTRAS TRÊS QUEBRAS DE LINHA — as que não se escrevem, colam-se.
   *
   * O `\r` é a quebra que o Enter de uma caixa de texto produz. Mas o Unicode
   * tem mais três, e nenhuma delas vem de um teclado: vêm de COLAR.
   *
   *   U+2028 LINE SEPARATOR      — o shift+Enter do Word e do Google Docs, e o
   *                                que sai de copiar texto de um PDF;
   *   U+2029 PARAGRAPH SEPARATOR — o fim de parágrafo do mesmo sítio;
   *   U+0085 NEL                 — o «next line» que chega de ficheiros e de
   *                                exportações do mundo dos mainframes.
   *
   * Todas são quebras de linha por definição da norma, e nenhuma é imprimível.
   * Caíam no mesmo buraco que o `\r` caía: o WinAnsi não as codifica, viravam
   * «?» — e, pior que o `\r`, não vinham acompanhadas de um `\n` a mudar de
   * linha, portanto o parágrafo ficava TODO numa linha só com um «?» a meio,
   * onde devia estar a mudança de linha. Uma legenda de mood board colada do
   * Word chegava assim ao casal.
   *
   * A cura é a mesma e no mesmo sítio: são quebras, tornam-se `\n` antes de
   * qualquer decisão sobre o que a fonte sabe desenhar.
   */
  it("as quebras coladas do Word (U+2028, U+2029) e o NEL são quebras, não «?»", () => {
    for (const q of ["\u2028", "\u2029", "\u0085"]) {
      const colado = `Arranjos na piscina.${q}Arranjo floral no bar.`;
      const esperado = "Arranjos na piscina.\nArranjo floral no bar.";
      const nome = `U+${q.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")}`;
      expect(winAnsiSafe(colado), nome).toBe(esperado);
      expect(textoParaFonte(LATINA2, colado), nome).toBe(esperado);
    }
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O APELIDO QUE PERDIA LETRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Nenhuma das duas fontes desta casa cobre o latino ESTENDIDO: a Carlito que o
 * documento da proposta embute vem em SUBCONJUNTO (329 glifos — medido no
 * ficheiro: `hasGlyphForCodePoint(0x142)` diz que não) e as fontes-padrão do
 * pdf-lib são WinAnsi por definição. Ficam de fora o polaco (ł ś ń ż ę ć),
 * o checo (ř ů), o húngaro (ő ű), o turco (ğ ş ı) e o romeno (ș ț).
 *
 * O sintoma era diferente conforme o caminho, e nenhum dos dois é aceitável
 * numa folha que vai para o casal:
 *
 *   · no documento da proposta a letra DESAPARECIA — «Michał Wiśniewski» saía
 *     «Micha Winiewski», em corpo 52, no meio da capa;
 *   · nos papéis das fontes-padrão virava «?» — «Wi?niewski».
 *
 * Um nome próprio não é um emoji: tirar-lhe o acento é o que qualquer pessoa
 * faz quando o teclado não o tem, e é uma transformação exacta (em Unicode,
 * «ś» É «s» mais um acento). O emoji e o que não é letra latina continuam a
 * seguir a regra de sempre.
 */
describe("uma letra que a fonte não tem perde o acento, não a letra", () => {
  /** Uma fonte com o CP1252 e mais nada — a Carlito embutida, medida. */
  const SUBCONJUNTO = fonteQueSabe(
    (cp) =>
      cp <= 0x7e ||
      (cp >= 0xa0 && cp <= 0xff) ||
      [0x20ac, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d].includes(cp),
  );

  it("o polaco de um apelido chega inteiro à capa, sem acentos", () => {
    expect(textoParaFonte(SUBCONJUNTO, "Zofia & Michał Wiśniewski")).toBe(
      "Zofia & Michal Wisniewski",
    );
    expect(winAnsiSafe("Zofia & Michał Wiśniewski")).toBe("Zofia & Michal Wisniewski");
  });

  /**
   * Só se perde o que a codificação NÃO TEM. O «á» do checo, o «ö» do turco e o
   * «î» do romeno vivem no Latin-1 e ficam intactos — o que cai é o «ř», o «ő»,
   * o «ş», o «ț», o «đ». É por isso que estas linhas não são translitera­ções
   * inteiras: são a folha a ficar com o máximo de acento que sabe desenhar.
   */
  it("o mesmo para o checo, o húngaro, o turco e o romeno", () => {
    for (const [escrito, esperado] of [
      ["Jiří Dvořák", "Jirí Dvorák"],
      ["Győző Erdős", "Gyozo Erdos"],
      ["Ayşe Gökçe", "Ayse Gökçe"],
      ["Ștefan Țîrlea", "Stefan Tîrlea"],
      ["Đorđe Ilić", "Dorde Ilic"],
    ] as const) {
      expect(textoParaFonte(SUBCONJUNTO, escrito), escrito).toBe(esperado);
      expect(winAnsiSafe(escrito), escrito).toBe(esperado);
    }
  });

  it("o que a fonte TEM continua exactamente como ela o escreveu", () => {
    // A regra é uma rede, não um normalizador: o português não perde um acento.
    const pt = "Decoração — Cerimónia, Copo d'água, Jantar (80 pax) 4.600,00 €";
    expect(textoParaFonte(SUBCONJUNTO, pt)).toBe(pt);
    expect(winAnsiSafe(pt)).toBe(pt);
  });

  it("o que não é letra latina segue a regra de sempre", () => {
    // Sem base latina por baixo não há nada a tirar: o emoji desaparece do
    // documento da proposta e vira «?» nas fontes-padrão, como sempre.
    expect(textoParaFonte(SUBCONJUNTO, "Tons Ω 🌿 李明")).toBe("Tons   ");
    expect(winAnsiSafe("Tons Ω")).toBe("Tons ?");
  });

  it("não lança quando lhe mentem sobre o tipo", () => {
    // O `doc` que chega ao desenho não é validado campo a campo: um campo em
    // falta dava `undefined.normalize is not a function` — um 500 no «Gerar».
    for (const nada of [undefined, null]) {
      expect(winAnsiSafe(nada as unknown as string)).toBe("");
      expect(textoParaFonte(SUBCONJUNTO, nada as unknown as string)).toBe("");
    }
  });
});
