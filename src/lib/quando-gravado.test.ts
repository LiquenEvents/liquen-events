import { describe, it, expect } from "vitest";
import { quandoGravado, gravadoEmPorExtenso } from "./quando-gravado";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A DATA QUE FALTAVA EM TRÊS SÍTIOS AO MESMO TEMPO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Guardado às 14:32» está certo numa proposta gravada há dez minutos. O
 * problema é a proposta reaberta no dia seguinte, que diz o mesmo e parece
 * acabada de gravar — e é aí que a pergunta «isto é de hoje?» se faz.
 *
 * O que estes testes prendem é o equilíbrio: **cresce só quando é preciso.**
 * Uma etiqueta que põe sempre a data é uma etiqueta comprida a repetir o que já
 * se sabe, e aprende-se a não a ler — precisamente no dia em que ela estiver a
 * avisar de alguma coisa.
 */

/** Um instante fixo, para o relógio da máquina não entrar na conta. */
const AGORA = new Date("2026-08-22T16:00:00");

const as = (iso: string) => new Date(iso);

describe("quandoGravado", () => {
  it("hoje é só a hora — pôr a data seria ruído", () => {
    expect(quandoGravado(as("2026-08-22T14:32:00"), AGORA)).toBe("14:32");
  });

  it("ontem diz-se por extenso", () => {
    expect(quandoGravado(as("2026-08-21T14:32:00"), AGORA)).toBe("ontem às 14:32");
  });

  it("mais atrás leva o dia e o mês", () => {
    expect(quandoGravado(as("2026-08-12T14:32:00"), AGORA)).toBe("12/08 às 14:32");
  });

  it("de outro ano leva o ano", () => {
    // «12/08 às 14:32» numa proposta do ano passado leria-se como deste mês.
    expect(quandoGravado(as("2025-08-12T14:32:00"), AGORA)).toBe("12/08/2025 às 14:32");
  });

  /**
   * ── É O DIA DO CALENDÁRIO, E NÃO «HÁ MENOS DE 24 HORAS» ──────────────
   *
   * Às 00:30, uma gravação das 23:50 tem quarenta minutos — e é de ONTEM. Quem
   * está a trabalhar de madrugada precisa de o saber; é o caso em que a
   * pergunta se faz mais.
   */
  it("às 00:30, o que foi gravado às 23:50 é de ontem", () => {
    const madrugada = new Date("2026-08-22T00:30:00");
    expect(quandoGravado(as("2026-08-21T23:50:00"), madrugada)).toBe("ontem às 23:50");
  });

  it("e o que foi gravado às 00:10 ainda é de hoje", () => {
    const madrugada = new Date("2026-08-22T00:30:00");
    expect(quandoGravado(as("2026-08-22T00:10:00"), madrugada)).toBe("00:10");
  });

  it("uma data ilegível não põe «Invalid Date» no ecrã", () => {
    expect(quandoGravado("não é uma data", AGORA)).toBe("");
    expect(quandoGravado(null, AGORA)).toBe("");
    expect(quandoGravado(undefined, AGORA)).toBe("");
    expect(quandoGravado("", AGORA)).toBe("");
  });

  it("aceita a data em texto, que é como o servidor a manda", () => {
    expect(quandoGravado("2026-08-22T14:32:00", AGORA)).toBe("14:32");
  });
});

describe("gravadoEmPorExtenso", () => {
  it("hoje traz a preposição, para caber em «guardado …»", () => {
    expect(gravadoEmPorExtenso(as("2026-08-22T14:32:00"), AGORA)).toBe("às 14:32");
  });

  it("ontem NÃO traz a segunda preposição", () => {
    // «guardado às ontem às 14:32» é o que sai de colar a preposição sempre.
    expect(gravadoEmPorExtenso(as("2026-08-21T14:32:00"), AGORA)).toBe("ontem às 14:32");
  });

  it("uma data com dia também não", () => {
    expect(gravadoEmPorExtenso(as("2026-08-12T14:32:00"), AGORA)).toBe("12/08 às 14:32");
  });

  it("sem data, não inventa preposição nenhuma", () => {
    expect(gravadoEmPorExtenso(null, AGORA)).toBe("");
  });
});
