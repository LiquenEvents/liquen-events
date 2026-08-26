import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUM TEXTO DO BACK OFFICE ABAIXO DE 12 px — NEM NO COMPUTADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O chão do telemóvel já existia e pára nos 1024 px, porque é aí que a lista
 * passa a tabela e a tabela é densa porque tem de ser. Acima disso ficavam 94
 * chamadas a `text-[8px]` e `text-[9px]` — algumas a vestir etiquetas de estado
 * e rótulos de destino.
 *
 * O CSS diz que estão levantadas. Isto verifica que ESTÃO MESMO, no sítio onde
 * um teste de unidade não chega: o tamanho REAL calculado pelo browser, numa
 * largura de computador, com a cascata toda aplicada.
 *
 * É a diferença que já me apanhou hoje: uma regra pode estar escrita e não
 * pegar — os utilitários do Tailwind vivem numa camada, e uma regra na camada
 * errada perde para o `text-[9px]` da chamada sem dar erro nenhum.
 *
 * 12 px é o degrau mais baixo da escala da casa (`--bo-fs-caption`), e é também
 * o mais baixo dos oito degraus que uma análise mediu na apple.com — num ecrã
 * de 1108 px, onde densidade não falta.
 */

/**
 * ── DOIS CHÃOS, E ESTA É A PARTE HONESTA ─────────────────────────────────
 *
 * A análise de craft pede 12 px em todo o lado. Não é isso que este código faz,
 * e não é por esquecimento.
 *
 * A casa tem uma decisão MEDIDA e com teste próprio: o chão de 12 px vale
 * abaixo de 1024 px, e pára aí porque é onde a lista passa a tabela. O teste
 * que a guarda diz, com estas palavras, «se alguém alargar o chão para lá de
 * 1024, a densidade da tabela do portátil muda sem ninguém pedir».
 *
 * O que mudou foi mais estreito: 7, 8 e 9 px passam a ser levantados em
 * QUALQUER largura, porque abaixo de 10 px não é texto denso — é texto que não
 * se lê. Os 10 e 11 continuam a ser o registo denso do computador.
 *
 * Portanto: 12 px no telemóvel, 10 px no computador. É o que a alteração
 * garante, e é o que este passeio afirma. Prender aqui os 12 px no computador
 * era escrever uma promessa que o código não faz.
 */
const CHAO_COMPUTADOR = 9.5;
const CHAO_TELEMOVEL = 11.5;

/**
 * ── ESPERAR PELO `admin-mode`, E PORQUE É QUE ISTO NÃO É OPCIONAL ─────────
 *
 * Todas as regras de chão desta casa estão presas a `body.admin-mode`, e essa
 * classe chega num `useEffect` — ou seja, DEPOIS da primeira pintura.
 *
 * Isto apanhou-me: os casos passavam sozinhos e falhavam quando o ficheiro
 * corria inteiro. Com dois workers a partilhar o servidor, a hidratação demora
 * um pouco mais, e a sonda media a página antes de a classe existir — sem a
 * classe, a regra não se aplica e o `text-[8px]` continua a valer 8.
 *
 * Não era um defeito do código: era o teste a medir cedo de mais.
 */
async function esperarPeloBackOffice(page: import("@playwright/test").Page): Promise<void> {
  await page.waitForFunction(() => document.body.classList.contains("admin-mode"), null, {
    timeout: 10_000,
  });
}

test.describe("o chão da letra no computador", () => {
  /**
   * ── A SONDA, E PORQUE É QUE ELA É O CASO PRINCIPAL ──────────────────────
   *
   * A primeira versão deste passeio varria os ecrãs à procura de nós pequenos.
   * Passava com e sem a alteração — e a razão é a mesma que já me apanhou hoje
   * noutro teste: numa base vazia os ecrãs mostram estados vazios, e os
   * elementos que vestem `text-[8px]` nem chegam a ser desenhados. Estava a
   * afirmar sobre um ecrã onde o que eu queria medir não estava.
   *
   * Um teste que passa nos dois lados é pior do que não ter teste nenhum,
   * porque parece que prova.
   *
   * A sonda mede a REGRA, não o conteúdo: põe um elemento com cada classe na
   * página verdadeira, com a cascata toda e a ordem de camadas do Tailwind
   * aplicadas, e pergunta ao browser que tamanho lhe saiu. É determinista, não
   * depende de haver dados, e apanha exactamente o defeito que interessa — uma
   * regra escrita na camada errada perde para o `text-[9px]` da chamada sem dar
   * erro nenhum.
   */
  test("a regra pega mesmo no browser, a 1280 px", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));
    await esperarPeloBackOffice(page);

    const medidos = await page.evaluate(() => {
      const classes = ["text-[7px]", "text-[8px]", "text-[9px]", "text-[10px]", "text-[11px]"];
      const saida: Record<string, number> = {};
      for (const c of classes) {
        const el = document.createElement("span");
        el.className = c;
        el.textContent = "sonda";
        document.body.appendChild(el);
        saida[c] = parseFloat(getComputedStyle(el).fontSize);
        el.remove();
      }
      return saida;
    });

    // Levantados em qualquer largura: abaixo de 10 px não é texto denso.
    expect(medidos["text-[7px]"], JSON.stringify(medidos)).toBeGreaterThanOrEqual(11.5);
    expect(medidos["text-[8px]"], JSON.stringify(medidos)).toBeGreaterThanOrEqual(11.5);
    expect(medidos["text-[9px]"], JSON.stringify(medidos)).toBeGreaterThanOrEqual(11.5);

    // E os outros dois NÃO — são o registo denso do computador, e mexer-lhes
    // mudava a densidade da tabela sem ninguém pedir.
    expect(medidos["text-[10px]"], JSON.stringify(medidos)).toBeLessThan(11.5);
    expect(medidos["text-[11px]"], JSON.stringify(medidos)).toBeLessThan(11.5);
  });

  test("e no telemóvel a sonda dá 12 px a todos os cinco", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    exigirLogin(await entrarNoBackOffice(page));
    await esperarPeloBackOffice(page);

    const medidos = await page.evaluate(() => {
      const saida: Record<string, number> = {};
      for (const c of ["text-[7px]", "text-[8px]", "text-[9px]", "text-[10px]", "text-[11px]"]) {
        const el = document.createElement("span");
        el.className = c;
        el.textContent = "sonda";
        document.body.appendChild(el);
        saida[c] = parseFloat(getComputedStyle(el).fontSize);
        el.remove();
      }
      return saida;
    });

    for (const [classe, px] of Object.entries(medidos)) {
      expect(
        px,
        `${classe} deu ${px}px no telemóvel — ${JSON.stringify(medidos)}`,
      ).toBeGreaterThanOrEqual(11.5);
    }
  });

  test("nenhum nó de texto desce abaixo de 10 px a 1280 px — o 8 e o 9 desapareceram", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));
    await esperarPeloBackOffice(page);

    // A Visão Geral e a lista de Pedidos: os dois ecrãs onde a análise contou
    // mais nós pequenos (11 e 23 chamadas de 8–9 px).
    for (const destino of ["Visão Geral", "Pedidos"]) {
      await page.getByRole("button", { name: destino, exact: true }).first().click();
      await page.waitForTimeout(400);

      const pequenos = await page.evaluate((chao) => {
        const fora: { texto: string; px: number; classe: string }[] = [];
        for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
          // Só quem TEM texto próprio: um contentor herda o tamanho e contá-lo
          // dava a mesma queixa dezenas de vezes.
          const proprio = Array.from(el.childNodes).some(
            (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
          );
          if (!proprio) continue;
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) continue;
          const px = parseFloat(getComputedStyle(el).fontSize);
          if (px >= chao) continue;
          fora.push({
            texto: (el.textContent ?? "").trim().slice(0, 40),
            px,
            classe: el.className.toString().slice(0, 80),
          });
        }
        return fora;
      }, CHAO_COMPUTADOR);

      expect(
        pequenos,
        `${destino}: ${pequenos.length} nós abaixo de 10 px — ${JSON.stringify(pequenos.slice(0, 6))}`,
      ).toEqual([]);
    }
  });

  /**
   * E NO TELEMÓVEL O CHÃO É O COMPLETO — os 12 px.
   *
   * É a regra que já existia, e este caso está aqui para a manter honesta: se
   * alguém a partir enquanto mexe no chão absoluto, cai aqui em vez de cair no
   * ecrã dela.
   */
  test("e no telemóvel o chão continua a ser 12 px, não 10", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    exigirLogin(await entrarNoBackOffice(page));
    await esperarPeloBackOffice(page);
    await page.waitForTimeout(400);

    const pequenos = await page.evaluate((chao) => {
      const fora: { texto: string; px: number }[] = [];
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const proprio = Array.from(el.childNodes).some(
          (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim().length > 0,
        );
        if (!proprio) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px >= chao) continue;
        fora.push({ texto: (el.textContent ?? "").trim().slice(0, 40), px });
      }
      return fora;
    }, CHAO_TELEMOVEL);

    expect(
      pequenos,
      `telemóvel: ${pequenos.length} nós abaixo de 12 px — ${JSON.stringify(pequenos.slice(0, 6))}`,
    ).toEqual([]);
  });

  /**
   * A OUTRA METADE, e a que me preocupava mais: subir 94 elementos de 8–9 para
   * 12 px numa tabela densa pode empurrar conteúdo para fora. O bloco do
   * telemóvel já tinha aprendido isto — «subir o tamanho sem desapertar o
   * espacejamento trocava letra pequena por texto transbordado» — e por isso o
   * `letter-spacing` acompanha.
   *
   * Aqui mede-se a consequência, não a intenção.
   */
  test("e a página não passa a transbordar para o lado por causa disso", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    exigirLogin(await entrarNoBackOffice(page));
    await esperarPeloBackOffice(page);

    for (const destino of ["Visão Geral", "Pedidos"]) {
      await page.getByRole("button", { name: destino, exact: true }).first().click();
      await page.waitForTimeout(400);
      const transborda = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(transborda, `${destino} transborda ${transborda}px para o lado`).toBeLessThanOrEqual(
        1,
      );
    }
  });
});
