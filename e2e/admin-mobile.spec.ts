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
  abrirGaveta,
  NA_BARRA_DE_BAIXO,
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
 * UM PEDIDO PARA HAVER O QUE MEDIR.
 *
 * Estes testes percorrem o back office num telemóvel e precisam de pelo menos
 * um pedido na lista — sem nenhum, o estúdio nunca chega a abrir e o que se
 * queria medir não é medido.
 *
 * Durante muito tempo isso veio de graça: os `data/*.json` do repositório
 * traziam pedidos de exemplo. Deixaram de trazer, e por uma boa razão — em
 * produção esse conteúdo reaparecia a CADA DEPLOY por cima do que tinha sido
 * escrito, e um `git checkout` apagava os rascunhos de quem trabalha sem base
 * de dados (ver `ONDE-FICA-GUARDADO.md`).
 *
 * Portanto o teste passa a criar o que precisa. É melhor assim mesmo sem essa
 * razão: um teste que depende do que outra pessoa deixou no repositório passa
 * ou falha por motivos que não são o que ele diz medir.
 */
async function garantirUmPedido(page: Page): Promise<void> {
  // ANTES de entrar, e sem perguntar se já há algum: a lista do back office é
  // desenhada NO SERVIDOR quando a página abre, portanto um pedido criado
  // depois disso não aparece; e a consulta que diria «já há» exige sessão, que
  // ainda não existe. Criar um a mais não custa nada — o armazenamento do CI
  // morre com o processo.
  await page.request.post("/api/orcamento", {
    data: {
      form: {
        name: "Rita e Tomás",
        email: "rita.tomas@example.pt",
        phone: "912345678",
        category: "particulares",
        eventType: "casamentos",
        eventName: "Casamento",
        date: "2028-05-20",
        guests: 80,
        location: "Herdade da Maridona, Glória",
      },
      website: "",
      submissionId: `e2e-movel-${Date.now().toString(36)}`,
    },
  });
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

/**
 * Os quatro destinos que vivem na barra de baixo — vindos do módulo partilhado,
 * que é o mesmo que os varrimentos usam para navegar. Uma segunda lista aqui
 * podia divergir da primeira em silêncio, e o passeio passaria a procurar na
 * barra um destino que está na gaveta (ou o contrário) sem dizer porquê.
 */
const NA_BARRA = new Set(NA_BARRA_DE_BAIXO);

// A "Organização de propostas", a "Biblioteca de serviços" e o
// "Acompanhamento" saíram desta lista porque saíram do MENU, a pedido dela
// (ver a nota em `nav.tsx`). Os ecrãs continuam a existir e a abrir por link
// directo; o que este passeio verifica é a NAVEGAÇÃO, e um destino que já não
// está na gaveta não pode ser visitado por ela.
const VIEWS: { nav: RegExp; heading: RegExp }[] = [
  { nav: /^Visão Geral$/, heading: /^Visão Geral$/ },
  { nav: /^Pedidos$/, heading: /^Pedidos$/ },
  { nav: /^Fazer proposta$/, heading: /^Fazer proposta$/ },
  { nav: /^Propostas$/, heading: /^Propostas$/ },
  { nav: /^Faturas$/, heading: /^Faturas$/ },
  { nav: /^Propostas Aceites$/, heading: /^Propostas Aceites$/ },
  { nav: /^Calendário$/, heading: /^Calendário$/ },
  { nav: /^Temas$/, heading: /^Temas$/ },
  { nav: /^Tarefas$/, heading: /^Tarefas$/ },
  { nav: /^Estatísticas$/, heading: /^Estatísticas$/ },
];

test.describe("Back office — mobile", () => {
  test("@movel phone: every view mounts, touch ergonomics hold, no runtime errors", async ({
    page,
  }) => {
    const errors = collectErrors(page);
    await garantirUmPedido(page);
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
      // COMO SE NAVEGA MESMO, num telemóvel: os quatro do dia estão na barra de
      // baixo, e nunca na gaveta; tudo o resto está na gaveta, e nunca na
      // barra. Se este passeio fosse sempre pela gaveta, deixava de tocar na
      // barra de baixo — que é a navegação que ela usa mais — e não notava se
      // um destino estivesse escrito nos dois sítios.
      const naBarra = NA_BARRA.has(view.nav.source.replace(/[$^]/g, ""));
      if (naBarra) {
        const barra = page.getByRole("navigation", { name: /Destinos principais/i });
        const item = barra.getByRole("button", { name: view.nav });
        await expect(
          item,
          `A barra de baixo não tem "${view.nav.source}" — continua no BARRA_INFERIOR de nav.tsx?`,
        ).toHaveCount(1);
        await item.click();
      } else {
        // A gaveta abre no hambúrguer do cabeçalho — o único abridor.
        await abrirGaveta(page);
        const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
        await expect(sidebar).toBeVisible();
        const item = sidebar.getByRole("button", { name: view.nav });
        // Diz qual é a etiqueta que falta em vez de esperar 30s pelo clique:
        // quando um destino sai da navegação, esse diagnóstico deve ser grátis.
        await expect(
          item,
          `A gaveta não tem "${view.nav.source}" — continua em nav.tsx?`,
        ).toHaveCount(1);
        await item.first().click();
      }
      await expect(page.getByRole("heading", { level: 1, name: view.heading })).toBeVisible();
      await expect(errorBoundary).toHaveCount(0);
      await expectErgonomiaTactil(page, view.nav.source);

      // O TÍTULO NÃO PODE FICAR CORTADO A MEIO DE UMA PALAVRA.
      // O `truncate` do cabeçalho impede-o de partir em duas linhas, mas em
      // troca corta o que não couber — e "Organização de propostas" saía
      // "Organiza…". A correcção é dar-lhe um nome curto para o telemóvel
      // (VIEW_TITLES_CURTOS em AdminClient.tsx), e é esta falha que o manda
      // fazer, com o nome e os dois números.
      const titulo = await page.evaluate(() => {
        const t = document.querySelector("header h1");
        if (!t) throw new Error("Sem <h1> no cabeçalho — a vista montou?");
        return {
          texto: (t.textContent ?? "").trim(),
          cabe: Math.round(t.clientWidth),
          precisa: Math.round(t.scrollWidth),
        };
      });
      expect(
        titulo.precisa,
        `O título "${titulo.texto}" fica cortado no telemóvel: precisa de ${titulo.precisa}px e ` +
          `tem ${titulo.cabe}. Dê-lhe um nome curto em VIEW_TITLES_CURTOS.`,
      ).toBeLessThanOrEqual(titulo.cabe + 1);

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
    await garantirUmPedido(page);
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
    await abrirGaveta(page);
    const sidebar = page.getByRole("navigation", { name: /Navegação do back office/i });
    await expect(sidebar).toBeVisible();
    await expect(
      sidebar.getByRole("button", { name: /^Atalhos$/ }),
      "A lista de atalhos de teclado continua a ocupar a gaveta num ecrã de toque.",
    ).toHaveCount(0);

    // ── Desfazer, no estúdio ─────────────────────────────────────────────
    // Pela barra de baixo: "Fazer proposta" é um dos quatro do dia e, desde a
    // arrumação das duas navegações, já não está na gaveta.
    await page.getByRole("button", { name: /Fechar menu/i }).tap();
    await page
      .getByRole("navigation", { name: /Destinos principais/i })
      .getByRole("button", { name: /Fazer proposta/i })
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

  /**
   * O CABEÇALHO NÃO PODE VOLTAR A COMER O ECRÃ.
   *
   * Media 102 px num telemóvel de 667. Com os 56 px da barra de baixo eram
   * 158 px de moldura — quase um quarto do ecrã — ocupados para sempre por uma
   * coisa que só se lê uma vez: o nome da vista. E o título partia em duas
   * linhas ("Visão / Geral"), o dobro da altura para a mesma palavra.
   *
   * O limite de 72 px não é redondo por acaso: é a altura de um cabeçalho de
   * uma linha com um alvo de 44 px lá dentro e a folga que ele precisa. Acima
   * disso, alguma coisa voltou a ser empilhada.
   */
  test("@movel phone: o cabeçalho cabe numa faixa, e encolhe ao descer", async ({ page }) => {
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    const medir = () =>
      page.evaluate(() => {
        const h = document.querySelector("header");
        const t = document.querySelector("header h1");
        // Sem cabeçalho ou sem título não há nada a medir — e devolver zeros
        // dava um teste verde sobre um ecrã que não montou.
        if (!h || !t) throw new Error("Sem <header> ou sem <h1> no cabeçalho — a vista montou?");
        const r = t.getBoundingClientRect();
        const cs = getComputedStyle(t);
        return {
          altura: Math.round(h.getBoundingClientRect().height),
          linhas: r.height / parseFloat(cs.fontSize),
          titulo: (t.textContent ?? "").trim(),
        };
      });

    const topo = await medir();
    expect(
      topo.altura,
      `O cabeçalho mede ${topo.altura}px num ecrã de 667. Voltou a haver linhas empilhadas — ` +
        `o subtítulo? o título em duas linhas?`,
    ).toBeLessThanOrEqual(72);
    // 1.5 e não 1: uma linha de Playfair mede um pouco mais do que o
    // `font-size`, e comparar com 1 exacto seria um teste a tremer.
    expect(
      topo.linhas,
      `O título "${topo.titulo}" está em mais do que uma linha — falta o \`truncate\`, ` +
        `ou há CSS à mão a ganhar-lhe (foi o que o \`text-wrap: balance\` fez).`,
    ).toBeLessThan(1.5);

    // E encolhe mesmo ao descer — senão o "encolhe ao scroll" é só uma boa
    // intenção escrita no código.
    await page.evaluate(() => window.scrollTo(0, 400));
    await page.waitForTimeout(400);
    const descido = await medir();
    expect(
      descido.altura,
      "O cabeçalho não encolheu ao descer 400px — o `useDesceu` está ligado?",
    ).toBeLessThan(topo.altura);
  });

  /**
   * UMA NAVEGAÇÃO, NÃO DUAS.
   *
   * A barra de baixo leva os quatro destinos do dia; a gaveta leva o resto.
   * Nenhum destino nos dois sítios, e um só botão a abrir a gaveta.
   *
   * O que isto apanha é a regressão fácil: alguém acrescenta um destino à barra
   * de baixo (ou volta a pôr um "Mais" lá) e o telemóvel fica outra vez com
   * duas navegações a dizer o mesmo — que é o estado de que esta correcção
   * partiu, e que ninguém repara a olhar para uma vista de cada vez.
   */
  test("@movel phone: a barra de baixo e a gaveta não repetem destinos", async ({ page }) => {
    await garantirUmPedido(page);
    const loggedIn = await login(page);
    if (process.env.CI) {
      expect(loggedIn, "não entrou no back office — ADMIN_PASSWORD_HASH em falta no CI?").toBe(
        true,
      );
    } else {
      test.skip(!loggedIn, "Sem login de admin aqui (build de produção sem ADMIN_PASSWORD_HASH).");
    }

    const barra = page.getByRole("navigation", { name: /Destinos principais/i });
    const naBarra = (await barra.getByRole("button").allInnerTexts()).map((t) => t.trim());
    // Os quatro do dia, e a seguir o abridor da gaveta — que não é um destino,
    // é a porta para os que não cabem ali.
    expect(
      naBarra,
      "A barra de baixo deixou de ser os quatro destinos do dia mais o abridor. " +
        "Ver BARRA_INFERIOR em nav.tsx — e, se mudou de propósito, mudar também o NA_BARRA deste ficheiro.",
    ).toEqual([...NA_BARRA, "Mais"]);

    await abrirGaveta(page);
    const gaveta = page.getByRole("navigation", { name: /Navegação do back office/i });
    await expect(gaveta).toBeVisible();
    const naGaveta = (await gaveta.getByRole("button").allInnerTexts()).map((t) => t.trim());

    const repetidos = naGaveta.filter((t) => NA_BARRA.has(t));
    expect(
      repetidos,
      `${repetidos.length} destino(s) escritos nos DOIS sítios — a barra de baixo e a gaveta. ` +
        `Num ecrã de 375 px passam a ser duas navegações a competir, e nenhuma é "a" navegação.`,
    ).toEqual([]);

    // E a gaveta tem mesmo de levar o resto: se ficasse vazia, o teste acima
    // passava por não haver lá nada, que é o pior verde possível.
    expect(
      naGaveta,
      "A gaveta ficou sem destinos nenhuns — o resto da navegação desapareceu.",
    ).toContain("Calendário");
    expect(naGaveta).toContain("Temas");

    // UM ABRIDOR DE CADA VEZ, e nunca dois no mesmo ecrã. Havia o "Mais" da
    // barra de baixo E o hambúrguer do cabeçalho a abrir a mesma gaveta, em
    // cantos opostos. Agora o hambúrguer só entra quando a barra de baixo sai
    // (com uma proposta aberta em detalhe) — portanto o que se conta é quantos
    // estão VISÍVEIS, não quantos existem no código.
    await page.getByRole("button", { name: /Fechar menu/i }).click();
    // `getClientRects()` e não `toBeVisible`: a gaveta fechada continua no DOM
    // (está `translate-x-full` para fora do ecrã), e o que interessa aqui é
    // quantos abridores estão MESMO desenhados.
    const abridoresAVista = await page
      .getByRole("button", { name: /Mais destinos|Abrir menu/i })
      .evaluateAll((els) => els.filter((e) => e.getClientRects().length > 0).length);
    expect(
      abridoresAVista,
      "Há mais do que um botão a abrir a gaveta no mesmo ecrã — voltámos a ter duas portas para " +
        "o mesmo sítio, em cantos opostos.",
    ).toBe(1);
  });
});
