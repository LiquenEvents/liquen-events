import { describe, it, expect } from "vitest";
import {
  CONTAGEM_VAZIA,
  PARADO_AO_FIM_DE,
  comAcontecimento,
  emPalavras,
  totalAte,
  type Acontecimento,
} from "./tempo-activo";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RELÓGIO DE PAREDE MENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma proposta aberta às 9h e enviada às 18h não custou nove horas. Se a
 * medição dissesse nove, a conclusão que se tirava dela seria falsa — e uma
 * medição que leva a uma conclusão falsa é pior do que não medir.
 *
 * O relógio é injectado em todos estes testes: nenhum depende de esperar.
 */

const M = 60_000;
const correr = (acs: Acontecimento[]) => acs.reduce(comAcontecimento, CONTAGEM_VAZIA);

describe("o que conta como trabalho", () => {
  it("dois minutos a mexer contam dois minutos", () => {
    const c = correr([
      { tipo: "vida", em: 0 },
      { tipo: "vida", em: 1 * M },
      { tipo: "pausa", em: 2 * M },
    ]);
    expect(c.activo).toBe(2 * M);
  });

  it("o tempo com a página atrás do email não conta", () => {
    // Trabalha dois minutos (com sinais de vida pelo meio, que é o que
    // escrever produz), sai, volta aos 40 e trabalha mais um: contam-se três
    // minutos, não quarenta e um.
    const c = correr([
      { tipo: "vida", em: 0 },
      { tipo: "vida", em: 30_000 },
      { tipo: "vida", em: 60_000 },
      { tipo: "vida", em: 90_000 },
      { tipo: "pausa", em: 2 * M },
      { tipo: "vida", em: 40 * M },
      { tipo: "vida", em: 40.5 * M },
      { tipo: "pausa", em: 41 * M },
    ]);
    expect(c.activo).toBe(3 * M);
  });

  it("dois minutos em foco SEM tocar em nada contam um, não dois", () => {
    // O tecto vale para qualquer intervalo entre sinais, incluindo o primeiro:
    // é a mesma regra do ecrã aberto enquanto ela foi ao telefone, e é por isso
    // que o teste de cima tem de mandar sinais pelo meio — porque escrever
    // manda-os.
    expect(
      correr([
        { tipo: "vida", em: 0 },
        { tipo: "pausa", em: 2 * M },
      ]).activo,
    ).toBe(PARADO_AO_FIM_DE);
  });

  it("o ecrã aberto enquanto ela foi ao telefone conta um minuto, não vinte", () => {
    // Este é o caso mais comum de todos: o separador em foco, ninguém a mexer.
    const c = correr([
      { tipo: "vida", em: 0 },
      { tipo: "vida", em: 20 * M },
    ]);
    expect(c.activo).toBe(PARADO_AO_FIM_DE);
  });

  it("uma pausa sem nada antes não inventa tempo", () => {
    expect(correr([{ tipo: "pausa", em: 5 * M }]).activo).toBe(0);
    expect(CONTAGEM_VAZIA.activo).toBe(0);
  });

  it("um relógio que anda para trás não tira tempo ao que já foi feito", () => {
    // Acontece a sério: mudança de hora, sincronização do sistema.
    const c = correr([
      { tipo: "vida", em: 10 * M },
      { tipo: "vida", em: 2 * M },
    ]);
    expect(c.activo).toBe(0);
    expect(c.desde).toBe(2 * M);
  });
});

describe("o total agora", () => {
  it("inclui o tempo desde o último sinal, com o mesmo tecto", () => {
    const c = correr([{ tipo: "vida", em: 0 }]);
    expect(totalAte(c, 30_000)).toBe(30_000);
    expect(totalAte(c, 90 * M)).toBe(PARADO_AO_FIM_DE);
  });

  it("em pausa, o total está quieto", () => {
    const c = correr([
      { tipo: "vida", em: 0 },
      { tipo: "pausa", em: 1 * M },
    ]);
    expect(totalAte(c, 999 * M)).toBe(1 * M);
  });
});

describe("o tempo em palavras", () => {
  it("diz a ordem de grandeza, sem segundos a piscar num canto", () => {
    expect(emPalavras(0)).toBe("menos de 1 min");
    expect(emPalavras(59_000)).toBe("menos de 1 min");
    expect(emPalavras(12 * M)).toBe("12 min");
    expect(emPalavras(60 * M)).toBe("1 h 00");
    expect(emPalavras(65 * M)).toBe("1 h 05");
    expect(emPalavras(185 * M)).toBe("3 h 05");
  });
});
