// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MenuDeAccoes } from "./ui/MenuDeAccoes";
import { Ajuda } from "./ui/Ajuda";
import { MoreMenu } from "./MoreMenu";
import ModelosParciais from "./ModelosParciais";
import CommandPalette, { type Command } from "./CommandPalette";
import type { Quote } from "@/lib/orcamento/types";
import { SAIDA_MS } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS CONTROLOS PEQUENOS TAMBÉM SAEM — e um deles, de propósito, NÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O censo da `.bo-entrada` (globals.css) nomeia nove superfícies do back office
 * que aparecem por cima da página. As caixas grandes — folhas, diálogos, a
 * gaveta, os avisos — já ganharam a outra metade da palavra. Os PEQUENOS não:
 * o `MenuDeAccoes`, o `MoreMenu`, o painel do `ModelosParciais` e o da `Ajuda`
 * entravam com 240 ms e desapareciam entre dois fotogramas.
 *
 * E um menu fecha-se muito mais vezes do que se abre: são três saídas cada um
 * (Escape, carregar fora, escolher) contra uma entrada. Meio gesto, vezes três.
 *
 * ── O QUE ESTE FICHEIRO PRENDE, POR CONTROLO ─────────────────────────────
 *
 *  1. **O nó fica montado 200 ms** — sem isso não há nada para animar.
 *  2. **A tarefa não espera por ele** — a acção escolhida corre no instante do
 *     clique. Nenhuma animação desta casa atrasa uma tarefa, e num menu esta é
 *     a regra principal.
 *  3. **Sai da árvore de acessibilidade no PRIMEIRO fotograma** — não no fim da
 *     animação. Um menu a apagar-se cujos itens continuam alcançáveis pelo Tab
 *     durante 200 ms é um menu que a pessoa já fechou e que ainda a apanha.
 *
 * ── E O QUE NÃO SE MEDE AQUI ─────────────────────────────────────────────
 *
 * O jsdom não tem disposição nem hit-testing: um `pointer-events` não muda ali
 * o destino de um clique. O que se prende é o CICLO DE VIDA e o VOCABULÁRIO (a
 * classe certa, no fotograma certo) — a mesma divisão de trabalho que o
 * `ui/FolhaOuDialogo.saida.test.tsx` já explica por extenso.
 */

/** As classes uma a uma: `bo-saida-fundo` contém `bo-saida` como texto. */
const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

/* ══════════════════════════════════════════════════════════════════════════
   O MENU DE ACÇÕES — o de `ui/`, o que vive em cada linha de cada tabela
   ══════════════════════════════════════════════════════════════════════════ */
describe("MenuDeAccoes", () => {
  const ACCOES = [
    { id: "dup", rotulo: "Duplicar", onAccao: vi.fn() },
    { id: "del", rotulo: "Eliminar", onAccao: vi.fn(), destrutiva: true },
  ];

  function abrir() {
    render(<MenuDeAccoes accoes={ACCOES} sobre="Terracotta" />);
    const abridor = screen.getByRole("button", { name: "Acções de Terracotta" });
    act(() => {
      fireEvent.click(abridor);
    });
    return { abridor, menu: screen.getByRole("menu") };
  }

  it("escolher uma acção não faz o menu desaparecer num fotograma", () => {
    const { menu } = abrir();
    expect(classes(menu)).toContain("bo-entrada");

    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    });

    // O ponto todo: o painel AINDA está no ecrã, e com a palavra da casa.
    expect(menu.isConnected).toBe(true);
    expect(classes(menu)).toContain("bo-saida");
    expect(classes(menu)).not.toContain("bo-entrada");

    expect(menu.isConnected).toBe(true);
    avancar(SAIDA_MS - 20);
    expect(menu.isConnected).toBe(true);
    avancar(40);
    expect(menu.isConnected).toBe(false);
  });

  it("mas a acção corre no instante do clique — a saída é imagem, não espera", () => {
    abrir();
    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    });
    // Nem um milissegundo avançado.
    expect(ACCOES[0].onAccao).toHaveBeenCalledTimes(1);
  });

  it("e deixa de ser um menu no MESMO fotograma do gesto", () => {
    const { abridor, menu } = abrir();
    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: "Duplicar" }));
    });

    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByRole("menuitem", { name: "Eliminar" })).toBeNull();
    expect(menu.getAttribute("aria-hidden")).toBe("true");
    expect(menu.hasAttribute("inert")).toBe(true);
    // E o foco já voltou a quem abriu, sem esperar pela animação.
    expect(abridor).toHaveFocus();
  });

  it("o Escape sai pelo mesmo caminho", () => {
    const { menu } = abrir();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(menu.isConnected).toBe(true);
    expect(classes(menu)).toContain("bo-saida");
  });

  /**
   * ── E QUEM PEDIU PARA NÃO ANIMAR NÃO ESPERA 200 ms ───────────────────────
   *
   * Não chega desligar a animação pelo CSS: se o nó ficasse montado 200 ms sem
   * animar, ficava uma caixa parada e morta por cima do que está por baixo
   * dela. Aqui a guarda tem de ser em JavaScript, porque o que muda é o CICLO
   * DE VIDA e não a pintura — e está no `useSaidaAdiada`, uma vez, para os
   * quatro controlos deste ficheiro.
   */
  it("com `prefers-reduced-motion` o menu desmonta no mesmo fotograma", () => {
    vi.stubGlobal(
      "matchMedia",
      (mq: string) => ({ matches: mq.includes("reduce"), media: mq }) as MediaQueryList,
    );
    const { menu } = abrir();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    // Nem um milissegundo avançado, e já não há nó nenhum.
    expect(menu.isConnected).toBe(false);
    expect(document.querySelector(".bo-saida")).toBeNull();
  });

  it("reabrir a meio da saída traz o menu de volta, sem herdar o relógio antigo", () => {
    const { abridor, menu } = abrir();
    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });
    expect(classes(menu)).toContain("bo-saida");

    act(() => {
      fireEvent.click(abridor);
    });
    // Quem manda é o estado: volta a ser um menu, e volta a entrar.
    const devolta = screen.getByRole("menu");
    expect(classes(devolta)).toContain("bo-entrada");
    expect(classes(devolta)).not.toContain("bo-saida");

    // E o relógio antigo, ao disparar, não o leva outra vez.
    avancar(SAIDA_MS + 50);
    expect(screen.queryByRole("menu")).not.toBeNull();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   O «⋯ MAIS» DO CABEÇALHO DO DETALHE
   ══════════════════════════════════════════════════════════════════════════ */
describe("MoreMenu", () => {
  const ITENS = [
    { label: "Duplicar", onClick: vi.fn() },
    { label: "Imprimir folha de sala", onClick: vi.fn() },
  ];

  it("fica montado a sair, e sem apanhar o teclado enquanto lá está", () => {
    render(<MoreMenu items={ITENS} />);
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Mais" }));
    });
    const menu = screen.getByRole("menu");
    expect(classes(menu)).toContain("bo-entrada");

    act(() => {
      fireEvent.click(screen.getByRole("menuitem", { name: /Duplicar/ }));
    });

    expect(ITENS[0].onClick).toHaveBeenCalledTimes(1);
    expect(menu.isConnected).toBe(true);
    expect(classes(menu)).toContain("bo-saida");
    expect(menu.hasAttribute("inert")).toBe(true);
    expect(screen.queryByRole("menu")).toBeNull();

    avancar(SAIDA_MS + 20);
    expect(menu.isConnected).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   OS MODELOS PARCIAIS — dois botões, UM painel
   ══════════════════════════════════════════════════════════════════════════ */
describe("ModelosParciais", () => {
  const resposta = (body: unknown) =>
    ({ ok: true, status: 200, json: async () => body }) as unknown as Response;

  function montar() {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(resposta({ modelos: [] })));
    render(
      <ModelosParciais
        tipo="grupo"
        onInserir={vi.fn()}
        paraGuardar={{ titulo: "Complementos" } as never}
        nomeSugerido="Complementos"
        toast={vi.fn()}
      />,
    );
  }

  it("o painel de guardar sai com a palavra da casa, em vez de sumir", () => {
    montar();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar como modelo/ }));
    });
    const campo = screen.getByLabelText("Nome do modelo");
    const painel = campo.closest("div") as HTMLElement;
    expect(classes(painel)).toContain("bo-entrada");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    });

    expect(painel.isConnected).toBe(true);
    expect(classes(painel)).toContain("bo-saida");
    // A caixa de escrever sai do alcance no mesmo fotograma: a tecla seguinte
    // não pode cair num campo que já não conta.
    expect(painel.hasAttribute("inert")).toBe(true);

    avancar(SAIDA_MS + 20);
    expect(painel.isConnected).toBe(false);
  });

  /**
   * ── UM PAINEL DE CADA VEZ ────────────────────────────────────────────────
   *
   * Eram dois booleanos que se desligavam um ao outro à mão. Com o fecho seco
   * ninguém dava por isso; com 200 ms de saída, abrir «Guardar como modelo»
   * com a lista aberta punha os DOIS painéis no mesmo canto — um a entrar por
   * cima do outro a sair.
   */
  it("trocar de painel é uma troca, e não uma sobreposição", () => {
    montar();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /De um modelo/ }));
    });
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /Guardar como modelo/ }));
    });

    const suspensos = document.querySelectorAll(".bo-entrada, .bo-saida");
    expect(suspensos).toHaveLength(1);
    expect(screen.getByLabelText("Nome do modelo")).toBeTruthy();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A AJUDA — o «?» ao lado de um rótulo
   ══════════════════════════════════════════════════════════════════════════ */
describe("Ajuda", () => {
  it("o painel recolhe em vez de piscar para fora", () => {
    render(<Ajuda sobre="o que faz a caixa Extra">Marca a linha como opcional.</Ajuda>);
    act(() => {
      fireEvent.click(screen.getByRole("button"));
    });
    const painel = screen.getByRole("note");

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(painel.isConnected).toBe(true);
    expect(classes(painel)).toContain("bo-saida");
    expect(screen.queryByRole("note")).toBeNull();
    avancar(SAIDA_MS + 20);
    expect(painel.isConnected).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   A PALETA DE COMANDOS — onde a saída depende de QUEM a causou
   ══════════════════════════════════════════════════════════════════════════ */
describe("CommandPalette", () => {
  const NAV: Command[] = [
    { id: "nav-overview", label: "Visão Geral", group: "Navegar", run: vi.fn() },
    { id: "nav-pedidos", label: "Pedidos", group: "Navegar", run: vi.fn() },
  ];

  /** O pai é quem tem o `open` — como no `AdminClient`. */
  function Anfitriao() {
    const [aberta, setAberta] = useState(true);
    return (
      <CommandPalette
        open={aberta}
        onClose={() => setAberta(false)}
        navCommands={NAV}
        quotes={[] as Quote[]}
        onOpenQuote={vi.fn()}
      />
    );
  }

  function montar() {
    render(<Anfitriao />);
    return screen.getByRole("dialog", { name: "Pesquisar e navegar" });
  }

  it("DISPENSAR (Escape) tem saída — por baixo fica o ecrã que já lá estava", () => {
    const caixa = montar();
    const veu = caixa.previousElementSibling as HTMLElement;
    expect(classes(veu)).toContain("bo-entrada-fundo");

    act(() => {
      fireEvent.keyDown(caixa, { key: "Escape" });
    });

    expect(caixa.isConnected).toBe(true);
    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(veu)).toContain("bo-saida-fundo");
    // E já não é um diálogo para quem ouve o ecrã.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(caixa.hasAttribute("inert")).toBe(true);

    avancar(SAIDA_MS + 20);
    expect(caixa.isConnected).toBe(false);
  });

  /**
   * ── E A MOLDURA LARGA OS TOQUES NO PRIMEIRO FOTOGRAMA ────────────────────
   *
   * Ela é um `fixed inset-0` com um `onClick` que fecha. Enquanto o véu se
   * apaga, um toque no que está por baixo era engolido aqui — a pessoa carrega
   * e não acontece nada, durante toda a saída e sem sinal nenhum de porquê.
   */
  it("e a moldura deixa de apanhar toques no instante do gesto", () => {
    const caixa = montar();
    const moldura = caixa.parentElement as HTMLElement;
    // Controlo negativo: aberta, ela APANHA-OS — é assim que o clique no véu
    // fecha a paleta.
    expect(classes(moldura)).not.toContain("pointer-events-none");

    act(() => {
      fireEvent.keyDown(caixa, { key: "Escape" });
    });

    expect(classes(moldura)).toContain("pointer-events-none");
    expect(caixa.isConnected).toBe(true);
  });

  /**
   * ── ESCOLHER FECHA A SECO, DE PROPÓSITO ──────────────────────────────────
   *
   * Esta é a decisão, e é uma RECUSA. Quando o Enter corre um comando, o que
   * fecha a paleta é a chegada de outra coisa — e essa outra coisa tem a sua
   * própria entrada. Uma saída aqui não indica direcção nenhuma: compete com a
   * resposta que a pessoa pediu, e paga 200 ms de `backdrop-blur` a recompor o
   * ecrã inteiro exactamente enquanto o browser monta a vista de destino.
   *
   * Se alguém «acabar o trabalho» e puser saída nos dois caminhos, este teste
   * fica vermelho. É essa a sua única razão de ser.
   */
  it("ESCOLHER fecha a seco — a vista que chega é que é a resposta", () => {
    const caixa = montar();

    act(() => {
      fireEvent.keyDown(caixa, { key: "Enter" });
    });

    expect(NAV[0].run).toHaveBeenCalledTimes(1);
    // Sem avançar um milissegundo: já não está no ecrã.
    expect(caixa.isConnected).toBe(false);
    expect(document.querySelector(".bo-saida")).toBeNull();
  });
});
