// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Quote } from "@/lib/orcamento/types";
import type { DossierData } from "@/lib/orcamento/dossier";
import DossierClient from "./DossierClient";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O DOSSIER DO EVENTO NUM iPHONE SE — 667 px, e 519 gastos antes do conteúdo
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO a 375×667 somando as classes (o jsdom não faz layout — a geometria a
 * sério mede-se no browser; o que aqui se guarda é a DECISÃO):
 *
 *   Cabeçalho fixo, antes            505 px   ┐
 *   Respiro do `<main>` (`py-6`)      24 px   ┘ 529 antes da 1.ª métrica
 *
 * Dos 505, mais de metade é gente que só se lê UMA VEZ e ficava lá COLADA
 * (`sticky top-0`) enquanto ela rolava o dossier inteiro numa quinta:
 * o link de voltar com o rótulo (56), o eyebrow «Dossier do Evento» (23), a
 * linha de factos por baixo do nome (26) e o cartão de «Próxima ação» (191).
 *
 * O que fica ao descer é o que dá contexto a quem já rolou: o NOME do evento,
 * a FILA DE ACÇÕES e a SAÍDA. A saída não é negociável — o dossier vive em
 * `evento/[id]`, fora do `AdminClient`, sem barra de baixo nem gaveta: este
 * link é o único caminho de volta ao back office, e por isso o que desaparece
 * dele é só a PALAVRA, nunca o alvo.
 *
 * Depois: 197 px de cabeçalho encolhido e 12 de respiro — 209 dos 667.
 */

// As ferramentas do dossier chegam por `next/dynamic`; aqui interessa a
// MOLDURA (zonas, painel lateral, cabeçalho), não o que vive lá dentro.
vi.mock("../../lazy", () => ({
  ActivityLog: () => <p>registo</p>,
  PaymentsPanel: () => null,
  EventCosts: () => null,
  EventTasks: () => null,
  EventChecklist: () => null,
  ProductionPlan: () => null,
  EventTimeline: () => null,
  GuestList: () => null,
  ProposalStudio: () => null,
  ClientMessenger: () => null,
}));

const QUOTE = {
  id: "LIQ-1",
  name: "Ana e Rui",
  email: "ana@exemplo.pt",
  phone: "912345678",
  status: "cotado",
  category: "particulares",
  eventType: "casamentos",
  location: "Quinta do Vale",
  date: "2026-09-12",
  guests: 120,
  submittedAt: "2026-07-01T10:00:00.000Z",
} as unknown as Quote;

const DADOS: DossierData = { quote: QUOTE, proposal: null, contract: null };

function desenhar() {
  return render(
    <DossierClient data={DADOS} portalUrl="/pt/portal/abc" lang="pt" userName="Catarina" />,
  );
}

/** Rolar a página de verdade: o `useDesceu` lê `window.scrollY` no evento. */
function rolar(y: number) {
  act(() => {
    Object.defineProperty(window, "scrollY", { value: y, configurable: true, writable: true });
    fireEvent.scroll(window);
  });
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { headers: { "content-type": "application/json" } })),
  );
  Object.defineProperty(window, "scrollY", { value: 0, configurable: true, writable: true });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const saida = () => screen.getByRole("link", { name: /pedidos/i });
const titulo = () => screen.getByRole("heading", { level: 1 });
/** A linha de factos por baixo do nome — «tipo · data · local», juntos por
 *  « · ». O local aparece TAMBÉM no painel lateral, por isso a âncora é o
 *  separador e não a palavra. */
const subtitulo = () =>
  screen.queryAllByText(/·/).find((n) => n.textContent?.includes("· Quinta do Vale"));

describe("o cabeçalho do dossier encolhe assim que ela começa a descer", () => {
  it("no topo mostra-se por inteiro", () => {
    desenhar();
    expect(screen.getByText("Dossier do Evento")).toBeTruthy();
    expect(subtitulo()).toBeTruthy();
    expect(screen.getByText("Próxima ação")).toBeTruthy();
    // A palavra do link de voltar está à vista, não só para leitores de ecrã.
    expect(saida().querySelector("span")?.className ?? "").not.toMatch(/sr-only/);
  });

  it("ao descer larga tudo o que só se lê uma vez", () => {
    desenhar();
    rolar(400);
    // Os quatro blocos medidos: 56 + 23 + 26 + 191 px.
    expect(screen.queryByText("Dossier do Evento")).toBeNull();
    expect(subtitulo()).toBeUndefined();
    expect(screen.queryByText("Próxima ação")).toBeNull();
  });

  it("mas o nome do evento e a fila de acções ficam — é o que dá contexto a quem rolou", () => {
    desenhar();
    rolar(400);
    expect(titulo().textContent).toBe("Ana e Rui");
    // A barra de ferramentas do cabeçalho: partilhar, imprimir, calendário.
    expect(screen.getByTitle(/Copiar o link privado do portal/)).toBeTruthy();
    expect(screen.getByTitle(/Imprimir dossier completo/)).toBeTruthy();
    expect(screen.getByTitle(/Descarregar .ics/)).toBeTruthy();
  });

  it("a ÚNICA saída do ecrã nunca desaparece — só perde a palavra", () => {
    desenhar();
    rolar(400);
    const link = saida();
    // O nome acessível não muda: quem usa leitor de ecrã continua a ouvir
    // «Pedidos», e o alvo de 44 px continua declarado.
    expect(link.getAttribute("href")).toBe("/pt/orcamento/admin");
    expect(link.className).toMatch(/alvo-toque/);
    expect(link.querySelector("span")?.className ?? "").toMatch(/sr-only/);
  });

  it("volta a crescer quando ela volta ao topo", () => {
    desenhar();
    rolar(400);
    // A histerese do `useDesceu`: volta a crescer aos 8 px, não aos 24.
    rolar(0);
    expect(screen.getByText("Dossier do Evento")).toBeTruthy();
    expect(screen.getByText("Próxima ação")).toBeTruthy();
  });

  it("encolhe sem animar geometria", () => {
    desenhar();
    // O que muda são linhas que saem da árvore. Uma transição de `padding`,
    // `height` ou `all` aqui era recálculo de layout a cada frame no meio do
    // scroll — ver `src/app/Fluidez.contrato.test.ts`.
    const faixa = titulo().closest("header")!;
    expect(faixa.innerHTML).not.toMatch(/transition-(all|\[(padding|height|width))/);
  });
});

describe("as três zonas perdem a moldura no telemóvel", () => {
  it.each([
    ["zone-financeiro", "Financeiro"],
    ["zone-producao", "Produção"],
    ["zone-comunicacao", "Comunicação"],
  ])("%s (%s): risco abaixo de 640, cartão a partir de 640", (id) => {
    const { container } = desenhar();
    const zona = container.querySelector(`#${id}`)!;
    // Sem `bo-card`: eram 40 px de enchimento e 2 de borda dentro de outros 32
    // do `px-4` e à volta de mais 26 do cartão de cada ferramenta.
    expect(zona.className).not.toMatch(/bo-card/);
    // No lugar da moldura, um risco a separá-la da zona anterior.
    expect(zona.className).toMatch(/border-t/);
    // E a partir de 640 o cartão volta inteiro.
    expect(zona.className).toMatch(/sm:rounded-\[var\(--bo-radius-lg\)\]/);
    expect(zona.className).toMatch(/sm:border\b/);
    expect(zona.className).toMatch(/sm:p-\[var\(--bo-p-cartao\)\]/);
  });
});

describe("a coluna lateral", () => {
  it("começa aos 1024 e não aos 1280 — o portátil dela deixa de a mandar para o fim", () => {
    const { container } = desenhar();
    // O primeiro `div.grid` do `<main>` é a faixa de métricas; o segundo é a
    // grelha «conteúdo + coluna lateral».
    const grelha = container.querySelectorAll("main > div.grid")[1];
    expect(grelha.className).toMatch(/lg:grid-cols-\[minmax\(0,1fr\)_20rem\]/);
    // `md:`, `xl:` e `2xl:` não existem neste back office (ver `ui/adaptativo.ts`
    // e `Cortes.contrato.test.ts`, de onde o tecto deste ficheiro saiu).
    expect(container.innerHTML).not.toMatch(/\bxl:/);
  });

  it("os três cartões do painel perdem a moldura pela mesma razão que as zonas", () => {
    desenhar();
    const contacto = screen.getByText("Contacto").parentElement!;
    expect(contacto.className).not.toMatch(/bo-card/);
    expect(contacto.className).toMatch(/border-t/);
    expect(contacto.className).toMatch(/sm:p-\[var\(--bo-p-cartao\)\]/);
  });

  it("os factos do evento perguntam pela CAIXA e não pela janela", () => {
    desenhar();
    const grelha = screen.getByText("Tipo").parentElement!.parentElement!;
    // Uma coluna de base: o painel é o ecrã quase todo no telemóvel (343 px)
    // mas só 280 de conteúdo no computador, onde é uma coluna de 20 rem.
    expect(grelha.className).toMatch(/grid-cols-1/);
    expect(grelha.className).toMatch(/@min-\[15rem\]:grid-cols-2/);
    expect(grelha.className).not.toMatch(/\bsm:grid-cols/);
    // E a pergunta precisa de um contentor que a saiba responder.
    expect(grelha.parentElement!.className).toMatch(/@container/);
  });
});
