// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider } from "./Toast";
import DefinicoesProposta from "./DefinicoesProposta";

/**
 * "Depende também de que valor está a gasolina."
 *
 * O ecrã existe para responder a isso, e estes testes prendem as três coisas
 * que o tornam útil: mostrar o efeito do número enquanto se escreve, dizer há
 * quanto tempo o preço lá está, e gravar o que se escreveu.
 */

const NUNCA = "1970-01-01T00:00:00.000Z";

const parametros = (over: Record<string, unknown> = {}) => ({
  deslocacao: {
    consumoLPor100Km: 9,
    precoLitro: 1.65,
    portagensPorKm: 0.09,
    desgastePorKm: 0.1,
    franquiaKm: 40,
    idaEVolta: true,
  },
  margemMinima: 35,
  definidoEm: { deslocacao: NUNCA, margem: NUNCA },
  ...over,
});

let enviados: { body: Record<string, unknown> }[] = [];

function montar(estado = parametros()) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        enviados.push({ body });
        return { ok: true, status: 200, json: async () => estado };
      }
      return { ok: true, status: 200, json: async () => estado };
    }),
  );
  return render(
    <ToastProvider>
      <DefinicoesProposta />
    </ToastProvider>,
  );
}

beforeEach(() => {
  enviados = [];
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("o efeito dos números", () => {
  it("mostra o custo por quilómetro repartido pelas três parcelas", async () => {
    montar();
    // 9 l/100 km a 1,65 €/l = 0,15 €/km; + 0,09 + 0,10 = 0,34 €/km. Aparece em
    // mais do que um sítio (no resumo e na fórmula de cada exemplo), por isso
    // conta-se em vez de se exigir um só.
    await waitFor(() => expect(screen.getAllByText(/0,34/).length).toBeGreaterThan(0));
    expect(screen.getByText(/combustível/)).toBeTruthy();
    expect(screen.getByText(/portagens/)).toBeTruthy();
    expect(screen.getByText(/desgaste/)).toBeTruthy();
  });

  it("traduz os números em euros para três sítios reais", async () => {
    // Um formulário de seis campos é abstracto. "E então quanto fica ir ao
    // Porto?" é a pergunta que se faz, e a resposta tem de estar no ecrã.
    montar();
    await waitFor(() => expect(screen.getByText(/Évora:/)).toBeTruthy());
    expect(screen.getByText(/Palmela:/)).toBeTruthy();
    expect(screen.getByText(/Porto:/)).toBeTruthy();
  });

  it("o gasóleo mais caro muda o número no ecrã, antes de gravar", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByText(/0,34/).length).toBeGreaterThan(0));

    const campo = screen.getByLabelText(/Preço do gasóleo/) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "2,20");

    // 9 l a 2,20 € = 0,198 → 0,20; + 0,09 + 0,10 = 0,39 €/km.
    await waitFor(() => expect(screen.getAllByText(/0,39/).length).toBeGreaterThan(0));
    // E ainda não gravou nada: o efeito vê-se antes de se decidir.
    expect(enviados).toHaveLength(0);
  });

  it("aceita a vírgula como decimal, sem a comer enquanto se escreve", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "1,7");
    expect(campo.value).toBe("1,7");
  });

  /**
   * ── CORRIGIR UM PREÇO É APAGAR O ÚLTIMO ALGARISMO ─────────────────────────
   *
   * Ninguém limpa o campo para escrever 1,80: apaga-se o 5 de 1,65 e escreve-se
   * o 8. Era aí que rebentava. `Number("1,")` é 1, o valor do formulário passava
   * a 1, o efeito de sincronização reescrevia o campo a partir dele — e a
   * vírgula desaparecia debaixo dos dedos. O 8 seguinte colava-se ao 1 e ficava
   * 18 €/litro: dez vezes o preço do gasóleo, na conta da deslocação de todas
   * as propostas seguintes.
   */
  it("apagar o último algarismo não come a vírgula — 1,65 corrige-se para 1,8", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    expect(campo.value).toBe("1,65");

    await userEvent.click(campo);
    await userEvent.keyboard("{End}{Backspace}{Backspace}");
    expect(campo.value).toBe("1,");

    await userEvent.keyboard("8");
    expect(campo.value).toBe("1,8");

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.valor).toMatchObject({ precoLitro: 1.8 });
  });

  /**
   * Um campo vazio é um campo a meio de ser escrito, não zero. O campo saltava
   * para "0" e punha 0 €/litro nos parâmetros — e um clique em «Guardar
   * deslocação» tirava o combustível da conta de todas as propostas.
   */
  it("limpar o campo não grava 0 €/litro", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    await userEvent.clear(campo);
    expect(campo.value).toBe("");

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.valor).toMatchObject({ precoLitro: 1.65 });
  });
});

describe("a idade do número", () => {
  it("diz que nunca foi confirmado, e porque é que isso importa", async () => {
    montar();
    await waitFor(() => expect(screen.getAllByText(/nunca confirmado/).length).toBeGreaterThan(0));
    expect(screen.getByText(/ponto de partida escrito por quem não abastece/)).toBeTruthy();
  });

  it("um preço posto esta semana não leva aviso nenhum", async () => {
    const ontem = new Date(Date.now() - 86_400_000).toISOString();
    montar(parametros({ definidoEm: { deslocacao: ontem, margem: ontem } }));
    await waitFor(() => expect(screen.getAllByText(/definido ontem/).length).toBeGreaterThan(0));
    expect(screen.queryByText(/já tem algumas semanas/)).toBeNull();
  });

  it("um preço de há meses pede para ser confirmado", async () => {
    const velho = new Date(Date.now() - 90 * 86_400_000).toISOString();
    montar(parametros({ definidoEm: { deslocacao: velho, margem: velho } }));
    await waitFor(() => expect(screen.getByText(/já tem algumas semanas/)).toBeTruthy());
    expect(screen.getAllByText(/definido há 3 meses/).length).toBeGreaterThan(0);
  });
});

describe("gravar", () => {
  it("envia os seis números da deslocação", async () => {
    montar();
    await screen.findByLabelText(/Preço do gasóleo/);
    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.id).toBe("deslocacao");
    expect(enviados[0].body.valor).toMatchObject({
      precoLitro: 1.65,
      consumoLPor100Km: 9,
      idaEVolta: true,
    });
  });

  it("a margem grava-se à parte", async () => {
    montar();
    await screen.findByLabelText(/Avisar abaixo de/);
    await userEvent.click(screen.getByRole("button", { name: "Guardar margem" }));

    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body).toEqual({ id: "margem", valor: { minima: 35 } });
  });
});
