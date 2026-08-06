import { test, expect, type ConsoleMessage, type Page } from "@playwright/test";
import {
  AUDITOR,
  ECRA_ESTREITO,
  ALVO_MIN,
  LETRA_CAMPO_MIN,
  descreverAlvo,
  descreverCampo,
  descreverCulpado,
  descreverTexto,
  descreverTapado,
  TEXTO_MIN,
} from "./ergonomia-tactil.mjs";

/**
 * Mobile back-office smoke test (~390px phone, touch).
 *
 * The daily driver for this back office is often a phone. This spec logs in on a
 * phone-sized, touch-enabled viewport and, for each destination, asserts:
 *   1. the view mounts (its H1 shows),
 *   2. the page does NOT scroll horizontally (the #1 "not adapted" smell), and
 *   3. no console / page errors fire.
 * It also checks the mobile menu button opens the full navigation, since on a
 * phone the sidebar is off-canvas. Read-only: never creates/edits/deletes data.
 */

// 375 px e não 390: o iPhone SE é o telemóvel mais estreito que ainda se usa a
// sério, e é a largura em que tudo o que é apertado se parte primeiro.
// `hasTouch` importa para além do gesto — é o que faz `(pointer: coarse)` ser
// verdade, e é nessa media query que assentam os alvos de 44 px.
test.use({ viewport: ECRA_ESTREITO, isMobile: true, hasTouch: true });

const IGNORED_CONSOLE = [
  /Download the React DevTools/i,
  /React DevTools/i,
  /\[Fast Refresh\]/i,
  /favicon/i,
  /Failed to load resource: the server responded with a status of 404/i,
  /is using quality/i, // next/image quality hint — not a runtime defect
  // Recursos de terceiros (analytics) inalcançáveis na rede onde o teste corre
  // — condição do ambiente, não defeito da aplicação. Um erro lançado pelo
  // nosso próprio código continua a falhar o passeio. (Igual aos outros passeios.)
  /net::ERR_(TUNNEL_CONNECTION_FAILED|CONNECTION_|NAME_NOT_RESOLVED|PROXY_)/i,
];
const isIgnored = (t: string) => IGNORED_CONSOLE.some((re) => re.test(t));

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m: ConsoleMessage) => {
    if (m.type() === "error" && !isIgnored(m.text())) errors.push(`console.error: ${m.text()}`);
  });
  page.on("pageerror", (e) => {
    if (!isIgnored(e.message)) errors.push(`pageerror: ${e.message}`);
  });
  return errors;
}

async function login(page: Page): Promise<boolean> {
  await page.goto("/orcamento/admin");
  await expect(page.getByRole("heading", { name: /Painel de Gestão/i })).toBeVisible();
  await page.getByLabel(/O teu nome/i).fill("Catarina");
  await page.getByLabel(/Palavra-passe/i).fill("liquen2026");
  await page.getByRole("button", { name: /^Entrar$/ }).click();
  try {
    await expect(page.getByRole("navigation", { name: /Navegação do back office/i })).toBeVisible({
      timeout: 8000,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * As quatro regras de ergonomia táctil, numa vista.
 *
 * O que se mede e porquê está escrito em `ergonomia-tactil.mjs`, que é o mesmo
 * módulo que o varrimento `scripts/auditar-toque-admin.mjs` usa para produzir o
 * relatório. Aqui só se transforma o resultado em falha de CI.
 *
 * Nota sobre o overflow: o teste clássico (`scrollWidth > clientWidth`) está
 * CEGO neste site, porque `globals.css` tem `body { overflow-x: clip }` — o
 * clip tira a barra de scroll e o número nunca cresce. Este é o teste que
 * mede a margem direita de cada elemento, que é o que se quer saber: o que
 * passa da margem fica cortado e inalcançável.
 */
async function expectErgonomiaTactil(page: Page, label: string) {
  const r = (await page.evaluate(AUDITOR)) as {
    examinados: number;
    pequenos: Parameters<typeof descreverAlvo>[0][];
    camposPequenos: Parameters<typeof descreverCampo>[0][];
    foraDoEcra: { x: number; rotulo: string; texto: string; tag: string }[];
    overflow: { culpados: Parameters<typeof descreverCulpado>[0][] };
    textoEsmagado: Parameters<typeof descreverTexto>[0][];
    tapados: Parameters<typeof descreverTapado>[0][];
  };

  // A vista tem de ter sido mesmo desenhada — zero elementos interactivos quer
  // dizer que se mediu um ecrã vazio, e três verdes falsos valem menos do que
  // uma falha honesta.
  expect(r.examinados, `"${label}": nada interactivo para medir — a vista montou?`).toBeGreaterThan(
    0,
  );

  /**
   * TUDO O QUE ESTÁ MAL, DE UMA VEZ.
   *
   * Antes eram cinco `expect` em fila: o primeiro a falhar escondia os outros
   * quatro, e corrigir uma vista passava a ser cinco voltas de "corrigir,
   * correr, descobrir o seguinte" — com 1,5 minutos de passeio a cada volta.
   * Agora falha uma vez e diz tudo o que encontrou.
   */
  const achados: string[] = [];

  if (r.pequenos.length) {
    achados.push(
      `${r.pequenos.length} alvo(s) abaixo de ${ALVO_MIN}x${ALVO_MIN}px:\n` +
        r.pequenos.map(descreverAlvo).join("\n"),
    );
  }

  if (r.camposPequenos.length) {
    achados.push(
      `${r.camposPequenos.length} campo(s) com letra < ${LETRA_CAMPO_MIN}px — o Safari do iOS ` +
        `amplia a página ao focá-los e não desamplia:\n` +
        r.camposPequenos.map(descreverCampo).join("\n"),
    );
  }

  // Nada focável fora do ecrã. A gaveta fechada continua no DOM em `x = -244`;
  // sem `inert`, o TAB de um teclado externo e o varrimento do VoiceOver entram
  // lá dentro e o foco desaparece do ecrã.
  if (r.foraDoEcra.length) {
    achados.push(
      `${r.foraDoEcra.length} elemento(s) focáveis fora do ecrã — o foco do teclado desaparece ` +
        `lá para dentro. Falta \`inert\`?\n` +
        r.foraDoEcra.map((f) => `  x=${f.x}  "${f.rotulo || f.texto || f.tag}"`).join("\n"),
    );
  }

  // TEXTO ESMAGADO. O defeito que motivou esta verificação: no estúdio de
  // propostas, um parágrafo irmão de três botões `shrink-0` dentro de um `flex`
  // em linha ficava com ~30 px e passava a UMA PALAVRA POR LINHA — duas frases
  // a ocupar dois ecrãs de scroll. Mede-se a largura RENDERIZADA porque é a
  // única forma de o apanhar: no código não se vê, e a grelha de classes está
  // toda correcta vista uma a uma.
  if (r.textoEsmagado.length) {
    achados.push(
      `${r.textoEsmagado.length} bloco(s) de texto com menos de ${TEXTO_MIN}px de largura. ` +
        `Texto corrido assim estreito parte uma palavra por linha — quase sempre é um parágrafo ` +
        `dentro de um flex em linha com uma barra de botões \`shrink-0\` ao lado. A correcção é ` +
        `empilhar abaixo de \`sm\`:\n` +
        r.textoEsmagado.map(descreverTexto).join("\n"),
    );
  }

  // TAPADOS. Um botão do tamanho certo, dentro da margem, no ecrã — e com uma
  // barra `sticky` por cima. Tocar ali toca na barra. Aconteceu duas vezes
  // neste estúdio, e nenhum dos outros cheques o via.
  if (r.tapados.length) {
    achados.push(
      `${r.tapados.length} elemento(s) interactivos por baixo de uma barra fixa — tocar neles ` +
        `toca na barra:\n` +
        r.tapados.map(descreverTapado).join("\n"),
    );
  }

  if (r.overflow.culpados.length) {
    achados.push(
      `${r.overflow.culpados.length} elemento(s) para lá da margem direita a ` +
        `${ECRA_ESTREITO.width}px. Ficam CORTADOS (o body tem overflow-x: clip), portanto não ` +
        `há como chegar lá:\n` +
        r.overflow.culpados.map(descreverCulpado).join("\n"),
    );
  }

  expect(achados, `"${label}": ${achados.length} problema(s)\n\n${achados.join("\n\n")}`).toEqual(
    [],
  );
}

const VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Visão Geral$/, heading: /^Visão Geral$/ },
  { nav: /^Pedidos$/, heading: /^Pedidos$/ },
  { nav: /^Fazer proposta$/, heading: /^Fazer proposta$/ },
  { nav: /^Propostas$/, heading: /^Propostas$/ },
  { nav: /^Faturas$/, heading: /^Faturas$/ },
  { nav: /^Propostas Aceites$/, heading: /^Propostas Aceites$/ },
  { nav: /^Calendário$/, heading: /^Calendário$/ },
  { nav: /^Organização de propostas$/, heading: /^Organização de propostas$/ },
  { nav: /^Temas$/, heading: /^Temas$/ },
  { nav: /^Tarefas$/, heading: /^Tarefas$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
];

test.describe("Back office — mobile", () => {
  test("@movel phone: every view mounts, touch ergonomics hold, no runtime errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    const loggedIn = await login(page);
    // Fora do CI, uma máquina sem `ADMIN_PASSWORD_HASH` não consegue entrar e o
    // passeio salta-se — é o que permite corrê-lo à mão sem montar nada. No CI
    // o segredo ESTÁ definido (ver ci.yml), portanto não entrar é uma avaria,
    // não uma condição do ambiente. Saltar em silêncio ali seria transformar
    // esta rede num passo verde que nunca mede nada.
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    await expectErgonomiaTactil(page, "Visão Geral (inicial)");

    const errorBoundary = page.getByRole("heading", { name: /Ocorreu um erro inesperado/i });

    for (const view of VIEWS) {
      // Sidebar is off-canvas on mobile — open it via the top-bar menu button.
      await page.getByRole("button", { name: /Abrir menu/i }).click();
      const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
      await expect(sidebar).toBeVisible();
      // Reveal the "Mais" group if the destination isn't a core item.
      const item = sidebar.getByRole("button", { name: view.nav });
      if ((await item.count()) === 0) {
        await sidebar.getByRole("button", { name: /^Mais$/ }).click();
      }
      // Say which label is missing instead of waiting out the 30s click timeout:
      // when a destination leaves the sidebar, that diagnosis should be free.
      await expect(
        item,
        `Sidebar has no "${view.nav.source}" button — is it still in nav.tsx?`,
      ).toHaveCount(1);
      await item.first().click();
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      await expect(errorBoundary).toHaveCount(0);
      await expectErgonomiaTactil(page, view.nav.source);

      /**
       * O ESTÚDIO SÓ EXISTE DEPOIS DE SE ESCOLHER O CLIENTE.
       *
       * "Fazer proposta" abre num escolhedor ("Passo 1 de 2 — Para quem é a
       * proposta?"); o estúdio, que é onde vive quase todo o formulário, só é
       * desenhado a seguir. Medir só o escolhedor dava um passo VERDE sobre um
       * ecrã que não é o que se usa — e foi exactamente o que aconteceu: o
       * parágrafo esmagado do estúdio viveu aqui sem nunca ser apanhado, porque
       * o passeio parava um clique antes.
       *
       * Só entra se houver mesmo um pedido na lista; sem pedidos não há estúdio
       * para medir, e inventar um aqui era escrever dados no meio de um passeio
       * declaradamente de leitura.
       */
      if (view.nav.source === "^Fazer proposta$") {
        const estudio = page.getByText(/Estúdio de propostas/i).first();
        // O estúdio LEMBRA-SE do último cliente: à segunda visita abre já nele,
        // sem passar pelo escolhedor. Tentar escolher aqui um cliente que não
        // está no ecrã dava uma falha que não tem nada a ver com ergonomia — foi
        // o que aconteceu à primeira versão deste passo.
        if ((await estudio.count()) === 0) {
          // NÃO se salta em silêncio: um passo que se salta sozinho é como o
          // defeito do parágrafo esmagado sobreviveu tanto tempo.
          const cartoes = page.locator("main li button");
          await expect(
            cartoes.first(),
            "Sem cliente escolhido e sem ninguém na lista — o estúdio não chega a ser medido.",
          ).toBeVisible();
          await cartoes.first().click();
        }
        // `toHaveCount` e NÃO `toBeVisible`: quem julga o layout é a auditoria
        // a seguir, não este passo de navegação. Com `toBeVisible` o passeio
        // rebentava aqui quando o parágrafo estava esmagado a 0 px — ou seja,
        // falhava a dizer "não cheguei ao estúdio" quando na verdade tinha
        // chegado e encontrado o defeito. A presença prova a navegação; a
        // largura é problema da auditoria.
        await expect(estudio).toHaveCount(1);
        await expectErgonomiaTactil(page, "Fazer proposta → estúdio");
      }
    }

    expect(errors, `Unexpected runtime errors:\n${errors.join("\n")}`).toEqual([]);
  });

  /**
   * ZERO DEPENDÊNCIA DE TECLADO.
   *
   * Num telemóvel não há ⌘, não há Esc, não há setas. Tudo o que o back office
   * só sabe fazer por tecla é, ali, uma coisa que não se pode fazer — e tudo o
   * que ANUNCIA uma tecla é uma instrução impossível de seguir, a ocupar o
   * pouco espaço que há.
   *
   * Este passeio corre num ecrã de toque (`hasTouch`, portanto
   * `(pointer: coarse)` é verdade) e exige as duas metades: que não sobre
   * nenhuma etiqueta de tecla à vista, e que as acções que só tinham atalho
   * tenham um botão.
   *
   * O que fica de fora, de propósito, está escrito em NO-KEYBOARD.md.
   */
  test("@movel phone: nada precisa de teclado, e nada anuncia teclas", async ({ page }) => {
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    /** As etiquetas de tecla que estão mesmo a ser desenhadas. */
    const teclasAVista = async (onde: string) => {
      const kbds = page.locator("kbd:visible");
      const textos = await kbds.allInnerTexts();
      expect(
        textos,
        `${onde}: ${textos.length} etiqueta(s) de tecla à vista num ecrã sem teclado. ` +
          `Marque-as \`pointer-coarse:hidden\` — e, se a tecla era o único caminho, ` +
          `ponha lá um botão antes de a esconder.`,
      ).toEqual([]);
    };

    await teclasAVista("Visão Geral");

    // ── A pesquisa global ────────────────────────────────────────────────
    // O ⌘K continua a funcionar em quem tem teclado. Aqui interessa a outra
    // ponta: chegar lá com o dedo, e sair de lá com o dedo.
    const procurar = page.getByRole("button", { name: /^Pesquisar$/ });
    await expect(
      procurar,
      "Sem botão de pesquisa no telemóvel — a pesquisa global ficaria só no ⌘K, que ali não existe.",
    ).toHaveCount(1);
    await procurar.tap();

    const paleta = page.getByRole("dialog", { name: /Pesquisar e navegar/i });
    await expect(paleta).toBeVisible();
    await teclasAVista("paleta de comandos");

    // Fechar tem de ser um CONTROLO. Tocar no fundo escuro também fecha, mas
    // isso é uma coisa que se descobre por acaso, não um caminho.
    await paleta.getByRole("button", { name: /^Fechar$/ }).tap();
    await expect(paleta).toHaveCount(0);

    // ── A folha de atalhos não se oferece a quem não tem teclas ───────────
    await page.getByRole("button", { name: /Abrir menu/i }).tap();
    const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: /^Atalhos$/ }),
      "A lista de atalhos de teclado continua a ocupar a gaveta num ecrã de toque.",
    ).toHaveCount(0);

    // ── Desfazer, no estúdio ─────────────────────────────────────────────
    await sidebar
      .getByRole("button", { name: /^Fazer proposta$/ })
      .first()
      .tap();
    await expect(page.getByRole("heading", { level: 1, name: /^Fazer proposta$/ })).toBeVisible();
    const estudio = page.getByText(/Estúdio de propostas/i).first();
    if ((await estudio.count()) === 0) {
      const cartoes = page.locator("main li button");
      await expect(
        cartoes.first(),
        "Sem cliente escolhido e sem ninguém na lista — o estúdio não chega a ser medido.",
      ).toBeVisible();
      await cartoes.first().tap();
    }
    await expect(estudio).toHaveCount(1);
    await expect(
      page.getByRole("button", { name: /^Desfazer$/ }),
      "Desfazer só existia como Cmd+Z — num telemóvel, um engano passava a ser definitivo.",
    ).toHaveCount(1);
    await teclasAVista("estúdio de propostas");
  });
});
