import { describe, it, expect } from "vitest";
import {
  chaveDoCampo,
  gralhasDoDocumento,
  corrigirGralha,
  corrigirTudo,
  lerCampo,
  escreverCampo,
  seccaoDoCampo,
  camposDoDocumento,
  camposPublicados,
  type CampoDeTexto,
} from "./proposal-ortografia";
import type { ProposalDoc } from "./proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ACENTO QUE FALTAVA NA PÁGINA QUE O CASAL LÊ PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «"Decor Floral Cerimonia" sem acento na lista de serviços →
 * "Cerimónia"».
 *
 * Metade destes testes é sobre o que NÃO se assinala. Um aviso ortográfico que
 * se engana é pior do que não existir: ensina-se a fechá-lo sem ler, e o dia em
 * que está certo é igual a todos os outros.
 */

const doc = (over: Partial<ProposalDoc> = {}): Partial<ProposalDoc> => ({
  ref: "PO Decoração Casamento Tara e Marty 12.09.2026",
  serviceGroups: [
    {
      letter: "a)",
      title: "Decoração Floral de Casamento",
      items: [{ label: "Decor Floral Cerimonia" }, { label: "Decor Cocktail" }],
    },
  ],
  moodBoards: [],
  budgetItems: [],
  budgetExtras: [],
  ...over,
});

describe("as gralhas dos campos que saem impressos", () => {
  it("encontra o «Cerimonia» da lista de serviços e diz onde está", () => {
    const g = gralhasDoDocumento(doc());
    expect(g).toHaveLength(1);
    expect(g[0].escrita).toBe("Cerimonia");
    expect(g[0].sugerida).toBe("Cerimónia");
    expect(g[0].rotulo).toBe("Serviços · linha 1");
    expect(g[0].campo).toEqual({ tipo: "itemRotulo", gi: 0, ii: 0 });
  });

  it("corrigir escreve no campo certo e não toca em mais nada", () => {
    const d = doc();
    const [g] = gralhasDoDocumento(d);
    const depois = corrigirGralha(d, g);
    expect(depois.serviceGroups![0].items[0].label).toBe("Decor Floral Cerimónia");
    // A outra linha, o grupo e a referência ficam como estavam.
    expect(depois.serviceGroups![0].items[1].label).toBe("Decor Cocktail");
    expect(depois.serviceGroups![0].title).toBe("Decoração Floral de Casamento");
    expect(depois.ref).toBe(d.ref);
    // E o documento corrigido já não tem gralha nenhuma.
    expect(gralhasDoDocumento(depois)).toEqual([]);
  });

  it("as maiúsculas da palavra escrita são as da correcção", () => {
    const g = gralhasDoDocumento(
      doc({
        moodBoards: [
          { title: "CERIMONIA", images: [] },
          { title: "cerimonia", images: [] },
        ],
      }),
    ).filter((x) => x.campo.tipo === "boardTitulo");
    expect(g.map((x) => x.sugerida)).toEqual(["CERIMÓNIA", "cerimónia"]);
  });

  it("a marca sem acento é uma gralha — e é das que mais saem impressas", () => {
    const g = gralhasDoDocumento(
      doc({ budgetExtras: [{ label: "Deslocação da Equipa Liquen", valueText: "75,00 €" }] }),
    ).filter((x) => x.campo.tipo === "extraRotulo");
    expect(g).toHaveLength(1);
    expect(g[0].sugerida).toBe("Líquen");
    const depois = corrigirGralha(
      doc({ budgetExtras: [{ label: "Equipa Liquen", valueText: "" }] }),
      g[0],
    );
    expect(depois.budgetExtras![0].label).toBe("Equipa Líquen");
  });

  it("a mesma palavra repetida no mesmo campo é UM aviso, e corrige-se de uma vez", () => {
    const d = doc({ budgetItems: ["Cerimonia e pós-Cerimonia"] });
    const g = gralhasDoDocumento(d).filter((x) => x.campo.tipo === "linhaDeOrcamento");
    expect(g).toHaveLength(1);
    expect(corrigirGralha(d, g[0]).budgetItems![0]).toBe("Cerimónia e pós-Cerimónia");
  });

  /**
   * ── O QUE NÃO SE ASSINALA ────────────────────────────────────────────────
   *
   * As três famílias que fariam este aviso perder a credibilidade: o que já
   * está certo, os nomes próprios, e as palavras cuja forma sem acento também
   * é uma palavra.
   */
  it("não inventa gralhas num documento bem escrito", () => {
    expect(
      gralhasDoDocumento(
        doc({
          serviceGroups: [
            {
              letter: "a)",
              title: "Decoração Floral de Casamento",
              items: [{ label: "Decor Floral Cerimónia" }],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("não toca em nomes próprios nem em flores latinas", () => {
    expect(
      gralhasDoDocumento(
        doc({
          serviceGroups: [
            {
              letter: "a)",
              title: "Monte da Oliveirinha",
              items: [
                { label: "Lisianthus, ranunculus e eucalipto" },
                { label: "Tara e Marty" },
                { label: "Quinta do Hespanhol" },
              ],
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("não mexe em palavras que sem acento continuam a ser palavras", () => {
    // «esta/está», «pais/país», «por/pôr», «para/pára», «e/é», «da/dá».
    // Nenhuma pode entrar no dicionário: só o sentido da frase as separa.
    expect(
      gralhasDoDocumento({
        budgetItems: ["esta montagem e a seguinte", "por a mesa para os pais", "da equipa da casa"],
      }),
    ).toEqual([]);
  });

  it("o singular não é corrigido dentro do plural, nem o plural parte o singular", () => {
    // A fronteira da palavra é olhada à mão porque o `\b` do JavaScript não
    // conhece letras acentuadas: com `\b`, corrigir «área» encontrava-a dentro
    // de «areas» e deixava «áreas» a meio de uma palavra partida.
    const d = { budgetItems: ["areas comuns", "area"] };
    expect(gralhasDoDocumento(d).map((x) => x.sugerida)).toEqual(["áreas", "área"]);
    const depois = corrigirTudo(d);
    expect(depois.budgetItems).toEqual(["áreas comuns", "área"]);
  });

  it("no mesmo campo, corrigir o singular não toca no plural", () => {
    // As duas palavras lado a lado, uma prefixo da outra. Cada gralha só mexe
    // na sua, e as duas juntas deixam a frase certa.
    const d = { budgetItems: ["area e areas"] };
    const [g] = gralhasDoDocumento(d);
    expect(g.escrita).toBe("area");
    expect(corrigirGralha(d, g).budgetItems![0]).toBe("área e areas");
    expect(corrigirTudo(d).budgetItems![0]).toBe("área e áreas");
  });

  it("uma palavra com caracteres de expressão regular não é um caso especial", () => {
    // Antes isto era interpolado numa `RegExp` construída na altura. Agora é
    // uma procura por texto, e o `(` deixou de ter significado nenhum.
    const d = { budgetItems: ["Cerimonia (civil)"] };
    expect(corrigirTudo(d).budgetItems![0]).toBe("Cerimónia (civil)");
  });

  it("campos vazios, ausentes ou só com espaços não produzem nada", () => {
    expect(gralhasDoDocumento({})).toEqual([]);
    expect(gralhasDoDocumento({ ref: "   ", servico: "" })).toEqual([]);
  });
});

describe("ler e escrever um campo pelo caminho", () => {
  it("a ida e a volta dão o mesmo texto, em todos os tipos de campo", () => {
    const base = doc({
      moodBoards: [{ title: "t", subtitulo: "s", annotation: "a", images: [] }],
      budgetItems: ["linha"],
      budgetExtras: [{ label: "extra", valueText: "1,00 €" }],
      servico: "Decor",
      totalLabel: "Valor Total",
      budgetNote: "nota",
      headerTitle: "cabeçalho",
      eventType: "Casamento",
    });
    const caminhos = [
      { tipo: "ref" },
      { tipo: "headerTitle" },
      { tipo: "servico" },
      { tipo: "eventType" },
      { tipo: "totalLabel" },
      { tipo: "budgetNote" },
      { tipo: "grupoTitulo", gi: 0 },
      { tipo: "itemRotulo", gi: 0, ii: 0 },
      { tipo: "itemDesc", gi: 0, ii: 0 },
      { tipo: "boardTitulo", bi: 0 },
      { tipo: "boardSubtitulo", bi: 0 },
      { tipo: "boardNota", bi: 0 },
      { tipo: "linhaDeOrcamento", i: 0 },
      { tipo: "extraRotulo", i: 0 },
    ] as const;
    for (const campo of caminhos) {
      const escrito = escreverCampo(base, campo, "ESCRITO");
      expect(lerCampo(escrito, campo), campo.tipo).toBe("ESCRITO");
      // E o original não mudou: escrever devolve um documento novo.
      expect(lerCampo(base, campo), campo.tipo).not.toBe("ESCRITO");
    }
  });

  it("escrever num índice que não existe não rebenta nem inventa entradas", () => {
    const base = doc();
    const depois = escreverCampo(base, { tipo: "boardTitulo", bi: 7 }, "x");
    expect(depois.moodBoards).toEqual([]);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRAFIA DA CASA, E O CAMINHO ATÉ AO CAMPO
 * ════════════════════════════════════════════════════════════════════════════
 */
describe("as grafias da casa", () => {
  /**
   * A linha verdadeira do pedido da Catarina Martins: «Decoração Cocktail /
   * Seatting Plan e Decor Floral Seatting Plann». Duas palavras erradas na
   * mesma linha, as duas impressas.
   */
  it("apanha o «Seatting Plann» que veio do pedido a sério", () => {
    const d = { budgetItems: ["Seatting Plan e Decor Floral Seatting Plann"] };
    const achados = gralhasDoDocumento(d);
    expect(achados.map((g) => g.escrita).sort()).toEqual(["Plann", "Seatting"]);
    expect(corrigirTudo(d).budgetItems![0]).toBe("Seating Plan e Decor Floral Seating Plan");
  });

  it("uniformiza a grafia do cocktail — a casa escreve-o à inglesa", () => {
    const d = { budgetItems: ["Decoração Coquetel"] };
    expect(corrigirTudo(d).budgetItems![0]).toBe("Decoração Cocktail");
  });

  it("o que já está escrito à maneira da casa não dá aviso nenhum", () => {
    expect(gralhasDoDocumento({ budgetItems: ["Decoração Cocktail", "Seating Plan"] })).toEqual([]);
  });

  it("as maiúsculas da palavra escrita mantêm-se", () => {
    const d = { budgetItems: ["SEATTING PLAN"] };
    expect(corrigirTudo(d).budgetItems![0]).toBe("SEATING PLAN");
  });
});

describe("o caminho até ao campo", () => {
  const todos: CampoDeTexto[] = [
    { tipo: "ref" },
    { tipo: "headerTitle" },
    { tipo: "servico" },
    { tipo: "eventType" },
    { tipo: "totalLabel" },
    { tipo: "budgetNote" },
    { tipo: "grupoTitulo", gi: 1 },
    { tipo: "itemRotulo", gi: 1, ii: 2 },
    { tipo: "itemDesc", gi: 1, ii: 2 },
    { tipo: "boardTitulo", bi: 3 },
    { tipo: "boardSubtitulo", bi: 3 },
    { tipo: "boardNota", bi: 3 },
    { tipo: "linhaDeOrcamento", i: 4 },
    { tipo: "extraRotulo", i: 4 },
  ];

  /** Duas chaves iguais levariam o salto ao campo errado, calado. */
  it("cada campo tem uma chave só sua", () => {
    const chaves = todos.map(chaveDoCampo);
    expect(new Set(chaves).size).toBe(chaves.length);
  });

  it("a chave leva os índices, para distinguir a linha 2 da linha 3", () => {
    expect(chaveDoCampo({ tipo: "itemDesc", gi: 1, ii: 2 })).toBe("itemDesc:1:2");
    expect(chaveDoCampo({ tipo: "boardNota", bi: 3 })).toBe("boardNota:3");
  });

  /** O alvo de recurso: os campos sem controlo próprio têm de levar a ALGUM
   *  sítio, e a secção é onde a resposta está. */
  it("todos os campos sabem dizer em que secção do estúdio vivem", () => {
    const seccoes = new Set([
      "evento",
      "capas",
      "servicos",
      "moodboards",
      "cronograma",
      "orcamento",
      "total",
    ]);
    for (const campo of todos) {
      expect(seccoes.has(seccaoDoCampo(campo)), campo.tipo).toBe(true);
    }
  });

  it("um campo de mood board leva à secção dos mood boards", () => {
    expect(seccaoDoCampo({ tipo: "boardTitulo", bi: 0 })).toBe("moodboards");
    expect(seccaoDoCampo({ tipo: "itemDesc", gi: 0, ii: 0 })).toBe("servicos");
    expect(seccaoDoCampo({ tipo: "linhaDeOrcamento", i: 0 })).toBe("orcamento");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «O CORRETOR TEM DE CORRER SOBRE TODO O CONTEÚDO PUBLICADO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para uma proposta que já tinha seguido. MEDIDO antes
 * de mexer: das famílias de campo que ela escreve à mão e que saem publicadas,
 * três não eram varridas — o cronograma do modelo Organização, as linhas
 * estimadas do mesmo modelo, e as alternativas que o casal escolhe.
 */
describe("o que sai publicado é varrido — todo", () => {
  const gralhas = (over: Partial<ProposalDoc>) =>
    gralhasDoDocumento({ moodBoards: [], serviceGroups: [], budgetItems: [], ...over });

  it("o cronograma de Organização — o título da fase e cada tarefa", () => {
    const g = gralhas({
      cronograma: [{ title: "12 meses antes da cerimonia", items: ["Conceito da decoracao"] }],
    });
    expect(g.map((x) => x.escrita)).toEqual(["cerimonia", "decoracao"]);
    // E o rótulo leva-a ao sítio: fase 1, linha 1.
    expect(g[0].rotulo).toBe("Cronograma · fase 1");
    expect(g[1].rotulo).toBe("Cronograma · fase 1, linha 1");
  });

  it("as linhas estimadas do orçamento de Organização", () => {
    const g = gralhas({ budgetRows: [{ item: "Coordenação da cerimonia", price: "1.500,00 €" }] });
    expect(g.map((x) => x.escrita)).toEqual(["cerimonia"]);
    expect(g[0].rotulo).toBe("Orçamento · estimativa 1");
  });

  it("as alternativas — o título, a nota, e o rótulo e a descrição de cada opção", () => {
    const g = gralhas({
      escolhas: [
        {
          id: "e1",
          titulo: "Paleta da cerimonia",
          nota: "Pode mudar até à montagem da decoracao",
          opcoes: [
            { id: "o1", rotulo: "Terracota e hortensias", descricao: "Com ceramica à mesa" },
            { id: "o2", rotulo: "Verde-oliva" },
          ],
        },
      ],
    });
    expect(g.map((x) => x.escrita)).toEqual(["cerimonia", "decoracao", "hortensias", "ceramica"]);
    // Nomeadas pelo TÍTULO dela, que é o que a leva lá.
    expect(g[0].rotulo).toBe("Alternativa «Paleta da cerimonia» · título");
    expect(g[2].rotulo).toBe("Alternativa «Paleta da cerimonia» · opção 1");
  });

  /**
   * ── E O QUE NÃO SE VARRE, NÃO SE VARRE DE PROPÓSITO ─────────────────────
   *
   * Os blocos fixos não se escrevem em lado nenhum do estúdio: vêm inteiros de
   * `withProposalDefaults`. Varrê-los era varrer as nossas próprias constantes
   * — e corrigir uma «gralha» lá dentro reescrevia o bloco, ele deixava de ser
   * igual ao da casa, e `blocosFixosNaLingua` (que decide a versão inglesa
   * COMPARANDO com o da casa) mandava o português para uma proposta inglesa.
   */
  it("os blocos fixos ficam de fora — corrigi-los estragava a versão inglesa", () => {
    const g = gralhas({
      incluido: ["Montagem e decoracao do salao"],
      naoIncluido: ["Transporte dos adereços"],
      notasImportantes: ["A decoracao é da responsabilidade da Liquen"],
      observacoesGerais: ["A cerimonia começa às 16h"],
      condicoesGerais: ["Esta proposta cobre a decoracao da cerimonia."],
      faseamento: ["30% na adjudicacao"],
      cancelamento: ["Em caso de cancelamento da cerimonia"],
    });
    expect(g).toEqual([]);
  });
});

describe("as duas listas divergem, e divergem ditas", () => {
  const comTudo: Partial<ProposalDoc> = {
    moodBoards: [],
    serviceGroups: [],
    budgetItems: [],
    cronograma: [{ title: "x", items: ["y"] }],
    budgetRows: [{ item: "z", price: "" }],
    escolhas: [{ id: "e1", titulo: "t", opcoes: [{ id: "o1", rotulo: "r" }] }],
  };

  it("o inventário bilingue NÃO cresceu com isto", () => {
    // `camposDoDocumento` é percorrido por um `switch` sem `default` em
    // `proposal-doc-bilingue.ts`. O cronograma não tem par inglês no tipo do
    // documento, e as alternativas já são contadas por quem é delas.
    const tipos = new Set(camposDoDocumento(comTudo).map((c) => c.campo.tipo));
    for (const novo of [
      "cronogramaTitulo",
      "cronogramaItem",
      "linhaEstimada",
      "escolhaTitulo",
      "escolhaRotulo",
    ]) {
      expect(tipos.has(novo as CampoDeTexto["tipo"]), novo).toBe(false);
    }
  });

  it("e a lista do corretor é a de cima MAIS os que faltavam", () => {
    const bilingue = camposDoDocumento(comTudo).map((c) => c.campo.tipo);
    const publicados = camposPublicados(comTudo).map((c) => c.campo.tipo);
    // Nada se perdeu pelo caminho.
    for (const t of bilingue) expect(publicados).toContain(t);
    expect(publicados.length).toBeGreaterThan(bilingue.length);
  });
});

describe("corrigir uma alternativa não mexe na resposta do casal", () => {
  /**
   * A resposta do casal aponta para o `id` da opção. Se corrigir «hortensias»
   * lhe tocasse, a escolha deles desaparecia em silêncio — e ninguém dava por
   * isso até ao dia da montagem.
   */
  it("reescreve o rótulo e mais nada", () => {
    const original: Partial<ProposalDoc> = {
      moodBoards: [],
      serviceGroups: [],
      budgetItems: [],
      escolhas: [
        {
          id: "e1",
          titulo: "Paleta",
          opcoes: [
            { id: "o1", rotulo: "Terracota e hortensias", imagem: "LIQ-9/p.jpg" },
            { id: "o2", rotulo: "Verde-oliva" },
          ],
        },
      ],
    };
    const g = gralhasDoDocumento(original);
    expect(g).toHaveLength(1);
    const depois = corrigirGralha(original, g[0]);
    const opcoes = depois.escolhas![0].opcoes;
    expect(opcoes[0].rotulo).toBe("Terracota e hortênsias");
    expect(opcoes[0].id).toBe("o1");
    // A fotografia da opção e a opção ao lado ficam exactamente onde estavam.
    expect(opcoes[0].imagem).toBe("LIQ-9/p.jpg");
    expect(opcoes[1]).toBe(original.escolhas![0].opcoes[1]);
    expect(depois.escolhas![0].id).toBe("e1");
  });
});

describe("o salto encontra os campos novos", () => {
  it("o cronograma e a estimativa levam a chave do controlo", () => {
    expect(chaveDoCampo({ tipo: "cronogramaTitulo", pi: 2 })).toBe("cronogramaTitulo:2");
    expect(chaveDoCampo({ tipo: "cronogramaItem", pi: 2, ii: 1 })).toBe("cronogramaItem:2:1");
    expect(chaveDoCampo({ tipo: "linhaEstimada", i: 3 })).toBe("linhaEstimada:3");
    expect(seccaoDoCampo({ tipo: "cronogramaTitulo", pi: 0 })).toBe("cronograma");
    expect(seccaoDoCampo({ tipo: "linhaEstimada", i: 0 })).toBe("orcamento");
  });

  /**
   * UMA CAIXA, UM ENDEREÇO. `escolhas:0:opcoes:1:rotulo` não é invenção do
   * corrector: é o `caminho` que o painel das traduções já usava e que o
   * `EditorDeEscolhas` já escreve no `data-campo` de cada caixa. Um segundo
   * endereço para a mesma caixa era um dos dois saltos a partir-se em silêncio
   * no dia em que um deles mudasse.
   */
  it("as alternativas usam o endereço que as caixas JÁ têm", () => {
    expect(chaveDoCampo({ tipo: "escolhaTitulo", ei: 0 })).toBe("escolhas:0:titulo");
    expect(chaveDoCampo({ tipo: "escolhaNota", ei: 1 })).toBe("escolhas:1:nota");
    expect(chaveDoCampo({ tipo: "escolhaRotulo", ei: 0, oi: 1 })).toBe(
      "escolhas:0:opcoes:1:rotulo",
    );
    expect(chaveDoCampo({ tipo: "escolhaDescricao", ei: 0, oi: 1 })).toBe(
      "escolhas:0:opcoes:1:descricao",
    );
    // E vivem dentro da secção dos mood boards, que é onde o editor delas está.
    expect(seccaoDoCampo({ tipo: "escolhaRotulo", ei: 0, oi: 0 })).toBe("moodboards");
  });
});

describe("ler e escrever os campos novos", () => {
  const base: Partial<ProposalDoc> = {
    moodBoards: [],
    serviceGroups: [],
    budgetItems: [],
    cronograma: [{ title: "Doze meses antes", items: ["Conceito", "Fornecedores"] }],
    budgetRows: [{ item: "Coordenação", price: "1.500,00 €" }],
    escolhas: [
      { id: "e1", titulo: "Paleta", nota: "n", opcoes: [{ id: "o1", rotulo: "Terracota" }] },
    ],
  };

  const casos: Array<[CampoDeTexto | Parameters<typeof lerCampo>[1], string]> = [
    [{ tipo: "cronogramaTitulo", pi: 0 }, "Doze meses antes"],
    [{ tipo: "cronogramaItem", pi: 0, ii: 1 }, "Fornecedores"],
    [{ tipo: "linhaEstimada", i: 0 }, "Coordenação"],
    [{ tipo: "escolhaTitulo", ei: 0 }, "Paleta"],
    [{ tipo: "escolhaNota", ei: 0 }, "n"],
    [{ tipo: "escolhaRotulo", ei: 0, oi: 0 }, "Terracota"],
  ];

  it.each(casos)("lê %o", (campo, esperado) => {
    expect(lerCampo(base, campo as Parameters<typeof lerCampo>[1])).toBe(esperado);
  });

  it.each(casos)("escreve %o e volta a lê-lo", (campo) => {
    const c = campo as Parameters<typeof lerCampo>[1];
    const depois = escreverCampo(base, c, "escrito de novo");
    expect(lerCampo(depois, c)).toBe("escrito de novo");
    // O preço da linha estimada e os ids das alternativas não se movem.
    expect(depois.budgetRows?.[0].price).toBe("1.500,00 €");
    expect(depois.escolhas?.[0].id).toBe("e1");
    expect(depois.escolhas?.[0].opcoes[0].id).toBe("o1");
  });

  it("uma posição que não existe lê-se como vazia, e não estoira", () => {
    expect(lerCampo(base, { tipo: "cronogramaItem", pi: 9, ii: 9 })).toBeUndefined();
    expect(lerCampo(base, { tipo: "escolhaRotulo", ei: 9, oi: 9 })).toBeUndefined();
    expect(escreverCampo(base, { tipo: "linhaEstimada", i: 9 }, "x").budgetRows).toHaveLength(1);
  });
});
