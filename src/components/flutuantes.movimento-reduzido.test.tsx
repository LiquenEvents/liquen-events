// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import StickyCTA from "./StickyCTA";
import WhatsAppButton from "./WhatsAppButton";
import { LocaleProvider } from "./LocaleProvider";
import { getDictionary, pickChromeDict } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS DOIS BOTÕES QUE ANDAM SEMPRE COM O VISITANTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O CTA "Pedir orçamento" e a pílula de WhatsApp são os únicos elementos do
 * sítio que estão em TODAS as páginas e que aparecem e desaparecem SOZINHOS,
 * a meio do scroll: entram quando se passa 75% de um ecrã e recolhem quando o
 * rodapé chega. Cada entrada é `translate-y-4 → translate-y-0` em 500 ms — um
 * transform, não uma mudança de cor —, e a pílula ainda CRESCE (`scale-105`)
 * quando o rato lhe passa por cima.
 *
 * Nada disso estava gatilhado por `prefers-reduced-motion`, e o sítio não tem
 * (de propósito) nenhuma regra geral que desligue transições — cada movimento
 * é desligado no sítio onde é escrito, como já acontece na seta do PhotoWall e
 * nos pontos do carrossel de testemunhos. Ou seja: quem liga o movimento
 * reduzido — e quem o liga tem uma razão médica — via mesmo assim duas coisas
 * a deslizar e a crescer no canto do ecrã, em todas as páginas, a cada scroll.
 *
 * A ordem das classes do Tailwind não é opinião aqui: uma variante
 * (`motion-reduce:`) é emitida DEPOIS da utilidade sem variante, portanto
 * `motion-reduce:translate-y-0` ganha ao `translate-y-4` sem `!important`.
 */

vi.mock("next/navigation", () => ({ usePathname: () => "/sobre" }));

const t = await getDictionary("pt");

function montar(node: React.ReactNode) {
  return render(
    <LocaleProvider locale="pt" dict={pickChromeDict(t)}>
      {node}
    </LocaleProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** Ambos os componentes só se desenham depois de o browser estar ocioso. */
function passarOOcioso() {
  act(() => vi.advanceTimersByTime(500));
}

describe("os flutuantes e o movimento reduzido", () => {
  it("o CTA fixo não desliza para dentro do ecrã", () => {
    montar(<StickyCTA />);
    passarOOcioso();
    const caixa = screen.getByRole("link", {
      name: new RegExp(t.footer.pedirOrcamento, "i"),
    }).parentElement!;

    expect(caixa.className, "a entrada é um translate de 16px").toContain("translate-y-4");
    expect(caixa.className, "e nada a desliga para quem pediu menos movimento").toContain(
      "motion-reduce:transition-none",
    );
    expect(caixa.className).toContain("motion-reduce:translate-y-0");
  });

  it("a seta do CTA fixo não corre para a direita ao passar o rato", () => {
    montar(<StickyCTA />);
    passarOOcioso();
    const seta = screen.getByRole("link", {
      name: new RegExp(t.footer.pedirOrcamento, "i"),
    }).lastElementChild!;
    expect(seta.className).toContain("group-hover:translate-x-0.5");
    expect(seta.className).toContain("motion-reduce:group-hover:translate-x-0");
    expect(seta.className).toContain("motion-reduce:transition-none");
  });

  it("a pílula de WhatsApp não desliza nem cresce por baixo do rato", () => {
    montar(<WhatsAppButton />);
    passarOOcioso();
    const pilula = screen.getByRole("link", { name: new RegExp(t.common.contactWhatsApp, "i") });

    expect(pilula.className).toContain("translate-y-4");
    expect(pilula.className, "a entrada continua a deslizar").toContain(
      "motion-reduce:transition-none",
    );
    expect(pilula.className).toContain("motion-reduce:translate-y-0");
    // `hover:scale-105` é o único crescimento permanente do cromado do sítio.
    expect(pilula.className).toContain("hover:scale-105");
    expect(pilula.className, "e continua a crescer debaixo do rato").toContain(
      "motion-reduce:hover:scale-100",
    );
  });
});
