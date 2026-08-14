// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { ToastProvider } from "./Toast";
import { __resetListCache } from "./useCachedList";
import Contratos from "./Contratos";
import Tarefas from "./Tarefas";
import Fornecedores from "./Fornecedores";
import Inventario from "./Inventario";
import Acompanhamento from "./Acompanhamento";
import Calendario from "./Calendario";
import AnalisePropostas from "./AnalisePropostas";
import type { Quote } from "@/lib/orcamento/types";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA LEITURA QUE REBENTOU NÃO PODE APARECER COMO "NÃO HÁ NADA AQUI"
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `useCachedList` devolve `data` indefinido nos dois casos: quando a lista
 * está mesmo vazia e quando o pedido falhou. Estes ecrãs escreviam
 * `{ data: x = [], loading }` e deitavam fora o `error` — por isso, com o
 * servidor em baixo, o `loading` caía, o array ficava vazio, e o ecrã desenhava
 * o seu estado vazio com toda a confiança e sem nenhum "tentar de novo".
 *
 * A regra vale para qualquer destes ecrãs: uma leitura falhada NUNCA pode
 * desenhar um total em euros nem um "não há nada aqui". (O ecrã de Faturas,
 * que era o exemplo mais caro desta lista, saiu com a facturação.)
 *
 * Estes testes fazem a pergunta pelo lado de quem usa: com o servidor a
 * responder 500, o que é que o ecrã diz? Antes da correcção diziam todos
 * "está vazio". O padrão certo já existia nos três ecrãs do Material —
 * `AvisoDeFalha`, com a frase do servidor e um botão de repetir.
 */

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

const EXPLICACAO = "A base de dados não respondeu (faltam as tabelas?).";

/** Tudo o que estes ecrãs leem, em baixo. */
function tudoEmBaixo() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply(500, { error: EXPLICACAO })),
  );
}

const QUOTES: Quote[] = [];

beforeEach(() => {
  __resetListCache();
  tudoEmBaixo();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function montar(no: React.ReactNode) {
  return render(<ToastProvider>{no}</ToastProvider>);
}

/**
 * O painel de falha, seja qual for o título que o ecrã lhe deu.
 *
 * Não serve procurar `role="alert"`: o `ToastProvider` mantém sempre uma região
 * viva com esse papel, mesmo vazia, e um teste que a encontrasse passaria com o
 * ecrã calado. Procuramos a FRASE.
 */
async function esperarPeloAviso() {
  await waitFor(() => expect(screen.getByText(/Não foi possível ler/)).toBeTruthy());
}

describe("Contratos — quando a leitura falha", () => {
  it("não diz “Sem contratos ainda”", async () => {
    montar(<Contratos />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler os contratos/)).toBeTruthy();
    expect(screen.queryByText("Sem contratos ainda")).toBeNull();
  });
});

describe("Tarefas — quando a leitura falha", () => {
  it("não diz “Tudo em dia”, que é o contrário do que se sabe", async () => {
    montar(<Tarefas />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler as tarefas/)).toBeTruthy();
    expect(screen.queryByText("Tudo em dia")).toBeNull();
  });
});

describe("Fornecedores — quando a leitura falha", () => {
  it("não diz “Sem fornecedores ainda”", async () => {
    montar(<Fornecedores />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler os fornecedores/)).toBeTruthy();
    expect(screen.queryByText("Sem fornecedores ainda")).toBeNull();
  });
});

describe("Inventário — quando a leitura falha", () => {
  it("não diz “Sem itens no inventário”", async () => {
    montar(<Inventario />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler o inventário/)).toBeTruthy();
    expect(screen.queryByText("Sem itens no inventário")).toBeNull();
  });
});

describe("Acompanhamento — quando a leitura falha", () => {
  it("não diz que não há nenhuma proposta à espera de resposta", async () => {
    montar(<Acompanhamento quotes={QUOTES} />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler as propostas/)).toBeTruthy();
    expect(screen.queryByText("Nenhuma proposta à espera de resposta")).toBeNull();
  });
});

describe("Calendário — quando a leitura falha", () => {
  it("avisa que faltam as marcações em vez de desenhar um mês limpo", async () => {
    // Um mês sem bloqueios desenhado é um convite a marcar por cima de um
    // bloqueio que existe e não se conseguiu ler.
    montar(<Calendario quotes={QUOTES} onOpen={() => {}} />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler as marcações/)).toBeTruthy();
  });
});

describe("Análise das propostas — quando a leitura falha", () => {
  it("não desaparece em silêncio dentro da secção “Propostas”", async () => {
    montar(<AnalisePropostas />);
    await esperarPeloAviso();

    expect(screen.getByText(/Não foi possível ler as propostas/)).toBeTruthy();
  });
});
