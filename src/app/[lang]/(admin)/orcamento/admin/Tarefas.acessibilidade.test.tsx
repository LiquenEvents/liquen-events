// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Tarefas from "./Tarefas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LISTA DE TAREFAS, LIDA POR QUEM NÃO A VÊ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Fase 11 do `docs/APPLE-TAREFAS.md`: a Parte 6 («Acessibilidade») nunca tinha
 * sido percorrida ponto por ponto. Percorreu-se, num browser, e o que o código
 * decide — e portanto cabe aqui — são cinco coisas:
 *
 *   1. a lista é `<ul role="list">` e cada tarefa é um `<li>` (eram `<div>`s
 *      soltas: quem ouve o ecrã não ouvia «lista, 5 itens»);
 *   2. os cabeçalhos de grupo ligam à secção por `aria-labelledby`;
 *   3. «Atrasada» diz-se com sinal E palavra, e o sinal fica mudo;
 *   4. o responsável lê-se pelo NOME INTEIRO, com a inicial muda — medido
 *      antes: sem rótulo nenhum, a inicial lia-se solta («C») antes do nome;
 *   5. a prioridade lê-se «Prioridade: Alta», e não só «Alta».
 *
 * O que NÃO se prova aqui, e está no passeio `e2e/tarefas-acessibilidade.spec.ts`
 * porque só um browser o diz: os 40 px dos alvos, o anúncio em `role="status"`
 * ao marcar, o zoom a 200% e o percurso só com teclado. Um teste que lê o
 * código confirma que a frase está escrita, não que ela faz efeito.
 */

const hoje = new Date();
const dia = (d: number) => {
  const x = new Date(hoje);
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

const TAREFAS = [
  {
    id: "t1",
    title: "Confirmar florista",
    done: false,
    priority: "alta" as const,
    dueDate: dia(-3),
    assignee: "Catarina Almeida",
    createdAt: "2026-08-10T10:00:00.000Z",
  },
  {
    id: "t2",
    title: "Enviar proposta aos noivos",
    done: false,
    priority: "normal" as const,
    dueDate: dia(2),
    createdAt: "2026-08-10T10:00:00.000Z",
  },
  {
    id: "t3",
    title: "Reservar carrinha",
    done: true,
    priority: "baixa" as const,
    createdAt: "2026-08-10T10:00:00.000Z",
  },
];

const resposta = (body: unknown = {}) =>
  ({ ok: true, status: 200, headers: new Headers(), json: async () => body }) as Response;

beforeEach(() => {
  __resetListCache();
  vi.stubGlobal(
    "fetch",
    vi.fn((_url: string, init?: RequestInit) =>
      Promise.resolve(!init?.method || init.method === "GET" ? resposta(TAREFAS) : resposta()),
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function desenhar() {
  render(
    <ToastProvider>
      <Tarefas />
    </ToastProvider>,
  );
  await waitFor(() => expect(screen.getByText("Confirmar florista")).toBeInTheDocument());
}

const linhaDe = (titulo: string) =>
  screen.getByText(titulo).closest("[data-tarefa]") as HTMLElement;

describe("a lista de tarefas é uma lista", () => {
  it('cada tarefa é um `<li>`, dentro de uma `<ul role="list">`', async () => {
    await desenhar();
    for (const titulo of ["Confirmar florista", "Enviar proposta aos noivos"]) {
      const linha = linhaDe(titulo);
      expect(
        linha.tagName,
        `«${titulo}» deixou de ser um <li> — quem ouve o ecrã deixa de ouvir «lista, N itens»`,
      ).toBe("LI");
      const lista = linha.parentElement as HTMLElement;
      expect(lista.tagName).toBe("UL");
      expect(lista.getAttribute("role")).toBe("list");
    }
  });

  /**
   * O CONTROLO NEGATIVO, E É O DEFEITO EXACTO.
   *
   * Uma `<div>` solta não é um `listitem`. Se este número descer para zero,
   * as linhas voltaram a ser caixas, e o caso de cima passava por engano numa
   * lista que ninguém reconhece como lista.
   */
  it("e o leitor de ecrã conta mesmo as linhas como itens", async () => {
    await desenhar();
    const abertas = ["Confirmar florista", "Enviar proposta aos noivos"].map(linhaDe);
    const itens = screen.getAllByRole("listitem");
    for (const linha of abertas) {
      expect(itens, "uma linha não conta como `listitem`").toContain(linha);
    }
  });

  it("as concluídas, quando se abrem, também são uma lista", async () => {
    await desenhar();
    await userEvent.setup().click(screen.getByRole("button", { name: /Concluídas \(1\)/ }));
    const linha = linhaDe("Reservar carrinha");
    expect(linha.tagName).toBe("LI");
    expect((linha.parentElement as HTMLElement).getAttribute("role")).toBe("list");
  });

  it("cada tarefa tem uma caixa de verificação a sério, com o título por nome", async () => {
    await desenhar();
    const caixa = screen.getByRole("checkbox", { name: "Confirmar florista" });
    expect(caixa.tagName).toBe("INPUT");
    expect(caixa.getAttribute("type")).toBe("checkbox");
  });
});

describe("os grupos têm cabeçalho ligado à secção", () => {
  it("«Atrasadas» é um `<h2>` e dá o nome à sua região", async () => {
    await desenhar();
    const cabecalho = screen.getByRole("heading", { level: 2, name: /^Atrasadas/ });
    const regiao = screen.getByRole("region", { name: /^Atrasadas/ });
    expect(regiao.contains(linhaDe("Confirmar florista"))).toBe(true);
    expect(cabecalho.id, "a região deixou de apontar para o cabeçalho").toBeTruthy();
    expect(regiao.getAttribute("aria-labelledby")).toBe(cabecalho.id);
  });
});

describe("o que cada linha diz, lido em voz alta", () => {
  it("«Atrasada» tem sinal E palavra, e o sinal fica mudo", async () => {
    await desenhar();
    const linha = linhaDe("Confirmar florista");
    expect(within(linha).getByText(/Atrasada/)).toBeInTheDocument();
    const sinal = within(linha).getByText("⚠");
    expect(sinal.getAttribute("aria-hidden"), "o sinal ia ser lido como «aviso»").toBe("true");
  });

  it("o responsável lê-se pelo nome inteiro, e a inicial fica muda", async () => {
    await desenhar();
    const linha = linhaDe("Confirmar florista");
    const nome = within(linha).getByText("Catarina Almeida", { exact: false });
    expect(
      nome.textContent,
      "o nome perdeu o contexto — «Catarina Almeida» sozinho não diz quem ela é aqui",
    ).toBe("Responsável: Catarina Almeida");
    const inicial = within(linha).getByText("C");
    expect(inicial.getAttribute("aria-hidden"), "a inicial lia-se solta antes do nome").toBe(
      "true",
    );
  });

  it("a prioridade lê-se «Prioridade: Alta», e não só «Alta»", async () => {
    await desenhar();
    const linha = linhaDe("Confirmar florista");
    const chip = within(linha).getByText("Alta", { exact: false });
    expect(chip.textContent).toBe("Prioridade: Alta");
  });
});
