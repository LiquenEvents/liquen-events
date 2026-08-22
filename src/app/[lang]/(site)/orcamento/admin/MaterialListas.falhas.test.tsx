// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MaterialListas from "./MaterialListas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A QUANTIDADE QUE FICAVA ERRADA EM SILÊNCIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A caixa da quantidade é não-controlada (`defaultValue`). Havia já uma guarda
 * para o texto inválido — apagar o número repunha-o —, mas nenhuma para o outro
 * lado: texto válido, gravação RECUSADA. A caixa ficava com 12, a base de dados
 * com 8, e o único sinal era um toast a dizer «Não foi possível guardar.» que
 * desaparece sozinho.
 *
 * E o número errado não fica aqui. A checklist de cada evento é COPIADA desta
 * lista — quem carrega a carrinha lê o número e não tem como o pôr em causa.
 *
 * O segundo defeito é a frase. Sete gravações neste ficheiro diziam «Não foi
 * possível guardar / criar / apagar / remover / duplicar / acrescentar», para
 * seis situações com respostas diferentes. Quem lê carrega outra vez — e com a
 * sessão expirada isso não pode funcionar nunca.
 */

const avisos = vi.hoisted(() => ({ ditos: [] as string[] }));
vi.mock("./Toast", () => ({
  useToast: () => ({ toast: (texto: string) => avisos.ditos.push(texto) }),
}));

const LISTAS = {
  listas: [
    { id: "L1", name: "Essenciais de carrinha", isDefault: true, position: 0 },
    // A que vai sempre não se apaga por engano — para medir o apagar é precisa
    // uma segunda.
    { id: "L2", name: "Cerimónia ao ar livre", isDefault: false, position: 1 },
  ],
  linhas: [{ id: "l1", listId: "L1", itemId: "i1", qty: 8, critical: false, position: 0 }],
};
const CATALOGO = [{ id: "i1", name: "Escadote", category: "Estrutura", kind: "reutilizavel" }];

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/** As leituras respondem sempre; a escrita responde o que o teste disser. */
function servidor(escrita: () => Response | Promise<Response>) {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const metodo = init?.method ?? "GET";
    if (metodo === "GET") {
      return reply(200, String(url).includes("listas") ? LISTAS : CATALOGO);
    }
    return escrita();
  });
}

/** Abre a lista e devolve a caixa da quantidade. */
async function abrirCaixa() {
  render(<MaterialListas />);
  await userEvent.click(await screen.findByText("Essenciais de carrinha"));
  return (await screen.findByLabelText(/quantidade de escadote/i)) as HTMLInputElement;
}

beforeEach(() => {
  avisos.ditos = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("MaterialListas — uma gravação recusada", () => {
  it("repõe a quantidade que o servidor não aceitou", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => reply(500, { error: "Erro interno" })),
    );

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.type(caixa, "12");
    await userEvent.tab();

    // O ecrã volta ao que a base de dados tem. Sem isto ficava a dizer 12.
    await waitFor(() => expect(caixa.value).toBe("8"));
  });

  it("e a frase diz o que aconteceu, porquê e o que fazer", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => reply(503, { error: "Erro interno" })),
    );

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.type(caixa, "12");
    await userEvent.tab();

    await waitFor(() => expect(avisos.ditos.length).toBeGreaterThan(0));
    const frase = avisos.ditos.join(" ");
    // Nomeia a coisa…
    expect(frase).toContain("Escadote");
    // …diz porquê…
    expect(frase).toContain("não está a aceitar gravações");
    // …e acaba numa instrução.
    expect(frase).toMatch(/repete/i);
    expect(frase).not.toBe("Não foi possível guardar.");
  });

  it("com a sessão expirada, manda entrar em vez de mandar repetir", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => reply(401, { error: "Não autorizado" })),
    );

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.type(caixa, "12");
    await userEvent.tab();

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/sessão expirou/i));
    expect(avisos.ditos.join(" ")).toMatch(/volta a entrar/i);
    await waitFor(() => expect(caixa.value).toBe("8"));
  });

  it("sem rede, diz que nada se perdeu", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") !== "GET") throw new TypeError("Failed to fetch");
        return reply(200, String(url).includes("listas") ? LISTAS : CATALOGO);
      }),
    );

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.type(caixa, "12");
    await userEvent.tab();

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/sem ligação/i));
    expect(avisos.ditos.join(" ")).toMatch(/nada se perdeu/i);
    await waitFor(() => expect(caixa.value).toBe("8"));
  });

  it("uma recusa explicada repete as palavras do servidor", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => reply(400, { error: "A quantidade tem de ser maior do que zero" })),
    );

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.type(caixa, "12");
    await userEvent.tab();

    await waitFor(() =>
      expect(avisos.ditos.join(" ")).toContain("A quantidade tem de ser maior do que zero"),
    );
  });

  /** A guarda que já existia continua de pé. */
  it("uma caixa apagada não grava zero", async () => {
    const escrita = vi.fn(() => reply(200, { ok: true }));
    vi.stubGlobal("fetch", servidor(escrita));

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.tab();

    expect(escrita).not.toHaveBeenCalled();
    expect(caixa.value).toBe("8");
  });

  it("uma gravação que passa não repõe nada", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => reply(200, { ok: true })),
    );

    const caixa = await abrirCaixa();
    await userEvent.clear(caixa);
    await userEvent.type(caixa, "12");
    await userEvent.tab();

    // Fica o que ela escreveu — e nenhum aviso de falha.
    await waitFor(() => expect(caixa.value).toBe("12"));
    expect(avisos.ditos.filter((t) => /não deu|sem ligação/i.test(t))).toEqual([]);
  });

  it("apagar uma lista recusada nomeia a lista", async () => {
    vi.stubGlobal(
      "fetch",
      servidor(() => reply(404, {})),
    );

    render(<MaterialListas />);
    await screen.findByText("Cerimónia ao ar livre");
    await userEvent.click(screen.getByRole("button", { name: /apagar/i }));

    await waitFor(() => expect(avisos.ditos.join(" ")).toMatch(/já não existe/i));
    expect(avisos.ditos.join(" ")).toContain("Cerimónia ao ar livre");
  });
});
