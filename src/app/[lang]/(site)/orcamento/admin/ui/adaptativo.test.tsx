// @vitest-environment jsdom
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
  /**
   * Puxar a pega para baixo. A pega é o primeiro filho da folha de propósito —
   * o gesto começa nela e não no conteúdo, senão competia com o scroll da lista
   * lá dentro. O `setPointerCapture` do jsdom não existe em todas as versões;
   * um nada serve, porque o que se exercita é o cálculo do arrasto.
   */
  function arrastarPega(caixa: HTMLElement, px: number) {
    const pega = caixa.firstElementChild as HTMLElement;
    pega.setPointerCapture ??= () => {};
    fireEvent.pointerDown(pega, { clientY: 0, pointerId: 1 });
    fireEvent.pointerMove(pega, { clientY: px, pointerId: 1 });
    fireEvent.pointerUp(pega, { clientY: px, pointerId: 1 });
  }

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

  /**
   * ── `bloqueado`: SE FALHAR, NÃO PERDER TRABALHO ──────────────────────────
   *
   * Uma fusão de temas ou uma cópia de 300 fotos correm em voltas de rede.
   * Cada volta é atómica, mas o que fica de uma interrompida é um tema com
   * menos fotos e outro com mais — trabalho pelo meio. Num telemóvel isto não
   * é hipotético: o fundo é uma faixa estreita à volta da folha e o gesto de
   * voltar do iPhone faz-se sem se pensar nele.
   *
   * As TRÊS saídas de atalho são fechadas de uma vez, e é por isso que passam
   * todas pelo mesmo sítio no primitivo: espalhadas por quatro `if`, esquecer
   * uma não dá erro nenhum — dá uma fusão interrompida, uma vez em cada dez.
   */
  it("bloqueado: nem o fundo, nem o Escape, nem o arrasto fecham", async () => {
    simularAparelho(TELEMOVEL);
    const onFechar = vi.fn();
    render(
      <FolhaOuDialogo aberto onFechar={onFechar} titulo="A juntar" bloqueado>
        <p>conteúdo</p>
      </FolhaOuDialogo>,
    );
    const caixa = await screen.findByRole("dialog");

    fireEvent.keyDown(document, { key: "Escape" });
    fireEvent.mouseDown(caixa.parentElement as HTMLElement);
    arrastarPega(caixa, 200);
    expect(onFechar).not.toHaveBeenCalled();

    // E o «×» fica desactivado — é o que os diálogos escritos à mão já faziam.
    // A saída não desaparece: fica nas `accoes`, que é onde o «Parar» vive.
    expect(screen.getByRole("button", { name: "Fechar" })).toBeDisabled();
  });

  /** O contraste do teste acima: sem `bloqueado` o mesmo gesto fecha. Sem
   *  isto, aquele passava com um arrasto que nunca chegou a funcionar. */
  it("o arrasto para baixo fecha a folha", async () => {
    simularAparelho(TELEMOVEL);
    const onFechar = vi.fn();
    abrir({ onFechar });
    const caixa = await screen.findByRole("dialog");
    arrastarPega(caixa, 200);
    expect(onFechar).toHaveBeenCalled();
  });

  /** O sobretítulo não é decoração: sem ele, «312 fotos» era o nome inteiro da
   *  caixa, e quem ouve o ecrã não sabia o que ia acontecer a elas. */
  it("o sobretítulo entra no nome acessível, junto com o título", async () => {
    simularAparelho(DESKTOP);
    render(
      <FolhaOuDialogo aberto onFechar={() => {}} sobretitulo="Juntar “Itália” a" titulo="312 fotos">
        <p>conteúdo</p>
      </FolhaOuDialogo>,
    );
    // O nome vem do que está ESCRITO no cabeçalho, e não de uma cópia paralela
    // numa `aria-label` que ninguém se lembra de actualizar com o texto.
    await screen.findByRole("dialog", { name: "Juntar “Itália” a 312 fotos" });
  });

  /**
   * As camadas desta casa estão ordenadas entre si: avisos passageiros a 80,
   * paleta de comandos a 90, barreira da sessão expirada a 110 — e a gaveta do
   * pedido a 50, mas DEPOIS destes diálogos na árvore. Com o mesmo nível é ela
   * que fica por cima, e o diálogo abre por trás dela.
   */
  it("empilha-se no nível que quem chama pedir, e a 50 por omissão", async () => {
    simularAparelho(DESKTOP);
    const { unmount } = abrir();
    const porOmissao = (await screen.findByRole("dialog")).parentElement as HTMLElement;
    expect(porOmissao.style.zIndex).toBe("50");
    unmount();

    render(
      <FolhaOuDialogo aberto onFechar={() => {}} titulo="Os meus dispositivos" nivel={95}>
        <p>conteúdo</p>
      </FolhaOuDialogo>,
    );
    const acima = (await screen.findByRole("dialog")).parentElement as HTMLElement;
    expect(acima.style.zIndex).toBe("95");
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
   * ── A REGRA MUDOU DE LÍNGUA, E OS TESTES TÊM DE MUDAR COM ELA ─────────────
   *
   * A pergunta é a mesma — «há rato?» — mas deixou de ser feita em JavaScript
   * (`usePodeEsconderNoHover()`) e passou a ser feita em CSS (`com-rato:`, em
   * globals.css). O motivo está medido lá: o hook devolve `false` no servidor,
   * portanto o primeiro desenho no computador mostrava as acções todas e o
   * segundo escondia-as — um piscar por linha, em cada carregamento.
   *
   * O jsdom não avalia media queries sobre classes, por isso o que estes três
   * testes afirmam é o CONTRATO das classes. Cada um guarda uma metade
   * diferente da regra, e nenhum deles passa por acidente.
   */

  /** As classes NÃO podem depender do aparelho: é essa a diferença entre a
   *  decisão estar no CSS e estar no JavaScript, e é o que impede o piscar. */
  it("as classes são as mesmas no telemóvel, no iPad e no computador", async () => {
    const lidas: string[] = [];
    for (const aparelho of [TELEMOVEL, IPAD, DESKTOP]) {
      simularAparelho(aparelho);
      render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" soltasNoEcraGrande={1} />);
      lidas.push((await screen.findByRole("button", { name: "Duplicar" })).className);
      cleanup();
    }
    expect(new Set(lidas).size).toBe(1);
  });

  /**
   * A acção é VISÍVEL POR OMISSÃO, e o esconderijo é só uma variante por cima.
   *
   * A asserção olha para a classe INTEIRA e não para um pedaço dela: a cadeia
   * "opacity-0" também aparece dentro de "com-rato:opacity-0", por isso um
   * `toContain` passava dos dois lados e não guardava nada. Foi este o engano
   * da primeira versão deste ficheiro, e só se viu ao partir o código de
   * propósito para o ver falhar.
   */
  it("a acção é visível por omissão — o esconderijo é que é a excepção", async () => {
    simularAparelho(TELEMOVEL);
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" soltasNoEcraGrande={1} />);
    const classes = (await screen.findByRole("button", { name: "Duplicar" })).className.split(
      /\s+/,
    );
    expect(classes).toContain("opacity-100");
    expect(classes).not.toContain("opacity-0");
    expect(classes).toContain("com-rato:opacity-0");
    expect(classes).toContain("com-rato:group-hover:opacity-100");
  });

  /**
   * E o esconderijo pergunta pelo PONTEIRO, não pela largura.
   *
   * Sem este teste, `com-rato` podia ser redefinido como `(min-width: 640px)`
   * e os dois de cima continuavam verdes — o iPad em retrato voltava a perder
   * as acções todas e ninguém dava por isso. É a ponta que fecha o par: o nome
   * da variante aqui, a media query em globals.css.
   */
  it("«com rato» é uma pergunta sobre o ponteiro, e não sobre a largura", async () => {
    // Caminho a partir da raiz do projecto: no jsdom o `import.meta.url` não é
    // um `file:`, portanto um URL relativo não resolve.
    const css = await readFile(join(process.cwd(), "src/app/globals.css"), "utf8");
    const linha = css.split("\n").find((l) => l.startsWith("@custom-variant com-rato"));
    expect(linha, "globals.css tem de definir a variante `com-rato`").toBeTruthy();
    expect(linha).toContain("hover: hover");
    expect(linha).toContain("pointer: fine");
    expect(linha).not.toContain("width");
  });

  it("o menu tem nome próprio — dez na mesma página não se chamam todos 'Acções'", async () => {
    simularAparelho(TELEMOVEL);
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" />);
    expect(await screen.findByRole("button", { name: "Acções de Terracotta" })).toBeInTheDocument();
  });

  /**
   * ── O FOCO TEM DE VOLTAR AO BOTÃO QUE ABRIU ────────────────────────────────
   *
   * As duas saídas do menu — o Escape e escolher uma acção — apagam o elemento
   * que tinha o foco. Sem o devolver, ele cai no `<body>` e o Tab seguinte
   * recomeça no princípio da página: numa tabela de trinta linhas isso quer
   * dizer voltar a percorrê-las todas para chegar à linha onde se estava.
   */
  it("o Escape fecha e devolve o foco ao botão que abriu", async () => {
    simularAparelho(TELEMOVEL);
    const user = userEvent.setup();
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" />);

    const abridor = await screen.findByRole("button", { name: "Acções de Terracotta" });
    await user.click(abridor);
    await user.tab();
    expect(screen.getByRole("menuitem", { name: "Duplicar" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(abridor).toHaveFocus();
  });

  it("escolher uma acção fecha e devolve o foco ao botão que abriu", async () => {
    simularAparelho(TELEMOVEL);
    const user = userEvent.setup();
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" />);

    const abridor = await screen.findByRole("button", { name: "Acções de Terracotta" });
    await user.click(abridor);
    await user.click(screen.getByRole("menuitem", { name: "Duplicar" }));

    expect(ACCOES[0].onAccao).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("menu")).toBeNull();
    expect(abridor).toHaveFocus();
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
    expect(screen.getByText(/é uma quinta, confirma/)).toBeInTheDocument();
  });

  it("num sábado não avisa nada", () => {
    simularAparelho(DESKTOP);
    render(<CampoData label="Data" value="2027-09-18" onChange={() => {}} diaEsperado={6} />);
    expect(screen.queryByText(/confirma/)).not.toBeInTheDocument();
  });
});
