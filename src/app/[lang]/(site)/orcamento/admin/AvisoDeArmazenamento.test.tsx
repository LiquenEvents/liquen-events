// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AvisoDeArmazenamento, esquecerEstadoDoArmazenamento } from "./AvisoDeArmazenamento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVISO QUE TEM DE SER LIDO NO DIA EM QUE APARECER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um aviso que aparece quando está tudo bem é um aviso que se deixa de ler — e
 * então, no dia em que a tabela `app_state` não existir mesmo e uma proposta
 * inteira estiver a caminho do nada, ele passa despercebido como todos os
 * outros. Por isso o primeiro teste aqui não é «mostra o aviso»: é **não
 * mostra nada quando não há nada a dizer**.
 *
 * O segundo é o custo: isto fica no topo do back office e é montado e
 * desmontado a cada troca de separador. Uma pergunta por montagem seriam
 * dezenas de escritas por dia na base de dados só para não dizer nada.
 */
function respostaDe(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const TUDO_BEM = {
  estado: "ok",
  duradouro: true,
  avisar: false,
  titulo: "O armazenamento está ligado.",
  oQueFazer: "Não é preciso fazer nada.",
  fotos: "ok",
  verificadoEm: "2026-08-11T10:00:00.000Z",
};

const TABELA_EM_FALTA = {
  estado: "tabela-em-falta",
  duradouro: false,
  avisar: true,
  titulo: "A base de dados não tem a tabela onde o trabalho é guardado (app_state).",
  oQueFazer: "Corra o ficheiro db/schema.sql no editor de SQL do Supabase.",
  fotos: "ok",
  verificadoEm: "2026-08-11T10:00:00.000Z",
};

let pedidos: string[] = [];

function servir(corpo: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      pedidos.push(String(url));
      return respostaDe(corpo, status);
    }),
  );
}

beforeEach(() => {
  pedidos = [];
  esquecerEstadoDoArmazenamento();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvisoDeArmazenamento", () => {
  it("com tudo bem não desenha nada — nem uma marca verde", async () => {
    servir(TUDO_BEM);
    const { container } = render(<AvisoDeArmazenamento />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });

  it("com a tabela em falta diz o que se passa E o que fazer", async () => {
    servir(TABELA_EM_FALTA);
    render(<AvisoDeArmazenamento />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/app_state/);
    // A frase que resolve o problema sozinha, com o nome do ficheiro.
    expect(screen.getByRole("alert")).toHaveTextContent(/db\/schema\.sql/);
  });

  it("uma verificação que não se consegue fazer não inventa um problema", async () => {
    servir({ error: "Não autorizado" }, 401);
    const { container } = render(<AvisoDeArmazenamento />);
    await waitFor(() => expect(pedidos).toHaveLength(1));
    // Não se sabe é diferente de está mal. Um vermelho aqui seria um alarme
    // falso a cada sessão que expira.
    expect(container).toBeEmptyDOMElement();
  });

  it("montar duas vezes não pergunta duas vezes", async () => {
    servir(TABELA_EM_FALTA);
    const primeiro = render(<AvisoDeArmazenamento />);
    await screen.findByRole("alert");
    primeiro.unmount();
    render(<AvisoDeArmazenamento />);
    await screen.findByRole("alert");
    expect(pedidos).toHaveLength(1);
  });

  it("quem acabou de correr o schema pode verificar de novo, e o aviso sai", async () => {
    servir(TABELA_EM_FALTA);
    render(<AvisoDeArmazenamento />);
    await screen.findByRole("alert");

    servir(TUDO_BEM);
    await userEvent.click(screen.getByRole("button", { name: /verificar de novo/i }));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    // E a segunda pergunta salta a cache do servidor, senão traria a resposta
    // de há trinta segundos e o aviso ficava lá.
    expect(pedidos[pedidos.length - 1]).toMatch(/forcar=1/);
  });
});
