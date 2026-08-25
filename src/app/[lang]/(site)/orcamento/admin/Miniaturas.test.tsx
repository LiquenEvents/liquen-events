// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Miniaturas from "./Miniaturas";

vi.mock("./Toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));

/**
 * O que aqui interessa provar são cinco coisas, e nenhuma delas é «desenha uma
 * caixa»:
 *
 *  1. **contar não escreve.** É a propriedade que faz o botão ser carregável
 *     sem medo, e é a única maneira de a hipótese cair depressa se estiver
 *     errada;
 *  2. **a avaria e o ganho não se somam.** Uma foto sem miniatura puxa o
 *     original; uma foto sem AVIF vê-se na mesma. Um número só, grande e
 *     vermelho, é o que fazia este painel ser ignorado;
 *  3. **as pastas dizem-se pelo nome.** Um UUID não é o nome de nada;
 *  4. **a geração anda aos poucos até acabar.** O servidor faz um lote de cada
 *     vez; se este ecrã não repetisse, ela via «25 geradas» e ficava a achar
 *     que tinha acabado com quatrocentas por fazer;
 *  5. **um lote que não gera nada pára o ciclo.** Sem isso, uma fotografia
 *     corrompida — que falha sempre — punha o browser a repetir o mesmo pedido
 *     quatrocentas vezes.
 */

function respostaDe(corpo: unknown, status = 200) {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Uma contagem completa, com os campos que a rota manda mesmo. */
function contagemDe(p: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    linhas: [],
    fotos: 100,
    emFalta: 0,
    emFaltaEssenciais: 0,
    emFaltaLeves: 0,
    fotosSemMiniatura: 0,
    fotosSemVersaoLeve: 0,
    avisos: [],
    ...p,
  };
}

function lote(p: Partial<Record<string, unknown>> = {}) {
  return {
    ok: true,
    geradas: 0,
    falhas: [],
    restantes: 0,
    restantesEssenciais: 0,
    fotografiasRestantes: 0,
    fotografiasFeitas: 0,
    // Onde o lote parou. `null` = acabou — é ISTO que fecha o ciclo agora, e
    // não um contador de restantes: contar o que falta obrigava o servidor a
    // varrer a biblioteca inteira a cada lote.
    retoma: null,
    papel: "essencial",
    ...p,
  };
}

/** Um ponto de retoma qualquer: o lote diz que ainda há mais pela frente. */
const MAIS = {
  papel: "essencial",
  origem: "theme-assets",
  pasta: "tema-a",
  caminho: "tema-a/f.jpg",
};

/** O traço da barra do `EmCurso`, que se mede pelo `scaleX`. */
const barra = () => document.querySelector('[data-barra="preenchimento"]') as HTMLElement | null;

describe("Miniaturas", () => {
  let chamadas: { metodo: string; url: string }[] = [];

  beforeEach(() => {
    chamadas = [];
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  /**
   * ══════════════════════════════════════════════════════════════════════════
   * DOIS NÚMEROS PARA O MESMO TRABALHO
   * ══════════════════════════════════════════════════════════════════════════
   *
   * Ela carregou em «Gerar as versões leves de 389 fotografias» e o cartão
   * respondeu «0 de 765». Os dois números estavam certos — 389 fotografias,
   * duas codificações AVIF cada — e o ecrã não dizia isso em lado nenhum. Uma
   * barra que fala noutra unidade que não a do botão que a abriu não se lê:
   * lê-se como avaria.
   */
  it("a barra conta nas fotografias que o botão prometeu", async () => {
    const soltar: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          return new Promise((r) =>
            soltar.push(() =>
              r(
                respostaDe(
                  lote({ geradas: 20, fotografiasFeitas: 10, retoma: MAIS, papel: "leve" }),
                ),
              ),
            ),
          );
        }
        return respostaDe(
          contagemDe({ emFalta: 80, emFaltaLeves: 80, fotosSemVersaoLeve: 40, fotos: 40 }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as versões leves/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as versões leves/i }));

    // O cartão fala das 40 fotografias, e não das 80 derivadas.
    await waitFor(() => expect(screen.getByText(/0 de 40/)).toBeInTheDocument());

    soltar[0]?.();
    // 40 por fazer menos 30 que sobram = 10 feitas. NÃO as 20 derivadas que o
    // lote gerou: somar derivadas numa barra de fotografias fá-la passar do fim.
    await waitFor(() => expect(screen.getByText(/10 de 40/)).toBeInTheDocument());
  });

  /**
   * O PRIMEIRO LOTE É O MAIS DEMORADO, E A BARRA A ZERO PARECE AVARIADA.
   *
   * Entre carregar no botão e a primeira resposta pode ir um minuto: o servidor
   * percorre a biblioteca antes de gerar seja o que for. Nesse minuto a barra
   * está a zero e parada — indistinguível de partida, e foi essa a conclusão
   * dela.
   */
  it("enquanto o primeiro lote não volta, diz o que está a acontecer", async () => {
    const soltar: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          return new Promise((r) =>
            soltar.push(() => r(respostaDe(lote({ geradas: 9, fotografiasFeitas: 3 })))),
          );
        }
        return respostaDe(
          contagemDe({ emFalta: 9, emFaltaEssenciais: 9, fotosSemMiniatura: 3, fotos: 3 }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as miniaturas/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as miniaturas/i }));

    await waitFor(() => expect(screen.getByText(/a percorrer a biblioteca/i)).toBeInTheDocument());
    soltar[0]?.();
    // Chegado o primeiro lote, a nota volta a ser a de sempre.
    await waitFor(() => expect(screen.queryByText(/a percorrer a biblioteca/i)).toBeNull());
  });

  /**
   * UM BOTÃO DESACTIVADO TEM DE CONTINUAR A DIZER O QUE FAZ.
   *
   * `bg-foreground text-background disabled:opacity-50`: o `opacity` desbota o
   * elemento inteiro, o fundo escuro vira cinzento médio e o texto — que é da
   * cor do papel — desaparece lá dentro. No ecrã dela era um rectângulo
   * cinzento sem uma letra, mesmo ao lado do botão que ela tinha carregado.
   */
  it("o botão escuro desactivado não desbota o texto até desaparecer", async () => {
    const soltar: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        if ((init?.method ?? "GET") === "POST") {
          return new Promise((r) => soltar.push(() => r(respostaDe(lote()))));
        }
        return respostaDe(
          contagemDe({
            emFalta: 12,
            emFaltaEssenciais: 9,
            emFaltaLeves: 3,
            fotosSemMiniatura: 3,
            fotosSemVersaoLeve: 3,
            fotos: 3,
          }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    const escuro = await screen.findByRole("button", { name: /gerar as miniaturas/i });
    await userEvent.click(escuro);

    await waitFor(() => expect(escuro).toBeDisabled());
    // Continua a dizer sobre quantas fotografias é — a única coisa no ecrã que
    // distingue as duas gerações enquanto o lote corre.
    expect(escuro.textContent).toMatch(/3 fotografias/);
    // E não é o `opacity` a desbotá-lo: esse leva o texto atrás.
    expect(escuro.className).not.toMatch(/disabled:opacity/);
  });

  it("contar não escreve nada — só faz GET", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        chamadas.push({ metodo: init?.method ?? "GET", url: String(url) });
        return respostaDe(contagemDe({ fotos: 120 }));
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));

    await waitFor(() => expect(screen.getByText(/nada em falta/i)).toBeInTheDocument());
    expect(chamadas).toEqual([{ metodo: "GET", url: "/api/admin/derivadas" }]);
    // Sem nada em falta não há nada para gerar, e nenhum botão de gerar aparece.
    expect(screen.queryByRole("button", { name: /gerar/i })).toBeNull();
  });

  /**
   * O DEFEITO QUE DEU ORIGEM A ISTO.
   *
   * O ecrã dela dizia «1140 miniaturas em falta, em 683 fotografias». Das 1140,
   * 1366 seriam AVIF de fotografias que se veem perfeitamente — o AVIF foi
   * acrescentado depois de elas existirem, e nenhuma o podia ter. O número
   * grande escondia o que interessava: quantas fotos é que estão MESMO a puxar
   * o original.
   */
  it("separa as fotografias sem miniatura das que só não têm versão leve", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaDe(
          contagemDe({
            fotos: 683,
            emFalta: 1140,
            emFaltaEssenciais: 94,
            emFaltaLeves: 1046,
            fotosSemMiniatura: 47,
            fotosSemVersaoLeve: 683,
          }),
        ),
      ),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));

    // A avaria, em fotografias e não em derivadas.
    await waitFor(() => expect(screen.getByText(/descarregadas inteiras/i)).toBeInTheDocument());
    expect(screen.getAllByText("47 fotografias").length).toBeGreaterThan(0);
    // O ganho, dito à parte e sem alarme.
    expect(screen.getByText(/não parte nada/i)).toBeInTheDocument();
    // E dois botões, cada um com o seu trabalho.
    expect(
      screen.getByRole("button", { name: /gerar as miniaturas de 47 fotografias/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /gerar as versões leves de 683 fotografias/i }),
    ).toBeInTheDocument();
  });

  it("as pastas aparecem pelo nome do tema, não pelo id", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        respostaDe(
          contagemDe({
            fotos: 52,
            emFalta: 94,
            emFaltaEssenciais: 94,
            fotosSemMiniatura: 47,
            linhas: [
              {
                origem: "theme-assets",
                pasta: "6b9d0c4e-1f2a-4d3b-9c8e-0a1b2c3d4e5f",
                nome: "Bouquets Campestres",
                daBiblioteca: true,
                fotos: 52,
                semMiniatura: 47,
                semVersaoLeve: 0,
                emFalta: 94,
              },
            ],
          }),
        ),
      ),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));

    await waitFor(() => expect(screen.getByText("Bouquets Campestres")).toBeInTheDocument());
    expect(screen.getByText(/47 de 52 sem miniatura/)).toBeInTheDocument();
    expect(screen.queryByText(/6b9d0c4e/)).toBeNull();
    expect(screen.queryByText(/theme-avif/)).toBeNull();
  });

  it("gerar só as miniaturas pede só as essenciais ao servidor", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo, url: String(url) });
        if (metodo === "POST") return respostaDe(lote({ geradas: 94, fotografiasFeitas: 94 }));
        return respostaDe(
          contagemDe({ emFalta: 94, emFaltaEssenciais: 94, fotosSemMiniatura: 47 }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as miniaturas/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as miniaturas/i }));

    await waitFor(() => expect(chamadas.some((c) => c.metodo === "POST")).toBe(true));
    expect(chamadas.find((c) => c.metodo === "POST")?.url).toBe(
      "/api/admin/derivadas?papel=essencial",
    );
  });

  it("gera aos poucos até não sobrar nenhuma", async () => {
    const lotes = [
      lote({ geradas: 25, fotografiasFeitas: 25, retoma: MAIS }),
      lote({ geradas: 25, fotografiasFeitas: 25, retoma: MAIS }),
      lote({ geradas: 5, fotografiasFeitas: 5 }),
    ];
    let volta = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo, url: String(url) });
        if (metodo === "POST") return respostaDe(lotes[volta++] ?? lotes[2]);
        // A contagem: cheia antes de gerar, vazia depois.
        return respostaDe(
          volta === 0
            ? contagemDe({ emFalta: 55, emFaltaEssenciais: 55, fotosSemMiniatura: 55 })
            : contagemDe(),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as miniaturas/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as miniaturas/i }));

    await waitFor(() => expect(screen.getByText(/nada em falta/i)).toBeInTheDocument());
    // Três lotes, nem mais nem menos: parar ao segundo deixava trinta por fazer.
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(3);
  });

  /**
   * A SEGUNDA PASSAGEM COMEÇA DO ZERO.
   *
   * A primeira faz 52 e deixa 8 por fazer. Ao carregar outra vez, a contagem
   * anterior ficava lá: enquanto o primeiro lote não respondia — que num lote
   * grande são segundos — o cartão dizia «52 de 8» com a barra cheia e nada
   * feito. Uma barra que mente uma vez deixa de se poder ler.
   */
  it("uma segunda passagem não começa com a contagem da primeira", async () => {
    let posts = 0;
    let emFalta = 60;
    const soltar: (() => void)[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        if (metodo === "POST") {
          posts += 1;
          if (posts === 1) {
            emFalta = 8;
            return respostaDe(
              lote({
                geradas: 52,
                fotografiasFeitas: 52,
                falhas: Array.from({ length: 8 }, (_, i) => `theme-thumbs/x/${i}.jpg`),
              }),
            );
          }
          // A segunda fica pendurada: é este o instante que interessa ver.
          return new Promise<Response>((resolve) => {
            soltar.push(() => resolve(respostaDe(lote({ geradas: 0 }))));
          });
        }
        return respostaDe(
          contagemDe({
            emFalta,
            emFaltaEssenciais: emFalta,
            fotosSemMiniatura: emFalta,
          }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() =>
      screen.getByRole("button", { name: /gerar as miniaturas de 60 fotografias/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /gerar as miniaturas de 60 fotografias/i }),
    );

    await waitFor(() =>
      screen.getByRole("button", { name: /gerar as miniaturas de 8 fotografias/i }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: /gerar as miniaturas de 8 fotografias/i }),
    );

    expect(screen.getByText("0 de 8")).toBeInTheDocument();
    expect(barra()?.style.transform).toBe("scaleX(0)");
    soltar[0]?.();
  });

  it("um lote que não gera nada pára o ciclo em vez de repetir para sempre", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo, url: "" });
        // Sempre a mesma resposta: nada gerado, e continua a haver que fazer.
        // É o que uma fotografia corrompida produz.
        if (metodo === "POST")
          return respostaDe(lote({ geradas: 0, falhas: ["theme-thumbs/x/a.jpg"] }));
        return respostaDe(
          contagemDe({ fotos: 10, emFalta: 8, emFaltaEssenciais: 8, fotosSemMiniatura: 8 }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as miniaturas/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as miniaturas/i }));

    await waitFor(() => expect(screen.getByText(/não deu/i)).toBeInTheDocument());
    expect(chamadas.filter((c) => c.metodo === "POST")).toHaveLength(1);
  });

  /**
   * O «Parar» tem de parar mesmo.
   *
   * Sem ele, começar a gerar 683 fotografias era um compromisso de que não se
   * saía a não ser fechando o separador — e fechar o separador a meio de uma
   * coisa é exactamente o gesto que faz duvidar se ficou tudo estragado.
   */
  it("parar a meio interrompe o ciclo e não perde o que já foi feito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const metodo = init?.method ?? "GET";
        chamadas.push({ metodo, url: "" });
        if (metodo === "POST") {
          // Um lote leva tempo. Sem isto o ciclo dava as quatrocentas voltas
          // antes de o React conseguir desenhar o cartão — e não havia
          // instante nenhum em que carregar no «Parar».
          await new Promise((r) => setTimeout(r, 15));
          return respostaDe(lote({ geradas: 25, fotografiasFeitas: 25, retoma: MAIS }));
        }
        return respostaDe(
          contagemDe({ emFalta: 925, emFaltaEssenciais: 925, fotosSemMiniatura: 925 }),
        );
      }),
    );

    render(<Miniaturas />);
    await userEvent.click(screen.getByRole("button", { name: /contar as que faltam/i }));
    await waitFor(() => screen.getByRole("button", { name: /gerar as miniaturas/i }));
    await userEvent.click(screen.getByRole("button", { name: /gerar as miniaturas/i }));

    await waitFor(() => screen.getByRole("button", { name: /parar/i }));
    await userEvent.click(screen.getByRole("button", { name: /parar/i }));

    await waitFor(() => expect(screen.queryByText(/a gerar/i)).toBeNull());
    // Longe dos 400 lotes que o travão permite: parou por ordem dela.
    expect(chamadas.filter((c) => c.metodo === "POST").length).toBeLessThan(5);
  });
});
