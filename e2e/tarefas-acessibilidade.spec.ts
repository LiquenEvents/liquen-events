import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { entrarNoBackOffice, exigirLogin } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS TAREFAS, NO BROWSER, PELA PARTE 6 DO `docs/APPLE-TAREFAS.md`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A fase 11 era «a lista da Parte 6 não foi percorrida de fio a pavio». Este
 * ficheiro é o percurso, deixado a correr: cada caso mede uma coisa que o
 * `Tarefas.acessibilidade.test.tsx` (jsdom) não consegue medir — geometria,
 * anúncio em região viva, zoom, foco real.
 *
 * Corre contra `next dev` (ver `playwright.dados.config.ts`) porque semeia
 * tarefas: o servidor de produção recusa escritas sem Supabase.
 *
 * ── O QUE FICOU MEDIDO, ANTES DE SE MEXER ────────────────────────────────
 *
 *   · estrutura ......... `<div>`, sem papel (não era uma lista)
 *   · caixa, com rato ... 36×36   (a Parte 6 pede 40)
 *   · título, com rato .. 278×20  (idem)
 *   · ⌘N ................ abria o campo e deixava o foco em `BODY`
 *   · Esc ............... fechava o campo e deixava o foco em `BODY`
 *
 * E o que estava certo, e aqui fica guardado para não se perder: o anúncio ao
 * marcar, o zoom a 200% e a 400% sem rolagem horizontal, o contraste do texto
 * da linha (o pior, 4,53:1), e zero violações do axe no ecrã.
 */

const hoje = (d = 0) => {
  const x = new Date();
  x.setDate(x.getDate() + d);
  return x.toISOString().slice(0, 10);
};

/** Um sufixo por passagem: a lista é partilhada e outros passeios semeiam nela. */
const MARCA = String(Date.now()).slice(-6);
const ATRASADA = `Confirmar florista ${MARCA}`;
const DA_SEMANA = `Enviar proposta ${MARCA}`;
const SEM_DATA = `Reservar carrinha ${MARCA}`;

const semeadas: string[] = [];

async function semear(page: Page) {
  for (const t of [
    {
      title: ATRASADA,
      priority: "alta",
      dueDate: hoje(-3),
      assignee: "Catarina Almeida",
      area: "Produção",
    },
    { title: DA_SEMANA, priority: "normal", dueDate: hoje(2), area: "Comercial" },
    { title: SEM_DATA, priority: "baixa" },
  ]) {
    const r = await page.request.post("/api/tarefas", { data: t });
    expect(r.ok(), `não foi possível semear «${t.title}» (${r.status()})`).toBe(true);
    semeadas.push((await r.json()).id);
  }
}

async function abrirTarefas(page: Page) {
  await page.goto("/orcamento/admin?v=tarefas");
  // O sinal de que a página hidratou é a classe do `body`; ver o `AGENTS.md`.
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"));
  await expect(page.getByText(ATRASADA).first()).toBeVisible();
  await page.waitForTimeout(500);
}

const linha = (page: Page, titulo: string) =>
  page.locator("[data-tarefa]").filter({ hasText: titulo }).first();

test.beforeEach(async ({ page }) => {
  // O selo do `next dev` é um botão fixo no canto inferior esquerdo.
  await page.addInitScript(() => {
    const e = document.createElement("style");
    e.textContent = "nextjs-portal{display:none !important}";
    (document.head ?? document.documentElement).appendChild(e);
  });
  exigirLogin(await entrarNoBackOffice(page));
  semeadas.length = 0;
  await semear(page);
});

test.afterEach(async ({ page }) => {
  // O que o próprio passeio já eliminou devolve 404, e não faz mal.
  for (const id of semeadas) await page.request.delete(`/api/tarefas/${id}`).catch(() => null);
});

test.describe("computador, com rato", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a lista é uma lista, e cada linha um item com o nome por inteiro", async ({ page }) => {
    await abrirTarefas(page);

    const estrutura = await page.evaluate(() =>
      [...document.querySelectorAll("[data-tarefa]")].map((l) => ({
        tag: l.tagName,
        pai: l.parentElement?.tagName,
        papelDoPai: l.parentElement?.getAttribute("role"),
      })),
    );
    expect(estrutura.length, "não há linhas de tarefa para medir").toBeGreaterThan(0);
    for (const e of estrutura) {
      expect(e, "uma linha deixou de ser <li> dentro de <ul role=list>").toEqual({
        tag: "LI",
        pai: "UL",
        papelDoPai: "list",
      });
    }

    // Os cabeçalhos de grupo dão nome à sua região.
    const grupos = await page.evaluate(() =>
      [...document.querySelectorAll("section[aria-labelledby]")].map((s) => {
        const h = document.getElementById(s.getAttribute("aria-labelledby")!);
        return h ? h.tagName : null;
      }),
    );
    expect(grupos.length).toBeGreaterThan(0);
    expect(new Set(grupos)).toEqual(new Set(["H2"]));

    // O que se ouve: o responsável com o nome inteiro e a prioridade com a palavra.
    const atrasada = linha(page, ATRASADA);
    await expect(atrasada).toContainText("Responsável: Catarina Almeida");
    await expect(atrasada).toContainText("Prioridade: Alta");
    // «Atrasada» diz-se com sinal E palavra, e o sinal fica mudo.
    await expect(atrasada).toContainText("Atrasada");
    await expect(atrasada.locator('[aria-hidden="true"]', { hasText: "⚠" })).toHaveCount(1);
  });

  test("os alvos têm 40 px com rato, e respondem na área toda", async ({ page }) => {
    await abrirTarefas(page);
    const l = linha(page, ATRASADA);

    const m = await l.evaluate((el) => {
      const r = (e: Element | null) => {
        if (!e) return null;
        const b = e.getBoundingClientRect();
        return { x: b.x, y: b.y, w: b.width, h: b.height };
      };
      const caixa = el.querySelector("label");
      const titulo = el.querySelector("[data-abrir]");
      const menu = el.querySelector('[aria-haspopup="menu"]');
      const quem = (e: Element | null, dx: number, dy: number) => {
        const b = e?.getBoundingClientRect();
        if (!b) return null;
        const noPonto = document.elementFromPoint(b.x + dx, b.y + dy);
        return e!.contains(noPonto);
      };
      const t = titulo?.getBoundingClientRect();
      const c = caixa?.getBoundingClientRect();
      return {
        caixa: r(caixa),
        titulo: r(titulo),
        menu: r(menu),
        // O quarto de polegada de dentro de cada canto: se o alvo é real, responde.
        caixaTopo: quem(caixa, 3, 3),
        caixaFundo: quem(caixa, (c?.width ?? 0) - 3, (c?.height ?? 0) - 3),
        tituloTopo: quem(titulo, (t?.width ?? 0) / 2, 3),
        tituloFundo: quem(titulo, (t?.width ?? 0) / 2, (t?.height ?? 0) - 3),
        // A linha não pode ter crescido: o espaço que o alvo ganha, a margem tira.
        margens: titulo
          ? parseFloat(getComputedStyle(titulo).marginTop) +
            parseFloat(getComputedStyle(titulo).marginBottom) +
            (t?.height ?? 0)
          : null,
      };
    });

    expect(Math.min(m.caixa!.w, m.caixa!.h), "caixa de verificação").toBeGreaterThanOrEqual(40);
    expect(m.titulo!.h, "título (altura)").toBeGreaterThanOrEqual(40);
    expect(Math.min(m.menu!.w, m.menu!.h), "menu ⋯").toBeGreaterThanOrEqual(40);
    // A área medida tem de RESPONDER, não só existir: um alvo de 40 px com a
    // metade de baixo coberta pela linha seguinte mede 40 e responde a 20.
    expect(m.caixaTopo, "o canto de cima da caixa não responde").toBe(true);
    expect(m.caixaFundo, "o canto de baixo da caixa não responde").toBe(true);
    expect(m.tituloTopo, "o topo do título não responde").toBe(true);
    expect(m.tituloFundo, "o fundo do título está coberto pela linha de data").toBe(true);
    // 20 de texto, tal como antes de o alvo crescer.
    expect(m.margens, "o alvo cresceu e a linha foi atrás").toBe(20);
  });

  test("marcar anuncia em região viva, e o «Anular» faz-se com o teclado", async ({ page }) => {
    await abrirTarefas(page);
    const caixa = linha(page, SEM_DATA).locator("input[type=checkbox]");
    await caixa.focus();
    await page.keyboard.press("Space");

    // A região polida da casa é a do toast. Espera-se pelo TEXTO: o primeiro
    // `PATCH` compila em `next dev`, e um fixo de 700 ms deu vazio.
    const aviso = page.locator('[role="status"][aria-live="polite"]');
    await expect(aviso).toContainText(`Tarefa concluída — «${SEM_DATA}»`, { timeout: 30_000 });

    const anular = page.getByRole("button", { name: "Anular" });
    await anular.focus();
    await page.keyboard.press("Enter");
    await expect
      .poll(
        async () => {
          const r = await page.request.get("/api/tarefas");
          const todas = (await r.json()) as { title: string; done: boolean }[];
          return todas.find((t) => t.title === SEM_DATA)?.done;
        },
        { message: "o «Anular» não repôs a tarefa" },
      )
      .toBe(false);
  });

  test("percurso só com teclado: criar, datar, atribuir, marcar, anular e eliminar", async ({
    page,
  }) => {
    await abrirTarefas(page);
    const ativo = () =>
      page.evaluate(() => {
        const e = document.activeElement as HTMLElement | null;
        return {
          tag: e?.tagName ?? "",
          // O «+» do botão «Nova tarefa» é desenho (`aria-hidden`): não faz parte
          // do nome que quem ouve o ecrã recebe.
          nome: (e?.getAttribute("aria-label") ?? (e?.textContent ?? "").trim()).replace(
            /^\+\s*/,
            "",
          ),
        };
      });

    // ── CRIAR ──────────────────────────────────────────────────────────────
    // ⌘N tem de dar o foco ao campo. Sem isto, o que se escreve a seguir cai nos
    // atalhos da página («g» seguido de uma letra muda de vista) — e foi assim
    // que a sonda saiu do ecrã a meio de «Chamar fotógrafo».
    await page.keyboard.press("Control+n");
    await expect
      .poll(ativo, { message: "⌘N abriu o campo mas não lhe deu o foco" })
      .toEqual({ tag: "INPUT", nome: "Nova tarefa" });

    // ── DATAR, ATRIBUIR E PRIORIZAR, na mesma linha ───────────────────────
    const titulo = `Chamar fotógrafo ${MARCA}`;
    await page.keyboard.type(`${titulo} amanhã #Ana !alta`);
    await page.keyboard.press("Enter");

    // O foco NÃO sai do campo enquanto a tarefa grava. Era um `disabled`, e um
    // campo desactivado larga o foco para o `<body>`: quem escreve «em rajada»
    // começava a seguinte e as teclas caíam nos atalhos da página.
    expect(await ativo(), "o campo largou o foco enquanto gravava").toEqual({
      tag: "INPUT",
      nome: "Nova tarefa",
    });

    const nova = linha(page, titulo);
    await expect(nova).toBeVisible({ timeout: 30_000 });
    await expect(nova, "a prioridade «!alta» não chegou à tarefa").toContainText(
      "Prioridade: Alta",
    );
    await expect(nova, "o responsável «#Ana» não chegou à tarefa").toContainText(
      "Responsável: Ana",
    );
    const amanha = new Date();
    amanha.setDate(amanha.getDate() + 1);
    await expect(nova, "«amanhã» não deu o dia seguinte").toContainText(String(amanha.getDate()));

    // ── FECHAR O CAMPO NÃO DEIXA O FOCO NO AR ────────────────────────────
    // Com texto escrito o Esc só o apaga; fecha quando o campo já está vazio,
    // o que acontece depois de a gravação acabar.
    await expect(page.getByRole("textbox", { name: "Nova tarefa" })).toHaveValue("", {
      timeout: 30_000,
    });
    await page.keyboard.press("Escape");
    await expect
      .poll(ativo, { message: "Esc fechou o campo e o foco caiu para o <body>" })
      .toEqual({ tag: "BUTTON", nome: "Nova tarefa" });

    // ── O MENU DA LINHA, SEM RATO ─────────────────────────────────────────
    await nova.locator("[data-abrir]").focus();
    await page.keyboard.press("Shift+F10");
    await expect(page.getByRole("menu")).toBeVisible();
    await expect(page.getByRole("menuitem", { name: "Eliminar" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("menu")).toHaveCount(0);

    // ── MARCAR E ANULAR ───────────────────────────────────────────────────
    const caixa = nova.locator("input[type=checkbox]");
    await caixa.focus();
    await page.keyboard.press("Space");
    await expect(caixa).toBeChecked();
    await page.keyboard.press("Space");
    await expect(caixa, "voltar a carregar na caixa não desfez a marcação").not.toBeChecked();

    // ── ELIMINAR, E A PERGUNTA DIZ DE QUE TAREFA SE TRATA ─────────────────
    await nova.locator("[data-abrir]").focus();
    await page.keyboard.press("Control+Backspace");
    const pergunta = page.getByRole("alertdialog").or(page.getByRole("dialog"));
    await expect(pergunta.first()).toBeVisible();
    await expect(pergunta.first(), "a pergunta não diz qual é a tarefa").toContainText(titulo);
    // O foco nasce no botão que NÃO destrói; chega-se ao «Eliminar» com Tab.
    await expect(pergunta.first().getByRole("button", { name: /^Cancelar$/ })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(pergunta.first().getByRole("button", { name: /^Eliminar/ })).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(linha(page, titulo)).toHaveCount(0);
  });
});

test.describe("zoom do browser", () => {
  /** 200% de zoom é metade da largura em píxeis CSS; 400%, um quarto. */
  for (const [zoom, largura] of [
    ["200%", 720],
    ["400%", 360],
  ] as const) {
    test(`a ${zoom} não há rolagem horizontal, com o detalhe aberto`, async ({ page }) => {
      await page.setViewportSize({ width: 1440, height: 900 });
      await abrirTarefas(page);
      await page.setViewportSize({ width: largura, height: 450 });
      await linha(page, ATRASADA).locator("[data-abrir]").click();
      await page.waitForTimeout(500);
      const sobra = await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      );
      expect(sobra, `a ${zoom} a página alarga ${sobra} px além do ecrã`).toBeLessThanOrEqual(0);
    });
  }
});

test.describe("axe, com o contraste", () => {
  for (const [nome, vp, toque] of [
    ["computador", { width: 1440, height: 900 }, false],
    ["telemóvel", { width: 390, height: 844 }, true],
  ] as const) {
    test.describe(nome, () => {
      test.use({ viewport: vp, isMobile: toque, hasTouch: toque });
      test("zero violações (WCAG 2.2 AA) no ecrã das tarefas", async ({ page }) => {
        await abrirTarefas(page);
        const { violations } = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze();
        expect(
          violations.map((v) => ({ id: v.id, impact: v.impact, nos: v.nodes.length })),
        ).toEqual([]);
      });
    });
  }
});
