import { test, expect, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O NÚMERO HERÓI, MEDIDO NUM BROWSER
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `numero-heroi-da-visao-geral.test.ts` guarda a RAZÃO entre os degraus,
 * lendo-a da fonte. O que ele não pode ver é a única coisa que estraga um
 * número herói na prática: caber. O `clamp()` só tem valor quando há uma
 * janela, e «113.257,85 €» a 48 px precisa de muito mais largura do que «0 €».
 * Se a coluna não chegar, o número parte em duas linhas — e um número partido
 * ao meio deixa de ser herói, passa a ser um acidente.
 *
 * ── PORQUE É QUE O TESTE ESCREVE O NÚMERO EM VEZ DE O LER ─────────────────
 *
 * Este passeio corre contra o servidor de produção da configuração principal,
 * que NÃO GRAVA (a razão está por extenso no `playwright.config.ts`). Sem
 * dados, o «Ganho» vale «0 €» — três caracteres que cabem em qualquer sítio.
 * Medir isso era medir nada e dar verde.
 *
 * Por isso o teste TROCA o texto pelo pior caso plausível antes de medir. Não
 * é fingir um valor: é medir a CAPACIDADE da coluna, que é o que a regra
 * guarda. O número verdadeiro continua a ser problema das contas, e essas têm
 * os seus próprios testes.
 */

/** O pior caso plausível: seis dígitos, separador de milhares, cêntimos. */
const PIOR_CASO = "113.257,85 €";

async function medir(page: Page, rotulo: string, texto?: string) {
  const botao = page.getByRole("button", { name: new RegExp(`^${rotulo}:`) }).first();
  await expect(botao, `não encontrei o cartão «${rotulo}»`).toBeVisible({ timeout: 30_000 });
  return botao.evaluate((el, escrever) => {
    // O número é o `<p>` de letra maior do cartão — os outros dois são o
    // rótulo e a frase de apoio. Escolhê-lo pela FAMÍLIA não servia, e a razão
    // vale a pena ficar escrita: dentro do back office o `globals.css`
    // REDEFINE `--font-playfair` para o Inter, de propósito («a calm
    // ChatGPT-app look»). O `fontFamily: var(--font-playfair)` que está no
    // `Overview.tsx` resolve, aqui, para Inter — procurar «playfair» na
    // família computada não encontra nada.
    const paragrafos = Array.from(el.querySelectorAll("p"));
    const numero = paragrafos.sort(
      (a, b) => parseFloat(getComputedStyle(b).fontSize) - parseFloat(getComputedStyle(a).fontSize),
    )[0];
    if (!numero) throw new Error("não encontrei o número dentro do cartão");
    if (escrever) numero.textContent = escrever;
    const st = getComputedStyle(numero);
    return {
      texto: (numero.textContent || "").trim(),
      px: parseFloat(st.fontSize),
      altura: numero.getBoundingClientRect().height,
    };
  }, texto ?? null);
}

for (const largura of [390, 1280]) {
  test(`o «Ganho» manda e cabe numa linha a ${largura}px`, async ({ page }) => {
    await page.setViewportSize({ width: largura, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));

    const heroi = await medir(page, "Ganho", PIOR_CASO);
    const lado = await medir(page, "À espera", PIOR_CASO);

    expect(
      heroi.px / lado.px,
      `«Ganho» a ${heroi.px}px contra «À espera» a ${lado.px}px — não se distinguem`,
    ).toBeGreaterThanOrEqual(1.5);

    // `leading-none` põe a caixa à altura da letra. 1,35× dá folga para os
    // acentos e para o arredondamento do browser sem deixar passar uma segunda
    // linha, que valeria 2×.
    for (const m of [heroi, lado]) {
      expect(
        m.altura,
        `«${m.texto}» partiu em mais do que uma linha (${m.altura}px para letra de ${m.px}px)`,
      ).toBeLessThan(m.px * 1.35);
    }
  });
}
