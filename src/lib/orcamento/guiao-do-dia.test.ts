import { describe, expect, it } from "vitest";
import type { TimelineItem } from "./types";
import {
  agoraNaRegua,
  analisarODia,
  BURACO_MINIMO_MIN,
  duracaoDe,
  estaNoDia,
  horaDoMinuto,
  minutosDe,
  oQueVemASeguir,
  ordemNoDia,
  ordenar,
  porExtenso,
} from "./guiao-do-dia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FORMA DO DIA, SEM MONTAR UM ECRÃ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas contas decidem o que ela vê quando pergunta «isto cabe?» — e decidem
 * também quando é que o ecrã lhe grita a vermelho. Um falso choque ensina-a a
 * ignorar o vermelho; um choque não detectado chega ao dia do evento com duas
 * pessoas à espera uma da outra. Por isso vivem fora do componente e provam-se
 * aqui, sem React pelo meio.
 */

const m = (
  id: string,
  time: string,
  title: string,
  duracao?: number,
  owner?: string,
): TimelineItem => ({
  id,
  time,
  title,
  ...(duracao != null ? { duracao } : {}),
  ...(owner ? { owner } : {}),
});

describe("a régua do dia não acaba à meia-noite", () => {
  it("«02:00» é o FIM do dia e ordena depois das 23:00", () => {
    const guiao = [
      m("t3", "02:00", "Encerramento"),
      m("t1", "09:00", "Montagem"),
      m("t2", "23:00", "Festa"),
    ];
    expect(ordenar(guiao).map((i) => i.title)).toEqual(["Montagem", "Festa", "Encerramento"]);
  });

  it("uma hora ilegível vai para o fim, e não para o meio do dia", () => {
    expect(ordemNoDia("")).toBe(Number.MAX_SAFE_INTEGER);
    expect(ordemNoDia("25:00")).toBe(Number.MAX_SAFE_INTEGER);
    expect(minutosDe("17:00")).toBe(17 * 60);
    expect(minutosDe("17:60")).toBeNull();
  });

  it("o relógio segue a mesma régua — a 01:30 o dia ainda é o de ontem", () => {
    expect(agoraNaRegua(new Date(2026, 8, 7, 14, 32))).toBe(14 * 60 + 32);
    expect(agoraNaRegua(new Date(2026, 8, 8, 1, 30))).toBe(24 * 60 + 90);
  });
});

describe("a duração, saneada", () => {
  it("ausente, zero, negativa e lixo dão todos «instante»", () => {
    expect(duracaoDe({})).toBe(0);
    expect(duracaoDe({ duracao: 0 })).toBe(0);
    expect(duracaoDe({ duracao: -90 })).toBe(0);
    expect(duracaoDe({ duracao: Number.NaN })).toBe(0);
  });
  it("um dia é o tecto — mais do que isso é engano de dedo", () => {
    expect(duracaoDe({ duracao: 5000 })).toBe(24 * 60);
    expect(duracaoDe({ duracao: 45 })).toBe(45);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O GUIÃO DO MODELO ANTIGO — o que já está gravado nos eventos dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `duracao` nasceu depois destes dados. Um guião sem ele tem de abrir, tem de
 * ordenar e — o mais importante — tem de ficar CALADO: sem durações ninguém
 * declarou tempo nenhum, e acusar sobreposições a partir de silêncio é a
 * maneira mais rápida de a ensinar a ignorar os avisos todos.
 */
describe("um guião gravado antes de existirem durações", () => {
  const ANTIGO: TimelineItem[] = [
    { id: "t1", time: "09:00", title: "Montagem" },
    { id: "t2", time: "17:00", title: "Cerimónia" },
    { id: "t3", time: "20:00", title: "Jantar" },
    { id: "t4", time: "02:00", title: "Encerramento" },
  ];

  it("abre, ordena e não inventa nem um choque nem uma sobreposição", () => {
    const dia = analisarODia(ANTIGO);
    expect(dia.blocos.map((b) => b.item.title)).toEqual([
      "Montagem",
      "Cerimónia",
      "Jantar",
      "Encerramento",
    ]);
    expect(dia.blocos.every((b) => b.duracao === 0)).toBe(true);
    expect(dia.choques).toEqual([]);
    expect(dia.sobreposicoes).toEqual([]);
  });

  it("dois instantes à MESMA hora e com o mesmo responsável também não chocam", () => {
    // O caso mais tentador de todos: duas linhas às 09:00, a mesma Rita. Sem
    // duração declarada não há intervalo nenhum a sobrepor-se — são dois
    // marcos, e a resposta certa é o silêncio.
    const dia = analisarODia([
      { id: "a", time: "09:00", title: "Montagem", owner: "Rita" },
      { id: "b", time: "09:00", title: "Descarga da carrinha", owner: "Rita" },
    ]);
    expect(dia.choques).toEqual([]);
    expect(dia.sobreposicoes).toEqual([]);
  });

  it("os buracos contam-se na mesma, e dizem que o anterior não tem duração", () => {
    const dia = analisarODia(ANTIGO);
    // 09:00 → 17:00 são oito horas de nada — a informação continua a existir,
    // e a frase muda para não acusar um buraco que pode ser a montagem.
    const primeiro = dia.buracos[0];
    expect(primeiro.depoisDe.title).toBe("Montagem");
    expect(primeiro.antesDe.title).toBe("Cerimónia");
    expect(primeiro.minutos).toBe(8 * 60);
    expect(primeiro.anteriorSemDuracao).toBe(true);
  });

  it("um guião MISTO — metade com duração, metade sem — não se atrapalha", () => {
    const dia = analisarODia([
      m("a", "09:00", "Montagem", 240, "Rita"), // 09:00 → 13:00
      { id: "b", time: "11:00", title: "Descarga", owner: "Rita" }, // instante lá dentro
      m("c", "13:00", "Almoço", 60, "Rita"), // encosta
    ]);
    // O instante cai DENTRO da montagem e não é um choque: é um marco.
    expect(dia.choques).toEqual([]);
    expect(dia.sobreposicoes).toEqual([]);
    expect(dia.blocos[2].antes).toEqual({
      tipo: "encosta",
      minutos: 0,
      com: expect.objectContaining({ id: "a" }),
    });
  });
});

describe("duas coisas ao mesmo tempo", () => {
  it("com a MESMA pessoa é um choque, e diz quantos minutos e quem", () => {
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 240, "Rita"), // 08:00 → 12:00
      m("b", "11:00", "Chegada do catering", 90, "Rita"), // 11:00 → 12:30
    ]);
    expect(dia.sobreposicoes).toEqual([]);
    expect(dia.choques).toHaveLength(1);
    expect(dia.choques[0].minutos).toBe(60);
    expect(dia.choques[0].responsavel).toBe("Rita");
  });

  it("«RITA », «rita» e «Rita» são a mesma pessoa", () => {
    // Um choque que se perde por causa de uma maiúscula ou de um espaço é um
    // choque que chega ao dia do evento.
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 240, "RITA "),
      m("b", "11:00", "Catering", 90, "rita"),
    ]);
    expect(dia.choques).toHaveLength(1);
  });

  it("e um acento não desfaz um choque", () => {
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 240, "Antonio"),
      m("b", "11:00", "Catering", 90, "António"),
    ]);
    expect(dia.choques).toHaveLength(1);
  });

  it("com pessoas DIFERENTES é informação, e não erro", () => {
    // Num evento há coisas que correm mesmo em paralelo — o catering a montar
    // enquanto a decoração acaba. Pintar isto de vermelho era ensiná-la a
    // ignorar o vermelho.
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 240, "Rita"),
      m("b", "11:00", "Chegada do catering", 90, "Nuno"),
    ]);
    expect(dia.choques).toEqual([]);
    expect(dia.sobreposicoes).toHaveLength(1);
    expect(dia.sobreposicoes[0].minutos).toBe(60);
  });

  it("sem responsável em nenhum dos dois também é só informação", () => {
    const dia = analisarODia([m("a", "08:00", "Montagem", 240), m("b", "11:00", "Catering", 90)]);
    expect(dia.choques).toEqual([]);
    expect(dia.sobreposicoes).toHaveLength(1);
  });

  it("uma montagem comprida cruza-se com tudo o que lhe cai dentro, e não só com o vizinho", () => {
    // A frase tem de nomear os dois momentos, mesmo quando estão longe um do
    // outro na lista. Por isso os cruzamentos são todos os PARES.
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 480, "Rita"), // 08:00 → 16:00
      m("b", "10:00", "Flores", 60, "Rita"),
      m("c", "14:00", "Mesas", 60, "Rita"),
    ]);
    // Dois pares: montagem×flores e montagem×mesas. As flores e as mesas não se
    // tocam uma na outra — e por isso não há um terceiro.
    expect(dia.choques).toHaveLength(2);
    expect(dia.choques.every((c) => c.a.title === "Montagem")).toBe(true);
    expect(dia.choques.map((c) => c.b.title)).toEqual(["Flores", "Mesas"]);
  });

  it("encostar não é sobrepor — 12:00 a seguir a um bloco que acaba às 12:00", () => {
    const dia = analisarODia([m("a", "09:00", "Montagem", 180), m("b", "12:00", "Catering", 60)]);
    expect(dia.sobreposicoes).toEqual([]);
    expect(dia.buracos).toEqual([]);
    expect(dia.blocos[1].antes?.tipo).toBe("encosta");
  });
});

describe("os buracos", () => {
  it("um vazio grande conta-se, e um pequeno não se anuncia", () => {
    const dia = analisarODia([
      m("a", "09:00", "Montagem", 180), // → 12:00
      m("b", "15:00", "Recepção", 60), // 3 h de buraco
      m("c", "16:30", "Cerimónia", 45), // 30 min — abaixo do limiar
    ]);
    expect(BURACO_MINIMO_MIN).toBe(60);
    expect(dia.buracos).toHaveLength(1);
    expect(dia.buracos[0].minutos).toBe(180);
    expect(dia.buracos[0].anteriorSemDuracao).toBe(false);
    // Mas a FORMA continua lá: a banda do bloco seguinte sabe dos 30 minutos.
    expect(dia.blocos[2].antes).toMatchObject({ tipo: "buraco", minutos: 30 });
  });

  it("a fronteira é o ponto mais longe a que o dia chegou, não o último bloco lido", () => {
    // Sem isto, um momento curto a seguir a uma montagem de oito horas
    // «fechava» o dia às 09:15 e tudo o que vinha depois parecia um buraco
    // enorme que não existe.
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 480), // 08:00 → 16:00
      m("b", "09:00", "Descarga", 15), // 09:00 → 09:15
      m("c", "16:00", "Recepção", 60), // encosta à montagem
    ]);
    expect(dia.buracos).toEqual([]);
    expect(dia.blocos[2].antes).toMatchObject({ tipo: "encosta" });
  });
});

describe("quanto do dia está ocupado", () => {
  it("o que corre em paralelo não se conta duas vezes", () => {
    // Somar as durações dava um dia mais cheio do que o dia tem, e a resposta
    // a «isto cabe?» ficava errada por excesso.
    const dia = analisarODia([
      m("a", "08:00", "Montagem", 240), // 08:00 → 12:00
      m("b", "10:00", "Catering", 120), // 10:00 → 12:00, todo lá dentro
    ]);
    expect(dia.ocupado).toBe(240);
    expect(dia.amplitude).toBe(240);
  });

  it("a amplitude atravessa a meia-noite", () => {
    const dia = analisarODia([m("a", "23:00", "Festa", 180)]);
    expect(dia.inicio).toBe(23 * 60);
    expect(dia.fim).toBe(26 * 60);
    expect(horaDoMinuto(dia.fim!)).toBe("02:00");
  });
});

describe("«o que é que vem a seguir?»", () => {
  const GUIAO = analisarODia([
    m("a", "09:00", "Montagem", 180, "Rita"), // 09:00 → 12:00
    m("b", "16:00", "Recepção", 60, "Catarina"),
    m("c", "17:00", "Cerimónia", 45, "Catarina"),
  ]).blocos;

  it("a meio de um momento diz o que decorre e o que vem depois", () => {
    const r = oQueVemASeguir(GUIAO, 10 * 60 + 30);
    expect(r.agora.map((b) => b.item.title)).toEqual(["Montagem"]);
    expect(r.aSeguir?.item.title).toBe("Recepção");
    expect(r.faltam).toBe(5 * 60 + 30);
    expect(porExtenso(r.faltam)).toBe("5 h 30");
  });

  it("num vazio não inventa nada a decorrer — só diz o que falta", () => {
    const r = oQueVemASeguir(GUIAO, 14 * 60);
    expect(r.agora).toEqual([]);
    expect(r.aSeguir?.item.title).toBe("Recepção");
    expect(r.terminado).toBe(false);
  });

  it("depois do último, o dia está terminado", () => {
    const r = oQueVemASeguir(GUIAO, 23 * 60);
    expect(r.agora).toEqual([]);
    expect(r.aSeguir).toBeNull();
    expect(r.terminado).toBe(true);
  });

  it("um INSTANTE também aparece como o que está a acontecer", () => {
    // Sem isto, a cerimónia das 17:00 de um guião do modelo antigo nunca
    // chegava a ser «o que está a acontecer» — que é precisamente o minuto em
    // que ela olha para o ecrã.
    const blocos = analisarODia([{ id: "x", time: "17:00", title: "Cerimónia" }]).blocos;
    expect(oQueVemASeguir(blocos, 17 * 60).agora.map((b) => b.item.title)).toEqual(["Cerimónia"]);
    expect(oQueVemASeguir(blocos, 17 * 60 + 1).agora).toEqual([]);
  });

  it("duas coisas em paralelo são as DUAS o que está a decorrer", () => {
    const blocos = analisarODia([
      m("a", "08:00", "Montagem", 240, "Rita"),
      m("b", "10:00", "Catering", 60, "Nuno"),
    ]).blocos;
    expect(oQueVemASeguir(blocos, 10 * 60 + 30).agora).toHaveLength(2);
  });
});

describe("o relógio só existe no dia do evento", () => {
  it("no próprio dia, sim", () => {
    expect(estaNoDia("2026-09-07", new Date(2026, 8, 7, 14, 0))).toBe(true);
  });
  it("na madrugada seguinte ainda sim — o encerramento é às 02:00", () => {
    // O último momento do guião é depois da meia-noite; o ecrã não se pode
    // apagar a meio da festa.
    expect(estaNoDia("2026-09-07", new Date(2026, 8, 8, 2, 30))).toBe(true);
  });
  it("mas às 06:00 do dia seguinte já não", () => {
    expect(estaNoDia("2026-09-07", new Date(2026, 8, 8, 6, 0))).toBe(false);
  });
  it("na véspera não, e sem data não", () => {
    expect(estaNoDia("2026-09-07", new Date(2026, 8, 6, 22, 0))).toBe(false);
    expect(estaNoDia(undefined, new Date(2026, 8, 7, 14, 0))).toBe(false);
    expect(estaNoDia("", new Date(2026, 8, 7, 14, 0))).toBe(false);
  });
});

describe("os minutos escritos como ela os diz", () => {
  it("sem zeros à esquerda e sem «0 h 45»", () => {
    expect(porExtenso(45)).toBe("45 min");
    expect(porExtenso(60)).toBe("1 h");
    expect(porExtenso(90)).toBe("1 h 30");
    expect(porExtenso(62)).toBe("1 h 02");
    expect(porExtenso(180)).toBe("3 h");
    expect(porExtenso(0)).toBe("0 min");
  });
  it("uma hora depois da meia-noite escreve-se como hora do relógio", () => {
    expect(horaDoMinuto(26 * 60)).toBe("02:00");
    expect(horaDoMinuto(17 * 60 + 45)).toBe("17:45");
  });
});
