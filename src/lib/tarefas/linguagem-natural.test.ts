import { describe, expect, it } from "vitest";
import { interpretarTarefa } from "./linguagem-natural";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O QUE SE LÊ DE UMA LINHA — E, SOBRETUDO, O QUE NÃO SE LÊ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Metade destes testes prova extracções. A outra metade prova RECUSAS, e é a
 * metade que interessa: uma extracção que acerta nove em cada dez vezes é pior
 * do que não haver nenhuma, porque a décima passa despercebida até ao dia da
 * tarefa. Cada recusa aqui tem a razão escrita ao lado.
 *
 * O relógio é injectado em todos: «amanhã» não se consegue prender num teste
 * sem fixar o dia. O dia escolhido — **10 de Setembro de 2026, uma
 * quinta-feira** — não é ao acaso: é quinta, que é a palavra mais perigosa
 * deste ficheiro nesta casa, e é Setembro, que é depois de Junho e obriga o
 * «12/06» a andar para o ano seguinte.
 */
const QUINTA_10_SET_2026 = new Date(2026, 8, 10, 9, 30);
const ler = (texto: string, agora: Date = QUINTA_10_SET_2026) =>
  interpretarTarefa(texto, { agora });

describe("datas relativas", () => {
  it("lê «hoje», «amanhã» e «depois de amanhã»", () => {
    expect(ler("Ligar ao florista hoje").data?.valor).toBe("2026-09-10");
    expect(ler("Ligar ao florista amanhã").data?.valor).toBe("2026-09-11");
    expect(ler("Ligar ao florista depois de amanhã").data?.valor).toBe("2026-09-12");
  });

  it("leva a preposição com ela, para o título não ficar truncado", () => {
    // «Confirmar florista para» é o sinal de que a extracção correu mal, mesmo
    // com a data certa.
    expect(ler("Confirmar florista para amanhã").titulo).toBe("Confirmar florista");
    expect(ler("Confirmar florista para amanhã").data?.valor).toBe("2026-09-11");
  });

  it("«ontem» não é uma data de tarefa", () => {
    // Uma tarefa que se cria para ontem quase nunca é uma tarefa para ontem —
    // é uma frase («falei com ela ontem»). E o único erro que não se perdoa é
    // pôr a tarefa no passado sem ninguém o ter escrito.
    const r = ler("Falei com a Ana ontem sobre o florista");
    expect(r.data).toBeUndefined();
    expect(r.titulo).toBe("Falei com a Ana ontem sobre o florista");
  });
});

describe("dias da semana", () => {
  it("lê os nomes dos dias e dá a ocorrência mais próxima que não passou", () => {
    expect(ler("Confirmar florista sexta").data?.valor).toBe("2026-09-11");
    expect(ler("Carregar carrinha sábado").data?.valor).toBe("2026-09-12");
    expect(ler("Rever seating plan domingo").data?.valor).toBe("2026-09-13");
    expect(ler("Enviar proposta segunda").data?.valor).toBe("2026-09-14");
  });

  it("o nome do dia de hoje é hoje, e «próxima» empurra para a semana seguinte", () => {
    // Escrito numa quinta-feira. Sem o «próxima», a ocorrência mais perto é a
    // de hoje — nunca uma data no passado. Com «próxima», ela disse
    // explicitamente que não era esta.
    expect(ler("Fechar menu quinta-feira").data?.valor).toBe("2026-09-10");
    expect(ler("Fechar menu na próxima quinta").data?.valor).toBe("2026-09-17");
  });

  /**
   * O CASO QUE DÁ NOME A ESTE FICHEIRO. Numa empresa de casamentos no Alentejo,
   * «quinta» é o sítio onde a festa acontece — e o exemplo da Parte 3 do
   * documento é, à letra, «Confirmar florista para a Quinta do Vale».
   */
  it("«Quinta do Vale» é um local, não é quinta-feira", () => {
    const r = ler("Confirmar florista para a Quinta do Vale");
    expect(r.data).toBeUndefined();
    expect(r.titulo).toBe("Confirmar florista para a Quinta do Vale");
  });

  it("«quinta» sozinha não conta; com «-feira» ou com preposição, conta", () => {
    expect(ler("Ver quinta").data).toBeUndefined();
    expect(ler("Ver na quinta").data?.valor).toBe("2026-09-10");
    expect(ler("Ver quinta-feira").data?.valor).toBe("2026-09-10");
  });

  it("o artigo sozinho desliga o dia — «a sexta página» é um ordinal", () => {
    // Um dia concreto escreve-se «na sexta» ou «até sexta». «A sexta» é
    // ordinal e «à sexta» é hábito; nenhum dos dois é uma data.
    expect(ler("Rever a sexta página do contrato").data).toBeUndefined();
    expect(ler("Confirmar florista para a quinta").data).toBeUndefined();
    expect(ler("Confirmar florista na sexta").data?.valor).toBe("2026-09-11");
    expect(ler("Confirmar florista até sexta").data?.valor).toBe("2026-09-11");
  });

  it("nenhum dia sobrevive a um «de/do/da» a seguir", () => {
    // «segunda de Junho», «sexta do mês» — aí a palavra é ordinal, não é dia.
    expect(ler("Marcar a segunda de Junho").data).toBeUndefined();
  });
});

describe("dias do mês e datas escritas", () => {
  it("«dia 12» é o 12 mais próximo no futuro — o ano e o mês nunca andam para trás", () => {
    expect(ler("Ligar ao Bruno dia 12").data?.valor).toBe("2026-09-12");
    expect(ler("Ligar ao Bruno dia 12").titulo).toBe("Ligar ao Bruno");
    // Já passou este mês: salta para o mês seguinte.
    expect(ler("Ligar ao Bruno dia 3").data?.valor).toBe("2026-10-03");
  });

  it("«dia 12» escrito no dia 12 é hoje", () => {
    expect(ler("Ligar ao Bruno dia 12", new Date(2026, 8, 12, 16, 0)).data?.valor).toBe(
      "2026-09-12",
    );
  });

  it("«dia 31» salta o mês que não tem 31 em vez de encostar ao 30", () => {
    // Encostar ao 30 seria mudar-lhe a data em silêncio.
    expect(ler("Fechar contas dia 31").data?.valor).toBe("2026-10-31");
  });

  it("lê «12/06» como o próximo 12 de Junho, e não o que já passou", () => {
    expect(ler("Enviar contrato 12/06").data?.valor).toBe("2027-06-12");
    expect(ler("Enviar contrato 12/09").data?.valor).toBe("2026-09-12");
  });

  it("com o ano escrito, respeita-se o que ela escreveu", () => {
    expect(ler("Enviar contrato 12/06/2027").data?.valor).toBe("2027-06-12");
    // Mesmo para trás: uma tarefa que nasce atrasada é uma coisa que acontece,
    // e o ano estava lá escrito.
    expect(ler("Enviar contrato 12/06/2026").data?.valor).toBe("2026-06-12");
  });

  it("lê o mês por nome, inteiro ou abreviado", () => {
    expect(ler("Prova de bolo 12 de junho").data?.valor).toBe("2027-06-12");
    expect(ler("Prova de bolo 3 out").data?.valor).toBe("2026-10-03");
    expect(ler("Prova de bolo dia 12 de junho de 2027").data?.valor).toBe("2027-06-12");
    expect(ler("Prova de bolo dia 12 de junho de 2027").titulo).toBe("Prova de bolo");
  });

  it("uma data que não existe no calendário não se extrai", () => {
    expect(ler("Enviar contrato 31/02").data).toBeUndefined();
    expect(ler("Enviar contrato 30/02/2027").data).toBeUndefined();
  });

  /**
   * SÓ COM BARRAS. Um «12-06» lê-se como intervalo e um «12.06» como número
   * decimal. Reconhecer qualquer um deles como data era apanhar preços,
   * numerações de contrato e intervalos de horas.
   */
  it("não lê traços nem pontos como separadores de data", () => {
    expect(ler("Montagem 12-06").data).toBeUndefined();
    expect(ler("Montagem 12.06").data).toBeUndefined();
  });

  it("um ano de dois algarismos fica de fora", () => {
    // Em «12/06/27» o 27 tanto é o ano como um terceiro campo qualquer, e as
    // duas leituras dão datas diferentes.
    expect(ler("Enviar contrato 12/06/27").data).toBeUndefined();
  });
});

describe("contagens", () => {
  it("lê «daqui a N dias» e «dentro de N semanas»", () => {
    expect(ler("Retomar daqui a 3 dias").data?.valor).toBe("2026-09-13");
    expect(ler("Retomar dentro de 2 semanas").data?.valor).toBe("2026-09-24");
    expect(ler("Retomar daqui a uma semana").data?.valor).toBe("2026-09-17");
    expect(ler("Retomar daqui a 1 mês").data?.valor).toBe("2026-10-10");
  });

  it("um número solto não é uma contagem", () => {
    expect(ler("Reservar quartos para 2 dias").data).toBeUndefined();
  });

  it("«para a semana» e «próxima semana» não dizem que dia", () => {
    // Segunda? Sexta? Sete dias a contar de hoje? São três leituras e nenhuma
    // é a evidente — e o campo é uma data, não uma semana.
    expect(ler("Rever orçamento para a semana").data).toBeUndefined();
    expect(ler("Rever orçamento na próxima semana").data).toBeUndefined();
  });
});

describe("horas", () => {
  it("lê «às 10h», «10h30», «10:00» e «às 10 horas»", () => {
    expect(ler("Ligar às 10h").hora?.valor).toBe("10:00");
    expect(ler("Ligar 10h30").hora?.valor).toBe("10:30");
    expect(ler("Ligar hoje 10:00").hora?.valor).toBe("10:00");
    expect(ler("Ligar às 9 horas").hora?.valor).toBe("09:00");
  });

  it("a hora e a data vivem lado a lado sem se comerem", () => {
    const r = ler("Confirmar florista amanhã às 10h");
    expect(r.data?.valor).toBe("2026-09-11");
    expect(r.hora?.valor).toBe("10:00");
    expect(r.titulo).toBe("Confirmar florista");
  });

  it("uma hora que não existe no relógio não se extrai", () => {
    expect(ler("Reunião 25h").hora).toBeUndefined();
    expect(ler("Reunião 10h60").hora).toBeUndefined();
  });

  /** O caso do preço. A vírgula não é separador de horas em lado nenhum. */
  it("«12,50» é dinheiro, não é uma hora nem uma data", () => {
    const r = ler("Pagar fatura de 12,50 ao florista");
    expect(r.hora).toBeUndefined();
    expect(r.data).toBeUndefined();
    expect(r.titulo).toBe("Pagar fatura de 12,50 ao florista");
  });

  it("um número solto não é uma hora", () => {
    // «Levar 10 cadeiras» às dez da manhã? Só se ela escrever «h», «:» ou «às».
    expect(ler("Levar 10 cadeiras").hora).toBeUndefined();
  });

  /**
   * «de manhã» está na tabela da Parte 3, e fica de fora de propósito: para o
   * guardar era preciso inventar um número — 09:00? 10:00? — e um número
   * inventado, escrito com dois pontos no meio, lê-se como uma coisa que ela
   * escreveu. Se for para o ter, a convenção decide-se com ela primeiro.
   */
  it("«de manhã» não vira uma hora inventada", () => {
    expect(ler("Ligar ao florista de manhã").hora).toBeUndefined();
    expect(ler("Ligar ao florista à noite").hora).toBeUndefined();
  });
});

describe("responsável, evento e prioridade", () => {
  it("`#` é o responsável e `@` é o evento, como na Parte 3", () => {
    const r = ler("Confirmar florista #Ana @Melanie");
    expect(r.responsavel?.valor).toBe("Ana");
    expect(r.evento?.valor).toBe("Melanie");
    expect(r.titulo).toBe("Confirmar florista");
  });

  /** O caso do endereço de correio: o `@` vem colado à palavra anterior. */
  it("um `@` dentro de uma palavra é correio, não é um evento", () => {
    const r = ler("Mandar contrato para ana@liquen.pt");
    expect(r.evento).toBeUndefined();
    expect(r.titulo).toBe("Mandar contrato para ana@liquen.pt");
  });

  it("`#` seguido de número não é ninguém", () => {
    expect(ler("Rever proposta #2").responsavel).toBeUndefined();
  });

  it("lê `!`, `!!` e `!alta`, `!baixa`", () => {
    expect(ler("Ligar ao florista !").prioridade?.valor).toBe("alta");
    expect(ler("Ligar ao florista !!").prioridade?.valor).toBe("alta");
    expect(ler("Ligar ao florista !alta").prioridade?.valor).toBe("alta");
    expect(ler("Ligar ao florista !baixa").prioridade?.valor).toBe("baixa");
    expect(ler("Ligar ao florista !normal").prioridade?.valor).toBe("normal");
  });

  /**
   * `!` e `!!` dão os dois «alta»: o `TaskPriority` desta casa tem três degraus
   * e acima de «alta» não há para onde ir. Quem desenha distingue os dois pelo
   * `texto` da marca, sem que isto invente um quarto degrau.
   */
  it("o `!!` guarda o que estava escrito, para o ecrã poder desenhá-lo", () => {
    expect(ler("Ligar ao florista !!").prioridade?.texto).toBe("!!");
    expect(ler("Ligar ao florista !").prioridade?.texto).toBe("!");
    // E os dois valem o mesmo campo, porque o modelo não tem mais degraus.
    expect(ler("Ligar ao florista !!").prioridade?.valor).toBe(
      ler("Ligar ao florista !").prioridade?.valor,
    );
  });

  it("um `!` colado à palavra anterior é pontuação", () => {
    const r = ler("Ligar ao florista hoje!");
    expect(r.prioridade).toBeUndefined();
    expect(r.data?.valor).toBe("2026-09-10");
    expect(r.titulo).toBe("Ligar ao florista!");
  });
});

describe("a hesitação não se resolve por sorteio", () => {
  it("duas datas na mesma linha anulam-se as duas", () => {
    // «amanhã ou na sexta» não tem uma data: tem uma hesitação. Escolher a
    // primeira era adivinhar.
    const r = ler("Ligar ao florista amanhã ou na sexta");
    expect(r.data).toBeUndefined();
    expect(r.titulo).toBe("Ligar ao florista amanhã ou na sexta");
  });

  it("mas uma data escrita de duas maneiras sobrepostas conta uma vez", () => {
    // «dia 12 de junho» é apanhado pelo «dia 12» e pelo «12 de junho»: ganha o
    // pedaço mais comprido e o outro desaparece sem contar como segunda data.
    const r = ler("Prova de bolo dia 12 de junho");
    expect(r.data?.valor).toBe("2027-06-12");
    expect(r.titulo).toBe("Prova de bolo");
  });

  it("um intervalo de horas não é uma hora", () => {
    // «das 10h às 12h» são duas horas na mesma linha: qual delas é a da tarefa?
    const r = ler("Reunião de equipa das 10h às 12h");
    expect(r.hora).toBeUndefined();
    expect(r.titulo).toBe("Reunião de equipa das 10h às 12h");
  });

  it("dois responsáveis anulam-se, e o resto da linha continua a valer", () => {
    const r = ler("Confirmar florista #Ana #Catarina amanhã");
    expect(r.responsavel).toBeUndefined();
    expect(r.data?.valor).toBe("2026-09-11");
    expect(r.titulo).toBe("Confirmar florista #Ana #Catarina");
  });
});

describe("o título e as posições", () => {
  /** A linha que o documento usa como exemplo, do princípio ao fim. */
  it("lê a linha inteira do documento", () => {
    const texto = "Confirmar florista amanhã às 10h #Ana !alta";
    const r = ler(texto);
    expect(r.titulo).toBe("Confirmar florista");
    expect(r.data?.valor).toBe("2026-09-11");
    expect(r.hora?.valor).toBe("10:00");
    expect(r.responsavel?.valor).toBe("Ana");
    expect(r.prioridade?.valor).toBe("alta");
    expect(r.marcas.map((m) => m.tipo)).toEqual(["data", "hora", "responsavel", "prioridade"]);
  });

  it("as posições apontam para o texto ORIGINAL, que é onde as pastilhas se desenham", () => {
    const texto = "Confirmar florista amanhã às 10h #Ana !alta";
    for (const m of ler(texto).marcas) {
      expect(texto.slice(m.inicio, m.fim)).toBe(m.texto);
    }
  });

  it("as marcas vêm por ordem de aparição", () => {
    const marcas = ler("!! #Ana Confirmar florista amanhã").marcas;
    expect(marcas.map((m) => m.inicio)).toEqual(
      [...marcas.map((m) => m.inicio)].sort((a, b) => a - b),
    );
  });

  /**
   * SE DO TÍTULO NÃO SOBRAR NADA, NÃO SE EXTRAI NADA. Uma tarefa sem nome não
   * se cria, e uma biblioteca que devolve o título vazio faz com que quem a
   * monta tenha de se lembrar disso. Fica a linha inteira, e ela corrige.
   */
  it("uma linha que é só uma data fica como título", () => {
    expect(ler("amanhã")).toEqual({ titulo: "amanhã", marcas: [] });
    expect(ler("amanhã às 10h")).toEqual({ titulo: "amanhã às 10h", marcas: [] });
  });

  it("uma linha sem nada de reconhecível volta inteira", () => {
    const r = ler("Ligar ao Bruno sobre o alinhamento das mesas");
    expect(r).toEqual({ titulo: "Ligar ao Bruno sobre o alinhamento das mesas", marcas: [] });
  });

  it("o vazio não rebenta nem inventa", () => {
    expect(ler("")).toEqual({ titulo: "", marcas: [] });
    expect(ler("   ")).toEqual({ titulo: "", marcas: [] });
  });

  it("os espaços que ficam onde estava a pastilha desaparecem", () => {
    expect(ler("Confirmar   florista    amanhã").titulo).toBe("Confirmar florista");
    expect(ler("Confirmar florista amanhã, sem falta").titulo).toBe(
      "Confirmar florista, sem falta",
    );
    expect(ler("Confirmar florista #Ana.").titulo).toBe("Confirmar florista.");
  });

  /** A repetição está na tabela da Parte 3 e não tem onde ficar guardada. */
  it("«todas as semanas» não vira nada — a repetição não existe no modelo", () => {
    const r = ler("Rever caixa todas as semanas");
    expect(r).toEqual({ titulo: "Rever caixa todas as semanas", marcas: [] });
  });
});
