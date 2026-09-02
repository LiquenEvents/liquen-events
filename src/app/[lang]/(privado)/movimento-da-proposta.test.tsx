// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { GUIAO_DO_MOVIMENTO } from "./MovimentoDaProposta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O MOVIMENTO NUNCA PODE DEIXAR UMA PROPOSTA EM BRANCO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero animações pelo PDF todo — quero que aquilo fique
 * espetacularmente bom».
 *
 * O que se guarda aqui não é que seja bonito. É que, quando falhar, falhe do
 * lado certo. Um documento de vinte mil euros que chega em branco porque um
 * guião não correu é a pior coisa que este ficheiro pode permitir — e esta
 * casa já lá foi duas vezes, das duas por um `opacity: 0` à espera de
 * JavaScript.
 *
 * Daí a regra: o estado escondido NÃO EXISTE no CSS. Só aparece quando o
 * guião o põe, elemento a elemento. Nenhum guião, nenhuma classe, nenhum
 * elemento fora do sítio.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const BLOCO = CSS.slice(CSS.indexOf("O MOVIMENTO DA PROPOSTA"));

function montar({ calmo = false, semObservador = false } = {}) {
  document.body.innerHTML = `
    <div id="acima" data-sobe style="--sobe:14px"></div>
    <div id="abaixo" data-sobe style="--sobe:12px"></div>`;
  const acima = document.getElementById("acima")!;
  const abaixo = document.getElementById("abaixo")!;
  acima.getBoundingClientRect = () => ({ top: 10 }) as DOMRect;
  abaixo.getBoundingClientRect = () => ({ top: 5000 }) as DOMRect;

  vi.stubGlobal("matchMedia", () => ({ matches: calmo }));
  const observados: Element[] = [];
  let disparar: ((es: unknown[]) => void) | null = null;
  if (semObservador) {
    // @ts-expect-error — a apagar de propósito, como num browser antigo
    delete window.IntersectionObserver;
  } else {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(cb: (es: unknown[]) => void) {
          disparar = cb;
        }
        observe(el: Element) {
          observados.push(el);
        }
        unobserve() {}
      },
    );
  }
  Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
  new Function(GUIAO_DO_MOVIMENTO)();
  return { acima, abaixo, observados, disparar: () => disparar };
}

beforeEach(() => {
  Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("o movimento da proposta", () => {
  it("o CSS NÃO esconde nada por sua conta — o estado escondido pede a classe", () => {
    /**
     * A regra que sustenta tudo o resto. Se `[data-sobe]` sozinho já
     * deslocasse o elemento, um guião que não corresse deixava o documento
     * inteiro fora do sítio — ou pior, com a opacidade a zero, invisível.
     */
    expect(BLOCO).toMatch(/\[data-sobe\]\.por-subir \{/);
    expect(BLOCO, "o atributo sozinho não pode mexer em nada").not.toMatch(
      /\[data-sobe\]\s*\{[^}]*transform/,
    );
  });

  it("e NUNCA toca na opacidade — é assim que se serve um documento em branco", () => {
    // Duas vezes já aconteceu nesta casa, das duas por um `opacity: 0` à
    // espera de JavaScript. A terceira não é aqui.
    const regras = BLOCO.match(/\[data-sobe\][^{]*\{[^}]*\}/g) ?? [];
    expect(regras.length).toBeGreaterThan(0);
    for (const r of regras) expect(r).not.toContain("opacity");
    expect(BLOCO).not.toMatch(/@keyframes prop-entrada[\s\S]*?opacity/);
  });

  it("arma só o que está abaixo da dobra — o que já se vê não salta", () => {
    // Armar um elemento que já está no ecrã fá-lo saltar para baixo e subir
    // outra vez, à frente de quem está a olhar.
    const { acima, abaixo, observados } = montar();
    expect(acima.classList.contains("por-subir"), "este já se via").toBe(false);
    expect(abaixo.classList.contains("por-subir")).toBe(true);
    expect(observados).toEqual([abaixo]);
  });

  it("e larga cada elemento assim que ele chega", () => {
    const { abaixo, disparar } = montar();
    disparar()!([{ isIntersecting: true, target: abaixo }]);
    expect(abaixo.classList.contains("subiu")).toBe(true);
  });

  it("quem pediu menos movimento não leva nada — e nada fica fora do sítio", () => {
    const { acima, abaixo, observados } = montar({ calmo: true });
    expect(acima.classList.contains("por-subir")).toBe(false);
    expect(abaixo.classList.contains("por-subir"), "sai ANTES de armar").toBe(false);
    expect(observados).toEqual([]);
  });

  it("num browser sem `IntersectionObserver`, a proposta fica parada e inteira", () => {
    /**
     * O caso que interessa mesmo: um telemóvel antigo. Nada de movimento, e
     * sobretudo nada escondido à espera de um observador que não existe.
     *
     * ── O QUE ESTE CASO PROVA, E O QUE NÃO PROVA ──────────────────────────
     *
     * Prova o RESULTADO: nenhum elemento fica fora do sítio.
     *
     * NÃO prova a linha `if(!("IntersectionObserver" in window))return`. Tirei-a
     * para ver, e o teste passou na mesma — porque o `try/catch` à volta do
     * guião já apanha o `new IntersectionObserver` a rebentar, e nessa altura
     * ainda não foi armado nada. As duas defesas dão o mesmo fim.
     *
     * Fica escrito para ninguém pensar que este caso guarda a guarda. Ela
     * continua lá por ser mais barata e mais honesta do que uma excepção
     * apanhada — mas quem a tirar não parte nada, e é justo dizê-lo.
     */
    const { acima, abaixo } = montar({ semObservador: true });
    expect(acima.classList.contains("por-subir")).toBe(false);
    expect(abaixo.classList.contains("por-subir")).toBe(false);
  });

  it("uma avaria no guião não derruba a página", () => {
    document.body.innerHTML = `<div data-sobe></div>`;
    vi.stubGlobal("matchMedia", () => {
      throw new Error("rebentou");
    });
    Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    expect(() => new Function(GUIAO_DO_MOVIMENTO)()).not.toThrow();
    expect(document.querySelector("[data-sobe]")?.classList.contains("por-subir")).toBe(false);
  });

  it("a entrada do documento acaba em `transform: none`, e é `backwards`", () => {
    /**
     * O visualizador de fotografias desta página é `position: fixed` dentro
     * do documento. Um `transform` que fique pendurado num antepassado passa
     * a ser o bloco de contenção dele, e a lupa deixa de cobrir o ecrã — é a
     * lição do `.view-in`, escrita neste mesmo ficheiro.
     */
    expect(BLOCO).toMatch(/animation: prop-entrada[^;]*backwards/);
    expect(BLOCO).toMatch(/@keyframes prop-entrada \{[\s\S]*?to \{\s*transform: none;/);
    expect(BLOCO, "`forwards` deixava o bloco de contenção montado").not.toMatch(
      /prop-entrada[^;]*forwards/,
    );
  });

  it("a entrada só corre quando a cortina anuncia que está a subir", () => {
    // Sem o atributo — JavaScript desligado, segunda visita no mesmo
    // separador, movimento reduzido — não há animação nenhuma e a página é a
    // de sempre.
    expect(BLOCO).toMatch(/html\[data-cortina="a-sair"\] \.prop-folha/);
  });
});
