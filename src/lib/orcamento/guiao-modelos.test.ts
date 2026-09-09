import { describe, expect, it } from "vitest";
import type { TimelineItem } from "./types";
import { analisarODia } from "./guiao-do-dia";
import {
  CRONOGRAMA_BASE,
  MAX_MOMENTOS_DE_MODELO,
  MODELOS_DA_CASA,
  modeloAPartirDoGuiao,
  momentosDoModelo,
  saoModelosDeGuiao,
  saoMomentosDeModelo,
} from "./guiao-modelos";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM MODELO É A FORMA DE UM DIA, E NÃO UMA CÓPIA DE UM DIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * É a distinção que decide se os modelos servem ou estorvam. Um modelo que
 * arrastasse consigo os responsáveis do evento de onde saiu punha a Rita a
 * trabalhar num casamento onde ela não está — e, pior, INVENTAVA choques com o
 * nome dela, porque o motor compara responsáveis para dizer quem está em dois
 * sítios ao mesmo tempo.
 *
 * O outro lado é a leitura: isto vem de uma linha de `app_state`, escrita por
 * uma versão anterior ou por uma restauração de cópia de segurança. Um
 * `title: null` que chegue ao ecrã derruba a vista inteira no limite de erro.
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

describe("os modelos da casa", () => {
  it("têm nome, descrição e momentos — nenhum abre vazio", () => {
    expect(MODELOS_DA_CASA.length).toBeGreaterThan(0);
    for (const modelo of MODELOS_DA_CASA) {
      expect(modelo.nome, `${modelo.id} sem nome`).toBeTruthy();
      expect(modelo.descricao, `${modelo.id} sem descrição`).toBeTruthy();
      expect(modelo.momentos.length, `${modelo.id} sem momentos`).toBeGreaterThan(3);
      expect(modelo.daCasa).toBe(true);
    }
  });

  it("têm ids distintos — dois iguais faziam a escolha apontar sempre ao primeiro", () => {
    const ids = MODELOS_DA_CASA.map((m2) => m2.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("nenhum traz responsáveis: um nome herdado inventa choques noutro evento", () => {
    for (const modelo of MODELOS_DA_CASA) {
      for (const momento of modelo.momentos) {
        expect(momento.owner, `${modelo.id} traz «${momento.owner}»`).toBeUndefined();
      }
    }
  });

  it("todos os momentos têm duração — é ela que dá FORMA ao dia à nascença", () => {
    // Sem durações, aplicar um modelo dava outra vez uma lista de instantes e a
    // pergunta «isto cabe?» continuava sem resposta até ela preencher tudo à
    // mão, que é exactamente o trabalho que ninguém faz.
    for (const modelo of MODELOS_DA_CASA) {
      for (const momento of modelo.momentos) {
        expect(momento.duracao, `${modelo.id}: «${momento.title}» sem duração`).toBeGreaterThan(0);
      }
    }
  });

  it("nenhum nasce com uma pessoa em dois sítios ao mesmo tempo", () => {
    for (const modelo of MODELOS_DA_CASA) {
      const dia = analisarODia(momentosDoModelo(modelo, () => Math.random().toString(36)));
      expect(dia.choques, `${modelo.id} nasce com um choque`).toEqual([]);
    }
  });

  it("o cronograma-base é o primeiro modelo, e não uma quarta cópia dele", () => {
    // O botão «Gerar cronograma-base» do dossier e o modelo «Casamento de
    // tarde» da vista de topo põem os MESMOS momentos no guião. Duas listas
    // escritas ao lado uma da outra divergiam no dia em que alguém afinasse
    // uma delas.
    expect(CRONOGRAMA_BASE).toBe(MODELOS_DA_CASA[0].momentos);
  });

  it("o buraco das 13:00 às 16:00 do cronograma-base é REAL e fica de propósito", () => {
    const dia = analisarODia(momentosDoModelo({ momentos: [...CRONOGRAMA_BASE] }, () => "x"));
    // É o tempo morto entre a montagem acabada e os convidados a chegar. O ecrã
    // diz que ele existe; ela decide se está certo. Um modelo que o escondesse
    // ensinava-a a não acreditar no que o ecrã marca a tracejado.
    const vazio = dia.buracos.find((b) => b.minutos === 180);
    expect(vazio, "o cronograma-base deixou de ter o vazio da tarde").toBeTruthy();
    expect(vazio?.anteriorSemDuracao).toBe(false);
  });
});

describe("aplicar um modelo", () => {
  it("dá um id novo a cada momento e não toca no modelo", () => {
    let n = 0;
    const modelo = MODELOS_DA_CASA[0];
    const momentos = momentosDoModelo(modelo, () => `novo-${n++}`);
    expect(momentos.map((x) => x.id)).toEqual(modelo.momentos.map((_, i) => `novo-${i}`));
    expect(momentos[0].title).toBe(modelo.momentos[0].title);
    // O modelo é partilhado por toda a aplicação: mutá-lo aqui punha o segundo
    // evento a herdar os ids do primeiro.
    expect(modelo.momentos[0]).not.toHaveProperty("id");
  });
});

describe("guardar o guião do ecrã como modelo", () => {
  it("tira os ids, os responsáveis e as linhas por preencher", () => {
    const momentos = modeloAPartirDoGuiao([
      m("t1", "17:00", "Cerimónia", 45, "Rita"),
      m("t2", "09:00", "Montagem", 180, "Nuno"),
      m("t3", "", "Linha por preencher"),
      m("t4", "12:00", "   "),
    ]);
    expect(momentos).toEqual([
      { time: "09:00", title: "Montagem", duracao: 180 },
      { time: "17:00", title: "Cerimónia", duracao: 45 },
    ]);
  });

  it("um momento sem duração continua sem duração — a chave SAI", () => {
    // Um `duracao: 0` gravado é indistinguível de «sem duração» na leitura, mas
    // faz um guião novo deixar de ser igual a um guião antigo — que é a
    // comparação que o 409 do servidor faz.
    const [momento] = modeloAPartirDoGuiao([m("t1", "17:00", "Cerimónia")]);
    expect(momento).toEqual({ time: "17:00", title: "Cerimónia" });
    expect("duracao" in momento).toBe(false);
  });

  it("fica pela ordem do dia, com a madrugada no fim", () => {
    const momentos = modeloAPartirDoGuiao([
      m("t1", "02:00", "Encerramento", 120),
      m("t2", "09:00", "Montagem", 180),
      m("t3", "23:00", "Festa", 180),
    ]);
    expect(momentos.map((x) => x.title)).toEqual(["Montagem", "Festa", "Encerramento"]);
  });

  it("um guião vazio dá um modelo vazio, e quem chama recusa-o", () => {
    expect(modeloAPartirDoGuiao([])).toEqual([]);
  });
});

describe("o que vem da base de dados não se acredita", () => {
  it("descarta o que não tem hora nem título", () => {
    const momentos = saoMomentosDeModelo([
      { time: "09:00", title: "Montagem", duracao: 180 },
      { time: "09:00" },
      { title: "Sem hora" },
      { time: null, title: 12 },
      "isto não é um momento",
      null,
    ]);
    expect(momentos).toEqual([{ time: "09:00", title: "Montagem", duracao: 180 }]);
  });

  it("sanea uma duração impossível em vez de a desenhar para cima", () => {
    const [momento] = saoMomentosDeModelo([{ time: "09:00", title: "Montagem", duracao: -90 }]);
    expect(momento).toEqual({ time: "09:00", title: "Montagem" });
  });

  it("o que não é uma lista dá uma lista vazia", () => {
    expect(saoMomentosDeModelo(null)).toEqual([]);
    expect(saoMomentosDeModelo({ momentos: [] })).toEqual([]);
    expect(saoModelosDeGuiao("[]")).toEqual([]);
  });

  it("um modelo sem momentos não entra na lista", () => {
    // Aparecia na lista e não fazia nada ao ser escolhido — pior do que não
    // existir, porque se lê como uma avaria do botão.
    const modelos = saoModelosDeGuiao([
      { id: "a", nome: "Vazio", momentos: [] },
      { id: "b", nome: "Bom", momentos: [{ time: "09:00", title: "Montagem" }] },
      { id: "", nome: "Sem id", momentos: [{ time: "09:00", title: "Montagem" }] },
    ]);
    expect(modelos.map((x) => x.id)).toEqual(["b"]);
  });

  it("não deixa passar mais momentos do que o tecto", () => {
    const muitos = Array.from({ length: MAX_MOMENTOS_DE_MODELO + 50 }, (_, i) => ({
      time: "09:00",
      title: `Momento ${i}`,
    }));
    expect(saoMomentosDeModelo(muitos)).toHaveLength(MAX_MOMENTOS_DE_MODELO);
  });
});
