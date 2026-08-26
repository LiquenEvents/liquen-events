import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRASTE MEDIDO ONDE ELE EXISTE — NO BROWSER, COM A CASCATA TODA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO por análise estática: 1288 chamadas a `text-foreground/NN` no back
 * office contra 147 aos tokens `--bo-*`, e 723 dessas — 56% — abaixo dos 4,5:1
 * que a norma pede. O `/25` mede 1,78:1, o `/40` 2,68:1, o `/45` 3,11:1.
 *
 * O `contraste-do-texto.test.ts` já guarda os TOKENS, e faz a conta a sério
 * (achata o alfa antes de medir, que é onde toda a gente se engana). O que ele
 * não pode ver é o que a cascata faz na página verdadeira: uma regra pode estar
 * escrita e não pegar — os utilitários do Tailwind vivem numa camada, e uma
 * regra na camada errada perde para a chamada sem dar erro nenhum.
 *
 * É por isso que isto é um passeio e não mais um teste de unidade.
 *
 * ── UMA RESSALVA HONESTA SOBRE A VERIFICAÇÃO AO CONTRÁRIO ────────────────
 *
 * A rotina desta casa é tirar a correcção e confirmar que o teste CAI. Aqui
 * NÃO consegui fazê-la de forma fiável, e é preciso dizê-lo.
 *
 * MEDIDO: com o `globals.css` revertido para o de HEAD, a cor computada saía
 * exactamente igual — `/45` continuava a dar `rgba(13,13,13,0.58)`, que é o
 * valor DA CORRECÇÃO. O servidor de desenvolvimento estava a servir o CSS
 * antigo: o `webServer` do Playwright reaproveita um servidor já a correr
 * (`reuseExistingServer: !CI`) e a reconstrução do CSS não é síncrona com a
 * gravação do ficheiro.
 *
 * Ou seja, a queda que eu observasse aqui podia ser verdadeira ou podia ser
 * uma corrida — e um sinal que tanto pode ser as duas coisas não é sinal.
 *
 * O que ESTÁ verificado, e é o que sustenta a correcção:
 *   · a aritmética, com a fórmula da norma (ver `contraste-do-texto.test.ts`);
 *   · que a regra PEGA num browser verdadeiro — medido: `/25`, `/40` e `/45`
 *     saem em `0.58` (o token `faint`), `/55` em `0.64` (`muted`), e o `/60`
 *     fica intacto em `oklab(… / 0.6)`;
 *   · os testes de unidade, esses sim vistos a cair.
 *
 * Na integração o servidor é construído de raiz (`CI=1` → `npm run start`), e
 * por isso é lá que este passeio vale como rede.
 */

/** A fórmula da norma, tal como o `contraste-do-texto.test.ts` a escreve. */
const FORMULA = `
  (function () {
    const canal = (c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lum = ([r, g, b]) => 0.2126 * canal(r / 255) + 0.7152 * canal(g / 255) + 0.0722 * canal(b / 255);
    const ler = (s) => {
      const m = s.match(/rgba?\\(([^)]+)\\)/);
      if (!m) return null;
      const p = m[1].split(/[,/ ]+/).filter(Boolean).map(Number);
      return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
    };
    // O fundo COMPOSTO: sobe a árvore até encontrar quem pinte de facto.
    const fundoDe = (el) => {
      let n = el;
      while (n) {
        const c = ler(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.95) return c.rgb;
        n = n.parentElement;
      }
      return [255, 255, 255];
    };
    const achatar = (fg, a, bg) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
    window.__contraste = function () {
      const fora = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const proprio = Array.from(el.childNodes).some(
          (n) => n.nodeType === 3 && (n.textContent || "").trim().length > 0,
        );
        if (!proprio) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const st = getComputedStyle(el);
        if (st.visibility === "hidden" || st.opacity === "0") continue;
        const cor = ler(st.color);
        if (!cor) continue;
        const bg = fundoDe(el);
        const composta = achatar(cor.rgb, cor.a, bg);
        const [a1, a2] = [lum(composta), lum(bg)].sort((x, y) => y - x);
        const racio = (a1 + 0.05) / (a2 + 0.05);
        // A norma dispensa texto GRANDE: 18,66px normal ou 14px a negrito
        // passam com 3:1. É por desenho, não por sorte — a Apple usa a mesma
        // dispensa no headline branco sobre a fotografia do hero.
        const px = parseFloat(st.fontSize);
        const negrito = Number(st.fontWeight) >= 700;
        const minimo = px >= 24 || (px >= 18.66 && negrito) ? 3 : 4.5;
        if (racio + 0.01 >= minimo) continue;
        fora.push({
          texto: (el.textContent || "").trim().slice(0, 30),
          racio: Math.round(racio * 100) / 100,
          px,
          classe: el.className.toString().slice(0, 60),
        });
      }
      return fora;
    };
  })();
`;

/**
 * A classe `admin-mode` chega num `useEffect`, portanto só existe depois da
 * primeira pintura — e TODAS as regras de chão desta casa estão presas a ela.
 * Medir antes é medir a página sem as regras. Já me apanhou noutro passeio.
 */
async function prontos(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
    timeout: 10_000,
  });
  await page.waitForTimeout(300);
  await page.evaluate(FORMULA);
}

test.describe("o contraste do back office", () => {
  /**
   * ── A SONDA É O CASO PRINCIPAL, E A VARREDURA É A SECUNDÁRIA ────────────
   *
   * A varredura dos ecrãs passava com e sem a correcção. Numa base vazia os
   * ecrãs mostram estados vazios, e os elementos que vestem `text-foreground/40`
   * nem chegam a ser desenhados — estava a afirmar sobre uma página onde o que
   * eu queria medir não estava. É a terceira vez hoje que a verificação ao
   * contrário apanha uma rede furada.
   *
   * A sonda mede a REGRA: põe um elemento com cada opacidade na página
   * verdadeira, com a cascata e a ordem de camadas do Tailwind aplicadas, e
   * pergunta ao browser que cor lhe saiu. É determinista e não depende de haver
   * dados.
   */
  test("cada opacidade que chumbava passa a assentar num token verificado", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));
    await prontos(page);

    const medidos = await page.evaluate(() => {
      const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
      const lum = (p: number[]) =>
        0.2126 * canal(p[0] / 255) + 0.7152 * canal(p[1] / 255) + 0.0722 * canal(p[2] / 255);
      const saida: Record<string, number> = {};
      for (const n of [25, 30, 35, 40, 45, 50, 55, 60]) {
        const el = document.createElement("span");
        el.className = `text-foreground/${n}`;
        el.textContent = "sonda";
        document.body.appendChild(el);
        const m = getComputedStyle(el).color.match(/rgba?\(([^)]+)\)/);
        el.remove();
        if (!m) continue;
        const p = m[1]
          .split(/[,/ ]+/)
          .filter(Boolean)
          .map(Number);
        const a = p.length > 3 ? p[3] : 1;
        const composta = [0, 1, 2].map((i) => Math.round(p[i] * a + 255 * (1 - a)));
        const [hi, lo] = [lum(composta), lum([255, 255, 255])].sort((x, y) => y - x);
        saida[`/${n}`] = Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
      }
      return saida;
    });

    for (const [classe, racio] of Object.entries(medidos)) {
      expect(
        racio,
        `text-foreground${classe} mede ${racio}:1 — ${JSON.stringify(medidos)}`,
      ).toBeGreaterThanOrEqual(4.5);
    }

    /**
     * E a ORDEM tem de se manter. Achatar tudo num só valor passava a norma e
     * apagava a hierarquia que alguém escreveu — que é meia correcção. O `/25`
     * era mais fraco do que o `/55` e continua a sê-lo.
     */
    expect(medidos["/25"], JSON.stringify(medidos)).toBeLessThan(medidos["/55"]);
    expect(medidos["/45"], JSON.stringify(medidos)).toBeLessThan(medidos["/50"]);
  });

  for (const destino of ["Visão Geral", "Pedidos"]) {
    test(`nenhum texto de ${destino} chumba a norma`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      exigirLogin(await entrarNoBackOffice(page));
      await page.getByRole("button", { name: destino, exact: true }).first().click();
      await prontos(page);

      const fora = await page.evaluate(() =>
        (window as unknown as { __contraste: () => unknown[] }).__contraste(),
      );
      expect(
        fora,
        `${destino}: ${fora.length} nós abaixo do mínimo — ${JSON.stringify(fora.slice(0, 8), null, 1)}`,
      ).toEqual([]);
    });
  }
});
