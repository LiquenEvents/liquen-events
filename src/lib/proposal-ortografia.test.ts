import { describe, it, expect } from "vitest";
import {
  gralhasDoDocumento,
  corrigirGralha,
  corrigirTudo,
  lerCampo,
  escreverCampo,
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
