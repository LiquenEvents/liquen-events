// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CORTES } from "./adaptativo";
import { FolhaOuDialogo } from "./FolhaOuDialogo";
import { TabelaOuCartoes } from "./TabelaOuCartoes";
import { MenuDeAccoes } from "./MenuDeAccoes";
import { porExtenso, CampoData } from "./CampoData";

/**
 * As fundações adaptativas. O que estes testes guardam não é o aspecto — é a
 * regra que faz a diferença entre adaptar e esticar, e que se perde na primeira
 * refactorização distraída.
 */

/**
 * Um `matchMedia` falso que responde a partir de uma largura e de um ponteiro.
 * O jsdom não tem nenhum: sem isto, tudo dá `false` e os testes passavam a
 * afirmar apenas o comportamento por omissão.
 */
function simularAparelho({ largura, toque }: { largura: number; toque: boolean }) {
  const ouvintes = new Set<() => void>();
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("hover: hover")
        ? !toque
        : mq.includes("pointer: coarse")
          ? toque
          : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: (_: string, cb: () => void) => ouvintes.add(cb),
      removeEventListener: (_: string, cb: () => void) => ouvintes.delete(cb),
      addListener: (cb: () => void) => ouvintes.add(cb),
      removeListener: (cb: () => void) => ouvintes.delete(cb),
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

const TELEMOVEL = { largura: 375, toque: true };
const DESKTOP = { largura: 1440, toque: false };
/** O caso que a decisão "largura decide o layout, ponteiro decide os alvos"
 *  existe para acertar: largo E de dedo. */
const IPAD = { largura: 1024, toque: true };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("os pontos de corte", () => {
  it("são os três decididos, e não os do Tailwind", () => {
    expect(CORTES).toEqual({ telemovel: 640, desktop: 1024, largo: 1440 });
    // `md` (768) e `xl` (1280) ficam de fora de propósito: dois sistemas a
    // competir é como um ecrã acaba com três colunas a 800 px e duas a 900.
    expect(Object.values(CORTES)).not.toContain(768);
    expect(Object.values(CORTES)).not.toContain(1280);
  });
});

describe("FolhaOuDialogo", () => {
  const abrir = (props: Partial<Parameters<typeof FolhaOuDialogo>[0]> = {}) =>
    render(
      <FolhaOuDialogo aberto onFechar={props.onFechar ?? (() => {})} titulo="Escolher fotos">
        <p>conteúdo</p>
      </FolhaOuDialogo>,
    );

  it("é sempre um diálogo modal com nome, seja qual for a forma", async () => {
    simularAparelho(TELEMOVEL);
    abrir();
    const caixa = await screen.findByRole("dialog", { name: "Escolher fotos" });
    // A FORMA muda; o contrato de acessibilidade não. Ter duas implementações a
    // sério significava duas maneiras de esquecer uma delas.
    expect(caixa).toHaveAttribute("aria-modal", "true");
  });

  it("no telemóvel encosta ao fundo; no computador fica centrada", async () => {
    simularAparelho(TELEMOVEL);
    const { unmount } = abrir();
    await waitFor(() => expect(screen.getByRole("dialog").className).toContain("mt-auto"));
    unmount();

    simularAparelho(DESKTOP);
    abrir();
    await waitFor(() => expect(screen.getByRole("dialog").className).toContain("m-auto"));
  });

  /** O gesto é um atalho, não a única saída: quem usa teclado ou leitor de ecrã
   *  não arrasta nada. */
  it("tem sempre um botão de fechar, mesmo onde há gesto", async () => {
    simularAparelho(TELEMOVEL);
    const onFechar = vi.fn();
    abrir({ onFechar });
    fireEvent.click(await screen.findByRole("button", { name: "Fechar" }));
    expect(onFechar).toHaveBeenCalled();
  });

  it("Escape fecha", async () => {
    simularAparelho(DESKTOP);
    const onFechar = vi.fn();
    abrir({ onFechar });
    await screen.findByRole("dialog");
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFechar).toHaveBeenCalled();
  });
});

describe("TabelaOuCartoes", () => {
  const ITENS = [
    { id: "a", nome: "Ana e Bruno", pax: 120 },
    { id: "b", nome: "Carla e Diogo", pax: 80 },
  ];
  const COLUNAS = [
    { chave: "nome", cabecalho: "Casal", celula: (i: (typeof ITENS)[0]) => i.nome },
    {
      chave: "pax",
      cabecalho: "Convidados",
      celula: (i: (typeof ITENS)[0]) => i.pax,
      ordenar: (a: (typeof ITENS)[0], b: (typeof ITENS)[0]) => a.pax - b.pax,
    },
  ];
  const desenhar = (aoAbrir?: (i: (typeof ITENS)[0]) => void) =>
    render(
      <TabelaOuCartoes
        itens={ITENS}
        chaveDe={(i) => i.id}
        colunas={COLUNAS}
        cartao={(i) => <span>{i.nome}</span>}
        aoAbrir={aoAbrir}
        legenda="Pedidos"
      />,
    );

  it("no computador é uma tabela a sério", async () => {
    simularAparelho(DESKTOP);
    desenhar();
    await waitFor(() => expect(screen.getByRole("table", { name: "Pedidos" })).toBeInTheDocument());
  });

  it("no telemóvel não há tabela nenhuma — há uma lista de cartões", async () => {
    simularAparelho(TELEMOVEL);
    desenhar();
    await waitFor(() => expect(screen.getByRole("list", { name: "Pedidos" })).toBeInTheDocument());
    // Uma tabela de seis colunas a 375 px ou ganha scroll horizontal ou parte o
    // texto em três linhas. Nos dois casos deixa de se poder varrer com os olhos.
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  /** Clicar na linha é comodidade do rato; sem um controlo a sério a tabela era
   *  inutilizável por teclado — o defeito mais fácil de introduzir aqui. */
  it("a primeira célula é um botão quando a linha abre alguma coisa", async () => {
    simularAparelho(DESKTOP);
    const aoAbrir = vi.fn();
    desenhar(aoAbrir);
    fireEvent.click(await screen.findByRole("button", { name: "Ana e Bruno" }));
    expect(aoAbrir).toHaveBeenCalledWith(ITENS[0]);
  });

  it("ordena por uma coluna e diz por onde está ordenada", async () => {
    simularAparelho(DESKTOP);
    desenhar();
    fireEvent.click(await screen.findByRole("button", { name: /Convidados/ }));
    await waitFor(() => {
      const th = screen.getByRole("columnheader", { name: /Convidados/ });
      expect(th).toHaveAttribute("aria-sort", "ascending");
    });
    const celulas = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(celulas[0]).toBe("Carla e Diogo"); // 80 antes de 120
  });
});

describe("MenuDeAccoes", () => {
  const ACCOES = [
    { id: "dup", rotulo: "Duplicar", onAccao: vi.fn() },
    { id: "del", rotulo: "Eliminar", onAccao: vi.fn(), destrutiva: true },
  ];

  /**
   * A regra que este componente existe para aplicar: num ecrã táctil, "aparece
   * no hover" quer dizer "não existe".
   */
  it("num ecrã de dedo, as acções estão visíveis — nunca escondidas no hover", async () => {
    simularAparelho(TELEMOVEL);
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" soltasNoEcraGrande={1} />);
    const duplicar = await screen.findByRole("button", { name: "Duplicar" });
    expect(duplicar.className).toContain("opacity-100");
    expect(duplicar.className).not.toContain("opacity-0");
  });

  it("com rato, escondem-se até se passar por cima", async () => {
    simularAparelho(DESKTOP);
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" soltasNoEcraGrande={1} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Duplicar" }).className).toContain(
        "opacity-0 group-hover:opacity-100",
      ),
    );
  });

  /**
   * Um iPad é largo E de dedo. Esconder por LARGURA acertava nos dois casos
   * comuns e falhava exactamente neste.
   *
   * A asserção é sobre `opacity-0` e NÃO sobre `opacity-100`: a variante
   * escondida é `opacity-0 group-hover:opacity-100`, ou seja contém a cadeia
   * "opacity-100" na mesma. Procurar por ela dava um teste que passava dos dois
   * lados — foi o que aconteceu à primeira versão deste ficheiro, e só se viu
   * ao partir o código de propósito para o ver falhar.
   */
  it("um tablet com dedo conta como dedo, mesmo sendo largo", async () => {
    simularAparelho(IPAD);
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" soltasNoEcraGrande={1} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Duplicar" }).className).not.toContain("opacity-0"),
    );
  });

  it("o menu tem nome próprio — dez na mesma página não se chamam todos 'Acções'", async () => {
    simularAparelho(TELEMOVEL);
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" />);
    expect(await screen.findByRole("button", { name: "Acções de Terracotta" })).toBeInTheDocument();
  });
});

describe("CampoData", () => {
  /**
   * `new Date("2027-09-18")` é lida como UTC, e em Portugal no Verão isso dá o
   * dia ANTERIOR às 23h — o campo mostrava um dia diferente do que lá estava
   * escrito.
   */
  it("lê a data no fuso local, não em UTC", () => {
    const lida = porExtenso("2027-09-18");
    expect(lida?.texto).toContain("18");
    expect(lida?.texto).toContain("setembro");
    expect(lida?.diaDaSemana).toBe(6); // é mesmo um sábado
  });

  it("não inventa nada a partir de lixo", () => {
    expect(porExtenso("")).toBeNull();
    expect(porExtenso("18/09/2027")).toBeNull();
  });

  /** O engano que quase passou na importação dos casamentos de 2027: uma
   *  quinta-feira no meio de sábados. Assinala, não impede. */
  it("avisa quando o casamento não cai no dia esperado", () => {
    simularAparelho(DESKTOP);
    render(<CampoData label="Data" value="2027-06-10" onChange={() => {}} diaEsperado={6} />);
    expect(screen.getByText(/é uma quinta, confirme/)).toBeInTheDocument();
  });

  it("num sábado não avisa nada", () => {
    simularAparelho(DESKTOP);
    render(<CampoData label="Data" value="2027-09-18" onChange={() => {}} diaEsperado={6} />);
    expect(screen.queryByText(/confirme/)).not.toBeInTheDocument();
  });
});
