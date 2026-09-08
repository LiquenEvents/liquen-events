// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Calendario from "./Calendario";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM DIA SEM ANO NÃO É UMA DATA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro existe por causa de um defeito medido: o nome acessível de
 * cada célula da grelha era «9 de Janeiro — 2 eventos; Enter para ver» — sem
 * ANO nenhum.
 *
 * Num calendário que se percorre mês a mês, e nesta casa em que se fecham
 * datas com um ano e meio de antecedência, isso é uma data incompleta. O
 * cabeçalho diz «Janeiro 2026», mas diz-o UMA vez, lá atrás: quem chega às
 * células com um leitor de ecrã ouve trinta e um dias sem ano e não tem como
 * saber se está no mês que abriu ou dois cliques à frente. Confirmar uma data
 * com um casal é precisamente o momento em que enganar-se no ano custa caro.
 *
 * O que se prende aqui é o ANO no nome acessível, e que ele ACOMPANHA a
 * navegação — um ano fixo escrito à mão passaria a primeira verificação e
 * falharia a segunda, que é a que interessa.
 */

const PEDIDO: Quote = {
  id: "LIQ-1",
  name: "Marta Nunes",
  status: "aceite",
  date: "2026-01-09",
  guests: 60,
} as unknown as Quote;

const resposta = (body: unknown) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => resposta([])),
  );
  process.env.TZ = "Europe/Lisbon";
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2026-01-15T12:00:00.000Z"));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
  vi.unstubAllGlobals();
});

async function montar() {
  render(
    <ToastProvider>
      <Calendario quotes={[PEDIDO]} onOpen={() => {}} />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Janeiro 2026")).toBeInTheDocument());
}

describe("Calendário — o nome do dia", () => {
  it("diz o ano, não só o dia e o mês", async () => {
    await montar();

    expect(screen.getByLabelText(/^9 de Janeiro de 2026 — 1 evento/)).toBeInTheDocument();
  });

  it("um dia vazio também diz o ano — não é só quem tem eventos", async () => {
    await montar();

    expect(screen.getByLabelText(/^14 de Janeiro de 2026 — /)).toBeInTheDocument();
  });

  it("o ano acompanha o mês para onde se navega", async () => {
    await montar();

    // Recuar um mês leva a grelha a Dezembro de 2025: o ano tem de vir com ela.
    screen.getByLabelText("Mês anterior").click();

    await waitFor(() => expect(screen.getByText("Dezembro 2025")).toBeInTheDocument());
    expect(screen.getByLabelText(/^9 de Dezembro de 2025 — /)).toBeInTheDocument();
  });
});
