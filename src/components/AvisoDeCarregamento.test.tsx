// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
import { AvisoDeCarregamento } from "./AvisoDeCarregamento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O LOGÓTIPO SÓ APARECE QUANDO A PÁGINA DEMORA — E SABE SEMPRE ACABAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «caso demore tempo, quero que coloques aquela animação de
 * está a carregar e metemos o logo».
 *
 * Esta peça tem a regra OPOSTA à da cortina, e é isso que se guarda aqui. A
 * cortina vê-se sempre, porque é marca. Isto é informação, e informação que
 * não é precisa é ruído: uma navegação instantânea com um flash de logótipo
 * pelo meio parece uma avaria.
 *
 * E o defeito clássico de um indicador destes é ficar pendurado — um clique
 * que afinal não navegava, e o logótipo a respirar por cima de uma página que
 * já lá estava. Metade destes casos são sobre isso.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const BLOCO = CSS.slice(CSS.indexOf("O AVISO DE QUE UMA PÁGINA ESTÁ A DEMORAR"));

const H = vi.hoisted(() => ({ caminho: "/pt" }));
vi.mock("next/navigation", () => ({ usePathname: () => H.caminho }));
vi.mock("next/image", () => ({
  default: ({ className, alt }: { className?: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={className} alt={alt} />
  ),
}));

const visivel = () => !!document.querySelector(".a-caminho");

/** Um clique num `<a>`, como o browser o entrega: na fase de captura. */
function clicar(href: string, extra: Partial<MouseEventInit> & { target?: string } = {}) {
  const a = document.createElement("a");
  a.setAttribute("href", href);
  if (extra.target) a.setAttribute("target", extra.target);
  document.body.appendChild(a);
  act(() => {
    a.dispatchEvent(new MouseEvent("click", { bubbles: true, button: 0, ...extra }));
  });
  return a;
}

beforeEach(() => {
  H.caminho = "/pt";
  window.history.replaceState({}, "", "/pt");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
  vi.useRealTimers();
});

describe("o aviso de que uma página está a demorar", () => {
  it("não existe no ecrã enquanto não se clicar em nada", () => {
    render(<AvisoDeCarregamento locale="pt" />);
    expect(visivel()).toBe(false);
  });

  it("aparece ao clicar num link interno, e sai quando a página chega", () => {
    const { rerender } = render(<AvisoDeCarregamento locale="pt" />);
    clicar("/pt/galeria");
    expect(visivel()).toBe(true);

    // A chegada: o caminho passou a ser outro.
    H.caminho = "/pt/galeria";
    act(() => rerender(<AvisoDeCarregamento locale="pt" />));
    expect(visivel(), "chegou — o aviso não tem mais nada a dizer").toBe(false);
  });

  it("um link para a MESMA página não o acende — é a armadilha desta peça", () => {
    /**
     * Uma âncora (`#contactos`) ou o link da página onde já se está não mudam
     * o caminho. Sem esta guarda, o aviso ficava à espera de uma chegada que
     * nunca acontecia — o logótipo a respirar por cima de uma página que já lá
     * estava, até ao tecto dos oito segundos.
     */
    render(<AvisoDeCarregamento locale="pt" />);
    clicar("/pt");
    expect(visivel()).toBe(false);
    clicar("#contactos");
    expect(visivel()).toBe(false);
  });

  it("não se acende no que sai desta aplicação", () => {
    render(<AvisoDeCarregamento locale="pt" />);
    for (const href of [
      "https://instagram.com/liquen.events",
      "mailto:a@b.pt",
      "tel:+351919259820",
    ]) {
      clicar(href);
      expect(visivel(), `${href} não é uma navegação nossa`).toBe(false);
    }
  });

  it("não se acende num clique que abre noutro sítio", () => {
    render(<AvisoDeCarregamento locale="pt" />);
    clicar("/pt/galeria", { target: "_blank" });
    expect(visivel(), "target=_blank abre outro separador").toBe(false);
    clicar("/pt/galeria", { metaKey: true });
    expect(visivel(), "cmd+clique abre outro separador").toBe(false);
    clicar("/pt/galeria", { button: 1 });
    expect(visivel(), "o botão do meio abre outro separador").toBe(false);
  });

  it("desiste ao fim de oito segundos — ninguém fica preso a olhar para o logótipo", () => {
    // Se a chegada nunca acontecer (uma navegação que morreu, uma rota que
    // rebentou), um indicador de espera que não sabe acabar é a própria avaria
    // que ele existe para evitar.
    render(<AvisoDeCarregamento locale="pt" />);
    clicar("/pt/galeria");
    expect(visivel()).toBe(true);
    act(() => void vi.advanceTimersByTime(8_000));
    expect(visivel()).toBe(false);
  });

  it("a espera tem NOME para quem ouve o ecrã", () => {
    // A regra dela: «nunca um estado de espera sem nome». Um logótipo a
    // respirar é bonito e não é um nome.
    render(<AvisoDeCarregamento locale="pt" />);
    clicar("/pt/galeria");
    const aviso = screen.getByRole("status");
    expect(aviso.textContent).toMatch(/abrir/i);
  });

  it("em inglês, o nome vem em inglês", () => {
    render(<AvisoDeCarregamento locale="en" />);
    clicar("/en/galeria");
    expect(screen.getByRole("status").textContent).toMatch(/opening/i);
  });
});

describe("e o que o CSS tem de prometer", () => {
  it("nasce invisível e só aparece se a navegação demorar mesmo", () => {
    // A regra oposta à da cortina: aqui NÃO há mínimo nenhum. Uma navegação
    // rápida monta isto, não pinta um pixel, e desmonta.
    expect(BLOCO).toMatch(/\.a-caminho \{[\s\S]*?opacity: 0;/);
    expect(BLOCO).toMatch(/aviso-a-aparecer[^;]*0\.4s forwards/);
  });

  it("só anima `transform` e `opacity`", () => {
    const quadros = BLOCO.match(/@keyframes aviso-[\s\S]*?\n}\n/g) ?? [];
    expect(quadros.length).toBe(2);
    for (const q of quadros) {
      for (const p of [...q.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1])) {
        expect(["opacity", "transform"]).toContain(p);
      }
    }
  });

  it("com movimento reduzido o logótipo pára — mas o aviso NÃO desaparece", () => {
    /**
     * A diferença que importa entre esta peça e a cortina.
     *
     * A cortina é decoração: quem pediu menos movimento não leva nenhuma. Esta
     * é o que diz que algo está a acontecer, e isso nunca pode faltar — seria
     * trocar «menos movimento» por «menos informação», que não é o que a
     * pessoa pediu.
     */
    const calmo = BLOCO.slice(BLOCO.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(calmo).toContain("animation: none");
    expect(calmo, "apagar a peça era tirar a informação a quem pediu calma").not.toMatch(
      /\.a-caminho \{[^}]*display: none/,
    );
  });
});
