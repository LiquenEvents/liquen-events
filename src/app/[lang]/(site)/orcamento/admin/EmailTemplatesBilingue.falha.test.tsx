// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRÊS ESTADOS QUE PARTILHAVAM UMA FRASE VERDADEIRA NUM SÓ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ecrã tinha o mesmo defeito em três sítios, e sempre com a mesma forma:
 * uma leitura que não aconteceu a passar por uma leitura que não trouxe nada.
 *
 *  1. OS MODELOS. Falhando o arranque, ficava «Modelos (0)» e «Seleciona um
 *     modelo para editar.» — e o passo seguinte que isso sugere é reescrever à
 *     mão um texto que está inteiro do outro lado. Aqui gravar é PUBLICAR, ou
 *     seja, é o que o próximo cliente recebe.
 *  2. OS PEDIDOS da pré-visualização. Um `if (rp.ok)` sem `else`: silêncio
 *     total. O seletor ficava só com «Dados de exemplo» e quem abriu isto para
 *     ver o modelo com um pedido a sério conclui que a coisa não existe.
 *  3. O HISTÓRICO. «Ainda não há versões anteriores desta língua» era mostrado
 *     ENQUANTO se lia e DEPOIS de a leitura rebentar. Nos dois casos é falso —
 *     as versões podem estar todas lá —, e a frase convida a publicar «para
 *     criar a primeira», que é o pior gesto a seguir a uma falha, porque
 *     publicar é enviar.
 *
 * E, por baixo dos três, as gravações: publicar, repor e enviar o teste
 * diziam a mesma frase seca a seis situações com respostas diferentes.
 */

const espia = vi.hoisted(() => ({ avisos: [] as { texto: string; tipo?: string }[] }));

vi.mock("./Toast", () => ({
  useToast: () => ({
    toast: (texto: string, tipo?: string) => {
      espia.avisos.push({ texto, tipo });
    },
  }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => children,
}));

import EmailTemplatesBilingue from "./EmailTemplatesBilingue";

const MODELOS = [
  {
    chave: "registo-formal",
    nome: "Registo formal",
    descricao: "O texto que já usas.",
    pt: { subject: "Proposta | Líquen", body: "<p>Olá {{cliente_nome}},</p>", updatedAt: "" },
    en: { subject: "", body: "", updatedAt: "" },
  },
];

const EXPLICACAO = "A base de dados não respondeu (falta correr o db/schema.sql).";

const resposta = (status: number, corpo: unknown) =>
  ({
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => corpo,
  }) as unknown as Response;

type Rota = () => Promise<Response> | Response;

function servidor(
  rotas: { modelos?: Rota; publicar?: Rota; dados?: Rota; versoes?: Rota; repor?: Rota } = {},
) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const metodo = init?.method ?? "GET";
    if (url.startsWith("/api/email-templates/bilingues")) {
      if (metodo === "GET") return (rotas.modelos ?? (() => resposta(200, MODELOS)))();
      return (rotas.publicar ?? (() => resposta(200, { updatedAt: "2026-01-01T00:00:00Z" })))();
    }
    if (url.startsWith("/api/email-templates/versoes")) {
      if (metodo === "GET") return (rotas.versoes ?? (() => resposta(200, [])))();
      return (rotas.repor ?? (() => resposta(200, { subject: "A", body: "B", updatedAt: "" })))();
    }
    if (url.startsWith("/api/email-templates/dados")) {
      return (rotas.dados ?? (() => resposta(200, { pedidos: [] })))();
    }
    return resposta(200, {});
  });
  vi.stubGlobal("fetch", f);
  return f;
}

const montar = () => render(<EmailTemplatesBilingue />);

beforeEach(() => {
  espia.avisos = [];
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("os modelos, quando a leitura falha", () => {
  it("não afirma que não há modelos, e repete a frase do servidor", async () => {
    servidor({ modelos: () => resposta(500, { error: EXPLICACAO }) });
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler os modelos/)).toBeTruthy());
    expect(screen.getByText(EXPLICACAO)).toBeTruthy();
    expect(
      screen.queryByText(/Modelos \(0\)/),
      "o ecrã contou os modelos sem ter conseguido perguntar quantos são",
    ).toBeNull();
    expect(screen.queryByText(/Seleciona um modelo para editar/)).toBeNull();
  });

  it("oferece voltar a tentar — e à segunda a lista aparece", async () => {
    const user = userEvent.setup();
    let falhar = true;
    servidor({ modelos: () => (falhar ? resposta(503, null) : resposta(200, MODELOS)) });
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler os modelos/)).toBeTruthy());
    falhar = false;
    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    await waitFor(() => expect(screen.getByText("Modelos (1)")).toBeTruthy());
  });

  it("uma leitura BOA que não trouxe nada continua a dizer que não há nada", async () => {
    servidor({ modelos: () => resposta(200, []) });
    montar();

    await waitFor(() => expect(screen.getByText(/Ainda não há modelos de email/)).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler os modelos/)).toBeNull();
  });
});

describe("os pedidos da pré-visualização deixaram de falhar em silêncio", () => {
  it("diz que não os conseguiu ler, e que ficou só com os dados de exemplo", async () => {
    servidor({ dados: () => resposta(500, { error: EXPLICACAO }) });
    montar();

    const aviso = await screen.findByRole("alert");
    expect(aviso.textContent).toMatch(/Não foi possível ler os pedidos/);
    expect(aviso.textContent).toContain(EXPLICACAO);
    expect(aviso.textContent).toMatch(/dados de exemplo/);
    // O editor continua a funcionar: o que falhou foi a lista, não o ecrã.
    expect(screen.getByLabelText(/assunto/i)).toBeTruthy();
  });

  it("com os pedidos a chegar bem, não há aviso nenhum", async () => {
    servidor({
      dados: () =>
        resposta(200, {
          pedidos: [{ id: "LQ-1", etiqueta: "Marta e João", idioma: "pt", semData: false }],
        }),
    });
    montar();

    await screen.findByLabelText(/assunto/i);
    await waitFor(() => expect(screen.getByRole("option", { name: /Marta e João/ })).toBeTruthy());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("o histórico — três estados, e não uma frase para todos", () => {
  async function abrirHistorico() {
    const user = userEvent.setup();
    montar();
    await screen.findByLabelText(/assunto/i);
    await user.click(screen.getByRole("button", { name: /^histórico$/i }));
  }

  it("enquanto lê, não afirma que não há versões anteriores", async () => {
    let libertar: () => void = () => {};
    servidor({
      versoes: () =>
        new Promise<Response>((resolver) => {
          libertar = () => resolver(resposta(200, []));
        }),
    });
    await abrirHistorico();

    await waitFor(() => expect(screen.getByText(/A ler as versões anteriores/)).toBeTruthy());
    expect(
      screen.queryByText(/Ainda não há versões anteriores/),
      "disse que não há histórico enquanto ainda o estava a ler",
    ).toBeNull();
    // Nem conta o que ainda não tem na mão.
    expect(screen.queryByText(/Histórico \(0\)/)).toBeNull();

    libertar();
    await waitFor(() => expect(screen.getByText(/Ainda não há versões anteriores/)).toBeTruthy());
  });

  it("depois de a leitura rebentar, diz que não conseguiu ler e dá por onde repetir", async () => {
    servidor({ versoes: () => resposta(500, { error: EXPLICACAO }) });
    await abrirHistorico();

    await waitFor(() =>
      expect(screen.getByText(/Não foi possível ler as versões anteriores/)).toBeTruthy(),
    );
    expect(screen.getByText(EXPLICACAO)).toBeTruthy();
    expect(
      screen.queryByText(/Ainda não há versões anteriores/),
      "deu o histórico por vazio depois de uma leitura que não aconteceu",
    ).toBeNull();
    expect(screen.queryByText(/Histórico \(0\)/)).toBeNull();
    expect(screen.getByRole("button", { name: /tentar de novo/i })).toBeTruthy();
  });

  it("e um histórico mesmo vazio continua a dizer que ainda não há versões", async () => {
    servidor({ versoes: () => resposta(200, []) });
    await abrirHistorico();

    await waitFor(() => expect(screen.getByText(/Ainda não há versões anteriores/)).toBeTruthy());
    expect(screen.getByText("Histórico (0)")).toBeTruthy();
    expect(screen.queryByText(/Não foi possível ler as versões/)).toBeNull();
  });
});

describe("as gravações nomeiam a coisa e acabam numa instrução", () => {
  async function editarEPublicar() {
    const user = userEvent.setup();
    montar();
    const assunto = await screen.findByLabelText(/assunto/i);
    await user.type(assunto, " (2026)");
    await user.click(screen.getByRole("button", { name: /^publicar$/i }));
    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    return espia.avisos.at(-1)!;
  }

  it("publicar falhado nomeia o modelo E a língua", async () => {
    servidor({ publicar: () => resposta(500, { error: "Erro interno" }) });
    const aviso = await editarEPublicar();

    expect(aviso.tipo).toBe("error");
    expect(aviso.texto).toContain("publicar o modelo «Registo formal» em português");
    expect(aviso.texto).not.toBe("Não foi possível guardar.");
  });

  it("a sessão expirada manda entrar de novo em vez de mandar repetir", async () => {
    servidor({ publicar: () => resposta(401, { error: "Não autenticado" }) });
    const aviso = await editarEPublicar();

    expect(aviso.texto).toMatch(/sessão expirou/i);
    expect(aviso.texto).toMatch(/volta a entrar/i);
  });

  it("repor falhado nomeia a versão que se estava a repor", async () => {
    const user = userEvent.setup();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    servidor({
      versoes: () =>
        resposta(200, [
          {
            chave: "registo-formal",
            idioma: "pt",
            versaoEm: "2026-02-03T10:30:00.000Z",
            nome: "Registo formal",
            subject: "Versão de fevereiro",
            body: "<p>Olá</p>",
          },
        ]),
      repor: () => resposta(500, { error: "Erro interno" }),
    });
    montar();
    await screen.findByLabelText(/assunto/i);
    await user.click(screen.getByRole("button", { name: /^histórico$/i }));
    await user.click(await screen.findByRole("button", { name: /repor/i }));

    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    expect(espia.avisos.at(-1)?.texto).toContain("repor a versão de");
    expect(espia.avisos.at(-1)?.texto).toContain("do modelo «Registo formal»");
  });
});
