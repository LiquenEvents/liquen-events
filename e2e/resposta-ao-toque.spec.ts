import { test, expect, type Page, type Locator } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ESTADO, PRESSAO, TOQUE_MS } from "../src/app/[lang]/(admin)/orcamento/admin/ui/movimento";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PIXEL MEXE-SE — com o rato EM BAIXO, o `scale` computado é 0.98
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `resposta-ao-toque.test.ts` (vitest) varre a fonte e garante que a classe
 * está em todos os tocáveis do back office. Este passeio garante a outra
 * metade, que é a que ninguém consegue ver a olho: que a classe FAZ alguma
 * coisa.
 *
 * É uma distinção com história nesta casa. O `Button` teve `active:scale-[0.98]`
 * durante meses sem que o botão encolhesse: a lista dele dizia
 * `transition-[…,transform]`, e no Tailwind v4 `scale-[0.98]` emite a
 * propriedade AUTÓNOMA `scale`, que `transform` não cobre. A classe estava lá,
 * o CSS compilava, nada dava erro — e o carregar era um corte seco de 0 ms.
 * Nenhum teste de fonte apanha isso. Este apanha, porque lê o `scale`
 * COMPUTADO com o botão carregado.
 *
 * ── DUAS AMOSTRAS, POR RAZÕES DIFERENTES ──────────────────────────────────
 *
 *  1. **O ECRÃ DE ENTRADA, a sério.** É o único ecrã do back office que se vê
 *     sem entrar, e tem três botões — o olho da palavra-passe (um primitivo),
 *     o «Entrar» (o `Button`) e a ligação de recuperação (escrita à mão, e uma
 *     das que esta ronda corrigiu). Página real, CSS real, browser real.
 *
 *  2. **UM BANCO DE AMOSTRAS**, para as famílias que vivem atrás da porta: um
 *     item de menu, uma linha de lista, um separador e uma pastilha de filtro.
 *     As classes NÃO são escritas aqui — são LIDAS dos ficheiros de origem em
 *     tempo de teste. Se alguém mudar a classe do item de menu, é a classe
 *     nova que se mede. Um banco com classes copiadas à mão mediria a cópia, e
 *     passaria a verde no dia em que o original partisse.
 */

/** O `scale` que o browser está mesmo a aplicar, agora. */
async function escalaComputada(alvo: Locator): Promise<number> {
  return alvo.evaluate((el) => {
    const s = getComputedStyle(el).scale;
    if (!s || s === "none") return 1;
    return parseFloat(s.split(" ")[0]);
  });
}

/**
 * Carrega no elemento e mede: em repouso, com o rato em baixo, e depois de largar.
 *
 * `mouse.down()` e não `click()`: um clique fecha o `:active` no mesmo
 * fotograma e não há nada para ler. Isto é literalmente o dedo pousado.
 */
async function medirOToque(page: Page, alvo: Locator) {
  await alvo.scrollIntoViewIfNeeded();
  const caixa = await alvo.boundingBox();
  if (!caixa) throw new Error("elemento sem caixa — não está desenhado");

  const repouso = await escalaComputada(alvo);
  await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
  await page.mouse.down();
  /* ── A LISTA, LIDA DO BROWSER E NÃO DA FONTE ─────────────────────────────
     Ler só o `scale` não chega, e descobri-o com a armadilha reposta à mão:
     com `transition-[…,transform]` em vez de `scale`, o elemento ENCOLHE na
     mesma — só que a corte seco, 0 ms. Aos 80 ms de medição está nos mesmos
     0.98 e o teste passava a verde por cima da avaria que existe para
     apanhar. O que separa o afundar suave do corte seco é a propriedade
     estar na lista COMPUTADA, e é isso que se lê aqui, com o dedo em baixo. */
  const propriedades = await alvo.evaluate((el) =>
    getComputedStyle(el)
      .transitionProperty.split(",")
      .map((p) => p.trim()),
  );
  // Um fotograma chega: a transição do `:active` são 20 ms e o valor de
  // chegada do `scale` é aplicado pelo motor de estilo, não interpolado a
  // partir do `getComputedStyle` de destino.
  await page.waitForTimeout(80);
  const carregado = await escalaComputada(alvo);
  await page.mouse.up();
  await page.waitForTimeout(200);
  const largado = await escalaComputada(alvo);
  return { repouso, carregado, largado, propriedades };
}

const ESCALA_DO_TOQUE = Number(/scale-\[([\d.]+)\]/.exec(PRESSAO)![1]);

test.describe("o ecrã de entrada do back office responde ao dedo", () => {
  test("os três botões afundam com o rato em baixo, e voltam ao largar", async ({ page }) => {
    await page.goto("/pt/orcamento/admin");
    await page.waitForLoadState("domcontentloaded");

    const botoes = page.locator("button:visible");
    const quantos = await botoes.count();
    // Se o ecrã de entrada mudar ao ponto de não ter botões, isto cai em vez
    // de passar a verde por não ter medido nada.
    expect(quantos, "o ecrã de entrada deixou de ter botões visíveis").toBeGreaterThanOrEqual(2);

    for (let i = 0; i < quantos; i++) {
      const alvo = botoes.nth(i);
      if (await alvo.isDisabled()) continue;
      const classe = (await alvo.getAttribute("class")) ?? "";
      // Só se mede o que declara o gesto da casa: um botão sem `PRESSAO` é um
      // caso para a varredura de fonte, não para aqui.
      if (!classe.includes("active:scale-")) continue;

      const m = await medirOToque(page, alvo);
      const nome = (await alvo.getAttribute("aria-label")) ?? (await alvo.innerText()) ?? `#${i}`;
      expect(
        m.propriedades,
        `${nome}: o \`scale\` não está na lista de transição — o afundar é um corte seco de ` +
          "0 ms. É a armadilha do Tailwind v4: `transform` não cobre `scale`.",
      ).toContain("scale");
      expect(m.repouso, `${nome}: não está em repouso antes de se lhe tocar`).toBeCloseTo(1, 3);
      expect(m.carregado, `${nome}: com o rato EM BAIXO o pixel não se mexeu`).toBeCloseTo(
        ESCALA_DO_TOQUE,
        3,
      );
      expect(m.largado, `${nome}: ficou afundado depois de largar`).toBeCloseTo(1, 3);
    }
  });
});

/* ── O BANCO DE AMOSTRAS ────────────────────────────────────────────────────
   As classes vêm da fonte. `extrair` apanha o literal de `className` que
   contém uma marca, e substitui as duas constantes da casa pelo texto delas —
   que é exactamente o que o React faz ao desenhar. */
const RAIZ_UI = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

function extrair(ficheiro: string, marca: string): string {
  const src = readFileSync(join(RAIZ_UI, ficheiro), "utf8");
  const i = src.indexOf(marca);
  if (i < 0) throw new Error(`${ficheiro}: a marca «${marca}» já não existe — a amostra caducou`);
  const abre = src.lastIndexOf("`", i);
  const fecha = src.indexOf("`", i);
  if (abre < 0 || fecha < 0) throw new Error(`${ficheiro}: «${marca}» não está num literal`);
  return (
    src
      .slice(abre + 1, fecha)
      /* O NOME PODE VIR COM ALCUNHA. O `FazerProposta.tsx` importa
         `ESTADO as MOV_ESTADO` (já tinha um `ESTADO` seu), e a primeira versão
         disto só conhecia o nome de baptismo: apagava o `${MOV_ESTADO}` com o
         resto das interpolações e montava a pastilha SEM lista de propriedades
         — o browser caía em `transition-property: all`, que é exactamente a
         patologia que esta casa documenta. O banco acusava o produto de uma
         avaria que era do banco. Vale o sufixo, não o nome exacto. */
      .replace(/\$\{\s*\w*ESTADO\s*\}/g, ESTADO)
      .replace(/\$\{\s*\w*PRESSAO\s*\}/g, PRESSAO)
      .replace(/\$\{[^}]*\}/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/**
 * O CSS DA CASA, compilado a sério — e são DUAS folhas, não uma.
 *
 * O `globals.css` diz `@source not "./[lang]/(admin)"`: o back office foi
 * DELIBERADAMENTE retirado da folha do sítio, para não viajar dentro de cada
 * proposta que um casal abre (87,8 KB que ninguém lá usava). Os utilitários do
 * painel nascem no `admin.css`, que só o layout do back office importa.
 *
 * Isto não é um pormenor de montagem: a primeira versão deste banco compilou
 * só o `globals.css` e mediu `scale: 1` e `transition-duration: 0s` em tudo —
 * verde na página real, vermelho aqui, e a razão não era o código do produto,
 * era o teste a olhar para a folha errada. Ficam as duas.
 */
function cssDaCasa(): string {
  const pasta = mkdtempSync(join(tmpdir(), "toque-"));
  const folhas = ["src/app/globals.css", "src/app/admin.css"].map((entrada, i) => {
    const saida = join(pasta, `folha-${i}.css`);
    execFileSync("npx", ["@tailwindcss/cli", "-i", entrada, "-o", saida, "--minify"], {
      cwd: process.cwd(),
      stdio: "pipe",
    });
    return readFileSync(saida, "utf8");
  });
  return folhas.join("\n");
}

const AMOSTRAS = [
  {
    nome: "um item de menu",
    ficheiro: "ui/MenuDeAccoes.tsx",
    marca: "alvo-toque flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-sm",
  },
  {
    nome: "uma linha de lista",
    ficheiro: "ui/TabelaOuCartoes.tsx",
    marca: "alvo-toque foco-largo group block w-full p-3.5 text-left",
  },
  {
    nome: "um separador",
    ficheiro: "ui/Segmented.tsx",
    marca: "relative inline-flex items-center gap-1.5 rounded-full font-medium",
  },
  {
    nome: "uma pastilha de filtro",
    ficheiro: "FazerProposta.tsx",
    marca: "alvo-toque shrink-0 whitespace-nowrap rounded-lg px-3.5 py-1.5",
  },
];

test.describe("as outras famílias de tocáveis, com as classes lidas da fonte", () => {
  test("item de menu, linha de lista, separador e pastilha afundam todos igual", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    const css = cssDaCasa();
    const marcacao = AMOSTRAS.map(
      (a, i) =>
        `<button type="button" data-amostra="${i}" class="${extrair(a.ficheiro, a.marca)}">${a.nome}</button>`,
    ).join("\n");

    await page.setContent(
      `<main style="display:flex;flex-direction:column;gap:24px;padding:40px;align-items:flex-start">${marcacao}</main>`,
    );
    await page.addStyleTag({ content: css });

    for (let i = 0; i < AMOSTRAS.length; i++) {
      const a = AMOSTRAS[i];
      const alvo = page.locator(`[data-amostra="${i}"]`);
      const classe = (await alvo.getAttribute("class")) ?? "";
      expect(classe, `${a.nome}: a fonte deixou de trazer o gesto da casa`).toContain(
        "active:scale-",
      );

      const m = await medirOToque(page, alvo);
      expect(
        m.propriedades,
        `${a.nome}: o \`scale\` não está na lista de transição — afunda a corte seco, 0 ms`,
      ).toContain("scale");
      expect(m.repouso, `${a.nome}: não está em repouso`).toBeCloseTo(1, 3);
      expect(m.carregado, `${a.nome}: com o rato EM BAIXO o pixel não se mexeu`).toBeCloseTo(
        ESCALA_DO_TOQUE,
        3,
      );
      expect(m.largado, `${a.nome}: ficou afundado depois de largar`).toBeCloseTo(1, 3);
    }
  });

  test("o toque é instantâneo — 20 ms, e nunca mais do que isso", async ({ page }) => {
    /* O número não se mede com um cronómetro (o browser não expõe a duração a
       correr); mede-se onde ele vale, que é a `transition-duration` computada
       ENQUANTO o elemento está `:active`. Se alguém subir os 20 ms «para se
       ver melhor», isto cai — e a regra da casa é que o toque não pode atrasar
       nada. */
    const css = cssDaCasa();
    const classe = extrair(AMOSTRAS[0].ficheiro, AMOSTRAS[0].marca);
    await page.setContent(
      `<main style="padding:40px"><button type="button" id="amostra" class="${classe}">item</button></main>`,
    );
    await page.addStyleTag({ content: css });

    const alvo = page.locator("#amostra");
    const caixa = (await alvo.boundingBox())!;
    await page.mouse.move(caixa.x + caixa.width / 2, caixa.y + caixa.height / 2);
    await page.mouse.down();
    const duracao = await alvo.evaluate((el) => getComputedStyle(el).transitionDuration);
    await page.mouse.up();

    // A lista do `ESTADO` tem seis propriedades e a duração do `:active` vale
    // para todas — daí `20ms` repetido, e não um só valor.
    const valores = [...new Set(duracao.split(",").map((v) => v.trim()))];
    expect(valores, `a duração do toque deixou de ser ${TOQUE_MS} ms: ${duracao}`).toEqual([
      `${TOQUE_MS / 1000}s`,
    ]);
  });
});
