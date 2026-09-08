import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CONTRASTE É DO LAYOUT, NÃO DA FOTOGRAFIA @movimento
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O `docs/LOGIN.md` põe isto no ponto 8: «o branco é legível porque calhou
 * estar sobre uma zona escura da imagem». Nesta casa não calhou — há um véu
 * medido, e o comentário do `EntradaComFotografia.tsx` diz «o pior das quatro é
 * 10,88:1». Refiz a conta: 10,85 no degrau mais fundo. Está certo.
 *
 * O que NÃO havia era quem o guardasse. E o risco é concreto, porque o véu não
 * é uniforme — tem quatro paragens:
 *
 *     0%   alfa 0,82  →  10,85:1 sobre a pior fotografia possível   ✓
 *     60%  alfa 0,78  →   9,39:1                                    ✓
 *     82%  alfa 0,42  →   2,77:1                                    ✗
 *     100% alfa 0     →   1,00:1                                    ✗
 *
 * Ou seja: a garantia vale enquanto o texto ficar na banda de baixo. Basta a
 * saudação subir — que é exactamente o que o ponto 7 do documento pede — para
 * ela deixar de valer, sem nada mudar de cor e sem ninguém dar por isso.
 *
 * ── COMO É QUE ISTO MEDE ────────────────────────────────────────────────
 *
 * Não amostra a fotografia. Compõe o véu sobre BRANCO PURO, que é a pior
 * fotografia que pode existir — se passa contra branco, passa contra qualquer
 * imagem. E lê a posição REAL do texto no ecrã para saber que alfa é que o véu
 * tem por baixo dele, o que é a única coisa que um teste de unidade não
 * consegue fazer: em jsdom não há layout.
 */

/** Luminância relativa (WCAG 2.1). */
function luz([r, g, b]: number[]): number {
  const c = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}

function contraste(a: number[], b: number[]): number {
  const [alto, baixo] = [luz(a), luz(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
}

test.describe("o texto sobre a fotografia da entrada @movimento", () => {
  test("o véu garante 4,5:1 sobre a pior fotografia possível", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: { cookies: [], origins: [] } });
    const page = await ctx.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/pt/orcamento/admin");

    const saudacao = page.getByText(/^(Bom dia|Boa tarde|Boa noite)$/).first();
    await saudacao.waitFor({ state: "visible", timeout: 20_000 });

    const medido = await saudacao.evaluate((el) => {
      const caixa = el.getBoundingClientRect();

      // O véu é o ascendente que declara um gradiente com `to top`.
      let veu: HTMLElement | null = el.parentElement;
      let fundo = "";
      while (veu) {
        const f = getComputedStyle(veu).backgroundImage;
        if (f.includes("gradient") && f.includes("rgba")) {
          fundo = f;
          break;
        }
        veu = veu.parentElement;
      }
      const caixaVeu = veu?.getBoundingClientRect() ?? null;
      return {
        fundo,
        cor: getComputedStyle(el).color,
        topoDoTexto: caixa.top,
        baseDoTexto: caixa.bottom,
        topoDoVeu: caixaVeu?.top ?? 0,
        baseDoVeu: caixaVeu?.bottom ?? 0,
      };
    });

    expect(medido.fundo, "não encontrei o véu por baixo da saudação").not.toBe("");

    // As paragens do gradiente: `rgba(r, g, b, a) p%`.
    const paragens = [...medido.fundo.matchAll(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)\s*([\d.]+)%/g)]
      .map((m) => ({
        cor: [Number(m[1]), Number(m[2]), Number(m[3])],
        alfa: Number(m[4]),
        pos: Number(m[5]) / 100,
      }));
    expect(paragens.length, "o véu deixou de ter paragens legíveis").toBeGreaterThanOrEqual(2);

    // O gradiente é `to top`: 0% é a BASE. A fracção do texto conta-se de baixo.
    const alturaVeu = medido.baseDoVeu - medido.topoDoVeu;
    const fracaoDoTopoDoTexto = (medido.baseDoVeu - medido.topoDoTexto) / alturaVeu;

    // Interpola o alfa na posição mais desfavorável do texto — o seu TOPO, que
    // é o ponto mais alto e portanto o mais claro.
    const ordenadas = [...paragens].sort((a, b) => a.pos - b.pos);
    let alfa = ordenadas[ordenadas.length - 1].alfa;
    for (let i = 0; i < ordenadas.length - 1; i += 1) {
      const a = ordenadas[i];
      const b = ordenadas[i + 1];
      if (fracaoDoTopoDoTexto >= a.pos && fracaoDoTopoDoTexto <= b.pos) {
        const t = (fracaoDoTopoDoTexto - a.pos) / (b.pos - a.pos || 1);
        alfa = a.alfa + t * (b.alfa - a.alfa);
        break;
      }
    }

    // A PIOR fotografia possível é branca. Se passa contra branco, passa contra
    // qualquer imagem que ali venha a ser posta.
    const tinta = ordenadas[0].cor;
    const fundoComposto = tinta.map((v) => Math.round(alfa * v + (1 - alfa) * 255));
    const texto = (medido.cor.match(/\d+/g) ?? ["255", "255", "255"]).slice(0, 3).map(Number);
    const racio = contraste(texto, fundoComposto);

    expect(
      racio,
      `a saudação assenta a ${(fracaoDoTopoDoTexto * 100).toFixed(0)}% do véu, onde o alfa é ` +
        `${alfa.toFixed(2)} — sobre uma fotografia branca isso dá ${racio.toFixed(2)}:1. ` +
        `O véu tem de cobrir o texto todo, e não só a base.`,
    ).toBeGreaterThanOrEqual(4.5);

    await ctx.close();
  });
});
