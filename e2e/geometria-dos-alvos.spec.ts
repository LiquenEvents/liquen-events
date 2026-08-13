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
 *   D2 · a tira de totais das Faturas não cabia num telemóvel: um valor acima
 *        de 100 000 € pedia 118 px numa caixa de 77, o «€» ficava cortado, e a
 *        tira empurrava a página 7 px para o lado.
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

// ═══════════════════════════════════════════════════════════════════ D2 ═════
test.describe("D2 · a tira de totais das Faturas", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  /**
   * Sem uma fatura grande não há defeito para ver: com 15 375 € o corte era de
   * 29 px, com 272 375 € é de 41. O livro é idempotente por soma — só se emite
   * o que falta para lá chegar, para correr isto mil vezes não encher o livro.
   */
  async function garantirLivroGrande(page: Page) {
    const lidas = await page.request.get("/api/faturas");
    expect(lidas.ok(), "não foi possível ler o livro de faturas").toBe(true);
    const livro = (await lidas.json()) as { amount: number; status: string }[];
    const emitido = livro
      .filter((i) => i.status !== "anulada")
      .reduce((soma, i) => soma + i.amount, 0);
    const emFalta = 272_375 - emitido;
    if (emFalta < 1) return;
    const res = await page.request.post("/api/faturas", {
      data: {
        clientName: "Gala Anual — semente de geometria",
        clientEmail: "gala.geometria@example.pt",
        kind: "total",
        amount: emFalta,
        vatRate: 0.23,
        issuedAt: "2026-08-13",
      },
    });
    expect(res.ok(), `não foi possível semear a fatura grande (${res.status()})`).toBe(true);
  }

  test("cabe no telemóvel, com o «€» inteiro e sem empurrar a página", async ({ page }) => {
    exigirLogin(await entrarNoBackOffice(page));
    await garantirLivroGrande(page);
    await page.reload();

    // «Faturas» vive na gaveta, não na barra de baixo.
    await page.getByRole("button", { name: /Mais destinos/i }).click();
    await irPara(page, "Faturas");
    await expect(page.getByText("Emitido", { exact: true })).toBeVisible();

    const medida = await page.evaluate(() => {
      const rotulos = [...document.querySelectorAll("p")].filter((p) =>
        /^(Emitido|Pago|Em dívida)$/.test((p.textContent ?? "").trim()),
      );
      return {
        cartoes: rotulos.map((r) => {
          const valor = r.parentElement?.querySelector("p");
          return {
            rotulo: (r.textContent ?? "").trim(),
            texto: (valor?.textContent ?? "").trim(),
            precisa: valor?.scrollWidth ?? 0,
            temDisponivel: valor?.clientWidth ?? 0,
          };
        }),
        larguraDoDocumento: document.documentElement.scrollWidth,
        larguraDoEcra: document.documentElement.clientWidth,
      };
    });

    for (const c of medida.cartoes) {
      expect(
        c.precisa,
        `o valor de «${c.rotulo}» («${c.texto}») pede ${c.precisa} px numa caixa de ${c.temDisponivel} px — ` +
          `são ${c.precisa - c.temDisponivel} px cortados`,
      ).toBeLessThanOrEqual(c.temDisponivel);
    }

    expect(
      medida.larguraDoDocumento,
      `a página mede ${medida.larguraDoDocumento} px num ecrã de ${medida.larguraDoEcra} px — ` +
        `${medida.larguraDoDocumento - medida.larguraDoEcra} px de transbordo horizontal`,
    ).toBeLessThanOrEqual(medida.larguraDoEcra);
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
      await expect(page.getByRole("button", { name: "Editar tarefa" }).first()).toBeVisible();

      const alvos = await page.evaluate(() =>
        [
          ...document.querySelectorAll(
            'button[aria-label="Editar tarefa"], button[aria-label="Eliminar"]',
          ),
        ].map((b) => {
          const r = b.getBoundingClientRect();
          return {
            rotulo: b.getAttribute("aria-label") ?? "",
            largura: Math.round(r.width),
            altura: Math.round(r.height),
          };
        }),
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
