import { readFileSync } from "node:fs";
import { describe, it, expect } from "vitest";
import {
  AMOSTRAS_GUARDADAS,
  FOTOS_NO_TECTO_DO_GERADOR,
  LIMITE_DE_ANEXO,
  PIOR_DESENHO_MS,
  TECTO_DA_ROTA_MS,
  comNovaAmostra,
  orcamentoDeTempo,
  passaDoAnexo,
  tamanhoEmPalavras,
  tamanhoEstimado,
  tempoEmPalavras,
  tempoEstimado,
  type AmostraDeGeracao,
} from "./custo-do-pdf";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚMERO QUE APARECE ANTES DE SE CARREGAR NO BOTÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Sem estimativa, dez segundos e sessenta são a mesma coisa: uma barra a rodar.
 * O que aqui se prende não é a exactidão — é o comportamento que a torna útil:
 * aprender com as gerações desta instalação, e não inventar quando não há com
 * que aprender.
 */

const a = (fotos: number, ms: number, bytes: number): AmostraDeGeracao => ({ fotos, ms, bytes });

describe("o tempo estimado", () => {
  it("sem amostras, usa o modelo de arranque e cresce com as fotos", () => {
    expect(tempoEstimado(0)).toBeGreaterThan(0);
    expect(tempoEstimado(40)).toBeGreaterThan(tempoEstimado(5));
  });

  /** É para isto que a recta existe: prever 40 a partir de 6 e de 25. */
  it("com amostras, extrapola para além do que já mediu", () => {
    // 1000 ms fixos + 100 ms por foto, sem ruído.
    const amostras = [a(6, 1600, 1), a(25, 3500, 1)];
    expect(tempoEstimado(40, amostras)).toBeCloseTo(5000, -2);
  });

  it("uma amostra só não chega para inventar um declive", () => {
    const uma = [a(30, 30_000, 5_000_000)];
    // Cai no modelo de arranque — que não conhece esta amostra e não finge
    // conhecê-la.
    expect(tempoEstimado(30, uma)).toBe(tempoEstimado(30));
  });

  it("amostras todas com o mesmo número de fotos também não dão recta", () => {
    const iguais = [a(10, 2000, 1_000_000), a(10, 2400, 1_100_000), a(10, 2200, 1_050_000)];
    expect(tempoEstimado(10, iguais)).toBe(tempoEstimado(10));
  });

  /**
   * Uma geração lenta com poucas fotos (a rede dela a cair) daria um declive
   * negativo — «mais fotos, mais depressa». Aí o modelo de arranque é melhor do
   * que a matemática.
   */
  it("um declive absurdo é ignorado em vez de ser mostrado", () => {
    const absurdas = [a(5, 30_000, 1), a(40, 2_000, 1)];
    expect(tempoEstimado(40, absurdas)).toBe(tempoEstimado(40));
  });

  it("nunca promete menos de meio segundo", () => {
    expect(tempoEstimado(0, [a(0, 1, 1), a(10, 2, 1)])).toBeGreaterThanOrEqual(500);
  });
});

describe("o tamanho estimado", () => {
  it("aprende os bytes por fotografia das gerações anteriores", () => {
    // 200 KB fixos + 200 KB por foto.
    const amostras = [a(5, 1, 1_200_000), a(20, 1, 4_200_000)];
    expect(tamanhoEstimado(30, amostras) / 1_000_000).toBeCloseTo(6.2, 1);
  });

  it("sem amostras, dá uma ordem de grandeza que cresce com as fotos", () => {
    expect(tamanhoEstimado(40)).toBeGreaterThan(tamanhoEstimado(10));
  });
});

describe("o aviso do anexo", () => {
  it("avisa ANTES dos 8 MB — a estimativa tem erro e o email recusado não avisa", () => {
    expect(passaDoAnexo(LIMITE_DE_ANEXO)).toBe(true);
    expect(passaDoAnexo(LIMITE_DE_ANEXO * 0.95)).toBe(true);
    expect(passaDoAnexo(LIMITE_DE_ANEXO * 0.5)).toBe(false);
  });
});

describe("as amostras", () => {
  it("a mais recente fica à frente, e só se guardam as últimas", () => {
    let amostras: AmostraDeGeracao[] = [];
    for (let i = 0; i < AMOSTRAS_GUARDADAS + 5; i++) {
      amostras = comNovaAmostra(amostras, a(i, 1000 + i, 1000 + i));
    }
    expect(amostras).toHaveLength(AMOSTRAS_GUARDADAS);
    expect(amostras[0].fotos).toBe(AMOSTRAS_GUARDADAS + 4);
  });

  it("uma medição impossível não entra — é um erro a passar por uma amostra", () => {
    const antes = [a(1, 1000, 1000)];
    expect(comNovaAmostra(antes, a(5, 0, 100))).toEqual(antes);
    expect(comNovaAmostra(antes, a(5, 100, 0))).toEqual(antes);
    expect(comNovaAmostra(antes, a(Number.NaN, 100, 100))).toEqual(antes);
  });
});

describe("as palavras", () => {
  it("o tempo é arredondado com grão grosso — não convida a cronometrar", () => {
    expect(tempoEmPalavras(2_000)).toBe("uns segundos");
    expect(tempoEmPalavras(12_000)).toBe("cerca de 10 segundos");
    expect(tempoEmPalavras(37_000)).toBe("cerca de 40 segundos");
    expect(tempoEmPalavras(62_000)).toBe("cerca de 1 minuto");
    expect(tempoEmPalavras(95_000)).toBe("cerca de 1 minuto e meio");
    expect(tempoEmPalavras(200_000)).toBe("cerca de 3 minutos");
  });

  it("o tamanho vem em português, com vírgula", () => {
    expect(tamanhoEmPalavras(2.4 * 1024 * 1024)).toBe("2,4 MB");
    expect(tamanhoEmPalavras(300 * 1024)).toBe("300 KB");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ORÇAMENTO DE TEMPO — O TECTO QUE A PROPOSTA NÃO SABE QUE TEM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os números vêm do desenho novo medido num só processador (ver o bloco no
 * `custo-do-pdf.ts`). O que estes testes prendem é a FORMA da conta: que o
 * desenho já custa quase tudo com poucas fotos, que a rede entra por lotes de
 * quatro, e que o tecto é o da rota a sério — lido do ficheiro dela.
 */
describe("o orçamento de tempo de uma proposta", () => {
  it("o tecto é o `maxDuration` da rota do casal, e não um número à parte", () => {
    const fonte = readFileSync("src/app/api/proposta/[token]/pdf/route.ts", "utf8");
    const m = fonte.match(/export const maxDuration = (\d+)/);
    expect(m, "o `maxDuration` da rota do PDF do casal desapareceu").not.toBeNull();
    expect(TECTO_DA_ROTA_MS).toBe(Number(m![1]) * 1000);
  });

  it("uma proposta normal fica com o tecto todo à frente", () => {
    const o = orcamentoDeTempo(16);
    expect(o.aperta).toBe(false);
    expect(o.msPessimista).toBeLessThan(o.tectoMs / 2);
  });

  it("as 80 fotografias do tecto do gerador cabem no tecto da rota, no mau dia", () => {
    // Medido: 12,1 s de desenho num processador; a redução e a rede põem lá
    // +11 a +17 s. Fica abaixo dos três quartos de 60 s.
    const o = orcamentoDeTempo(FOTOS_NO_TECTO_DO_GERADOR);
    expect(o.aperta).toBe(false);
    expect(o.msPessimista).toBe(PIOR_DESENHO_MS);
    expect(o.msPessimista).toBeLessThan(o.tectoMs);
  });

  it("o modelo fica ACIMA do medido — um orçamento por baixo não avisa", () => {
    expect(orcamentoDeTempo(0).desenhoMs).toBeGreaterThanOrEqual(2_613);
    expect(orcamentoDeTempo(6).desenhoMs).toBeGreaterThanOrEqual(8_543);
    expect(orcamentoDeTempo(80).desenhoMs).toBeGreaterThanOrEqual(12_066);
  });

  it("com poucas fotografias o desenho já está quase todo pago", () => {
    // A capa, os separadores e os painéis são páginas inteiras: com seis fotos
    // já estão desenhados. Passar de 6 para 80 não chega a duplicar.
    expect(orcamentoDeTempo(80).desenhoMs).toBeLessThan(orcamentoDeTempo(6).desenhoMs * 2);
  });

  it("a rede conta por LOTES de quatro, não por fotografia", () => {
    const uma = orcamentoDeTempo(1);
    const quatro = orcamentoDeTempo(4);
    expect(quatro.msPessimista - quatro.desenhoMs).toBe(uma.msPessimista - uma.desenhoMs);
  });

  it("um documento sem fotografias nenhumas não gasta rede nenhuma", () => {
    const o = orcamentoDeTempo(0);
    expect(o.msOptimista).toBe(o.desenhoMs);
    expect(o.aperta).toBe(false);
  });
});
