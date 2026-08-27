import { test, expect, type Locator, type Page } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

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
 * Nesta instalação o «Ganho» vale quase sempre «0 €» — três caracteres que
 * cabem em qualquer sítio. Medir isso era medir nada e dar verde. Por isso o
 * teste TROCA o texto pelo pior caso plausível antes de medir. Não é fingir um
 * valor: é medir a CAPACIDADE da coluna, que é o que a regra guarda. O número
 * verdadeiro continua a ser problema das contas, e essas têm os seus próprios
 * testes.
 *
 * ── E PORQUE É QUE SEMEIA UM PEDIDO ANTES ─────────────────────────────────
 *
 * Com a lista de pedidos VAZIA não há cartão nenhum para medir: a Visão Geral
 * devolve o ecrã de boas-vindas («Ainda sem pedidos por aqui») e os três
 * números de dinheiro não chegam a existir. Escrito sem esta semente, o
 * passeio dependia de outro teste da mesma passagem ter semeado primeiro — e
 * com a configuração principal em paralelo isso é uma corrida, não uma
 * garantia. Perdeu-a, e a falha que deu foi «não encontrei o cartão Ganho»:
 * um vermelho que acusa a interface de um defeito que é do teste.
 *
 * `garantirPedido` reaproveita o que já lá estiver e só cria quando não há
 * nada — o tecto de 5 criações por minuto por IP não se gasta à toa.
 */

/** O pior caso plausível: seis dígitos, separador de milhares, cêntimos. */
const PIOR_CASO = "113.257,85 €";

async function medir(page: Page, rotulo: string, texto?: string) {
  const botao = page.getByRole("button", { name: new RegExp(`^${rotulo}:`) }).first();
  await expect(botao, `não encontrei o cartão «${rotulo}»`).toBeVisible({ timeout: 30_000 });

  /**
   * MEDE-SE ATÉ SAIR UM NÚMERO, E A RAZÃO NÃO É SUPERSTIÇÃO.
   *
   * O painel volta a desenhar-se quando os dados chegam do cliente, e o nó que
   * o localizador tinha encontrado sai da página a meio da medição. O
   * `getComputedStyle` de um nó solto devolve `""` para tudo, e
   * `parseFloat("")` é `NaN` — que passava adiante e rebentava mais à frente
   * com «Ganho a NaNpx», uma mensagem que acusa a interface de um defeito que
   * é da altura a que se mediu. Reproduzido aqui: a PRIMEIRA medição a seguir
   * ao `reload` era a que apanhava a troca, e só a 390 px.
   *
   * O `toPass` volta a resolver o localizador em cada tentativa, portanto a
   * segunda já mede o nó novo.
   */
  let medida: { texto: string; px: number; altura: number } | null = null;
  await expect(async () => {
    medida = await medirUmaVez(botao, texto);
    expect(
      Number.isFinite(medida.px) && medida.px > 0,
      `o «${rotulo}» não devolveu tamanho de letra — o nó saiu da página a meio da medição?`,
    ).toBe(true);
  }, `não consegui medir o cartão «${rotulo}»`).toPass({ timeout: 15_000 });
  return medida as unknown as { texto: string; px: number; altura: number };
}

function medirUmaVez(botao: Locator, texto?: string) {
  return botao.evaluate((el, escrever) => {
    // O número é o `<p>` de letra maior do cartão — os outros dois são o
    // rótulo e a frase de apoio. Escolhe-se pelo TAMANHO e não pela família:
    // os números do back office estão todos na letra de trabalho, a mesma dos
    // rótulos, portanto a família não distingue nada aqui.
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
    await garantirPedido(page);
    await page.reload();

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
