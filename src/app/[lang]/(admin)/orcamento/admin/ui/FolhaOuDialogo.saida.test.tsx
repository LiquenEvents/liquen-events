// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FolhaOuDialogo } from "./FolhaOuDialogo";
import { SAIDA_MS } from "./saida";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A CAIXA TAMBÉM SAI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Esta é a porta por onde passam seis diálogos do back office — a
 * `PerguntaDestrutiva`, o `NewQuoteModal`, o `ShortcutsModal`, o
 * `PasskeysDialog`, o `ThemeCopyDialog` e o editor de e-mail. Entravam todos
 * com a `.bo-entrada` e fechavam A SECO: o pai punha o `aberto` a falso, o nó
 * desaparecia no fotograma seguinte e o ecrã voltava. Meio gesto, seis vezes.
 *
 * O que este ficheiro prende são as três coisas que a saída não pode fazer mal:
 *
 *  1. **Segurar o nó montado 200 ms** — sem isso não há nada para animar.
 *  2. **Não atrasar o `onFechar`** — a animação é uma imagem a apagar-se, não
 *     um adiamento da tarefa. Nenhuma animação desta casa pode atrasar uma.
 *  3. **Largar o toque no PRIMEIRO fotograma** — e esta é a que interessa
 *     mesmo. Uma caixa que se desvanece por cima de um botão continua a ser o
 *     alvo do toque enquanto lá estiver: a pessoa carrega, não acontece nada, e
 *     não há sinal nenhum de porquê.
 *
 * ── O QUE NÃO SE MEDE AQUI, E PORQUÊ ──────────────────────────────────────
 *
 * O jsdom não tem disposição nenhuma nem faz hit-testing: um `pointer-events`
 * não muda ali o destino de um clique, porque não há ninguém a decidir destinos
 * de cliques. O que se pode prender é o CICLO DE VIDA (o nó fica montado a
 * sair), o VOCABULÁRIO (a classe certa, no primeiro fotograma) e a GEOMETRIA
 * ESCRITA (o `style` da folha arrastada). O resto — que o toque chega mesmo ao
 * botão de baixo — mede-se num browser a sério, e a regra do lado do CSS já
 * tem quem a guarde no `Toast.saida.test.tsx`.
 */

/**
 * Um `matchMedia` falso, com largura e ponteiro. O jsdom não tem nenhum: sem
 * isto tudo dá `false` e a folha do telemóvel nunca chegava a ser folha.
 *
 * Responde também ao `prefers-reduced-motion`, que é a pergunta que o
 * `useSaidaAdiada` faz antes de segurar seja o que for.
 */
function simularAparelho({
  largura,
  toque,
  menosMovimento = false,
}: {
  largura: number;
  toque: boolean;
  menosMovimento?: boolean;
}) {
  vi.stubGlobal("matchMedia", (mq: string): MediaQueryList => {
    const min = /min-width:\s*(\d+)px/.exec(mq);
    const matches = min
      ? largura >= Number(min[1])
      : mq.includes("hover: hover")
        ? !toque
        : mq.includes("pointer: coarse")
          ? toque
          : mq.includes("reduce")
            ? menosMovimento
            : false;
    return {
      matches,
      media: mq,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => true,
    } as unknown as MediaQueryList;
  });
}

const TELEMOVEL = { largura: 375, toque: true };
const DESKTOP = { largura: 1440, toque: false };

/** O pai que tem o estado — é ele que fecha, e é a prop que dá o sinal. */
function Anfitriao({ aoFechar, bloqueado }: { aoFechar?: () => void; bloqueado?: boolean }) {
  const [aberto, setAberto] = useState(true);
  return (
    <>
      <button onClick={() => setAberto(true)}>abrir</button>
      <FolhaOuDialogo
        aberto={aberto}
        onFechar={() => {
          aoFechar?.();
          setAberto(false);
        }}
        titulo="Escolher fotos"
        bloqueado={bloqueado}
      >
        <p>conteúdo</p>
      </FolhaOuDialogo>
    </>
  );
}

function montar(props: { aoFechar?: () => void; bloqueado?: boolean } = {}) {
  render(<Anfitriao {...props} />);
  // Um passo para o `useMontado` do `useAdaptativo` correr: antes dele a caixa
  // desenha-se sempre como folha, que é o formato mais seguro mas não é o que
  // metade destes testes quer medir.
  act(() => {});
  return screen.getByRole("dialog", { name: "Escolher fotos" });
}

function avancar(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

function fecharPeloBotao() {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
  });
}

/**
 * Puxar a pega para baixo. A pega é o primeiro filho da folha; o
 * `setPointerCapture` do jsdom não existe em todas as versões e um nada serve,
 * porque o que se exercita é o cálculo do arrasto.
 */
function arrastarPega(caixa: HTMLElement, px: number) {
  const pega = caixa.firstElementChild as HTMLElement;
  pega.setPointerCapture ??= () => {};
  // Um `act` por evento, e não um à volta dos três: com os três dentro do
  // mesmo, o `setArrasto` do `pointerMove` só assentava no fim e o
  // `pointerUp` lia um arrasto de zero — o gesto passava sem nunca ter
  // arrastado nada.
  fireEvent.pointerDown(pega, { clientY: 0, pointerId: 1 });
  fireEvent.pointerMove(pega, { clientY: px, pointerId: 1 });
  fireEvent.pointerUp(pega, { clientY: px, pointerId: 1 });
}

/** As classes, uma a uma — `bo-saida-folha` contém `bo-saida` como texto. */
const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("a caixa fica montada a sair", () => {
  it("não desaparece no fotograma do gesto, e some ao fim dos 200 ms", () => {
    simularAparelho(DESKTOP);
    const caixa = montar();
    // Aberta, é uma caixa a sério: alcançável pelo teclado e anunciada.
    expect(caixa.hasAttribute("inert")).toBe(false);
    expect(caixa.hasAttribute("aria-hidden")).toBe(false);

    fecharPeloBotao();

    // O ponto todo: a seguir ao clique a caixa AINDA está no ecrã. Antes disto
    // o pai desmontava-a no mesmo instante e não havia nada para animar.
    expect(caixa.isConnected).toBe(true);

    // E continua montada até ao último fotograma da saída.
    avancar(SAIDA_MS - 20);
    expect(caixa.isConnected).toBe(true);

    avancar(40);
    expect(caixa.isConnected).toBe(false);
  });

  it("mas o `onFechar` não espera por ela — a saída é uma imagem, não um adiamento", () => {
    simularAparelho(DESKTOP);
    const aoFechar = vi.fn();
    montar({ aoFechar });

    fecharPeloBotao();

    // Nenhum milissegundo avançado. O pai fecha o que tem a fechar já: nenhuma
    // animação desta casa pode atrasar uma tarefa.
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("e o Escape sai pelo mesmo caminho", () => {
    simularAparelho(DESKTOP);
    const caixa = montar();

    act(() => {
      fireEvent.keyDown(document, { key: "Escape" });
    });

    expect(caixa.isConnected).toBe(true);
    expect(classes(caixa)).toContain("bo-saida");
    avancar(SAIDA_MS + 20);
    expect(caixa.isConnected).toBe(false);
  });
});

/**
 * ── E ESTE É O TESTE QUE IMPEDE UM TOQUE DE SE PERDER ─────────────────────
 *
 * A moldura desta caixa é um `fixed inset-0`: cobre o ecrã TODO. Uma caixa a
 * desvanecer-se por cima do botão em que a pessoa quer carregar continua a ser
 * o alvo do toque enquanto lá estiver — ela carrega, e não acontece nada,
 * durante toda a saída e sem sinal nenhum de porquê.
 *
 * Por isso o largar dos toques não espera pelo fim da animação, nem por um
 * `setTimeout`, nem por um `requestAnimationFrame`: acontece no MESMO commit do
 * React que marca a caixa como «a sair». Este teste não avança um único
 * milissegundo depois do gesto — é essa a sua razão de ser.
 */
describe("a caixa a sair não apanha um único toque", () => {
  it("a moldura larga-os no primeiro fotograma, e não quando a animação acaba", () => {
    simularAparelho(DESKTOP);
    const caixa = montar();
    const moldura = caixa.parentElement as HTMLElement;

    // Controlo negativo: aberta, a moldura APANHA os toques — é assim que o
    // clique no fundo fecha a caixa. Sem esta linha, o teste de baixo passava
    // com uma moldura que nunca os apanhou.
    expect(classes(moldura)).not.toContain("pointer-events-none");

    fecharPeloBotao();

    // NADA de `advanceTimersByTime` aqui. É o primeiro fotograma.
    expect(classes(moldura)).toContain("pointer-events-none");
    // E o perigo continua no ecrã: se já não estivesse montado, este teste não
    // estaria a medir coisa nenhuma.
    expect(caixa.isConnected).toBe(true);
  });

  it("e deixa de ser um diálogo para quem ouve o ecrã, no mesmo fotograma", () => {
    simularAparelho(DESKTOP);
    const caixa = montar();

    fecharPeloBotao();

    // Sem `role`, sem nome e fora do fio do teclado: para quem ouve o ecrã e
    // para quem anda de Tab, isto acabou no instante do gesto.
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(caixa.getAttribute("aria-hidden")).toBe("true");
    expect(caixa.hasAttribute("inert")).toBe(true);
    expect(caixa.hasAttribute("aria-labelledby")).toBe(false);
    // E o «×» que ficou lá dentro já não é um botão que se alcance.
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
  });
});

describe("sai com a palavra da casa, e pelo sítio por onde entrou", () => {
  it("o diálogo do computador sai com a `.bo-saida` — quatro píxeis", () => {
    simularAparelho(DESKTOP);
    const caixa = montar();
    expect(classes(caixa)).toContain("bo-entrada");

    fecharPeloBotao();

    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(caixa)).not.toContain("bo-saida-folha");
    // E a entrada larga o elemento: duas animações a disputar a mesma opacidade
    // é como se pede um gesto sujo.
    expect(classes(caixa)).not.toContain("bo-entrada");
  });

  it("a folha do telemóvel sai por baixo — oito, a variante da folha", () => {
    simularAparelho(TELEMOVEL);
    const caixa = montar();
    expect(classes(caixa)).toContain("bo-entrada-folha");

    fecharPeloBotao();

    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(caixa)).toContain("bo-saida-folha");
    expect(classes(caixa)).not.toContain("bo-entrada-folha");
  });

  it("e o véu apaga-se com ela, sem ir a sítio nenhum", () => {
    simularAparelho(DESKTOP);
    const caixa = montar();
    const veu = caixa.previousElementSibling as HTMLElement;
    expect(classes(veu)).toContain("bo-entrada-fundo");

    fecharPeloBotao();

    expect(classes(veu)).toContain("bo-saida");
    expect(classes(veu)).toContain("bo-saida-fundo");
    expect(classes(veu)).not.toContain("bo-entrada-fundo");
    // O mesmo nó, e não um nó novo: a saída parte da opacidade em que ele está.
    expect(veu.isConnected).toBe(true);
  });
});

/**
 * ── A FOLHA ARRASTADA ─────────────────────────────────────────────────────
 *
 * A folha do telemóvel escreve `transform: translateY(arrasto)` no `style`
 * enquanto o dedo a puxa. Uma ANIMAÇÃO ganha ao `style` — os fotogramas da
 * `.bo-saida` partem de `translateY(0)` —, portanto uma folha puxada 200 px
 * saltava de volta ao sítio ANTES de sair: o gesto lido ao contrário, no
 * fotograma em que a pessoa levanta o dedo.
 *
 * A saída de uma folha arrastada é por isso uma TRANSIÇÃO, que parte do valor
 * que o elemento tem agora. Os números continuam a ser os da casa: a duração é
 * o `SAIDA_MS`, a curva é a `--ease-in`, e a distância é o `--bo-saida-y` que a
 * variante da folha declara — somado ao arrasto no próprio CSS.
 */
describe("a folha arrastada sai de onde o dedo a deixou", () => {
  it("não salta de volta a zero, e leva a distância da casa por cima do arrasto", () => {
    simularAparelho(TELEMOVEL);
    const caixa = montar();

    arrastarPega(caixa, 200);

    expect(caixa.isConnected).toBe(true);
    // Continua a 200 px — e sai de lá, não de zero.
    expect(caixa.style.transform).toBe("translateY(calc(200px + var(--bo-saida-y)))");
    expect(caixa.style.opacity).toBe("0");
    expect(caixa.style.transition).toContain(`${SAIDA_MS}ms`);
    expect(caixa.style.transition).toContain("var(--ease-in)");
    // A variante fica, porque é dela que vem o `--bo-saida-y`; a `.bo-saida`
    // não, porque a animação dela apagava o `transform` do arrasto.
    expect(classes(caixa)).toContain("bo-saida-folha");
    expect(classes(caixa)).not.toContain("bo-saida");

    avancar(SAIDA_MS + 20);
    expect(caixa.isConnected).toBe(false);
  });

  it("controlo negativo: fechada pelo botão, a mesma folha sai com a animação", () => {
    simularAparelho(TELEMOVEL);
    const caixa = montar();

    fecharPeloBotao();

    expect(classes(caixa)).toContain("bo-saida");
    expect(caixa.style.transform).toBe("");
    expect(caixa.style.transition).toBe("");
  });

  it("e se ninguém fechou, a folha volta ao sítio em vez de ficar encalhada", () => {
    simularAparelho(TELEMOVEL);
    const aoFechar = vi.fn();
    const caixa = montar({ aoFechar, bloqueado: true });

    arrastarPega(caixa, 200);

    // `bloqueado` recusa o fecho — e a folha, que ficou onde o dedo a deixou
    // para poder sair de lá, tem de voltar ao sítio já que não vai sair.
    expect(aoFechar).not.toHaveBeenCalled();
    expect(caixa.isConnected).toBe(true);
    expect(caixa.style.transform).toBe("");
    expect(classes(caixa)).not.toContain("bo-saida-folha");
    expect(screen.queryByRole("dialog")).not.toBeNull();
  });

  it("e o arrasto recusado não fica à espera do fecho seguinte", () => {
    simularAparelho(TELEMOVEL);
    const { rerender } = render(<Anfitriao bloqueado />);
    act(() => {});
    const caixa = screen.getByRole("dialog", { name: "Escolher fotos" });

    // Puxa-se, é recusado, e a folha volta ao sítio.
    arrastarPega(caixa, 200);
    expect(caixa.style.transform).toBe("");

    // Acabou a operação: a caixa destranca e fecha-se pelo botão. Este fecho
    // não arrastou nada — se os 200 px do gesto recusado ainda estivessem
    // guardados, a folha saía a deslizar de uma distância que ninguém puxou.
    rerender(<Anfitriao bloqueado={false} />);
    fecharPeloBotao();

    expect(classes(caixa)).toContain("bo-saida");
    expect(caixa.style.transform).toBe("");
  });
});

/**
 * ── QUEM PEDIU PARA NÃO ANIMAR NÃO ESPERA ─────────────────────────────────
 *
 * Num diálogo isto é sério: quem pediu menos movimento não espera 200 ms por
 * uma caixa a apagar-se em cima do botão em que quer carregar a seguir. Não
 * chega desligar a animação pelo CSS — o que muda é o CICLO DE VIDA, e por
 * isso a guarda está em JavaScript, no `useSaidaAdiada`.
 */
describe("quem pediu menos movimento não espera pela saída", () => {
  it("a caixa desaparece no instante, sem passar por saída nenhuma", () => {
    simularAparelho({ ...DESKTOP, menosMovimento: true });
    const caixa = montar();

    fecharPeloBotao();

    // Zero milissegundos avançados.
    expect(caixa.isConnected).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
