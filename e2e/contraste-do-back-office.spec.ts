import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRASTE MEDIDO ONDE ELE EXISTE — NO BROWSER, COM A CASCATA TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO por análise estática: 1288 chamadas a `text-foreground/NN` no back
 * office contra 147 aos tokens `--bo-*`, e 723 dessas — 56% — abaixo dos 4,5:1
 * que a norma pede. O `/25` mede 1,78:1, o `/40` 2,68:1, o `/45` 3,11:1.
 *
 * O `contraste-do-texto.test.ts` já guarda os TOKENS, e faz a conta a sério
 * (achata o alfa antes de medir, que é onde toda a gente se engana). O que ele
 * não pode ver é o que a cascata faz na página verdadeira: uma regra pode estar
 * escrita e não pegar — os utilitários do Tailwind vivem numa camada, e uma
 * regra na camada errada perde para a chamada sem dar erro nenhum.
 *
 * É por isso que isto é um passeio e não mais um teste de unidade.
 *
 * ── UMA RESSALVA HONESTA SOBRE A VERIFICAÇÃO AO CONTRÁRIO ────────────────
 *
 * A rotina desta casa é tirar a correcção e confirmar que o teste CAI. Aqui
 * NÃO consegui fazê-la de forma fiável, e é preciso dizê-lo.
 *
 * MEDIDO: com o `globals.css` revertido para o de HEAD, a cor computada saía
 * exactamente igual — `/45` continuava a dar `rgba(13,13,13,0.58)`, que é o
 * valor DA CORRECÇÃO. O servidor de desenvolvimento estava a servir o CSS
 * antigo: o `webServer` do Playwright reaproveita um servidor já a correr
 * (`reuseExistingServer: !CI`) e a reconstrução do CSS não é síncrona com a
 * gravação do ficheiro.
 *
 * Ou seja, a queda que eu observasse aqui podia ser verdadeira ou podia ser
 * uma corrida — e um sinal que tanto pode ser as duas coisas não é sinal.
 *
 * O que ESTÁ verificado, e é o que sustenta a correcção:
 *   · a aritmética, com a fórmula da norma (ver `contraste-do-texto.test.ts`);
 *   · que a regra PEGA num browser verdadeiro — medido: `/25`, `/40` e `/45`
 *     saem em `0.58` (o token `faint`), `/55` em `0.64` (`muted`), e o `/60`
 *     fica intacto em `oklab(… / 0.6)`;
 *   · os testes de unidade, esses sim vistos a cair.
 *
 * Na integração o servidor é construído de raiz (`CI=1` → `npm run start`), e
 * por isso é lá que este passeio vale como rede.
 */

/** A fórmula da norma, tal como o `contraste-do-texto.test.ts` a escreve. */
const FORMULA = `
  (function () {
    const canal = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = ([r, g, b]) => 0.2126 * canal(r / 255) + 0.7152 * canal(g / 255) + 0.0722 * canal(b / 255);
    const ler = (s) => {
      const m = s.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
      return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    // O fundo COMPOSTO: sobe a árvore até encontrar quem pinte de facto.
    const fundoDe = (el) => {
      let n = el;
      while (n) {
        const c = ler(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.95) return c.rgb;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const achatar = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
    window.__contraste = function () {
      const fora = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const proprio = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0,
        );
        if (!proprio) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.opacity === "0") continue;
        const cor = ler(st.color);
        if (!cor) continue;
        const bg = fundoDe(el);
        const composta = achatar(cor.rgb, cor.a, bg);
        const [a1, a2] = [lum(composta), lum(bg)].sort((x, y) => y - x);
        const racio = (a1 + 0.05) / (a2 + 0.05);
        // A norma dispensa texto GRANDE: 18,66px normal ou 14px a negrito
        // passam com 3:1. É por desenho, não por sorte — a Apple usa a mesma
        // dispensa no headline branco sobre a fotografia do hero.
        const px = parseFloat(st.fontSize);
        const negrito = Number(st.fontWeight) >= 700;
        const minimo = px >= 24 || (px >= 18.66 && negrito) ? 3 : 4.5;
        if (racio + 0.01 >= minimo) continue;
        fora.push({
          texto: (el.textContent || "").trim().slice(0, 30),
          racio: Math.round(racio * 100) / 100,
          px,
          classe: el.className.toString().slice(0, 60),
        });
      }
      return fora;
    };
  })();
`;

/**
 * A classe `admin-mode` chega num `useEffect`, portanto só existe depois da
 * primeira pintura — e TODAS as regras de chão desta casa estão presas a ela.
 * Medir antes é medir a página sem as regras. Já me apanhou noutro passeio.
 */
async function prontos(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
    timeout: 10_000,
  });
  await page.waitForTimeout(300);
  await page.evaluate(FORMULA);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR UM DESTINO SEM NUNCA PENDURAR O PASSEIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A casa tem o `irPara` no `caca/harness.ts` e foi com ele que isto começou.
 * Não serve AQUI, e a razão foi medida, com um cronómetro dentro do ciclo:
 *
 *     Visão Geral        916 ms   ✓
 *     Pedidos          4 449 ms   inalcançável
 *     Propostas      172 567 ms   inalcançável  ← levou o teste inteiro
 *
 * O `irPara` tenta oito vezes e, ao fim de cada tentativa falhada, clica em
 * «Mais» — porque os destinos fora do núcleo vivem lá dentro. Chamado logo a
 * seguir a um `goto`, a primeira tentativa falha só porque a página ainda não
 * hidratou, e a gaveta abre sem ser precisa. A partir daí ela TAPA a barra
 * lateral: na volta seguinte o botão já existe mas está coberto, e o
 * `alvo.click()` do ajudante não leva tecto de tempo — fica à espera de ficar
 * clicável até ao tecto do teste todo. Um passeio que espera 172 segundos não
 * diz o que aconteceu; diz só que desistiu.
 *
 * Aqui TODOS os passos têm tecto, e a gaveta abre-se UMA vez e só se for
 * precisa. O pior caso são poucos segundos e uma frase que diz qual foi o
 * destino e porquê — que é o que se quer de uma rede.
 *
 * (Não se corrige o `irPara` a partir daqui: é partilhado por outros passeios,
 * onde é chamado com a página já montada e nunca chega a abrir a gaveta à toa.
 * Mexer-lhe é outro bloco, com os seus próprios passeios a confirmar.)
 */
async function abrirDestino(page: import("@playwright/test").Page, destino: string) {
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
  /**
   * O nome traz o distintivo atrás — e traz um ESPAÇO ANTES DA VÍRGULA.
   *
   * MEDIDO, pela árvore de acessibilidade que o browser calcula:
   *
   *     button "Pedidos , 54 por responder"
   *              ▲──────┘
   *              o distintivo é um nó irmão, e o cálculo do nome mete um
   *              espaço entre ele e o texto
   *
   * Escrevi `(?:,.*)?$` — a vírgula colada — e o localizador nunca resolveu.
   * O passeio não ficava à espera do CLIQUE: ficava à espera de um botão que,
   * para ele, não existia, e só dizia «Timeout» ao fim de três minutos.
   *
   * (O `comDistintivo` do `caca/harness.ts` monta o mesmo padrão colado. Ou o
   * distintivo mudou de forma depois de ele ser escrito, ou os passeios que o
   * usam nunca calharam de passar por um destino com trabalho à espera. Fica
   * anotado; mexer-lhe é outro bloco, com os seus próprios passeios.)
   */
  const nome = new RegExp(`^${destino.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?:\\s*,.*)?$`);

  // Que o painel MONTOU. Sem isto, tudo o que vem a seguir julga que o destino
  // não existe, quando o que não existe ainda é a página.
  await nav
    .getByRole("button", { name: /^Visão Geral$/ })
    .first()
    .waitFor({ state: "visible", timeout: 30_000 });

  const alvo = () => nav.getByRole("button", { name: nome }).first();

  /**
   * Quem decide é a CAIXA, não o `count()` nem o `isVisible()`.
   *
   * MEDIDO a 1280, com a gaveta fechada: os cinco destinos de fora do núcleo
   * ESTÃO no DOM e medem 0×0 —
   *
   *     Visão Geral        x=12  w=231  h=41
   *     Propostas Aceites  x=0   w=0    h=0
   *
   * — portanto `count()` devolve 1 para eles e `isVisible()` também mente. Quem
   * perguntasse por qualquer um dos dois clicava num alvo de zero píxeis e
   * ficava à espera dele até ao tecto.
   */
  const temCaixa = async () => {
    const c = await alvo()
      .boundingBox()
      .catch(() => null);
    return !!c && c.width > 0 && c.height > 0;
  };

  if (!(await temCaixa())) {
    await nav
      .getByRole("button", { name: /^Mais$/i })
      .first()
      .click({ timeout: 5_000 });
    await expect(async () => expect(await temCaixa()).toBe(true)).toPass({ timeout: 10_000 });
  }

  await alvo().click({ timeout: 10_000 });
}

test.describe("o contraste do back office", () => {
  /**
   * ── A SONDA É O CASO PRINCIPAL, E A VARREDURA É A SECUNDÁRIA ────────────
   *
   * A varredura dos ecrãs passava com e sem a correcção. Numa base vazia os
   * ecrãs mostram estados vazios, e os elementos que vestem `text-foreground/40`
   * nem chegam a ser desenhados — estava a afirmar sobre uma página onde o que
   * eu queria medir não estava. É a terceira vez hoje que a verificação ao
   * contrário apanha uma rede furada.
   *
   * A sonda mede a REGRA: põe um elemento com cada opacidade na página
   * verdadeira, com a cascata e a ordem de camadas do Tailwind aplicadas, e
   * pergunta ao browser que cor lhe saiu. É determinista e não depende de haver
   * dados.
   */
  test("cada opacidade que chumbava passa a assentar num token verificado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));
    await prontos(page);

    const medidos = await page.evaluate(() => {
      const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      const lum = (p: number[]) =>
        0.2126 * canal(p[0] / 255) + 0.7152 * canal(p[1] / 255) + 0.0722 * canal(p[2] / 255);
      const saida: Record<string, number> = {};
      for (const n of [25, 30, 35, 40, 45, 50, 55, 60]) {
        const el = document.createElement("span");
        el.className = `text-foreground/${n}`;
        el.textContent = "sonda";
        document.body.appendChild(el);
        const m = getComputedStyle(el).color.match(/rgba?\(([^)]+)\)/);
        el.remove();
        if (!m) continue;
        const p = m[1]
          .split(/[,/ ]+/)
          .filter(Boolean)
          .map(Number);
        const a = p.length > 3 ? p[3] : 1;
        const composta = [0, 1, 2].map((i) => Math.round(p[i] * a + 255 * (1 - a)));
        const [hi, lo] = [lum(composta), lum([255, 255, 255])].sort((x, y) => y - x);
        saida[`/${n}`] = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      }
      return saida;
    });

    for (const [classe, racio] of Object.entries(medidos)) {
      expect(
        racio,
        `text-foreground${classe} mede ${racio}:1 — ${JSON.stringify(medidos)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    /**
     * E a ORDEM tem de se manter. Achatar tudo num só valor passava a norma e
     * apagava a hierarquia que alguém escreveu — que é meia correcção. O `/25`
     * era mais fraco do que o `/55` e continua a sê-lo.
     */
    expect(medidos["/25"], JSON.stringify(medidos)).toBeLessThan(medidos["/55"]);
    expect(medidos["/45"], JSON.stringify(medidos)).toBeLessThan(medidos["/50"]);
  });

  /**
   * ── E A VARREDURA PASSA A DESCOBRIR OS DESTINOS SOZINHA ──────────────────
   *
   * Aqui estavam DOIS nomes escritos à mão — «Visão Geral» e «Pedidos» — num
   * painel que tem onze destinos. MEDIDO no browser, a 390 px: a navegação
   * lateral oferece Visão Geral, Pedidos, Fazer proposta, Propostas,
   * Calendário, Tarefas, Propostas Aceites, Material, Temas, Estatísticas e
   * Definições. Nove ficavam de fora, e a escada de tinta tocou em todos.
   *
   * Uma lista escrita à mão é uma rede que envelhece: o destino que alguém
   * acrescentar amanhã nasce sem ninguém a olhar por ele, e ninguém se vai
   * lembrar de o vir cá pôr. Por isso os destinos leem-se da PRÓPRIA navegação
   * — o que estiver lá é varrido, e um destino novo é varrido no dia em que
   * nasce.
   *
   * ── PORQUE É UM SÓ PASSEIO E NÃO ONZE ────────────────────────────────────
   *
   * O Playwright fixa os testes antes de abrir o browser, portanto não é
   * possível gerar um por destino a partir de uma lista que só existe depois de
   * a página montar. E há uma vantagem em juntar: uma passagem só diz o mapa
   * inteiro de uma vez — «estes três destinos têm texto abaixo do mínimo» — em
   * vez de parar no primeiro e esconder os outros dois.
   *
   * ── A MESMA RESSALVA DA SONDA, OUTRA VEZ ─────────────────────────────────
   *
   * Numa base vazia muitos destinos mostram estados vazios, e o que se quer
   * medir nem chega a ser desenhado. Isto continua a ser a rede SECUNDÁRIA: a
   * sonda aqui em cima é que mede a regra. Aqui garante-se que, onde há texto,
   * ele está acima do mínimo — e é por isso que o número de destinos varridos
   * também se afirma: uma varredura que não encontrou navegação nenhuma
   * passaria vazia e diria que estava tudo bem.
   */
  test("nenhum texto chumba a norma, em destino nenhum do painel", async ({ page }) => {
    /**
     * O tecto da casa são 30 s, e este passeio faz ONZE vezes o trabalho de um:
     * por destino são uma ida à raiz do painel, um clique, a espera pela classe
     * `admin-mode`, os 300 ms de assentamento e uma varredura de toda a árvore
     * de texto. MEDIDO: ~500 ms por destino nos que montam depressa.
     *
     * Não se corta trabalho para caber — cortar era voltar a varrer dois
     * destinos. Levanta-se o tecto, e diz-se porquê.
     */
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 1280, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));
    await prontos(page);

    const nav = page.getByRole("navigation", { name: /Navegação do back office/i });

    /**
     * ── OS DESTINOS LEEM-SE DA PRÓPRIA NAVEGAÇÃO ─────────────────────────
     *
     * Primeiro os do núcleo; depois abre-se a gaveta «Mais», que é onde vivem
     * os outros cinco, e lê-se outra vez. O «Mais» não é destino nenhum, e sai.
     *
     * O nome traz o distintivo atrás — MEDIDO: «Pedidos, 54 por responder54» —,
     * por isso corta-se na primeira vírgula. É o mesmo nome que o `irPara`
     * espera, e é ele que volta a acrescentar o distintivo ao procurar.
     */
    const nomesDe = async () =>
      (await nav.getByRole("button").allTextContents())
        .map((t) => t.trim().split(/[\n,]/)[0].trim())
        .filter(Boolean);

    const destinos = new Set(await nomesDe());
    const mais = nav.getByRole("button", { name: /^Mais$/i }).first();
    if ((await mais.count()) > 0) {
      await mais.click({ timeout: 5_000 }).catch(() => {});
      await page.waitForTimeout(400);
      for (const n of await nomesDe()) destinos.add(n);
    }
    destinos.delete("Mais");

    expect(
      destinos.size,
      `a navegação deu ${destinos.size} destinos (${[...destinos].join(", ")}) — ` +
        "uma varredura sem destinos passaria vazia e não é isso que se quer afirmar",
    ).toBeGreaterThan(6);

    const falhas: Record<string, unknown[]> = {};
    const varridos: string[] = [];
    const inalcancaveis: string[] = [];

    /**
     * ── E O ESTÚDIO FICA PARA O FIM ──────────────────────────────────────
     *
     * «Fazer proposta» abre o estúdio, e o estúdio TAPA a navegação: MEDIDO,
     * todos os cliques a seguir a ele expiravam. Recarregar a página não
     * resolvia — o painel volta a abrir onde ela estava, portanto a recarga
     * caía outra vez dentro do estúdio.
     *
     * Como só há um destino assim, a ordem resolve-o sem truque nenhum: varre-
     * se tudo o resto primeiro, e o estúdio no fim, quando já não há para onde
     * ir a seguir. Sem recargas, o passeio ficou também três vezes mais rápido.
     */
    const TAPA_A_NAVEGACAO = ["Fazer proposta"];
    const porOrdem = [
      ...[...destinos].filter((d) => !TAPA_A_NAVEGACAO.includes(d)),
      ...[...destinos].filter((d) => TAPA_A_NAVEGACAO.includes(d)),
    ];

    for (const destino of porOrdem) {
      /**
       * ── E VOLTA-SE SEMPRE À RAIZ ANTES DE CADA DESTINO ─────────────────
       *
       * A primeira versão clicava a partir de onde calhasse estar, e MEDIDO foi
       * assim que partiu: «Fazer proposta» abre o estúdio, o estúdio tapa a
       * navegação, e os quatro cliques seguintes expiravam aos 10 s cada um —
       * o passeio inteiro pendurado sem dizer porquê.
       */
      const t0 = Date.now();
      try {
        await abrirDestino(page, destino);
      } catch (erro) {
        inalcancaveis.push(`${destino} (${Date.now() - t0} ms: ${String(erro).split("\n")[0]})`);
        continue;
      }
      await prontos(page);
      varridos.push(destino);

      const fora = await page.evaluate(() =>
        (window as unknown as { __contraste: () => unknown[] }).__contraste(),
      );
      if (fora.length > 0) falhas[destino] = fora.slice(0, 6);
    }

    // Um destino a que não se chega é uma rede furada, não um destino limpo.
    expect(
      inalcancaveis,
      `não cheguei a ${inalcancaveis.length} destinos: ${inalcancaveis.join(", ")}`,
    ).toEqual([]);

    expect(
      falhas,
      `texto abaixo do mínimo em ${Object.keys(falhas).length} de ${varridos.length} destinos ` +
        `(${varridos.join(", ")}):\n${JSON.stringify(falhas, null, 1)}`,
    ).toEqual({});
  });
});
