// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { Quote } from "@/lib/orcamento/types";
import PainelInterno from "./PainelInterno";
import { esquecerDefinicoes } from "./definicoes-da-proposta";

/**
 * O painel existe para responder a três perguntas que só interessam a quem
 * decide se o negócio se faz: quanto sobra, quanto custa lá chegar, e se o
 * total é normal para um casamento assim. Nada disto pode escapar para o PDF —
 * essa garantia está no teste do desenhador; aqui prende-se o comportamento.
 */

const doc = (over: Partial<ProposalDoc> = {}): ProposalDoc =>
  ({
    budgetItems: ["Decoração de cerimónia", "Arranjos de mesa"],
    budgetAmounts: [4000, 2000],
    budgetExtras: [],
    location: "Palmela",
    ...over,
  }) as ProposalDoc;

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({ id: "LQ-1", name: "Ana e Rui", guests: 120, location: "Palmela", ...over }) as Quote;

function montar(props: Partial<Parameters<typeof PainelInterno>[0]> = {}) {
  const onCusto = vi.fn();
  const onDeslocacao = vi.fn();
  const onKm = vi.fn();
  render(
    <PainelInterno
      doc={doc()}
      quote={pedido()}
      quotes={[]}
      totalBruto={7380}
      onCusto={onCusto}
      onDeslocacao={onDeslocacao}
      onKm={onKm}
      {...props}
    />,
  );
  return { onCusto, onDeslocacao, onKm };
}

/** Abre a gaveta — está fechada por omissão, e é isso que a torna discreta. */
const abrir = () => userEvent.click(screen.getByRole("button", { name: /Só para ti/ }));

/** A sede que as definições devolvem neste teste. Évora, salvo dito ao contrário. */
let base = "Évora";

beforeEach(() => {
  base = "Évora";
  // As definições são lidas UMA vez por página e guardadas no módulo. Sem este
  // esquecimento, a primeira resposta valia para o ficheiro de testes inteiro e
  // um teste que muda a sede não mudava coisa nenhuma.
  esquecerDefinicoes();
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        deslocacao: {
          base,
          consumoLPor100Km: 9,
          precoLitro: 1.65,
          portagensPorKm: 0.09,
          desgastePorKm: 0.1,
          franquiaKm: 40,
          idaEVolta: true,
        },
        margemMinima: 35,
      }),
    })),
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("discrição", () => {
  it("abre fechado e diz, no rótulo, que não sai no PDF", () => {
    montar();
    // O número mais sensível da casa não fica aberto num ecrã que se roda para
    // o lado quando alguém passa.
    expect(screen.getByText(/nunca sai no PDF/)).toBeTruthy();
    expect(screen.queryByLabelText("Custo da linha 1")).toBeNull();
  });
});

describe("custo e margem", () => {
  it("recebe o custo de cada linha", async () => {
    const { onCusto } = montar();
    await abrir();
    const campo = screen.getByLabelText("Custo da linha 1");
    await userEvent.type(campo, "1500");
    await userEvent.tab();
    expect(onCusto).toHaveBeenCalledWith(0, 1500);
  });

  it("aceita o formato português — '1.500' é mil e quinhentos", async () => {
    const { onCusto } = montar();
    await abrir();
    await userEvent.type(screen.getByLabelText("Custo da linha 1"), "1.500");
    await userEvent.tab();
    expect(onCusto).toHaveBeenCalledWith(0, 1500);
  });

  it("mostra a margem e assume que é parcial quando faltam custos", async () => {
    montar({ doc: doc({ budgetCosts: [1000, null] }) });
    await abrir();
    // 4000 - 1000 = 3000 sobre 4000 = 75%, mas só uma linha em duas tem custo.
    // O 75% aparece duas vezes — na linha e no total —, e é isso mesmo que se
    // quer: a mesma conta, dita nos dois sítios onde se olha.
    await waitFor(() => expect(screen.getAllByText(/75%/).length).toBe(2));
    expect(screen.getByText(/margem parcial/)).toBeTruthy();
  });

  it("avisa quando a margem fica abaixo do limite, sem impedir nada", async () => {
    montar({ doc: doc({ budgetCosts: [3800, 1900] }) });
    await abrir();
    await waitFor(() => expect(screen.getByText(/Abaixo dos 35%/)).toBeTruthy());
    expect(screen.getByText(/Não impede nada/)).toBeTruthy();
  });
});

describe("deslocação", () => {
  it("calcula a partir do local e explica a conta", async () => {
    montar();
    await abrir();
    await waitFor(() => expect(screen.getByText(/ida e volta/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /Pôr nos valores adicionais/ })).toBeTruthy();
  });

  it("passa a linha para os valores adicionais quando ela decide", async () => {
    const { onDeslocacao } = montar();
    await abrir();
    await userEvent.click(
      await screen.findByRole("button", { name: /Pôr nos valores adicionais/ }),
    );
    expect(onDeslocacao).toHaveBeenCalledWith(
      "Deslocação da equipa Líquen",
      expect.stringMatching(/€.*\+ IVA/),
    );
  });

  it("dentro da isenção não há botão nenhum a oferecer zero euros", async () => {
    montar({ doc: doc({ location: "Évora" }), quote: pedido({ location: "Évora" }) });
    await abrir();
    await waitFor(() => expect(screen.getByText(/sem deslocação a cobrar/)).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Pôr nos valores adicionais/ })).toBeNull();
  });

  it("sem local reconhecível diz o que fazer, em vez de calar-se", async () => {
    montar({ doc: doc({ location: "Portugal" }), quote: pedido({ location: "Portugal" }) });
    await abrir();
    await waitFor(() => expect(screen.getByText(/Não sei a distância/)).toBeTruthy());
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUALQUER SÍTIO DO PAÍS, E NÃO SÓ OS QUE A TABELA CONHECE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O painel só calculava a deslocação para as terras da tabela. Para tudo o
 * resto — que é a maior parte das herdades — dizia «não reconheço o local» e
 * era um beco: ou se escrevia a terra grande mais próxima (e a conta ficava
 * errada), ou se punha o valor à mão nos valores adicionais (e a conta deixava
 * de existir). Passa a haver um campo para os quilómetros.
 */
describe("os quilómetros da viagem", () => {
  it("vêm preenchidos com a sugestão da tabela quando ela sabe", async () => {
    montar();
    await abrir();
    const campo = (await screen.findByLabelText(/Quilómetros até ao local/)) as HTMLInputElement;
    // Évora–Palmela, pela tabela: 105 km.
    expect(campo.value).toBe("105");
    expect(screen.getByText(/sugestão a partir de Évora/)).toBeTruthy();
  });

  it("dão conta a uma herdade que a tabela nunca ouviu nomear", async () => {
    const sitio = "Herdade do Zambujeiro do Mar";
    montar({ doc: doc({ location: sitio }), quote: pedido({ location: sitio }) });
    await abrir();
    // Sem quilómetros ainda não há conta — mas há por onde a fazer.
    await waitFor(() => expect(screen.getByText(/Não sei a distância/)).toBeTruthy());

    const campo = (await screen.findByLabelText(/Quilómetros até ao local/)) as HTMLInputElement;
    expect(campo.value).toBe("");
  });

  it("o que ela escreve fica no documento — é o que impede o número de fugir", async () => {
    const sitio = "Herdade do Zambujeiro do Mar";
    const { onKm } = montar({ doc: doc({ location: sitio }), quote: pedido({ location: sitio }) });
    await abrir();
    const campo = await screen.findByLabelText(/Quilómetros até ao local/);
    await userEvent.type(campo, "180");
    await waitFor(() => expect(onKm).toHaveBeenCalledWith(180));
  });

  it("com os quilómetros escritos, a conta faz-se e a linha pode entrar", async () => {
    const sitio = "Herdade do Zambujeiro do Mar";
    const { onDeslocacao } = montar({
      doc: doc({ location: sitio, kmDeslocacao: 180 }),
      quote: pedido({ location: sitio }),
    });
    await abrir();
    // 180 km × 2 × 0,34 €/km = 122,40 € → 122 €.
    await waitFor(() => expect(screen.getByText(/180 km/)).toBeTruthy());
    await userEvent.click(
      await screen.findByRole("button", { name: /Pôr nos valores adicionais/ }),
    );
    expect(onDeslocacao).toHaveBeenCalledWith(
      "Deslocação da equipa Líquen",
      expect.stringMatching(/122,00\s?€.*\+ IVA/),
    );
  });

  it("os quilómetros escritos ganham à tabela", async () => {
    // Palmela está na tabela a 105 km. Se ela mediu 130, valem 130.
    montar({ doc: doc({ location: "Palmela", kmDeslocacao: 130 }) });
    await abrir();
    await waitFor(() => expect(screen.getByText(/130 km/)).toBeTruthy());
    expect(screen.queryByText(/105 km/)).toBeNull();
    expect(screen.getByText(/escritos por ti/)).toBeTruthy();
  });

  it("zero quilómetros é o evento em casa — isento, e não «não sei»", async () => {
    montar({ doc: doc({ location: "Quinta aqui ao lado", kmDeslocacao: 0 }) });
    await abrir();
    await waitFor(() => expect(screen.getByText(/sem deslocação a cobrar/)).toBeTruthy());
    expect(screen.queryByText(/Não sei a distância/)).toBeNull();
    expect(screen.queryByRole("button", { name: /Pôr nos valores adicionais/ })).toBeNull();
  });

  it("apagar o campo devolve a palavra à tabela, em vez de gravar zero", async () => {
    // Zero e vazio não são a mesma coisa: um diz «é aqui», o outro diz «não
    // decidi». Gravar 0 ao apagar tirava a deslocação da proposta sem ninguém
    // o ter pedido.
    const { onKm } = montar({ doc: doc({ location: "Palmela", kmDeslocacao: 130 }) });
    await abrir();
    const campo = await screen.findByLabelText(/Quilómetros até ao local/);
    await userEvent.clear(campo);
    await waitFor(() => expect(onKm).toHaveBeenCalledWith(null));
  });

  it("um número que não serve é dito no campo, e não vai para o documento", async () => {
    const { onKm } = montar();
    await abrir();
    const campo = await screen.findByLabelText(/Quilómetros até ao local/);
    await userEvent.clear(campo);
    await userEvent.type(campo, "abc");
    await waitFor(() => expect(screen.getByText(/só o número/)).toBeTruthy());
    expect(onKm).not.toHaveBeenCalledWith(expect.any(Number));
  });
});

describe("a sede é a que está nas definições", () => {
  it("um servidor antigo, que ainda não sabe da sede, não põe «undefined» no ecrã", async () => {
    // Durante um deploy há minutos em que o servidor velho responde sem base.
    // O ecrã tem de cair em Évora — que é o que essa resposta sempre quis
    // dizer — e não escrever a palavra `undefined` ao lado dos quilómetros.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          deslocacao: {
            consumoLPor100Km: 9,
            precoLitro: 1.65,
            portagensPorKm: 0.09,
            desgastePorKm: 0.1,
            franquiaKm: 40,
            idaEVolta: true,
          },
          margemMinima: 35,
        }),
      })),
    );
    montar();
    await abrir();
    await waitFor(() => expect(screen.getByText(/sugestão a partir de Évora/)).toBeTruthy());
    expect(screen.queryByText(/undefined/)).toBeNull();
  });

  it("mudar a base muda a conta — do Algarve, o Algarve fica perto", async () => {
    base = "Faro";
    montar({ doc: doc({ location: "Albufeira" }), quote: pedido({ location: "Albufeira" }) });
    await abrir();
    // Faro–Albufeira cabe dentro dos 40 km da isenção; Évora–Albufeira não.
    await waitFor(() => expect(screen.getByText(/sem deslocação a cobrar/)).toBeTruthy());
    expect(screen.getByText(/sugestão a partir de Faro/)).toBeTruthy();
  });
});

describe("o que já foi calculado não muda sozinho", () => {
  it("uma proposta com a linha da deslocação já posta não a vê ser reescrita", async () => {
    // A linha dos valores adicionais é TEXTO gravado no documento. Mudar a
    // sede, a tabela ou o preço do gasóleo muda a SUGESTÃO — nunca o que já
    // foi enviado a um casal.
    base = "Porto";
    const { onDeslocacao, onKm } = montar({
      doc: doc({
        location: "Palmela",
        budgetExtras: [{ label: "Deslocação da equipa Líquen", valueText: "71,00 € + IVA" }],
      }),
    });
    await abrir();
    await waitFor(() => expect(screen.getByLabelText(/Quilómetros até ao local/)).toBeTruthy());
    expect(onDeslocacao).not.toHaveBeenCalled();
    expect(onKm).not.toHaveBeenCalled();
  });
});

describe("valor fora do habitual", () => {
  const historico = Array.from(
    { length: 10 },
    (_, i) =>
      ({
        id: `H-${i}`,
        status: "aceite",
        guests: 120,
        quotedPrice: 10_000,
        location: "Palmela",
      }) as Quote,
  );

  it("avisa e mostra o intervalo, a mediana e quantos eventos", async () => {
    montar({ quotes: historico, totalBruto: 3_000 });
    await waitFor(() => expect(screen.getByText(/valor fora do habitual/)).toBeTruthy());
    await abrir();
    expect(screen.getByText(/120 pax costuma ficar entre/)).toBeTruthy();
    expect(screen.getByText(/em 10 eventos/)).toBeTruthy();
  });

  /**
   * ── O NÚMERO É O DA PROPOSTA, NÃO O DO PEDIDO ──────────────────────────
   *
   * O casal mudou de ideias entre o formulário e a proposta — o caso normal.
   * Ela corrige os convidados aqui, e a comparação de preço continuava a usar o
   * número velho: uma proposta de 200 pax cobrada a preço de 200 aparecia
   * «acima do habitual» porque o intervalo era o de 120.
   */
  it("compara com os convidados escritos na PROPOSTA", async () => {
    const grandes = Array.from(
      { length: 10 },
      (_, i) =>
        ({
          id: `G-${i}`,
          status: "aceite",
          guests: 200,
          quotedPrice: 20_000,
          location: "Palmela",
        }) as Quote,
    );
    montar({
      doc: doc({ guests: "200 pax" }),
      quotes: [...historico, ...grandes],
      totalBruto: 24_600,
    });
    await abrir();
    // Cala-se: 24.600 € brutos são exactamente os 20.000 € do histórico de 200
    // pax. Com o 120 do pedido, este total estava muito acima.
    expect(screen.queryByText(/costuma ficar entre/)).toBeNull();
  });

  it("CONTROLO POSITIVO: sem convidados na proposta, volta a valer o pedido", async () => {
    // O mesmo histórico e o mesmo total — só o documento é que deixa de dizer
    // quantas pessoas são. Sem isto, o silêncio acima podia ser um silêncio que
    // este histórico dá a qualquer preço.
    const grandes = Array.from(
      { length: 10 },
      (_, i) =>
        ({
          id: `G-${i}`,
          status: "aceite",
          guests: 200,
          quotedPrice: 20_000,
          location: "Palmela",
        }) as Quote,
    );
    montar({ doc: doc(), quotes: [...historico, ...grandes], totalBruto: 24_600 });
    await abrir();
    expect(screen.getByText(/120 pax costuma ficar entre/)).toBeTruthy();
  });

  it("cala-se quando o valor é normal", async () => {
    // 12.300 € são os 10.000 € do histórico com IVA: o `totalBruto` que este
    // painel passa é BRUTO e o `quotedPrice` guardado é líquido. É o mesmo
    // preço, escrito nas duas moedas (ver `padrao-de-preco.valorDe`).
    montar({ quotes: historico, totalBruto: 12_300 });
    await abrir();
    expect(screen.queryByText(/costuma ficar entre/)).toBeNull();
  });

  it("sem histórico não inventa um padrão", async () => {
    montar({ quotes: [], totalBruto: 3_000 });
    await abrir();
    expect(screen.queryByText(/costuma ficar entre/)).toBeNull();
  });
});

describe("a memória de preços", () => {
  /** Substitui o `fetch` global para a memória responder alguma coisa. */
  function comMemoria(memoria: Record<string, unknown>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => ({
        ok: true,
        json: async () =>
          String(url).includes("/memoria")
            ? { historico: [], habituais: [], ...memoria }
            : { margemMinima: 35 },
      })),
    );
  }

  it("diz, por baixo da linha, o que já se cobrou por aquilo", async () => {
    comMemoria({
      historico: [
        {
          nome: "Arranjos de mesa",
          min: 800,
          max: 1200,
          mediana: 1000,
          casos: 7,
          regiao: "Évora",
          ultimaVez: "2026-05-01T10:00:00.000Z",
        },
      ],
    });
    montar();
    await abrir();

    // O intervalo, a mediana e QUANTOS casos: sem o número de casos, "já cobrou
    // 1.000 €" tanto pode vir de vinte propostas como de uma.
    const frase = await screen.findByText(/Já cobrou entre/);
    expect(frase.textContent).toContain("mediana");
    expect(frase.textContent).toContain("7 propostas");
    expect(frase.textContent).toContain("na zona de Évora");
  });

  it("não escreve preço nenhum — só mostra", async () => {
    comMemoria({
      historico: [
        {
          nome: "Arranjos de mesa",
          min: 800,
          max: 1200,
          mediana: 1000,
          casos: 7,
          regiao: null,
          ultimaVez: "2026-05-01T10:00:00.000Z",
        },
      ],
    });
    const { onCusto } = montar();
    await abrir();
    await screen.findByText(/Já cobrou entre/);
    // Um preço escrito automaticamente seria a última vez que alguém pensava
    // naquele número.
    expect(onCusto).not.toHaveBeenCalled();
  });

  it("avisa do que costuma incluir e falta aqui", async () => {
    comMemoria({ habituais: [{ nome: "Arco floral", em: 9, de: 10 }] });
    montar();
    await abrir();
    const aviso = await screen.findByText(/em 9 de 10 propostas parecidas/);
    expect(aviso).toBeTruthy();
    // E diz que pode ser de propósito: um aviso que trata uma escolha como erro
    // ensina a ignorar avisos.
    expect(screen.getByText(/Pode ser de propósito/)).toBeTruthy();
  });

  it("o que já está na proposta não aparece como esquecido", async () => {
    // Está escrito nas linhas, com outro plural e outra caixa — e continua a
    // ser o mesmo serviço.
    comMemoria({ habituais: [{ nome: "Arranjos das mesas", em: 9, de: 10 }] });
    montar();
    await abrir();
    await waitFor(() => expect(screen.queryByText(/propostas parecidas/)).toBeNull());
  });

  it("um serviço escrito só nos SERVIÇOS também conta como presente", async () => {
    // Avisar sobre um serviço que está ali em cima, escrito, dava-lhe razão
    // para deixar de ler os avisos.
    comMemoria({ habituais: [{ nome: "Arco floral", em: 9, de: 10 }] });
    montar({
      doc: doc({
        serviceGroups: [
          { id: "g", letter: "a)", title: "Flores", items: [{ label: "Arco floral" }] },
        ],
      }),
    });
    await abrir();
    await waitFor(() => expect(screen.queryByText(/propostas parecidas/)).toBeNull());
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMPO DO CUSTO É DA LINHA, NÃO DA POSIÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As linhas desenham-se com `key={i}` — a POSIÇÃO — e o campo do custo é
 * não-controlado (`defaultValue` + `onBlur`). Apagada uma linha do meio lá em
 * cima, o React reaproveita o nó que sobrevive na posição e o `defaultValue`
 * não se volta a aplicar: o campo ficava com o custo da linha ANTERIOR ao lado
 * do nome da linha nova, e o `blur` seguinte gravava-o por cima do verdadeiro.
 * A margem que daí sai deixa de ser a desta linha, e nada o assinala.
 */
describe("apagar uma linha do meio", () => {
  const tresLinhas = (over: Partial<ProposalDoc> = {}) =>
    doc({
      budgetItems: ["Alfa", "Beta", "Gama"],
      budgetAmounts: [1000, 2000, 3000],
      budgetCosts: [100, 200, 300],
      ...over,
    }) as ProposalDoc;

  it("o custo que fica no campo é o da linha que sobrou — e é esse que se grava", async () => {
    const onCusto = vi.fn();
    const { rerender } = render(
      <PainelInterno
        doc={tresLinhas()}
        quote={pedido()}
        quotes={[]}
        totalBruto={7380}
        onCusto={onCusto}
        onDeslocacao={vi.fn()}
        onKm={vi.fn()}
      />,
    );
    await abrir();
    expect(screen.getByLabelText("Custo da linha 3")).toHaveValue("300");

    // A «Beta» é apagada lá em cima, no orçamento: o painel recebe o documento
    // já sem ela.
    rerender(
      <PainelInterno
        doc={tresLinhas({
          budgetItems: ["Alfa", "Gama"],
          budgetAmounts: [1000, 3000],
          budgetCosts: [100, 300],
        })}
        quote={pedido()}
        quotes={[]}
        totalBruto={7380}
        onCusto={onCusto}
        onDeslocacao={vi.fn()}
        onKm={vi.fn()}
      />,
    );

    // A metade visível: o campo mostrava «200» ao lado da «Gama».
    const campo = screen.getByLabelText("Custo da linha 2");
    expect(campo).toHaveValue("300");

    // E a metade cara: tocar no campo e sair dele gravava o que lá estava.
    await userEvent.click(campo);
    await userEvent.tab();
    expect(onCusto).toHaveBeenCalledWith(1, 300);
    expect(onCusto).not.toHaveBeenCalledWith(1, 200);
  });
});
