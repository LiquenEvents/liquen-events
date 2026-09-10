// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { analisarODia } from "@/lib/orcamento/guiao-do-dia";
import type { TimelineItem } from "@/lib/orcamento/types";
import { GrelhaDoDia } from "./GrelhaDoDia";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GRELHA TEM DE SE LER EM VOZ ALTA E EM TONS DE CINZENTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O que esta vista promete: **olhar para as 14:00 e ver, lado a lado, o que
 * cada um está a fazer.** As duas maneiras de falhar essa promessa em silêncio
 * são as que se prendem aqui:
 *
 *  · um bloco que diga o seu estado só com COR — a regra da casa, e já houve
 *    aqui um calendário a fazê-lo. Um choque tem de trazer a PALAVRA;
 *  · um nome acessível que seja um código («Choque, 1») em vez da frase
 *    inteira, que é o que quem ouve o ecrã recebe e o que quem lê o guião ao
 *    telefone tem de conseguir dizer;
 *  · e um momento que desapareça da grelha sem uma palavra — o que acontece a
 *    quem não tem hora legível, e que sem aviso põe a grelha a mostrar menos
 *    dia do que o guião tem.
 *
 * ── O QUE NÃO SE MEDE AQUI, E PORQUÊ ──────────────────────────────────────
 *
 * Alturas, larguras e a posição dos blocos. Em jsdom não há disposição nenhuma
 * — `getBoundingClientRect` devolve zeros — portanto medir a altura de um bloco
 * aqui era medir zero e passar sempre, que é pior do que não medir. A
 * aritmética está presa em `lib/orcamento/guioes.colunas.test.ts` (funções
 * puras) e os PÍXEIS medem-se num browser, em `e2e/grelha-do-dia.spec.ts`.
 */

const momento = (
  id: string,
  time: string,
  title: string,
  owner?: string,
  duracao?: number,
): TimelineItem => ({
  id,
  time,
  title,
  ...(owner ? { owner } : {}),
  ...(duracao ? { duracao } : {}),
});

function desenhar(items: TimelineItem[], agora: number | null = null) {
  return render(<GrelhaDoDia dia={analisarODia(items)} agora={agora} chaveDoEvento="e1" />);
}

afterEach(cleanup);

describe("GrelhaDoDia", () => {
  it("dá uma coluna a cada responsável, e junta as grafias da mesma pessoa", () => {
    desenhar([
      momento("a", "09:00", "Montagem", "Ana Silva", 180),
      momento("b", "14:00", "Arranjos", "ana silva ", 60),
      momento("c", "17:00", "Cerimónia", "Rui", 45),
    ]);

    expect(screen.getByRole("region", { name: "Coluna de Ana Silva" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Coluna de Rui" })).toBeTruthy();
    // «ana silva » não abre coluna nenhuma: se abrisse, o ecrã dizia que há
    // três pessoas no dia enquanto o motor dizia que há duas.
    expect(screen.getAllByRole("region")).toHaveLength(2);
  });

  it("o nome acessível de um bloco é a frase inteira, e não um código", () => {
    desenhar([momento("a", "14:00", "Montagem do arco", "Ana Silva", 90)]);

    const coluna = screen.getByRole("region", { name: "Coluna de Ana Silva" });
    expect(
      within(coluna).getByText("Ana Silva · Montagem do arco · 14:00 às 15:30, 1 h 30"),
    ).toBeTruthy();
  });

  it("um choque leva a PALAVRA e não só a cor", () => {
    desenhar([
      momento("a", "09:00", "Montagem", "Ana", 240),
      momento("b", "10:00", "Prova de bolo", "Ana", 60),
    ]);

    const coluna = screen.getByRole("region", { name: "Coluna de Ana" });
    // Duas vezes «Choque» à vista: uma por cada bloco do par. Num ecrã em tons
    // de cinzento é isto que separa este bloco dos outros.
    expect(within(coluna).getAllByText("Choque")).toHaveLength(2);
    // E a frase diz o que se passa, não o nome do estado.
    expect(
      within(coluna).getByText(
        /Prova de bolo.*Choque: a mesma pessoa em dois sítios ao mesmo tempo/,
      ),
    ).toBeTruthy();
  });

  it("CONTROLO NEGATIVO: um dia sem choque nenhum não escreve «Choque» em lado nenhum", () => {
    // Sem este par, o teste de cima passava com uma grelha que escrevesse
    // «Choque» em todos os blocos.
    desenhar([
      momento("a", "09:00", "Montagem", "Ana", 120),
      momento("b", "11:00", "Almoço", "Ana", 60),
    ]);
    expect(screen.queryAllByText("Choque")).toHaveLength(0);
  });

  it("um instante diz que é um instante — na frase e não só na forma", () => {
    desenhar([momento("a", "17:00", "Cerimónia", "Rui")]);

    expect(
      screen.getByText("Rui · Cerimónia · 17:00, um instante sem duração marcada"),
    ).toBeTruthy();
  });

  it("os momentos sem responsável têm coluna própria, e é a última", () => {
    desenhar([
      momento("a", "08:00", "Abrir o espaço", undefined, 60),
      momento("b", "09:00", "Montagem", "Ana", 120),
    ]);

    const regioes = screen.getAllByRole("region").map((r) => r.getAttribute("aria-label"));
    expect(regioes).toEqual(["Coluna de Ana", "Coluna de Sem responsável"]);
  });

  it("um momento sem hora legível não desaparece em silêncio", () => {
    desenhar([
      momento("a", "09:00", "Montagem", "Ana", 120),
      momento("b", "", "Falta combinar a hora", "Ana"),
    ]);

    expect(screen.getByText(/«Falta combinar a hora» não tem hora legível/)).toBeTruthy();
  });

  it("a legenda diz o que a POSIÇÃO significa — a única coisa que um bloco não pode dizer sozinho", () => {
    desenhar([momento("a", "09:00", "Montagem", "Ana", 120)]);
    expect(screen.getByText(/Colunas lado a lado à mesma altura/)).toBeTruthy();
  });

  it("sem «agora» não há coluna a dizer «Livre» — fora do dia do evento isso era ruído", () => {
    desenhar([momento("a", "09:00", "Montagem", "Ana", 120)], null);
    expect(screen.queryByText("Livre")).toBeNull();
  });

  it("no dia do evento, quem não tem nada a esta hora aparece como «Livre»", () => {
    // 14:00 = 840 minutos. A Ana está a montar; o Rui só entra às 17:00.
    desenhar(
      [
        momento("a", "09:00", "Montagem", "Ana", 480),
        momento("b", "17:00", "Cerimónia", "Rui", 45),
      ],
      14 * 60,
    );
    expect(screen.getByText("Livre")).toBeTruthy();
    // «Montagem» duas vezes: uma no bloco e outra no cabeçalho da coluna da
    // Ana, que é onde se lê o que ela está a fazer AGORA sem procurar a risca.
    expect(screen.getAllByText("Montagem")).toHaveLength(2);
  });

  it("uma timeline sem momentos com hora não desenha grelha nenhuma, e diz porquê", () => {
    desenhar([momento("a", "", "Por combinar", "Ana")]);
    expect(screen.queryAllByRole("region")).toHaveLength(0);
    expect(screen.getByText(/ainda não tem momentos com hora/)).toBeTruthy();
  });
});
