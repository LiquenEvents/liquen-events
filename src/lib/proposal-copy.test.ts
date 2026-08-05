import { describe, it, expect } from "vitest";
import { copiarParaPedido, fotosDoDocumento, dataPorExtenso, trocarFotos } from "./proposal-copy";
import type { ProposalDoc } from "./proposal-doc";
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
