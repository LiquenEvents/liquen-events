import { describe, it, expect } from "vitest";
import {
  MARCADOR_DA_LIGACAO,
  resolverLigacaoDaProposta,
  temLigacaoDaProposta,
  VALOR_DA_LIGACAO_NO_RASCUNHO,
} from "./email-ligacao-reservada";
import { renderizarCorpo, variaveisPorPreencher } from "./email-template-engine";

const URL = "https://liquen-events.com/proposta/eyJhbGciOi.abc123";

describe("a ligação que só existe depois de o envio a criar", () => {
  it("troca o marcador pelo endereço verdadeiro", () => {
    const corpo = `A proposta segue em anexo e pode ser consultada aqui: ${MARCADOR_DA_LIGACAO}`;
    expect(resolverLigacaoDaProposta(corpo, URL)).toBe(
      `A proposta segue em anexo e pode ser consultada aqui: ${URL}`,
    );
  });

  /**
   * O CONTROLO POSITIVO deste ficheiro. Um modelo pode citar a ligação a meio
   * e outra vez no fim; trocar só a primeira deixava um `{{link_proposta}}`
   * escrito na cara do cliente — que é o mesmo defeito do «Olá ,» com outro
   * nome. Sem o `split/join` (com um `replace` de uma ocorrência só) é aqui
   * que se vê.
   */
  it("troca TODAS as ocorrências, não só a primeira", () => {
    const corpo = `Aqui: ${MARCADOR_DA_LIGACAO}\n\nE, se preferirem, aqui: ${MARCADOR_DA_LIGACAO}`;
    const saida = resolverLigacaoDaProposta(corpo, URL);
    expect(saida).toBe(`Aqui: ${URL}\n\nE, se preferirem, aqui: ${URL}`);
    expect(saida).not.toContain(MARCADOR_DA_LIGACAO);
  });

  it("um corpo sem marcador nenhum volta byte a byte como entrou", () => {
    const corpo = "Olá Marta e João,\n\nSegue a proposta em anexo.\n";
    expect(resolverLigacaoDaProposta(corpo, URL)).toBe(corpo);
  });

  /** Sem endereço não se apaga o marcador: um corpo com um buraco no sítio da
   *  ligação é pior do que um corpo com o marcador à vista, que pelo menos se
   *  percebe que é uma avaria nossa. */
  it("sem endereço, não mexe em nada", () => {
    const corpo = `Aqui: ${MARCADOR_DA_LIGACAO}`;
    expect(resolverLigacaoDaProposta(corpo, "")).toBe(corpo);
    expect(resolverLigacaoDaProposta(corpo, "   ")).toBe(corpo);
  });

  it("sabe dizer se o corpo ainda leva por onde o casal chega à proposta", () => {
    expect(temLigacaoDaProposta(`ver aqui: ${MARCADOR_DA_LIGACAO}`)).toBe(true);
    expect(temLigacaoDaProposta("ver aqui: nada")).toBe(false);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MARCADOR TEM DE ATRAVESSAR O INTERPRETADOR INTACTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O valor entra no `construirValores` como qualquer outro e é o interpretador
 * que o escreve no corpo. Se ele o escapasse, o que chegava ao envio era
 * `&#123;&#123;link_proposta&#125;&#125;` e a substituição não encontrava nada
 * — e o casal recebia isso escrito.
 */
describe("o marcador visto pelo interpretador", () => {
  it("sai do desenho tal e qual, pronto a ser trocado no envio", () => {
    const fonte = `A proposta pode ser vista aqui: {{link_proposta}}`;
    const desenhado = renderizarCorpo(fonte, {
      link_proposta: VALOR_DA_LIGACAO_NO_RASCUNHO,
    });
    expect(temLigacaoDaProposta(desenhado)).toBe(true);
    expect(resolverLigacaoDaProposta(desenhado, URL)).toBe(
      `A proposta pode ser vista aqui: ${URL}`,
    );
  });

  /**
   * O valor do rascunho NÃO é vazio, e é isto que essa decisão compra: o aviso
   * de variáveis por preencher deixa de acusar todos os envios de lhe faltar o
   * link. Com o vazio (o que sairia de não haver proposta ainda), este mesmo
   * modelo dava `["link_proposta"]` em TODOS os primeiros envios.
   */
  it("não conta como variável por preencher — e com vazio contaria", () => {
    const fonte = `A proposta pode ser vista aqui: {{link_proposta}}`;
    expect(variaveisPorPreencher(fonte, { link_proposta: VALOR_DA_LIGACAO_NO_RASCUNHO })).toEqual(
      [],
    );
    // Controlo positivo: é mesmo esta variável que estaria a ser acusada.
    expect(variaveisPorPreencher(fonte, { link_proposta: "" })).toEqual(["link_proposta"]);
  });

  /** E um `{{#se link_proposta}}` à volta da frase continua a abrir-se. */
  it("mantém aberto o bloco que só existe quando há ligação", () => {
    const fonte = "{{#se link_proposta}}Ver online: {{link_proposta}}{{/se}}";
    expect(renderizarCorpo(fonte, { link_proposta: VALOR_DA_LIGACAO_NO_RASCUNHO })).toBe(
      `Ver online: ${MARCADOR_DA_LIGACAO}`,
    );
  });
});
