// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «MODELOS (0)» É UMA AFIRMAÇÃO — E UMA LEITURA FALHADA NÃO A SABE FAZER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O arranque do editor clássico apanhava a falha num `toast` e seguia em
 * frente com a lista a zero. O que ficava no ecrã era isto:
 *
 *     Modelos (0)
 *     Seleciona um modelo para editar.
 *
 * Duas frases ditas com a maior das confianças por quem não conseguiu sequer
 * perguntar. O toast que dizia a verdade some-se em cinco segundos; o ecrã que
 * mente fica lá o dia todo.
 *
 * E aqui a mentira é cara. Quem lê «Modelos (0)» conclui que os modelos se
 * perderam, e o gesto seguinte é óbvio: reescrever à mão o texto que está
 * inteiro do outro lado. Só que nesta rota gravar é PUBLICAR — o que ficar
 * escrito é o que o próximo cliente recebe.
 *
 * Três estados, três ecrãs: a ler, não há nenhum, não consegui ler. E o
 * terceiro diz a razão e dá por onde repetir, como o resto da casa
 * (`AvisoDeFalha`).
 *
 * A segunda metade do ficheiro é a gravação: «Não foi possível guardar. Tenta
 * novamente.» era a mesma frase para a rede em baixo, para a sessão expirada e
 * para uma recusa do servidor — e em dois desses três «tenta novamente» é
 * conselho errado.
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

import EmailTemplates from "./EmailTemplates";

const MODELOS = [
  {
    key: "proposta-enviada",
    name: "Proposta enviada",
    subject: "A sua proposta",
    body: "<div>Olá {nome}</div>",
    updatedAt: "2026-01-01T00:00:00.000Z",
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

/** O GET e o PUT da mesma rota falham em separado, que é o caso a testar. */
function servidor(rotas: { ler?: Rota; guardar?: Rota } = {}) {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    // O separador que abre por omissão é o bilingue; estes testes são do
    // clássico, mas as rotas dele têm de existir na mesma.
    if (url.startsWith("/api/email-templates/")) return resposta(200, []);
    if (url.startsWith("/api/email-templates")) {
      if ((init?.method ?? "GET") === "GET") return (rotas.ler ?? (() => resposta(200, MODELOS)))();
      return (rotas.guardar ?? (() => resposta(200, MODELOS[0])))();
    }
    return resposta(200, {});
  });
  vi.stubGlobal("fetch", f);
  return f;
}

/** Entra no «Editor clássico» — o separador que abre é o outro. */
function montar() {
  const r = render(<EmailTemplates />);
  fireEvent.click(screen.getByRole("tab", { name: /editor clássico/i }));
  return r;
}

beforeEach(() => {
  espia.avisos = [];
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("editor clássico — quando a leitura dos modelos falha", () => {
  it("não afirma que não há modelos, e repete a frase do servidor", async () => {
    servidor({ ler: () => resposta(500, { error: EXPLICACAO }) });
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler os modelos/)).toBeTruthy());
    expect(screen.getByText(EXPLICACAO)).toBeTruthy();
    expect(
      screen.queryByText(/Modelos \(0\)/),
      "o ecrã contou os modelos sem ter conseguido perguntar quantos são",
    ).toBeNull();
    expect(
      screen.queryByText(/Seleciona um modelo para editar/),
      "mandou escolher de uma lista que nunca chegou",
    ).toBeNull();
  });

  it("uma falha sem explicação continua a ser tratada como falha, e não como vazio", async () => {
    servidor({
      ler: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler os modelos/)).toBeTruthy());
    expect(screen.queryByText(/Modelos \(0\)/)).toBeNull();
  });

  it("oferece voltar a tentar — e à segunda a lista aparece", async () => {
    const user = userEvent.setup();
    let falhar = true;
    servidor({ ler: () => (falhar ? resposta(503, null) : resposta(200, MODELOS)) });
    montar();

    await waitFor(() => expect(screen.getByText(/Não foi possível ler os modelos/)).toBeTruthy());
    falhar = false;
    await user.click(screen.getByRole("button", { name: /tentar de novo/i }));

    await waitFor(() => expect(screen.getByText("Modelos (1)")).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler os modelos/)).toBeNull();
  });

  it("uma leitura BOA que não trouxe nada continua a dizer que não há nada", async () => {
    servidor({ ler: () => resposta(200, []) });
    montar();

    await waitFor(() => expect(screen.getByText(/Ainda não há modelos de email/)).toBeTruthy());
    expect(screen.queryByText(/Não foi possível ler os modelos/)).toBeNull();
    // Nem manda escolher de uma lista que está mesmo vazia.
    expect(screen.queryByText(/Seleciona um modelo para editar/)).toBeNull();
  });
});

describe("editor clássico — quando a gravação falha", () => {
  async function editarEGuardar() {
    const user = userEvent.setup();
    montar();
    const assunto = await screen.findByLabelText(/assunto/i);
    await waitFor(() => expect((assunto as HTMLInputElement).value).toBe("A sua proposta"));
    await user.type(assunto, " de casamento");
    await user.click(screen.getByRole("button", { name: /^guardar$/i }));
    await waitFor(() => expect(espia.avisos.length).toBeGreaterThan(0));
    return espia.avisos.at(-1)!;
  }

  it("a frase nomeia o modelo em vez de dizer «não foi possível guardar»", async () => {
    servidor({ guardar: () => resposta(500, { error: "Erro interno" }) });
    const aviso = await editarEGuardar();

    expect(aviso.tipo).toBe("error");
    expect(aviso.texto).toContain("guardar o modelo «Proposta enviada»");
    expect(aviso.texto).not.toMatch(/^Não foi possível guardar/);
  });

  it("a sessão expirada manda entrar de novo, e não «tenta novamente»", async () => {
    servidor({ guardar: () => resposta(401, { error: "Não autenticado" }) });
    const aviso = await editarEGuardar();

    expect(aviso.texto).toMatch(/sessão expirou/i);
    expect(aviso.texto).toContain("guardar o modelo «Proposta enviada»");
    expect(aviso.texto).toMatch(/volta a entrar/i);
  });

  it("uma recusa do conteúdo mostra o que o servidor disse, que é quem sabe", async () => {
    servidor({ guardar: () => resposta(422, { error: "O assunto tem marcadores por fechar." }) });
    const aviso = await editarEGuardar();

    expect(aviso.texto).toBe("O assunto tem marcadores por fechar.");
  });

  it("sem rede, diz que nada se perdeu — porque o rascunho local o segura", async () => {
    servidor({
      guardar: () => {
        throw new TypeError("Failed to fetch");
      },
    });
    const aviso = await editarEGuardar();

    expect(aviso.texto).toMatch(/sem ligação/i);
    expect(aviso.texto).toContain("guardar o modelo «Proposta enviada»");
    expect(aviso.texto).toMatch(/nada se perdeu/i);
  });
});
