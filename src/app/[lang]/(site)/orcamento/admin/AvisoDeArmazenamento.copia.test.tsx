// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AvisoDeArmazenamento, esquecerEstadoDoArmazenamento } from "./AvisoDeArmazenamento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CÓPIA DE SEGURANÇA PAROU — dito onde ela olha
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A cópia diária depende de `CRON_SECRET`. Sem essa variável, a tarefa responde
 * 401 todos os dias, não manda email nenhum, e ninguém repara — até ao dia em
 * que se precisa dela. Está escrito no RESILIENCE.md há meses, e um ficheiro do
 * repositório não é um sítio onde ela olhe.
 *
 * Por isso a frase aparece aqui, no painel que já existe, e com a mesma regra
 * de sempre: só quando há alguma coisa a fazer.
 *
 * O teste que interessa mais é o terceiro — com o armazenamento bom e a cópia
 * parada, o painel NÃO pode começar por dizer «o armazenamento está ligado».
 * Uma frase tranquilizadora por cima do único problema que há é a maneira mais
 * eficaz de o esconder.
 */
function servir(corpo: unknown, status = 200) {
  vi.stubGlobal(
    "fetch",
    vi.fn(
      async () =>
        new Response(JSON.stringify(corpo), {
          status,
          headers: { "content-type": "application/json" },
        }),
    ),
  );
}

const BASE = {
  estado: "ok",
  duradouro: true,
  avisar: false,
  titulo: "O armazenamento está ligado.",
  oQueFazer: "Não é preciso fazer nada: o que gravar fica na base de dados.",
  fotos: "ok",
  verificadoEm: "2026-08-11T10:00:00.000Z",
};

const COPIA_PARADA = {
  ...BASE,
  avisar: true,
  copia: {
    estado: "atrasada",
    avisar: true,
    diasSem: 9,
    titulo: "Não chega uma cópia de segurança há 9 dias.",
    oQueFazer: "Confirma a variável CRON_SECRET nas variáveis de ambiente do alojamento.",
  },
};

beforeEach(() => {
  esquecerEstadoDoArmazenamento();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o aviso da cópia de segurança", () => {
  it("com a cópia em dia não desenha nada", async () => {
    servir({ ...BASE, copia: { estado: "ok", avisar: false, diasSem: 1 } });
    const { container } = render(<AvisoDeArmazenamento />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("com a cópia parada diz há quanto tempo E qual a variável a confirmar", async () => {
    servir(COPIA_PARADA);
    render(<AvisoDeArmazenamento />);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/9 dias/);
    expect(aviso).toHaveTextContent(/CRON_SECRET/);
  });

  it("não põe «o armazenamento está ligado» por cima do problema que há", async () => {
    servir(COPIA_PARADA);
    render(<AvisoDeArmazenamento />);
    const aviso = await screen.findByRole("alert");
    expect(aviso).not.toHaveTextContent(/armazenamento está ligado/i);
    expect(aviso).not.toHaveTextContent(/não é preciso fazer nada/i);
  });

  it("com as duas coisas mal, diz as duas", async () => {
    servir({
      ...COPIA_PARADA,
      estado: "tabela-em-falta",
      duradouro: false,
      titulo: "A base de dados não tem a tabela onde o trabalho é guardado (app_state).",
      oQueFazer: "Corra o ficheiro db/schema.sql no editor de SQL do Supabase.",
    });
    render(<AvisoDeArmazenamento />);
    const aviso = await screen.findByRole("alert");
    expect(aviso).toHaveTextContent(/db\/schema\.sql/);
    expect(aviso).toHaveTextContent(/CRON_SECRET/);
  });
});
