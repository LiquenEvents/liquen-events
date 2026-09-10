import { test, expect } from "@playwright/test";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O NOME DE UM DESTINO CABE NA SUA CÉLULA @movimento
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ela mandou uma fotografia da barra de destinos com dois rótulos POR CIMA um
 * do outro — «Guiões do dia» a entrar dentro de «Propostas Aceites».
 *
 * A célula tinha `lg:w-20`: 80 px fixos, que é o idioma de quatro separadores
 * iguais de um telemóvel, aplicado a um menu de DOZE. E o rótulo é
 * `whitespace-nowrap` — não parte, não encolhe, transborda. Medido a 1440 px:
 *
 *     Fazer proposta ....... 89 px numa célula de 80   (+9)
 *     Propostas Aceites ... 106 px numa célula de 80   (+26)
 *
 * As outras dez cabiam. Por isso o defeito era invisível até dois vizinhos
 * compridos ficarem lado a lado — e nenhum teste o media, porque medir texto é
 * coisa que só um browser sabe fazer: a largura de «Propostas Aceites» não está
 * escrita em lado nenhum do CSS, sai da fonte, do tamanho e da letra.
 *
 * É a mesma assinatura dos outros guardas `@movimento`, e corre da mesma
 * maneira. Não grava nada.
 *
 * ── PORQUE É QUE SE MEDE NAS DUAS LARGURAS ──────────────────────────────
 *
 * Porque a cápsula tem a largura do seu conteúdo (`lg:flex-none`) e o menu só
 * existe a partir de `lg`. A 1024 px — o primeiro pixel em que ele aparece — é
 * onde há menos espaço; a 1440 é onde ela trabalha. Um rótulo novo comprido
 * parte a primeira antes da segunda.
 */
test.describe("o nome de um destino cabe na sua célula @movimento", () => {
  for (const largura of [1024, 1440]) {
    test(`a ${largura} px nenhum rótulo da barra transborda`, async ({ page }) => {
      await page.setViewportSize({ width: largura, height: 900 });
      await page.goto("/orcamento/admin");

      const capsula = page.locator('[class*="bo-material-pilula"]').first();
      await expect(capsula, "a barra de destinos está no ecrã").toBeVisible();

      const medidas = await capsula.evaluate((el) =>
        Array.from(el.querySelectorAll("button")).map((b) => {
          const celula = b.getBoundingClientRect();
          // O rótulo é o `span` de folha que está VISÍVEL — no telemóvel e no
          // computador há dois, e um deles está sempre `display: none`.
          const rotulo = Array.from(b.querySelectorAll("span")).find(
            (s) =>
              getComputedStyle(s).display !== "none" &&
              s.children.length === 0 &&
              (s.textContent ?? "").trim().length > 0,
          );
          const r = rotulo?.getBoundingClientRect();
          return {
            texto: (rotulo?.textContent ?? "").trim(),
            celula: Math.round(celula.width),
            rotulo: r ? Math.round(r.width) : 0,
          };
        }),
      );

      expect(medidas.length, "a barra tem destinos para medir").toBeGreaterThan(4);

      const transbordam = medidas
        .filter((m) => m.rotulo > m.celula)
        .map((m) => `«${m.texto}» ocupa ${m.rotulo} px numa célula de ${m.celula}`);

      expect(
        transbordam,
        `há rótulos maiores do que a sua célula — é assim que dois nomes acabam por cima um do outro:\n  ${transbordam.join("\n  ")}`,
      ).toEqual([]);

      // E a barra inteira não pode estourar o ecrã: a cápsula tem a largura do
      // seu conteúdo, portanto um nome comprido de mais empurra-a para fora
      // antes de transbordar célula nenhuma.
      const cx = await capsula.evaluate((el) => {
        const r = el.getBoundingClientRect();
        return { esquerda: Math.round(r.left), direita: Math.round(r.right) };
      });
      expect(cx.esquerda, "a barra não sai pela esquerda").toBeGreaterThanOrEqual(0);
      expect(cx.direita, "a barra não sai pela direita").toBeLessThanOrEqual(largura);
    });
  }
});
