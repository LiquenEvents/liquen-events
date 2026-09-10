import { describe, expect, it } from "vitest";
import {
  anoDoCalendario,
  fechadosNoAno,
  MESES,
  nomeDoDia,
  resumoDoMes,
  type DiaDoAno,
  type MesDoAno,
} from "./ano-do-calendario";
import type { CalendarEvent, CalendarEventKind, Quote, QuoteStatus } from "./types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CONTA QUE RESPONDE A «TEMOS LIVRE EM JULHO DE 2027?»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que estes casos guardam é a fronteira do que FECHA um dia. É aí que a
 * vista de ano se estraga sem dar erro: um pedido por responder a fechar o dia
 * faz um ano com procura parecer um ano cheio, e ela recusa trabalho que tinha
 * como fazer; um pedido ganho a NÃO fechar o dia faz o contrário, e essa
 * engana-se uma vez só — no dia em que se marcam dois casamentos para o mesmo
 * sábado.
 */

const pedido = (over: Partial<Quote> & { id: string; date: string; status: QuoteStatus }): Quote =>
  ({ name: "Marta Nunes", guests: 80, ...over }) as unknown as Quote;

const marcacao = (id: string, date: string, kind: CalendarEventKind): CalendarEvent => ({
  id,
  date,
  kind,
  title: "Prova de bolo",
  createdAt: "2027-01-01T10:00:00.000Z",
});

/** O dia `dd` de um mês (1–12) do ano montado. */
const diaDe = (meses: MesDoAno[], mes: number, dia: number): DiaDoAno =>
  meses[mes - 1].dias[dia - 1];

describe("o que fecha um dia", () => {
  it("uma proposta enviada e um negócio ganho fecham", () => {
    const meses = anoDoCalendario(
      2027,
      [
        pedido({ id: "A", date: "2027-07-10", status: "cotado" }),
        pedido({ id: "B", date: "2027-07-17", status: "aceite" }),
      ],
      [],
    );

    expect(diaDe(meses, 7, 10).estado).toBe("fechado");
    expect(diaDe(meses, 7, 17).estado).toBe("fechado");
    expect(meses[6].fechados).toBe(2);
  });

  it("um pedido por responder MARCA o dia, e não o fecha", () => {
    // Se fechasse, dois pedidos para a mesma data fechavam-se um ao outro e um
    // ano com procura passava a ler-se como um ano cheio.
    const meses = anoDoCalendario(
      2027,
      [
        pedido({ id: "A", date: "2027-07-10", status: "pendente" }),
        pedido({ id: "B", date: "2027-07-10", status: "em_revisao" }),
      ],
      [],
    );

    expect(diaDe(meses, 7, 10).estado).toBe("marcado");
    expect(diaDe(meses, 7, 10).quantas).toBe(2);
    expect(meses[6].fechados).toBe(0);
    expect(meses[6].marcados).toBe(1);
  });

  it("um pedido perdido não ocupa dia nenhum", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2027-07-10", status: "rejeitado" })],
      [],
    );

    expect(diaDe(meses, 7, 10).estado).toBe("livre");
    expect(resumoDoMes(meses[6])).toBe("Livre");
  });

  it("um pedido arquivado também não — saiu da vista em todo o lado", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2027-07-10", status: "aceite", archived: true })],
      [],
    );

    expect(diaDe(meses, 7, 10).estado).toBe("livre");
  });

  it("uma data por marcar («a definir») não entra em mês nenhum", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "a definir", status: "aceite" })],
      [],
    );

    expect(fechadosNoAno(meses)).toBe(0);
  });

  it("um bloqueio e um evento à mão fecham; uma reunião e uma nota só marcam", () => {
    const meses = anoDoCalendario(
      2027,
      [],
      [
        marcacao("m1", "2027-07-01", "bloqueio"),
        marcacao("m2", "2027-07-02", "evento"),
        marcacao("m3", "2027-07-03", "reuniao"),
        marcacao("m4", "2027-07-04", "nota"),
      ],
    );

    expect(diaDe(meses, 7, 1).estado).toBe("fechado");
    expect(diaDe(meses, 7, 2).estado).toBe("fechado");
    expect(diaDe(meses, 7, 3).estado).toBe("marcado");
    expect(diaDe(meses, 7, 4).estado).toBe("marcado");
  });

  it("basta uma coisa a fechar para o dia ficar fechado, mesmo com marcações por cima", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2027-07-10", status: "pendente" })],
      [marcacao("m1", "2027-07-10", "bloqueio"), marcacao("m2", "2027-07-10", "nota")],
    );

    const dia = diaDe(meses, 7, 10);
    expect(dia.estado).toBe("fechado");
    expect(dia.quantas).toBe(3);
  });
});

describe("um casamento de vários dias ocupa os dias todos", () => {
  it("de sexta a domingo fecha os três", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2027-07-09", endDate: "2027-07-11", status: "aceite" })],
      [],
    );

    expect(diaDe(meses, 7, 9).estado).toBe("fechado");
    expect(diaDe(meses, 7, 10).estado).toBe("fechado");
    expect(diaDe(meses, 7, 11).estado).toBe("fechado");
    expect(diaDe(meses, 7, 12).estado).toBe("livre");
    // Três DIAS fechados a partir de UM evento — a contagem é de dias.
    expect(meses[6].fechados).toBe(3);
    expect(diaDe(meses, 7, 9).quantas).toBe(1);
  });

  it("uma passagem de ano conta no ano em que se pede, e só nesses dias", () => {
    // 30/12/2026 a 02/01/2027: em 2027 vê-se o 1 e o 2 de Janeiro e mais nada.
    const passagem = [
      pedido({ id: "A", date: "2026-12-30", endDate: "2027-01-02", status: "aceite" }),
    ];

    const de2027 = anoDoCalendario(2027, passagem, []);
    expect(diaDe(de2027, 1, 1).estado).toBe("fechado");
    expect(diaDe(de2027, 1, 2).estado).toBe("fechado");
    expect(diaDe(de2027, 1, 3).estado).toBe("livre");
    expect(fechadosNoAno(de2027)).toBe(2);

    const de2026 = anoDoCalendario(2026, passagem, []);
    expect(diaDe(de2026, 12, 30).estado).toBe("fechado");
    expect(diaDe(de2026, 12, 31).estado).toBe("fechado");
    expect(fechadosNoAno(de2026)).toBe(2);
  });

  it("uma data de fim antes do início não desfaz o dia de início", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2027-07-10", endDate: "2027-07-01", status: "aceite" })],
      [],
    );

    expect(diaDe(meses, 7, 10).estado).toBe("fechado");
    expect(meses[6].fechados).toBe(1);
  });

  it("um intervalo absurdo não percorre o ano inteiro", () => {
    // Um «evento» de anos é um engano de escrita. Corta nos 31 dias, que é o
    // mesmo corte da grelha do mês.
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2027-01-01", endDate: "2029-01-01", status: "aceite" })],
      [],
    );

    expect(fechadosNoAno(meses)).toBe(31);
  });
});

describe("a grelha de cada mês", () => {
  it("dá doze meses, com os nomes em português", () => {
    const meses = anoDoCalendario(2027, [], []);
    expect(meses).toHaveLength(12);
    expect(meses.map((m) => m.nome)).toEqual([...MESES]);
    expect(meses[0].mes).toBe(0);
  });

  it("conta os dias certos, incluindo Fevereiro de um ano bissexto", () => {
    expect(anoDoCalendario(2028, [], [])[1].dias).toHaveLength(29);
    expect(anoDoCalendario(2027, [], [])[1].dias).toHaveLength(28);
    expect(anoDoCalendario(2027, [], [])[3].dias).toHaveLength(30);
  });

  it("começa a semana à segunda-feira", () => {
    // 1 de Julho de 2027 é uma quinta-feira: três células vazias antes.
    expect(anoDoCalendario(2027, [], [])[6].desvio).toBe(3);
    // 1 de Novembro de 2027 é uma segunda-feira: nenhuma.
    expect(anoDoCalendario(2027, [], [])[10].desvio).toBe(0);
    // 1 de Agosto de 2027 é um domingo: seis.
    expect(anoDoCalendario(2027, [], [])[7].desvio).toBe(6);
  });

  it("um ano sem nada marcado desenha-se na mesma, com doze meses livres", () => {
    const meses = anoDoCalendario(2027, [], []);
    expect(meses.every((m) => m.fechados === 0 && m.marcados === 0)).toBe(true);
    expect(meses.every((m) => resumoDoMes(m) === "Livre")).toBe(true);
  });

  it("o que é de outro ano não entra neste", () => {
    const meses = anoDoCalendario(
      2027,
      [pedido({ id: "A", date: "2026-07-10", status: "aceite" })],
      [marcacao("m1", "2028-07-10", "bloqueio")],
    );

    expect(fechadosNoAno(meses)).toBe(0);
  });
});

describe("a linha que responde à pergunta", () => {
  const mes = (fechados: number, marcados: number): MesDoAno =>
    ({ mes: 6, nome: "Julho", desvio: 3, dias: [], fechados, marcados }) as MesDoAno;

  it("diz «Livre» quando o mês está livre", () => {
    expect(resumoDoMes(mes(0, 0))).toBe("Livre");
  });

  it("põe o número de dias fechados à frente, no singular e no plural", () => {
    expect(resumoDoMes(mes(1, 0))).toBe("1 dia fechado");
    expect(resumoDoMes(mes(4, 0))).toBe("4 dias fechados");
  });

  it("distingue um mês só com marcações de um mês fechado", () => {
    expect(resumoDoMes(mes(0, 2))).toBe("2 dias com marcações");
    expect(resumoDoMes(mes(3, 2))).toBe("3 dias fechados · 2 com marcações");
  });
});

describe("o nome de um dia diz o estado por palavras", () => {
  const dia = (estado: DiaDoAno["estado"], quantas: number): DiaDoAno => ({
    data: "2027-07-18",
    dia: 18,
    estado,
    quantas,
  });

  it("um dia livre diz que está livre", () => {
    expect(nomeDoDia(dia("livre", 0), "Julho", 2027)).toBe("18 de Julho de 2027 — livre");
  });

  it("um dia fechado diz a palavra «fechado» — a cor não é a única via", () => {
    expect(nomeDoDia(dia("fechado", 1), "Julho", 2027)).toBe(
      "18 de Julho de 2027 — dia fechado, 1 marcação",
    );
    expect(nomeDoDia(dia("fechado", 2), "Julho", 2027)).toContain("2 marcações");
  });

  it("um dia com marcações continua a dizer que está livre — é a resposta comercial", () => {
    expect(nomeDoDia(dia("marcado", 1), "Julho", 2027)).toBe(
      "18 de Julho de 2027 — livre, com 1 marcação",
    );
  });

  it("todos os nomes trazem o ANO — esta casa fecha datas com ano e meio", () => {
    for (const estado of ["livre", "marcado", "fechado"] as const) {
      expect(nomeDoDia(dia(estado, 1), "Julho", 2027)).toContain("2027");
    }
  });
});
