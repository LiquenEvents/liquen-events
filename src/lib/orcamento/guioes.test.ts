import { describe, expect, it } from "vitest";
import type { TimelineItem } from "./types";
import { analisarODia } from "./guiao-do-dia";
import {
  diaDe,
  diasEntre,
  emCarris,
  fracaoNaJanela,
  janelaComum,
  JANELA_MINIMA_MIN,
  ordenarGuioes,
  sinaisDoGuiao,
  sinalPrincipal,
  vaziosDaRegua,
  type ResumoDeGuiao,
} from "./guioes";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DE GUIÕES DECIDE ONDE ELA OLHA PRIMEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Estas contas não desenham um dia: decidem QUAL dos vinte dias ela abre a
 * seguir, e o que a lista lhe diz sobre cada um sem ela abrir nenhum. Um sinal
 * a mais ensina-a a ignorar os sinais; um sinal a menos deixa um choque de
 * responsável chegar ao dia do evento.
 *
 * A régua deitada é a outra metade, e é geometria: os carris são o que faz uma
 * sobreposição VER-SE. Sem eles, a segunda coisa desenha-se por cima da
 * primeira e a fita mostra um dia limpo onde há duas coisas em cima uma da
 * outra — mostrar o contrário do que se passa é pior do que não mostrar nada.
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

const guiao = (id: string, data: string, momentos: TimelineItem[] = []): ResumoDeGuiao => ({
  id,
  cliente: `Cliente ${id}`,
  evento: "Casamento",
  data,
  local: "Herdade da Maridona",
  // Aceite por omissão: estes casos medem a ORDEM e os sinais de um guião, e
  // um evento por fechar não muda nem uma coisa nem outra. Quem mede a escolha
  // entre «aceites» e «todos» é o `Guioes.test.tsx`, que é onde ela vive.
  aceite: true,
  momentos,
});

describe("os sinais de um guião — o que a lista diz sem se abrir o dia", () => {
  it("um guião vazio diz «sem guião» e mais nada", () => {
    const sinais = sinaisDoGuiao([]);
    expect(sinais.map((s) => s.tipo)).toEqual(["sem-guiao"]);
  });

  it("a mesma pessoa em dois sítios ao mesmo tempo é o sinal mais grave", () => {
    const sinais = sinaisDoGuiao([
      m("a", "09:00", "Montagem", 180, "Rita"),
      m("b", "10:00", "Ir buscar as flores", 60, "Rita"),
    ]);
    expect(sinalPrincipal(sinais).tipo).toBe("choque");
    expect(sinalPrincipal(sinais).frase).toContain("dois sítios");
  });

  it("com responsáveis DIFERENTES é informação, não erro", () => {
    const sinais = sinaisDoGuiao([
      m("a", "09:00", "Montagem", 180, "Rita"),
      m("b", "10:00", "Catering monta", 60, "Nuno"),
    ]);
    // CONTROLO NEGATIVO do caso de cima: mudar só o nome do responsável tem de
    // mudar o veredicto. Se este passasse a «choque», o teste anterior estaria
    // a medir a sobreposição e não a pessoa.
    expect(sinais.map((s) => s.tipo)).toContain("sobreposicao");
    expect(sinais.map((s) => s.tipo)).not.toContain("choque");
  });

  it("um vazio CERTO conta; um vazio a seguir a um momento sem duração não", () => {
    const comDuracao = sinaisDoGuiao([
      m("a", "09:00", "Montagem", 120),
      m("b", "16:00", "Receção", 60),
    ]);
    expect(comDuracao.map((s) => s.tipo)).toContain("buraco");

    const semDuracao = sinaisDoGuiao([m("a", "09:00", "Montagem"), m("b", "16:00", "Receção", 60)]);
    /**
     * As mesmas sete horas entre os mesmos dois momentos, e o veredicto muda —
     * de propósito. Sem a duração da montagem, aquele tempo tanto pode ser um
     * vazio como pode ser a montagem a decorrer, e o `EventTimeline` já se
     * recusa a chamar-lhe buraco. A lista tem de dizer o mesmo sobre o mesmo
     * dia: uma pastilha «1 vazio» ao lado de um ecrã que não nomeia vazio
     * nenhum é o ecrã a discordar de si próprio.
     */
    expect(semDuracao.map((s) => s.tipo)).not.toContain("buraco");
    expect(semDuracao.map((s) => s.tipo)).toContain("sem-duracao");
  });

  it("um vazio abaixo do mínimo não se anuncia", () => {
    const sinais = sinaisDoGuiao([
      m("a", "09:00", "Montagem", 60),
      m("b", "10:30", "Cerimónia", 45),
    ]);
    expect(sinais.map((s) => s.tipo)).not.toContain("buraco");
  });

  it("um dia inteiro sem durações diz que o dia ainda não tem forma", () => {
    const sinais = sinaisDoGuiao([m("a", "09:00", "Montagem"), m("b", "17:00", "Cerimónia")]);
    const semDuracao = sinais.find((s) => s.tipo === "sem-duracao");
    expect(semDuracao?.frase).toContain("ainda não tem forma");
  });

  it("um guião sem nada a apontar diz «pronto» — e é o único caso em que o diz", () => {
    const sinais = sinaisDoGuiao([
      m("a", "09:00", "Montagem", 120),
      m("b", "11:00", "Cerimónia", 60),
    ]);
    expect(sinais.map((s) => s.tipo)).toEqual(["pronto"]);
  });

  it("os sinais vêm do mais grave para o menos", () => {
    const sinais = sinaisDoGuiao([
      m("a", "09:00", "Montagem", 120, "Rita"),
      m("b", "10:00", "Flores", 60, "Rita"),
      m("c", "16:00", "Receção", 60),
    ]);
    // Choque (erro) antes de vazio (por fazer) antes de sem-duração… e nunca o
    // contrário: a primeira pastilha é a que ela lê no canto do olho.
    expect(sinais[0].tipo).toBe("choque");
    expect(sinais.map((s) => s.tipo)).toContain("buraco");
  });
});

describe("a ordem da lista é a ordem do trabalho", () => {
  const agora = new Date("2026-06-10T10:00:00");

  it("os que aí vêm primeiro, do mais próximo para o mais longe", () => {
    const lista = ordenarGuioes(
      [guiao("longe", "2026-09-01"), guiao("perto", "2026-06-12"), guiao("hoje", "2026-06-10")],
      agora,
    );
    expect(lista.map((g) => g.id)).toEqual(["hoje", "perto", "longe"]);
  });

  it("e os que já passaram no fim, do mais recente para o mais antigo", () => {
    const lista = ordenarGuioes(
      [
        guiao("antigo", "2024-05-01"),
        guiao("recente", "2026-06-01"),
        guiao("futuro", "2026-07-01"),
      ],
      agora,
    );
    expect(lista.map((g) => g.id)).toEqual(["futuro", "recente", "antigo"]);
  });

  it("o próprio dia do evento conta como futuro e não como passado", () => {
    // É precisamente durante o evento que este ecrã mais serve. Com
    // `faltamDias === 0` a cair no lado dos passados, o casamento de hoje ia
    // parar ao fundo da lista, a seguir aos de 2024.
    const [primeiro] = ordenarGuioes([guiao("hoje", "2026-06-10")], agora);
    expect(primeiro.faltamDias).toBe(0);
    expect(primeiro.hoje).toBe(true);
  });

  it("um evento sem data legível não entra na lista", () => {
    expect(ordenarGuioes([guiao("sem-data", "")], agora)).toHaveLength(0);
    expect(ordenarGuioes([guiao("lixo", "brevemente")], agora)).toHaveLength(0);
  });

  it("`hoje` é falso num evento que não é hoje — controlo negativo", () => {
    const [amanha] = ordenarGuioes([guiao("amanha", "2026-06-11")], agora);
    expect(amanha.hoje).toBe(false);
  });

  it("a data de hoje escreve-se como os eventos estão gravados", () => {
    expect(diaDe(new Date("2026-01-05T23:30:00"))).toBe("2026-01-05");
    expect(diasEntre("2026-06-10", "2026-06-12")).toBe(2);
    expect(diasEntre("2026-06-10", "2026-06-08")).toBe(-2);
  });
});

describe("a janela comum — as réguas da lista são comparáveis entre si", () => {
  const dia = (momentos: TimelineItem[]) => ({ dia: analisarODia(momentos) });

  it("vai do início mais cedo ao fim mais tarde de TODOS os dias", () => {
    const janela = janelaComum([
      dia([m("a", "09:00", "Montagem", 120)]),
      dia([m("b", "17:00", "Cerimónia", 60), m("c", "23:00", "Festa", 180)]),
    ]);
    expect(janela.inicio).toBe(9 * 60);
    // 23:00 + 3 h = 02:00 do dia seguinte, que na régua é o minuto 1560.
    expect(janela.fim).toBe(26 * 60);
  });

  it("um dia curto sozinho não enche a régua de bordo a bordo", () => {
    const janela = janelaComum([dia([m("a", "12:00", "Almoço", 120)])]);
    expect(janela.fim - janela.inicio).toBe(JANELA_MINIMA_MIN);
  });

  it("sem dias com forma, a janela ainda é utilizável", () => {
    // Uma janela de largura zero fazia todas as fracções darem zero e a régua
    // desenhava tudo colado à esquerda.
    const janela = janelaComum([]);
    expect(janela.fim).toBeGreaterThan(janela.inicio);
  });

  it("uma fracção nunca sai da régua", () => {
    const janela = { inicio: 600, fim: 1200 };
    expect(fracaoNaJanela(600, janela)).toBe(0);
    expect(fracaoNaJanela(900, janela)).toBe(0.5);
    expect(fracaoNaJanela(1200, janela)).toBe(1);
    expect(fracaoNaJanela(0, janela)).toBe(0);
    expect(fracaoNaJanela(5000, janela)).toBe(1);
  });
});

describe("os carris — é assim que uma sobreposição se vê", () => {
  it("um dia sem sobreposições cabe num carril só", () => {
    const { carris } = emCarris(
      analisarODia([m("a", "09:00", "Montagem", 120), m("b", "11:00", "Cerimónia", 60)]).blocos,
    );
    // CONTROLO NEGATIVO de tudo o que vem a seguir: se a colocação abrisse um
    // carril por bloco, este daria 2 e o teste seguinte passaria por acaso.
    expect(carris).toBe(1);
  });

  it("duas coisas ao mesmo tempo ocupam carris diferentes", () => {
    const { blocos, carris } = emCarris(
      analisarODia([m("a", "09:00", "Montagem", 240), m("b", "10:00", "Catering monta", 120)])
        .blocos,
    );
    expect(carris).toBe(2);
    expect(blocos.find((x) => x.bloco.item.id === "a")?.carril).toBe(0);
    expect(blocos.find((x) => x.bloco.item.id === "b")?.carril).toBe(1);
  });

  it("um carril reaproveita-se assim que fica livre", () => {
    const { carris } = emCarris(
      analisarODia([
        m("a", "09:00", "Montagem", 120),
        m("b", "09:30", "Catering", 60),
        m("c", "12:00", "Almoço", 60),
      ]).blocos,
    );
    // Três momentos, dois em paralelo: dois carris e não três.
    expect(carris).toBe(2);
  });

  it("um instante dentro de um bloco longo abre carril em vez de desaparecer", () => {
    const { carris } = emCarris(
      analisarODia([m("a", "20:00", "Jantar", 180), m("b", "21:00", "Brinde")]).blocos,
    );
    expect(carris).toBe(2);
  });

  it("um momento sem hora não vai para a régua", () => {
    const { blocos } = emCarris(analisarODia([m("a", "sem hora", "Por marcar")]).blocos);
    expect(blocos).toHaveLength(0);
  });
});

describe("os vazios desenhados são os mesmos que a prosa nomeia", () => {
  it("marca o vazio certo, com o início e o fim em minutos", () => {
    const vazios = vaziosDaRegua(
      analisarODia([m("a", "09:00", "Montagem", 120), m("b", "16:00", "Receção", 60)]),
    );
    expect(vazios).toEqual([{ inicio: 11 * 60, fim: 16 * 60 }]);
  });

  it("não marca o vazio que vem a seguir a um momento sem duração", () => {
    const vazios = vaziosDaRegua(
      analisarODia([m("a", "09:00", "Montagem"), m("b", "16:00", "Receção", 60)]),
    );
    expect(vazios).toEqual([]);
  });

  it("não marca vazios curtos", () => {
    const vazios = vaziosDaRegua(
      analisarODia([m("a", "09:00", "Montagem", 60), m("b", "10:30", "Cerimónia", 45)]),
    );
    expect(vazios).toEqual([]);
  });

  it("a fronteira é o ponto mais longe a que o dia chegou, não o último bloco", () => {
    /**
     * Com uma montagem de oito horas e uma chegada curta lá dentro, o vazio até
     * à receção mede-se a partir do FIM DA MONTAGEM. Medido a partir da chegada
     * — o último bloco lido — dava um vazio inventado de quatro horas, marcado
     * a tracejado por cima de uma montagem que está a decorrer.
     */
    const vazios = vaziosDaRegua(
      analisarODia([
        m("a", "08:00", "Montagem", 480),
        m("b", "12:00", "Fornecedores", 30),
        m("c", "17:00", "Receção", 60),
      ]),
    );
    expect(vazios).toEqual([{ inicio: 16 * 60, fim: 17 * 60 }]);
  });
});
