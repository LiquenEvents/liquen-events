import { describe, it, expect } from "vitest";
import { somaDosExtrasSemIva } from "@/lib/proposal-budget";
import { camposDoDocumento } from "./campos";
import type { PaginaLida, PedacoDeTexto } from "./linhas";
import { documentoDeCampos } from "./tipos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A PROPOSTA FEITA À MÃO — a folha que ninguém aqui compôs
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O teste de ida e volta mede o motor contra os NOSSOS PDF, e acerta tudo. O
 * acervo verdadeiro dela não é esse: são propostas escritas em Word, em A4 ao
 * baixo, com o texto todo em corpo 8, os capítulos numerados à mão («1.
 * Apresentação», «3. Orçamento Proposto»), as rubricas em capitulares com dois
 * pontos («INCLUÍDO NA PROPOSTA:»), os pontinhos das listas ESCRITOS, e páginas
 * de inspiração em paisagem com o título numa manuscrita e mais nada.
 *
 * Correndo o motor contra duas dessas propostas verdadeiras, ele lia 4 campos
 * em ~25. As folhas verdadeiras têm nomes, moradas e telefones de casais e não
 * entram no repositório — o que entra é a ESTRUTURA delas, medida linha a linha
 * e reconstruída aqui com nomes inventados. Cada bloco desta fixtura é uma
 * coisa que estava a falhar; a razão está escrita ao lado.
 *
 * As coordenadas são as verdadeiras (A4 ao baixo, 842×596, corpo 8,04): é o
 * espaçamento apertado destas folhas — dez pontos entre linhas, tanto dentro de
 * um item como entre dois — que faz as regras de medida não chegarem e as
 * marcas impressas serem a única maneira honesta de ler a lista.
 */

const CORPO = 8.04;
/** A fonte do texto corrente e dos rótulos. */
const REGULAR = "f3";
/** A fonte com que os pontinhos das listas são desenhados. */
const LISTA = "f5";
/** A manuscrita das páginas de inspiração — não aparece em mais lado nenhum. */
const MAO = "f8";
/** O cabeçalho corrente e o número da página. */
const MOBILIA = "f2";

/** Um pedaço de texto. A largura é aproximada a 0,45 em por letra, que é o que
 *  estas folhas medem (49 letras em 245 pontos, no cabeçalho corrente). */
function p(texto: string, x: number, y: number, o: { t?: number; f?: string } = {}): PedacoDeTexto {
  const tamanho = o.t ?? CORPO;
  return { texto, x, y, largura: texto.length * tamanho * 0.45, tamanho, fonte: o.f ?? REGULAR };
}

const REF = "PO Casamento Decoração Mafalda e Rui 4.07.2027";

/** Uma página com a mobília da folha: o cabeçalho corrente (que muda de x
 *  conforme a página, como no original) e o número no rodapé. */
function pagina(numero: number, pedacos: PedacoDeTexto[]): PaginaLida {
  return {
    numero,
    largura: 842,
    altura: 596,
    pedacos: [
      ...(numero > 1
        ? [
            p(REF, numero < 4 ? 553 : 577, numero < 4 ? 558 : 544, { t: 11.04, f: MOBILIA }),
            p(String(numero - 1), 766, 51, { t: 11.04, f: MOBILIA }),
          ]
        : []),
      ...pedacos,
    ],
  };
}

function folhaAMao(): PaginaLida[] {
  return [
    // A capa é uma fotografia de página inteira, sem uma letra.
    pagina(1, []),

    // ── Apresentação e serviços ──
    pagina(2, [
      p(".", 71, 504),
      p("1.", 71, 483, { t: 9.96 }),
      p("Apresentação", 88, 483, { t: 9.96 }),
      // Rótulo e valor NA MESMA corrida, com e sem espaço antes dos dois pontos.
      p("Noivos : Mafalda e Rui", 71, 464),
      // Rótulo e valor em corridas separadas — o Word parte umas e outras não.
      p("Evento:", 71, 445),
      p("Casamento", 130, 445),
      p("Data do Evento: 4 de julho de 2027", 71, 435),
      p("Local:", 71, 424),
      p("Quinta do Exemplo, Mora", 130, 424),
      p("Número de Convidados: 180 pax", 71, 414),
      p("Cerimónia : a saber", 71, 403),
      p("Hora:", 71, 385),
      p("a saber", 130, 385),

      p("2.", 71, 343, { t: 9.96 }),
      p("Serviços", 88, 343, { t: 9.96 }),
      p("2.", 71, 324),
      p("Serviços Disponibilizados", 88, 324),
      p("a)", 71, 303),
      p("Decoração de Casamento", 88, 303),
      p("•", 89, 281, { f: LISTA }),
      p("Centros de mesa jantar: decor floral, jarras, castiçais e velas", 97, 281),
      p("•", 89, 270, { f: LISTA }),
      p("Seatting Plan", 97, 270),
      p("•", 89, 259, { f: LISTA }),
      p("Complementos dos Noivos", 97, 259),
      p("b)", 71, 228),
      p("Wedding Coordination", 88, 228),
      // O primeiro item deste grupo está oito pontos mais à direita do que os
      // outros — foi assim que a mão dela o deixou, e o avanço mais comum
      // deitava-o fora.
      p("• Timeline e envio para todos os fornecedores", 105, 206, { f: LISTA }),
      p("•", 97, 195, { f: LISTA }),
      p("Gestão e coordenação do dia do evento", 105, 195),
    ]),

    // ── Três páginas de inspiração, sem legenda nenhuma que as anuncie ──
    pagina(3, [p("Decoração Mesas Jantar tons terrosos", 71, 465, { t: 18, f: MAO })]),
    pagina(4, [
      // A descrição está impressa ACIMA do título, no meio das fotografias.
      p("Ao centro da mesa um arranjo floral em taça, jarra ou vaso com", 175, 443, {
        t: 14,
        f: MAO,
      }),
      p("integração de outras jarras mais baixas em redor, combinando", 175, 426, {
        t: 14,
        f: MAO,
      }),
      p("com castiçais e velas.", 175, 410, { t: 14, f: MAO }),
      p("Tons Azuis …", 7, 311, { t: 16, f: MAO }),
    ]),
    pagina(5, [
      p("Complementos dos Noivos", 52, 507, { t: 16, f: MAO }),
      p("Ramo de Noiva (a definir com a Noiva)", 52, 488, { t: 16, f: MAO }),
    ]),

    // ── Orçamento, notas e condições de reserva ──
    pagina(6, [
      p("3. Orçamento Proposto", 71, 499, { t: 9.96 }),
      p("Item", 73, 485),
      p("Preço (€)", 200, 485),
      // O quadro tem a coluna do preço em branco: os três nomes e mais nada.
      p("Design Floral e Decor Jantar", 73, 446),
      p("Decor Mesa Buffet", 73, 432),
      p("Bouquet da Noiva", 73, 419),
      p("Valor Total", 73, 396),
      p("7890 € + Iva", 210, 396),
      // Dois adicionais seguidos com regimes de IVA DIFERENTES, escritos assim
      // por ela — é isso que `modoDeIvaDaLinha` lê do texto do valor.
      p("Serviço de coordenação", 73, 386),
      p("950,50€ +Iva", 210, 386),
      p("Deslocação da Equipa Exemplo", 74, 376),
      p("250,00 €", 210, 376),

      p("Notas Importantes", 71, 312, { t: 11.04 }),
      p("• O serviço de montagem e desmontagem está incluído na Proposta;", 89, 292, { f: LISTA }),
      p("• Todos os encargos inerentes ao espaço são da responsabilidade do espaço;", 89, 281, {
        f: LISTA,
      }),
      p("• O espaço tem de nos ser entregue limpo e pronto a usar;", 89, 270, { f: LISTA }),

      p("Condições de Reserva", 71, 197, { t: 11.04 }),
      // A rubrica e os seus itens começam no MESMO x — o que fecha a lista é a
      // rubrica seguinte, não o recuo.
      p("INCLUÍDO NA PROPOSTA:", 107, 167),
      p("• SERVIÇO DE DECORAÇÃO, MATERIAL E FLORES CONFORME DESCRITO;", 107, 156, { f: LISTA }),
      p("• SERVIÇO DE MONTAGEM, DESMONTAGEM COMO DESCRITOS.", 107, 146, { f: LISTA }),
      p("NÃO INCLUÍDO NO ORÇAMENTO:", 107, 125),
      p("• ALUGUER E/OU OUTRAS DESPESAS INERENTES AO ESPAÇO;", 107, 114, { f: LISTA }),
      p("• LEMBRANÇAS E PAPELARIA REFERENTES AO EVENTO", 125, 103, { f: LISTA }),
    ]),

    // ── Condições gerais e faseamento ──
    pagina(7, [
      p("CONDIÇÕES GERAIS:", 107, 503),
      p("• AOS VALORES ACRESCE O IVA À TAXA LEGAL EM VIGOR", 107, 482, { f: LISTA }),
      // Um item de TRÊS linhas: só a primeira leva o pontinho, as outras estão
      // avançadas. Os saltos são todos iguais (10,7 pontos), aqui e entre
      // itens — nenhuma medida os distingue.
      p("• A CONFIRMAÇÃO DO NÚMERO DE PESSOAS TEM DE SER FEITA ATÉ 25 DIAS ANTES DA", 107, 471, {
        f: LISTA,
      }),
      p("FESTA. SE O NÚMERO DE PARTICIPANTES FOR INFERIOR AO PREVISTO, SERÁ PAGO O", 125, 461),
      p("NÚMERO QUE FOI CONFIRMADO.", 125, 450),
      p("• A PRÉ-RESERVA DEVE SER EFETUADA POR ESCRITO ATRAVÉS DE EMAIL;", 107, 440, { f: LISTA }),

      // A folha dela chama «CONDIÇÕES GERAIS» às duas listas. As duas são
      // lidas, uma a seguir à outra.
      p("CONDIÇÕES GERAIS:", 107, 323),
      p("• TODO O MATERIAL USADO NO EVENTO É PARA USO EXCLUSIVO NA DECORAÇÃO.", 125, 302, {
        f: LISTA,
      }),
      p("• ESTA PROPOSTA É VÁLIDA POR 60 DIAS", 125, 280, { f: LISTA }),

      p("FASEAMENTO DO PAGAMENTO:", 107, 195),
      p("• 30% NA ADJUDICAÇÃO;", 125, 173, { f: LISTA }),
      p("• 70% 1 MÊS ANTES;", 125, 162, { f: LISTA }),
    ]),

    // ── Cancelamento e contactos ──
    pagina(8, [
      p("CANCELAMENTO:", 107, 503),
      p("• EM CASO DE CANCELAMENTO DO SERVIÇO, A EMPRESA RESERVA-SE O DIREITO DE NÃO", 125, 492, {
        f: LISTA,
      }),
      p("DEVOLVER O VALOR DA ADJUDICAÇÃO.", 143, 482),
      p("• PARA QUALQUER CONFLITO RECORRER-SE-Á AO CENTRO DE ARBITRAGEM DE LISBOA.", 125, 471, {
        f: LISTA,
      }),
      p("CONTACTOS:", 107, 407),
      p("E-MAIL: EXEMPLO@EXEMPLO.PT", 107, 397),
      p("TELF.: 000000000", 107, 386),
    ]),
  ];
}

/** Os campos aceites todos, como o ecrã os montaria. */
function lida() {
  const colheita = camposDoDocumento(folhaAMao());
  return {
    colheita,
    doc: documentoDeCampos(colheita.campos),
    valor: (campo: string) => colheita.campos.find((c) => c.campo === campo)?.valor,
    confianca: (campo: string) => colheita.campos.find((c) => c.campo === campo)?.confianca,
    porLer: colheita.porLer.map((x) => x.campo),
  };
}

describe("uma proposta feita à mão, em Word", () => {
  it("lê o cabeçalho corrente como referência, mesmo mudando de sítio e em corpo 11", () => {
    const r = lida();
    // A banda e o corpo com que a referência era procurada eram os da NOSSA
    // folha (80 pontos, corpo ≤ 10) e falhavam por um ponto: o cabeçalho dela
    // é corpo 11 e desce catorze pontos a meio do documento.
    expect(r.valor("ref")).toBe(REF);
    expect(r.confianca("ref")).toBe("alta");
    expect(r.porLer).not.toContain("ref");
  });

  it("lê o par rótulo/valor quando os dois vêm na mesma corrida de texto", () => {
    const r = lida();
    // Nenhum destes se lia: o motor só sabia ler o valor QUE A COMPOSIÇÃO
    // tivesse separado do rótulo por acaso.
    expect(r.valor("clientNames")).toBe("Mafalda e Rui");
    expect(r.valor("eventDate")).toBe("4 de julho de 2027");
    expect(r.valor("guests")).toBe("180 pax");
    expect(r.valor("ceremony")).toBe("a saber");
    // E os que vinham partidos continuam a ler-se.
    expect(r.valor("eventType")).toBe("Casamento");
    expect(r.valor("location")).toBe("Quinta do Exemplo, Mora");
    expect(r.valor("time")).toBe("a saber");
  });

  it("reconhece as secções numeradas, em capitulares e com dois pontos", () => {
    const r = lida();
    const doc = r.doc;
    expect(doc.serviceGroups).toHaveLength(2);
    expect(doc.notasImportantes).toHaveLength(3);
    expect(doc.incluido).toHaveLength(2);
    expect(doc.naoIncluido).toHaveLength(2);
    expect(doc.faseamento).toHaveLength(2);
    // Nenhuma delas pode continuar a dizer «não se encontrou».
    for (const campo of ["notasImportantes", "incluido", "naoIncluido", "faseamento"]) {
      expect(r.porLer).not.toContain(campo);
    }
  });

  it("junta as duas listas que a folha chama «CONDIÇÕES GERAIS» e não perde a segunda", () => {
    const doc = lida().doc;
    expect(doc.condicoesGerais).toHaveLength(5);
    expect(doc.condicoesGerais?.[4]).toContain("VÁLIDA POR 60 DIAS");
  });

  it("um item de três linhas é um item, e a marca impressa não vai lá dentro", () => {
    const doc = lida().doc;
    const confirmacao = doc.condicoesGerais?.find((c) => c.includes("CONFIRMAÇÃO"));
    expect(confirmacao).toContain("25 DIAS ANTES DA FESTA");
    expect(confirmacao).toContain("NÚMERO QUE FOI CONFIRMADO.");
    expect(confirmacao?.startsWith("•")).toBe(false);
    // As continuações não podem virar condições novas.
    expect(doc.condicoesGerais?.some((c) => c.startsWith("FESTA."))).toBe(false);
  });

  it("os contactos fecham a lista do cancelamento — o email não é uma condição", () => {
    const doc = lida().doc;
    expect(doc.cancelamento).toHaveLength(2);
    expect(doc.cancelamento?.some((c) => c.includes("EXEMPLO@"))).toBe(false);
  });

  it("lê os grupos de serviços pelo marcador ordinal e os itens pelo pontinho", () => {
    const doc = lida().doc;
    expect(doc.serviceGroups?.[0].letter).toBe("a)");
    expect(doc.serviceGroups?.[0].title).toBe("Decoração de Casamento");
    expect(doc.serviceGroups?.[0].items.map((i) => i.label)).toEqual([
      "Centros de mesa jantar: decor floral, jarras, castiçais e velas",
      "Seatting Plan",
      "Complementos dos Noivos",
    ]);
    expect(doc.serviceGroups?.[1].title).toBe("Wedding Coordination");
    // O item que está mais à direita do que os outros conta na mesma.
    expect(doc.serviceGroups?.[1].items).toHaveLength(2);
  });

  it("lê o quadro do orçamento, o total e cada adicional com o seu IVA", () => {
    const r = lida();
    const doc = r.doc;
    expect(doc.budgetItems).toEqual([
      "Design Floral e Decor Jantar",
      "Decor Mesa Buffet",
      "Bouquet da Noiva",
    ]);
    expect(doc.totalText).toBe("7890 € + Iva");
    expect(doc.totalLabel).toBe("Valor Total");
    expect(doc.totalAmount).toBe(7890);
    expect(doc.totalVatMode).toBe("acrescer");

    // As duas linhas por baixo do total são adicionais, e o «+ Iva» de cada
    // uma vai TAL E QUAL no texto do valor: é dali que `proposal-budget` lê o
    // regime de cada linha.
    expect(doc.budgetExtras).toEqual([
      { label: "Serviço de coordenação", valueText: "950,50€ +Iva" },
      { label: "Deslocação da Equipa Exemplo", valueText: "250,00 €" },
    ]);
    // O que a soma faz com eles: a que diz «+ Iva» já é base, a calada segue o
    // modo do documento.
    expect(somaDosExtrasSemIva(doc.budgetExtras, { mode: "incluido", vatRate: 0.23 })).toBe(
      1153.75,
    );
  });

  it("uma validade em DIAS não é uma data", () => {
    const r = lida();
    expect(r.valor("validUntilDays")).toBe(60);
    expect(r.valor("validUntil")).toBeUndefined();
  });

  it("a percentagem do sinal está na lista do faseamento", () => {
    expect(lida().valor("depositPercent")).toBe(30);
  });

  it("as páginas de inspiração são as que não têm uma letra do corpo do documento", () => {
    const r = lida();
    // É este o contrato com quem arruma as fotografias: o índice de cada
    // página é o índice do mood board.
    expect(r.colheita.paginasDeMoodboard).toEqual([3, 4, 5]);
    expect(r.valor("moodBoards[0].title")).toBe("Decoração Mesas Jantar tons terrosos");
    // O título é a MAIOR linha da página, e não a primeira: aqui a descrição
    // está impressa acima dele.
    expect(r.valor("moodBoards[1].title")).toBe("Tons Azuis …");
    expect(r.valor("moodBoards[1].annotation")).toContain("Ao centro da mesa");
    expect(r.valor("moodBoards[1].annotation")).toContain("com castiçais e velas.");
    expect(r.valor("moodBoards[2].title")).toBe("Complementos dos Noivos");
    expect(r.valor("moodBoards[2].subtitulo")).toBe("Ramo de Noiva (a definir com a Noiva)");
    expect(r.porLer).not.toContain("moodBoards");
  });

  it("o modelo sai da referência quando a capa não tem uma letra", () => {
    expect(lida().valor("template")).toBe("decoracao");
  });

  it("nada numa folha que não é nossa é lido com confiança alta — excepto a referência", () => {
    const r = lida();
    const altas = r.colheita.campos.filter((c) => c.confianca === "alta").map((c) => c.campo);
    expect(altas).toEqual(["ref"]);
    // E cada campo continua a trazer de onde veio.
    for (const c of r.colheita.campos) {
      expect(c.origem.pagina).toBeGreaterThan(0);
      expect(c.origem.texto.length).toBeGreaterThan(0);
      expect(c.porque.length).toBeGreaterThan(10);
    }
  });

  it("o que a folha não tem continua a ser dito", () => {
    const r = lida();
    expect(r.porLer).toContain("weddingPlanners");
    expect(r.valor("weddingPlanners")).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PIOR DEFEITO POSSÍVEL: UM VALOR ERRADO COM AR DE CERTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Numa das propostas verdadeiras o papel diz «Noivos: Catarina &» — o resto do
 * nome nunca chegou a ser impresso. O motor descia quatro linhas, encontrava o
 * cabeçalho «2. Serviços» (que é maior do que o rótulo, e era esse o critério)
 * e devolvia-o como o nome do casal.
 *
 * Um nome trocado não fica num ecrã: vai impresso na capa de uma proposta, com
 * o nome do casal em cima.
 */
describe("um valor que salta por cima de um cabeçalho é recusado", () => {
  const paginaTruncada = (): PaginaLida[] => [
    pagina(1, []),
    pagina(2, [
      p("1.", 64, 483, { t: 9.96 }),
      p("Apresentação", 81, 483, { t: 9.96 }),
      p("Noivos:", 64, 464),
      p("Mafalda &", 130, 464),
      p("Data do Casamento: 4 de julho de 2027", 64, 434),
      p("Local: Évora", 64, 424),
      p("Número de Convidados: 250 pax", 64, 413),
      p("2.", 64, 393, { t: 9.96 }),
      p("Serviços", 81, 393, { t: 9.96 }),
      p("a)", 64, 363),
      p("Decoração Floral", 81, 363),
      p("• Igreja", 90, 352, { f: LISTA }),
    ]),
    pagina(3, [
      p("3. Orçamento Proposto", 64, 488),
      p("Valor Total", 68, 356),
      p("6875,00 € + Iva", 210, 356),
    ]),
  ];

  it("devolve o que está impresso ao lado do rótulo, nunca o cabeçalho de baixo", () => {
    const colheita = camposDoDocumento(paginaTruncada());
    const nome = colheita.campos.find((c) => c.campo === "clientNames");
    expect(nome?.valor).toBe("Mafalda &");
    expect(colheita.campos.every((c) => c.valor !== "2. Serviços")).toBe(true);
    expect(colheita.campos.every((c) => c.valor !== "Serviços")).toBe(true);
  });

  it("o rótulo mais comprido não estraga o mais curto", () => {
    const colheita = camposDoDocumento(paginaTruncada());
    const doc = documentoDeCampos(colheita.campos);
    expect(doc.eventDate).toBe("4 de julho de 2027");
    expect(doc.location).toBe("Évora");
    expect(doc.guests).toBe("250 pax");
  });
});
