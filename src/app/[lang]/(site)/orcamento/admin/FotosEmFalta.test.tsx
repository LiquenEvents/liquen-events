// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FotosEmFalta from "./FotosEmFalta";
import type { ProposalDoc } from "@/lib/proposal-doc";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O AVISO QUE TINHA DE EXISTIR ANTES DE O LINK SEGUIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Quatro fotografias que não existiam no armazenamento seguiram numa proposta,
 * e a primeira pessoa a dar por isso foi o casal.
 *
 * A afirmação mais importante deste ficheiro é a última: **«não consegui
 * verificar» tem de se ler diferente de «está tudo bem»**. É a única resposta
 * que se pode confundir com a boa, e confundi-las é repetir o defeito com um
 * painel novo por cima.
 */

const DOC = { moodBoards: [] } as unknown as ProposalDoc;

let responde: () => Response;
const fetchMock = vi.fn(async () => responde());

const ok = (corpo: unknown) =>
  ({ ok: true, json: async () => corpo }) as unknown as Response;

beforeEach(() => {
  responde = () => ok({ total: 3, emFalta: [], naoVerificaveis: 0, verificou: true });
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("quando está tudo no sítio", () => {
  it("di-lo com o número, e não fica calado", async () => {
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/3 fotografias estão todas no sítio/i)).toBeTruthy();
  });

  it("as fotos de fora contam-se à parte", async () => {
    responde = () => ok({ total: 3, emFalta: [], naoVerificaveis: 1, verificou: true });
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/endereço de fora/i)).toBeTruthy();
  });
});

describe("quando falta alguma", () => {
  const comFalta = () =>
    ok({
      total: 5,
      naoVerificaveis: 0,
      verificou: true,
      emFalta: [
        {
          id: "b0f0",
          onde: "Mood board «Decoração Seating Plan» · foto 1",
          motivo: "nao-esta-no-bucket",
        },
        { id: "b1f2", onde: "Mood board «Lapelas» · foto 3", motivo: "nao-esta-no-bucket" },
      ],
    });

  it("diz quantas e NOMEIA cada uma pelo sítio", async () => {
    // «Mood board «Lapelas» · foto 3» é o que a leva lá em trinta segundos.
    responde = comFalta;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/2 fotografias não vão aparecer ao casal/i)).toBeTruthy();
    expect(screen.getByText("Mood board «Decoração Seating Plan» · foto 1")).toBeTruthy();
    expect(screen.getByText("Mood board «Lapelas» · foto 3")).toBeTruthy();
  });

  it("explica a causa em português, não com o nome do motivo", async () => {
    responde = comFalta;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/não está no armazenamento deste pedido/i)).toBeTruthy();
    expect(screen.queryByText(/nao-esta-no-bucket/)).toBeNull();
  });

  it("é um aviso, não uma tranca — não há aqui botão nenhum a impedir o envio", async () => {
    // Uma proposta que tem de sair hoje sai hoje. O que não pode é sair sem
    // ela saber.
    responde = comFalta;
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    await screen.findByText(/2 fotografias não vão aparecer/i);
    expect(screen.queryByRole("button", { name: /impedir|bloquear|cancelar/i })).toBeNull();
  });

  it("deixa voltar a confirmar depois de corrigir", async () => {
    responde = comFalta;
    const user = userEvent.setup();
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    await screen.findByText(/2 fotografias não vão aparecer/i);
    responde = () => ok({ total: 5, emFalta: [], naoVerificaveis: 0, verificou: true });
    await user.click(screen.getByRole("button", { name: /Já corrigi/i }));
    expect(await screen.findByText(/estão todas no sítio/i)).toBeTruthy();
  });
});

/**
 * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────────
 */
describe("«não consegui verificar» nunca se lê como «está tudo bem»", () => {
  it("com a verificação por correr, di-lo com todas as letras", async () => {
    responde = () => ok({ total: 3, emFalta: [], naoVerificaveis: 0, verificou: false });
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/Não foi possível confirmar/i)).toBeTruthy();
    expect(screen.getByText(/não quer dizer que estejam bem/i)).toBeTruthy();
    // E NÃO diz o contrário.
    expect(screen.queryByText(/estão todas no sítio/i)).toBeNull();
  });

  it("um erro de rede lê-se igual — e oferece tentar outra vez", async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new Error("rede em baixo");
    });
    const user = userEvent.setup();
    render(<FotosEmFalta quoteId="LIQ-9" doc={DOC} />);
    expect(await screen.findByText(/Não foi possível confirmar/i)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Tentar outra vez/i }));
    expect(await screen.findByText(/estão todas no sítio/i)).toBeTruthy();
  });

  it("manda o documento que está NO ECRÃ, não vai buscar o gravado", async () => {
    // O estúdio grava com 800 ms de atraso, e a foto que ela acabou de trocar é
    // precisamente a que se quer verificar.
    render(<FotosEmFalta quoteId="LIQ-9" doc={{ ...DOC, ref: "PO Decoração" } as ProposalDoc} />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/orcamento/LIQ-9/fotos-em-falta");
    expect(JSON.parse(String(init.body)).doc.ref).toBe("PO Decoração");
  });
});
