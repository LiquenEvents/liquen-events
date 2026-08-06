import { describe, it, expect } from "vitest";
import {
  DIAS_ATE_O_COMBUSTIVEL_ENVELHECER,
  combustivelDesactualizado,
  diasDesde,
  isDefinicaoId,
  parametrosDe,
  type Definicao,
} from "./proposta-definicoes-store";
import { PARAMETROS_OMISSAO } from "./orcamento/deslocacao";
import { MARGEM_MINIMA_OMISSAO } from "./orcamento/margem";

const AGORA = new Date("2026-06-01T10:00:00Z");

const linha = (id: "deslocacao" | "margem", valor: object, updatedAt: string): Definicao => ({
  id,
  valor: valor as Record<string, unknown>,
  updatedAt,
});

describe("ler os parâmetros", () => {
  it("uma instalação sem nada gravado calcula com os valores de partida", () => {
    const p = parametrosDe([]);
    expect(p.deslocacao).toEqual(PARAMETROS_OMISSAO);
    expect(p.margemMinima).toBe(MARGEM_MINIMA_OMISSAO);
  });

  it("o que está gravado ganha aos valores de partida", () => {
    const p = parametrosDe([
      linha("deslocacao", { precoLitro: 1.92, consumoLPor100Km: 11 }, "2026-05-30T10:00:00Z"),
      linha("margem", { minima: 45 }, "2026-05-30T10:00:00Z"),
    ]);
    expect(p.deslocacao.precoLitro).toBe(1.92);
    expect(p.deslocacao.consumoLPor100Km).toBe(11);
    expect(p.margemMinima).toBe(45);
    // O que não foi gravado continua a vir do valor de partida.
    expect(p.deslocacao.portagensPorKm).toBe(PARAMETROS_OMISSAO.portagensPorKm);
  });

  it("lixo gravado não passa a valer — volta ao valor de partida", () => {
    // Um número negativo ou um texto numa coluna jsonb não podem transformar-se
    // num preço: dariam uma deslocação errada sem nada a assinalá-lo.
    const p = parametrosDe([
      linha(
        "deslocacao",
        { precoLitro: -3, consumoLPor100Km: "muito", franquiaKm: Number.NaN },
        "2026-05-30T10:00:00Z",
      ),
    ]);
    expect(p.deslocacao.precoLitro).toBe(PARAMETROS_OMISSAO.precoLitro);
    expect(p.deslocacao.consumoLPor100Km).toBe(PARAMETROS_OMISSAO.consumoLPor100Km);
    expect(p.deslocacao.franquiaKm).toBe(PARAMETROS_OMISSAO.franquiaKm);
  });

  it("o ida-e-volta é um sim/não e respeita-se mesmo quando é 'não'", () => {
    // `false` é um valor legítimo. Um `??` ingénuo trocava-o pelo de partida,
    // que é `true`, e a deslocação passava a cobrar o dobro contra a vontade
    // de quem a desligou.
    const p = parametrosDe([linha("deslocacao", { idaEVolta: false }, "2026-05-30T10:00:00Z")]);
    expect(p.deslocacao.idaEVolta).toBe(false);
  });
});

describe("saber quando é que os números foram postos", () => {
  it("conta os dias desde a última gravação", () => {
    expect(diasDesde("2026-05-25T10:00:00Z", AGORA)).toBe(7);
    expect(diasDesde("2026-06-01T09:00:00Z", AGORA)).toBe(0);
  });

  it("nunca gravado não é 'hoje'", () => {
    const p = parametrosDe([]);
    expect(diasDesde(p.definidoEm.deslocacao, AGORA)).toBeNull();
  });
});

describe("o preço do combustível envelhece", () => {
  it("um preço posto esta semana serve", () => {
    const p = parametrosDe([linha("deslocacao", { precoLitro: 1.8 }, "2026-05-28T10:00:00Z")]);
    expect(combustivelDesactualizado(p, AGORA)).toBe(false);
  });

  it("um preço de há meses deixa de servir", () => {
    const velho = new Date(
      AGORA.getTime() - (DIAS_ATE_O_COMBUSTIVEL_ENVELHECER + 5) * 86_400_000,
    ).toISOString();
    const p = parametrosDe([linha("deslocacao", { precoLitro: 1.8 }, velho)]);
    expect(combustivelDesactualizado(p, AGORA)).toBe(true);
  });

  it("nunca confirmado conta como velho", () => {
    // Os valores de partida são um palpite escrito por quem não abastece a
    // carrinha. Tratá-los como confiáveis era esconder que ninguém os viu.
    expect(combustivelDesactualizado(parametrosDe([]), AGORA)).toBe(true);
  });
});

describe("os identificadores", () => {
  it("só se aceitam os que existem", () => {
    expect(isDefinicaoId("deslocacao")).toBe(true);
    expect(isDefinicaoId("margem")).toBe(true);
    expect(isDefinicaoId("qualquer-coisa")).toBe(false);
    expect(isDefinicaoId(42)).toBe(false);
  });
});
