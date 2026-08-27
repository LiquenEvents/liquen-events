// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FechosMeta from "./FechosMeta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BOTÃO QUE FALTAVA À ROTINA SEMANAL DA META
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O manual dos anúncios manda-a abrir `/api/meta/fechos` uma vez por semana e,
 * se houver casamentos a enviar, «fazer o envio». Ler funcionava; ENVIAR não
 * existia — é um POST, e o rodapé do relatório mandava fazer um `curl` com o
 * cookie da sessão. O envio nunca acontecia, e sete dias depois do fecho a
 * Meta recusa o evento em silêncio.
 *
 * Estes testes prendem as quatro coisas que decidem se este painel ajuda ou
 * mente: o número que ela vê, o prazo que a faz agir hoje, a pergunta antes de
 * um envio que não se desfaz, e — a mais importante — que um envio RECUSADO
 * nunca apareça com o aspecto de um envio feito.
 */

let relatorio: Record<string, unknown> | null;
let leituraFalha = false;
let respostaDoEnvio: Record<string, unknown>;
let enviosFeitos = 0;

/** Um fecho que aconteceu há `dias` dias — é daqui que sai o prazo. */
const fecho = (ref: string, valor: number, dias: number) => ({
  ref,
  valor,
  fechadoEm: Math.floor((Date.now() - dias * 86_400_000) / 1000),
});

const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if ((init?.method ?? "GET") === "POST") {
    enviosFeitos += 1;
    return { ok: true, json: async () => respostaDoEnvio } as unknown as Response;
  }
  if (url.includes("formato=json")) {
    if (leituraFalha) return { ok: false, status: 500, json: async () => ({}) } as Response;
    return { ok: true, json: async () => relatorio } as unknown as Response;
  }
  return { ok: true, json: async () => ({}) } as unknown as Response;
});

beforeEach(() => {
  enviosFeitos = 0;
  leituraFalha = false;
  respostaDoEnvio = { enviados: 2, recebidos: 2, valorTotal: 12400 };
  relatorio = {
    examinados: 5,
    valorTotal: 12400,
    diasAceites: 7,
    configurada: true,
    aEnviar: [fecho("LIQ-1", 5000, 1), fecho("LIQ-2", 7400, 3)],
    excluidos: [{ ref: "LIQ-9", motivo: "sem-identificador" }],
  };
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o que o painel diz antes de se lhe tocar", () => {
  it("conta os casamentos e o dinheiro, sem obrigar a carregar em nada", async () => {
    const { container } = render(<FechosMeta />);
    await screen.findByRole("button", { name: /Enviar à Meta/i });
    // A frase inteira, e não um pedaço: o número e o dinheiro estão em nós
    // diferentes de propósito (são os dois a negrito), e é a leitura junta que
    // ela faz.
    const texto = container.textContent ?? "";
    expect(texto).toMatch(/2\s*casamentos fechados por enviar/i);
    expect(texto).toMatch(/12\s?400/);
  });

  it("não há nada a enviar: não oferece botão nenhum", async () => {
    relatorio = { ...relatorio, aEnviar: [], valorTotal: 0 };
    render(<FechosMeta />);
    expect(await screen.findByText(/Não há casamentos fechados por enviar/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Enviar à Meta/i })).toBeNull();
  });

  it("com o prazo a acabar, di-lo — é a frase que decide se ela faz isto hoje", async () => {
    relatorio = { ...relatorio, aEnviar: [fecho("LIQ-1", 5000, 6)] };
    render(<FechosMeta />);
    expect(await screen.findByText(/fecha o prazo da Meta amanhã/i)).toBeTruthy();
  });

  it("com folga, não inventa urgência nenhuma", async () => {
    relatorio = { ...relatorio, aEnviar: [fecho("LIQ-1", 5000, 0)] };
    render(<FechosMeta />);
    await screen.findByRole("button", { name: /Enviar à Meta/i });
    expect(screen.queryByText(/prazo da Meta/i)).toBeNull();
  });

  it("sem configuração, diz o que falta E não deixa carregar", async () => {
    // Carregar para ser informado de que não está ligado é a pior ordem
    // possível: o gesto parece ter corrido e não correu.
    relatorio = { ...relatorio, configurada: false };
    render(<FechosMeta />);
    expect(await screen.findByText(/META_DATASET_ID/)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Enviar à Meta/i })).toBeDisabled();
  });

  it("se a leitura falhar, não finge um zero — oferece tentar outra vez", async () => {
    // Um «não há nada para enviar» por causa de uma leitura falhada era a
    // mentira mais cara deste ecrã: ela fechava o portátil descansada.
    leituraFalha = true;
    render(<FechosMeta />);
    expect(await screen.findByText(/Não foi possível contar/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Enviar à Meta/i })).toBeNull();
  });
});

describe("o envio", () => {
  it("pergunta primeiro, com os dois números à vista — não se desfaz", async () => {
    const user = userEvent.setup();
    render(<FechosMeta />);
    await user.click(await screen.findByRole("button", { name: /Enviar à Meta/i }));
    const pergunta = await screen.findByText(/Enviar 2 casamentos à Meta/i);
    expect(pergunta.textContent).toMatch(/12\s?400/);
    expect(pergunta.textContent).toMatch(/Não se desfaz/i);
    // E ainda não saiu nada.
    expect(enviosFeitos).toBe(0);
  });

  it("cancelar não envia", async () => {
    const user = userEvent.setup();
    render(<FechosMeta />);
    await user.click(await screen.findByRole("button", { name: /Enviar à Meta/i }));
    await user.click(await screen.findByRole("button", { name: /^Cancelar$/ }));
    expect(enviosFeitos).toBe(0);
    expect(await screen.findByRole("button", { name: /Enviar à Meta/i })).toBeTruthy();
  });

  it("confirmado, envia e diz quantos a META recebeu — não quantos se pediram", async () => {
    const user = userEvent.setup();
    respostaDoEnvio = { enviados: 2, recebidos: 1 };
    render(<FechosMeta />);
    await user.click(await screen.findByRole("button", { name: /Enviar à Meta/i }));
    await user.click(await screen.findByRole("button", { name: /^Enviar$/ }));
    await waitFor(() => expect(enviosFeitos).toBe(1));
    expect(await screen.findByText(/A Meta recebeu 1 de 2/i)).toBeTruthy();
  });

  it("recusado, NUNCA aparece como enviado", async () => {
    // A avaria que este ecrã existe para não ter: o construtor de propostas
    // escrevia «Proposta enviada» no histórico sobre um email que não saiu.
    const user = userEvent.setup();
    respostaDoEnvio = { enviados: 0, motivo: "recusado", detalhe: "invalid access token" };
    render(<FechosMeta />);
    await user.click(await screen.findByRole("button", { name: /Enviar à Meta/i }));
    await user.click(await screen.findByRole("button", { name: /^Enviar$/ }));
    const aviso = await screen.findByText(/A Meta recusou o envio/i);
    expect(aviso.textContent).toContain("invalid access token");
    expect(screen.queryByText(/A Meta recebeu/i)).toBeNull();
  });

  it("e o aviso de a lista de enviados não ter ficado gravada chega ao ecrã", async () => {
    // Sem isto no ecrã, a corrida seguinte manda as mesmas conversões outra
    // vez e o valor dos negócios fechados aparece inflado — sem ninguém saber
    // porquê. A rota já o diz no corpo; o ecrã tinha de o repetir.
    const user = userEvent.setup();
    respostaDoEnvio = {
      enviados: 2,
      recebidos: 2,
      aviso: "Os eventos foram aceites pela Meta, mas a lista de enviados não ficou gravada.",
    };
    render(<FechosMeta />);
    await user.click(await screen.findByRole("button", { name: /Enviar à Meta/i }));
    await user.click(await screen.findByRole("button", { name: /^Enviar$/ }));
    expect(await screen.findByText(/lista de enviados não ficou gravada/i)).toBeTruthy();
  });

  it("depois de enviar, volta a contar — o painel não fica a mostrar o passado", async () => {
    const user = userEvent.setup();
    render(<FechosMeta />);
    await user.click(await screen.findByRole("button", { name: /Enviar à Meta/i }));
    relatorio = { ...relatorio, aEnviar: [], valorTotal: 0 };
    await user.click(await screen.findByRole("button", { name: /^Enviar$/ }));
    expect(await screen.findByText(/Não há casamentos fechados por enviar/i)).toBeTruthy();
  });
});

/**
 * O NÚMERO QUE NINGUÉM QUER VER, E QUE TEM DE ESTAR À VISTA.
 *
 * Um fecho «fora da janela» é dinheiro que a conta da Meta já não conta —
 * passou dos sete dias e o evento foi recusado em silêncio. É a prova de que a
 * rotina semanal falhou, e escondê-lo numa lista de exclusões junto com os
 * casos normais («não vieram de um anúncio») era enterrar a única linha do
 * relatório que pede uma mudança de hábito.
 */
describe("os que já não podem ser enviados", () => {
  it("aparecem por si, fora da lista das exclusões normais", async () => {
    relatorio = {
      ...relatorio,
      excluidos: [
        { ref: "LIQ-7", motivo: "fora-da-janela", detalhe: "fechou há 12 dias" },
        { ref: "LIQ-8", motivo: "sem-identificador" },
      ],
    };
    render(<FechosMeta />);
    expect(await screen.findByText(/1 casamento fechado já não pode ser enviado/i)).toBeTruthy();
  });

  it("e quando não há nenhum, não se escreve nada sobre eles", async () => {
    render(<FechosMeta />);
    await screen.findByRole("button", { name: /Enviar à Meta/i });
    expect(screen.queryByText(/já não pode/i)).toBeNull();
  });
});
