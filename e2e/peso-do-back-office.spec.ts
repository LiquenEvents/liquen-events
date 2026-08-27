import { test, expect } from "@playwright/test";
import { entrarNoBackOffice, exigirLogin, garantirPedido } from "./semear-pedido";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O BACK OFFICE PESA, MEDIDO — E UM TECTO PARA NÃO ENGORDAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «Eu quero mesmo que trabalhes de forma a ficarem ultra rápidas.»
 *
 * ── PORQUE É QUE ISTO NÃO EXISTIA ─────────────────────────────────────────
 *
 * Os orçamentos de desempenho da casa (o `lighthouserc.json`) medem SEIS
 * páginas, e são todas do sítio público: a entrada, os serviços, o contacto,
 * os clientes, a galeria e o sobre. O back office não está lá, e a página da
 * proposta também não.
 *
 * Ou seja: as duas coisas que ela diz serem lentas — o painel que abre todos os
 * dias no telemóvel, e a proposta que o casal abre — nunca foram medidas por
 * ninguém. Uma regressão de peso ali não punha nada vermelho.
 *
 * ── O QUE SE MEDE, E PORQUÊ NÃO SÃO MILISSEGUNDOS ─────────────────────────
 *
 * BYTES e NÚMERO DE PEDIDOS, não tempo. O tempo desta máquina não diz nada
 * sobre o telemóvel dela num 4G de quinta — mas os bytes que se mandam são os
 * mesmos nos dois sítios, e são eles que se pagam na linha lenta. Um teto em
 * milissegundos seria um teste que passa hoje e falha na máquina ocupada de
 * amanhã; um teto em bytes só falha quando alguém acrescenta peso.
 *
 * ── OS NÚMEROS DE PARTIDA ─────────────────────────────────────────────────
 *
 * Medidos contra `npm run build && npm run start`, nesta máquina, com a
 * Visão Geral montada e um pedido semeado:
 *
 *     JavaScript   274 KB   em 18 ficheiros
 *     CSS           34 KB   em 2
 *     Letra         85 KB   em 2 (Inter e Playfair, já subconjuntadas)
 *     ─────────────────────
 *     total        ~403 KB
 *
 * Os tectos abaixo têm folga sobre estes valores — o suficiente para uma
 * funcionalidade nova não os pôr vermelhos por dar, e apertado o bastante para
 * uma biblioteca nova a entrar sem querer não passar despercebida.
 */

/** Tectos, em kilobytes comprimidos. */
const TECTO = { js: 380, css: 60, letra: 120, total: 560 };
/** E um teto de PEDIDOS: cada um custa uma ida e volta na linha dela. */
const TECTO_PEDIDOS = 34;

test("@desempenho o painel não engorda sem alguém dar por isso", async ({ page }) => {
  exigirLogin(await entrarNoBackOffice(page));
  await garantirPedido(page);
  await page.goto("/orcamento/admin", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: /Visão Geral/ })).toBeVisible();

  const medida = await page.evaluate(() => {
    const rs = performance.getEntriesByType("resource") as PerformanceResourceTiming[];
    const kb = (filtro: (r: PerformanceResourceTiming) => boolean) =>
      Math.round(
        rs.filter(filtro).reduce((s, r) => s + (r.encodedBodySize || r.transferSize || 0), 0) /
          1024,
      );
    const ehLetra = (r: PerformanceResourceTiming) => /\.woff2?(\?|$)/.test(r.name);
    const ehJs = (r: PerformanceResourceTiming) => /\.js(\?|$)/.test(r.name);
    const ehCss = (r: PerformanceResourceTiming) => /\.css(\?|$)/.test(r.name);
    return {
      js: kb(ehJs),
      css: kb(ehCss),
      letra: kb(ehLetra),
      total: kb(() => true),
      pedidos: rs.length,
      ficheirosJs: rs.filter(ehJs).length,
    };
  });

  const relatorio = JSON.stringify(medida);
  expect(
    medida.pedidos,
    `o painel passou a pedir ${medida.pedidos} ficheiros (teto ${TECTO_PEDIDOS}). ${relatorio}`,
  ).toBeLessThanOrEqual(TECTO_PEDIDOS);

  for (const [nome, teto] of Object.entries(TECTO) as [keyof typeof TECTO, number][]) {
    expect(
      medida[nome],
      `o painel passou a mandar ${medida[nome]} KB de ${nome} (teto ${teto}). Na linha dela, ` +
        `cada 100 KB são meio segundo. ${relatorio}`,
    ).toBeLessThanOrEqual(teto);
  }

  // E o contrário: zero é uma medição falhada, não uma página leve.
  expect(
    medida.js,
    `medi 0 KB de JavaScript — a medição não apanhou nada. ${relatorio}`,
  ).toBeGreaterThan(50);
});
