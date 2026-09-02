// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Cortina, GUIAO } from "./Cortina";
import { getDictionary } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PANO SAI SOZINHO — E ESSA É A REGRA QUE MANDA EM TODAS AS OUTRAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela mandou a cortina do outro produto dela e disse «é isto», sublinhando as
 * duas peças: o `@keyframes cortina-segurar` («fica parado 2 segundos e sobe
 * nos últimos 270 ms») e a escada das distâncias («10px, 20px, 30px»).
 *
 * A consequência maior não é de gosto. Com uma animação só a fazer as duas
 * coisas, a saída passa a ser CSS puro: não há temporizador, não há JavaScript
 * a decidir nada. O argumento está escrito no ficheiro dela — «um preloader
 * que precise de JavaScript para sair é um ecrã preto permanente no dia em que
 * o script falhar, e esse dia chega sempre».
 *
 * Este ficheiro guarda isso primeiro, e o resto depois.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
/** Só o bloco da cortina, para não apanhar as outras animações do ficheiro. */
const BLOCO = CSS.slice(CSS.indexOf("@keyframes cortina-grupo"));
const RAIZ = /:root \{[\s\S]*?\n\}/.exec(CSS)?.[0] ?? "";

const ms = (nome: string) => Number(new RegExp(`${nome}:\\s*(\\d+)ms`).exec(RAIZ)?.[1]);
const TOTAL = ms("--cortina-total");
const SOBE = ms("--cortina-sobe");

/** Monta a cortina no documento e corre o guião, como o navegador faria. */
function montar(atributos = "") {
  document.body.innerHTML = `<div class="cortina" ${atributos}></div><script id="g"></script>`;
  Object.defineProperty(document, "currentScript", {
    value: document.getElementById("g"),
    configurable: true,
  });
  new Function(GUIAO)();
  const el = () => document.querySelector(".cortina")!;
  return { el, fora: () => el().classList.contains("cortina--fora") };
}

afterEach(cleanup);

describe("a saída não depende de ninguém", () => {
  it("é uma animação de CSS, e não um temporizador", () => {
    /**
     * O caso que sustenta o desenho todo. Se alguém voltar a pôr o JavaScript
     * a decidir a saída, um script bloqueado passa a ser um ecrã verde
     * permanente por cima da proposta de um casal — que é a avaria que este
     * ficheiro já viu uma vez, medida num Chromium: sete segundos de pano.
     */
    expect(BLOCO, "a `.cortina` deixou de sair por animação").toMatch(
      /\.cortina \{[\s\S]*?animation: cortina-segurar var\(--cortina-total\)/,
    );
    expect(GUIAO, "voltou a haver um temporizador a decidir a saída").not.toContain("setTimeout");
  });

  it("fica parado quase todo o tempo e sobe no fim — é a forma dela", () => {
    // `0%, 88%` parado e `100%` fora do ecrã. Uma animação só: se fossem duas,
    // ou um atraso mais uma subida, voltava a ser possível uma delas não
    // correr e a outra sim.
    const quadro = /@keyframes cortina-segurar \{[\s\S]*?\n\}/.exec(BLOCO)?.[0] ?? "";
    expect(quadro, "desapareceu o `cortina-segurar`").not.toBe("");
    expect(quadro).toMatch(/0%,\s*88%\s*\{\s*transform: translateY\(0\)/);
    expect(quadro).toMatch(/100%\s*\{\s*transform: translateY\(-100%\)/);
  });

  it("o instante da subida é o mesmo em toda a casa, e escrito uma vez", () => {
    /**
     * `--cortina-sobe` é 88% de `--cortina-total`, e é por ele que esperam o
     * zoom da capa do sítio e a folha da proposta. Dois números que se
     * separassem punham o que está por baixo a entrar antes ou depois do pano
     * — duas coisas em vez de um gesto.
     */
    expect(TOTAL, "desapareceu o `--cortina-total`").toBeGreaterThan(0);
    expect(SOBE, "desapareceu o `--cortina-sobe`").toBeGreaterThan(0);
    expect(
      Math.round((SOBE / TOTAL) * 100),
      `o pano sobe aos ${Math.round((SOBE / TOTAL) * 100)}% e a animação diz 88%`,
    ).toBe(88);

    for (const [quem, regra] of [
      ["o zoom da capa", /html:not\(\[data-navigated\]\) \.hero-settle \{[\s\S]*?\n {2}\}/],
      ["a folha da proposta", /\.prop-folha \{[\s\S]*?\n {2}\}/],
    ] as const) {
      const m = regra.exec(CSS)?.[0];
      expect(m, `desapareceu ${quem}`).toBeDefined();
      expect(m, `${quem} deixou de esperar pelo instante em que o pano sobe`).toContain(
        "var(--cortina-sobe)",
      );
    }
  });

  it("e nada por baixo fica pendurado num atributo que o guião já não põe", () => {
    // A entrada da proposta estava agarrada a `html[data-cortina="a-sair"]`.
    // O guião deixou de o pôr — quem manda no tempo é o CSS —, e uma regra
    // pendurada nele nunca mais correria: a folha entrava parada.
    const regras = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
    expect(regras, "há uma regra à espera de um sinal que ninguém dá").not.toContain(
      'data-cortina="a-sair"',
    );
  });
});

describe("o mote", () => {
  it("é o lema do estúdio, na língua do casal — e não uma frase inventada", () => {
    for (const locale of ["pt", "en"] as const) {
      const t = getDictionary(locale).footer;
      const { container } = render(<Cortina locale={locale} />);
      const lido = [...container.querySelectorAll(".cortina__grupo")]
        .map((g) => g.textContent)
        .join(" ");
      expect(lido).toBe(`${t.sloganLine1} ${t.sloganLine2}`);
      cleanup();
    }
  });

  it("cada grupo parte de mais longe do que o anterior — é o truque dela", () => {
    /**
     * Palavras dela: «é o DESENCONTRO DAS DISTÂNCIAS que dá a leitura em
     * camadas. Se fosse o atraso a fazer o trabalho, lia-se como três palavras
     * em fila indiana».
     *
     * Portanto o que aqui se guarda são as duas metades: as distâncias SOBEM,
     * e os atrasos são quase nada.
     */
    const { container } = render(<Cortina locale="pt" />);
    const grupos = [...container.querySelectorAll<HTMLElement>(".cortina__grupo")];
    const dy = grupos.map((g) => parseInt(g.style.getPropertyValue("--dy"), 10));
    const atrasos = grupos.map((g) => parseFloat(g.style.animationDelay));

    expect(dy[0], "o primeiro grupo deixou de partir de 10px").toBe(10);
    for (let i = 1; i < dy.length; i++) {
      expect(
        dy[i],
        `o grupo ${i + 1} parte de mais perto do que o anterior`,
      ).toBeGreaterThanOrEqual(dy[i - 1]);
    }
    expect(new Set(dy).size, "as distâncias são todas iguais — não há camadas").toBeGreaterThan(2);
    expect(
      Math.max(...atrasos),
      "os atrasos passaram a fazer o trabalho das distâncias",
    ).toBeLessThanOrEqual(150);
  });

  it("a escada pára no quarto degrau — senão a última palavra cai de outro sítio", () => {
    // O exemplo dela tem três grupos; o lema tem quatro em português e SETE em
    // inglês. Uma escada que continuasse a subir dava 70px à última palavra
    // inglesa: deixava de ser profundidade e passava a ser um salto.
    const { container } = render(<Cortina locale="en" />);
    const dy = [...container.querySelectorAll<HTMLElement>(".cortina__grupo")].map((g) =>
      parseInt(g.style.getPropertyValue("--dy"), 10),
    );
    expect(
      dy.length,
      "o lema inglês devia ter mais grupos do que a escada tem degraus",
    ).toBeGreaterThan(4);
    expect(Math.max(...dy), "a escada continuou a subir sem tecto").toBeLessThanOrEqual(40);
  });

  it("entra, PÁRA para se ler, e sai — é a paragem que faz disto uma frase", () => {
    const quadro = /@keyframes cortina-grupo \{[\s\S]*?\n\}/.exec(BLOCO)?.[0] ?? "";
    expect(quadro, "desapareceu o `cortina-grupo`").not.toBe("");
    expect(quadro, "deixou de haver paragem — voltou a ser um efeito").toMatch(/35%,\s*65%/);
    expect(quadro).toMatch(/0% \{[\s\S]*?opacity: 0/);
    expect(quadro).toMatch(/100% \{[\s\S]*?opacity: 0/);
  });

  it("quebra na vírgula, e não onde calhar", () => {
    // Sem isto, «eternizamos» ficava pendurado no fim da primeira linha em
    // metade dos telemóveis. O lema quebra na vírgula no rodapé do sítio e na
    // contracapa do PDF; aqui quebra no mesmo sítio.
    const { container } = render(<Cortina locale="pt" />);
    const filhos = [...(container.querySelector(".cortina__lema")?.children ?? [])];
    const quebra = filhos.findIndex((f) => f.classList.contains("cortina__quebra"));
    const t = getDictionary("pt").footer;
    expect(quebra, "desapareceu a quebra de linha").toBeGreaterThan(0);
    expect(
      filhos
        .slice(0, quebra)
        .map((f) => f.textContent)
        .join(" "),
      "a quebra deixou de estar na vírgula",
    ).toBe(t.sloganLine1);
    expect(BLOCO).toMatch(/\.cortina__quebra \{[\s\S]*?flex-basis: 100%/);
  });

  it("a letra é do sistema — não há nada por que esperar", () => {
    /**
     * Era a Playfair, e ela pediu esta. O ganho técnico vem de borla e é o que
     * este caso guarda: uma letra do sistema não se descarrega, portanto a
     * frase não pode trocar de forma a meio do movimento.
     *
     * A Playfair chegava lá pelos 300–900 ms — DENTRO do tempo em que as
     * palavras se mexem — e havia uma máquina inteira só para tapar isso.
     */
    const regra = /\.cortina__lema \{[\s\S]*?\n\}/.exec(BLOCO)?.[0] ?? "";
    expect(regra).toMatch(/font-family:[^;]*system-ui/);
    expect(regra, "voltou uma letra que é preciso descarregar").not.toMatch(/var\(--font-/);
    // A casa tem uma máquina para tapar a troca de letra (`fontes-por-assentar`)
    // e ela continua a servir noutros sítios. O que não pode voltar é a regra
    // que a punha em cima DESTE lema: aqui não há letra por que esperar.
    // Sem os comentários: este ficheiro explica a máquina por extenso, e o
    // texto da explicação disparava a rede. Um teste que se apanha a si próprio
    // é um teste que se aprende a ignorar.
    expect(
      CSS.replace(/\/\*[\s\S]*?\*\//g, ""),
      "a máquina de esperar pela letra voltou ao lema, e já não serve",
    ).not.toMatch(/fontes-por-assentar[^{]*\.cortina/);
  });

  it("só anima `transform` e `opacity`", () => {
    // A regra dos 60 fps num iPhone em 4G.
    const quadros = BLOCO.match(/@keyframes cortina-[\s\S]*?\n\}\n/g) ?? [];
    expect(quadros.length).toBeGreaterThanOrEqual(2);
    for (const q of quadros) {
      const props = [...q.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect(["opacity", "transform"]).toContain(p);
    }
  });
});

describe("os estados que o CSS não sabe", () => {
  it("quem pediu menos movimento não leva cortina nenhuma", () => {
    expect(BLOCO).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.cortina \{\s*display: none;/,
    );
    const mm = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal("matchMedia", mm);
    const { fora } = montar();
    expect(mm).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(fora(), "fechada de imediato, sem esperar por animação nenhuma").toBe(true);
    vi.unstubAllGlobals();
  });

  it("ESCONDE-SE, e nunca sai do documento — é o defeito da hidratação", () => {
    /**
     * MEDIDO num Chromium com o JavaScript a chegar 2,5 s depois: removê-la
     * deixava o React a hidratar um `<main>` a que faltava um filho (erro
     * #418), o React reconstruía a subárvore e punha a cortina DE VOLTA — já
     * sem ninguém para a tirar. Ficava no ecrã até aos ~7 s.
     */
    expect(GUIAO, "remover o elemento é o que parte a hidratação").not.toContain(".remove()");
    const { el, fora } = montar();
    el().dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-segurar" }),
    );
    expect(el(), "o elemento tem de continuar onde o servidor o pôs").not.toBeNull();
    expect(fora(), "e sai de vista pela classe, não do documento").toBe(true);
  });

  it("uma animação que não é a do pano não a fecha", () => {
    // As dos grupos borbulham até ao pano e acabam ANTES dele. Sem esta
    // verificação, a primeira palavra a terminar levava a cortina embora a
    // meio do mote — é a nota que ela deixou escrita no ficheiro dela.
    const { el, fora } = montar();
    el().dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-grupo" }),
    );
    expect(fora(), "uma palavra a acabar levou o pano com ela").toBe(false);
  });

  it("com uma chave de sessão, vê-se uma vez e não a cada recarga", () => {
    // O back office não é a proposta: ela recarrega o painel dezenas de vezes
    // por dia, e dois segundos de cada vez é um imposto sobre o trabalho dela.
    sessionStorage.clear();
    expect(montar('data-sessao="k"').fora(), "à primeira entrada vê-se").toBe(false);
    expect(montar('data-sessao="k"').fora(), "à segunda já não").toBe(true);
    sessionStorage.clear();
    expect(montar('data-sessao="k"').fora(), "um separador novo volta a vê-la").toBe(false);
  });

  it("sem chave de sessão vê-se SEMPRE — é o caso do sítio e da proposta", () => {
    // «Fiz refresh e já não aparece.» Era a trava, e saiu.
    expect(montar().fora()).toBe(false);
    expect(montar().fora()).toBe(false);
  });

  it("uma janela privada, onde o sessionStorage rebenta, vê-a à mesma", () => {
    const real = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      get() {
        throw new Error("bloqueado");
      },
    });
    try {
      expect(() => montar('data-sessao="k"')).not.toThrow();
      expect(document.querySelector(".cortina")!.classList.contains("cortina--fora")).toBe(false);
    } finally {
      if (real) Object.defineProperty(window, "sessionStorage", real);
    }
  });

  it("voltar pela cache do histórico faz a cortina RECOMEÇAR", () => {
    /**
     * O documento é restaurado inteiro e o guião NÃO volta a correr. O que
     * corre é este ouvinte, que ficou vivo lá dentro. Sem ele, a cortina
     * voltava ao ecrã no estado em que ficou.
     *
     * Uma animação de CSS só recomeça se for interrompida — daí a classe que
     * a congela, o cálculo forçado, e a classe outra vez fora.
     */
    const { el, fora } = montar();
    el().classList.add("cortina--fora");
    document.documentElement.setAttribute("data-cortina", "fora");
    const volta = new Event("pageshow") as Event & { persisted: boolean };
    Object.defineProperty(volta, "persisted", { value: true });
    window.dispatchEvent(volta);
    expect(fora(), "voltou e não se vê").toBe(false);
    expect(el().classList.contains("cortina--parada"), "ficou congelada para sempre").toBe(false);
    expect(document.documentElement.hasAttribute("data-cortina")).toBe(false);
  });

  it("mas no back office, voltar continua a fechá-la", () => {
    sessionStorage.clear();
    const { el, fora } = montar('data-sessao="k"');
    const volta = new Event("pageshow") as Event & { persisted: boolean };
    Object.defineProperty(volta, "persisted", { value: true });
    window.dispatchEvent(volta);
    expect(fora(), "recomeçou onde não devia").toBe(true);
    expect(el()).not.toBeNull();
    sessionStorage.clear();
  });

  it("um `pageshow` que NÃO vem da cache não fecha nada", () => {
    const { fora } = montar();
    window.dispatchEvent(new Event("pageshow"));
    expect(fora()).toBe(false);
  });

  it("num documento PRÉ-RENDERIZADO fica parada — senão chega ao ecrã já gasta", () => {
    /**
     * O sítio manda o navegador desenhar a página seguinte em segredo mal o
     * dedo se aproxima de uma ligação. Esse documento invisível corre os
     * guiões todos: sem esta guarda, o pano fazia a animação inteira para
     * ninguém e chegava ao ecrã já subido.
     */
    Object.defineProperty(document, "prerendering", { value: true, configurable: true });
    try {
      const { el } = montar();
      expect(
        el().classList.contains("cortina--parada"),
        "arrancou dentro do pré-carregamento",
      ).toBe(true);
      Object.defineProperty(document, "prerendering", { value: false, configurable: true });
      document.dispatchEvent(new Event("prerenderingchange"));
      expect(el().classList.contains("cortina--parada"), "ficou congelada para sempre").toBe(false);
    } finally {
      Reflect.deleteProperty(document, "prerendering");
    }
  });

  it("a classe que congela existe no CSS, e apanha também os grupos", () => {
    // Sem a metade do CSS, a do guião não faz nada. E se apanhasse só o pano,
    // as palavras corriam à mesma dentro de um pré-carregamento.
    expect(BLOCO).toMatch(/\.cortina--parada,\s*\.cortina--parada \.cortina__grupo \{/);
    expect(BLOCO).toMatch(/\.cortina--parada[\s\S]{0,140}animation: none !important;/);
  });
});

describe("a cortina no documento", () => {
  it("o guião sai no HTML do servidor, colado à cortina", () => {
    /**
     * Tem de vir no HTML DO SERVIDOR — um componente de cliente só ganhava
     * vida depois de o JavaScript chegar, tarde de mais. E tem de estar COLADO
     * à cortina, porque é assim que ele a encontra
     * (`currentScript.previousElementSibling`).
     */
    const html = renderToStaticMarkup(<Cortina locale="pt" />);
    expect(html).toContain("<script>");
    expect(html.indexOf("<script>")).toBeGreaterThan(html.indexOf('class="cortina"'));
    expect(html).toContain("</div><script>");
  });

  it("não é anunciada a quem ouve o ecrã: a espera já tem nome no `loading.tsx`", () => {
    const { container } = render(<Cortina locale="pt" />);
    expect(container.querySelector(".cortina")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o elemento leva `suppressHydrationWarning`", () => {
    // O guião muda a classe antes da hidratação. Sem isto, a 2.ª entrada de um
    // separador suja a consola — e o E2E desta casa exige uma consola limpa.
    expect(readFileSync("src/components/Cortina.tsx", "utf8")).toContain(
      "suppressHydrationWarning",
    );
  });

  it("nasce visível — é isso que faz uma página rápida chegar a mostrá-la", () => {
    expect(BLOCO).toMatch(/\.cortina \{[\s\S]*?opacity: 1;/);
  });

  it("o dedo arrasta a página por baixo, mas o toque para na cortina", () => {
    // Uma caixa que cobre o ecrã inteiro come o arrastar de quem quer descer.
    // Foi um passeio da galeria que o apanhou: três fotografias em vez de
    // quatro, porque o gesto dele não fazia nada.
    expect(BLOCO).toMatch(/\.cortina \{[\s\S]*?pointer-events: none;/);
    expect(GUIAO, "a tranca do scroll voltou pelo guião").not.toContain("overflow");
  });
});

describe("a mesma cortina em toda a casa", () => {
  /**
   * Palavras dela: «quando carrego em ver proposta online, a animação está
   * muito rápida — eu quero igual ao que está no site». Já era o mesmo
   * componente; o que ela viu foi a trava de sessão a escondê-la. Mas a
   * pergunta era a certa, e nada garantia que os dois ficassem iguais.
   */
  const MONTAGENS = {
    sítio: readFileSync("src/components/CromadoDoSitio.tsx", "utf8"),
    proposta: readFileSync("src/app/[lang]/(privado)/layout.tsx", "utf8"),
    "back office": readFileSync("src/app/[lang]/(admin)/layout.tsx", "utf8"),
  };

  function montagem(fonte: string): string {
    const m = /<Cortina\b[^>]*\/>/.exec(fonte);
    expect(m, "desapareceu a cortina deste sítio").not.toBeNull();
    return m![0];
  }

  it("o sítio e a proposta recebem a cortina EXACTAMENTE igual", () => {
    const semLocale = (m: string) => m.replace(/locale=\{[^}]*\}/, "locale={…}");
    expect(semLocale(montagem(MONTAGENS.sítio))).toBe(semLocale(montagem(MONTAGENS.proposta)));
  });

  it("nem o sítio nem a proposta levam trava de sessão — vêem-se SEMPRE", () => {
    for (const onde of ["sítio", "proposta"] as const) {
      expect(montagem(MONTAGENS[onde]), `a trava voltou ao ${onde}`).not.toContain("chaveDeSessao");
    }
  });

  it("o back office continua a levá-la — e é o único", () => {
    expect(montagem(MONTAGENS["back office"])).toContain("chaveDeSessao");
  });

  it("ninguém pode dar tempos próprios a uma das casas", () => {
    // O tempo sai do CSS e de mais lado nenhum.
    for (const [onde, fonte] of Object.entries(MONTAGENS)) {
      expect(montagem(fonte), `${onde} passou a mandar no tempo da sua cortina`).not.toMatch(
        /minimo|duracao|atraso|total/i,
      );
    }
  });
});
