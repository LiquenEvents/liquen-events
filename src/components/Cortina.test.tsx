// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { Cortina, GUIAO } from "./Cortina";
import { getDictionary } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CORTINA VÊ-SE SEMPRE — E MESMO ASSIM NÃO SEGURA UMA PÁGINA LENTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro substitui um que se chamava `cortina-nao-atrasa`, e a troca de
 * nome é a história toda.
 *
 * A primeira versão desta cortina nunca chegava a ser pintada numa ligação
 * rápida: era essa a regra, e estava presa aqui por testes. Ela abriu a
 * proposta no telemóvel e disse «não me aparece aquela animação» — o desenho a
 * fazer exactamente o que lhe tinham mandado fazer. Posta a escolha, com o
 * custo em cima da mesa, ela escolheu vê-la sempre.
 *
 * O que este ficheiro guarda agora é o equilíbrio dessa decisão:
 *
 *   1. QUE SE VÊ SEMPRE. Há um mínimo de tempo no ecrã, e ele é respeitado.
 *   2. QUE O MÍNIMO É UM CHÃO, E NÃO UMA ESPERA FIXA. Numa página lenta a
 *      cortina sai quando a página chega — e não um segundo depois disso. É a
 *      diferença entre cobrir o tempo de carregamento e somar-se-lhe, e é a
 *      única coisa que separa isto dos 2000 ms fixos do exemplo.
 *   3. QUE CONTINUA A SER UM SEGUNDO, E NÃO DOIS.
 *   4. QUE NINGUÉM FICA PRESO ATRÁS DELA se o JavaScript não correr.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
/** Só o bloco da cortina, para não apanhar as outras animações do ficheiro. */
const BLOCO = CSS.slice(CSS.indexOf("A CORTINA DA PROPOSTA"));

/**
 * O mínimo por omissão do guião — lido dele, para o teste não repetir o número.
 *
 * Ele passou a vir do elemento (`data-minimo`), porque o lema e o logótipo
 * ficam tempos diferentes no ecrã; o valor aqui é o de recurso, o do lema.
 */
const MIN = Number(/data-minimo"\)\|\|(\d+)\)/.exec(GUIAO)?.[1]);

afterEach(cleanup);

describe("quanto tempo a cortina fica", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function montar({ aLer }: { aLer: boolean }) {
    document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
    Object.defineProperty(document, "currentScript", {
      value: document.getElementById("g"),
      configurable: true,
    });
    Object.defineProperty(document, "readyState", {
      value: aLer ? "loading" : "complete",
      configurable: true,
    });
    new Function(GUIAO)();
    const el = () => document.querySelector(".cortina");
    return {
      el,
      aSair: () => !!el()?.classList.contains("cortina--a-sair"),
      fora: () => !!el()?.classList.contains("cortina--fora"),
    };
  }

  it("com a página já pronta, espera pelo mínimo antes de sair", () => {
    // O caso dela: a proposta chega num instante e a cortina não se vê. Era
    // isto que estava errado, e é isto que este caso passa a impedir.
    const { aSair } = montar({ aLer: false });
    vi.advanceTimersByTime(MIN - 50);
    expect(aSair(), "saiu antes de a frase se ler").toBe(false);
    vi.advanceTimersByTime(50);
    expect(aSair()).toBe(true);
  });

  it("com a página LENTA, sai quando ela chega — e não um segundo depois", () => {
    /**
     * O caso que separa um chão de uma espera fixa, e o mais importante deste
     * ficheiro.
     *
     * A página demorou três segundos; a frase já foi lida e relida nesse
     * tempo. Somar-lhe o mínimo seria pôr o casal a esperar por uma animação
     * DEPOIS de a proposta estar pronta — que é exactamente o defeito dos
     * 2000 ms fixos do exemplo, com outro nome.
     */
    const { aSair } = montar({ aLer: true });
    vi.advanceTimersByTime(3000);
    expect(aSair(), "não sai antes de a página chegar").toBe(false);

    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(aSair(), "o mínimo já passou — sai JÁ, sem mais espera").toBe(true);
  });

  it("continua a ser um segundo, e não os dois mil do exemplo", () => {
    // O `hold = 2000` do CSS que ela mandou é a linha mais fácil do mundo de
    // copiar. Dois segundos depois de já se ter carregado no botão lêem-se
    // como «não funcionou».
    expect(MIN).toBe(1000);
    expect(GUIAO).not.toContain("2000");
  });

  it("se o CSS já a levantou, o guião não a faz subir outra vez", () => {
    // Página muito lenta: a rede de segurança do CSS levantou a cortina aos 4 s
    // e o `animationend` escondeu-a. Quando o documento ficar lido não pode
    // haver uma segunda subida a piscar por cima da proposta já visível.
    const { el, fora, aSair } = montar({ aLer: true });
    el()!.dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
    );
    expect(fora()).toBe(true);

    document.dispatchEvent(new Event("DOMContentLoaded"));
    vi.advanceTimersByTime(5000);
    expect(aSair(), "uma segunda subida a piscar").toBe(false);
  });

  it("ESCONDE-SE, e nunca sai do documento — é o defeito da hidratação", () => {
    /**
     * O defeito, medido num Chromium com o JavaScript a chegar 2,5 s depois:
     * a cortina ficava no ecrã até aos ~7 s, com o erro #418 do React.
     *
     * A causa: ela é desenhada pelo React e o guião corre ANTES da hidratação.
     * Removê-la deixava o React a hidratar um `<main>` a que faltava um filho;
     * o React reconstruía a subárvore e punha a cortina DE VOLTA — já sem o
     * `animationend` que a tirava, porque esse ficara no elemento antigo.
     *
     * Numa quinta com 4G fraco, que é exactamente onde isto tinha de
     * funcionar, o casal ficava sete segundos atrás de um ecrã escuro com a
     * proposta por baixo.
     */
    expect(GUIAO, "remover o elemento é o que parte a hidratação").not.toContain(".remove()");

    const { el, fora } = montar({ aLer: false });
    vi.advanceTimersByTime(1000);
    el()!.dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
    );
    expect(el(), "o elemento tem de continuar onde o servidor o pôs").not.toBeNull();
    expect(fora(), "e sai de vista pela classe, não do documento").toBe(true);
  });

  it("esconde-se à mesma se o `animationend` nunca chegar", () => {
    // Separador em segundo plano, animações desligadas pelo sistema: o evento
    // pode nunca vir. Sem esta rede, a cortina ficava no ecrã para sempre.
    const { fora } = montar({ aLer: false });
    vi.advanceTimersByTime(1000);
    expect(fora()).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(fora(), "ninguém pode ficar preso atrás dela").toBe(true);
  });
});

describe("a cortina, e o que não pode mudar", () => {
  it("sai sozinha mesmo que o JavaScript nunca corra", () => {
    /**
     * A rede de segurança que não depende de ninguém. Sem ela, um guião
     * bloqueado deixava um casal a olhar para um ecrã escuro com a proposta por
     * baixo — a pior avaria possível nesta página. E tem de dar folga sobre o
     * mínimo, senão levantava a cortina a meio da frase.
     */
    const atraso = /cortina-a-subir[^;]*?(\d+(?:\.\d+)?)s forwards/.exec(BLOCO);
    expect(atraso, "a saída sem JavaScript desapareceu").not.toBeNull();
    expect(Number(atraso![1]) * 1000).toBeGreaterThan(MIN);
  });

  it("nasce visível — é isso que faz uma proposta rápida chegar a mostrá-la", () => {
    // Antes era `opacity: 0` com a entrada atrasada, e era essa linha que fazia
    // com que ela nunca a visse.
    expect(BLOCO).toMatch(/\.cortina \{[\s\S]*?opacity: 1;/);
  });

  it("só anima `transform` e `opacity`", () => {
    // A regra dos 60 fps num iPhone em 4G. O CSS de referência animava também
    // a `color`, que é pintura a cada fotograma.
    const quadros = BLOCO.match(/@keyframes cortina-[\s\S]*?\n}\n/g) ?? [];
    expect(quadros.length).toBeGreaterThanOrEqual(2);
    for (const q of quadros) {
      const props = [...q.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect(["opacity", "transform"]).toContain(p);
    }
  });

  it("quem pediu menos movimento não leva cortina nenhuma — nem o segundo dela", () => {
    expect(BLOCO).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.cortina \{\s*display: none;/,
    );
  });

  it("e com movimento reduzido o guião fecha-a JÁ, sem esperar por uma animação", () => {
    /**
     * O segundo defeito que o Chromium apanhou. Com `display: none` uma
     * animação não corre — portanto o `animationend` nunca chegava e a cortina
     * ficava no documento para sempre, marcada como se ainda estivesse a
     * caminho. Invisível, mas por acidente e não por decisão.
     */
    vi.useFakeTimers();
    try {
      const mm = vi.fn().mockReturnValue({ matches: true });
      vi.stubGlobal("matchMedia", mm);
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      new Function(GUIAO)();
      expect(mm).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
      expect(
        document.querySelector(".cortina")?.classList.contains("cortina--fora"),
        "fechada de imediato, sem esperar por nada",
      ).toBe(true);
      vi.unstubAllGlobals();
    } finally {
      vi.useRealTimers();
    }
  });

  it("a frase é o lema do estúdio, na língua do casal — e não uma inventada", () => {
    for (const locale of ["pt", "en"] as const) {
      const t = getDictionary(locale).footer;
      const { container } = render(<Cortina locale={locale} />);
      const grupos = [...container.querySelectorAll(".cortina__lema > span")].map(
        (s) => s.textContent,
      );
      expect(grupos).toEqual([t.sloganLine1, t.sloganLine2]);
      cleanup();
    }
  });

  it("cada grupo sobe do seu degrau — é isso o efeito, e não o fade", () => {
    const { container } = render(<Cortina locale="pt" />);
    const degraus = [...container.querySelectorAll(".cortina__lema > span")].map((s) =>
      (s as HTMLElement).style.getPropertyValue("--degrau"),
    );
    expect(degraus).toHaveLength(2);
    expect(new Set(degraus).size, "dois grupos com o mesmo degrau são um fade único").toBe(2);
  });

  it("não é anunciada a quem ouve o ecrã: a espera já tem nome no `loading.tsx`", () => {
    const { container } = render(<Cortina locale="pt" />);
    expect(container.querySelector(".cortina")?.getAttribute("aria-hidden")).toBe("true");
  });

  it("o guião sai no HTML do servidor, colado à cortina", () => {
    /**
     * A peça em que tudo isto assenta.
     *
     *  1. Tem de vir no HTML DO SERVIDOR. Um componente de cliente só ganhava
     *     vida depois de o JavaScript da página chegar — tarde de mais para uma
     *     peça cujo trabalho é cobrir o tempo até lá.
     *  2. E tem de estar COLADO à cortina, porque é assim que ele a encontra
     *     (`currentScript.previousElementSibling`). Se o React o içar para o
     *     `<head>`, passa a procurar o irmão errado e a cortina fica pendurada
     *     na rede de segurança de 4 s — a proposta abre, mas devagar e em
     *     silêncio. Verificado também numa build de produção real.
     */
    const html = renderToStaticMarkup(<Cortina locale="pt" />);
    expect(html).toContain("<script>");
    expect(html.indexOf("<script>"), "o guião tem de vir DEPOIS da cortina").toBeGreaterThan(
      html.indexOf('class="cortina"'),
    );
    expect(html).toContain("</div><script>");
  });

  it("com uma chave de sessão, vê-se uma vez e não outra vez a cada recarga", () => {
    /**
     * O back office não é a proposta. Um casal abre a proposta uma vez; ela
     * abre e recarrega o painel dezenas de vezes por dia, e um segundo de
     * cortina a cada recarga deixava de ser marca e passava a ser um imposto
     * sobre o trabalho dela.
     */
    vi.useFakeTimers();
    try {
      sessionStorage.clear();
      const montar = () => {
        document.body.innerHTML = `<div class="cortina" data-sessao="cortina:teste"></div><script id="g"></script>`;
        Object.defineProperty(document, "currentScript", {
          value: document.getElementById("g"),
          configurable: true,
        });
        Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
        new Function(GUIAO)();
        return !!document.querySelector(".cortina")?.classList.contains("cortina--fora");
      };

      expect(montar(), "à primeira entrada vê-se").toBe(false);
      expect(montar(), "à segunda já não").toBe(true);

      // E um separador novo volta a vê-la: a memória é da sessão, não do disco.
      sessionStorage.clear();
      expect(montar()).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("sem chave de sessão vê-se SEMPRE — é o caso da proposta", () => {
    // A proposta de um casal não pode ter memória: cada abertura é a primeira
    // impressão de alguém, e pode ser outra pessoa a abrir o mesmo link.
    vi.useFakeTimers();
    try {
      sessionStorage.clear();
      const montar = () => {
        document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
        Object.defineProperty(document, "currentScript", {
          value: document.getElementById("g"),
          configurable: true,
        });
        Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
        new Function(GUIAO)();
        return !!document.querySelector(".cortina")?.classList.contains("cortina--fora");
      };
      expect(montar()).toBe(false);
      expect(montar(), "sem chave, nunca se lembra de nada").toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("uma janela privada, onde o sessionStorage rebenta, vê a cortina à mesma", () => {
    // Falhar para o lado de mostrar: uma cortina a mais é um segundo; uma
    // excepção não apanhada aqui era o guião a morrer e a cortina a ficar.
    vi.useFakeTimers();
    const real = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    try {
      Object.defineProperty(window, "sessionStorage", {
        configurable: true,
        get() {
          throw new Error("acesso negado");
        },
      });
      document.body.innerHTML = `<div class="cortina" data-sessao="cortina:teste"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      expect(() => new Function(GUIAO)()).not.toThrow();
      expect(document.querySelector(".cortina")?.classList.contains("cortina--fora")).toBe(false);
    } finally {
      if (real) Object.defineProperty(window, "sessionStorage", real);
      vi.useRealTimers();
    }
  });

  it("a variante do logótipo mostra o emblema e NÃO o lema", () => {
    const { container } = render(<Cortina locale="pt" variante="logotipo" />);
    expect(container.querySelector(".cortina__logo")).not.toBeNull();
    expect(
      container.querySelector(".cortina__lema"),
      "no sítio não se pede que se leia",
    ).toBeNull();
  });

  it("e essa TEM nome para quem ouve o ecrã — a do lema não precisa", () => {
    /**
     * A do lema aparece por cima de um `loading.tsx` cujo `aria-busy` já diz
     * «isto está a carregar». No sítio não há esse ecrã por baixo: sem nome,
     * quem ouve ficava sem saber que algo estava a acontecer.
     */
    const logo = render(<Cortina locale="pt" variante="logotipo" />);
    const el = logo.container.querySelector(".cortina")!;
    expect(el.getAttribute("role")).toBe("status");
    expect(el.getAttribute("aria-label")).toMatch(/abrir/i);
    expect(el.getAttribute("aria-hidden")).toBeNull();
    cleanup();

    const lema = render(<Cortina locale="pt" />);
    expect(lema.container.querySelector(".cortina")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("cada variante leva o seu mínimo — o lema precisa de tempo para SER LIDO", () => {
    // Números diferentes porque o conteúdo é diferente: duas linhas a ler
    // contra um emblema que se reconhece num relance.
    const lema = render(<Cortina locale="pt" />);
    expect(lema.container.querySelector(".cortina")!.getAttribute("data-minimo")).toBe("1000");
    cleanup();
    const logo = render(<Cortina locale="pt" variante="logotipo" />);
    expect(logo.container.querySelector(".cortina")!.getAttribute("data-minimo")).toBe("900");
  });

  it("o guião lê o mínimo do elemento, e respeita-o", () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = `<div class="cortina" data-minimo="900"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      new Function(GUIAO)();
      const aSair = () =>
        !!document.querySelector(".cortina")?.classList.contains("cortina--a-sair");
      vi.advanceTimersByTime(850);
      expect(aSair()).toBe(false);
      vi.advanceTimersByTime(50);
      expect(aSair()).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tranca o scroll enquanto está no ecrã, e devolve-o EXACTAMENTE como estava", () => {
    /**
     * Detalhe do exemplo dela, e vale a pena: sem isto, dá para arrastar uma
     * página que não se vê, e ao sair a página aparece já a meio.
     *
     * Devolver o valor ANTERIOR e não `""` é o que impede isto de pisar quem
     * já tinha uma regra de scroll própria.
     */
    vi.useFakeTimers();
    const antes = "clip";
    try {
      document.documentElement.style.overflow = antes;
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      new Function(GUIAO)();
      expect(document.documentElement.style.overflow, "trancado enquanto se vê").toBe("hidden");

      vi.advanceTimersByTime(1000);
      document
        .querySelector(".cortina")!
        .dispatchEvent(
          Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
        );
      expect(document.documentElement.style.overflow, "devolvido como estava").toBe(antes);
    } finally {
      document.documentElement.style.overflow = "";
      vi.useRealTimers();
    }
  });

  it("o elemento leva `suppressHydrationWarning` — sem ele, a 2.ª entrada suja a consola", () => {
    /**
     * ── O DEFEITO, E PORQUE É QUE ESTE TESTE LÊ A FONTE ────────────────────
     *
     * O guião corre antes da hidratação e muda a classe deste elemento. Na
     * SEGUNDA entrada de um separador — quando a chave de sessão o manda
     * esconder já no primeiro instante — o React encontra `cortina--fora` onde
     * desenhou só `cortina`, e escreve na consola:
     *
     *     A tree hydrated but some attributes of the server rendered HTML
     *     didn't match the client properties. This won't be patched up.
     *
     * Partiu DOIS testes de ponta a ponta que exigem uma consola limpa
     * (`temas.spec.ts` e `caca/a02-editor-stress.spec.ts`, este último por
     * fazer `page.reload()`), e não se via a olho nenhum: a primeira entrada
     * nunca falha.
     *
     * Reproduzido com `next dev`, três entradas seguidas: a 1.ª limpa, a 2.ª e
     * a 3.ª com o erro. Com a correcção, as três limpas.
     *
     * Lê-se da FONTE porque `suppressHydrationWarning` é uma instrução para o
     * React e não sai no HTML — não há como perguntá-lo ao DOM. O que este
     * caso guarda é que ninguém o tire por parecer supérfluo.
     */
    const fonte = readFileSync("src/components/Cortina.tsx", "utf8");
    expect(fonte).toContain("suppressHydrationWarning");
  });

  it("voltar pela cache do browser fecha-a já, e devolve o scroll", () => {
    /**
     * Palavras dela: «se eu volto para trás no browser aquilo fica assim um
     * bocado coiso».
     *
     * Quando uma página volta da cache de histórico, o guião NÃO corre outra
     * vez — `document.currentScript` só existe durante a leitura. Ou seja: a
     * cortina volta ao ecrã exactamente no estado em que estava quando se saiu.
     * Se se saiu com ela levantada, volta-se a um ecrã escuro, com o scroll
     * trancado, e sem ninguém para o destrancar — o `animationend` e o
     * `setTimeout` que fariam esse trabalho ficaram na visita anterior.
     *
     * O `pageshow` com `persisted` é o único aviso que o browser dá de que
     * isto aconteceu. Uma página que volta JÁ ESTÁ carregada: não há nada para
     * a cortina cobrir, e ela fecha-se sem mínimo nenhum.
     */
    vi.useFakeTimers();
    const antes = "clip";
    try {
      document.documentElement.style.overflow = antes;
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
      new Function(GUIAO)();

      // Está no ecrã e o scroll está trancado — saiu-se a meio.
      const el = () => document.querySelector(".cortina")!;
      expect(el().classList.contains("cortina--fora")).toBe(false);
      expect(document.documentElement.style.overflow).toBe("hidden");

      // E volta-se pela cache do browser.
      const volta = new Event("pageshow") as Event & { persisted: boolean };
      Object.defineProperty(volta, "persisted", { value: true });
      window.dispatchEvent(volta);

      expect(el().classList.contains("cortina--fora"), "fecha-se sem esperar").toBe(true);
      expect(document.documentElement.style.overflow, "e devolve o scroll").toBe(antes);
    } finally {
      document.documentElement.style.overflow = "";
      vi.useRealTimers();
    }
  });

  it("um `pageshow` que NÃO vem da cache não fecha nada", () => {
    // Um carregamento normal também dispara `pageshow`, com `persisted` a
    // falso. Se isso fechasse a cortina, ela nunca chegava a ver-se.
    vi.useFakeTimers();
    try {
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "loading", configurable: true });
      new Function(GUIAO)();
      window.dispatchEvent(new Event("pageshow"));
      expect(document.querySelector(".cortina")?.classList.contains("cortina--fora")).toBe(false);
    } finally {
      document.documentElement.style.overflow = "";
      vi.useRealTimers();
    }
  });

  it("a saída com nome próprio também é reconhecida pelo `animationend`", () => {
    // A saída do guião passou a ter o seu próprio nome de animação, para o
    // motor não ter de re-cronometrar a que já está viva na rede de segurança.
    // Se o ouvinte não conhecesse o nome novo, a cortina ficava `--a-sair`
    // para sempre: fora do ecrã, mas nunca `display:none`.
    vi.useFakeTimers();
    try {
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      new Function(GUIAO)();
      vi.advanceTimersByTime(1000);
      document
        .querySelector(".cortina")!
        .dispatchEvent(
          Object.assign(new Event("animationend"), { animationName: "cortina-a-subir-ja" }),
        );
      expect(document.querySelector(".cortina")?.classList.contains("cortina--fora")).toBe(true);
    } finally {
      document.documentElement.style.overflow = "";
      vi.useRealTimers();
    }
  });
});
