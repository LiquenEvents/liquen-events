// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Miniaturas from "./Miniaturas";

const avisos = vi.hoisted(() => ({ ditos: [] as string[] }));
vi.mock("./Toast", () => ({
  useToast: () => ({ toast: (texto: string) => avisos.ditos.push(texto) }),
}));

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CICLO REBENTA A MEIO E LEVA CONSIGO A LISTA DAS QUE FALHARAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel promete, por escrito, que «saber QUAIS falharam permite voltar a
 * correr só para essas» — e é a única razão de a lista existir: sem ela, uma
 * foto que não gera continua a servir o original de 2,6 MB e ninguém sabe qual
 * é.
 *
 * Só que as falhas iam sendo acumuladas numa variável local e só chegavam ao
 * ecrã DEPOIS do ciclo inteiro. Basta o segundo lote apanhar a rede em baixo (ou
 * um 500) para o `catch` levar tudo: o que já se sabia — nomes e tudo — some-se,
 * e fica um «não consegui gerar» genérico. As nove primeiras falhas eram
 * informação já paga e perdia-se.
 *
 * A regra que este teste prende: o que já se APUROU sobrevive à interrupção. A
 * avaria é dita, e as falhas ficam à vista na mesma.
 */

function respostaDe(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const FALHAS = ["theme-thumbs/t-1/a.jpg", "theme-thumbs/t-1/b.jpg", "theme-thumbs/t-1/c.jpg"];

/** Uma contagem completa, com os campos que a rota manda mesmo. */
function contagemDe(p: Record<string, unknown> = {}) {
  return {
    ok: true,
    linhas: [],
    fotos: 100,
    emFalta: 55,
    emFaltaEssenciais: 55,
    emFaltaLeves: 0,
    fotosSemMiniatura: 55,
    fotosSemVersaoLeve: 0,
    avisos: [],
    ...p,
  };
}

/** Conta, e depois gera — o gesto que ela faz. */
async function contarEGerar() {
  render(<Miniaturas />);
  await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
  await waitFor(() => screen.getByRole("button", { name: /gerar as miniaturas/i }));
  await userEvent.click(screen.getByRole("button", { name: /gerar as miniaturas/i }));
}

describe("Miniaturas — a rede cai a meio dos lotes", () => {
  beforeEach(() => {
    avisos.ditos = [];
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("as falhas já apuradas continuam à vista depois de o ciclo rebentar", async () => {
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          posts += 1;
          // Primeiro lote: gera umas quantas e diz QUAIS não deram.
          if (posts === 1)
            return respostaDe({
              ok: true,
              geradas: 22,
              falhas: FALHAS,
              fotografiasFeitas: 22,
              retoma: {
                papel: "essencial",
                origem: "theme-assets",
                pasta: "tema-a",
                caminho: "tema-a/f.jpg",
              },
              papel: "essencial",
            });
          // Segundo: a rede foi-se. É aqui que a lista desaparecia.
          throw new TypeError("Failed to fetch");
        }
        return respostaDe(contagemDe());
      }),
    );

    await contarEGerar();

    await waitFor(() => expect(screen.getByText(/não deram/i)).toBeInTheDocument());
    for (const f of FALHAS) expect(screen.getByText(f)).toBeInTheDocument();
    // E a avaria é dita — o que se perdeu foi a ligação, não o trabalho.
    expect(avisos.ditos.join(" ")).toMatch(/Failed to fetch/);
  });

  it("um lote recusado pelo servidor não apaga o que já se sabia", async () => {
    let posts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          posts += 1;
          if (posts === 1)
            return respostaDe({
              ok: true,
              geradas: 22,
              falhas: FALHAS,
              fotografiasFeitas: 22,
              retoma: {
                papel: "essencial",
                origem: "theme-assets",
                pasta: "tema-a",
                caminho: "tema-a/f.jpg",
              },
              papel: "essencial",
            });
          return respostaDe({ error: "Storage indisponível" }, 503);
        }
        return respostaDe(contagemDe());
      }),
    );

    await contarEGerar();

    await waitFor(() => expect(screen.getByText(/não deram/i)).toBeInTheDocument());
    expect(screen.getByText(FALHAS[0])).toBeInTheDocument();
    expect(avisos.ditos.join(" ")).toMatch(/Storage indisponível/);
  });
});
