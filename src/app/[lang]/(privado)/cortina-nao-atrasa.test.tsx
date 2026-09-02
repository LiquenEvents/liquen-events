// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { cleanup, render } from "@testing-library/react";
import { CortinaDaProposta, GUIAO } from "./CortinaDaProposta";
import { getDictionary } from "@/lib/i18n";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CORTINA NÃO PODE ATRASAR A PROPOSTA — NEM QUANDO PARECER BOA IDEIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O exemplo que ela mandou segura o ecrã 2000 ms fixos («hold = 2000») antes
 * de levantar a cortina. É a linha mais fácil de copiar do mundo, e é
 * exactamente a que não pode entrar aqui: o briefing dela diz «nenhuma
 * animação pode atrasar uma tarefa», e o pedido desta semana foi «eu quero
 * mesmo que seja logo».
 *
 * Este ficheiro existe para que a espera fixa não volte por distracção. Não
 * testa que a animação é bonita — testa que ela não custa tempo a ninguém, e
 * que ninguém fica preso atrás dela.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const FONTE = readFileSync("src/app/[lang]/(privado)/CortinaDaProposta.tsx", "utf8");
/** Só o bloco da cortina, para não apanhar as outras animações do ficheiro. */
const BLOCO = CSS.slice(CSS.indexOf("A CORTINA DA PROPOSTA"));

afterEach(cleanup);

describe("a cortina da proposta", () => {
  it("não espera por temporizador nenhum antes de sair", () => {
    /**
     * A saída é comandada pelo `DOMContentLoaded` — o instante em que o HTML
     * da proposta acabou de chegar — e por mais nada. Nem `setTimeout` a
     * segurar, nem espera pelo `load` (que esperaria pelas FOTOGRAFIAS, e num
     * 4G rural isso são segundos depois de a proposta já estar lá).
     */
    expect(FONTE).toContain("DOMContentLoaded");
    expect(FONTE, "esperar pelo `load` era esperar pelas fotografias").not.toMatch(
      /addEventListener\(["']load["']/,
    );
    expect(FONTE, "um temporizador a segurar a cortina é a espera fixa a voltar").not.toContain(
      "setTimeout",
    );
  });

  it("uma proposta rápida nunca chega a pintar a cortina", () => {
    // A entrada tem atraso: se o documento estiver lido antes disso, o guião
    // encontra opacidade zero e remove a cortina sem transição nenhuma. O
    // casal não vê preto — vê a proposta.
    expect(BLOCO).toMatch(/cortina-a-aparecer[^;]*0\.14s forwards/);
    expect(FONTE).toContain("getComputedStyle(c).opacity");
    expect(FONTE).toContain("c.remove()");
  });

  it("sai sozinha mesmo que o JavaScript nunca corra", () => {
    /**
     * A rede de segurança que não depende de ninguém: uma segunda animação de
     * CSS levanta a cortina aos 3,5 s. Sem ela, um guião bloqueado deixava um
     * casal a olhar para um ecrã escuro com a proposta por baixo — que é a
     * pior avaria possível nesta página.
     */
    expect(BLOCO).toMatch(/cortina-a-subir[\s\S]{0,80}3\.5s forwards/);
  });

  it("só anima `transform` e `opacity`", () => {
    // A regra dos 60 fps num iPhone em 4G. O CSS de referência animava também
    // a `color`, que é pintura a cada fotograma.
    const quadros = BLOCO.match(/@keyframes cortina-[\s\S]*?\n}\n/g) ?? [];
    expect(quadros.length).toBeGreaterThanOrEqual(3);
    for (const q of quadros) {
      const props = [...q.matchAll(/^\s{4}([a-z-]+):/gm)].map((m) => m[1]);
      expect(props.length).toBeGreaterThan(0);
      for (const p of props) expect(["opacity", "transform"]).toContain(p);
    }
  });

  it("quem pediu menos movimento não leva cortina nenhuma", () => {
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

  /**
   * ── E AGORA A CORRER O GUIÃO, E NÃO A LÊ-LO ─────────────────────────────
   *
   * Os testes de cima prendem a letra: que não há `setTimeout`, que há
   * `DOMContentLoaded`. Isso apanha uma distracção, mas não prova que a
   * cortina sai. Estes correm-no mesmo, num documento montado à mão.
   */
  function montar({ opacidade, aLer }: { opacidade: string; aLer: boolean }) {
    document.body.innerHTML = `<div class="cortina" style="opacity:${opacidade}"></div><script id="g"></script>`;
    Object.defineProperty(document, "currentScript", {
      value: document.getElementById("g"),
      configurable: true,
    });
    Object.defineProperty(document, "readyState", {
      value: aLer ? "loading" : "complete",
      configurable: true,
    });
    new Function(GUIAO)();
    return () => document.querySelector(".cortina");
  }

  it("com o documento lido, a cortina visível sobe — e sai no fim da subida", () => {
    const cortina = montar({ opacidade: "1", aLer: false });
    expect(cortina()?.classList.contains("cortina--a-sair")).toBe(true);
    // Ainda lá está: quem a tira é o fim da animação, para a subida se ver.
    expect(cortina()).not.toBeNull();
    cortina()!.dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
    );
    expect(cortina()).toBeNull();
  });

  it("se ainda não foi pintada, sai sem animação nenhuma", () => {
    // A proposta chegou antes dos 140 ms da entrada. Animar a saída de algo
    // que nunca se viu era pintar um piscar de olhos do nada.
    const cortina = montar({ opacidade: "0", aLer: false });
    expect(cortina()).toBeNull();
  });

  it("com o documento ainda a ser lido, espera por ele — e por nada mais", () => {
    const cortina = montar({ opacidade: "1", aLer: true });
    expect(cortina()?.classList.contains("cortina--a-sair"), "não sai antes de tempo").toBe(false);
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(cortina()?.classList.contains("cortina--a-sair")).toBe(true);
  });

  it("se o CSS já a levantou aos 3,5 s, o guião não a faz subir outra vez", () => {
    /**
     * O caso real: guião a correr, mas o documento demorou mais de 3,5 s. A
     * rede de segurança do CSS levantou a cortina e o `animationend` tirou-a.
     * Quando o `DOMContentLoaded` chegar, não pode haver uma segunda subida a
     * piscar por cima da proposta já visível.
     */
    const cortina = montar({ opacidade: "1", aLer: true });
    const el = cortina()!;
    el.dispatchEvent(
      Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
    );
    expect(cortina()).toBeNull();
    document.dispatchEvent(new Event("DOMContentLoaded"));
    expect(el.classList.contains("cortina--a-sair"), "uma segunda subida a piscar").toBe(false);
  });

  it("o guião sai no HTML do servidor, colado à cortina", () => {
    /**
     * A peça em que tudo isto assenta, e por isso está presa aqui.
     *
     *  1. O guião tem de vir no HTML DO SERVIDOR. Se fosse um componente de
     *     cliente só ganhava vida depois de o JavaScript da página chegar —
     *     tarde de mais para uma peça cujo trabalho é cobrir o tempo até lá.
     *
     *  2. E tem de estar COLADO à cortina, porque é assim que ele a encontra
     *     (`currentScript.previousElementSibling`). O React içou o `<script>`
     *     para o `<head>` mais do que uma vez na vida deste projecto; se
     *     voltar a fazê-lo, o guião passa a procurar o irmão errado, não
     *     encontra a cortina, e ela fica dependente da rede de segurança de
     *     3,5 s. A proposta ainda abre — mas devagar, e em silêncio.
     */
    const html = renderToStaticMarkup(<CortinaDaProposta locale="pt" />);
    expect(html).toContain("<script>");
    expect(html.indexOf("<script>"), "o guião tem de vir DEPOIS da cortina").toBeGreaterThan(
      html.indexOf('class="cortina"'),
    );
    // Nada entre o fecho da cortina e a abertura do guião.
    expect(html).toContain("</div><script>");
  });
});
