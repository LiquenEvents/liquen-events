// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import Clientes from "./Clientes";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * "HÁ QUANTO TEMPO" É UMA CONTA DE DIAS DO CALENDÁRIO, NÃO DE 24 HORAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A coluna do último contacto na lista de clientes é o que decide a quem se
 * liga a seguir. Media o intervalo em milissegundos e dividia por 24 h, o que
 * não é a mesma coisa que contar dias: um pedido que entrou ONTEM às 21h,
 * visto hoje às 00h30 (a hora a que ela fecha o dia), dava 3 h e meia — menos
 * de um dia — e aparecia como "hoje". Um pedido de terça à noite, visto na
 * sexta de manhã, dava 2,4 dias e aparecia como "há 2d" quando já eram três.
 *
 * O relógio fica preso em Lisboa e à meia-noite e meia de Verão (23:30 UTC),
 * que é onde as duas contas mais se afastam.
 */

const NOITE_DE_LISBOA = new Date("2026-08-12T23:30:00.000Z"); // 13/08, 00:30 local

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana Ribeiro",
    email: "ana@exemplo.pt",
    phone: "910000000",
    company: "",
    guests: 80,
    status: "pendente",
    submittedAt: "2026-08-12T20:00:00.000Z",
    ...over,
  }) as unknown as Quote;

function montar(quotes: Quote[]) {
  return render(<Clientes quotes={quotes} onOpen={() => {}} />);
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete process.env.TZ;
});

describe("Clientes — o último contacto conta dias locais", () => {
  it("um pedido de ontem à noite lido depois da meia-noite diz 'ontem', não 'hoje'", () => {
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers();
    vi.setSystemTime(NOITE_DE_LISBOA);

    // 12/08 às 21:00 em Lisboa — o dia civil anterior, a 3h30 de distância.
    montar([pedido({ submittedAt: "2026-08-12T20:00:00.000Z" })]);

    expect(screen.getByText("ontem")).toBeInTheDocument();
    expect(screen.queryByText("hoje")).not.toBeInTheDocument();
  });

  it("um pedido de hoje continua a dizer 'hoje'", () => {
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers();
    vi.setSystemTime(NOITE_DE_LISBOA);

    // 13/08 às 00:10 em Lisboa — já é hoje, mesmo faltando pouco para a meia-noite.
    montar([pedido({ submittedAt: "2026-08-12T23:10:00.000Z" })]);

    expect(screen.getByText("hoje")).toBeInTheDocument();
  });

  it("três noites atrás são 'há 3d' e não 'há 2d'", () => {
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers();
    // 14/08 às 09:00 em Lisboa.
    vi.setSystemTime(new Date("2026-08-14T08:00:00.000Z"));

    // 11/08 às 22:00 em Lisboa: 11 → 12 → 13 → 14 são três dias de calendário,
    // mas só 2,46 intervalos de 24 h.
    montar([pedido({ submittedAt: "2026-08-11T21:00:00.000Z" })]);

    expect(screen.getByText("há 3d")).toBeInTheDocument();
  });

  it("a passagem do fim do mês conta os dias certos (31/07 → 02/08 são 2 dias)", () => {
    process.env.TZ = "Europe/Lisbon";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-02T08:00:00.000Z"));

    montar([pedido({ submittedAt: "2026-07-31T21:00:00.000Z" })]);

    expect(screen.getByText("há 2d")).toBeInTheDocument();
  });
});
