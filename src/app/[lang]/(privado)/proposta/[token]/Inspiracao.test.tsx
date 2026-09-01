// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Inspiracao, { type BoardParaEcra } from "./Inspiracao";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import { textosDaPagina } from "./textos-da-pagina";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A LUPA — o gesto que existe para as fotografias deixarem de ser pequenas.
 * Aqui prende-se o comportamento: o que abre, o que anda, o que fecha, e a
 * regra dos bytes (a grelha na miniatura, a lupa no original).
 */

const T = textosDaPagina("pt");

const FOTOS: Record<string, FotoDaProposta> = {
  a: { id: "a", miniatura: "mini/a", original: "orig/a", largura: 1200, altura: 800 },
  b: { id: "b", miniatura: "mini/b", original: "orig/b" },
  c: { id: "c", miniatura: "mini/c", original: "orig/c" },
};

const BOARD: BoardParaEcra = {
  chave: "b1",
  titulo: "Cerimónia",
  subtitulo: "Tons quentes",
  nota: "A escolher com a noiva",
  fotos: ["a", "b", "c"],
};

const desenhar = (board: BoardParaEcra = BOARD) =>
  render(<Inspiracao boards={[board]} fotosIniciais={FOTOS} token="tk" textos={T} />);

/** A lupa, quando está aberta. */
const lupa = () => screen.queryByRole("dialog");
/** A fotografia grande — a que NÃO está dentro de um botão da grelha. */
const fotoDaLupa = () =>
  [...(lupa()?.querySelectorAll("img") ?? [])].find((i) => !i.hasAttribute("aria-hidden"));

const abrirPrimeira = () => fireEvent.click(screen.getAllByRole("button", { name: /Ampliar/ })[0]);

afterEach(cleanup);
beforeEach(() => vi.restoreAllMocks());

describe("a grelha", () => {
  it("desenha uma célula por fotografia, com a miniatura", () => {
    desenhar();
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    expect(botoes).toHaveLength(3);
    expect(botoes.map((b) => b.querySelector("img")?.getAttribute("src"))).toEqual([
      "mini/a",
      "mini/b",
      "mini/c",
    ]);
  });

  it("a célula nasce com a forma da fotografia — para a página não saltar", () => {
    desenhar();
    const comForma = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    expect(comForma.style.aspectRatio).toBe("1200 / 800");
  });

  /**
   * ── AS DUAS METADES TÊM DE USAR O MESMO NÚMERO ──────────────────────────
   *
   * Palavras dela: «Seating Plan e Corredor Nupcial, colunas que acabam antes
   * das outras».
   *
   * A conta que reparte as fotografias pelas colunas assume três por dois para
   * as que não têm medida guardada. A célula dessas mesmas fotografias não
   * reservava forma nenhuma e ficava com a altura natural do ficheiro — uma
   * coluna com duas fotos de retrato sem medida crescia o dobro do que a conta
   * julgava, e a outra acabava muito antes.
   *
   * Não era um defeito da repartição: eram as duas metades a usarem números
   * diferentes para a mesma fotografia.
   */
  it("uma foto sem medida guardada reserva a forma que a repartição lhe assumiu", () => {
    desenhar();
    const semForma = screen.getAllByRole("button", { name: /Ampliar/ })[1];
    // Três por dois deitada — o mesmo `ALTURA_POR_OMISSAO` que equilibra as
    // colunas. Deixá-la em branco era o que punha uma coluna a acabar antes.
    expect(semForma.style.aspectRatio).toBe("3 / 2");
  });

  it("só as primeiras entram ansiosas — 46 de uma vez é a conta que isto evita", () => {
    /*
     * Contadas pela POSIÇÃO DELA e não pela ordem no HTML.
     *
     * As colunas passaram a ser arrumadas para acabarem à mesma altura (ver
     * `arrumarPorColunas`), e uma fotografia pode saltar de coluna — o que
     * muda a ordem no documento sem mudar a posição dela na proposta. É a
     * posição que decide quem entra ansiosa, e é essa que aqui se conta; ler o
     * HTML por ordem media a arrumação, que é outra coisa.
     */
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c"] });
    const porPosicao = [...document.querySelectorAll("button[aria-label]")]
      .map((b) => {
        const n = /(\d+) de/.exec(b.getAttribute("aria-label") ?? "")?.[1];
        return { n: Number(n), modo: b.querySelector("img:last-of-type")?.getAttribute("loading") };
      })
      .sort((x, y) => x.n - y.n);
    expect(porPosicao.map((x) => x.modo)).toEqual([
      "eager",
      "eager",
      "eager",
      "eager",
      "lazy",
      "lazy",
    ]);
  });

  it("e o segundo mood board já não tem pressa nenhuma", () => {
    /**
     * ════════════════════════════════════════════════════════════════════
     * O DEFEITO QUE UM BOARD SÓ NUNCA PODIA MOSTRAR
     * ════════════════════════════════════════════════════════════════════
     *
     * O caso de cima desenha UM board. Com um board só, contar a posição
     * dentro do board e contar no documento dá exactamente o mesmo — e por
     * isso ele passava com a conta certa e com a conta errada.
     *
     * E a conta estava errada: o contador reiniciava em cada board. Numa
     * proposta de três boards saíam ONZE fotografias com pressa, das quais
     * UMA está no ecrã. Com os pesos que o `Inspiracao.tsx` tem medidos
     * (105,3 KB a 1200 px em AVIF), são 1 158 KB antes de a página servir
     * para alguma coisa — 6,2 s num 4G de 1,5 Mbps —, e a capa que o casal
     * está a ver fica em fila atrás de dez fotografias a quinze mil píxeis
     * de distância.
     *
     * Este caso desenha DOIS boards, que é o mínimo para a diferença
     * existir. Se alguém voltar a contar por board, as fotografias do
     * segundo voltam a nascer `eager` e isto fica vermelho.
     */
    const b1: BoardParaEcra = { ...BOARD, chave: "b1", fotos: ["a", "b", "c", "a"] };
    const b2: BoardParaEcra = { ...BOARD, chave: "b2", titulo: "Jantar", fotos: ["b", "c", "a"] };
    render(<Inspiracao boards={[b1, b2]} fotosIniciais={FOTOS} token="tk" textos={T} />);

    const modos = [...document.querySelectorAll("button[aria-label]")].map((b) =>
      b.querySelector("img:last-of-type")?.getAttribute("loading"),
    );
    // Quatro no total do documento, e não quatro por board.
    expect(
      modos.filter((m) => m === "eager").length,
      "voltou a contar por board: o casal descarrega fotografias que estão a metros de distância",
    ).toBe(4);
    // E as do segundo board — todas elas — esperam pela vez delas.
    const doSegundo = [...document.querySelectorAll("section")]
      .slice(1)
      .flatMap((sec) => [...sec.querySelectorAll("button[aria-label] img:last-of-type")])
      .map((i) => i.getAttribute("loading"));
    expect(doSegundo.length, "o segundo board não foi desenhado").toBeGreaterThan(0);
    expect(
      doSegundo.every((m) => m === "lazy"),
      "o segundo board ainda tem pressa",
    ).toBe(true);
  });
});

describe("a lupa", () => {
  it("abre no ORIGINAL — é o único sítio onde os pixéis todos valem os bytes", () => {
    desenhar();
    expect(lupa()).toBeNull();
    abrirPrimeira();
    expect(lupa()).not.toBeNull();
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
  });

  it("as setas do teclado andam, e não saem do board", () => {
    desenhar();
    abrirPrimeira();
    fireEvent.keyDown(document, { key: "ArrowRight" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
    // Na primeira, a seta para trás não faz nada — e não rebenta.
    fireEvent.keyDown(document, { key: "ArrowLeft" });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/a");
  });

  it("Escape fecha", () => {
    desenhar();
    abrirPrimeira();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(lupa()).toBeNull();
  });

  it("o gesto para o lado anda; um dedo a rolar não muda de fotografia", () => {
    desenhar();
    abrirPrimeira();
    const d = lupa()!;
    // Arrastar para a ESQUERDA = fotografia seguinte.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 200, clientY: 205 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    // CONTROLO POSITIVO da recusa: um movimento sobretudo VERTICAL — rolar —
    // não pode mudar de fotografia, mesmo passando a distância mínima.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 500 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 220, clientY: 100 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
    // E um toque trémulo, abaixo da distância mínima, também não.
    fireEvent.touchStart(d, { touches: [{ clientX: 300, clientY: 200 }] });
    fireEvent.touchEnd(d, { changedTouches: [{ clientX: 280, clientY: 202 }] });
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/b");
  });

  it("o foco entra no diálogo e volta ao sítio de onde saiu", () => {
    desenhar();
    const botao = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    botao.focus();
    fireEvent.click(botao);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: T.fechar }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.activeElement).toBe(botao);
  });

  it("a página por baixo não rola enquanto a lupa está aberta", () => {
    desenhar();
    abrirPrimeira();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).not.toBe("hidden");
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A NITIDEZ — dois tamanhos, e o navegador escolhe
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO: a grelha pedia SEMPRE a miniatura de 400 px. Num iPhone a fotografia
 * ocupa ~343 pontos e o ecrã tem três pixéis por ponto — pede ~1030. Era uma
 * imagem de 400 esticada duas vezes e meia, e ela viu-o: «essas imagens
 * parecem estar desfocadas, ou com pouca qualidade».
 *
 * Servir o original resolvia a nitidez e punha 120 MB numa página de 46
 * fotografias. A saída é uma terceira medida e um `srcset`.
 */
describe("a grelha oferece dois tamanhos", () => {
  it("o `srcset` traz a miniatura E a derivada intermédia, com as larguras", () => {
    desenhar();
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    expect(img.getAttribute("srcset")).toMatch(/400w/);
    expect(img.getAttribute("srcset")).toMatch(/1200w/);
  });

  it("a intermédia pede-se pelo id OPACO da foto, nunca por um caminho", () => {
    // A regra de sempre: uma rota que aceitasse caminhos serviria, com o token
    // de um casal, qualquer ficheiro da Biblioteca de Temas. O endereço que
    // ESTA página constrói leva o id do documento e mais nada — o caminho real
    // é resolvido do lado do servidor, a partir do token.
    desenhar();
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    const candidatos = (img.getAttribute("srcset") ?? "").split(",").map((c) => c.trim());
    const daRota = candidatos.find((c) => c.startsWith("/api/"));
    expect(daRota).toBe("/api/proposta/tk/foto/a 1200w");
  });

  it("diz que largura a fotografia OCUPA — senão o navegador pede sempre a maior", () => {
    desenhar();
    // A SEGUNDA célula: a primeira é o respiro, que ocupa a largura toda e
    // por isso tem um `sizes` seu. Esta é uma célula da grelha.
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[1].querySelector("img")!;
    expect(img.getAttribute("sizes")).toBe("(min-width: 640px) 46vw, 92vw");
  });

  it("depois de a primeira escolha falhar, o `srcset` SAI — e cai no degrau do meio", () => {
    // Senão o navegador voltava a escolher o candidato que acabou de falhar.
    desenhar();
    const img = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(img());
    expect(img().getAttribute("srcset")).toBeNull();
    /**
     * ── O PLANO B DEIXOU DE SER O ORIGINAL ────────────────────────────────
     *
     * Era `miniatura → original`, e o original numa caixa de 350 px são
     * 2 600 KB: 13,9 s num 4G de 1,5 Mbps, contra 0,56 s da derivada de
     * 1200 px. O degrau do meio existia e estava a ser saltado.
     *
     * Aqui a fotografia de teste não tem `media` assinada, portanto a
     * derivada é a rota que a fabrica — que é exactamente o que deve
     * acontecer nas fotografias anteriores ao bucket, ou seja nas propostas
     * antigas que estão nas caixas de correio dos casais.
     */
    expect(img().getAttribute("src")).toBe("/api/proposta/tk/foto/a");
    // E só se ESTA também falhar é que se paga o ficheiro inteiro.
    fireEvent.error(img());
    expect(img().getAttribute("src")).toBe("orig/a");
  });
});

describe("quando as assinaturas morrem", () => {
  /**
   * O botão de voltar a pedir as assinaturas SÓ existe depois de alguma coisa
   * falhar. Sempre à vista, numa proposta de vinte mil euros, dizia ao casal
   * que o estúdio conta com isto avariar.
   */
  it("o botão não existe enquanto está tudo bem", () => {
    desenhar();
    expect(screen.queryByRole("button", { name: T.recarregarFotos })).toBeNull();
  });

  it("aparece quando uma célula desiste", () => {
    desenhar();
    const img = screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    /**
     * TRÊS degraus, e não dois.
     *
     * A grelha deixou de cair da miniatura directamente para o original — o
     * ficheiro inteiro numa caixa de 350 px eram 13,9 s num 4G. Passa pela
     * derivada de 1200 px pelo caminho, portanto uma célula só desiste depois
     * de as TRÊS falharem: miniatura → 1200 px → original.
     *
     * Um teste que dispare dois erros não mede quem desistiu: mede quem ainda
     * está a tentar.
     */
    fireEvent.error(img);
    fireEvent.error(screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!);
    fireEvent.error(screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!);
    expect(screen.getByRole("button", { name: T.recarregarFotos })).toBeTruthy();
  });

  /**
   * ── E A CÉLULA DESAPARECE, EM SILÊNCIO ─────────────────────────────────
   *
   * Aqui havia um segundo botão, por célula, com o seu próprio rótulo. Palavras
   * dela, a olhar para uma proposta que já tinha seguido: «quatro barras
   * cinzentas com ícone de imagem quebrada onde devia estar a primeira foto. Um
   * cliente que veja isto conclui que a empresa é descuidada.»
   *
   * O aviso não desapareceu do produto — subiu para o pé da galeria, UMA vez,
   * que é onde serve: o caso comum é um separador aberto há seis horas com as
   * assinaturas caducadas, e um só botão resolve as vinte células de uma vez.
   */
  it("e a célula que desistiu SOME — nada de caixas cinzentas no mood board", () => {
    desenhar();
    const antes = screen.getAllByRole("button", { name: /Ampliar/ }).length;
    const cel = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.error(cel());
    expect(screen.getAllByRole("button", { name: /Ampliar/ }).length).toBe(antes - 1);
    expect(screen.queryByText(T.fotoFalhou)).toBeNull();
    expect(screen.queryByRole("button", { name: T.tentarDeNovo })).toBeNull();
  });

  it("o botão volta a pedi-las — e nunca manda um caminho ao servidor", async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({
        fotos: [{ id: "a", miniatura: "mini/a-nova", original: "orig/a-nova" }],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    desenhar();
    // Provocar a falha, que é o que faz o botão existir.
    const cel = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.error(cel());
    fireEvent.click(screen.getByRole("button", { name: T.recarregarFotos }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const url = String(fetchMock.mock.calls[0][0]);
    expect(url).toBe("/api/proposta/tk/fotos");
    // A regra: o cliente NUNCA nomeia um caminho. O pedido é o token e mais nada.
    expect(url).not.toContain("ref=");
    expect(url).not.toContain("path");
    await waitFor(() =>
      expect(
        screen
          .getAllByRole("button", { name: /Ampliar/ })[0]
          .querySelector("img")
          ?.getAttribute("src"),
      ).toBe("mini/a-nova"),
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS MOMENTOS DE RESPIRAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «A capa (arco em azulejo) é a única imagem grande da página.
 * Devia haver mais momentos assim, a separar secções: uma foto a toda a
 * largura entre blocos.»
 */
describe("o respiro que abre cada secção", () => {
  /** A célula do respiro é a primeira da secção — vem antes do título. */
  const oRespiro = () => screen.getAllByRole("button", { name: /Ampliar/ })[0];

  it("vem ANTES do título — é ele que separa o bloco anterior deste", () => {
    desenhar();
    const titulo = screen.getByRole("heading", { name: "Cerimónia" });
    // `compareDocumentPosition`: o respiro está antes do título no documento.
    expect(oRespiro().compareDocumentPosition(titulo)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it("ocupa a largura toda e tem tecto de altura", () => {
    // Uma foto ao alto a 1024 px de largura são 1500 px de altura: isso não é
    // um respiro, é um ecrã inteiro sem uma palavra.
    desenhar();
    expect(oRespiro().style.maxHeight).toBe("min(64vh, 560px)");
    expect(oRespiro().querySelector("img")?.getAttribute("sizes")).toBe(
      "(min-width: 1024px) 1024px, 100vw",
    );
  });

  it("a fotografia do respiro SAI da grelha — não se vê duas vezes", () => {
    desenhar();
    const fontes = screen
      .getAllByRole("button", { name: /Ampliar/ })
      .map((b) => b.querySelector("img")?.getAttribute("src"));
    expect(fontes).toEqual(["mini/a", "mini/b", "mini/c"]);
    // E o `mini/a` aparece UMA vez, não duas.
    expect(fontes.filter((f) => f === "mini/a")).toHaveLength(1);
  });

  it("é a que ela marcou como principal, quando marcou alguma", () => {
    desenhar({ ...BOARD, principal: 2 });
    expect(oRespiro().querySelector("img")?.getAttribute("src")).toBe("mini/c");
  });

  /**
   * Sem marca, o `destacada` devolve `null` — e essa decisão mantém-se para a
   * GRELHA. O que ela pediu aqui não foi um destaque: foi ar entre secções, em
   * TODAS. Sem marca, abre a primeira que resolve.
   */
  it("sem marca nenhuma, abre a primeira que resolve", () => {
    desenhar({ ...BOARD, fotos: ["semNada", "b", "c"] });
    // `semNada` não está no mapa: não resolve, e um respiro que desaparece
    // deixava o título encostado ao bloco anterior.
    expect(oRespiro().querySelector("img")?.getAttribute("src")).toBe("mini/b");
  });

  it("a lupa abre na fotografia certa a partir do respiro", () => {
    desenhar({ ...BOARD, principal: 2 });
    fireEvent.click(oRespiro());
    expect(fotoDaLupa()?.getAttribute("src")).toBe("orig/c");
  });

  it("um board sem uma única foto resolvida não inventa respiro nenhum", () => {
    desenhar({ ...BOARD, fotos: ["semNada"] });
    expect(screen.queryAllByRole("button", { name: /Ampliar/ })).toHaveLength(0);
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS COLUNAS ACABAM À MESMA ALTURA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «há buracos visíveis onde uma coluna acaba antes da outra».
 * E, posta a escolher entre a ordem de leitura e as colunas equilibradas —
 * porque numa página desenhada no servidor, sem JavaScript a medir o ecrã, é
 * uma coisa ou a outra: colunas equilibradas.
 *
 * A afirmação que vale por todas é a última: no telemóvel não se perde nada,
 * porque lá só há uma coluna e o `order` devolve a ordem dela.
 */
describe("as colunas da grelha", () => {
  /** As posições (1-based) de cada fotografia, pela ordem em que estão no HTML. */
  const posicoesNoHtml = () =>
    [...document.querySelectorAll("button[aria-label]")].map((b) =>
      Number(/(\d+) de/.exec(b.getAttribute("aria-label") ?? "")?.[1]),
    );

  it("uma fotografia salta de coluna para equilibrar — e é isso que se pediu", () => {
    // Duas altas seguidas iriam as duas para a mesma coluna se a arrumação
    // fosse alternada; com o equilíbrio, a segunda vai para a que está curta.
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c", "a", "b"] });
    // A ordem no HTML deixa de ser 1,2,3,4… — é essa a troca aceite.
    expect(posicoesNoHtml()).not.toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("nenhuma fotografia se perde nem se repete na arrumação", () => {
    // O modo de falha de um empacotamento é deixar uma de fora ou pô-la duas
    // vezes, e as duas coisas passam despercebidas numa grelha de quarenta.
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c", "a", "b"] });
    expect([...posicoesNoHtml()].sort((x, y) => x - y)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("no telemóvel, o `order` devolve a ordem dela", () => {
    // Abaixo de `sm` as colunas desaparecem (`display: contents`) e as
    // fotografias passam a ser irmãs. Sem o `order`, o telemóvel mostrava-as
    // pela ordem do empacotamento — que é uma perda paga sem nada em troca,
    // porque numa coluna só não há nada para equilibrar.
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c", "a", "b"] });
    const ordens = [...document.querySelectorAll("figure")].map((f) =>
      Number((f as HTMLElement).style.order),
    );
    // Cada fotografia leva a SUA posição, e não a da célula onde calhou.
    expect([...ordens].sort((x, y) => x - y)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(ordens).toEqual(posicoesNoHtml().map((n) => n - 1));
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TÍTULO NÃO FICA SOZINHO POR CIMA DO VAZIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A dona do negócio abriu a proposta a sério no telemóvel dela e mandou o que
 * viu: um RECTÂNGULO CINZENTO, sem fotografia nenhuma, com «Saída dos noivos»
 * escrito por cima.
 *
 * ── PORQUE É QUE A REDE QUE JÁ EXISTIA NÃO O APANHOU ──────────────────────
 *
 * O ficheiro já dizia a coisa certa, por extenso: «um título branco sobre nada
 * nenhum é o defeito que isto existe para não ter». Mas essa guarda é o
 * `respiro()`, que corre no servidor e pergunta se a fotografia TEM endereço.
 * Tinha. O que falhou foi o endereço, já com a página desenhada — uma
 * assinatura expirada, uma derivada por fabricar.
 *
 * Aí a célula desiste e devolve nada, e a faixa do título, que é IRMÃ dela e
 * não filha, continua desenhada: o véu escuro sobre o papel branco dá o
 * cinzento, e o nome por cima dele.
 *
 * Havia dois caminhos para o mesmo sítio e só um estava tapado.
 */
describe("quando a fotografia do momento falha depois de a página abrir", () => {
  /** O título como faixa branca sobre a fotografia. */
  const tituloSobreFoto = () =>
    [...document.querySelectorAll("h3")].find((h) => h.className.includes("text-white"));
  /** O mesmo título, a preto sobre o papel. */
  const tituloSobrePapel = () =>
    [...document.querySelectorAll("h3")].find((h) => h.className.includes("text-foreground/90"));

  it("começa com o nome por cima da fotografia, como foi desenhado", () => {
    desenhar();
    expect(tituloSobreFoto()?.textContent).toBe("Cerimónia");
    expect(tituloSobrePapel()).toBeUndefined();
  });

  it("e quando ela falha, o nome volta ao papel em vez de ficar sobre o vazio", async () => {
    desenhar();
    // A fotografia do momento — a primeira, a que abre a secção — rebenta.
    // DUAS vezes: a célula tem plano B (miniatura → original) e só desiste
    // depois de o segundo endereço também falhar.
    const doMomento = () => document.querySelector("img:not([aria-hidden])") as HTMLImageElement;
    expect(doMomento(), "não encontrei a fotografia do momento").toBeTruthy();
    fireEvent.error(doMomento());
    fireEvent.error(doMomento());
    fireEvent.error(doMomento());

    await waitFor(() => {
      expect(tituloSobrePapel()?.textContent, "o nome tinha de voltar a preto sobre o papel").toBe(
        "Cerimónia",
      );
    });
    expect(
      tituloSobreFoto(),
      "ficou uma faixa de título branca por cima de coisa nenhuma — é este o defeito",
    ).toBeUndefined();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O RITMO ENTRE MOOD BOARDS — «os buracos brancos», palavras dela
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num 390×844, com oito boards de tamanhos diferentes. Duas coisas
 * estavam erradas, e são diferentes uma da outra:
 *
 * 1. O intervalo entre dois boards era de 96 px, e o intervalo entre dois
 *    CAPÍTULOS do documento — «Serviços» e «Orçamento Proposto» — é de 64.
 *    Um board é uma parte DENTRO do capítulo «Inspiração»; separá-lo do
 *    vizinho com vez e meia o que separa dois capítulos diz ao olho que ali
 *    acabou coisa maior do que acabou.
 *
 * 2. Num board cuja ÚNICA fotografia é o respiro, o intervalo era 132 e não
 *    96. Os 36 px a mais eram o `mb-9` do respiro a separá-lo de uma grelha
 *    VAZIA. Um ritmo com um intervalo diferente dos outros não é um ritmo.
 */
describe("o ritmo entre mood boards", () => {
  /** Um board de uma fotografia só: a do respiro. É o caso que media 132. */
  const SO_O_RESPIRO: BoardParaEcra = { ...BOARD, chave: "so-um", fotos: ["a"] };

  it("um board de uma só fotografia não desenha grelha nenhuma", () => {
    desenhar(SO_O_RESPIRO);
    // A grelha é o `flex` que segura as colunas. Sem fotografias fora do
    // respiro não há nada para ela segurar — e uma caixa vazia com margem é
    // exactamente o buraco que isto existe para não ter.
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    expect(botoes).toHaveLength(1);
    const grelha = document.querySelector(".flex.flex-col.gap-4");
    expect(grelha, "a grelha vazia continua a ser desenhada").toBeNull();
  });

  it("CONTROLO POSITIVO: com fotografias fora do respiro, a grelha existe", () => {
    // Sem isto, um selector errado dava `null` nos dois casos e o teste acima
    // passava sem provar nada.
    desenhar();
    expect(document.querySelector(".flex.flex-col.gap-4")).not.toBeNull();
  });

  it("o afastamento até à grelha é da GRELHA, não do respiro", () => {
    // Estava no respiro (`mb-9`), e por isso sobrava quando não havia grelha.
    desenhar();
    const respiro = screen.getAllByRole("button", { name: /Ampliar/ })[0];
    const caixaDoRespiro = respiro.closest("div");
    expect(caixaDoRespiro?.className, "o respiro voltou a levar margem de baixo").not.toMatch(
      /\bmb-\d/,
    );
    expect(document.querySelector(".flex.flex-col.gap-4")?.className).toMatch(/\bmt-9\b/);
  });
});

/**
 * A hierarquia, lida do CÓDIGO dos dois ficheiros.
 *
 * O teste acima mede uma árvore desenhada; este mede a REGRA, e é a que se
 * desfaz sem ninguém dar por isso — basta alguém subir um número achando que
 * «fica com mais ar». O intervalo entre duas partes de um capítulo não pode
 * passar o intervalo entre dois capítulos.
 */
describe("um mood board é uma parte do capítulo, não um capítulo", () => {
  const RAIZ = process.cwd();
  const AQUI = "src/app/[lang]/(privado)/proposta/[token]";
  const ler = (f: string) => readFileSync(join(RAIZ, `${AQUI}/${f}`), "utf8");
  /**
   * O degrau de `margin-top` da primeira `<section>` de um ficheiro.
   *
   * Lê a ETIQUETA DE ABERTURA inteira e não um `className="…"`: o
   * `Documento.tsx` escreve o dele num template literal, e uma expressão
   * regular à espera de aspas devolvia `null` — que se compara com tudo sem
   * reclamar. Foi o controlo positivo aqui em baixo que o apanhou.
   *
   * O `(?<![\w:-])` exclui as variantes: sem ele, o `first:mt-6` da
   * Inspiração passava por ser o afastamento normal.
   */
  const degrau = (fonte: string) => {
    const i = fonte.indexOf("<section");
    if (i < 0) return null;
    const etiqueta = fonte.slice(i, fonte.indexOf(">", i));
    const mt = etiqueta.match(/(?<![\w:-])mt-(\d+)\b/);
    const sm = etiqueta.match(/\bsm:mt-(\d+)\b/);
    return { mt: mt ? Number(mt[1]) : null, sm: sm ? Number(sm[1]) : null };
  };

  it("CONTROLO POSITIVO: os dois números foram mesmo lidos", () => {
    // Uma leitura falhada devolve `null`, e `null` compara-se com tudo sem
    // reclamar — era o silêncio que este controlo impede.
    expect(degrau(ler("Documento.tsx"))).toEqual({ mt: 16, sm: 24 });
    expect(degrau(ler("Inspiracao.tsx"))).toEqual({ mt: 12, sm: 16 });
  });

  it("o intervalo entre boards não passa o intervalo entre capítulos", () => {
    const capitulo = degrau(ler("Documento.tsx"))!;
    const board = degrau(ler("Inspiracao.tsx"))!;
    expect(board.mt, `board ${board.mt} > capítulo ${capitulo.mt} no telemóvel`).toBeLessThan(
      capitulo.mt!,
    );
    expect(board.sm, `board ${board.sm} > capítulo ${capitulo.sm} no ecrã largo`).toBeLessThan(
      capitulo.sm!,
    );
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A OFERTA EM AVIF — «quero que as fotos sejam muito mais rápidas a carregar»
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO com o `sharp` deste projecto e seis fotografias reais do sítio, média
 * por fotografia:
 *
 *     lado    webp      avif     densidade num telemóvel de 390 pt
 *      400   22,5 KB   17,2 KB    1,1x
 *     1200  130,1 KB  105,3 KB    3,3x   ← a que o telemóvel escolhe
 *
 * Numa proposta de quarenta e seis: 5,8 MB em WebP contra 4,7 MB em AVIF.
 *
 * ── A ARMADILHA QUE O `media` EVITA, E QUE ESTE FICHEIRO GUARDA ──────────
 *
 * Um `<source>` que casa DESLIGA o `srcset` do `<img>`. Como a oferta só tem
 * o candidato de 1200, num ecrã de densidade 1 — onde o navegador escolheria a
 * de 400, que pesa 22 KB — servir a de 1200 em AVIF seria CINCO VEZES PIOR.
 *
 * O `media="(min-resolution: 2dppx)"` é o que garante que a oferta só existe
 * onde a de 1200 já era a escolhida. Tirá-lo faz cair um teste aqui.
 */
describe("a oferta em AVIF das fotografias grandes", () => {
  const COM_AVIF: Record<string, FotoDaProposta> = {
    a: { ...FOTOS.a, media: "media/a", mediaAvif: "avif/a" },
    b: FOTOS.b,
    c: FOTOS.c,
  };
  const comAvif = () =>
    render(<Inspiracao boards={[BOARD]} fotosIniciais={COM_AVIF} token="tk" textos={T} />);

  it("CONTROLO POSITIVO: sem `mediaAvif` não se propõe nada, e a página desenha na mesma", () => {
    // É o caso NORMAL de tudo o que foi carregado antes do bucket existir.
    // Sem este controlo, um `<picture>` que nunca propusesse nada passava no
    // teste de baixo por dizer o mesmo que uma implementação a funcionar.
    desenhar();
    expect(document.querySelectorAll("source")).toHaveLength(0);
    expect(screen.getAllByRole("button", { name: /Ampliar/ }).length).toBeGreaterThan(0);
  });

  it("propõe o AVIF quando ele existe, e o `<img>` de sempre continua lá", () => {
    comAvif();
    const fonte = document.querySelector('source[type="image/avif"]');
    expect(fonte, "não se propôs AVIF nenhum").not.toBeNull();
    expect(fonte!.getAttribute("srcset")).toBe("avif/a");
    // A oferta NÃO substitui: o `<img>` tem de continuar a ser servível.
    const imagem = fonte!.parentElement!.querySelector("img");
    expect(imagem?.getAttribute("src")).toBe("mini/a");
  });

  /**
   * A OFERTA NÃO VALE EM TODO O LADO — E O NÚMERO MUDOU, DE PROPÓSITO.
   *
   * Este caso guardava `2dppx`. O portão desceu para `1,5`, e vale a pena
   * dizer porquê em vez de trocar o número em silêncio.
   *
   * A razão do portão nunca foi o «2»: é a FRONTEIRA a partir da qual o
   * navegador já escolhia a de 1200 sozinho. Abaixo dela ele escolheria a de
   * 400 (22 KB) e nós passaríamos a impor-lhe a de 1200 em AVIF (105 KB) —
   * cinco vezes pior, exactamente ao contrário do que isto existe para fazer.
   * Refeita a conta com as fatias que esta casa serve, essa fronteira é
   * 1,36 dppx (a pior é a grelha a 92vw num ecrã de 320 pontos). O 2 era
   * prudente de mais: deixava de fora um portátil Windows a 150% de escala,
   * que reporta exactamente 1,5 — que é como se vê uma proposta num
   * escritório.
   *
   * O número em si passou a ser guardado onde a conta vive, e não aqui:
   * `portao-do-avif.test.ts` REFAZ a fronteira a partir das `sizes` do código
   * e reprova se o portão ficar abaixo dela. Um número pregado não sabe porque
   * é que está certo — no dia em que alguém alargar uma fatia, a fronteira
   * mexe-se e só a conta dá por isso.
   *
   * O que fica aqui é o que este ficheiro é responsável por guardar: que a
   * oferta TEM um portão, e que ele não casa num ecrã de densidade 1.
   */
  it("A OFERTA NÃO VALE NUM ECRÃ DE DENSIDADE 1", () => {
    comAvif();
    const fonte = document.querySelector('source[type="image/avif"]');
    const media = fonte!.getAttribute("media") ?? "";
    const dppx = Number(media.match(/min-resolution:\s*([\d.]+)dppx/)?.[1]);
    expect(media, "a oferta em AVIF deixou de ter portão nenhum").toMatch(/min-resolution/);
    expect(dppx, "o portão passou a casar num ecrã de densidade 1").toBeGreaterThan(1);
  });

  it("sem `srcset` no `<img>` não há oferta — a cascata já caiu para o plano B", () => {
    /**
     * Depois de a cascata cair para o original, o que interessa é servir ALGUMA
     * COISA. Uma oferta em AVIF nessa altura era deixar o navegador voltar a
     * escolher por conta própria, quando a primeira escolha acabou de falhar.
     */
    const soOriginal: Record<string, FotoDaProposta> = {
      a: { id: "a", original: "orig/a", mediaAvif: "avif/a" },
    };
    render(
      <Inspiracao
        boards={[{ ...BOARD, fotos: ["a"] }]}
        fotosIniciais={soOriginal}
        token="tk"
        textos={T}
      />,
    );
    expect(document.querySelectorAll('source[type="image/avif"]')).toHaveLength(0);
  });
});
