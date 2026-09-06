// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import RestoreDialog from "./RestoreDialog";
import { SAIDA_MS } from "./ui/saida";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * REPOR UMA CÓPIA TAMBÉM SE FECHA COM UM GESTO INTEIRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este é o diálogo mais pesado da casa — uma caixa de `max-w-3xl` com a tabela
 * dos conjuntos lá dentro — e desaparecia num fotograma: o `open` passava a
 * falso, o `return null` levava o nó e o back office voltava.
 *
 * ── E O PAI NÃO PRECISOU DE MUDAR NADA ────────────────────────────────────
 *
 * O levantamento que veio com a tarefa dizia que o `AdminClient` desmontava
 * isto. Não desmonta: passa-lhe `open={restoreOpen}` e mantém-no montado. Quem
 * o fazia desaparecer era o próprio ficheiro — e é por isso que a saída se
 * resolveu sem abrir um ficheiro de 7500 linhas partilhado por todo o back
 * office. Este teste monta o diálogo com o pai que ele tem a sério.
 */

/** O pai: mantém montado, e é o `open` que abre e fecha. */
function Anfitriao({ aoFechar }: { aoFechar?: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>abrir</button>
      <RestoreDialog
        open={open}
        onClose={() => {
          aoFechar?.();
          setOpen(false);
        }}
      />
    </>
  );
}

function montar(aoFechar?: () => void) {
  render(<Anfitriao aoFechar={aoFechar} />);
  act(() => {});
  return screen.getByRole("dialog", { name: "Repor cópia de segurança" });
}

const avancar = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms);
  });

function fecharPeloX() {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "Fechar" }));
  });
}

function reabrir() {
  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "abrir" }));
  });
}

const classes = (el: Element) => el.className.split(/\s+/).filter(Boolean);

/** Sem `reduce`, que é o ecrã normal. */
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

beforeEach(() => {
  simularMovimento({ menos: false });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({}) }) as Response),
  );
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

    fecharPeloX();

    expect(caixa.isConnected).toBe(true);
    avancar(SAIDA_MS - 20);
    expect(caixa.isConnected).toBe(true);
    avancar(40);
    expect(caixa.isConnected).toBe(false);
  });

  it("e o véu apaga-se com ela, sem ir a sítio nenhum", () => {
    const caixa = montar();
    const veu = caixa.previousElementSibling as HTMLElement;
    // Controlo negativo: aberto, o véu tem a ENTRADA e nada da saída.
    expect(classes(veu)).toContain("bo-entrada-fundo");
    expect(classes(veu)).not.toContain("bo-saida");

    fecharPeloX();

    expect(classes(veu)).toContain("bo-saida");
    expect(classes(veu)).toContain("bo-saida-fundo");
    expect(classes(veu)).not.toContain("bo-entrada-fundo");
    // O MESMO nó, e não um nó novo: a saída parte da opacidade em que ele está.
    expect(veu.isConnected).toBe(true);
    // E a caixa sai por onde entrou: quatro píxeis.
    expect(classes(caixa)).toContain("bo-saida");
    expect(classes(caixa)).not.toContain("bo-saida-folha");
  });
});

/**
 * ── O TESTE QUE IMPEDE UM TOQUE DE SE PERDER ──────────────────────────────
 *
 * A moldura é um `fixed inset-0`: cobre o ecrã TODO, e por baixo dela está o
 * back office inteiro. Este diálogo não fecha pelo fundo (de propósito, para
 * não se perder uma reposição a meio), portanto a moldura não leva classe
 * nenhuma da `.bo-saida` — o largar tem de ser posto à mão, e é aqui que se
 * prende que foi.
 *
 * Este teste não avança um único milissegundo depois do gesto.
 */
describe("a caixa a sair não apanha um único toque", () => {
  it("a moldura larga-os no primeiro fotograma, e não quando a animação acaba", () => {
    const caixa = montar();
    const moldura = caixa.parentElement as HTMLElement;
    // Controlo negativo: aberta, a moldura cobre o ecrã E apanha os toques.
    expect(moldura.className).toContain("inset-0");
    expect(classes(moldura)).not.toContain("pointer-events-none");

    fecharPeloX();

    // NADA de `advanceTimersByTime` aqui. É o primeiro fotograma.
    expect(classes(moldura)).toContain("pointer-events-none");
    // E o perigo continua no ecrã: sem isto, o teste não media nada.
    expect(caixa.isConnected).toBe(true);
  });

  it("e deixa de ser um diálogo para quem ouve o ecrã, no mesmo fotograma", () => {
    const caixa = montar();

    fecharPeloX();

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(caixa.getAttribute("aria-hidden")).toBe("true");
    expect(caixa.hasAttribute("inert")).toBe(true);
    expect(caixa.hasAttribute("aria-label")).toBe(false);
    expect(screen.queryByRole("button", { name: "Fechar" })).toBeNull();
  });
});

describe("a saída não atrasa o que o fecho tem de fazer", () => {
  it("o `onClose` corre no instante — e ele revalida os pedidos todos", () => {
    const aoFechar = vi.fn();
    montar(aoFechar);

    fecharPeloX();

    // Zero milissegundos avançados. O `onClose` deste diálogo vai ao servidor
    // buscar o que a reposição mudou: adiá-lo 200 ms era uma animação a atrasar
    // uma tarefa, que é a única coisa que esta casa não deixa fazer a nenhuma.
    expect(aoFechar).toHaveBeenCalledTimes(1);
  });

  it("a página destranca no instante, com a caixa ainda no ecrã", () => {
    const caixa = montar();
    expect(document.body.style.overflow).toBe("hidden");

    fecharPeloX();

    expect(document.body.style.overflow).not.toBe("hidden");
    expect(caixa.isConnected).toBe(true);
  });
});

/**
 * ── E CADA ABERTURA CONTINUA A COMEÇAR DO ZERO ────────────────────────────
 *
 * Enquanto o nó morria a cada fecho, isto vinha de graça. Agora que ele fica
 * montado 200 ms, reabrir DENTRO desses 200 ms devolvia o mesmo componente —
 * com o ficheiro escolhido, a frase de confirmação escrita à mão e a fase em
 * que se estava. Num diálogo que escreve por cima dos dados todos, ressuscitar
 * o ecrã do RESULTADO de uma reposição que já acabou é a pior forma possível de
 * o reabrir.
 *
 * A rede é um `key` por ABERTURA — que não muda durante a saída, e portanto não
 * remonta nada a meio dela.
 */
describe("reabrir a meio da saída dá um diálogo novo", () => {
  it("não devolve o que estava a apagar-se", () => {
    const caixa = montar();

    fecharPeloX();
    expect(caixa.isConnected).toBe(true);

    // Meio caminho andado, e ela volta a abrir.
    avancar(SAIDA_MS / 2);
    reabrir();

    const nova = screen.getByRole("dialog", { name: "Repor cópia de segurança" });
    // Nó novo: o que estava a sair foi-se, e o que está no ecrã começa do zero.
    expect(nova).not.toBe(caixa);
    expect(caixa.isConnected).toBe(false);
  });
});

describe("quem pediu menos movimento não espera pela saída", () => {
  it("a caixa desaparece no instante, sem passar por saída nenhuma", () => {
    simularMovimento({ menos: true });
    const caixa = montar();

    fecharPeloX();

    expect(caixa.isConnected).toBe(false);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
