import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "./types";
import { conferir, temReparos, type Verificacao } from "./conferencia";

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LQ-1",
    submittedAt: "2026-01-01T00:00:00.000Z",
    status: "pendente",
    name: "Ana Silva",
    date: "2027-09-18",
    location: "Évora",
    guests: 120,
    ...over,
  }) as Quote;

const documento = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    clientNames: "Ana Silva",
    eventDate: "18 de Setembro de 2027",
    location: "Évora",
    guests: "120 pax",
    budgetItems: [],
    serviceGroups: [],
    ...over,
  }) as ProposalDoc;

const achar = (vs: Verificacao[], id: string) => vs.find((v) => v.id === id)!;

const base = { historico: [] as Quote[], totalBruto: 12_000 };

describe("o nome", () => {
  it("passa quando bate certo, ignorando acentos e maiúsculas", () => {
    const vs = conferir({ doc: documento({ clientNames: "ANA SILVA" }), quote: pedido(), ...base });
    expect(achar(vs, "nome").severidade).toBe("ok");
  });

  it("avisa quando difere do pedido, dizendo os dois", () => {
    const vs = conferir({
      doc: documento({ clientNames: "Ana e Rui" }),
      quote: pedido({ name: "Maria Silva" }),
      ...base,
    });
    const nome = achar(vs, "nome");
    // NÃO é um erro: o pedido pode ter sido feito pela mãe da noiva. Mas é
    // sempre para olhar, e ver os dois lado a lado é o que resolve em 2 s.
    expect(nome.severidade).toBe("aviso");
    expect(nome.detalhe).toContain("Ana e Rui");
    expect(nome.detalhe).toContain("Maria Silva");
  });

  it("vazio é erro, não aviso", () => {
    const vs = conferir({ doc: documento({ clientNames: "" }), quote: pedido(), ...base });
    expect(achar(vs, "nome").severidade).toBe("erro");
  });
});

describe("data e local", () => {
  it("aceita a data por extenso quando o dia e o ano batem certo", () => {
    const vs = conferir({
      doc: documento({ eventDate: "18 de Setembro de 2027" }),
      quote: pedido({ date: "2027-09-18" }),
      ...base,
    });
    expect(achar(vs, "data").severidade).toBe("ok");
  });

  it("avisa quando o dia não é o do pedido", () => {
    const vs = conferir({
      doc: documento({ eventDate: "25 de Setembro de 2027" }),
      quote: pedido({ date: "2027-09-18" }),
      ...base,
    });
    expect(achar(vs, "data").severidade).toBe("aviso");
  });

  /**
   * O MÊS TROCADO PASSAVA POR CONFERIDO.
   *
   * A comparação lia o ano e o dia e ignorava o mês — que é justamente o pedaço
   * que se troca ao escrever a data por extenso, porque é o único que se escreve
   * por palavras. Um pedido para 18 de Setembro com a proposta a dizer 18 de
   * Outubro levava um visto verde e "Está tudo de acordo com o pedido original".
   *
   * O que sai daqui vai para o cliente e é a data que ele mete na cabeça. Não
   * dizer nada é pior do que não conferir: quem lê o visto deixa de conferir.
   */
  it("avisa quando o mês não é o do pedido, ainda que o dia e o ano batam", () => {
    const vs = conferir({
      doc: documento({ eventDate: "18 de Outubro de 2027" }),
      quote: pedido({ date: "2027-09-18" }),
      ...base,
    });
    const data = achar(vs, "data");
    expect(data.severidade).toBe("aviso");
    expect(data.detalhe).toContain("Outubro");
  });

  it("não inventa aviso quando a proposta não escreve mês nenhum reconhecível", () => {
    // O campo é texto livre. Se não há mês legível, não há mês para desmentir —
    // e um aviso que não se consegue justificar ensina-se a ignorar.
    const vs = conferir({
      doc: documento({ eventDate: "18.09.2027" }),
      quote: pedido({ date: "2027-09-18" }),
      ...base,
    });
    expect(achar(vs, "data").severidade).toBe("ok");
  });

  it("aceita o mês escrito sem acentos", () => {
    const vs = conferir({
      doc: documento({ eventDate: "Sábado, 1 de marco de 2027" }),
      quote: pedido({ date: "2027-03-01" }),
      ...base,
    });
    expect(achar(vs, "data").severidade).toBe("ok");
  });

  it("avisa quando o local difere", () => {
    const vs = conferir({
      doc: documento({ location: "Quinta em Palmela" }),
      quote: pedido({ location: "Évora" }),
      ...base,
    });
    expect(achar(vs, "local").severidade).toBe("aviso");
  });
});

describe("texto de exemplo esquecido", () => {
  it("apanha os marcadores dos modelos", () => {
    // "[Valor Total]" a chegar ao cliente diz-lhe, com todas as letras, que
    // recebeu um modelo por preencher.
    const vs = conferir({
      doc: documento({ totalText: "[Valor Total]" }),
      quote: pedido(),
      ...base,
    });
    const p = achar(vs, "placeholders");
    expect(p.severidade).toBe("erro");
    expect(p.detalhe).toContain("[Valor Total]");
  });

  it("procura também dentro das linhas e dos serviços", () => {
    const vs = conferir({
      doc: documento({
        budgetItems: ["Decoração xxx"],
        serviceGroups: [{ id: "g", letter: "a)", title: "a definir", items: [] }],
      }),
      quote: pedido(),
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("erro");
  });

  /**
   * O «A DEFINIR» DE UM VALOR ADICIONAL NÃO É TEXTO DE EXEMPLO.
   *
   * O `valueText` de um adicional é texto livre — está escrito em
   * `proposal-budget.ts`, e as propostas verdadeiras da Líquen usam-no assim:
   * "896,00 €", "895,00 € + IVA", "a definir", "sob consulta". Escrever
   * «Deslocação da equipa Líquen — a definir» porque ainda não se sabe o local
   * é o comportamento certo, e a conferência acendia-o a vermelho como «Texto
   * de exemplo · Ficou por substituir».
   *
   * O custo não era o vermelho a mais: era ela aprender a ignorar o único
   * aviso que existe para apanhar um "[Valor Total]" a caminho do cliente.
   */
  it("«a definir» num valor adicional é um valor legítimo, não um resto de modelo", () => {
    const vs = conferir({
      doc: documento({
        totalText: "12.000,00 € + IVA",
        budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "a definir" }],
      }),
      quote: pedido(),
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("ok");
  });

  it("«sob consulta» também", () => {
    const vs = conferir({
      doc: documento({
        totalText: "12.000,00 € + IVA",
        budgetExtras: [{ label: "Tecidos suspensos", valueText: "sob consulta" }],
      }),
      quote: pedido(),
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("ok");
  });

  it("mas um marcador de modelo num adicional continua a ser erro", () => {
    // O que se abriu foi o texto livre do VALOR — não a porta a um "[Valor]"
    // a caminho do cliente.
    const vs = conferir({
      doc: documento({
        totalText: "12.000,00 € + IVA",
        budgetExtras: [{ label: "Wedding Coordinator", valueText: "[Valor]" }],
      }),
      quote: pedido(),
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("erro");
  });

  it("o rótulo de um adicional não é texto livre — «a definir» aí é erro", () => {
    // O valor é que fica por saber; o NOME do que se está a cobrar, não.
    const vs = conferir({
      doc: documento({
        totalText: "12.000,00 € + IVA",
        budgetExtras: [{ label: "a definir", valueText: "896,00 €" }],
      }),
      quote: pedido(),
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("erro");
  });

  it("não inventa problemas num documento limpo", () => {
    const vs = conferir({
      doc: documento({ totalText: "12.000,00 € + IVA" }),
      quote: pedido(),
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("ok");
  });
});

describe("o valor", () => {
  it("sem valor é erro", () => {
    const vs = conferir({ doc: documento(), quote: pedido(), historico: [], totalBruto: 0 });
    expect(achar(vs, "valor").severidade).toBe("erro");
  });

  it("avisa quando está fora do que ela costuma cobrar", () => {
    const historico = Array.from({ length: 10 }, (_, i) =>
      pedido({ id: `H-${i}`, status: "aceite", guests: 120, quotedPrice: 10_000 }),
    );
    const vs = conferir({ doc: documento(), quote: pedido(), historico, totalBruto: 3_000 });
    const valor = achar(vs, "valor");
    expect(valor.severidade).toBe("aviso");
    expect(valor.detalhe).toContain("120 pax");
  });

  /**
   * O TOTAL DA PROPOSTA É BRUTO; O `quotedPrice` DO HISTÓRICO É LÍQUIDO.
   *
   * O estúdio passa aqui o total COM IVA (`money.gross`), e o padrão era
   * construído com os `quotedPrice` dos pedidos antigos, que é o campo "Preço
   * final (SEM IVA)". Dez casamentos de 120 pax cobrados a 10.000 € davam um
   * intervalo de 10.000 a 10.000, e a proposta seguinte — cotada exactamente ao
   * mesmo preço, 10.000 € + IVA = 12.300 € — aparecia "acima do habitual".
   *
   * Todas as vezes. E o aviso que existe para apanhar um zero a mais aprende-se
   * a ignorar em duas semanas.
   */
  it("uma proposta cotada ao preço do costume não é «acima do habitual»", () => {
    const historico = Array.from({ length: 10 }, (_, i) =>
      pedido({ id: `H-${i}`, status: "aceite", guests: 120, quotedPrice: 10_000 }),
    );
    const vs = conferir({
      doc: documento(),
      quote: pedido(),
      historico,
      totalBruto: 12_300, // os mesmos 10.000 €, com IVA
    });
    expect(achar(vs, "valor").severidade).toBe("ok");
  });

  it("sem histórico que chegue, não diz nada sobre o preço", () => {
    const vs = conferir({ doc: documento(), quote: pedido(), historico: [], totalBruto: 3_000 });
    expect(achar(vs, "valor").severidade).toBe("ok");
  });
});

describe("idioma", () => {
  it("avisa quando o pedido veio em inglês", () => {
    const vs = conferir({ doc: documento(), quote: pedido({ locale: "en" }), ...base });
    expect(achar(vs, "idioma").severidade).toBe("aviso");
  });

  it("um pedido antigo, sem idioma guardado, não gera verificação nenhuma", () => {
    // Silêncio é diferente de "está tudo bem" — e inventar "pt" para os antigos
    // era afirmar um facto que ninguém registou.
    const vs = conferir({ doc: documento(), quote: pedido(), ...base });
    expect(vs.find((v) => v.id === "idioma")).toBeUndefined();
  });
});

describe("a lista toda", () => {
  it("devolve também o que passou, não só os problemas", () => {
    // Uma lista só com problemas não diz se as outras verificações foram
    // sequer feitas — e é essa dúvida que faz voltar a conferir à mão.
    const vs = conferir({ doc: documento(), quote: pedido(), ...base });
    expect(vs.some((v) => v.severidade === "ok")).toBe(true);
    expect(vs.map((v) => v.id)).toContain("convidados");
  });

  it("um documento certo não tem reparos", () => {
    const vs = conferir({
      doc: documento({ totalText: "12.000,00 € + IVA" }),
      quote: pedido(),
      ...base,
    });
    expect(temReparos(vs)).toBe(false);
  });
});
