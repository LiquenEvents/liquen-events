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

/**
 * Uma proposta COMPLETA — a que se pode mesmo enviar.
 *
 * O fixture era um esqueleto (sem título interno, sem grupos, sem capas, sem
 * mood boards) e passava por «documento certo» porque esta lista não olhava
 * para nada disso: quem olhava era a coluna lateral, com palavras suas, num
 * ecrã à parte. Agora é uma lista só (ver o fim de `conferir`), e um documento
 * certo tem de ser um documento que segue.
 */
const documento = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    ref: "Ana Silva · Decoração",
    clientNames: "Ana Silva",
    eventDate: "18 de Setembro de 2027",
    location: "Évora",
    guests: "120 pax",
    budgetItems: [],
    // Um grupo COM título (é o que a lista exige) e mais nada traduzível: os
    // testes do idioma contam campos, e um fixture cheio de prosa fazia-os
    // contar a prosa do fixture.
    serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [] }],
    moodBoards: [{ images: ["board/1.jpg"] }],
    coverImages: ["capa/1.jpg", "capa/2.jpg"],
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

/**
 * O NÚMERO DE CONVIDADOS PASSAVA POR CONFERIDO SEM SER COMPARADO COM NADA.
 *
 * A verificação só perguntava se o campo estava preenchido: uma proposta a
 * dizer "80 pax" para um pedido de 120 levava o visto verde, e com ele a frase
 * "Está tudo de acordo com o pedido original". É o número que manda no
 * catering e no preço por pessoa — e o aviso do valor também não o apanha,
 * porque o intervalo habitual é construído com os 120 pax DO PEDIDO.
 *
 * Como no mês da data: só se desmente quando o número está mesmo lá escrito. O
 * campo é texto livre ("120 pax", "100 a 150", "cerca de 120") e sem número
 * legível não há nada a contradizer.
 */
describe("os convidados", () => {
  it("passa quando o número da proposta é o do pedido", () => {
    const vs = conferir({
      doc: documento({ guests: "120 pax" }),
      quote: pedido({ guests: 120 }),
      ...base,
    });
    expect(achar(vs, "convidados").severidade).toBe("ok");
  });

  it("avisa quando a proposta é para outro número de pessoas, dizendo os dois", () => {
    const vs = conferir({
      doc: documento({ guests: "80 pax" }),
      quote: pedido({ guests: 120 }),
      ...base,
    });
    const c = achar(vs, "convidados");
    expect(c.severidade).toBe("aviso");
    expect(c.detalhe).toContain("80");
    expect(c.detalhe).toContain("120");
  });

  it("qualquer número: bate com o do pedido, desmente todos os outros", () => {
    // Varrimento, e não três exemplos: o que se prende é a propriedade — o
    // número escrito na proposta é o número que o pedido pediu.
    const falhas: string[] = [];
    for (let pax = 10; pax <= 300; pax++) {
      const igual = conferir({
        doc: documento({ guests: `${pax} pax` }),
        quote: pedido({ guests: pax }),
        ...base,
      });
      if (achar(igual, "convidados").severidade !== "ok") falhas.push(`${pax} = ${pax}`);

      const outro = conferir({
        doc: documento({ guests: `${pax} pax` }),
        quote: pedido({ guests: pax + 20 }),
        ...base,
      });
      if (achar(outro, "convidados").severidade !== "aviso") {
        falhas.push(`${pax} ≠ ${pax + 20}`);
      }
    }
    expect(falhas.slice(0, 5)).toEqual([]);
  });

  it("um intervalo escrito à mão que contenha o número do pedido está certo", () => {
    // "100 a 150" para 120 pax é uma maneira legítima de o escrever — e um
    // aviso que não se consegue justificar ensina-se a ignorar.
    const vs = conferir({
      doc: documento({ guests: "100 a 150 pessoas" }),
      quote: pedido({ guests: 120 }),
      ...base,
    });
    expect(achar(vs, "convidados").severidade).toBe("ok");
  });

  it("sem número legível na proposta, não inventa aviso", () => {
    const vs = conferir({
      doc: documento({ guests: "cerca de uma centena" }),
      quote: pedido({ guests: 120 }),
      ...base,
    });
    expect(achar(vs, "convidados").severidade).toBe("ok");
  });

  it("sem número no pedido, continua a bastar que a proposta o diga", () => {
    // O pedido pode ter vindo só com uma ordem de grandeza ("100 a 150"), e aí
    // não há número para comparar.
    const vs = conferir({
      doc: documento({ guests: "120 pax" }),
      quote: pedido({ guests: undefined }),
      ...base,
    });
    expect(achar(vs, "convidados").severidade).toBe("ok");
  });

  it("vazio continua a ser aviso", () => {
    const vs = conferir({
      doc: documento({ guests: "" }),
      quote: pedido({ guests: 120 }),
      ...base,
    });
    const c = achar(vs, "convidados");
    expect(c.severidade).toBe("aviso");
    expect(c.detalhe).toContain("para quantas pessoas");
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
  it("avisa quando o pedido veio em inglês e a proposta vai sair em português", () => {
    const vs = conferir({ doc: documento(), quote: pedido({ locale: "en" }), ...base });
    expect(achar(vs, "idioma").severidade).toBe("aviso");
    // E diz-lhe ONDE se muda — o selector vive no passo anterior, e um aviso
    // que não diz o que fazer é um aviso que se lê e se ignora.
    expect(achar(vs, "idioma").detalhe).toMatch(/passo anterior/i);
  });

  it("um pedido antigo, sem idioma guardado, não gera verificação nenhuma em português", () => {
    // Silêncio é diferente de "está tudo bem" — e inventar "pt" para os antigos
    // era afirmar um facto que ninguém registou.
    const vs = conferir({ doc: documento(), quote: pedido(), ...base });
    expect(vs.find((v) => v.id === "idioma")).toBeUndefined();
  });

  /**
   * ════════════════════════════════════════════════════════════════════════
   * A FRASE QUE DEIXOU DE SER VERDADE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Esta verificação dizia «O pedido veio em inglês e a proposta é escrita em
   * português», e o comentário por cima dela dizia que não havia um interruptor
   * de idioma no PDF. Há. Reescrita e não duplicada: duas linhas sobre idioma
   * na mesma lista, uma delas falsa, é pior do que não haver nenhuma.
   */
  it("já não afirma que a proposta é SEMPRE escrita em português", () => {
    const todas = [
      ...conferir({ doc: documento(), quote: pedido({ locale: "en" }), ...base }),
      ...conferir({ doc: documento(), quote: pedido({ locale: "pt" }), ...base }),
      ...conferir({ doc: documento(), quote: pedido(), idioma: "en", ...base }),
    ];
    for (const v of todas) {
      expect(v.detalhe).not.toContain("a proposta é escrita em português");
    }
  });

  it("em inglês e sem faltas, passa", () => {
    const vs = conferir({
      doc: documento({
        serviceGroups: [{ title: "Decoração", titleEn: "Decoration", items: [] }],
      }),
      quote: pedido({ locale: "en" }),
      idioma: "en",
      ...base,
    });
    expect(achar(vs, "idioma").severidade).toBe("ok");
  });

  it("em inglês, conta os campos que vão sair em português e nomeia os primeiros", () => {
    const vs = conferir({
      doc: documento({
        serviceGroups: [
          {
            title: "Decoração Floral",
            items: [{ label: "Decor Cerimónia" }, { label: "Decor Jantar" }],
          },
        ],
        budgetItems: ["Decor Cocktail"],
      }),
      quote: pedido({ locale: "en" }),
      idioma: "en",
      ...base,
    });
    const v = achar(vs, "idioma");
    expect(v.severidade).toBe("aviso");
    // Quatro campos: o título do grupo, as duas linhas e a rubrica.
    expect(v.detalhe).toMatch(/\b4\b/);
    expect(v.detalhe).toMatch(/sair em português/i);
    expect(v.detalhe).toContain("Serviços · grupo 1");
  });

  it("em inglês, a contagem NÃO conta o que foi decidido ficar em português", () => {
    // «Lisianthus» traduz-se para «Lisianthus». O botão «Ficar em português»
    // escreve o mesmo texto na caixa inglesa, e é isso que faz a contagem
    // baixar — sem ele, um aviso ficava aceso para sempre.
    const vs = conferir({
      doc: documento({
        serviceGroups: [{ title: "Lisianthus", titleEn: "Lisianthus", items: [] }],
      }),
      quote: pedido({ locale: "en" }),
      idioma: "en",
      ...base,
    });
    expect(achar(vs, "idioma").severidade).toBe("ok");
  });

  it("em português, a contagem das traduções não aparece — nem sequer a verde", () => {
    // O estúdio de quem nunca faz propostas inglesas não ganha uma linha.
    const vs = conferir({
      doc: documento({ serviceGroups: [{ title: "Decoração", items: [] }] }),
      quote: pedido(),
      ...base,
    });
    expect(vs.find((v) => v.id === "idioma")).toBeUndefined();
  });
});

describe("texto de exemplo nas caixas inglesas", () => {
  it("apanha um [TBD] escrito numa caixa inglesa", () => {
    // Um marcador de modelo chega ao cliente exactamente da mesma maneira,
    // esteja escrito em que língua estiver.
    const vs = conferir({
      doc: documento({
        serviceGroups: [{ title: "Decoração", titleEn: "[TBD]", items: [] }],
      }),
      quote: pedido(),
      idioma: "en",
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("erro");
  });

  it("NÃO apanha «a definir» numa caixa inglesa", () => {
    // `POR_SABER` é português, e não faz sentido num campo inglês. O
    // equivalente inglês («TBD») é legítimo numa proposta inglesa pela mesma
    // razão que «a definir» é legítimo num valor adicional.
    const vs = conferir({
      doc: documento({
        serviceGroups: [{ title: "Decoração", titleEn: "a definir", items: [] }],
      }),
      quote: pedido(),
      idioma: "en",
      ...base,
    });
    expect(achar(vs, "placeholders").severidade).toBe("ok");
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMA LISTA, E NÃO TRÊS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Havia esta lista (erro/aviso/conferido), a coluna lateral do passo do
 * conteúdo (trava/conselho, e só acima de 1280 px) e uma frase estática por
 * baixo do botão a repetir uma terceira versão do mesmo, sem links. Passa a
 * haver uma: os impedimentos entram AQUI, e a regra de o que trava continua a
 * nascer em `proposal-progress`.
 */
describe("o que falta para enviar entra nesta lista", () => {
  it("o que não tinha voz aqui passa a ter, marcado como trava", () => {
    const vs = conferir({ doc: documento({ ref: "" }), quote: pedido(), ...base });
    const titulo = achar(vs, "titulo-interno");
    expect(titulo.severidade).toBe("erro");
    expect(titulo.trava).toBe(true);
    expect(titulo.seccao).toBe("evento");
    expect(titulo.campo).toBe("ref");
  });

  it("o que já tinha voz NÃO é dito duas vezes — ganha só a marca", () => {
    const vs = conferir({ doc: documento({ clientNames: "" }), quote: pedido(), ...base });
    // Uma linha e uma só sobre o nome. Duas — uma delas mais pobre — é como se
    // ensina alguém a deixar de ler a lista.
    expect(vs.filter((v) => v.id === "nome")).toHaveLength(1);
    const nome = achar(vs, "nome");
    expect(nome.trava).toBe(true);
    // E fica com a frase DESTA lista, que sabe comparar com o pedido.
    expect(nome.detalhe).toBe("Está vazio na proposta.");
  });

  it("o que trava vem primeiro", () => {
    const vs = conferir({
      doc: documento({ clientNames: "", location: "" }),
      quote: pedido(),
      ...base,
    });
    // Sem esta linha o teste passava com ZERO travas — `lastIndexOf` devolve
    // -1 e -1 é sempre menor do que 0. Era um verde por vacuidade.
    expect(vs.filter((v) => v.trava)).toHaveLength(1);
    const primeiroConselho = vs.findIndex((v) => !v.trava);
    const ultimaTrava = vs.map((v) => !!v.trava).lastIndexOf(true);
    expect(ultimaTrava).toBeLessThan(primeiroConselho);
  });

  it("cada linha sabe onde se resolve", () => {
    const vs = conferir({ doc: documento(), quote: pedido(), ...base });
    expect(achar(vs, "nome").campo).toBe("clientNames");
    expect(achar(vs, "data").campo).toBe("eventDate");
    expect(achar(vs, "local").campo).toBe("location");
    expect(achar(vs, "convidados").campo).toBe("guests");
    expect(achar(vs, "valor").campo).toBe("totalAmount");
    // O texto de exemplo pode estar em QUALQUER campo: não inventa um link.
    expect(achar(vs, "placeholders").seccao).toBeUndefined();
  });

  it("CONTROLO POSITIVO: uma proposta que pode seguir não tem nenhuma trava", () => {
    // Sem isto, «tem trava» acima podia estar a passar por a lista trazer
    // sempre travas, em qualquer documento.
    const vs = conferir({
      doc: documento({ totalText: "12.000,00 € + IVA" }),
      ...{ quote: pedido() },
      ...base,
    });
    expect(vs.some((v) => v.trava)).toBe(false);
  });
});
