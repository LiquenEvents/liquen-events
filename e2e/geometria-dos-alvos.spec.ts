import { test, expect, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * TRÊS ALVOS QUE NÃO SE CONSEGUIAM USAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Este ficheiro mede GEOMETRIA — onde as coisas nascem e que tamanho têm — e
 * não comportamento. Existe porque os três defeitos que cobre passavam por
 * cima de qualquer teste de unidade: em jsdom não há dobra, não há corte de
 * texto e não há 44 px. Só um navegador a desenhar a página os vê.
 *
 * ⚠ A ARMADILHA (a mesma que o `consentimento-geometria.spec.ts` já escreve):
 * verificar que a caixa de um botão existe NÃO PROVA NADA. Um botão desenhado
 * 229 px abaixo do ecrã tem caixa, tem texto e responde a `click()` do
 * Playwright — que rola a página até lá antes de clicar. A pergunta que
 * interessa é «quem está naquele ponto do ECRÃ?», porque é isso que o rato
 * acerta e é isso que ela vê.
 *
 * Os três:
 *
 *   D1 · a barra «Guardar alterações» do painel do pedido nascia FORA do ecrã
 *        num portátil de 900 px de altura — e rolar a gaveta até ao fim não a
 *        trazia, porque ela está colada ao fundo da GAVETA e não do ecrã.
 *   D2 · (era a tira de totais das Faturas, que não cabia num telemóvel. Saiu
 *        com a facturação — o ecrã que a mostrava já não existe.)
 *   D3 · alvos de 13 px: «Editar tarefa»/«Eliminar» no telemóvel (o mínimo da
 *        casa é 44) e o «+» de cada dia do calendário no computador (o mínimo
 *        da WCAG 2.2 AA é 24).
 */

/**
 * ⚠ O SELO DE DESENVOLVIMENTO DO NEXT, OUTRA VEZ.
 *
 * O `next.config.ts` desliga-o (`devIndicators: false`) precisamente porque ele
 * é um botão fixo no canto inferior esquerdo — em cima da barra de navegação de
 * baixo do back office. No Next 16 essa opção já NÃO o tira: medido nesta
 * versão, o `<nextjs-portal>` continua a desenhar um `#devtools-indicator` de
 * 100×36 px em (20, 788) num ecrã de 390×844, e o Playwright recusa-se a clicar
 * o primeiro destino com «`<nextjs-portal>` intercepts pointer events».
 *
 * Estes passeios correm contra `next dev` (é o único servidor que grava, ver
 * `playwright.dados.config.ts`), e em produção o selo nunca existiu. Portanto
 * tira-se do caminho aqui — o que se mede continua a ser a página tal como ela
 * é servida.
 */
async function semSeloDeDesenvolvimento(page: Page) {
  await page.addInitScript(() => {
    const esconder = () => {
      const estilo = document.createElement("style");
      estilo.textContent = "nextjs-portal{display:none !important}";
      document.head.appendChild(estilo);
    };
    if (document.head) esconder();
    else document.addEventListener("DOMContentLoaded", esconder);
  });
}

test.beforeEach(async ({ page }) => {
  await semSeloDeDesenvolvimento(page);
});

/** O mínimo da casa, no dedo: `.alvo-toque` em `globals.css`. */
const ALVO_TACTIL_MIN = 44;
/** O mínimo da WCAG 2.2 AA (2.5.8 Target Size, Minimum), para o rato. */
const ALVO_RATO_MIN = 24;

/**
 * Quem está no CENTRO do alvo, e se esse ponto lhe pertence.
 *
 * Devolve também o nome de quem lá está — sem isso um vermelho diz «false» e
 * manda quem lê abrir o navegador para saber porquê.
 */
async function quemEstaNoCentro(page: Page, seletor: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { existe: false as const };
    const r = el.getBoundingClientRect();
    const x = r.x + r.width / 2;
    const y = r.y + r.height / 2;
    const noPonto = document.elementFromPoint(x, y);
    return {
      existe: true as const,
      meu: !!noPonto && (el === noPonto || el.contains(noPonto)),
      quem: noPonto
        ? `<${noPonto.tagName.toLowerCase()}> «${(noPonto.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}»`
        : "NADA (fora do ecrã)",
      caixa: { top: Math.round(r.top), bottom: Math.round(r.bottom) },
      ponto: { x: Math.round(x), y: Math.round(y) },
      janela: { largura: window.innerWidth, altura: window.innerHeight },
      rolagemDaPagina: Math.round(window.scrollY),
    };
  }, seletor);
}

/** Vai a um destino pelo menu lateral (a coluna do computador). */
async function irPara(page: Page, rotulo: RegExp | string) {
  const nav = page.getByRole("navigation", { name: /Navegação do back office/i });
  const item = nav.getByRole("button", { name: rotulo });
  if ((await item.count()) === 0) {
    await nav.getByRole("button", { name: "Mais", exact: true }).click();
  }
  await item.first().click();
}

/**
 * Rola a caixa que rola DENTRO do painel do pedido, até `fracao` do seu curso,
 * e devolve onde ficou.
 *
 * Procura-se a caixa a subir a partir do título do painel até dar com um
 * antepassado que ROLE MESMO — e não por classes. As classes deste painel já
 * mudaram uma vez por causa deste defeito, e um seletor por classe também
 * apanha a gaveta da navegação, que tem as mesmas (`overscroll-contain`,
 * `flex-1`) e mede zero no computador: o teste passava a rolar nada e a provar
 * nada.
 */
async function rolarOPainel(page: Page, fracao: number) {
  return page.evaluate((f) => {
    let caixa: HTMLElement | null = document.getElementById("detail-drawer-title");
    while (
      caixa &&
      !(
        caixa.scrollHeight > caixa.clientHeight + 4 &&
        /(auto|scroll)/.test(getComputedStyle(caixa).overflowY)
      )
    ) {
      caixa = caixa.parentElement;
    }
    if (!caixa) return null;
    caixa.scrollTop = (caixa.scrollHeight - caixa.clientHeight) * f;
    return {
      scrollTop: Math.round(caixa.scrollTop),
      curso: caixa.scrollHeight - caixa.clientHeight,
    };
  }, fracao);
}

// ═══════════════════════════════════════════════════════════════════ D1 ═════
test.describe("D1 · a barra de gravação do pedido", () => {
  // A medida mais comum de portátil, e aquela em que isto foi medido.
  test.use({ viewport: { width: 1440, height: 900 } });

  test("«Guardar alterações» está no ecrã sem rolar a página", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);

    // Abrir o primeiro pedido da lista.
    await page.locator("table tbody tr").first().click();

    // A barra só existe quando há alguma coisa por guardar — é essa a regra do
    // painel. Escrever no Local é a alteração mais barata que a acorda.
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição");

    const guardar = page.getByRole("button", { name: /^Guardar alterações$/ });
    await expect(guardar).toBeVisible();

    // ── A prova ──────────────────────────────────────────────────────────
    // NÃO se rola nada antes de medir: a queixa é precisamente que o botão
    // nasce fora do ecrã, e quem abre um pedido não rolou nada ainda.
    const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
    expect(onde.existe, "o botão de guardar não foi encontrado ao lado do estado da gravação").toBe(
      true,
    );
    expect(
      onde.meu,
      `no centro do botão «Guardar alterações» (${onde.ponto?.x},${onde.ponto?.y}) está ${onde.quem} — ` +
        `a caixa dele vai de ${onde.caixa?.top} a ${onde.caixa?.bottom} numa janela de ${onde.janela?.altura} px, ` +
        `com a página em ${onde.rolagemDaPagina} px de rolagem`,
    ).toBe(true);
  });

  test("e a gaveta rolada até ao fim mostra-a na mesma", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);
    await page.locator("table tbody tr").first().click();
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição II");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    // Quem rola a gaveta até bater no fim conclui — com toda a razão — que não
    // há mais nada por baixo. A barra tem de estar lá nesse momento.
    const fim = await rolarOPainel(page, 1);
    expect(fim, "não se encontrou a caixa que rola dentro do painel").not.toBeNull();

    const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
    expect(
      onde.meu,
      `com a gaveta no fim, no centro do botão está ${onde.quem} (caixa ${onde.caixa?.top}→${onde.caixa?.bottom}, janela ${onde.janela?.altura})`,
    ).toBe(true);
  });
});

test.describe("D1 · e ninguém se põe por cima dela", () => {
  // 1280×800: o outro portátil comum, e a medida onde isto se apanhou.
  test.use({ viewport: { width: 1280, height: 800 } });

  /**
   * O painel tem MAIS do que uma barra colada ao fundo: o estúdio de propostas,
   * que vive dentro dele, traz a sua (z-20, `sticky bottom-0` a partir de `lg`).
   * Enquanto a barra de gravação também era `sticky bottom-0` DENTRO da caixa
   * que rola, as duas disputavam a mesma aresta e a do estúdio ganhava —
   * medido: a meio da rolagem, quem estava no centro do «Guardar alterações»
   * era `<div class="sticky bottom-[calc(56px+…)] z-20">`.
   *
   * Um botão tapado é tão inútil como um botão fora do ecrã, e este vermelho é
   * exactamente igual ao outro: `elementFromPoint` devolve outra coisa.
   */
  test("em nenhum ponto da rolagem outra barra lhe fica por cima", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await irPara(page, /^Pedidos/);
    await page.locator("table tbody tr").first().click();
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição III");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    // De dez em dez por cento: o defeito não estava nos extremos — em cima e
    // no fim o botão estava à vista, e era do terço do meio até aos 90 % que a
    // barra do estúdio o tapava.
    for (let passo = 0; passo <= 10; passo += 1) {
      const fracao = passo / 10;
      const posicao = await rolarOPainel(page, fracao);
      expect(posicao, "não se encontrou a caixa que rola dentro do painel").not.toBeNull();

      const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
      expect(
        onde.meu,
        `com o painel rolado a ${posicao?.scrollTop} px de ${posicao?.curso} (${fracao * 100}%), ` +
          `no centro do botão está ${onde.quem}`,
      ).toBe(true);
    }
  });
});

test.describe("D1 · e no telemóvel continua bem", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  test("a barra de gravação está dentro do ecrã", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedido(page);
    await page
      .getByRole("navigation", { name: /Destinos principais/i })
      .getByRole("button", { name: "Pedidos", exact: true })
      .click();
    await page.locator("li button, article button").first().click();
    const local = page.locator('input[placeholder="Local do evento…"]');
    await expect(local).toBeVisible();
    await local.fill("Herdade da Medição Móvel");
    await expect(page.getByRole("button", { name: /^Guardar alterações$/ })).toBeVisible();

    const onde = await quemEstaNoCentro(page, "#estado-da-gravacao-do-pedido ~ button");
    expect(onde.meu, `no telemóvel, no centro do botão está ${onde.quem}`).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════ D3 ═════
test.describe("D3 · alvos de 13 px", () => {
  test.describe("nas Tarefas, no telemóvel", () => {
    test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

    test("«Editar tarefa» e «Eliminar» têm os 44 px da casa", async ({ page }) => {
      exigirLogin(await entrarNoBackOffice(page));
      // Uma tarefa por fazer — as duas acções só existem em cima de uma linha.
      const res = await page.request.post("/api/tarefas", {
        data: { title: "Tarefa da medição de geometria", priority: "normal" },
      });
      expect(res.ok(), `não foi possível semear a tarefa (${res.status()})`).toBe(true);
      await page.reload();

      await page.getByRole("button", { name: /Mais destinos/i }).click();
      await irPara(page, "Tarefas");

      /* ── AS DUAS ACÇÕES MUDARAM DE SÍTIO, E A PROVA MUDA COM ELAS ──────────
         Este passeio procurava os dois ícones soltos na linha. Deixaram de lá
         estar NO DEDO: a fila de ícones é `hidden com-rato:contents` e, sem
         rato, as duas acções vivem dentro do menu «⋯» (`MenuDeAccoes`).

         A razão está escrita no `Tarefas.tsx`: com seis acções por linha todas
         visíveis ao mesmo tempo, a 390 px não cabia nada — e «Eliminar»
         encostado a «Editar» é um engano à espera de acontecer.

         O que este teste prova NÃO muda: as duas acções têm de ser alcançáveis
         com o dedo e ter os 44 px da casa. Muda o caminho — abre-se o menu, e
         medem-se lá dentro. Se um dia voltarem para a linha, este teste falha e
         obriga a olhar, que é o que se quer dele. */
      await page
        .getByRole("button", { name: /^Acções de / })
        .first()
        .click();
      await expect(page.getByRole("menuitem", { name: "Editar tarefa" })).toBeVisible();

      const alvos = await page.evaluate(() =>
        [
          // Dentro do menu o nome do item é o TEXTO (é assim que um leitor de
          // ecrã o anuncia); na linha, quando há rato, é o `aria-label` do
          // ícone. Aceitam-se os dois, e o rótulo lido é o que existir.
          ...document.querySelectorAll(
            '[role="menuitem"], button[aria-label="Editar tarefa"], button[aria-label="Eliminar"]',
          ),
        ]
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              rotulo: (b.getAttribute("aria-label") ?? b.textContent ?? "").trim(),
              largura: Math.round(r.width),
              altura: Math.round(r.height),
            };
          })
          .filter((a) => a.rotulo === "Editar tarefa" || a.rotulo === "Eliminar"),
      );

      expect(alvos.length, "não há linhas de tarefa para medir").toBeGreaterThan(0);
      // O dedo é grosso: sem isto, `(pointer: coarse)` não é verdade e a
      // medição é a do rato — que não é o que se está a provar.
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      for (const a of alvos) {
        expect(
          Math.min(a.largura, a.altura),
          `«${a.rotulo}» mede ${a.largura}×${a.altura} px (mínimo da casa: ${ALVO_TACTIL_MIN})`,
        ).toBeGreaterThanOrEqual(ALVO_TACTIL_MIN);
      }
    });
  });

  test.describe("no calendário, com rato", () => {
    test.use({ viewport: { width: 1440, height: 900 } });

    test("o «+» de cada dia tem os 24 px da WCAG 2.2 AA", async ({ page }) => {
      exigirLogin(await entrarNoBackOffice(page));
      await irPara(page, /^Calendário/);
      await expect(
        page.getByRole("button", { name: /^Adicionar a \d+ de / }).first(),
      ).toBeAttached();

      const alvos = await page.evaluate(() =>
        [...document.querySelectorAll("button")]
          .filter((b) => /^Adicionar a \d+ de /.test(b.getAttribute("aria-label") ?? ""))
          .map((b) => {
            const r = b.getBoundingClientRect();
            return {
              rotulo: b.getAttribute("aria-label") ?? "",
              largura: Math.round(r.width * 10) / 10,
              altura: Math.round(r.height * 10) / 10,
            };
          }),
      );

      expect(alvos.length, "não há dias no calendário para medir").toBeGreaterThan(20);
      const pequenos = alvos.filter((a) => a.largura < ALVO_RATO_MIN || a.altura < ALVO_RATO_MIN);
      expect(
        pequenos.length,
        `${pequenos.length} de ${alvos.length} dias com o «+» abaixo de ${ALVO_RATO_MIN} px — ` +
          `o primeiro é «${pequenos[0]?.rotulo}» a ${pequenos[0]?.largura}×${pequenos[0]?.altura}`,
      ).toBe(0);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════ D4 ═════
/**
 * A BARRA DE BAIXO EMPURRADA PARA FORA DO ECRÃ PELA BARRA DE FERRAMENTAS.
 *
 * Uma fila de controlos em `flex` sem `flex-wrap` não encolhe: pede a largura
 * que os filhos somam e alarga o DOCUMENTO inteiro atrás de si. Na Biblioteca
 * de Temas a fila do topo (Ordenar · Rever etiquetas · Compacto/Confortável ·
 * Novo tema) acabava em x=607 num ecrã de 390, o documento passava a medir 607,
 * e a navegação de baixo — que é `w-full` — nascia com 607 px de largura e o
 * topo em y=1257, 413 px abaixo do fundo do ecrã. Nessa vista ficava-se sem
 * navegação nenhuma.
 *
 * Mede-se o SINTOMA (a barra fora do ecrã, o documento mais largo do que o
 * ecrã) e diz-se qual é a fila culpada, porque é a fila que se corrige — não a
 * barra, que é vítima.
 */
test.describe("D4 · a barra de baixo na Biblioteca de Temas", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /**
   * TRÊS TEMAS, SENÃO NÃO HÁ BARRA DE FERRAMENTAS PARA MEDIR.
   *
   * Metade dos controlos desta fila só nasce com mais de dois temas (o
   * «Ordenar» e o Compacto/Confortável) — com a biblioteca vazia a fila cabe, e
   * o teste ficava verde sobre um ecrã que em uso real está partido. Os
   * `data/*.json` não são versionados, portanto numa clonagem limpa a
   * biblioteca ESTÁ vazia: quem precisa dos temas cria-os. Um 409 é o nome já
   * lá estar, que é o estado que se queria.
   */
  async function garantirTresTemas(page: Page) {
    for (const name of ["Geometria · Terracota", "Geometria · Oliveira", "Geometria · Linho"]) {
      const r = await page.request.post("/api/temas", { data: { name } });
      expect(
        [200, 409],
        `não foi possível semear o tema «${name}» (${r.status()}: ${await r.text()})`,
      ).toContain(r.status());
    }
  }

  test("a navegação de baixo continua no ecrã, e o documento não alarga", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirTresTemas(page);
    await page.getByRole("button", { name: /Mais destinos/i }).click();
    await irPara(page, /^Temas/);
    await expect(page.getByRole("button", { name: /^Novo tema$/ })).toBeVisible();
    // ⚠ A lista de temas chega por `fetch`, DEPOIS do primeiro desenho, e é ela
    // que traz metade da fila. Medir mal o «Novo tema» aparece era medir uma
    // barra de ferramentas a meio — foi o que fez esta rede passar sobre o
    // defeito à primeira tentativa.
    await expect(page.getByRole("group", { name: /Tamanho dos cartões/i })).toBeVisible();

    const m = await page.evaluate(() => {
      const de = document.documentElement;
      const barra = document.querySelector('nav[aria-label="Destinos principais"]');
      const r = barra?.getBoundingClientRect() ?? null;
      // Qual é a fila culpada? A que NÃO QUEBRA e cujo lado direito já passou a
      // margem do ecrã. As mais fundas primeiro: a casca da página também passa
      // a margem, mas é vítima da fila que tem lá dentro — e é a fila que se
      // corrige. Sem este diagnóstico, um vermelho aqui só diz «607 ≠ 390».
      const fundura = (el: Element) => {
        let n = 0;
        for (let p = el.parentElement; p; p = p.parentElement) n += 1;
        return n;
      };
      const culpados = [...document.querySelectorAll("div,ul,nav,header,section,form")]
        .filter((el) => {
          const cs = getComputedStyle(el);
          if (!cs.display.includes("flex") || cs.flexWrap !== "nowrap") return false;
          if (cs.overflowX === "auto" || cs.overflowX === "scroll") return false;
          return el.getBoundingClientRect().right > de.clientWidth + 1;
        })
        .sort((a, b) => fundura(b) - fundura(a))
        .map(
          (el) =>
            `«${(el.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 40)}» acaba em ` +
            `x=${Math.round(el.getBoundingClientRect().right)} — ${String(el.className).slice(0, 70)}`,
        );
      return {
        documento: de.scrollWidth,
        ecra: de.clientWidth,
        altura: window.innerHeight,
        barra: r
          ? { largura: Math.round(r.width), topo: Math.round(r.top), existe: true as const }
          : { existe: false as const },
        culpados: culpados.slice(0, 5),
      };
    });

    const porque = m.culpados.length
      ? `\nFilas sem \`flex-wrap\` a pedir mais do que têm:\n  ${m.culpados.join("\n  ")}`
      : "";

    expect(
      m.documento,
      `o documento mede ${m.documento} px num ecrã de ${m.ecra} — ` +
        `${m.documento - m.ecra} px de transbordo horizontal.${porque}`,
    ).toBeLessThanOrEqual(m.ecra);

    expect(m.barra.existe, "não há barra de navegação de baixo nesta vista").toBe(true);
    if (m.barra.existe) {
      expect(
        m.barra.topo,
        `a barra de baixo nasce a ${m.barra.topo} px do topo, num ecrã de ${m.altura} px — ` +
          `está desenhada FORA do ecrã.${porque}`,
      ).toBeLessThan(m.altura);
      expect(
        m.barra.largura,
        `a barra de baixo mede ${m.barra.largura} px num ecrã de ${m.ecra}.${porque}`,
      ).toBeLessThanOrEqual(m.ecra);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════ D5 ═════
/**
 * DUAS COLUNAS QUE NÃO EXISTEM PARA QUEM USA PORTÁTIL.
 *
 * A tabela de Pedidos mostra as colunas de contexto a partir dos 1440 px —
 * mas 1440 é a largura do ECRÃ, e a coluna da navegação come 336. Num portátil
 * de 1440×900 a tabela pedia 1537 px numa caixa de 1104 e o contentor tinha
 * `overflow: hidden`: «Pax» e «À espera» ficavam desenhadas do lado de lá do
 * corte, sem barra de rolagem, sem gesto, sem nada. Não é um defeito de
 * telemóvel — é o mais silencioso dos três, porque no ecrã não há sinal nenhum
 * de que falta ali qualquer coisa.
 *
 * O que se exige NÃO é que caiba: é que exista caminho. Ou a tabela cabe, ou o
 * contentor rola — e se rola, tem de rolar também para quem não tem rato
 * (`tabindex`), senão o caminho existe só para metade das pessoas.
 */
test.describe("D5 · as colunas escondidas da tabela de Pedidos", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  /**
   * Um pedido COMPRIDO, senão não há o que medir.
   *
   * A largura de uma tabela é a do seu conteúdo: com três pedidos de nome curto
   * ela cabe, e o teste ficava verde sobre um ecrã que em produção — com nomes
   * de casal, emails a sério e quintas com morada por extenso — está partido. O
   * `submissionId` é fixo porque a rota é idempotente por ele: correr isto mil
   * vezes deixa UM pedido na lista.
   */
  async function garantirPedidoComprido(page: Page) {
    const res = await page.request.post("/api/orcamento", {
      data: {
        form: {
          name: "Maria da Conceição Gonçalves de Almeida e Sousa Vasconcelos",
          email: "maria.conceicao.vasconcelos.almeida@exemplo-muito-comprido.pt",
          phone: "912345678",
          category: "particulares",
          eventType: "casamentos",
          eventName: "Casamento",
          date: "2028-09-15",
          guests: 200,
          location: "Quinta do Vale das Amoreiras Velhas, Estrada Nacional 118, km 42, Loures",
        },
        website: "",
        submissionId: "e2e-geometria-tabela-larga",
      },
    });
    // Um 429 (tecto de pedidos por minuto) não é falha do que se está a medir
    // desde que o pedido já lá esteja de uma corrida anterior — e se não
    // estiver, a asserção da tabela a seguir diz-lo com números.
    if (res.ok()) await page.reload();
  }

  test("nenhuma coluna fica do lado de lá do corte", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirPedidoComprido(page);
    await irPara(page, /^Pedidos/);

    const tabela = page.getByRole("table", { name: /pedidos/i });
    await expect(tabela).toBeVisible();

    const m = await page.evaluate(() => {
      const t = document.querySelector("main table");
      if (!t) return null;
      let caixa: HTMLElement | null = t.parentElement;
      while (caixa && !/(auto|scroll)/.test(getComputedStyle(caixa).overflowX)) {
        // Uma caixa que CORTA (`hidden`/`clip`) não é caminho nenhum — mas é
        // ela que define o que se vê, por isso guarda-se a primeira que corte.
        if (/(hidden|clip)/.test(getComputedStyle(caixa).overflowX)) break;
        caixa = caixa.parentElement;
      }
      const cs = caixa ? getComputedStyle(caixa) : null;
      const colunas = [...t.querySelectorAll("th")].map((th) => ({
        rotulo: (th.textContent ?? "").replace(/[↕▲▼]/g, "").trim(),
        direita: Math.round(th.getBoundingClientRect().right),
      }));
      const antes = caixa?.scrollLeft ?? 0;
      if (caixa) caixa.scrollLeft = caixa.scrollWidth;
      const rolou = (caixa?.scrollLeft ?? 0) > antes;
      const ultimaDepois = colunas.length
        ? Math.round([...t.querySelectorAll("th")].at(-1)!.getBoundingClientRect().right)
        : 0;
      const caixaDireita = caixa ? Math.round(caixa.getBoundingClientRect().right) : 0;
      if (caixa) caixa.scrollLeft = antes;
      return {
        precisa: t.scrollWidth,
        cabe: caixa?.clientWidth ?? 0,
        overflowX: cs?.overflowX ?? "—",
        tabIndex: caixa?.tabIndex ?? -1,
        papel: caixa?.getAttribute("role") ?? "",
        colunas,
        rolou,
        ultimaDepois,
        caixaDireita,
      };
    });

    expect(m, "não há tabela de pedidos nesta largura").not.toBeNull();
    if (!m) return;

    const nomes = m.colunas.map((c) => c.rotulo);
    expect(nomes, `as colunas desenhadas são ${JSON.stringify(nomes)}`).toContain("Pax");
    expect(nomes).toContain("À espera");

    // SEMPRE, e não só quando o conteúdo desta corrida transborda: uma tabela
    // dentro de uma caixa que CORTA está a um nome comprido de perder colunas,
    // e o que a semente consegue pôr na lista depende do tecto de pedidos por
    // minuto. Um teste que só verificasse o caso do dia ficava verde no dia
    // seguinte com o defeito de volta.
    expect(
      m.overflowX,
      `a tabela pede ${m.precisa} px numa caixa de ${m.cabe} e o contentor está ` +
        `\`overflow-x: ${m.overflowX}\` — o que passar do corte não tem como ser alcançado`,
    ).toMatch(/auto|scroll/);

    if (m.precisa > m.cabe + 1) {
      expect(
        m.tabIndex,
        "o contentor rola mas não recebe foco — quem navega por teclado não consegue lá chegar " +
          "(WCAG 2.1.1: uma zona que rola tem de ser operável sem rato)",
      ).toBeGreaterThanOrEqual(0);
      expect(m.rolou, "o contentor diz que rola mas não rolou").toBe(true);
      expect(
        m.ultimaDepois,
        `depois de rolar até ao fim, a última coluna acaba em x=${m.ultimaDepois} e a caixa ` +
          `acaba em ${m.caixaDireita} — continua cortada`,
      ).toBeLessThanOrEqual(m.caixaDireita + 1);
    }
  });
});
