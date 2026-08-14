import { describe, it, expect, vi } from "vitest";
import { withProposalDefaults, type ProposalDoc } from "./proposal-doc";
import { camposPorTraduzir, lerEn } from "./proposal-doc-bilingue";
import {
  MAX_CARACTERES_POR_TRADUCAO,
  MAX_TEXTOS_POR_TRADUCAO,
  estadoDaTraducao,
  motorPelaRota,
  precisaDeTraducao,
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * A PROPOSTA GRANDE NÃO PODE SER A QUE NÃO DÁ
   * ══════════════════════════════════════════════════════════════════════════
   *
   * A rota tem tectos por pedido — {@link MAX_TEXTOS_POR_TRADUCAO} textos e
   * {@link MAX_CARACTERES_POR_TRADUCAO} caracteres — e responde 413 a quem os
   * passar. Existem por uma boa razão: um pedido feito à mão com dez mil
   * entradas gastava a quota do mês numa carregada.
   *
   * O comentário da rota diz que «a contagem é a mesma que o estúdio já
   * respeita». Não respeitava: o estúdio mandava TODOS os campos num pedido só.
   *
   * E a margem não é teórica. Medido numa proposta pesada mas plausível — 8
   * grupos de 8 rubricas com descrição, 12 mood boards, 40 linhas de orçamento
   * — dá 218 campos. O tecto é 300. O sintoma seria o pior de todos para
   * diagnosticar: dá em todas as propostas dela menos nas maiores, e nessas dá
   * «Não deu para traduzir» com o documento intacto e nada a dizer porquê.
   *
   * A partição é a MESMA disciplina que o motor do DeepL já usa para os seus
   * lotes de 50, e pela mesma razão: a ordem e o número de textos que voltam
   * são o contrato desta fronteira e não podem mudar.
   */
  it("uma proposta maior do que o tecto vai em vários pedidos, e volta pela ordem", async () => {
    const textos = Array.from({ length: 700 }, (_, i) => `Rubrica ${i + 1}`);
    const lotes: string[][] = [];
    const buscar = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const lote = JSON.parse(String(init?.body)).textos as string[];
      lotes.push(lote);
      return resposta({ textos: lote.map((t) => `EN: ${t}`) });
    });

    const saida = await motorPelaRota(buscar as unknown as typeof fetch)(textos);

    // Nenhum pedido passa o tecto — que é o que fazia a rota devolver 413.
    expect(lotes.length).toBeGreaterThan(1);
    for (const lote of lotes) {
      expect(lote.length).toBeLessThanOrEqual(MAX_TEXTOS_POR_TRADUCAO);
      expect(lote.reduce((n, t) => n + t.length, 0)).toBeLessThanOrEqual(
        MAX_CARACTERES_POR_TRADUCAO,
      );
    }
    // E o contrato da fronteira aguenta-se: o mesmo número, pela mesma ordem.
    expect(saida).toEqual(textos.map((t) => `EN: ${t}`));
  });

  /**
   * Um lote que falhe volta VAZIO nas suas posições em vez de deitar fora os
   * que já vieram — a mesma regra do motor do DeepL, e agora contada no ecrã
   * pelo `naoVieram` da fronteira. O que já foi traduzido foi pago; perdê-lo
   * porque o pedido seguinte apanhou um 429 era pagá-lo outra vez.
   */
  it("um lote que falha não deita fora os que já vieram", async () => {
    const textos = Array.from({ length: 400 }, (_, i) => `Rubrica ${i + 1}`);
    let n = 0;
    const buscar = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const lote = JSON.parse(String(init?.body)).textos as string[];
      n++;
      if (n === 2) return resposta({ error: "foram pedidos traduções a mais" }, false, 502);
      return resposta({ textos: lote.map((t) => `EN: ${t}`) });
    });

    const saida = await motorPelaRota(buscar as unknown as typeof fetch)(textos);
    expect(saida).toHaveLength(400);
    expect(saida[0]).toBe("EN: Rubrica 1");
    // As posições do lote que falhou voltam vazias — é assim que a fronteira as
    // deixa por traduzir em vez de as escrever trocadas.
    expect(saida.filter((t) => t === "")).not.toEqual([]);
  });

  /** Se NENHUM lote passar, atira — o painel precisa da frase para ela poder
   *  fazer alguma coisa, e «traduzi zero campos» sem uma palavra não é uma. */
  it("se nenhum lote passar, atira com as palavras do servidor", async () => {
    const textos = Array.from({ length: 400 }, (_, i) => `Rubrica ${i + 1}`);
    const buscar = vi.fn(async () =>
      resposta({ error: "a quota de tradução deste mês acabou" }, false, 502),
    );
    await expect(motorPelaRota(buscar as unknown as typeof fetch)(textos)).rejects.toThrow(
      /quota/i,
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «NÃO ESTÁ LIGADA» E «NÃO SE CONSEGUIU PERGUNTAR» SÃO DUAS COISAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas desligam o botão, e é isso que está certo: prometer uma tradução que
 * não vai acontecer é pior do que um botão parado. O que NÃO pode ser igual é a
 * frase por baixo dele.
 *
 * «A tradução automática ainda não está ligada neste servidor» é uma afirmação
 * sobre a CONFIGURAÇÃO — quem a lê vai à Vercel pôr a chave, ou desiste de
 * traduzir e escreve as caixas à mão. Se a causa verdadeira for uma sessão
 * caducada, uma rede que caiu ou um servidor que respondeu 500, essa frase
 * manda-a resolver um problema que não existe enquanto o verdadeiro se cura
 * recarregando a página.
 *
 * E é o caso que produz o relato «num ambiente diz uma coisa e no outro não
 * diz nada»: em pré-visualização, uma chamada que falha lê-se como «não está
 * configurado» quando o que aconteceu foi outra coisa.
 */
describe("saber se está ligada", () => {
  it("o servidor diz que sim", async () => {
    const buscar = vi.fn(
      async () => ({ ok: true, json: async () => ({ ligada: true }) }) as unknown as Response,
    );
    expect(await estadoDaTraducao(buscar as unknown as typeof fetch)).toBe("ligada");
  });

  it("sem chave no servidor, diz que não — e é isso que desliga o botão", async () => {
    const buscar = vi.fn(
      async () => ({ ok: true, json: async () => ({ ligada: false }) }) as unknown as Response,
    );
    expect(await estadoDaTraducao(buscar as unknown as typeof fetch)).toBe("desligada");
  });

  it("a rede em baixo NÃO é «não está ligada» — é «não se conseguiu perguntar»", async () => {
    const buscar = vi.fn(async () => {
      throw new Error("sem rede");
    });
    expect(await estadoDaTraducao(buscar as unknown as typeof fetch)).toBe("indisponivel");
  });

  it("uma sessão caducada também não é «não está ligada»", async () => {
    // O 401 da rota é o back office a dizer «quem és tu?», e não o servidor a
    // dizer «não tenho serviço de tradução». Confundi-los mandava-a procurar
    // uma chave em falta quando o que ela tem de fazer é voltar a entrar.
    const buscar = vi.fn(
      async () =>
        ({
          ok: false,
          status: 401,
          json: async () => ({ error: "Não autorizado" }),
        }) as unknown as Response,
    );
    expect(await estadoDaTraducao(buscar as unknown as typeof fetch)).toBe("indisponivel");
  });

  it("uma resposta que não é a esperada vale o mesmo — não se inventa um «não»", async () => {
    const buscar = vi.fn(async () => ({ ok: true, json: async () => ({}) }) as unknown as Response);
    expect(await estadoDaTraducao(buscar as unknown as typeof fetch)).toBe("indisponivel");
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

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * METADE TRADUZIDA NÃO É UM SUCESSO, E TEM DE SE PODER DIZER
   * ══════════════════════════════════════════════════════════════════════════
   *
   * O motor do DeepL manda os textos em LOTES de 50 e um lote que falhe volta
   * VAZIO nas suas posições — de propósito, para não deitar fora os que já
   * vieram. Só atira quando NENHUM lote passa.
   *
   * Consequência: numa proposta grande, um 429 a meio (ou uma quota que acaba
   * no segundo lote) devolve os primeiros 50 campos traduzidos e os outros 70
   * vazios, sem erro nenhum. A fronteira contava os escritos e calava-se sobre
   * os outros — e o ecrã dizia «50 campos traduzidos», a verde.
   *
   * Do lado dela isso lê-se exactamente como «não está a dar»: dá numa proposta
   * pequena e não dá numa grande, sem nada a explicar a diferença. E o pior é
   * que o número está certo — o que falta é a outra metade da frase.
   *
   * Não é o mesmo que `porqueFalhou` (que é «não deu nada») nem que os campos
   * que ela decidiu deixar em português (esses foram escritos). É uma terceira
   * coisa: pedidos ao serviço, e não voltaram.
   */
  it("os campos que foram pedidos e não voltaram são CONTADOS, não calados", async () => {
    const doc = proposta();
    const pedidos = camposPorTraduzir(doc).filter((c) => precisaDeTraducao(c.texto)).length;
    expect(pedidos).toBeGreaterThan(2);
    // O primeiro lote passa, o resto volta vazio — a forma exacta de um 429 a
    // meio de uma proposta grande.
    const resultado = await traduzirParaIngles(doc, async (textos) =>
      textos.map((t, i) => (i === 0 ? `EN: ${t}` : "")),
    );
    // Não é uma falha: o que veio, veio, e o documento fica com ele.
    expect(resultado.porqueFalhou).toBeUndefined();
    expect(resultado.escritos).toBeGreaterThan(0);
    // E o resto tem de ser DITO, não deduzido do contador estar baixo.
    expect(resultado.naoVieram).toBe(pedidos - 1);
  });

  it("e quando vem tudo, não há nada a dizer", async () => {
    const doc = proposta();
    const resultado = await traduzirParaIngles(doc, async (textos) =>
      textos.map((t) => `EN: ${t}`),
    );
    expect(resultado.naoVieram).toBe(0);
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
