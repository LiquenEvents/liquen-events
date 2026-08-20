// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import Inspiracao, { type BoardParaEcra } from "./Inspiracao";
import type { FotoDaProposta } from "@/lib/proposta-fotos";
import { textosDaPagina } from "./textos-da-pagina";

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
    // CONTROLO POSITIVO: a que NÃO tem forma guardada não inventa nenhuma. Sem
    // esta metade, um `aspectRatio` fixo escrito à mão passava o teste de cima.
    const semForma = screen.getAllByRole("button", { name: /Ampliar/ })[1];
    expect(semForma.style.aspectRatio).toBe("");
  });

  it("só as primeiras entram ansiosas — 46 de uma vez é a conta que isto evita", () => {
    desenhar({ ...BOARD, fotos: ["a", "b", "c", "a", "b", "c"] });
    const modos = [...document.querySelectorAll("img")].map((i) => i.getAttribute("loading"));
    expect(modos.slice(0, 4)).toEqual(["eager", "eager", "eager", "eager"]);
    expect(modos.slice(4)).toEqual(["lazy", "lazy"]);
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

  it("depois de a primeira escolha falhar, o `srcset` SAI", () => {
    // Senão o navegador voltava a escolher o candidato que acabou de falhar.
    desenhar();
    const img = () => screen.getAllByRole("button", { name: /Ampliar/ })[0].querySelector("img")!;
    fireEvent.error(img());
    expect(img().getAttribute("srcset")).toBeNull();
    // E o `src` é o plano B, que é o que continua a mostrar alguma coisa.
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
    // A miniatura falha, cai para o original, o original falha: desistiu.
    fireEvent.error(img);
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
