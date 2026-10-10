// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { act, cleanup, render, screen } from "@testing-library/react";
import { LinhaDeCarregamento } from "./LinhaDeCarregamento";
import { pt } from "@/lib/i18n/pt";
import { en } from "@/lib/i18n/en";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A LINHA SÓ APARECE QUANDO A PÁGINA DEMORA — E SABE SEMPRE ACABAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a 10/10: «quero também retirar aquela página branca com o
 * símbolo da Líquen no meio». Escolheu «Linha fina no topo».
 *
 * O que se guarda aqui: a página onde se está nunca é tapada (nada de ecrã
 * inteiro, nada de logótipo), uma navegação rápida não pinta nada, e a linha
 * nunca fica pendurada — um clique que afinal não navegava, Voltar, ou uma
 * chegada que nunca acontece.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const BLOCO = CSS.slice(
  CSS.indexOf("A LINHA DE QUE UMA PÁGINA ESTÁ A DEMORAR"),
  CSS.indexOf("O MOVIMENTO DA PROPOSTA"),
);

const H = vi.hoisted(() => ({ caminho: "/pt" }));
vi.mock("next/navigation", () => ({ usePathname: () => H.caminho }));

const visivel = () => !!document.querySelector(".linha-a-caminho");

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

describe("a linha de que uma página está a demorar", () => {
  it("não existe no ecrã enquanto não se clicar em nada", () => {
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    expect(visivel()).toBe(false);
  });

  it("aparece ao clicar num link interno, e sai quando a página chega", () => {
    const { rerender } = render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria");
    expect(visivel()).toBe(true);

    // A chegada: o caminho passou a ser outro.
    H.caminho = "/pt/galeria";
    act(() => rerender(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />));
    expect(visivel(), "chegou — o aviso não tem mais nada a dizer").toBe(false);
  });

  it("se a página demorou, a linha enche-se até ao fim antes de se apagar", () => {
    // Uma linha que pára a 80 % e some parece que falhou.
    const { rerender } = render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria");
    act(() => void vi.advanceTimersByTime(600));
    H.caminho = "/pt/galeria";
    act(() => rerender(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />));
    expect(document.querySelector(".linha-a-caminho")?.getAttribute("data-fase")).toBe("chegou");
    act(() => void vi.advanceTimersByTime(250));
    expect(visivel()).toBe(false);
  });

  it("um link para a MESMA página não o acende — é a armadilha desta peça", () => {
    /**
     * Uma âncora (`#contactos`) ou o link da página onde já se está não mudam
     * o caminho. Sem esta guarda, o aviso ficava à espera de uma chegada que
     * nunca acontecia — a linha a correr por cima de uma página que já lá
     * estava, até ao tecto dos oito segundos.
     */
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt");
    expect(visivel()).toBe(false);
    clicar("#contactos");
    expect(visivel()).toBe(false);
  });

  it("não se acende no que sai desta aplicação", () => {
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
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
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria", { target: "_blank" });
    expect(visivel(), "target=_blank abre outro separador").toBe(false);
    clicar("/pt/galeria", { metaKey: true });
    expect(visivel(), "cmd+clique abre outro separador").toBe(false);
    clicar("/pt/galeria", { button: 1 });
    expect(visivel(), "o botão do meio abre outro separador").toBe(false);
  });

  it("desiste ao fim de oito segundos — a linha nunca fica pendurada", () => {
    // Se a chegada nunca acontecer (uma navegação que morreu, uma rota que
    // rebentou), um indicador de espera que não sabe acabar é a própria avaria
    // que ele existe para evitar.
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria");
    expect(visivel()).toBe(true);
    act(() => void vi.advanceTimersByTime(8_000));
    expect(visivel()).toBe(false);
  });

  it("a espera tem NOME para quem ouve o ecrã", () => {
    // A regra dela: «nunca um estado de espera sem nome». Uma linha a correr
    // não é um nome.
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria");
    const aviso = screen.getByRole("status");
    expect(aviso.textContent).toMatch(/abrir/i);
  });

  it("em inglês, o nome vem em inglês", () => {
    render(<LinhaDeCarregamento rotulo={en.common.aAbrir} />);
    clicar("/en/galeria");
    expect(screen.getByRole("status").textContent).toMatch(/opening/i);
  });
});

describe("e o que o CSS tem de prometer", () => {
  it("nasce invisível e só aparece se a navegação demorar mesmo", () => {
    expect(BLOCO).toMatch(/\.linha-a-caminho \{[\s\S]*?opacity: 0;/);
    expect(BLOCO).toMatch(/linha-a-aparecer[^;]*0\.15s forwards/);
  });

  it("é uma linha no topo, não um ecrã — a página onde se está fica à vista", () => {
    const regra = BLOCO.match(/\.linha-a-caminho \{[^}]*\}/)![0];
    expect(regra).toContain("top: 0");
    expect(regra).toContain("height: 2px");
    expect(regra).toContain("pointer-events: none");
    expect(regra, "um ecrã inteiro era o que ela pediu para tirar").not.toMatch(
      /inset: 0|bottom: 0/,
    );
    expect(regra).not.toMatch(/background/);
  });

  it("não há logótipo nenhum", () => {
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria");
    expect(document.querySelector(".linha-a-caminho img")).toBeNull();
  });

  it("só anima `transform` e `opacity`", () => {
    const quadros = BLOCO.match(/@keyframes linha-[\s\S]*?\n}\n/g) ?? [];
    expect(quadros.length).toBe(3);
    for (const q of quadros) {
      for (const p of [...q.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1])) {
        expect(["opacity", "transform"]).toContain(p);
      }
    }
  });

  it("com movimento reduzido a linha pára — mas não desaparece, e o atraso funciona mesmo", () => {
    /**
     * O aviso antigo tinha `transition-delay` sem `transition`: não atrasava
     * nada, e quem pediu menos movimento via o logótipo em TODOS os cliques.
     * Aqui o atraso está numa animação de duração zero, que atrasa de facto.
     */
    const calmo = BLOCO.slice(BLOCO.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(calmo).toMatch(
      /\.linha-a-caminho \{\s*animation: linha-a-aparecer 0s linear 0\.15s forwards;/,
    );
    expect(calmo).not.toMatch(/transition-delay/);
    expect(calmo).not.toMatch(/\.linha-a-caminho \{[^}]*display: none/);
  });

  it("carregar em VOLTAR apaga-o — mesmo que o caminho não mude", () => {
    /**
     * A armadilha do lado do histórico, irmã da que já estava fechada do lado
     * do clique. Alguém carrega num link, o aviso aparece, e essa pessoa
     * carrega em Voltar para a página onde já estava: o caminho nunca muda, o
     * efeito que o apaga nunca corre, e a linha ficava a correr por cima
     * de uma página que já lá estava até ao tecto dos oito segundos.
     */
    render(<LinhaDeCarregamento rotulo={pt.common.aAbrir} />);
    clicar("/pt/galeria");
    expect(visivel()).toBe(true);
    act(() => void window.dispatchEvent(new Event("popstate")));
    expect(visivel(), "voltar quer dizer que a navegação foi abandonada").toBe(false);
  });
});
