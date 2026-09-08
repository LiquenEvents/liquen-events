import { test, expect, type Page } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O VIDRO DEIXA PASSAR — MEDIDO NO PIXEL, NÃO DECLARADO NO CSS @vidro
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Ela mandou as barras de separadores do Instagram e do
 * WhatsApp no iOS 26 e disse, duas vezes e cada vez mais claro:
 *
 *     «o menu no telemóvel não está assim! eu quero o liquid glass do insta e
 *      do watsapp e da apple no menu e nao esta igual!»
 *
 * A suspeita à entrada era que a cápsula não tivesse `backdrop-filter`
 * nenhum, ou que não passasse nada por baixo dela. **Fui medir, e as duas
 * estavam erradas.** O filtro estava lá e funcionava, e o conteúdo passava
 * mesmo por baixo — com uma lista comprida e o dedo a rolar, o pixel do meio
 * da cápsula mudava de cor a cada posição.
 *
 * O que estava errado era outra coisa, e só uma medição a mostra. Sonda de
 * cor conhecida por trás da barra, pixel do meio lido num Chromium:
 *
 *     sonda preta ..... rgb(204, 204, 204)
 *     sonda branca .... rgb(255, 255, 255)
 *     ─────────────────────────────────────
 *     transmissão ..... 51/255 = **20%**
 *
 * A 0,80 de opacidade, só um quinto do que passa por trás chega ao olho. O
 * desfoque estava a desfocar uma coisa que quase não se via. É o ponto 1 da
 * investigação que ela mandou, à letra: «um `background` a 0,92 de opacidade
 * não é vidro; é tinta».
 *
 * ── PORQUE É QUE NENHUM TESTE DESTA CASA APANHAVA ISTO ─────────────────────
 *
 * Porque todos os que existiam mediam a REGRA, e a regra estava certa. O
 * `barra-que-flutua.test.ts` lê o `globals.css` e confirma que as classes lá
 * estão; o `material-do-que-aparece-por-cima.test.ts` calcula contrastes a
 * partir dos tokens. Nenhum dos dois pode ver o que só existe depois de o
 * browser compor duas camadas — e a transmissão é exactamente isso: não está
 * escrita em lado nenhum do CSS, é o produto do α da superfície com o que
 * estiver por trás dela nesse fotograma.
 *
 * É a mesma assinatura de avaria que o `o-movimento-chega-ao-elemento.spec.ts`
 * guarda para as molas: **o CSS fica com a regra e sem o efeito, e a única
 * maneira de o ver é perguntar a um browser.**
 *
 * ── O QUE ISTO MEDE, E PORQUE É QUE SÃO ESTAS TRÊS COISAS ─────────────────
 *
 *   1. **O filtro tem desfoque E saturação.** O desfoque sozinho acinzenta o
 *      que passa; é a saturação que devolve a cor e faz o vidro sangrar o que
 *      está por baixo em vez de o sujar. Um `blur()` sem `saturate()` é o erro
 *      mais comum de quem imita este material, e não dá erro nenhum.
 *
 *   2. **O pixel por baixo da cápsula MUDA quando o que está por trás muda.**
 *      É a única prova de que há transparência a sério. Uma caixa opaca com
 *      `backdrop-filter` declarado passa nos pontos 1 e 3 e chumba neste.
 *
 *   3. **A superfície não é opaca**, e a fronteira não é um número escrito
 *      aqui: é o token `--bo-material-fino` pintado num elemento e lido de
 *      volta. Quem mexer no token move o teste atrás dele; quem trocar a
 *      classe da cápsula por outra qualquer parte-o.
 *
 * ── E O CONTROLO NEGATIVO, QUE É O QUE FAZ ISTO VALER ALGUMA COISA ────────
 *
 * Corrido com a `bo-material-fino` tirada da cápsula — ou seja, com a barra
 * como estava antes desta ronda — o passeio fica VERMELHO nos pontos 2 e 3:
 * 51/255 contra os 64 exigidos, e α 0,80 contra o token. O ponto 1 continua
 * verde, e é bom que continue: o filtro nunca foi o que estava avariado, e um
 * guarda que só medisse o filtro teria dado a barra por boa.
 */

/** O limiar: um quarto do que passa por trás tem de chegar ao olho.
 *
 * O número não é redondo por acaso. Medido nos dois estados:
 *
 *     material a 0,80 (o de antes) ... 51/255 = 20%   ← chumba
 *     material a 0,66 (o de agora) ... 87/255 = 34%   ← passa
 *
 * 64 fica entre os dois com folga para os dois lados: 25% acima do que se
 * mede hoje e 25% abaixo do que se media antes. Um limiar colado a qualquer
 * um deles seria um teste que pisca com o anti-aliasing. */
const TRANSMISSAO_MINIMA = 64;

/** A barra é a mesma em todas as larguras, mas a queixa dela é do telemóvel —
 * e é no telemóvel que a cápsula reparte a faixa toda por quatro. */
test.use({ viewport: { width: 390, height: 844 } });

const BARRA = "nav[aria-label='Navegação do back office']";
const CAPSULA = `${BARRA} > div`;

/**
 * ── PORQUE É QUE A SONDA É UM ELEMENTO E NÃO O CONTEÚDO REAL DA PÁGINA ────
 *
 * Porque o que se quer medir é o MATERIAL, e o conteúdo real de um back office
 * vazio não tem cor nenhuma para dar. Medido: numa instalação sem dados, as
 * quatro vistas da barra não chegam sequer a rolar (`scrollHeight` igual à
 * janela), e o pixel por baixo da cápsula fica em rgb(254, 254, 254) em todas
 * elas. Um guarda que dependesse dos dados dela passaria a verde por não ter
 * nada para medir — que é o pior que um guarda pode fazer.
 *
 * A sonda dá as duas cores extremas — preto e branco — por trás de TODA a
 * barra, e a diferença entre os dois pixéis é a transmissão do material.
 * Não simula o vidro: alimenta-o.
 *
 * Vai a `z-index: 0` porque a barra está no plano 30 (a escada de planos está
 * escrita no `AdminClient.tsx`), e `pointer-events: none` para não roubar
 * toques a nada.
 */
async function porSonda(page: Page) {
  await page.evaluate(() => {
    const s = document.createElement("div");
    s.id = "sonda-do-vidro";
    s.style.cssText = "position:fixed;inset:0;z-index:0;pointer-events:none";
    document.body.appendChild(s);
  });
}

async function tirarSonda(page: Page) {
  await page.evaluate(() => document.getElementById("sonda-do-vidro")?.remove());
}

/**
 * Lê uma fila de pixéis atravessada no meio do elemento, a partir de um
 * retrato do ecrã.
 *
 * ── PORQUE É QUE É UMA FILA E NÃO UM PIXEL ────────────────────────────────
 *
 * Porque no meio da cápsula há coisas que não são vidro: os ícones, os
 * rótulos, e a pastilha OPACA do destino onde ela está. Um pixel único podia
 * cair em cima de qualquer um deles e medir zero de transmissão com o vidro
 * perfeito — um vermelho que não quer dizer nada, que é o tipo de vermelho que
 * se aprende a ignorar.
 *
 * A mediana da fila resolve-o sem fazer batota: a pastilha ocupa um quarto da
 * largura e a tinta é uma minoria dos pixéis, portanto a mediana cai sempre em
 * superfície. E é uma mediana e não um máximo de propósito — um máximo
 * escolheria o pixel mais favorável, que é exactamente como se escreve um
 * teste que passa sempre.
 */
async function filaDePixeis(page: Page, seletor: string): Promise<[number, number, number][]> {
  const retrato = await page.screenshot();
  return page.evaluate(
    async ({ url, sel }) => {
      const img = new Image();
      img.src = url;
      await img.decode();
      const el = document.querySelector(sel)!;
      const r = el.getBoundingClientRect();
      const lona = document.createElement("canvas");
      lona.width = img.width;
      lona.height = img.height;
      const ctx = lona.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      // O retrato pode vir a uma escala diferente da do CSS (retina): a
      // conversão faz-se pela largura, e não por um `devicePixelRatio` que o
      // Playwright pode não estar a usar.
      const escala = img.width / window.innerWidth;
      const y = Math.round((r.top + r.height / 2) * escala);
      const fila: [number, number, number][] = [];
      for (let x = Math.round((r.left + 6) * escala); x < Math.round((r.right - 6) * escala); x++) {
        const d = ctx.getImageData(x, y, 1, 1).data;
        fila.push([d[0], d[1], d[2]]);
      }
      return fila;
    },
    { url: "data:image/png;base64," + retrato.toString("base64"), sel: seletor },
  );
}

async function pintarSonda(page: Page, cor: string) {
  await page.evaluate((c) => {
    document.getElementById("sonda-do-vidro")!.style.background = c;
  }, cor);
  // Um fotograma chega para o `backdrop-filter` recompor; os 200 ms são
  // margem para a máquina do CI, e não uma transição à espera (o material não
  // tem nenhuma — o `backdrop-filter` está de propósito fora das animações).
  await page.waitForTimeout(200);
}

const mediana = (v: number[]) => [...v].sort((a, b) => a - b)[Math.floor(v.length / 2)];

/** A transmissão do material: quanto do que está por trás chega ao olho. */
async function transmissao(page: Page, seletor: string): Promise<number> {
  await porSonda(page);
  await pintarSonda(page, "#000000");
  const escuro = await filaDePixeis(page, seletor);
  await pintarSonda(page, "#ffffff");
  const claro = await filaDePixeis(page, seletor);
  await tirarSonda(page);

  expect(escuro.length, "a fila de pixéis saiu vazia — o elemento não tem largura").toBeGreaterThan(
    40,
  );
  const deltas = escuro.map((p, i) =>
    Math.max(...[0, 1, 2].map((c) => Math.abs(claro[i][c] - p[c]))),
  );
  return mediana(deltas);
}

/** Um token pintado num elemento e lido de volta.
 *
 * Uma propriedade personalizada NÃO resolve `light-dark()` quando lida com
 * `getPropertyValue` — devolve o texto da pergunta, não a resposta. É a
 * armadilha que o `o-modo-escuro-existe.spec.ts` conta por extenso, e é por
 * isso que aqui se pinta em vez de se ler. */
async function tokenPintado(page: Page, nome: string): Promise<string> {
  return page.evaluate((n) => {
    const dentro = document.querySelector("[data-admin-mode]") ?? document.body;
    const sonda = document.createElement("div");
    sonda.style.backgroundColor = `var(${n})`;
    dentro.appendChild(sonda);
    const pintado = getComputedStyle(sonda).backgroundColor;
    sonda.remove();
    return pintado;
  }, nome);
}

/** O α de um `rgb(...)`/`rgba(...)` como o browser o devolve. Sem quarto
 * canal, é opaco. */
function alfa(css: string): number {
  const n = (css.match(/[\d.]+/g) ?? []).map(Number);
  return n.length >= 4 ? n[3] : 1;
}

/**
 * ── E ESPERAR PELA CORTINA, QUE FOI O PRIMEIRO VERMELHO DESTE FICHEIRO ────
 *
 * A primeira versão disto esperava pela barra e media 400 ms depois. Os
 * números que saíram não faziam sentido nenhum: a fila inteira de pixéis dava
 * `[76, 97, 80]` — verde de acento — e dava o MESMO com a sonda vermelha e com
 * a azul, ou seja transmissão zero num vidro que o teste do lado media a 34%.
 *
 * Gravei o retrato que o teste estava a ler e a resposta estava lá: era a
 * cortina de entrada do sítio, «Decoramos eventos, eternizamos memórias.», a
 * tapar o ecrã inteiro. O DOM já tinha a barra — daí o `waitFor` passar e o
 * `getBoundingClientRect` dar o rectângulo certo —, mas o que estava PINTADO
 * naquele fotograma era outra coisa.
 *
 * É a armadilha desta família de testes ao contrário: aqui não é o CSS que
 * fica sem efeito, é o teste que mede o fotograma errado. E era intermitente,
 * que é pior — a cortina dura o que dura, e conforme a máquina do CI esteja
 * mais ou menos ocupada o retrato calha dentro ou fora dela.
 *
 * O `Cortina.tsx` marca `data-cortina="fora"` na raiz quando acaba (o guião
 * está lá, em linha, para correr antes da primeira pintura). Esperar por esse
 * atributo é esperar pela coisa certa, e não por um número de milissegundos
 * que um dia deixa de chegar.
 */
async function abrirOPainel(page: Page) {
  await page.goto("/pt/orcamento/admin");
  await page.locator(BARRA).waitFor({ state: "visible" });
  // A cápsula entra com a barra; esperar por ela evita medir a meio da
  // entrada, quando ainda há um `transform` a correr.
  await page.locator(CAPSULA).waitFor({ state: "visible" });
  // O segundo braço é a rede: o `layout.tsx` do grupo `(admin)` monta sempre a
  // cortina, mas se um dia deixar de a montar o guião nunca corre e o atributo
  // nunca aparece — e isto ficava quinze segundos à espera para depois falhar
  // por uma razão que não tem nada que ver com vidro. Sem cortina no ecrã, não
  // há nada por que esperar.
  await page.waitForFunction(
    () =>
      document.documentElement.dataset.cortina === "fora" ||
      document.querySelector(".cortina") === null,
    null,
    { timeout: 15_000 },
  );
  await page.waitForTimeout(400);
}

test.describe("a barra de destinos é vidro a sério @vidro", () => {
  test("o filtro tem desfoque E saturação — a saturação é o que lhe devolve a cor", async ({
    page,
  }) => {
    await abrirOPainel(page);

    const filtro = await page
      .locator(CAPSULA)
      .evaluate((el) => getComputedStyle(el).backdropFilter || "");

    // `none` é o que se lê quando NENHUMA regra pegou — vale a pena dizê-lo
    // com estas palavras, como o guarda das molas diz do `all 0s`.
    expect(filtro, "a cápsula não tem `backdrop-filter` nenhum — não há material").not.toBe("none");

    const desfoque = filtro.match(/blur\(([\d.]+)px\)/);
    expect(desfoque, `sem \`blur()\` no filtro calculado (era \`${filtro}\`)`).not.toBeNull();
    expect(
      Number(desfoque![1]),
      "um desfoque de zero é o mesmo que não haver desfoque",
    ).toBeGreaterThan(8);

    // O browser devolve `saturate()` em fracção (1.8) e não em percentagem.
    const saturacao = filtro.match(/saturate\(([\d.]+)%?\)/);
    expect(
      saturacao,
      `sem \`saturate()\` no filtro calculado (era \`${filtro}\`). Um desfoque puro ` +
        "acinzenta o que passa por baixo; é a saturação que lhe devolve a cor, e sem ela " +
        "o vidro parece sujo.",
    ).not.toBeNull();
    const valor = Number(saturacao![1]);
    expect(valor > 2 ? valor / 100 : valor, "`saturate(1)` é não saturar nada").toBeGreaterThan(1);
  });

  test("a superfície não é tinta: o α é o do token, e o token é translúcido", async ({ page }) => {
    await abrirOPainel(page);

    const fundo = await page
      .locator(CAPSULA)
      .evaluate((el) => getComputedStyle(el).backgroundColor);

    expect(
      alfa(fundo),
      `a superfície da cápsula é opaca (\`${fundo}\`) — com ou sem \`backdrop-filter\`, ` +
        "uma caixa opaca não é vidro",
    ).toBeLessThan(1);

    // E é o token que manda, não um número copiado para aqui: quem afinar o
    // `--bo-material-fino` no `globals.css` não tem de vir afinar um segundo
    // sítio, e quem trocar a classe da cápsula por outra parte isto.
    const token = await tokenPintado(page, "--bo-material-fino");
    expect(
      fundo,
      `a cápsula deixou de usar o \`--bo-material-fino\` (tem \`${fundo}\`, o token vale ` +
        `\`${token}\`) — provavelmente perdeu a classe \`bo-material-fino\``,
    ).toBe(token);
  });

  test("o pixel por baixo da cápsula MUDA quando o que passa por trás muda", async ({ page }) => {
    await abrirOPainel(page);

    const passou = await transmissao(page, CAPSULA);
    expect(
      passou,
      `só ${passou}/255 (${((passou / 255) * 100).toFixed(0)}%) do que está por trás da ` +
        `cápsula chega ao olho, e o mínimo é ${TRANSMISSAO_MINIMA}/255. Isto é o defeito ` +
        "que trouxe este ficheiro: o `backdrop-filter` está lá, o conteúdo passa mesmo por " +
        "baixo, e mesmo assim não há vidro nenhum — porque a superfície por cima é opaca " +
        "de mais para deixar ver o que passa.",
    ).toBeGreaterThanOrEqual(TRANSMISSAO_MINIMA);
  });

  test("e o que passa chega com COR, e não em cinzento", async ({ page }) => {
    await abrirOPainel(page);
    await porSonda(page);

    await pintarSonda(page, "#c81400");
    const comVermelho = await filaDePixeis(page, CAPSULA);
    await pintarSonda(page, "#0014c8");
    const comAzul = await filaDePixeis(page, CAPSULA);
    await tirarSonda(page);

    // A mesma mediana, canal a canal: com a sonda vermelha a cápsula tem de
    // ficar mais vermelha do que azul, e ao contrário. Um desfoque sem
    // saturação faria as duas darem o mesmo cinzento — e o teste de cima, que
    // só olha para o texto do filtro, não distinguiria os dois casos.
    const rVermelho = mediana(comVermelho.map((p) => p[0] - p[2]));
    const rAzul = mediana(comAzul.map((p) => p[0] - p[2]));

    expect(
      rVermelho - rAzul,
      `a cápsula não muda de matiz com o que passa por baixo (R−B: ${rVermelho} com a sonda ` +
        `vermelha, ${rAzul} com a azul). O vidro está a acinzentar o que refracta.`,
    ).toBeGreaterThan(20);
  });

  test("no modo escuro o vidro continua a ser vidro", async ({ page }) => {
    await abrirOPainel(page);
    // O modo escuro desta casa é um atributo no elemento que o servidor marca
    // — a escolha explícita ganha ao sistema. Ver `o-modo-escuro-existe.spec.ts`.
    await page.evaluate(() => {
      (document.querySelector("[data-admin-mode]") as HTMLElement).dataset.aparencia = "escuro";
    });
    await page.waitForTimeout(300);

    const fundo = await page
      .locator(CAPSULA)
      .evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(alfa(fundo), `a cápsula ficou opaca no escuro (\`${fundo}\`)`).toBeLessThan(1);

    const passou = await transmissao(page, CAPSULA);
    expect(
      passou,
      `no modo escuro só ${passou}/255 do que está por trás chega ao olho. O material ` +
        "escuro é o mais translúcido da casa (0,52) e tem de medir mais do que o claro, " +
        "não menos.",
    ).toBeGreaterThanOrEqual(TRANSMISSAO_MINIMA);
  });

  /**
   * ── E QUEM PEDE MENOS TRANSPARÊNCIA RECEBE UMA SUPERFÍCIE, NÃO UM VIDRO ──
   *
   * Isto não é um extra: é a outra metade de tudo o que está acima. Há quem o
   * desfoque e a translucidez cansem ou desorientem, e o sistema deixa dizê-lo.
   * Um material que ignore esse pedido é um material que exclui gente.
   *
   * Emula-se pelo CDP e não pelo `emulateMedia` do Playwright, que (na versão
   * desta casa) não conhece esta media query. E mede-se o EFEITO — superfície
   * opaca e transmissão a zero —, não a media query: o `matchMedia` podia dar
   * `true` com o CSS por aplicar, que é a avaria de sempre desta casa.
   */
  test("com `prefers-reduced-transparency` não há vidro nenhum — há uma superfície sólida", async ({
    page,
  }) => {
    await abrirOPainel(page);

    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-transparency", value: "reduce" }],
    });
    await page.waitForTimeout(200);

    const medido = await page.locator(CAPSULA).evaluate((el) => {
      const s = getComputedStyle(el);
      return { fundo: s.backgroundColor, filtro: s.backdropFilter };
    });

    expect(
      medido.filtro,
      `o \`backdrop-filter\` sobreviveu ao pedido (\`${medido.filtro}\`) — continua a custar ` +
        "uma composição por fotograma a quem pediu para não a ter",
    ).toBe("none");
    expect(
      alfa(medido.fundo),
      `a superfície continua translúcida (\`${medido.fundo}\`) — sem desfoque por baixo, ` +
        "isso deixa passar o conteúdo NÍTIDO por trás do texto, que é pior do que o vidro",
    ).toBe(1);

    const passou = await transmissao(page, CAPSULA);
    expect(
      passou,
      `ainda passam ${passou}/255 através de uma barra que devia estar sólida`,
    ).toBeLessThanOrEqual(2);
  });

  /**
   * A peça redonda vive ao lado da cápsula e é a mesma barra. Se as duas não
   * tiverem o mesmo grau de material, lêem-se como dois vidros diferentes
   * colados um ao outro — que é ao certo o defeito que a Parte −1 do
   * `docs/DESIGN-SYSTEM.md` manda evitar («convergir a família que já existe
   * em vez de criar uma segunda ao lado»).
   */
  test("a peça redonda é do mesmo vidro que a cápsula, e não de outro", async ({ page }) => {
    await abrirOPainel(page);

    // `:scope > button` e não `button`: os quatro destinos também são botões, e
    // vivem DENTRO da cápsula. O primeiro `nav button` é o destino activo, cuja
    // pastilha é opaca de propósito — comparar com ele dava um vermelho a dizer
    // uma coisa verdadeira sobre a peça errada. (Foi o que deu à primeira.)
    const [daCapsula, daPeca] = await page.evaluate((sel) => {
      const nav = document.querySelector(sel)!;
      const ler = (el: Element) => {
        const s = getComputedStyle(el);
        return `${s.backgroundColor} · ${s.backdropFilter}`;
      };
      return [ler(nav.querySelector(":scope > div")!), ler(nav.querySelector(":scope > button")!)];
    }, BARRA);

    expect(
      daPeca,
      "a peça redonda e a cápsula têm materiais diferentes — lado a lado, isso lê-se como " +
        "dois vidros colados",
    ).toBe(daCapsula);
  });
});
