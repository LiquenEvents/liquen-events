// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import CriarAPartirDe from "./CriarAPartirDe";
import { SAIDA_MS } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O «CRIAR A PARTIR DE…» TAMBÉM SAI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Entrava com a `.bo-entrada` — o véu e a caixa, os dois — e fechava A SECO: o
 * `open` passava a falso, o `return null` levava o nó e o estúdio voltava no
 * fotograma seguinte. Meio gesto.
 *
 * ── O LEVANTAMENTO ESTAVA ERRADO, E É ISSO QUE ESTE FICHEIRO REGISTA ───────
 *
 * A nota que chegou com a tarefa dizia que o PAI desmontava este diálogo, e que
 * portanto a saída pedia uma alteração do lado do `ProposalStudio.tsx` — 14 000
 * linhas partilhadas por todo o estúdio. Não pedia: o pai passa-lhe
 * `open={copiarAberto}` e mantém-no MONTADO. Quem o fazia desaparecer era este
 * ficheiro, e é aqui que a saída se resolve, sem tocar em nada partilhado.
 *
 * O que se prende aqui são as três coisas que uma saída não pode fazer mal:
 *
 *  1. **Segurar o nó montado 200 ms** — sem isso não há nada para animar.
 *  2. **Não atrasar nada** — o trinco do scroll larga no INSTANTE do gesto, e
 *     não ao fim da animação. Nenhuma animação desta casa atrasa uma tarefa.
 *  3. **Largar o toque no PRIMEIRO fotograma** — e é esta a que interessa. Uma
 *     caixa que se desvanece por cima de um botão continua a ser o alvo do
 *     toque enquanto lá estiver: a pessoa carrega, não acontece nada, e não há
 *     sinal nenhum de porquê.
 *
 * ── O QUE NÃO SE MEDE AQUI ────────────────────────────────────────────────
 *
 * O jsdom não tem disposição nem faz hit-testing: `pointer-events` não muda ali
 * o destino de um clique porque não há ninguém a decidir destinos de cliques. O
 * que se prende é o CICLO DE VIDA e o VOCABULÁRIO — a classe certa, no
 * primeiro fotograma, no elemento que cobre o ecrã. Que a classe traz mesmo
 * `pointer-events: none` está preso no `Toast.saida.test.tsx`, a ler o
 * `globals.css`; e que o toque chega mesmo ao botão de baixo mede-se num
 * browser a sério (`e2e/o-toque-passa-por-baixo.mjs`).
 */

const resposta = (body: unknown) => ({ ok: true, status: 200, json: async () => body }) as Response;

const fetchMock = vi.fn();

/** Só o `reduce`; o resto responde `false`, como um ecrã normal. */
function simularMovimento({ menos }: { menos: boolean }) {
  vi.stubGlobal(
    "matchMedia",
    (mq: string) =>
      ({
        matches: mq.includes("reduce") ? menos : false,
        media: mq,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => true,
      }) as unknown as MediaQueryList,
  );
}

/** O pai que tem o estado — o `ProposalStudio` a sério mantém isto montado. */
function Anfitriao({ aoFechar }: { aoFechar?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <CriarAPartirDe
        open={open}
        onClose={() => {
          aoFechar?.();
          setOpen(false);
        }}
        quoteId="q2"
        clienteAtual="Ana Marques"
        onEscolhido={vi.fn()}
        toast={vi.fn()}
      />
    </>
  );
}

function montar(aoFechar?: () => void) {
  render(<Anfitriao aoFechar={aoFechar} />);
  // As duas leituras resolvem-se; sem isto o React queixa-se de um `act` solto.
  act(() => {});
  return screen.getByRole("dialog", { name: "Criar a partir de…" });
}

const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

/** Cancelar é a saída pelo botão, e é a que ela usa. */
function fecharPeloBotao() {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  });
}

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

beforeEach(() => {
  simularMovimento({ menos: false });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(resposta({ modelos: [], propostas: [] }));
  vi.stubGlobal("fetch", fetchMock);
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.style.overflow = "";
});

describe("a caixa fica montada a sair", () => {
  it("não desaparece no fotograma do gesto, e some ao fim dos 200 ms", () => {
    const caixa = montar();
    expect(caixa.hasAttribute("inert")).toBe(false);

    fecharPeloBotao();

    // O ponto todo: a seguir ao clique a caixa AINDA está no ecrã. Antes disto
    // o `return null` levava-a no mesmo instante e não havia nada para animar.
    expect(caixa.isConnected).toBe(true);
    avancar(SAIDA_MS - 20);
    expect(caixa.isConnected).toBe(true);

    avancar(40);
    expect(caixa.isConnected).toBe(false);
  });

  it("sai com a palavra da casa — e o véu apaga-se com ela", () => {
    const caixa = montar();
    const moldura = caixa.parentElement as HTMLElement;
    // Controlo negativo: aberta, é a ENTRADA que está lá, e nada da saída.
    expect(classes(moldura)).toContain("bo-entrada-fundo");
    expect(classes(moldura)).not.toContain("bo-saida");
    expect(classes(caixa)).toContain("bo-entrada");

    fecharPeloBotao();

    // Aqui o véu e a moldura são o MESMO elemento — a tinta escura não está por
    // trás de nada, é ela que centra a caixa. Zero de deslocação nos dois
    // sentidos, que é o que um fundo pede.
    expect(classes(moldura)).toContain("bo-saida");
    expect(classes(moldura)).toContain("bo-saida-fundo");
    expect(classes(moldura)).not.toContain("bo-entrada-fundo");
    // E a caixa sai por onde entrou: quatro píxeis, para cima.
    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(caixa)).not.toContain("bo-saida-fundo");
    expect(classes(caixa)).not.toContain("bo-entrada");
  });
});

/**
 * ── E ESTE É O TESTE QUE IMPEDE UM TOQUE DE SE PERDER ─────────────────────
 *
 * A moldura desta caixa é um `fixed inset-0`: cobre o ecrã TODO, e por baixo
 * dela está o estúdio de propostas inteiro. Uma caixa a desvanecer-se por cima
 * do botão em que a pessoa quer carregar continua a ser o alvo do toque
 * enquanto lá estiver.
 *
 * Aqui o largar dos toques não é uma classe do Tailwind posta à mão: vem DENTRO
 * da `.bo-saida`, porque quem cobre o ecrã é o mesmo elemento que leva a
 * classe. Este teste não avança um único milissegundo depois do gesto — é essa
 * a sua razão de ser.
 */
describe("a caixa a sair não apanha um único toque", () => {
  it("a `.bo-saida` está na moldura no primeiro fotograma, e não no fim", () => {
    const aoFechar = vi.fn();
    const caixa = montar(aoFechar);
    const moldura = caixa.parentElement as HTMLElement;

    /* ── O CONTROLO NEGATIVO, E É A SÉRIO ───────────────────────────────
       Aberta, esta moldura APANHA os toques: um `mousedown` nela é o clique
       no fundo, e é assim que a caixa se fecha. Sem esta parte, o que vem a
       seguir passava com uma moldura que nunca tinha apanhado toque nenhum —
       ou seja com um teste que não estava a medir nada. */
    expect(moldura.className).toContain("inset-0");
    expect(classes(moldura)).not.toContain("bo-saida");
    act(() => {
      fireEvent.mouseDown(moldura);
    });
    expect(aoFechar).toHaveBeenCalledTimes(1);
    aoFechar.mockClear();

    // Agora a caixa está a sair — e o perigo continua no ecrã.
    expect(caixa.isConnected).toBe(true);

    // NADA de `advanceTimersByTime` aqui. É o primeiro fotograma.
    expect(classes(moldura)).toContain("bo-saida");
    // E o mesmo gesto no mesmo sítio já não faz nada: a moldura largou os
    // toques no MESMO commit em que ficou marcada como «a sair».
    act(() => {
      fireEvent.mouseDown(moldura);
    });
    expect(aoFechar).not.toHaveBeenCalled();
    expect(caixa.isConnected).toBe(true);
  });

  it("e deixa de ser um diálogo para quem ouve o ecrã, no mesmo fotograma", () => {
    const caixa = montar();

    fecharPeloBotao();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(caixa.getAttribute("aria-hidden")).toBe("true");
    expect(caixa.hasAttribute("inert")).toBe(true);
    expect(caixa.hasAttribute("aria-labelledby")).toBe(false);
    // E o «Cancelar» que ficou lá dentro já não é um botão que se alcance.
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });
});

/**
 * ── E NADA DISTO ATRASA UMA TAREFA ────────────────────────────────────────
 *
 * O trinco do scroll e a armadilha de foco são regidos pela PROP `open`, e não
 * pela montagem: o `useTrincoDeScroll(open)` e o `useFocusTrap(open)` largam no
 * instante do gesto. Se algum deles passasse a depender do nó estar montado, a
 * página ficava trancada mais 200 ms — uma animação a atrasar uma tarefa, que é
 * a única coisa que esta casa não deixa fazer a nenhuma.
 */
describe("a saída não atrasa o que o fecho tem de fazer", () => {
  it("a página destranca no instante do gesto, com a caixa ainda no ecrã", () => {
    const caixa = montar();
    // Controlo negativo: aberta, o fundo não rola.
    expect(document.body.style.overflow).toBe("hidden");

    fecharPeloBotao();

    // Zero milissegundos avançados.
    expect(document.body.style.overflow).not.toBe("hidden");
    expect(caixa.isConnected).toBe(true);
  });
});

/**
 * ── QUEM PEDIU MENOS MOVIMENTO NÃO ESPERA ─────────────────────────────────
 *
 * Num diálogo isto é sério: quem pediu menos movimento não espera 200 ms por
 * uma caixa a apagar-se em cima do botão em que quer carregar a seguir. Não
 * chega desligar a animação pelo CSS — o que muda é o CICLO DE VIDA, e por isso
 * a guarda está em JavaScript, no `useSaidaDeUmSo`.
 */
describe("quem pediu menos movimento não espera pela saída", () => {
  it("a caixa desaparece no instante, sem passar por saída nenhuma", () => {
    simularMovimento({ menos: true });
    const caixa = montar();

    fecharPeloBotao();

    // Zero milissegundos avançados.
    expect(caixa.isConnected).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
