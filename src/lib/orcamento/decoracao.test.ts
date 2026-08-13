import { describe, it, expect } from "vitest";
import { PONTOS_DECORACAO, pontosConhecidos, rotularPontos, linhasDeOrcamento } from "./decoracao";

describe("catálogo de pontos de decoração", () => {
  it("os identificadores são únicos", () => {
    const ids = PONTOS_DECORACAO.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  /**
   * Os identificadores ficam GRAVADOS nos pedidos. Renomear "cocktail" para
   * "cocktail_hour" não parte nada visivelmente — mas todos os pedidos já
   * feitos passam a ter um ponto que o catálogo não reconhece, e a escolha do
   * casal desaparece do email, do back office e da proposta sem um erro.
   *
   * Este teste é a única coisa entre isso e um `git commit`. Se falhar, a
   * pergunta certa não é "como faço passar o teste" — é "o que acontece aos
   * pedidos que já estão gravados com o nome antigo".
   */
  it("os identificadores gravados nos pedidos não mudam", () => {
    expect(PONTOS_DECORACAO.map((p) => p.id)).toEqual([
      "cerimonia",
      "cocktail",
      "mesas",
      "seating",
      "papelaria",
      "bar",
      "bolo",
      "complementos",
    ]);
  });

  /**
   * As "Condições de Reserva" das propostas listam estes em NÃO INCLUÍDO NO
   * ORÇAMENTO. Oferecê-los no formulário como se fossem decoração seria
   * prometer o que a proposta depois exclui — e só se descobria no fim, que é
   * a pior altura para o casal descobrir o que quer que seja.
   */
  it("não oferece nada que as propostas excluem", () => {
    const proibido = /ilumina|mobili|tenda|cadeira|atoalhado|catering|p[ée]rgula/i;
    for (const p of PONTOS_DECORACAO) {
      expect(`${p.pt} ${p.en} ${p.linhaOrcamento}`).not.toMatch(proibido);
    }
  });
});

describe("pontosConhecidos", () => {
  it("ignora identificadores que não existem", () => {
    // Um pedido forjado pode trazer o que quiser: o esquema limita o tamanho,
    // e é aqui que se limita o conteúdo.
    expect(pontosConhecidos(["cocktail", "inventado", ""]).map((p) => p.id)).toEqual(["cocktail"]);
  });

  it("devolve pela ordem do evento, não pela ordem em que foram carregados", () => {
    // O casal carrega no seating plan e só depois se lembra da cerimónia. O
    // email à equipa não pode ler-se "Seating plan · Cerimónia" — a ordem em
    // que as coisas acontecem no dia é informação, e perdê-la faz o resumo
    // parecer aleatório.
    expect(pontosConhecidos(["seating", "cerimonia"]).map((p) => p.id)).toEqual([
      "cerimonia",
      "seating",
    ]);
  });

  it("não repete um ponto marcado duas vezes", () => {
    expect(pontosConhecidos(["mesas", "mesas"]).map((p) => p.id)).toEqual(["mesas"]);
  });

  it("uma lista vazia dá uma lista vazia", () => {
    expect(pontosConhecidos([])).toEqual([]);
  });
});

describe("rotularPontos", () => {
  it("responde na língua do pedido", () => {
    expect(rotularPontos(["cerimonia"], "pt")).toEqual(["Cerimónia"]);
    expect(rotularPontos(["cerimonia"], "en")).toEqual(["Ceremony"]);
  });

  it("uma língua desconhecida cai no português", () => {
    expect(rotularPontos(["bar"], "fr")).toEqual(["Bar"]);
  });
});

describe("linhasDeOrcamento", () => {
  /**
   * O caso da Catarina Martins, tal como aconteceu: a proposta saiu com cinco
   * pontos, ela respondeu a pedir três. Se ela tivesse escolhido no pedido, é
   * ISTO que o estúdio teria aberto — e as palavras são as do quadro
   * "3. Orçamento Proposto" das propostas reais, não uma tradução minha.
   */
  it("dá as linhas do quadro de orçamento, com as palavras das propostas", () => {
    expect(linhasDeOrcamento(["cocktail", "seating", "mesas"])).toEqual([
      "Decoração Cocktail",
      "Design Floral e Decoração Mesas",
      "Seating Plan e Decor Floral Seating Plan",
    ]);
  });

  it("sem escolhas não semeia nada", () => {
    // Importa: é isto que faz o estúdio abrir como sempre abriu para quem não
    // marcou nada, em vez de semear uma proposta inventada.
    expect(linhasDeOrcamento([])).toEqual([]);
  });
});
