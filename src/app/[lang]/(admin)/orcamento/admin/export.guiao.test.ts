// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { printRunSheet } from "./export";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PAPEL E O ECRÃ TÊM DE DIZER O MESMO SOBRE O MESMO DIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este é o guião que se IMPRIME e se entrega à equipa na manhã do evento: o que
 * não está nele não acontece.
 *
 * E ordenava com `localeCompare` — por ordem alfabética das horas. O «02:00
 * Encerramento e desmontagem» saía em PRIMEIRO lugar no papel, e em último no
 * ecrã, porque o `EventTimeline` tem desde sempre a regra do dia que passa da
 * meia-noite. Dois documentos a discordar sobre a ordem do mesmo dia — e o que
 * a equipa segue é o de papel.
 *
 * Ninguém tinha um teste a olhar para esta secção. Agora tem.
 */

/** O HTML escrito na janela de impressão. */
function imprimir(q: Partial<Quote>): string {
  let html = "";
  const janela = {
    document: {
      write: (t: string) => {
        html += t;
      },
      close: () => {},
    },
  };
  vi.spyOn(window, "open").mockReturnValue(janela as unknown as Window);
  printRunSheet({ id: "q1", name: "Casamento", ...q } as Quote);
  return html;
}

/** Os títulos dos momentos, pela ordem por que saem no papel. */
function ordemNoPapel(html: string, titulos: string[]): string[] {
  return titulos
    .map((t) => ({ t, i: html.indexOf(t) }))
    .filter((x) => x.i >= 0)
    .sort((a, b) => a.i - b.i)
    .map((x) => x.t);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("o guião impresso", () => {
  it("põe o encerramento das 02:00 no FIM do dia, e não no princípio", () => {
    const html = imprimir({
      timeline: [
        { id: "t1", time: "09:00", title: "Montagem" },
        { id: "t2", time: "23:00", title: "Festa" },
        { id: "t3", time: "02:00", title: "Encerramento" },
      ],
    });
    expect(ordemNoPapel(html, ["Montagem", "Festa", "Encerramento"])).toEqual([
      "Montagem",
      "Festa",
      "Encerramento",
    ]);
  });

  it("escreve o INTERVALO quando o momento tem duração — saber quando acaba é metade da informação", () => {
    const html = imprimir({
      timeline: [{ id: "t1", time: "08:00", title: "Montagem", duracao: 240 }],
    });
    expect(html).toContain("08:00 → 12:00");
  });

  it("e a hora sozinha quando não tem — um guião do modelo antigo imprime como sempre imprimiu", () => {
    const html = imprimir({
      timeline: [{ id: "t1", time: "08:00", title: "Montagem" }],
    });
    expect(html).toContain("Montagem");
    expect(html).not.toContain("→");
  });

  it("um intervalo que atravessa a meia-noite escreve-se como hora de relógio", () => {
    const html = imprimir({
      timeline: [{ id: "t1", time: "23:00", title: "Festa", duracao: 180 }],
    });
    expect(html).toContain("23:00 → 02:00");
  });

  it("sem cronograma continua a dizê-lo, em vez de imprimir uma tabela vazia", () => {
    expect(imprimir({ timeline: [] })).toContain("Sem cronograma definido.");
  });
});
