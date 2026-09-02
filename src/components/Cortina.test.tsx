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

/**
 * O mínimo que a cortina REALMENTE usa — o que o componente escreve no
 * elemento, e não o de recurso do guião.
 *
 * Lido daqui e não escrito à mão: é este o número que muda quando alguém
 * mexer no ritmo da frase, e um teste que o repetisse deixava de o vigiar.
 */
const MINIMO = Number(
  /data-minimo="(\d+)"/.exec(renderToStaticMarkup(<Cortina locale="pt" />))?.[1],
);

/** Cada letra da frase, com o instante em que acaba de entrar. */
function letras() {
  const { container } = render(<Cortina locale="pt" />);
  const achadas = [...container.querySelectorAll<HTMLElement>(".cortina__letra")].map((el) => ({
    el,
    texto: el.textContent ?? "",
    de: el.style.getPropertyValue("--de"),
    atraso: parseFloat(el.style.animationDelay),
    duracao: parseFloat(el.style.animationDuration),
  }));
  cleanup();
  return achadas;
}

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

  it("o mínimo cobre a frase INTEIRA — a cortina não sai a meio dela", () => {
    /**
     * ── O QUE ESTE CASO PASSOU A GUARDAR ──────────────────────────────────
     *
     * Guardava um número: «o mínimo é 1000, e não os 2000 do exemplo». Isso
     * deixou de fazer sentido no dia em que ela pediu a frase a entrar letra a
     * letra e «mais devagar»: o mínimo subiu para 2200 e um teste pregado a
     * 1000 só sabia dizer que alguém tinha mexido, não se tinha mexido bem.
     *
     * O que importa não é o número: é que a cortina não se levante a meio da
     * própria frase. Se a última letra ainda vai a entrar quando a cortina
     * sobe, o casal vê uma frase por acabar a fugir para cima — que é pior do
     * que não ter animação nenhuma.
     *
     * Portanto a conta refaz-se aqui a partir dos tempos que o componente
     * escreve no HTML, e reprova sozinha se alguém acelerar a frase sem
     * baixar o mínimo, ou abrandá-la sem o subir.
     */
    const todas = letras();
    expect(todas.length, "a frase deixou de vir partida em letras").toBeGreaterThan(20);
    const fim = Math.max(...todas.map((l) => l.atraso + l.duracao));

    expect(
      MINIMO,
      `a cortina sai aos ${MINIMO} ms e a última letra só acaba de entrar aos ${fim} ms`,
    ).toBeGreaterThanOrEqual(fim);

    // E depois de montada tem de haver frase parada para LER. Foi sempre este
    // o pedido dela — «uns 600 ms legível» — e é o que justifica a espera.
    expect(MINIMO - fim, "a frase monta-se e sai sem dar tempo de a ler").toBeGreaterThanOrEqual(
      500,
    );

    /**
     * E um tecto, porque isto é o único sítio de toda a casa onde uma
     * animação atrasa uma tarefa de propósito. 2,5 s é o limite em que uma
     * marca deixa de se ler como marca e passa a ler-se como «não funcionou»
     * — que era exactamente o defeito dos 2000 ms fixos do exemplo.
     */
    expect(MINIMO, "uma cortina assim já não é uma marca, é uma espera").toBeLessThanOrEqual(2500);
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

describe("a mesma cortina em toda a casa", () => {
  /**
   * ════════════════════════════════════════════════════════════════════════
   * PORQUE É QUE ISTO PRECISA DE UM TESTE
   * ════════════════════════════════════════════════════════════════════════
   *
   * Palavras dela, a olhar para o telemóvel: «quando carrego em ver proposta
   * online, a animação está muito rápida — eu quero igual ao que está no site».
   *
   * Foi verificar: já era o mesmo componente, com os mesmos tempos. O que ela
   * viu não foi uma proposta mais rápida — foi a trava de sessão a esconder-lhe
   * a cortina à segunda entrada no mesmo separador, que se lê exactamente como
   * «foi muito rápida».
   *
   * Mas a pergunta dela é a certa, e merece rede: nada garantia que os dois
   * ficassem iguais. Bastava alguém dar um `data-minimo` diferente a um deles,
   * ou pôr-lhe uma chave de sessão, e a proposta e o sítio separavam-se sem
   * ninguém dar por isso — até um casal ver uma coisa e ela outra.
   *
   * É isso que estes casos guardam: não o valor, mas a IGUALDADE.
   */
  const MONTAGENS = {
    sítio: readFileSync("src/components/CromadoDoSitio.tsx", "utf8"),
    proposta: readFileSync("src/app/[lang]/(privado)/layout.tsx", "utf8"),
    "back office": readFileSync("src/app/[lang]/(admin)/layout.tsx", "utf8"),
  };

  /** O `<Cortina …>` escrito em cada sítio, tal e qual. */
  function montagem(fonte: string): string {
    const m = /<Cortina\b[^>]*\/>/.exec(fonte);
    expect(m, "desapareceu a cortina deste sítio").not.toBeNull();
    return m![0];
  }

  it("o sítio e a proposta recebem a cortina EXACTAMENTE igual", () => {
    // Tirando o `locale`, que cada um busca à sua maneira, o que sobra tem de
    // ser a mesma coisa: sem chave de sessão, sem tempos próprios, sem nada.
    const semLocale = (m: string) => m.replace(/locale=\{[^}]*\}/, "locale={…}");
    expect(semLocale(montagem(MONTAGENS.sítio))).toBe(semLocale(montagem(MONTAGENS.proposta)));
  });

  it("nem o sítio nem a proposta levam trava de sessão — vêem-se SEMPRE", () => {
    // A queixa dela, nas duas pontas: «fiz refresh e já não aparece» (no
    // sítio) e «está muito rápida» (na proposta, que era a cortina a não
    // aparecer de todo à segunda entrada).
    for (const onde of ["sítio", "proposta"] as const) {
      expect(
        montagem(MONTAGENS[onde]),
        `a trava de sessão voltou ao ${onde} — é ela que come o refresh`,
      ).not.toContain("chaveDeSessao");
    }
  });

  it("o back office continua a levá-la — e é o único", () => {
    // Ali quem está do outro lado é ela, a recarregar o painel dezenas de vezes
    // por dia. 2,2 s de cada vez é um imposto sobre o trabalho dela.
    expect(montagem(MONTAGENS["back office"])).toContain("chaveDeSessao");
  });

  it("ninguém pode dar tempos próprios a uma das casas", () => {
    // O `data-minimo` sai do componente e de mais lado nenhum. Se algum dia
    // passar a ser uma prop, é aqui que se dá por isso — antes de a proposta e
    // o sítio começarem a contar tempos diferentes.
    for (const [onde, fonte] of Object.entries(MONTAGENS)) {
      expect(montagem(fonte), `${onde} passou a mandar no tempo da sua cortina`).not.toMatch(
        /minimo|data-minimo|duracao|atraso/i,
      );
    }
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
    expect(
      Number(atraso![1]) * 1000,
      "a rede de segurança levanta a cortina a meio da frase",
    ).toBeGreaterThan(MINIMO);
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

  it("uma cai e a outra entra — as letras alternam de lado, e é isso o efeito", () => {
    /**
     * Palavras dela, e o que este caso guarda: «as letras deslocam-se, tipo
     * uma cai e a outra entra».
     *
     * Duas maneiras de partir isto sem dar por ela: pôr todas as letras a vir
     * do mesmo lado (deixa de ser «uma cai e a outra entra» e passa a ser uma
     * linha inteira a subir devagar), ou pô-las todas a entrar ao mesmo tempo
     * (deixa de haver letras, há um bloco). Nenhuma das duas passa aqui.
     */
    const todas = letras();

    for (let i = 0; i < todas.length; i++) {
      expect(todas[i].de, `a letra «${todas[i].texto}» não sabe de que lado vem`).toBe(
        i % 2 === 0 ? "135%" : "-135%",
      );
    }

    // E entram uma DE CADA VEZ: os atrasos sobem, sem repetições.
    const atrasos = todas.map((l) => l.atraso);
    for (let i = 1; i < atrasos.length; i++) {
      expect(atrasos[i], "duas letras a entrar no mesmo instante são um bloco").toBeGreaterThan(
        atrasos[i - 1],
      );
    }
  });

  it("a contagem atravessa as duas linhas — a frase é uma, e não duas", () => {
    // Se cada linha recomeçasse do zero, a primeira letra de baixo entrava ao
    // mesmo tempo que a de cima e liam-se como duas frases sobrepostas.
    const { container } = render(<Cortina locale="pt" />);
    const porLinha = [...container.querySelectorAll(".cortina__linha")].map((linha) =>
      [...linha.querySelectorAll<HTMLElement>(".cortina__letra")].map((l) =>
        parseFloat(l.style.animationDelay),
      ),
    );
    expect(porLinha).toHaveLength(2);
    expect(
      Math.min(...porLinha[1]),
      "a segunda linha recomeçou do zero em vez de continuar a primeira",
    ).toBeGreaterThan(Math.max(...porLinha[0]));
  });

  it("nenhuma palavra pode partir-se ao meio quando a linha muda", () => {
    /**
     * O preço de partir a frase em letras: um navegador muda de linha entre
     * duas caixas coladas, e `eternizamos memórias.` mede ~252 pt num ecrã de
     * 320 com 32 de respiro de cada lado — a quatro pontos de quebrar, e
     * quebraria a meio de uma palavra.
     *
     * A defesa tem duas metades e as duas têm de estar cá: cada letra vive
     * dentro de uma palavra, e a palavra não quebra por dentro (o
     * `white-space: nowrap` do CSS). Este caso guarda as duas.
     */
    const { container } = render(<Cortina locale="pt" />);
    for (const letra of container.querySelectorAll(".cortina__letra")) {
      expect(
        letra.parentElement?.classList.contains("cortina__palavra"),
        `a letra «${letra.textContent}» está solta na linha`,
      ).toBe(true);
    }
    expect(BLOCO).toMatch(/\.cortina__palavra \{[\s\S]*?white-space: nowrap;/);

    // E os espaços continuam a ser espaços de verdade, fora das palavras: são
    // eles, e só eles, que dão à linha um sítio por onde mudar.
    const palavras = [...container.querySelectorAll(".cortina__palavra")].map((p) => p.textContent);
    expect(palavras).toEqual(
      [getDictionary("pt").footer.sloganLine1, getDictionary("pt").footer.sloganLine2]
        .join(" ")
        .split(" "),
    );
  });

  it("a linha recorta o que sai dela — é o que faz a letra ENTRAR e não aparecer", () => {
    // Sem `overflow: hidden` a letra não entra por lado nenhum: aparece
    // deslocada no meio do ecrã e desliza para o sítio, por cima da outra
    // linha. O recorte é a peça, e não um acabamento.
    expect(BLOCO).toMatch(/\.cortina__linha \{[\s\S]*?overflow: hidden;/);
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

  it("o fundo é o verde da casa, e é o MESMO em todo o lado", () => {
    /**
     * Palavras dela: «quero esse verde mais claro, que nós temos, que é o
     * mesmo verde do site online».
     *
     * Houve um dia em que a proposta abria em quase-preto e o sítio em verde.
     * Não há razão para serem dois: é a mesma frase, da mesma casa. Este caso
     * existe para ninguém voltar a separá-los sem reparar.
     */
    const bloco = CSS.slice(CSS.indexOf("A CORTINA DA PROPOSTA"));
    expect(bloco).toMatch(/\.cortina \{[\s\S]*?background: var\(--color-moss-dark\);/);
    expect(bloco, "voltou a haver dois fundos").not.toContain("cortina--verde");
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

  it("NÃO tranca o scroll — quem quer descer, desce", () => {
    /**
     * ── ISTO JÁ FOI O CONTRÁRIO, E VALE A PENA SABER PORQUÊ ───────────────
     *
     * Trancava. Era um detalhe copiado do exemplo dela, com um argumento que
     * parecia bom: sem tranca, dá para arrastar uma página que não se vê, e ao
     * sair a cortina a página aparece já a meio.
     *
     * O defeito apareceu quando a cortina passou de 1000 para 2200 ms. Um
     * passeio da galeria que desce dois ecrãs e conta as fotografias
     * carregadas passou a encontrar TRÊS em vez de quatro — três vezes
     * seguidas, e só no telemóvel, onde é preciso descer para haver grelha.
     * O gesto dele caía dentro da tranca e não fazia nada.
     *
     * E o que aquele passeio faz é o que uma pessoa faz: chegar e arrastar
     * para baixo. Uma tranca que engole um gesto não protege ninguém — devolve
     * silêncio a quem pediu alguma coisa, que é o que o briefing dela proíbe.
     *
     * Quem arrasta durante a cortina fica onde pediu para ficar. O que fica a
     * proteger o toque é o `touch-action: pan-y` do CSS, no caso a seguir.
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
      expect(
        document.documentElement.style.overflow,
        "voltou a trancar o scroll — um gesto durante a cortina deixa de fazer efeito",
      ).toBe(antes);

      vi.advanceTimersByTime(3000);
      document
        .querySelector(".cortina")!
        .dispatchEvent(
          Object.assign(new Event("animationend"), { animationName: "cortina-a-subir" }),
        );
      expect(document.documentElement.style.overflow, "e não pisa quem já lá tinha regra").toBe(
        antes,
      );
    } finally {
      document.documentElement.style.overflow = "";
      vi.useRealTimers();
    }
  });

  it("o dedo arrasta a página por baixo, mas o toque para na cortina", () => {
    // As duas metades da mesma decisão: `pan-y` deixa passar o arrastar
    // vertical, e a caixa continua a intercetar o toque — ninguém carrega às
    // cegas num botão que não vê. Sem isto, uma caixa que cobre o ecrã inteiro
    // come o gesto de quem quer descer.
    expect(BLOCO).toMatch(/\.cortina \{[\s\S]*?touch-action: pan-y;/);
    expect(GUIAO, "a tranca do scroll voltou pelo guião").not.toContain("overflow");
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

  it("voltar pela cache do browser faz a cortina RECOMEÇAR — é o que ela pediu", () => {
    /**
     * ── ISTO JÁ FEZ O CONTRÁRIO, E A HISTÓRIA É A DELA ────────────────────
     *
     * Quando uma página volta da cache de histórico, o guião NÃO corre outra
     * vez — `document.currentScript` só existe durante a leitura. O que corre é
     * este ouvinte, que ficou vivo dentro do documento congelado. Sem ele, a
     * cortina voltava ao ecrã exactamente no estado em que estava quando se
     * saiu: se se saiu a meio da subida, voltava-se a um ecrã verde parado, sem
     * ninguém para o levantar — o `animationend` e o `setTimeout` que fariam
     * esse trabalho ficaram na visita anterior. Eram as palavras dela: «se eu
     * volto para trás no browser aquilo fica assim um bocado coiso».
     *
     * A primeira resposta foi FECHÁ-LA de imediato. Resolveu o ecrã parado, e
     * criou a queixa seguinte: «volto atrás e volto a entrar e já não aparece.
     * Eu quero que apareça sempre».
     *
     * Portanto agora recomeça: tira as classes de saída, tira o atributo da
     * raiz, e volta a contar do princípio. O que ela pediu, e não uma versão
     * defensiva do que ela pediu.
     */
    vi.useFakeTimers();
    try {
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      new Function(GUIAO)();

      // Uma visita inteira: a cortina sobe e sai.
      const el = () => document.querySelector(".cortina")!;
      vi.advanceTimersByTime(MIN + 1200);
      expect(el().classList.contains("cortina--fora"), "a primeira visita nem chegou ao fim").toBe(
        true,
      );

      // E volta-se pela cache do browser.
      const volta = new Event("pageshow") as Event & { persisted: boolean };
      Object.defineProperty(volta, "persisted", { value: true });
      window.dispatchEvent(volta);

      expect(el().classList.contains("cortina--fora"), "voltou e não se vê").toBe(false);
      expect(el().classList.contains("cortina--a-sair"), "voltou já a meio da saída").toBe(false);
      expect(
        document.documentElement.hasAttribute("data-cortina"),
        "o atributo da visita anterior ficou colado à raiz",
      ).toBe(false);

      // E fica o tempo todo outra vez, do princípio.
      vi.advanceTimersByTime(MIN - 50);
      expect(el().classList.contains("cortina--a-sair"), "saiu antes de a frase se ler").toBe(
        false,
      );
      vi.advanceTimersByTime(50);
      expect(el().classList.contains("cortina--a-sair")).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("mas no back office, voltar continua a fechá-la — lá a razão é outra", () => {
    // Onde há chave de sessão, quem está do outro lado é ela, a trabalhar. Uma
    // cortina a recomeçar a cada Voltar seria um imposto, não uma marca.
    vi.useFakeTimers();
    try {
      sessionStorage.clear();
      document.body.innerHTML = `<div class="cortina" data-sessao="cortina:teste"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      new Function(GUIAO)();
      const el = () => document.querySelector(".cortina")!;
      expect(el().classList.contains("cortina--fora")).toBe(false);

      const volta = new Event("pageshow") as Event & { persisted: boolean };
      Object.defineProperty(volta, "persisted", { value: true });
      window.dispatchEvent(volta);
      expect(el().classList.contains("cortina--fora"), "recomeçou onde não devia").toBe(true);
    } finally {
      sessionStorage.clear();
      vi.useRealTimers();
    }
  });

  it("num documento PRÉ-RENDERIZADO fica parada — senão chega ao ecrã já gasta", () => {
    /**
     * A causa que ninguém podia adivinhar a olhar para o ecrã.
     *
     * O sítio manda o navegador desenhar a página seguinte em segredo mal o
     * dedo se aproxima de uma ligação (`SpeculationRules.tsx`) — é o que a faz
     * abrir instantânea. Esse documento invisível corre os guiões todos: sem
     * esta guarda, a cortina fazia lá a animação inteira, para ninguém, e
     * chegava ao ecrã já fechada.
     *
     * A classe `cortina--parada` existe para isto: enquanto lá estiver, o CSS
     * não deixa nenhuma animação andar — nem a da cortina nem a das letras.
     */
    vi.useFakeTimers();
    try {
      Object.defineProperty(document, "prerendering", { value: true, configurable: true });
      document.body.innerHTML = `<div class="cortina"></div><script id="g"></script>`;
      Object.defineProperty(document, "currentScript", {
        value: document.getElementById("g"),
        configurable: true,
      });
      Object.defineProperty(document, "readyState", { value: "complete", configurable: true });
      new Function(GUIAO)();

      const el = () => document.querySelector(".cortina")!;
      expect(
        el().classList.contains("cortina--parada"),
        "arrancou dentro do pré-carregamento",
      ).toBe(true);

      // Passa muito mais do que o mínimo, e não acontece nada: a página ainda
      // não é a página.
      vi.advanceTimersByTime(MIN * 3);
      expect(el().classList.contains("cortina--a-sair"), "gastou-se sem ninguém a ver").toBe(false);
      expect(el().classList.contains("cortina--fora")).toBe(false);

      // A pessoa carrega na ligação: o documento passa a ser mesmo a página.
      Object.defineProperty(document, "prerendering", { value: false, configurable: true });
      document.dispatchEvent(new Event("prerenderingchange"));
      expect(el().classList.contains("cortina--parada"), "ficou congelada para sempre").toBe(false);

      // E só agora começa a contar.
      vi.advanceTimersByTime(MIN - 50);
      expect(el().classList.contains("cortina--a-sair")).toBe(false);
      vi.advanceTimersByTime(50);
      expect(el().classList.contains("cortina--a-sair"), "não arrancou na activação").toBe(true);
    } finally {
      Reflect.deleteProperty(document, "prerendering");
      vi.useRealTimers();
    }
  });

  it("a classe que congela existe no CSS, e apanha também as letras", () => {
    // Sem a metade do CSS, a do guião não faz nada. E se apanhasse só a
    // cortina, as letras corriam à mesma dentro de um pré-carregamento e
    // chegavam ao ecrã montadas.
    expect(BLOCO).toMatch(/\.cortina--parada,\s*\.cortina--parada \.cortina__letra \{/);
    expect(BLOCO).toMatch(/\.cortina--parada[\s\S]{0,120}animation: none !important;/);
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
