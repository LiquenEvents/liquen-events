import { test, expect } from "@playwright/test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * COM RATO, NENHUM ALVO ABAIXO DE 24 PX (auditoria externa, C6)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O `.alvo-toque` leva tudo aos 44 px — mas só sob `(pointer: coarse)`. Com
 * rato ficavam como estavam desenhados: os links do rodapé a 20 px, os três da
 * barra de direitos a 17, as migalhas das páginas de serviço a 14. O mínimo do
 * WCAG 2.2 (2.5.8) é 24.
 *
 * A correcção é a mesma que a barra de navegação já usava (`py-1.5 -my-1.5`):
 * padding para a caixa crescer e margem negativa igual para nada mudar de
 * sítio. Medido com capturas antes e depois: iguais ao píxel.
 *
 * Fica de fora o que a própria regra exclui: um link no meio de uma frase
 * («Saber mais», «Política de Privacidade»). E as duas caixas de seleção de
 * /orcamento, que têm 16 px desenhados mas são clicáveis pelo rótulo inteiro
 * à volta (≥ 24 px) — crescer o quadrado mudava o desenho.
 */

const PAGINAS = ["/", "/galeria", "/orcamento", "/sobre", "/privacidade", "/servicos/casamentos"];

test.use({ viewport: { width: 1440, height: 900 } });

for (const caminho of PAGINAS) {
  test(`${caminho} — com rato, todos os alvos têm 24 px ou mais`, async ({ page }) => {
    await page.goto(caminho);
    await page.waitForLoadState("networkidle");
    const pequenos = await page.evaluate(() => {
      const out: string[] = [];
      for (const el of document.querySelectorAll<HTMLElement>(
        "a[href], button, [role=button], input, select, summary",
      )) {
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none") continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.width >= 24 && r.height >= 24) continue;
        // O link de saltar para o conteúdo e o botão de pausa só existem com foco.
        if (el.classList.contains("sr-only")) continue;
        // Excepção da regra: link dentro de uma frase.
        if (el.tagName === "A" && cs.display === "inline") {
          const resto = (el.parentElement?.textContent ?? "").replace(el.textContent ?? "", "");
          if (/\S/.test(resto)) continue;
        }
        // Caixa de seleção dentro de um rótulo de 24 px ou mais.
        if (el instanceof HTMLInputElement && el.type === "checkbox") {
          const rotulo = el.closest("label")?.getBoundingClientRect();
          if (rotulo && rotulo.height >= 24) continue;
        }
        const nome = (el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 40);
        out.push(`«${nome}» ${r.width.toFixed(1)}×${r.height.toFixed(1)}`);
      }
      return out;
    });
    expect(pequenos, pequenos.join("\n")).toEqual([]);
  });
}
