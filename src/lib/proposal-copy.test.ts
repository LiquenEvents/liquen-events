import { describe, it, expect } from "vitest";
import { copiarParaPedido, fotosDoDocumento, dataPorExtenso, trocarFotos } from "./proposal-copy";
import { resolveProposalMoney, withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import type { Quote } from "./orcamento/types";

/** A proposta da Catarina Martins, reduzida ao que importa para copiar. */
const ORIGEM = {
  template: "decoracao",
  ref: "Decoração Casamento Catarina Martins · 18 de setembro de 2027",
  clientNames: "Catarina & ",
  eventType: "Casamento",
  eventDate: "18 de setembro de 2027",
  location: "Évora",
  guests: "250 pax",
  ceremony: "Civil, simbólica",
  time: "16:00",
  weddingPlanners: "Equipa AMARA",
  serviceGroups: [
    {
      letter: "a)",
      title: "Decoração Floral e Decoração",
      items: [{ label: "Igreja" }, { label: "Cocktail" }],
    },
  ],
  moodBoards: [
    { title: "Cerimónia", images: ["LIQ-ORIGEM/foto-1.jpg", "LIQ-ORIGEM/foto-2.jpg"] },
    { title: "Cocktail", images: ["LIQ-ORIGEM/foto-3.jpg"] },
  ],
  budgetItems: ["Decoração Cerimónia", "Decoração Cocktail"],
  totalLabel: "Valor Total Decoração",
  totalText: "6875,00 € + IVA",
  totalAmount: 6875,
  totalVatMode: "acrescer",
  vatRate: 0.23,
  validUntil: "2026-09-04",
  validUntilDays: 45,
  coverImages: ["LIQ-ORIGEM/capa-1.jpg", ""],
  notasImportantes: ["A proposta depois de aceite deve ser confirmada por email"],
  incluido: ["Serviço de decoração, material, flores"],
  naoIncluido: ["Mobiliário de lounge"],
  condicoesGerais: ["Aos valores acresce o IVA"],
  observacoesGerais: [],
  faseamento: ["30% na adjudicação", "70% 1 mês antes"],
  cancelamento: [],
} as unknown as ProposalDoc;

const PEDIDO_NOVO = {
  id: "LIQ-NOVO",
  name: "Irina e Hugo",
  date: "2027-06-10",
  location: "Herdade da Maridona, Glória",
  guests: 120,
} as unknown as Quote;

describe("copiarParaPedido", () => {
  /**
   * O QUE ESTA FUNCIONALIDADE EXISTE PARA POUPAR.
   *
   * Se isto falhar, não há alavanca nenhuma: era mais rápido escrever de novo.
   */
  it("traz o trabalho todo que se repete", () => {
    const { doc } = copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(doc.serviceGroups).toEqual(ORIGEM.serviceGroups);
    expect(doc.moodBoards.map((b) => b.title)).toEqual(["Cerimónia", "Cocktail"]);
    expect(doc.budgetItems).toEqual(["Decoração Cerimónia", "Decoração Cocktail"]);
    expect(doc.notasImportantes).toEqual(ORIGEM.notasImportantes);
    expect(doc.condicoesGerais).toEqual(ORIGEM.condicoesGerais);
    expect(doc.faseamento).toEqual(ORIGEM.faseamento);
    expect(doc.validUntilDays).toBe(45);
    expect(doc.totalLabel).toBe("Valor Total Decoração");
    // A forma de trabalhar dela — modo de IVA e taxa — não é um dado do casal.
    expect(doc.totalVatMode).toBe("acrescer");
    expect(doc.vatRate).toBe(0.23);
    expect(doc.weddingPlanners).toBe("Equipa AMARA");
  });

  /**
   * O ÚNICO MODO DE ISTO FAZER MAL EM VEZ DE BEM.
   *
   * Uma proposta enviada com a data ou o nome do casamento de outro casal. Cada
   * uma destas asserções é uma forma diferente de isso acontecer.
   */
  it("não deixa passar nada do casal anterior", () => {
    const { doc } = copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(doc.clientNames).toBe("Irina e Hugo");
    expect(doc.eventDate).toBe("10 de junho de 2027");
    expect(doc.location).toBe("Herdade da Maridona, Glória");
    expect(doc.guests).toBe("120 pax");
    // A cerimónia e a hora eram do dia de outra pessoa e o pedido não os traz.
    expect(doc.ceremony).toBe("");
    expect(doc.time).toBe("");
    // O título interno aparece no topo de TODAS as páginas do PDF.
    expect(doc.ref).toBe("");
    // Em lado nenhum do documento pode sobrar o nome antigo.
    expect(JSON.stringify(doc)).not.toContain("Catarina");
    expect(JSON.stringify(doc)).not.toContain("18 de setembro");
  });

  it("não traz o valor da proposta anterior", () => {
    const { doc } = copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(doc.totalAmount).toBeUndefined();
    expect(doc.totalText).toBe("");
  });

  it("usa o preço final do pedido novo quando já existe", () => {
    const comPreco = { ...PEDIDO_NOVO, quotedPrice: 4200 } as unknown as Quote;
    const { doc } = copiarParaPedido(ORIGEM, comPreco);
    expect(doc.totalAmount).toBe(4200);
  });

  it("deita fora a data de validade fixa, que já passou", () => {
    const { doc } = copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(doc.validUntil).toBeUndefined();
    // Os DIAS ficam: é a política dela, não o calendário da proposta antiga.
    expect(doc.validUntilDays).toBe(45);
  });

  it("diz à interface o que destacar", () => {
    const { camposAMudar } = copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(camposAMudar).toContain("clientNames");
    expect(camposAMudar).toContain("eventDate");
    expect(camposAMudar).toContain("location");
    expect(camposAMudar).toContain("guests");
    expect(camposAMudar).toContain("totalAmount");
  });

  it("um pedido sem data nem local esvazia, em vez de herdar", () => {
    // O pior resultado possível seria ficar com os do casamento anterior por
    // «não haver nada melhor». Uma caixa vazia vê-se; um valor errado não.
    const vago = { id: "LIQ-X", name: "Sem data" } as unknown as Quote;
    const { doc } = copiarParaPedido(ORIGEM, vago);
    expect(doc.eventDate).toBe("");
    expect(doc.location).toBe("");
    expect(doc.guests).toBe("");
  });

  it("não altera o documento de origem", () => {
    // A origem é uma proposta JÁ ENVIADA. Mexer-lhe seria reescrever história.
    const antes = JSON.stringify(ORIGEM);
    copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(JSON.stringify(ORIGEM)).toBe(antes);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS CONDIÇÕES GERAIS DE UMA PROPOSTA GRAVADA JÁ NÃO TÊM TOKENS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `withProposalDefaults` substitui `{DATA}` e `{CONVIDADOS}` no SERVIDOR ANTES
 * de gravar. Por isso o documento de uma proposta ENVIADA — que é de onde se
 * copia — traz as frases já materializadas: "…no dia 18 de setembro de 2027",
 * "…para o número de 250 pax convidados". Copiá-las tal e quais levava a data e
 * os convidados do casal anterior para dentro das Condições Gerais do casal
 * novo, e já não havia token nenhum para lá voltar a passar.
 *
 * O casal novo assina um documento que diz que só é válido para o casamento de
 * outra pessoa. É a mesma família de erro que o resto deste ficheiro persegue —
 * só que escondido no meio de um bloco de texto legal que ninguém relê.
 */
describe("as Condições Gerais falam do casal certo", () => {
  /** A proposta da Catarina como fica GRAVADA: já sem tokens. */
  const GRAVADA = {
    ...ORIGEM,
    condicoesGerais: [
      "Aos valores acresce o IVA à taxa legal em vigor como descrito.",
      "Esta proposta só é válida para o evento a realizar no dia 18 de setembro de 2027.",
      "O orçamento é válido para o número de 250 pax convidados; abaixo ou acima deste número o valor da proposta terá de ser revisto.",
    ],
  } as unknown as ProposalDoc;

  it("não leva a data nem os convidados do casamento anterior", () => {
    const { doc } = copiarParaPedido(GRAVADA, PEDIDO_NOVO);
    const texto = doc.condicoesGerais.join(" | ");
    expect(texto).not.toContain("18 de setembro de 2027");
    expect(texto).not.toContain("250 pax");
  });

  it("depois de o servidor preencher, as frases são as do casal novo", () => {
    // O caminho verdadeiro: copiar → gravar/desenhar (que passa sempre por
    // `withProposalDefaults`). É aí que a frase tem de sair certa.
    const { doc } = copiarParaPedido(GRAVADA, PEDIDO_NOVO);
    const texto = withProposalDefaults(doc).condicoesGerais.join(" | ");
    expect(texto).toContain("no dia 10 de junho de 2027");
    expect(texto).toContain("para o número de 120 pax convidados");
  });

  it("mantém a redacção dela — só troca o que era do outro casal", () => {
    const { doc } = copiarParaPedido(GRAVADA, PEDIDO_NOVO);
    expect(doc.condicoesGerais).toHaveLength(3);
    expect(doc.condicoesGerais[0]).toBe(
      "Aos valores acresce o IVA à taxa legal em vigor como descrito.",
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE É PRIVADO NÃO VIAJA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * "Cliente da AMARA, cuidado com o prazo." "Já recusaram uma proposta em 2025
 * por preço." São frases escritas sobre UM negócio e sobre UM casal. Não são
 * desenhadas no PDF — há testes a garanti-lo — mas ficam no documento, à vista
 * de quem abrir o estúdio da proposta nova, coladas ao casal errado.
 */
describe("as notas do outro negócio ficam no outro negócio", () => {
  const COM_NOTAS = {
    ...ORIGEM,
    notasInternas: "Cliente da AMARA, cuidado com o prazo. Recusaram em 2025 por preço.",
    notasPorSeccao: { orcamento: "Margem apertada, não descer mais." },
  } as unknown as ProposalDoc;

  it("não copia as notas internas nem as notas por secção", () => {
    const { doc } = copiarParaPedido(COM_NOTAS, PEDIDO_NOVO);
    expect(doc.notasInternas).toBeUndefined();
    expect(doc.notasPorSeccao).toBeUndefined();
    expect(JSON.stringify(doc)).not.toContain("Recusaram em 2025");
    expect(JSON.stringify(doc)).not.toContain("Margem apertada");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PROPOSTA É PARA QUEM CASA, NÃO PARA QUEM PREENCHEU O FORMULÁRIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O estúdio já sabe isto: `initialDoc` abre com os dois nomes do casal e só cai
 * no `quote.name` quando não há nenhum. A cópia não sabia, e escrevia o
 * `quote.name` — que pode ser «Mãe da noiva» ou o nome de uma planner. Uma
 * proposta endereçada a quem preencheu o formulário em vez de a quem casa
 * lê-se como um erro de quem a mandou.
 */
describe("o nome no documento é o do casal", () => {
  it("usa os dois nomes quando o pedido os traz", () => {
    const pedido = {
      ...PEDIDO_NOVO,
      name: "Mãe da noiva",
      partnerA: "Rita",
      partnerB: "Tomás",
    } as unknown as Quote;
    const { doc } = copiarParaPedido(ORIGEM, pedido);
    expect(doc.clientNames).toBe("Rita & Tomás");
  });

  it("com um só nome escrito, meio par continua a ser melhor do que o outro", () => {
    const pedido = { ...PEDIDO_NOVO, name: "Mãe da noiva", partnerA: "Rita" } as unknown as Quote;
    expect(copiarParaPedido(ORIGEM, pedido).doc.clientNames).toBe("Rita");
  });

  it("sem nomes do casal, fica quem preencheu — é tudo o que há", () => {
    expect(copiarParaPedido(ORIGEM, PEDIDO_NOVO).doc.clientNames).toBe("Irina e Hugo");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * «VALOR TOTAL —» COM O BOTÃO DE ENVIAR LIGADO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A cópia apagava `totalText`/`totalEstimatedText` e repunha só o
 * `totalAmount`. O PDF imprime o TEXTO (`totalStr || "—"`), mas quem decide se
 * a proposta pode seguir lê o `totalAmount` — portanto o documento saía com
 * «Valor Total —» seguido, três linhas abaixo, de «Sinal 30% 2.988,90 €», que é
 * uma percentagem de um número que a folha não mostra.
 *
 * E havia um segundo erro por baixo: `quote.quotedPrice` é o «Preço final (SEM
 * IVA)». Numa proposta copiada em modo «IVA incluído», o `totalAmount` é o
 * BRUTO — pôr lá o líquido fazia a base cair 23% em silêncio.
 */
describe("o total da proposta nova é um número que se vê", () => {
  const PEDIDO_COM_PRECO = { ...PEDIDO_NOVO, quotedPrice: 10000 } as unknown as Quote;

  it("escreve o texto do total, e não só o número escondido", () => {
    const { doc } = copiarParaPedido(ORIGEM, PEDIDO_COM_PRECO);
    // ORIGEM está em «acrescer»: o texto acompanha o modo.
    expect(doc.totalText).not.toBe("");
    expect(doc.totalText).toMatch(/10\D?000,00\s€ \+ IVA/);
  });

  it("em «IVA incluído» o preço do pedido é a BASE, não o bruto", () => {
    const origemComIva = {
      ...ORIGEM,
      totalVatMode: "incluido",
      totalText: "8456,25 €",
    } as unknown as ProposalDoc;
    const { doc } = copiarParaPedido(origemComIva, PEDIDO_COM_PRECO);
    // O que o pedido diz é 10.000 € sem IVA. Depois de resolvido, a base tem
    // de continuar a ser 10.000 € — e o bruto 12.300 €.
    const money = resolveProposalMoney(doc);
    expect(money.base).toBeCloseTo(10000, 2);
    expect(money.gross).toBeCloseTo(12300, 2);
    expect(doc.totalText).toMatch(/12\D?300,00/);
  });

  it("sem preço no pedido, o total fica mesmo vazio", () => {
    // Um documento sem total é honesto: o estúdio pede-o antes de deixar
    // enviar. O que não pode é ter número por dentro e traço por fora.
    const { doc } = copiarParaPedido(ORIGEM, PEDIDO_NOVO);
    expect(doc.totalAmount).toBeUndefined();
    expect(doc.totalText).toBe("");
    expect(doc.totalEstimatedText).toBe("");
  });
});

describe("fotosDoDocumento", () => {
  it("junta capas e mood boards, sem repetir", () => {
    expect(fotosDoDocumento(ORIGEM).sort()).toEqual([
      "LIQ-ORIGEM/capa-1.jpg",
      "LIQ-ORIGEM/foto-1.jpg",
      "LIQ-ORIGEM/foto-2.jpg",
      "LIQ-ORIGEM/foto-3.jpg",
    ]);
  });

  it("ignora as posições de capa vazias", () => {
    // O array das capas tem sempre duas posições; uma vazia é `""` e não é
    // uma foto para copiar — pedir ao Storage uma cópia de "" dá erro.
    expect(fotosDoDocumento(ORIGEM)).not.toContain("");
  });

  it("ignora imagens embutidas, que não estão no Storage", () => {
    const comEmbutida = {
      ...ORIGEM,
      coverImages: ["data:image/png;base64,AAA", ""],
      moodBoards: [],
    } as unknown as ProposalDoc;
    expect(fotosDoDocumento(comEmbutida)).toEqual([]);
  });
});

describe("dataPorExtenso", () => {
  it("escreve a data como ela aparece na proposta", () => {
    expect(dataPorExtenso("2027-09-18")).toBe("18 de setembro de 2027");
    expect(dataPorExtenso("2027-03-01")).toBe("1 de março de 2027");
  });

  it("uma data que não percebe passa tal e qual", () => {
    expect(dataPorExtenso("a definir")).toBe("a definir");
    expect(dataPorExtenso("")).toBe("");
    expect(dataPorExtenso(undefined)).toBe("");
  });

  it("um mês impossível não inventa um nome", () => {
    expect(dataPorExtenso("2027-13-01")).toBe("2027-13-01");
  });
});

describe("trocarFotos", () => {
  it("troca as capas e os mood boards pelos caminhos novos", () => {
    const mapa = new Map([
      ["LIQ-ORIGEM/capa-1.jpg", "LIQ-NOVO/a.jpg"],
      ["LIQ-ORIGEM/foto-1.jpg", "LIQ-NOVO/b.jpg"],
      ["LIQ-ORIGEM/foto-2.jpg", "LIQ-NOVO/c.jpg"],
      ["LIQ-ORIGEM/foto-3.jpg", "LIQ-NOVO/d.jpg"],
    ]);
    const doc = trocarFotos(ORIGEM, mapa);
    expect(doc.coverImages).toEqual(["LIQ-NOVO/a.jpg", ""]);
    expect(doc.moodBoards[0].images).toEqual(["LIQ-NOVO/b.jpg", "LIQ-NOVO/c.jpg"]);
    expect(JSON.stringify(doc)).not.toContain("LIQ-ORIGEM");
  });

  it("uma foto que não foi copiada FICA, em vez de desaparecer", () => {
    // Partilhar a foto com a proposta antiga é um acoplamento indesejado mas
    // visível. Trocar por vazio seria apagar uma escolha dela em silêncio, e
    // ela só daria por isso no PDF já enviado.
    const mapa = new Map([["LIQ-ORIGEM/foto-1.jpg", "LIQ-NOVO/b.jpg"]]);
    const doc = trocarFotos(ORIGEM, mapa);
    expect(doc.moodBoards[0].images).toEqual(["LIQ-NOVO/b.jpg", "LIQ-ORIGEM/foto-2.jpg"]);
  });

  it("nunca compacta as posições de capa", () => {
    // É a POSIÇÃO que decide o lado onde a foto é impressa.
    const doc = trocarFotos(ORIGEM, new Map([["LIQ-ORIGEM/capa-1.jpg", "LIQ-NOVO/a.jpg"]]));
    expect(doc.coverImages).toHaveLength(2);
    expect(doc.coverImages[1]).toBe("");
  });

  it("um mapa vazio devolve o mesmo documento", () => {
    expect(trocarFotos(ORIGEM, new Map())).toBe(ORIGEM);
  });
});
