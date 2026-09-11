import { describe, expect, it } from "vitest";
import {
  FIM_DA_JANELA,
  HORAS_DA_COLUNA,
  INICIO_DA_JANELA,
  dentroDaJanela,
  diasDaSemana,
  disporEmPistas,
  minutoDoRelogio,
  tituloDaSemana,
} from "./dia-do-calendario";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A GEOMETRIA DAS VISTAS DE DIA E DE SEMANA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O que aqui se mede é o que NÃO se vê num screenshot: as pistas de eventos
 * sobrepostos, os limites da janela e a semana que começa à segunda. É a parte
 * que fica errada em silêncio — uma vista de dia com as pistas mal repartidas
 * desenha-se na mesma, bonita, a dizer que a tarde está livre.
 */

/** Ajuda a ler os casos: "09:00" → minutos desde a meia-noite. */
const m = (hora: string) => {
  const [h, min] = hora.split(":").map(Number);
  return h * 60 + min;
};

const bloco = (chave: string, de: string, ate: string) => ({
  chave,
  inicio: m(de),
  fim: m(ate),
});

describe("a janela do dia", () => {
  it("vai das 07:00 às 24:00, que é o que a Parte 3 do documento manda", () => {
    expect(INICIO_DA_JANELA).toBe(7 * 60);
    expect(FIM_DA_JANELA).toBe(24 * 60);
  });

  it("a coluna escreve dezassete horas — das 07:00 às 23:00", () => {
    expect(HORAS_DA_COLUNA).toHaveLength(17);
    expect(HORAS_DA_COLUNA[0]).toBe(m("07:00"));
    expect(HORAS_DA_COLUNA[HORAS_DA_COLUNA.length - 1]).toBe(m("23:00"));
  });

  it("uma marcação antes das sete encosta-se ao topo em vez de desaparecer", () => {
    // Uma montagem às 06:00 EXISTE. Desenhá-la fora da caixa era escondê-la;
    // não a desenhar era mentir sobre o dia.
    expect(dentroDaJanela(m("06:00"))).toBe(INICIO_DA_JANELA);
    expect(dentroDaJanela(m("23:30"))).toBe(m("23:30"));
    expect(dentroDaJanela(m("25:00"))).toBe(FIM_DA_JANELA);
  });
});

describe("as pistas dos eventos sobrepostos", () => {
  it("dois eventos que não se tocam ficam os dois na largura toda", () => {
    const posto = disporEmPistas([bloco("a", "09:00", "10:00"), bloco("b", "11:00", "12:00")]);
    expect(posto.map((p) => [p.chave, p.pista, p.pistas])).toEqual([
      ["a", 0, 1],
      ["b", 0, 1],
    ]);
  });

  it("dois eventos à mesma hora repartem a coluna ao meio", () => {
    const posto = disporEmPistas([bloco("a", "09:00", "10:00"), bloco("b", "09:30", "10:30")]);
    expect(posto.every((p) => p.pistas === 2)).toBe(true);
    expect(new Set(posto.map((p) => p.pista))).toEqual(new Set([0, 1]));
  });

  it("A–B e B–C sobrepõem-se, A e C não — e os TRÊS repartem a mesma largura", () => {
    /* É o caso que sai errado quando se compara aos pares em vez de fechar o
       grupo: sem o fecho transitivo, o B ficava com metade da coluna numa ponta
       e um terço na outra, e o bloco desenhava-se torto. */
    const posto = disporEmPistas([
      bloco("a", "09:00", "11:00"),
      bloco("b", "10:00", "12:00"),
      bloco("c", "11:30", "13:00"),
    ]);
    expect(posto.map((p) => p.pistas)).toEqual([2, 2, 2]);
    const porChave = new Map(posto.map((p) => [p.chave, p.pista]));
    expect(porChave.get("a")).not.toBe(porChave.get("b"));
    // O C já não choca com o A: volta à pista dele em vez de abrir uma terceira.
    expect(porChave.get("c")).toBe(porChave.get("a"));
  });

  it("um grupo que fecha não contamina o seguinte", () => {
    const posto = disporEmPistas([
      bloco("a", "09:00", "10:00"),
      bloco("b", "09:00", "10:00"),
      bloco("c", "15:00", "16:00"),
    ]);
    const porChave = new Map(posto.map((p) => [p.chave, p.pistas]));
    expect(porChave.get("a")).toBe(2);
    expect(porChave.get("b")).toBe(2);
    // O da tarde está sozinho e leva a coluna inteira — não as duas pistas da
    // manhã.
    expect(porChave.get("c")).toBe(1);
  });

  it("o mais LONGO fica na pista da esquerda quando começam à mesma hora", () => {
    // Ao contrário, o bloco de três horas aparecia encostado à direita e a
    // manhã lia-se como partida.
    const posto = disporEmPistas([
      bloco("curto", "09:00", "10:00"),
      bloco("longo", "09:00", "12:00"),
    ]);
    expect(posto.find((p) => p.chave === "longo")!.pista).toBe(0);
  });

  it("não perde nem inventa blocos", () => {
    const entrada = [bloco("a", "09:00", "10:00"), bloco("b", "09:00", "10:00")];
    expect(disporEmPistas(entrada)).toHaveLength(2);
    expect(disporEmPistas([])).toEqual([]);
  });
});

describe("a semana", () => {
  it("começa à segunda-feira, mesmo quando se pede um domingo", () => {
    // 2026-09-13 é um domingo. A semana dele é 7 → 13, e não 13 → 19.
    expect(diasDaSemana("2026-09-13")).toEqual([
      "2026-09-07",
      "2026-09-08",
      "2026-09-09",
      "2026-09-10",
      "2026-09-11",
      "2026-09-12",
      "2026-09-13",
    ]);
  });

  it("uma segunda-feira é o primeiro dia da sua própria semana", () => {
    expect(diasDaSemana("2026-09-07")[0]).toBe("2026-09-07");
  });

  it("atravessa a virada do mês sem se partir", () => {
    const dias = diasDaSemana("2026-10-01");
    expect(dias).toHaveLength(7);
    expect(dias[0]).toBe("2026-09-28");
    expect(dias[6]).toBe("2026-10-04");
  });
});

describe("o título da semana", () => {
  it("não repete o mês quando a semana inteira cabe nele", () => {
    expect(tituloDaSemana(diasDaSemana("2026-09-09"))).toBe("7 – 13 Set 2026");
  });

  it("escreve os dois meses quando a semana os atravessa", () => {
    expect(tituloDaSemana(diasDaSemana("2026-10-01"))).toBe("28 Set – 4 Out 2026");
  });

  it("escreve os dois anos, e só aí, quando a semana muda de ano", () => {
    // 2026-12-28 é uma segunda; a semana acaba a 2027-01-03.
    expect(tituloDaSemana(diasDaSemana("2026-12-31"))).toBe("28 Dez 2026 – 3 Jan 2027");
  });
});

describe("o minuto do relógio", () => {
  it("conta desde a meia-noite LOCAL, não desde a UTC", () => {
    // A linha do «agora» tem de cair onde ela vê o relógio da parede. Contada
    // em UTC, em Lisboa no verão ficava uma hora acima.
    const d = new Date(2026, 8, 10, 14, 35, 0);
    expect(minutoDoRelogio(d)).toBe(14 * 60 + 35);
  });
});
