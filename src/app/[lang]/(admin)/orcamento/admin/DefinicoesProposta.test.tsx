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
    base: "Évora",
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
   *
   * Deixou de ser suficiente não gravar 0: ver a seguir «o que não se consegue
   * gravar é dito no campo».
   */
  it("limpar o campo não grava 0 €/litro", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    await userEvent.clear(campo);
    expect(campo.value).toBe("");

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() => expect(screen.getAllByText(/Escreve o preço/).length).toBeGreaterThan(0));
    expect(enviados).toHaveLength(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE NÃO SE CONSEGUE GRAVAR É DITO NO CAMPO, ANTES DO CLIQUE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O defeito medido no servidor: escrever `abc`, `-2,5`, `1,72 €` ou apagar o
 * campo, carregar em «Guardar deslocação», e o PUT levar o preço ANTIGO — com
 * o ecrã a responder, a verde, «Guardado. As propostas seguintes já usam estes
 * valores.» O campo continuava a mostrar o que ela escreveu; só um recarregar
 * revelava que nada tinha mudado.
 *
 * O caso caro é o mais banal de todos: apagar o campo para reescrever o preço
 * da semana, carregar em Guardar, e ficar com o preço velho em todas as
 * propostas seguintes — dentro do valor da deslocação cobrada ao cliente.
 */
describe("um número que não serve não é gravado às escondidas", () => {
  /** Escreve no campo do gasóleo e carrega em «Guardar deslocação». */
  async function escreverEGuardar(texto: string) {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    await userEvent.clear(campo);
    if (texto) await userEvent.type(campo, texto);
    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    return campo;
  }

  it.each([
    ["1,72", 1.72],
    ["1.72", 1.72],
    ["2", 2],
  ])("«%s» é um preço e grava-se como %s", async (escrito, esperado) => {
    await escreverEGuardar(escrito);
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.valor).toMatchObject({ precoLitro: esperado });
  });

  it.each([
    ["abc", /só o número/],
    ["-2,5", /não pode ser negativo/i],
    ["1,72 €", /só o número/],
    ["", /Escreve o preço/],
  ])("«%s» não é um preço: o campo di-lo e nada é enviado", async (escrito, frase) => {
    const campo = await escreverEGuardar(escrito);

    // 1) A frase está NO campo (e repetida no aviso do clique), e diz o que
    //    fazer. É o campo que a aponta: `aria-describedby`.
    await waitFor(() => expect(screen.getAllByText(frase).length).toBeGreaterThan(0));
    expect(campo.getAttribute("aria-invalid")).toBe("true");
    const dito = document.getElementById(campo.getAttribute("aria-describedby") ?? "");
    expect(dito?.textContent ?? "").toMatch(frase);
    // 2) Nada foi enviado — nem com o valor antigo lá dentro.
    expect(enviados).toHaveLength(0);
    // 3) E, sobretudo, ninguém disse que ficou guardado.
    expect(screen.queryByText(/As propostas seguintes já usam estes valores/)).toBeNull();
  });

  it("corrigido o campo, a frase desaparece e a gravação segue", async () => {
    const campo = await escreverEGuardar("abc");
    await waitFor(() => expect(screen.getAllByText(/só o número/).length).toBeGreaterThan(0));

    await userEvent.clear(campo);
    await userEvent.type(campo, "1,72");
    expect(campo.getAttribute("aria-invalid")).toBeNull();

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.valor).toMatchObject({ precoLitro: 1.72 });
  });

  it("o mesmo vale para os outros campos da deslocação, não só para o gasóleo", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Consumo da carrinha/)) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "-3");

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() =>
      expect(screen.getAllByText(/não pode ser negativo/i).length).toBeGreaterThan(0),
    );
    expect(enviados).toHaveLength(0);
  });

  it("um valor fora do que a bomba cobra é recusado antes de sair do ecrã", async () => {
    // O servidor recusa acima de 20 €/litro. O ecrã tem de o dizer primeiro —
    // 40 €/l era um erro de dedo que multiplicava a deslocação por vinte.
    await escreverEGuardar("40");
    await waitFor(() =>
      expect(screen.getAllByText(/Não pode ser maior que 20/).length).toBeGreaterThan(0),
    );
    expect(enviados).toHaveLength(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * «EU QUERO QUE SE ADAPTE A QUALQUER SÍTIO»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A sede estava escrita à letra no código — Évora, em cinco sítios diferentes.
 * Passa a ser um campo, com Évora por omissão, e tudo o que a pressupunha lê
 * daqui: os exemplos deste ecrã, a franquia, e a conta de cada proposta.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CONTA NÃO MOSTRA O NÚMERO ANTIGO EM SILÊNCIO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Achado F-11 de uma auditoria em produção: «escrevi -99999 em Preço do
 * gasóleo. A mensagem de erro aparece correctamente. Mas a pré-visualização por
 * baixo continua a mostrar 0,40 €/km, o valor antigo, sem avisar que está
 * desactualizada.»
 *
 * A causa é uma boa decisão a produzir um mau efeito: um campo que não dá um
 * número que sirva NÃO emite valor — é o que impede um `Number("")` de gravar
 * zero no preço do gasóleo. O formulário fica com o último valor bom, e a conta
 * por baixo mostra-o com toda a confiança.
 *
 * É a queixa dela sobre os valores outra vez, em ponto pequeno: o ecrã a
 * mostrar um número que não é o que está à frente dos olhos.
 */
describe("a conta por baixo, com um campo por corrigir", () => {
  async function escrever(texto: string) {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    await userEvent.clear(campo);
    if (texto) await userEvent.type(campo, texto);
    return campo;
  }

  it("cala-se em vez de mostrar o custo anterior", async () => {
    // Uma montagem só: `escrever` monta, e voltar a chamá-lo punha DOIS
    // formulários no ecrã — e a conta do primeiro respondia pela do segundo.
    const campo = await escrever("1,72");
    await waitFor(() => expect(screen.getByText(/Cada quilómetro fica a/)).toBeInTheDocument());

    await userEvent.clear(campo);
    await userEvent.type(campo, "-99999");
    await waitFor(() => expect(screen.queryByText(/Cada quilómetro fica a/)).toBeNull());
  });

  it("e diz o que falta fazer, em vez de ficar em branco", async () => {
    await escrever("-99999");
    await waitFor(() =>
      expect(screen.getByText(/Corrige o campo marcado a vermelho/)).toBeInTheDocument(),
    );
    // A razão, e não só a instrução: sem ela isto lê-se como uma avaria.
    expect(screen.getByText(/era o valor ANTERIOR/)).toBeInTheDocument();
  });

  it("volta assim que o campo volta a dar um número", async () => {
    const campo = await escrever("-99999");
    await waitFor(() => expect(screen.queryByText(/Cada quilómetro fica a/)).toBeNull());

    await userEvent.clear(campo);
    await userEvent.type(campo, "1,72");
    await waitFor(() => expect(screen.getByText(/Cada quilómetro fica a/)).toBeInTheDocument());
  });
});

/**
 * A queixa do «salto de layout» do mesmo achado: a frase de erro aparecia POR
 * CIMA da ajuda e a linha crescia. Passa a ocupar o LUGAR dela.
 *
 * Reservar uma linha em branco debaixo de cada campo foi recusado, e está
 * escrito no componente porquê: os campos embrulham a dois por linha num
 * telemóvel de 390 px, portanto custava duas linhas vazias para sempre num ecrã
 * que ela já disse estar «tudo enorme» — para evitar um salto que só acontece
 * enquanto se escreve um valor inválido.
 */
describe("a frase de erro ocupa o lugar da ajuda", () => {
  it("com erro, a ajuda do campo sai do ecrã", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    expect(screen.getByText(/O que paga na bomba/)).toBeInTheDocument();

    await userEvent.clear(campo);
    await userEvent.type(campo, "-2,5");
    await waitFor(() => expect(screen.queryByText(/O que paga na bomba/)).toBeNull());
    expect(screen.getAllByText(/não pode ser negativo/i).length).toBeGreaterThan(0);
  });

  it("e volta quando o erro desaparece", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Preço do gasóleo/)) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "-2,5");
    await waitFor(() => expect(screen.queryByText(/O que paga na bomba/)).toBeNull());

    await userEvent.clear(campo);
    await userEvent.type(campo, "1,72");
    await waitFor(() => expect(screen.getByText(/O que paga na bomba/)).toBeInTheDocument());
  });
});

describe("o local da sede", () => {
  it("aparece com Évora por omissão, e diz para que serve", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Local da sede/)) as HTMLInputElement;
    expect(campo.value).toBe("Évora");
  });

  it("mudar a sede muda os exemplos, antes de gravar", async () => {
    montar();
    // Com a casa em Évora, ir ao Porto é a viagem longa e Évora é isenta.
    await waitFor(() => expect(screen.getByText(/Porto:/)).toBeTruthy());
    expect(screen.getByText(/Porto: ?/)?.parentElement?.textContent).toMatch(/ida e volta/);

    const campo = (await screen.findByLabelText(/Local da sede/)) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "Porto");

    // Com a casa no Porto, é o Porto que passa a estar dentro da isenção.
    await waitFor(() =>
      expect(screen.getByText(/Porto:/)?.parentElement?.textContent).toMatch(
        /sem deslocação a cobrar/,
      ),
    );
    expect(enviados).toHaveLength(0);
  });

  it("grava-se com os outros números da deslocação", async () => {
    montar();
    const campo = (await screen.findByLabelText(/Local da sede/)) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "Setúbal");

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.valor).toMatchObject({ base: "Setúbal", precoLitro: 1.65 });
  });

  it("uma sede em branco não se grava às escondidas", async () => {
    // O mesmo defeito dos números: o campo apagado deixava seguir o valor
    // ANTIGO com um «Guardado» a verde por cima.
    montar();
    const campo = (await screen.findByLabelText(/Local da sede/)) as HTMLInputElement;
    await userEvent.clear(campo);

    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() =>
      expect(screen.getAllByText(/Escreve a terra de onde parte/).length).toBeGreaterThan(0),
    );
    expect(enviados).toHaveLength(0);
    expect(screen.queryByText(/As propostas seguintes já usam estes valores/)).toBeNull();
  });

  it("uma sede que a tabela não conhece é dita, e não deixa o ecrã mudo", async () => {
    // É legítimo: a sede pode ser numa terra pequena. O que não pode é o ecrã
    // ficar sem exemplos nenhuns sem explicar porquê.
    montar();
    const campo = (await screen.findByLabelText(/Local da sede/)) as HTMLInputElement;
    await userEvent.clear(campo);
    await userEvent.type(campo, "Peço à Ínsua");

    await waitFor(() => expect(screen.getByText(/não conheço essa terra/i)).toBeTruthy());
    // E continua a poder ser gravada — não é um erro, é uma consequência.
    await userEvent.click(screen.getByRole("button", { name: "Guardar deslocação" }));
    await waitFor(() => expect(enviados).toHaveLength(1));
    expect(enviados[0].body.valor).toMatchObject({ base: "Peço à Ínsua" });
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
