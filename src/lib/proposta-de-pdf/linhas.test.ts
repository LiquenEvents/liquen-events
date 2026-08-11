import { describe, it, expect } from "vitest";
import {
  caixaDe,
  chaveDeRotulo,
  eRotulo,
  juntarParagrafo,
  linhasDaPagina,
  seguimentoAbaixo,
  type PaginaLida,
  type PedacoDeTexto,
} from "./linhas";
import { documentoDeCampos, passosDoCaminho, type CampoProposto } from "./tipos";

/**
 * Os testes das partes PURAS do motor: as que transformam pedaços de texto com
 * coordenadas em linhas e colunas, e as que voltam a montar um documento a
 * partir dos campos aceites.
 *
 * Cada um destes é uma situação que ACONTECEU nos PDF verdadeiros e que partiu
 * a leitura de alguma coisa. Estão aqui, com coordenadas à mão, porque assim
 * falham em milissegundos e dizem exactamente qual é a regra que se partiu —
 * ao contrário do teste de ida e volta, que diz que uma percentagem desceu.
 */

function pedaco(
  texto: string,
  x: number,
  y: number,
  largura: number,
  tamanho = 10,
  fonte = "f1",
): PedacoDeTexto {
  return { texto, x, y, largura, tamanho, fonte };
}

function pagina(pedacos: PedacoDeTexto[]): PaginaLida {
  return { numero: 1, largura: 841.89, altura: 595.28, pedacos };
}

describe("linhas e corridas", () => {
  it("junta na mesma linha os pedaços que partilham a linha de base", () => {
    const [linha] = linhasDaPagina(
      pagina([
        pedaco("Sinal 30%", 68, 179.3, 46.5, 12),
        pedaco("2.911,41 €", 122.7, 179.3, 48.3, 12),
      ]),
    );
    expect(linha.texto).toBe("Sinal 30% 2.911,41 €");
    // Meio em de vão: é a mesma frase, uma corrida só.
    expect(linha.corridas).toHaveLength(1);
  });

  it("separa em corridas diferentes o rótulo e o valor de um total", () => {
    // «Valor Total» acaba em 118 e o número começa em 427 — trinta ems de vão.
    const [linha] = linhasDaPagina(
      pagina([
        pedaco("Valor Total", 68, 329.3, 50.3, 11),
        pedaco("7.640,00 € + IVA", 427.1, 329.3, 70.9, 11),
      ]),
    );
    expect(linha.corridas.map((c) => c.texto)).toEqual(["Valor Total", "7.640,00 € + IVA"]);
  });

  it("não cola duas colunas só porque o texto de uma delas quase as encosta", () => {
    /**
     * O caso real: a faixa de detalhes tem colunas de 176 pontos e valores que
     * enchem 160. Com «Herdade da Cortesia, Reguengos de Monsaraz» no Local,
     * sobravam 16 pontos até ao «150 pax» dos Convidados — um em e meio, abaixo
     * do vão de coluna. As duas colunas colavam-se e o campo saía «Herdade da
     * Cortesia, Reguengos de 150 pax Monsaraz».
     *
     * O que as separa é a REPETIÇÃO do x: «150 pax» começa exactamente onde
     * começa o rótulo «Convidados» da linha de cima.
     */
    const linhas = linhasDaPagina(
      pagina([
        pedaco("LOCAL", 420.9, 252.3, 27.9, 7.5),
        pedaco("CONVIDADOS", 597.4, 252.3, 61, 7.5),
        pedaco("Herdade da Cortesia, Reguengos de", 420.9, 236.3, 160, 11.5),
        pedaco("150 pax", 597.4, 236.3, 36.6, 11.5),
        pedaco("Monsaraz", 420.9, 223.3, 45, 11.5),
      ]),
    );
    const valores = linhas.find((l) => l.y === 236.3)!;
    expect(valores.corridas.map((c) => c.texto)).toEqual([
      "Herdade da Cortesia, Reguengos de",
      "150 pax",
    ]);
  });

  it("o cabeçalho corrente não declara uma coluna a meio de uma legenda", () => {
    /**
     * O cabeçalho corrente é encostado à direita, portanto o x onde COMEÇA
     * depende do comprimento da referência do documento. Numa proposta chamada
     * «PO Casamento Decoração Rita e Tomás · 8.05.2027» esse x era 608 — e 608
     * calhava no meio da legenda «Incluído na proposta», que é desenhada letra
     * a letra. Dois textos ao mesmo x, coluna declarada, legenda partida em
     * «I N C L U Í D O» e «N A P R O P O S T A», e a lista inteira das
     * condições de reserva desaparecia da proposta lida — por causa do
     * comprimento do nome do casal.
     */
    const linhas = linhasDaPagina(
      pagina([
        pedaco("PO Casamento Decoração Rita e Tomás · 8.05.2027", 608, 525.3, 174, 8),
        pedaco("I N C L U Í D O", 558, 325.3, 44.8, 7.5),
        pedaco("N A P R O P O S T A", 608, 325.3, 60, 7.5),
      ]),
    );
    const legenda = linhas.find((l) => l.y === 325.3)!;
    expect(legenda.corridas).toHaveLength(1);
    expect(eRotulo(legenda.texto, "Incluído na proposta")).toBe(true);
  });

  it("lê o texto da linha por ordem, da esquerda para a direita", () => {
    const [linha] = linhasDaPagina(
      pagina([pedaco("direita", 400, 100, 30), pedaco("esquerda", 68, 100, 40)]),
    );
    expect(linha.texto).toBe("esquerda direita");
  });

  it("ordena as linhas de cima para baixo — no PDF, isso é o y a diminuir", () => {
    const linhas = linhasDaPagina(
      pagina([pedaco("baixo", 68, 100, 30), pedaco("cima", 68, 400, 30)]),
    );
    expect(linhas.map((l) => l.texto)).toEqual(["cima", "baixo"]);
  });
});

describe("as maiúsculas espaçadas", () => {
  it("reconhece um rótulo desenhado letra a letra", () => {
    expect(chaveDeRotulo("C O N V I D A D O S")).toBe("CONVIDADOS");
    expect(eRotulo("C O N V I D A D O S", "Convidados")).toBe(true);
    expect(eRotulo("C E R I M Ó N I A", "Cerimónia")).toBe(true);
  });

  it("reconhece um rótulo de duas palavras, mesmo perdida a fronteira", () => {
    // O «Wedding Planners» chega em dois pedaços e a fronteira entre as
    // palavras é do mesmo tamanho da que há entre duas letras.
    expect(eRotulo("W E D D I N G P L A N N E R S", "Wedding Planners")).toBe(true);
  });

  it("ignora os dois pontos de uma folha de Word", () => {
    expect(eRotulo("Data:", "Data")).toBe(true);
    expect(eRotulo("Local :", "Local")).toBe(true);
  });

  it("não confunde dois rótulos diferentes", () => {
    expect(eRotulo("Data", "Local")).toBe(false);
    expect(eRotulo("Total a pagar", "Valor Total")).toBe(false);
  });
});

describe("o seguimento por baixo de um rótulo", () => {
  const linhas = linhasDaPagina(
    pagina([
      pedaco("LOCAL", 68, 252.3, 27.9, 7.5),
      pedaco("Herdade da Cortesia,", 68, 236.3, 100, 11.5),
      pedaco("Reguengos de Monsaraz", 68, 223.3, 105, 11.5),
      pedaco("CERIMÓNIA", 68, 204.3, 53, 7.5),
    ]),
  );

  it("apanha as duas linhas do valor e pára antes do rótulo seguinte", () => {
    const rotulo = linhas[0];
    const abaixo = seguimentoAbaixo(linhas, rotulo, { passoMaximo: 20 });
    expect(juntarParagrafo(abaixo.slice(0, 2))).toBe("Herdade da Cortesia, Reguengos de Monsaraz");
    // O rótulo seguinte está a 19 pontos da última linha do valor: cabe no
    // passo, e é por isso que quem chama corta também pelo CORPO da letra.
    expect(abaixo.map((l) => l.tamanho)).toEqual([11.5, 11.5, 7.5]);
  });

  it("pára quando o salto vertical cresce", () => {
    const soltas = linhasDaPagina(
      pagina([pedaco("A", 68, 300, 10), pedaco("B", 68, 284, 10), pedaco("C", 68, 200, 10)]),
    );
    const abaixo = seguimentoAbaixo(soltas, soltas[0], { passoMaximo: 20 });
    expect(abaixo.map((l) => l.texto)).toEqual(["B"]);
  });

  it("pára quando a coluna muda", () => {
    const soltas = linhasDaPagina(pagina([pedaco("A", 68, 300, 10), pedaco("B", 400, 284, 10)]));
    expect(seguimentoAbaixo(soltas, soltas[0], { passoMaximo: 20 })).toHaveLength(0);
  });
});

describe("a caixa de onde um campo veio", () => {
  it("engloba todas as linhas do campo", () => {
    const linhas = linhasDaPagina(
      pagina([pedaco("primeira", 68, 200, 50, 10), pedaco("segunda linha", 68, 188, 80, 10)]),
    );
    const c = caixaDe(linhas);
    expect(c.x).toBe(68);
    expect(c.largura).toBe(80);
    expect(c.y).toBe(188);
    expect(c.altura).toBe(22); // de 188 até 200 + o corpo da letra
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   DOS CAMPOS DE VOLTA A UM DOCUMENTO
   ═══════════════════════════════════════════════════════════════════════════ */

function campo(caminho: string, valor: string | number | boolean): CampoProposto {
  return {
    campo: caminho,
    valor,
    confianca: "alta",
    porque: "teste",
    origem: { pagina: 1, texto: String(valor), x: 0, y: 0, largura: 1, altura: 1 },
  };
}

describe("caminhos de campo", () => {
  it("parte um caminho aninhado com índices", () => {
    expect(passosDoCaminho("serviceGroups[0].items[1].label")).toEqual([
      { chave: "serviceGroups" },
      { indice: 0 },
      { chave: "items" },
      { indice: 1 },
      { chave: "label" },
    ]);
  });

  it("recusa um caminho que não obedeça à gramática", () => {
    // Um caminho estranho só chega aqui por um erro nosso ou por um payload
    // adulterado. Nos dois casos, escrever às cegas dentro do documento dela é
    // pior do que perder um campo.
    for (const mau of ["", ".", "a..b", "a[b]", "[0]a", "a.", "a[1", "a-b", "a b"]) {
      expect(passosDoCaminho(mau), mau).toBeNull();
    }
  });

  it("recusa um caminho que mexa no protótipo", () => {
    // Escrever numa propriedade chamada `__proto__` não cria um campo: muda o
    // protótipo do objecto. Os caminhos vêm do ecrã, ou seja, do outro lado da
    // rede.
    for (const mau of ["__proto__", "__proto__.x", "a.constructor.prototype"]) {
      expect(passosDoCaminho(mau), mau).toBeNull();
    }
  });
});

describe("montar o documento a partir do que foi aceite", () => {
  it("monta objectos e listas aninhados", () => {
    const doc = documentoDeCampos([
      campo("clientNames", "Mariana & João"),
      campo("serviceGroups[0].title", "Decoração Floral"),
      campo("serviceGroups[0].items[0].label", "Cerimónia"),
      campo("serviceGroups[0].items[1].label", "Copo d'Água"),
      campo("budgetItems[0]", "Decor Cerimónia"),
      campo("totalAmount", 7890),
    ]);
    expect(doc.clientNames).toBe("Mariana & João");
    expect(doc.serviceGroups?.[0].items.map((i) => i.label)).toEqual(["Cerimónia", "Copo d'Água"]);
    expect(doc.budgetItems).toEqual(["Decor Cerimónia"]);
    expect(doc.totalAmount).toBe(7890);
  });

  it("uma lista com um item RECUSADO fecha o buraco em vez de deixar uma linha vazia", () => {
    // Um buraco numa lista de orçamento imprime-se como uma linha em branco no
    // meio das outras — e ninguém escolheu isso; foi só a consequência de ela
    // ter recusado a linha do meio.
    const doc = documentoDeCampos([
      campo("budgetItems[0]", "Primeira"),
      campo("budgetItems[2]", "Terceira"),
    ]);
    expect(doc.budgetItems).toEqual(["Primeira", "Terceira"]);
  });

  it("ignora um caminho inválido em vez de escrever onde calhar", () => {
    const doc = documentoDeCampos([campo("clientNames", "Ana"), campo("a..b", "lixo")]);
    expect(doc).toEqual({ clientNames: "Ana" });
  });

  it("não devolve nada quando não foi aceite nada", () => {
    expect(documentoDeCampos([])).toEqual({});
  });
});
