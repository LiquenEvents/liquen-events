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

  it("a entrada espera pelo instante em que o pano sobe — e não por um sinal do guião", () => {
    /**
     * ── ISTO JÁ ESTEVE AGARRADO A UM ATRIBUTO ─────────────────────────────
     *
     * Era `html[data-cortina="a-sair"] .prop-folha`: o guião punha o atributo
     * no instante em que DECIDIA levantar a cortina, e a folha entrava com
     * ele.
     *
     * O guião deixou de decidir isso. Quem manda no tempo do pano passou a ser
     * o CSS, numa animação só — ela mandou o ficheiro e sublinhou-a: «fica
     * parado 2 segundos e sobe nos últimos 270 ms». O atributo já não aparece,
     * e uma regra pendurada nele nunca mais correria: a folha da proposta
     * entrava parada, e ninguém dava por isso porque uma animação que não
     * corre não deixa rasto.
     *
     * Passa a esperar pelo mesmo instante que o zoom da capa do sítio espera,
     * escrito uma vez no `:root`. E ganha a propriedade que o `hero-settle` já
     * tinha: num dia em que o JavaScript não corra, isto continua a acontecer.
     */
    expect(BLOCO, "a entrada deixou de esperar pelo instante da subida").toMatch(
      /\.prop-abertura \{[\s\S]*?var\(--cortina-sobe\)/,
    );
    expect(
      BLOCO.replace(/\/\*[\s\S]*?\*\//g, ""),
      "voltou a estar pendurada num sinal que o guião já não dá",
    ).not.toContain('data-cortina="a-sair"');
  });
});

describe("a escada das distâncias", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * O TEXTO DESCREVIA QUATRO DEGRAUS E O CÓDIGO TINHA UM
   * ════════════════════════════════════════════════════════════════════════
   *
   * O comentário do `globals.css` dizia, com números: bloco 8 px, fotografia
   * 12, secção 14, e o TOTAL A PAGAR 20 — «o único acima de 14». O CSS tinha
   * uma regra só, `translateY(var(--sobe, 12px))`, e o `--sobe` NUNCA foi
   * declarado em lado nenhum. Ou seja: tudo subia 12 px, e o texto mentia.
   *
   * Perdeu-se numa correcção — os degraus estavam escritos em linha no TSX e o
   * teste do portão do AVIF apanhou-os por engano, porque uma cadeia como
   * «8px» tem a forma de uma fatia de `sizes`. Tirei-os de lá e não os voltei a
   * pôr no CSS.
   *
   * Não se perde outra vez: o que este caso guarda não são os números, é a
   * ESCADA — que os quatro papéis existem, que são distintos, e que a ordem é
   * a que o desenho diz. Mudar um número passa aqui; apagar um degrau não.
   */
  const DEGRAUS = ["bloco", "foto", "seccao", "total"] as const;

  /** A distância de cada papel, lida do CSS. */
  function degraus(): Map<string, number> {
    const out = new Map<string, number>();
    for (const papel of DEGRAUS) {
      const m = new RegExp(
        `\\[data-sobe="${papel}"\\]\\.por-subir \\{[^}]*?translateY\\((\\d+)px\\)`,
      ).exec(BLOCO);
      if (m) out.set(papel, Number(m[1]));
    }
    return out;
  }

  it("os quatro papéis do documento têm o SEU degrau", () => {
    const d = degraus();
    for (const papel of DEGRAUS) {
      expect(
        d.get(papel),
        `o papel «${papel}» ficou sem degrau — volta a subir os 12 px de recurso, ` +
          "como quando isto esteve escrito e por implementar",
      ).toBeGreaterThan(0);
    }
  });

  it("a distância cresce com a importância — e o total é o único acima de 14", () => {
    const d = degraus();
    const ordem = DEGRAUS.map((p) => d.get(p) ?? 0);
    for (let i = 1; i < ordem.length; i++) {
      expect(
        ordem[i],
        `«${DEGRAUS[i]}» (${ordem[i]}px) não sobe mais do que «${DEGRAUS[i - 1]}» (${ordem[i - 1]}px) — ` +
          "a distância é o que diz a importância",
      ).toBeGreaterThan(ordem[i - 1]);
    }
    expect(d.get("total"), "o total a pagar deixou de ser o único acima de 14").toBeGreaterThan(14);
    for (const papel of ["bloco", "foto", "seccao"] as const) {
      expect(
        d.get(papel),
        `«${papel}» passou os 14 px — a escada perdeu o topo`,
      ).toBeLessThanOrEqual(14);
    }
  });

  it("e continua a ser sempre pequena — isto é para se sentir, não para se ver", () => {
    // A regra da casa está escrita no próprio bloco: «a distância diz a
    // importância, e é sempre pequena». Um degrau grande num documento que
    // alguém está a ler rouba-lhe a linha que está a seguir.
    for (const [papel, px] of degraus()) {
      expect(
        px,
        `«${papel}» sobe ${px}px — é movimento a mais num documento que se lê`,
      ).toBeLessThanOrEqual(24);
    }
  });
});

describe("o arranque não obriga o browser a recalcular a página a cada volta", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * MEDIR UM, ARMAR UM, MEDIR O SEGUINTE
   * ════════════════════════════════════════════════════════════════════════
   *
   * `getBoundingClientRect()` é uma LEITURA de geometria; `classList.add` é
   * uma ESCRITA que invalida o estilo. Alternadas, cada leitura obriga o
   * browser a recalcular estilo e disposição antes de responder — uma paragem
   * síncrona por elemento, no arranque, no fio principal, que é justamente o
   * momento em que ele está mais ocupado.
   *
   * CONTADO: com os 57 elementos que o documento marca hoje, 50 paragens
   * forçadas; com os 65 a que os grupos de serviços e as fases do cronograma
   * o levam, 58. Com duas voltas, zero.
   *
   * O que este caso guarda não é a FORMA do ciclo — é a PROPRIEDADE: depois da
   * primeira escrita, não se volta a ler. Quem o reescrever de outra maneira
   * passa aqui à mesma, desde que a mantenha.
   */
  function ordemDasChamadas(quantos: number, acimaDaDobra: number) {
    document.body.innerHTML = "";
    const ordem: string[] = [];
    const original = DOMTokenList.prototype.add;
    const espia = vi.spyOn(DOMTokenList.prototype, "add").mockImplementation(function (
      this: DOMTokenList,
      ...classes: string[]
    ) {
      ordem.push("escreve");
      return original.apply(this, classes);
    });

    for (let i = 0; i < quantos; i++) {
      const el = document.createElement("div");
      el.setAttribute("data-sobe", "bloco");
      const top = i < acimaDaDobra ? 40 * i : 900 + 300 * i;
      el.getBoundingClientRect = () => {
        ordem.push("lê");
        return { top } as DOMRect;
      };
      document.body.appendChild(el);
    }

    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe() {}
        unobserve() {}
      },
    );
    Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    new Function(GUIAO_DO_MOVIMENTO)();
    espia.mockRestore();
    return ordem;
  }

  it("lê a página toda ANTES de escrever a primeira classe", () => {
    const ordem = ordemDasChamadas(57, 6);
    expect(ordem.filter((o) => o === "lê").length, "não chegou a medir todos").toBe(57);

    let paragens = 0;
    for (let i = 1; i < ordem.length; i++) {
      if (ordem[i] === "lê" && ordem[i - 1] === "escreve") paragens++;
    }
    expect(
      paragens,
      `voltou a ler a geometria depois de escrever, ${paragens} vezes — cada ` +
        "uma dessas é o browser a recalcular a página inteira, no arranque",
    ).toBe(0);
  });

  it("e continua a armar exactamente os mesmos elementos, pela mesma ordem", () => {
    /**
     * A prova de que as duas voltas não mudam o resultado — e a razão de ser
     * seguro: o que se escreve é `transform`, que não mexe na disposição de
     * ninguém, portanto nenhum `top` medido na primeira volta pode ser
     * alterado pelo que a segunda escreve.
     */
    document.body.innerHTML = "";
    const tops = [10, 40, 5000, 80, 6000, 7000];
    const els = tops.map((top) => {
      const el = document.createElement("div");
      el.setAttribute("data-sobe", "bloco");
      el.getBoundingClientRect = () => ({ top }) as DOMRect;
      document.body.appendChild(el);
      return el;
    });
    const observados: Element[] = [];
    vi.stubGlobal("matchMedia", () => ({ matches: false }));
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        observe(el: Element) {
          observados.push(el);
        }
        unobserve() {}
      },
    );
    Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
    new Function(GUIAO_DO_MOVIMENTO)();

    // dobra = 768 × 0,9 = 691,2 no jsdom
    expect(els.map((e) => e.classList.contains("por-subir"))).toEqual([
      false,
      false,
      true,
      false,
      true,
      true,
    ]);
    expect(observados, "a ordem de observação mudou").toEqual([els[2], els[4], els[5]]);
  });
});
