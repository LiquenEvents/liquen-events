// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Quote, QuoteStatus } from "@/lib/orcamento/types";
import { ToastProvider } from "./Toast";
import Kanban from "./Kanban";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE SE PEGA E O QUE SE LARGA, NO QUADRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Duas coisas, e as duas eram cortes secos.
 *
 *  1. **A ATERRAGEM.** Um cartão que muda de coluna monta-se de novo — as
 *     colunas são cinco listas irmãs, e mudar de coluna é mudar de pai. Uma
 *     `transition` não anima uma montagem, portanto o cartão desaparecia de uma
 *     coluna e aparecia na outra, a 100% de opacidade, no mesmo fotograma.
 *     Teleporte. E o REGRESSO — quando o servidor recusa e o cartão volta — era
 *     indistinguível da ida, o que faz uma recusa parecer um defeito do ecrã.
 *
 *  2. **A INCLINAÇÃO DE QUEM VAI A VOAR.** O cartão apanhado ganha
 *     `motion-safe:rotate-1`, e a lista de transição dizia
 *     `[…,opacity,transform]`. No Tailwind v4 `rotate-1` emite a propriedade
 *     AUTÓNOMA (`rotate: 1deg`) e `transform` não a cobre — o mesmo engano que
 *     o `ui/movimento.ts` já conta sobre o `scale-[0.98]` do `Button`.
 *     Compilado nesta casa (Tailwind 4.3.0) para confirmar. Resultado: a
 *     opacidade descia em 120 ms e a inclinação entrava a 0 ms, no mesmo gesto.
 *
 * ── PORQUE É QUE ISTO É VITEST E NÃO PLAYWRIGHT ───────────────────────────
 *
 * Porque não se mede aqui posição nenhuma. O jsdom não tem disposição e uma
 * medição de arrasto daria zero — isso é passeio de browser. O que se mede aqui
 * é o que existe no DOM: QUE cartão traz a aterragem, quantos a trazem, e se a
 * lista de propriedades cobre a que muda. Essas respostas não dependem de
 * píxeis nenhuns.
 */

const pedido = (over: Partial<Quote> = {}): Quote =>
  ({
    id: "LIQ-1",
    name: "Ana e João",
    email: "ana@exemplo.pt",
    phone: "",
    company: "",
    guests: 100,
    date: "2027-06-12",
    location: "Évora",
    notes: "",
    category: "particulares",
    eventType: "casamentos",
    submittedAt: "2026-01-10T10:00:00.000Z",
    status: "cotado",
    ...over,
  }) as unknown as Quote;

function reply(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
  } as unknown as Response;
}

/**
 * O quadro com o estado a sério por cima.
 *
 * O `Kanban` não guarda os pedidos — pede ao pai que os mude. Sem um pai que
 * obedeça, o cartão nunca chega a mudar de coluna e não há aterragem nenhuma
 * para ver.
 */
function Quadro({ inicial }: { inicial: Quote[] }) {
  const [quotes, setQuotes] = useState(inicial);
  return (
    <ToastProvider>
      <Kanban
        quotes={quotes}
        onOpen={() => {}}
        onStatusChange={(id: string, status: QuoteStatus) =>
          setQuotes((qs) => qs.map((q) => (q.id === id ? ({ ...q, status } as Quote) : q)))
        }
        userName="Catarina"
      />
    </ToastProvider>
  );
}

const cartaoDe = (nome: string) => screen.getByRole("button", { name: new RegExp(`^${nome},`) });
const aterrados = () => Array.from(document.querySelectorAll(".bo-entrada"));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => reply(200, { status: "aceite" })),
  );
});

describe("o cartão do Kanban aterra", () => {
  it("no primeiro desenho não aterra cartão nenhum — a escada é por bloco, não por linha", () => {
    // Cinquenta cartões a chegar um a um é lentidão, não elegância. A
    // aterragem é de UM cartão porque UM é o que a pessoa moveu; ao abrir o
    // quadro ninguém moveu nada.
    render(
      <Quadro
        inicial={[
          pedido(),
          pedido({ id: "LIQ-2", name: "Rita e Nuno" }),
          pedido({ id: "LIQ-3", name: "Sofia e Tiago", status: "pendente" }),
        ]}
      />,
    );
    expect(aterrados()).toHaveLength(0);
  });

  it("o cartão que mudou de coluna chega com a entrada da casa", async () => {
    render(<Quadro inicial={[pedido()]} />);
    expect(aterrados()).toHaveLength(0);

    cartaoDe("Ana e João").focus();
    await userEvent.keyboard("{ArrowRight}");

    // Mudou mesmo de coluna...
    await waitFor(() => expect(cartaoDe("Ana e João").getAttribute("aria-label")).toMatch(/Ganho/));
    // ...e chegou lá com a `.bo-entrada` do `globals.css`: 240 ms,
    // `cubic-bezier(0, 0, 0.2, 1)`, quatro píxeis, só `transform` e `opacity`,
    // e desligada por `prefers-reduced-motion` na própria regra.
    expect(cartaoDe("Ana e João").classList.contains("bo-entrada")).toBe(true);
  });

  it("e é só ele — os vizinhos ficam quietos", async () => {
    render(
      <Quadro
        inicial={[
          pedido(),
          pedido({ id: "LIQ-2", name: "Rita e Nuno" }),
          pedido({ id: "LIQ-3", name: "Sofia e Tiago", status: "pendente" }),
        ]}
      />,
    );

    cartaoDe("Ana e João").focus();
    await userEvent.keyboard("{ArrowRight}");

    await waitFor(() => expect(aterrados()).toHaveLength(1));
    expect(aterrados()[0].getAttribute("aria-label")).toMatch(/^Ana e João,/);
  });

  it("o regresso de uma recusa aterra como a ida — não salta", async () => {
    // Uma fotografia que salta de volta parece um erro; uma que regressa parece
    // uma recusa educada. O aviso já dizia para onde o cartão voltou; o
    // movimento dizia o contrário.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(503, { error: "Erro interno" })),
    );
    render(<Quadro inicial={[pedido()]} />);

    cartaoDe("Ana e João").focus();
    await userEvent.keyboard("{ArrowRight}");

    // Voltou a «Proposta enviada»...
    await waitFor(() =>
      expect(cartaoDe("Ana e João").getAttribute("aria-label")).toMatch(/Proposta enviada/),
    );
    // ...e voltou a aterrar.
    expect(cartaoDe("Ana e João").classList.contains("bo-entrada")).toBe(true);
  });

  it("acabada a aterragem, o quadro esquece qual foi o cartão", async () => {
    render(<Quadro inicial={[pedido()]} />);

    cartaoDe("Ana e João").focus();
    await userEvent.keyboard("{ArrowRight}");
    await waitFor(() => expect(aterrados()).toHaveLength(1));

    /**
     * O jsdom não corre animações nenhumas — quem acaba a aterragem num browser
     * é o `animationend`, e aqui dispara-se à mão.
     *
     * Os DOIS nomes, e não um: o jsdom não tem `AnimationEvent` nenhum, e o
     * React 19 detecta isso e liga-se ao nome com prefixo (`webkitAnimationEnd`)
     * em vez do normal. Medido com um `onAnimationEnd` cru: o `animationend`
     * não chegava lá e o `webkitAnimationEnd` chegava. Disparar os dois faz o
     * teste medir o que interessa — que o quadro esquece o cartão — em vez de
     * medir qual dos nomes esta versão do jsdom obriga o React a usar.
     */
    const cartao = cartaoDe("Ana e João");
    await act(async () => {
      cartao.dispatchEvent(new Event("webkitAnimationEnd", { bubbles: true }));
      cartao.dispatchEvent(new Event("animationend", { bubbles: true }));
    });
    expect(aterrados()).toHaveLength(0);
  });
});

describe("o cartão apanhado inclina-se — e a inclinação tem de ter transição", () => {
  it("a lista de propriedades cobre `rotate`, que é o que o Tailwind v4 emite", () => {
    render(<Quadro inicial={[pedido()]} />);
    const cartao = cartaoDe("Ana e João");
    fireEvent.dragStart(cartao);

    // O gesto continua a ser o mesmo: 40% de opacidade e um grau de inclinação.
    expect(cartao.className).toContain("motion-safe:rotate-1");
    expect(cartao.className).toContain("opacity-40");

    const lista = /motion-safe:transition-\[([^\]]+)\]/.exec(cartao.className)?.[1] ?? "";
    expect(lista, "o cartão perdeu a lista de transição").not.toBe("");
    expect(
      lista.split(","),
      "`transform` NÃO cobre `rotate` no Tailwind v4 (`.rotate-1 { rotate: 1deg }`, compilado " +
        "nesta casa): sem `rotate` na lista, a inclinação de quem vai a voar entra a corte seco " +
        "de 0 ms enquanto a opacidade ao lado leva 120 ms. É o mesmo engano que o " +
        "`ui/movimento.ts` conta sobre o `scale-[0.98]` do `Button`.",
    ).toContain("rotate");
    // A opacidade continua lá: é ela que diz qual é o cartão que vai a voar.
    expect(lista.split(",")).toContain("opacity");
  });

  it("e continua a correr no degrau de estado da casa, 120 ms", () => {
    render(<Quadro inicial={[pedido()]} />);
    expect(cartaoDe("Ana e João").className).toContain("motion-safe:duration-[120ms]");
  });
});
