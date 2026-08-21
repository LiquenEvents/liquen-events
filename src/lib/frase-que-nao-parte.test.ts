import { describe, it, expect } from "vitest";
import { renderizarCorpo, arrumarEspacos } from "./email-template-engine";
import { construirValores, VARIAVEIS, fraseDoLocal } from "./email-template-vars";
import { MODELOS_DE_ORIGEM } from "./email-templates-store";
import { generoDoLugar, noLugar, atVenue } from "./lugares";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A FRASE NÃO SE PARTE, SEJA QUAL FOR O DADO QUE FALTA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que uma cliente recebeu, num email a sério:
 *
 *     «…enviamos a nossa proposta de decoração e respetivo orçamento para o
 *      ␣no Torre de Palma, a 27 de setembro de 2027.»
 *
 * Dois defeitos na mesma linha, com causas diferentes:
 *
 *  · o buraco antes do «no» — o bloco condicional guardava a frase pelo LOCAL
 *    e o que faltava era o TIPO DE EVENTO, portanto o «para o » ficou
 *    pendurado com dois espaços a seguir;
 *  · o «no Torre de Palma» — a contracção estava escrita à mão no modelo,
 *    colada a um nome cujo género ninguém conhecia.
 *
 * Este ficheiro é o teste que ela pediu: gerar o email com cada variável vazia,
 * UMA DE CADA VEZ, e verificar que o que sai é português fechado. Prende a
 * REGRA e não o texto — um modelo reescrito amanhã continua a ter de a cumprir.
 */

/** O que nunca pode aparecer num texto que vai para um cliente. */
const SINAIS_DE_FRASE_PARTIDA: Array<{ nome: string; padrao: RegExp }> = [
  { nome: "espaço duplo", padrao: /[^\n] {2,}/ },
  { nome: "espaço não separável duplicado", padrao: / {2,}/ },
  { nome: "espaço antes de pontuação", padrao: /\s+[,.;:!?]/ },
  { nome: "vírgulas seguidas", padrao: /,\s*,/ },
  { nome: "vírgula colada ao ponto", padrao: /,\s*\./ },
  { nome: "chavetas por resolver", padrao: /\{\{|\}\}/ },
  // Um artigo ou preposição pendurada no fim de uma linha: «para o» seguido de
  // nada é exactamente o defeito que ela viu.
  { nome: "artigo pendurado no fim da linha", padrao: /\b(para|no|na|em|de|da|do|a)\s*$/im },
  // «para o no …» — duas preposições encostadas, que é a forma que o buraco
  // tomou no email real.
  { nome: "duas preposições encostadas", padrao: /\bpara (o|a)\s+(no|na|em)\b/i },
];

function acusar(texto: string): string[] {
  return SINAIS_DE_FRASE_PARTIDA.filter(({ padrao }) => padrao.test(texto)).map((s) => s.nome);
}

/** Os valores completos, como num envio normal. */
const CHEIO = {
  destinatario: { nomeCompleto: "Marta e João" },
  evento: { tipo: "casamentos", local: "Torre de Palma", dataIso: "2027-09-27" },
  proposta: { totalComIva: 12300, validadeIso: "2027-11-27", sinalPercentagem: 30 },
  remetente: "Catarina Gaspar",
  mensagemPessoal: "Foi um gosto falar convosco.",
} as const;

describe("cada variável vazia, uma de cada vez", () => {
  /** As chaves que o `construirValores` produz — é sobre elas que se varre. */
  const chaves = VARIAVEIS.map((v) => v.chave);

  /**
   * Esvaziar uma variável é esvaziar a ENTRADA de que ela nasce. Esvaziar só a
   * saída não provava nada: os blocos condicionais decidem-se sobre o valor
   * desenhado, e é isso que se quer exercitar.
   */
  const semA = (chave: string) => {
    const e = structuredClone(CHEIO) as Record<string, unknown> & typeof CHEIO;
    const evento = { ...e.evento } as Record<string, unknown>;
    const proposta = { ...e.proposta } as Record<string, unknown>;
    if (chave === "evento_tipo") evento.tipo = "";
    if (chave === "evento_local") evento.local = "";
    if (chave === "evento_no_local") {
      evento.tipo = "";
      evento.local = "";
    }
    if (chave === "evento_data") evento.dataIso = "";
    if (chave === "valor_total") proposta.totalComIva = undefined;
    if (chave === "validade_data") proposta.validadeIso = "";
    if (chave === "sinal_percentagem") proposta.sinalPercentagem = undefined;
    return {
      ...e,
      evento,
      proposta,
      ...(chave.startsWith("cliente_") ? { destinatario: { nomeCompleto: "" } } : {}),
      ...(chave === "remetente_nome" ? { remetente: "" } : {}),
      ...(chave === "mensagem_pessoal" ? { mensagemPessoal: "" } : {}),
    };
  };

  for (const modelo of MODELOS_DE_ORIGEM) {
    for (const idioma of ["pt", "en"] as const) {
      const fonte = modelo[idioma].texto;
      for (const chave of chaves) {
        it(`«${modelo.nome}» (${idioma}) sem ${chave} continua uma frase fechada`, () => {
          const valores = construirValores({ ...semA(chave), idioma } as never);
          const saida = renderizarCorpo(fonte, valores);
          expect(acusar(saida), `${chave}: ${saida}`).toEqual([]);
        });
      }
    }
  }

  it("com TUDO vazio ao mesmo tempo — o pior caso — também não parte", () => {
    for (const modelo of MODELOS_DE_ORIGEM) {
      for (const idioma of ["pt", "en"] as const) {
        const valores = construirValores({ idioma } as never);
        const saida = renderizarCorpo(modelo[idioma].texto, valores);
        expect(acusar(saida), `${modelo.chave}/${idioma}: ${saida}`).toEqual([]);
      }
    }
  });

  /**
   * CONTROLO POSITIVO. Sem isto, os testes acima passavam por a lista de sinais
   * nunca acusar nada — e um teste que não sabe falhar não prova coisa nenhuma.
   * Esta é, à letra, a linha que a cliente recebeu.
   */
  it("a lista de sinais RECONHECE a frase que a cliente recebeu", () => {
    const real =
      "De acordo com o solicitado, enviamos a nossa proposta de decoração e respetivo " +
      "orçamento para o  no Torre de Palma, a 27 de setembro de 2027.";
    expect(acusar(real)).toContain("espaço duplo");
    expect(acusar(real)).toContain("duas preposições encostadas");
  });
});

describe("o artigo do espaço", () => {
  /**
   * Os seis espaços reais da casa. A preposição fixa do modelo antigo acertava
   * em UM — e o que ela viu foi «no Torre de Palma».
   */
  it.each([
    ["Torre de Palma", "na Torre de Palma"],
    ["Herdade da Malhadinha Nova", "na Herdade da Malhadinha Nova"],
    ["Quinta do Lago", "na Quinta do Lago"],
    ["Adega Mayor", "na Adega Mayor"],
    ["Casa do Alentejo", "na Casa do Alentejo"],
    ["Convento do Espinheiro", "no Convento do Espinheiro"],
  ])("«%s» → «%s»", (nome, esperado) => {
    expect(noLugar(nome)).toBe(esperado);
  });

  it("um espaço que a tabela não conhece sai pelo substantivo inicial", () => {
    expect(noLugar("Quinta da Boa Vista")).toBe("na Quinta da Boa Vista");
    expect(noLugar("Monte das Cegonhas")).toBe("no Monte das Cegonhas");
  });

  it("e um nome que ninguém reconhece usa «em», que nunca está errado", () => {
    expect(generoDoLugar("Sítio Qualquer")).toBe(null);
    expect(noLugar("Sítio Qualquer")).toBe("em Sítio Qualquer");
  });

  it("sem local, não fica uma preposição pendurada", () => {
    expect(noLugar("")).toBe("");
    expect(noLugar(undefined)).toBe("");
    expect(atVenue("")).toBe("");
  });

  it("acentos e maiúsculas não desfazem a tabela", () => {
    expect(noLugar("TORRE DE PALMA")).toBe("na TORRE DE PALMA");
    expect(noLugar("  torre de palma  ")).toBe("na torre de palma");
  });
});

describe("a frase composta", () => {
  it("com tipo e local, traz as duas partes e o artigo certo", () => {
    expect(fraseDoLocal("Casamento", "Torre de Palma", "pt")).toBe(
      "para o Casamento na Torre de Palma",
    );
  });

  it("«Conferência» leva o artigo feminino — era «para o Conferência»", () => {
    expect(fraseDoLocal("Conferência", "Adega Mayor", "pt")).toBe(
      "para a Conferência na Adega Mayor",
    );
  });

  it("só o local, sem tipo: nada de «para o» pendurado", () => {
    expect(fraseDoLocal("", "Torre de Palma", "pt")).toBe("na Torre de Palma");
  });

  it("só o tipo, sem local", () => {
    expect(fraseDoLocal("Casamento", "", "pt")).toBe("para o Casamento");
  });

  it("nenhum dos dois: vazio, e o bloco do modelo desaparece", () => {
    expect(fraseDoLocal("", "", "pt")).toBe("");
  });

  it("em inglês não há género — «for the … at …»", () => {
    expect(fraseDoLocal("Wedding", "Torre de Palma", "en")).toBe(
      "for the Wedding at Torre de Palma",
    );
    expect(fraseDoLocal("", "Torre de Palma", "en")).toBe("at Torre de Palma");
  });
});

describe("a limpeza de espaços não esconde o problema", () => {
  it("arruma o que é cosmético", () => {
    expect(arrumarEspacos("Olá  Marta ,  tudo bem ?")).toBe("Olá Marta, tudo bem?");
    expect(arrumarEspacos("Uma frase ,, e outra .")).toBe("Uma frase, e outra.");
  });

  it("não junta parágrafos — o «\\n» é significativo neste corpo", () => {
    expect(arrumarEspacos("Uma linha.\n\nOutra linha.")).toBe("Uma linha.\n\nOutra linha.");
  });

  it("não inventa palavras: um artigo sem nome continua pendurado", () => {
    // É de propósito. Quem apanha isto é o aviso «Ficou por preencher», que
    // olha para o modelo; uma limpeza que completasse a frase escondia-o.
    expect(arrumarEspacos("proposta para o ")).toBe("proposta para o");
  });

  /**
   * A REGRESSÃO QUE ISTO JÁ APANHOU, e é a razão de o teste existir.
   *
   * O aviso «Ficou por preencher» descobre uma variável vazia desenhando o
   * rascunho duas vezes — a segunda com um espaço fino (U+2009) no lugar de
   * cada vazio — e comparando. Um `trimEnd()` na limpeza apagava essa
   * sentinela, os dois desenhos saíam iguais, e o aviso calava-se: a limpeza
   * cosmética desligava o aviso que apanha a frase partida.
   */
  it("o espaço fino da sentinela SOBREVIVE — senão o aviso fica cego", () => {
    expect(arrumarEspacos("Proposta para  ")).toContain(" ");
  });
});
