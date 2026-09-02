// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { CortinaDaProposta, GUIAO } from "./CortinaDaProposta";
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

/** O mínimo declarado no guião — lido dele, para o teste não repetir o número. */
const MIN = Number(/var MIN=(\d+)/.exec(GUIAO)?.[1]);

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
    return { el, aSair: () => !!el()?.classList.contains("cortina--a-sair") };
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
    // e o `animationend` tirou-a. Quando o documento ficar lido não pode haver
    // uma segunda subida a piscar por cima da proposta já visível.
    const { el } = montar({ aLer: true });
    const antes = el()!;
    antes.dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
    );
    expect(el()).toBeNull();

    document.dispatchEvent(new Event("DOMContentLoaded"));
    vi.advanceTimersByTime(5000);
    expect(antes.classList.contains("cortina--a-sair"), "uma segunda subida a piscar").toBe(false);
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

  it("a frase é o lema do estúdio, na língua do casal — e não uma inventada", () => {
    for (const locale of ["pt", "en"] as const) {
      const t = getDictionary(locale).footer;
      const { container } = render(<CortinaDaProposta locale={locale} />);
      const grupos = [...container.querySelectorAll(".cortina__lema > span")].map(
        (s) => s.textContent,
      );
      expect(grupos).toEqual([t.sloganLine1, t.sloganLine2]);
      cleanup();
    }
  });

  it("cada grupo sobe do seu degrau — é isso o efeito, e não o fade", () => {
    const { container } = render(<CortinaDaProposta locale="pt" />);
    const degraus = [...container.querySelectorAll(".cortina__lema > span")].map((s) =>
      (s as HTMLElement).style.getPropertyValue("--degrau"),
    );
    expect(degraus).toHaveLength(2);
    expect(new Set(degraus).size, "dois grupos com o mesmo degrau são um fade único").toBe(2);
  });

  it("não é anunciada a quem ouve o ecrã: a espera já tem nome no `loading.tsx`", () => {
    const { container } = render(<CortinaDaProposta locale="pt" />);
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
    const html = renderToStaticMarkup(<CortinaDaProposta locale="pt" />);
    expect(html).toContain("<script>");
    expect(html.indexOf("<script>"), "o guião tem de vir DEPOIS da cortina").toBeGreaterThan(
      html.indexOf('class="cortina"'),
    );
    expect(html).toContain("</div><script>");
  });
});
