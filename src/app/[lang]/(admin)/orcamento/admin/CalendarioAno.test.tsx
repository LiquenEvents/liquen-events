// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CalendarioAno from "./CalendarioAno";
import type { CalendarEvent, Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VISTA QUE RESPONDE A «TEMOS LIVRE EM JULHO DE 2027?»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Dois grupos de casos, e os dois vêm do documento:
 *
 *  · a RESPOSTA. O critério nº 7 da Parte 9 do `docs/APPLE-CALENDARIO.md` dá
 *    três segundos à pergunta. Aqui não se mede o relógio — mede-se que a
 *    resposta está escrita numa linha por mês, que é o que faz os três
 *    segundos serem possíveis. Uma vista onde a resposta só existe na grelha
 *    de pontos passaria a olho e chumbava o cronómetro.
 *
 *  · a COR NÃO É A ÚNICA VIA. A Parte 10 proíbe comunicar estado só por cor, e
 *    numa vista de ano é a tentação inteira: trezentos e sessenta e cinco
 *    quadrados coloridos. Estes casos prendem a PALAVRA — no nome acessível de
 *    cada dia e no resumo de cada mês.
 */

const pedido = (over: Partial<Quote> & { id: string }): Quote =>
  ({ name: "Marta Nunes", guests: 80, status: "aceite", ...over }) as unknown as Quote;

const marcacao = (over: Partial<CalendarEvent> & { id: string; date: string }): CalendarEvent =>
  ({
    kind: "reuniao",
    title: "Prova de bolo",
    createdAt: "2027-01-01T10:00:00.000Z",
    ...over,
  }) as CalendarEvent;

function montar({
  quotes = [] as Quote[],
  marcacoes = [] as CalendarEvent[],
  hoje = "2026-09-10",
  onAbrirMes = vi.fn(),
} = {}) {
  render(
    <CalendarioAno
      ano={2027}
      quotes={quotes}
      marcacoes={marcacoes}
      hoje={hoje}
      onAbrirMes={onAbrirMes}
    />,
  );
  return { onAbrirMes };
}

/** A grelha de um mês, pelo nome com que ela se anuncia. */
const grelhaDe = (mes: string) => screen.getByRole("grid", { name: new RegExp(`^${mes} de 2027`) });

afterEach(cleanup);

describe("os doze meses", () => {
  it("desenha o ano inteiro, mês a mês", () => {
    montar();
    expect(screen.getAllByRole("grid")).toHaveLength(12);
    expect(screen.getByRole("button", { name: /^Julho/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Dezembro/ })).toBeInTheDocument();
  });

  it("cada semana tem sete células — nenhuma linha desalinha", () => {
    montar();
    // Julho de 2027 começa a uma quinta-feira: três células vazias antes do 1.
    const linhas = within(grelhaDe("Julho")).getAllByRole("row");
    // A primeira linha é o cabeçalho de colunas; as outras são semanas.
    for (const linha of linhas.slice(1)) {
      expect(within(linha).getAllByRole("gridcell")).toHaveLength(7);
    }
  });

  it("nomeia os dias da semana por extenso, apesar de mostrar só a inicial", () => {
    montar();
    const cabecalhos = within(grelhaDe("Julho")).getAllByRole("columnheader");
    expect(cabecalhos.map((c) => c.getAttribute("aria-label"))).toEqual([
      "Segunda-feira",
      "Terça-feira",
      "Quarta-feira",
      "Quinta-feira",
      "Sexta-feira",
      "Sábado",
      "Domingo",
    ]);
  });
});

describe("a resposta à pergunta está numa linha, e não na grelha de pontos", () => {
  it("um mês sem nada diz «Livre», à vista", () => {
    montar();
    expect(screen.getByRole("button", { name: "Julho de 2027 — Livre" })).toBeInTheDocument();
  });

  it("um mês tomado diz quantos dias estão fechados", () => {
    montar({
      quotes: [
        pedido({ id: "A", date: "2027-07-10", status: "aceite" }),
        pedido({ id: "B", date: "2027-07-17", status: "cotado" }),
      ],
    });

    expect(
      screen.getByRole("button", { name: "Julho de 2027 — 2 dias fechados" }),
    ).toBeInTheDocument();
    // …e os outros onze continuam a responder «Livre», que é metade da resposta.
    expect(screen.getByRole("button", { name: "Agosto de 2027 — Livre" })).toBeInTheDocument();
  });

  it("separa o que fecha do que só marca — é a diferença entre «não dá» e «dá»", () => {
    montar({
      quotes: [
        pedido({ id: "A", date: "2027-07-10", status: "aceite" }),
        pedido({ id: "B", date: "2027-07-20", status: "pendente" }),
      ],
    });

    expect(
      screen.getByRole("button", { name: "Julho de 2027 — 1 dia fechado · 1 com marcações" }),
    ).toBeInTheDocument();
  });

  it("a grelha de cada mês repete a resposta no seu nome acessível", () => {
    montar({ quotes: [pedido({ id: "A", date: "2027-07-10", status: "aceite" })] });
    expect(grelhaDe("Julho")).toHaveAccessibleName("Julho de 2027 — 1 dia fechado");
  });
});

describe("um dia identifica-se sem depender da cor", () => {
  it("um dia fechado diz a palavra «fechado» e o ano", () => {
    montar({ quotes: [pedido({ id: "A", date: "2027-07-10", status: "aceite" })] });
    expect(
      within(grelhaDe("Julho")).getByRole("gridcell", {
        name: "10 de Julho de 2027 — dia fechado, 1 marcação",
      }),
    ).toBeInTheDocument();
  });

  it("um dia com marcações continua a dizer que está livre", () => {
    montar({ marcacoes: [marcacao({ id: "m1", date: "2027-07-03", kind: "reuniao" })] });
    expect(
      within(grelhaDe("Julho")).getByRole("gridcell", {
        name: "3 de Julho de 2027 — livre, com 1 marcação",
      }),
    ).toBeInTheDocument();
  });

  it("um dia sem nada diz que está livre", () => {
    montar();
    expect(
      within(grelhaDe("Julho")).getByRole("gridcell", { name: "18 de Julho de 2027 — livre" }),
    ).toBeInTheDocument();
  });

  it("o número do dia é decoração — quem lê ouve a frase inteira, não «10»", () => {
    // O disco e o ponto são `aria-hidden`: se não fossem, o nome da célula
    // passava a «10 10 de Julho…» e o estado ficava atrás do ruído.
    montar({ quotes: [pedido({ id: "A", date: "2027-07-10", status: "aceite" })] });
    const celula = within(grelhaDe("Julho")).getByRole("gridcell", {
      name: /^10 de Julho/,
    });
    expect(celula).toHaveTextContent("10");
    expect(celula.querySelector("[aria-hidden='true']")).not.toBeNull();
  });

  it("marca hoje com `aria-current`, e só hoje", () => {
    montar({ hoje: "2027-07-04" });
    const dias = within(grelhaDe("Julho"))
      .getAllByRole("gridcell")
      .filter((c) => c.getAttribute("aria-current") === "date");
    expect(dias).toHaveLength(1);
    expect(dias[0]).toHaveAccessibleName(/^4 de Julho de 2027/);
  });
});

describe("a saída da vista", () => {
  it("carregar num mês abre esse mês na grelha do mês", async () => {
    const { onAbrirMes } = montar();
    await userEvent.click(screen.getByRole("button", { name: /^Julho/ }));
    // 6 = Julho, na contagem do `Date` (0 é Janeiro).
    expect(onAbrirMes).toHaveBeenCalledWith(6);
  });

  it("há doze alvos e não trezentos e sessenta e cinco", () => {
    // Os dias não são focáveis de propósito: o ano na ordem de tabulação
    // punha o painel seguinte a 365 `Tab` de distância.
    montar();
    expect(screen.getAllByRole("button")).toHaveLength(12);
  });
});
