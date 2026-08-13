import { describe, it, expect, vi } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { camposPorTraduzir, lerEn } from "./proposal-doc-bilingue";
import {
  motorPelaRota,
  precisaDeTraducao,
  traducaoEstaLigada,
  traduzirParaIngles,
  type MotorDeTraducao,
} from "./proposal-traducao";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O SÍTIO ONDE A TRADUÇÃO AUTOMÁTICA VAI ENTRAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O motor não existe — não há serviço escolhido nem chave nenhuma no projecto.
 * O que existe, e é o que estes testes pinam, é tudo o resto: quais os campos
 * que se mandam traduzir, por que ordem, o que se faz com a resposta, e o que
 * se faz com uma resposta MÁ.
 *
 * A resposta má é o que importa mais. Um motor que devolva menos textos do que
 * os que recebeu — por corte, por erro, por um pedido a meio — desalinha o
 * array, e a partir daí a tradução da rubrica 2 fica na rubrica 3. É a mesma
 * família de defeito do `budgetItemsEn` a deslizar uma posição, e tem a mesma
 * consequência: a rubrica errada traduzida no PDF de um cliente que não lê a
 * versão portuguesa e não tem como desconfiar.
 */

function proposta(over: Partial<ProposalDoc> = {}): ProposalDoc {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento Tara e Marty · 12 de setembro de 2026",
    clientNames: "Tara & Marty",
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Quinta do Hespanhol",
    guests: "80 pax",
    coverImages: ["", ""],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral de Casamento",
        items: [{ label: "Decor Cerimónia" }],
      },
    ],
    moodBoards: [],
    budgetItems: ["Decor Cocktail"],
    budgetExtras: [],
    totalLabel: "Valor Total Decoração",
    totalText: "2.530,00 € + IVA",
    totalAmount: 2530,
    totalVatMode: "acrescer",
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** Um motor de mentira: devolve o que lhe mandarem, com uma marca à frente. */
const motorFalso =
  (marca = "EN: "): MotorDeTraducao =>
  async (textos) =>
    textos.map((t) => `${marca}${t}`);

/**
 * ── O LADO DO ESTÚDIO DA FRONTEIRA ────────────────────────────────────────
 *
 * A chave do serviço vive no servidor e não pode chegar ao navegador, por isso
 * o estúdio fala com uma ROTA. A forma é a mesma dos dois lados — uma lista de
 * textos para dentro, uma lista de textos para fora —, e é isso que faz o resto
 * do código não saber qual é o serviço.
 */
describe("o motor que fala com a rota", () => {
  const resposta = (corpo: unknown, ok = true, status = 200) =>
    ({ ok, status, json: async () => corpo }) as unknown as Response;

  it("manda os textos à rota e devolve o que ela responder", async () => {
    const buscar = vi.fn(async () => resposta({ textos: ["Ceremony Decor"] }));
    const saida = await motorPelaRota(buscar as unknown as typeof fetch)(["Decor Cerimónia"]);
    expect(saida).toEqual(["Ceremony Decor"]);
  });

  it("uma lista vazia não gasta um pedido", async () => {
    const buscar = vi.fn(async () => resposta({ textos: [] }));
    expect(await motorPelaRota(buscar as unknown as typeof fetch)([])).toEqual([]);
    expect(buscar).not.toHaveBeenCalled();
  });

  it("um erro do servidor chega ao ecrã com as palavras do servidor", async () => {
    // A frase é escrita no servidor, em português, e nunca leva a chave lá
    // dentro. Reescrevê-la aqui era ter duas explicações para o mesmo erro.
    const buscar = vi.fn(async () =>
      resposta({ error: "a quota de tradução deste mês acabou" }, false, 502),
    );
    await expect(motorPelaRota(buscar as unknown as typeof fetch)(["Decor"])).rejects.toThrow(
      /quota/i,
    );
  });

  it("uma resposta com outra forma é recusada em vez de escrita", async () => {
    const buscar = vi.fn(async () => resposta({ textos: "isto não é uma lista" }));
    await expect(motorPelaRota(buscar as unknown as typeof fetch)(["Decor"])).rejects.toThrow(
      /forma esperada/i,
    );
  });
});

describe("saber se está ligada", () => {
  it("o servidor diz que sim", async () => {
    const buscar = vi.fn(
      async () => ({ ok: true, json: async () => ({ ligada: true }) }) as unknown as Response,
    );
    expect(await traducaoEstaLigada(buscar as unknown as typeof fetch)).toBe(true);
  });

  it("sem chave no servidor, diz que não — e é isso que desliga o botão", async () => {
    const buscar = vi.fn(
      async () => ({ ok: true, json: async () => ({ ligada: false }) }) as unknown as Response,
    );
    expect(await traducaoEstaLigada(buscar as unknown as typeof fetch)).toBe(false);
  });

  it("a rede em baixo vale «não está ligada» — o lado seguro", async () => {
    // Prometer uma tradução que não vai acontecer é pior do que um botão
    // desligado: ela envia a proposta a acreditar que está traduzida.
    const buscar = vi.fn(async () => {
      throw new Error("sem rede");
    });
    expect(await traducaoEstaLigada(buscar as unknown as typeof fetch)).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE É QUE VALE A PENA MANDAR TRADUZIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A regra é ESTRUTURAL e não tem vocabulário nenhum lá dentro: vale a pena
 * traduzir um texto que tenha ao menos uma PALAVRA — uma sequência de duas
 * letras ou mais que não faça parte de uma referência. Um dicionário de
 * palavras a decidir isto seria a mesma tabela caseira que está proibida a duas
 * portas daqui, e envelhecia à primeira rubrica nova.
 */
describe("precisaDeTraducao", () => {
  it("prosa precisa", () => {
    for (const sim of [
      "Decoração Cerimónia",
      "Copo d'água",
      "12 de setembro de 2026", // a data POR EXTENSO é prosa: «12 September 2026»
      "80 pax",
      "23% + IVA", // «IVA» é uma palavra, e em inglês é «VAT»
    ]) {
      expect(precisaDeTraducao(sim), `«${sim}» é prosa`).toBe(true);
    }
  });

  it("números, valores, datas, horas e referências não precisam", () => {
    for (const nao of [
      "2.530,00 €",
      "1 250,00€",
      "12/09/2026",
      "12.09.2026",
      "15h30",
      "15:30",
      "23%",
      "80",
      "LIQ-2026-014",
      "—",
      "a)",
    ]) {
      expect(precisaDeTraducao(nao), `«${nao}» não tem nada a traduzir`).toBe(false);
    }
  });

  it("vazio e só espaços não precisam", () => {
    for (const nada of ["", "   ", "\n\t "]) expect(precisaDeTraducao(nada)).toBe(false);
  });
});

describe("traduzirParaIngles", () => {
  it("manda ao motor exactamente os campos por traduzir, pela mesma ordem", async () => {
    const doc = proposta();
    const espia = vi.fn(motorFalso());
    await traduzirParaIngles(doc, espia);
    expect(espia).toHaveBeenCalledTimes(1);
    expect(espia.mock.calls[0][0]).toEqual(camposPorTraduzir(doc).map((c) => c.texto));
  });

  it("escreve cada resposta na caixa inglesa do campo que a pediu", async () => {
    const doc = proposta();
    const { doc: traduzido, escritos } = await traduzirParaIngles(doc, motorFalso());
    expect(escritos).toBe(camposPorTraduzir(doc).length);
    expect(lerEn(traduzido, { tipo: "grupoTitulo", gi: 0 })).toBe(
      "EN: Decoração Floral de Casamento",
    );
    expect(lerEn(traduzido, { tipo: "itemRotulo", gi: 0, ii: 0 })).toBe("EN: Decor Cerimónia");
    expect(lerEn(traduzido, { tipo: "linhaDeOrcamento", i: 0 })).toBe("EN: Decor Cocktail");
    expect(lerEn(traduzido, { tipo: "totalLabel" })).toBe("EN: Valor Total Decoração");
    // E o português não se mexe.
    expect(traduzido.serviceGroups[0].title).toBe("Decoração Floral de Casamento");
  });

  it("não toca no que ela já escreveu ou já decidiu", async () => {
    // O que já tem versão inglesa não vai ao motor: uma tradução automática por
    // cima de uma frase que ela reviu é trabalho dela deitado fora.
    const doc = proposta({
      serviceGroups: [
        {
          letter: "a)",
          title: "Decoração Floral de Casamento",
          titleEn: "Wedding Floral Design",
          items: [{ label: "Lisianthus", labelEn: "Lisianthus" }],
        },
      ],
    });
    const espia = vi.fn(motorFalso());
    const { doc: traduzido } = await traduzirParaIngles(doc, espia);
    expect(espia.mock.calls[0][0]).not.toContain("Decoração Floral de Casamento");
    expect(espia.mock.calls[0][0]).not.toContain("Lisianthus");
    expect(traduzido.serviceGroups[0].titleEn).toBe("Wedding Floral Design");
    expect(traduzido.serviceGroups[0].items[0].labelEn).toBe("Lisianthus");
  });

  it("um documento sem nada por traduzir nem chega a chamar o motor", async () => {
    const doc = proposta({
      serviceGroups: [],
      budgetItems: [],
      totalLabel: "",
    });
    const espia = vi.fn(motorFalso());
    const { escritos } = await traduzirParaIngles(doc, espia);
    expect(espia).not.toHaveBeenCalled();
    expect(escritos).toBe(0);
  });

  /**
   * ── A RESPOSTA DESALINHADA NÃO ENTRA ──────────────────────────────────────
   *
   * Escrever o que veio até onde chegou punha a tradução do campo 2 no campo 3 —
   * silenciosamente, e num documento a caminho de um cliente. Entre não traduzir
   * nada e traduzir tudo trocado, não traduzir nada é a resposta óbvia: o
   * documento fica exactamente como estava e ela volta a carregar no botão.
   */
  it("uma resposta com menos textos do que os pedidos é RECUSADA por inteiro", async () => {
    const doc = proposta();
    const resultado = await traduzirParaIngles(doc, async (textos) => textos.slice(0, 2));
    expect(resultado.escritos).toBe(0);
    expect(resultado.porqueFalhou).toMatch(/desalinh/i);
    // O documento é o MESMO objecto: nem uma escrita entrou.
    expect(resultado.doc).toBe(doc);
  });

  it("uma resposta com textos a mais também é recusada", async () => {
    const doc = proposta();
    const resultado = await traduzirParaIngles(doc, async (textos) => [...textos, "extra"]);
    expect(resultado.escritos).toBe(0);
    expect(resultado.doc).toBe(doc);
  });

  it("uma posição vazia fica por traduzir — e cai para o português no papel", async () => {
    const doc = proposta();
    const { doc: traduzido, escritos } = await traduzirParaIngles(doc, async (textos) =>
      textos.map((t, i) => (i === 0 ? "" : `EN: ${t}`)),
    );
    // O comprimento bate certo, portanto o que veio entra; o que veio vazio não.
    expect(escritos).toBe(camposPorTraduzir(doc).length - 1);
    const primeiro = camposPorTraduzir(doc)[0].campo;
    expect(lerEn(traduzido, primeiro)).toBeUndefined();
    expect(camposPorTraduzir(traduzido)).toHaveLength(1);
  });

  it("um motor que rebenta não estraga o documento", async () => {
    const doc = proposta();
    const resultado = await traduzirParaIngles(doc, async () => {
      throw new Error("503 do serviço de tradução");
    });
    expect(resultado.escritos).toBe(0);
    expect(resultado.doc).toBe(doc);
    expect(resultado.porqueFalhou).toBeTruthy();
  });

  /**
   * ── O QUE NUNCA VAI À REDE ────────────────────────────────────────────────
   *
   * Duas razões, e a segunda é a que dói. A primeira é a quota: são 500 000
   * caracteres por mês e cada ida desnecessária é quota gasta. A segunda está
   * escrita em `proposal-doc-textos.ts`, no cabeçalho do dinheiro: «a vírgula e
   * o ponto trocam de papel entre as duas convenções — um leitor que veja
   * "2.460,00 €" numa linha e "2,460.00 €" noutra não lê duas formatações: lê
   * dois números diferentes». Um tradutor automático localiza números, e uma
   * página de dinheiro com as duas convenções é uma conta de que se desconfia.
   */
  it("um campo que é só um número, um valor ou uma data não gasta uma ida à rede", async () => {
    const doc = proposta({
      budgetItems: ["Decor Cocktail", "2.530,00 €", "12/09/2026", "15h30", "LIQ-2026-014", "23%"],
    });
    const espia = vi.fn(motorFalso());
    const { doc: traduzido } = await traduzirParaIngles(doc, espia);
    const mandados = espia.mock.calls[0][0];
    for (const nada of ["2.530,00 €", "12/09/2026", "15h30", "LIQ-2026-014", "23%"]) {
      expect(mandados, `«${nada}» não tinha nada que ir ao serviço`).not.toContain(nada);
    }
    expect(mandados).toContain("Decor Cocktail");
    // E ficam DECIDIDOS, não por traduzir: a caixa inglesa recebe o mesmo texto,
    // que é o que o botão «Ficar em português» já faz. Deixá-los vazios era um
    // aviso aceso para sempre sobre um campo que não tem tradução nenhuma.
    expect(lerEn(traduzido, { tipo: "linhaDeOrcamento", i: 1 })).toBe("2.530,00 €");
    expect(lerEn(traduzido, { tipo: "linhaDeOrcamento", i: 4 })).toBe("LIQ-2026-014");
    expect(camposPorTraduzir(traduzido)).toHaveLength(0);
  });

  it("um documento só com números nem chega a chamar o motor — e mesmo assim escreve", async () => {
    const doc = proposta({
      serviceGroups: [],
      budgetItems: ["2.530,00 €", "1.200,00 €"],
      totalLabel: "",
    });
    const espia = vi.fn(motorFalso());
    const { doc: traduzido, escritos } = await traduzirParaIngles(doc, espia);
    expect(espia).not.toHaveBeenCalled();
    // `escritos` tem de contar estes: o estúdio só guarda o documento quando
    // `escritos > 0` — a zero mostra «Não havia nada por traduzir» e deita a
    // resposta fora, e estas duas escritas perdiam-se.
    expect(escritos).toBe(2);
    expect(lerEn(traduzido, { tipo: "linhaDeOrcamento", i: 0 })).toBe("2.530,00 €");
  });

  /**
   * ── O NOME DA QUINTA E O NOME DO CASAL NÃO SÃO TRADUZÍVEIS ────────────────
   *
   * «Quinta do Lago» com um tradutor pelo meio é «Lake Farm», e «Monte da
   * Ravasqueira» é «Ravasqueira Mount»: a proposta manda o casal para um sítio
   * que não existe. A defesa mais forte é a que já cá está e este teste PRENDE:
   * o local e os nomes dos noivos não são campos de prosa, não têm caixa
   * inglesa, e por isso nunca chegam ao serviço. Estão no mesmo saco da
   * referência e do tipo de evento (ver `temVersaoInglesa`).
   */
  it("o local e os nomes dos noivos nunca são mandados traduzir", async () => {
    const doc = proposta({
      location: "Herdade dos Grous",
      clientNames: "Ana e João",
      ref: "PO Decoração Casamento Ana e João · Monte da Ravasqueira",
    });
    const espia = vi.fn(motorFalso());
    await traduzirParaIngles(doc, espia);
    const tudo = espia.mock.calls[0][0].join(" | ");
    expect(tudo).not.toContain("Herdade");
    expect(tudo).not.toContain("Ana e João");
    expect(tudo).not.toContain("Ravasqueira");
  });

  it("a tradução não muda a FORMA do documento", async () => {
    // O invariante da ordem depende disto tanto como o `docNaLingua`: se
    // traduzir acrescentasse ou tirasse uma linha, os índices dos dois
    // documentos deixavam de ser os mesmos.
    const doc = proposta();
    const { doc: traduzido } = await traduzirParaIngles(doc, motorFalso());
    expect(traduzido.serviceGroups).toHaveLength(doc.serviceGroups.length);
    expect(traduzido.serviceGroups[0].items).toHaveLength(doc.serviceGroups[0].items.length);
    expect(traduzido.budgetItems).toEqual(doc.budgetItems);
    expect(traduzido.budgetItemsEn).toHaveLength(doc.budgetItems.length);
  });
});
