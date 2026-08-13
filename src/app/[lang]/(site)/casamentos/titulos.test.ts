import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { generateMetadata as metaPolo } from "./[polo]/page";
import { generateMetadata as metaEstilo } from "./estilo/[estilo]/page";
import { generateMetadata as metaDestination } from "./destination/page";
import { POLOS, ESTILOS } from "@/lib/ads/polos";
import { LOCALES } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MARCA APARECIA DUAS VEZES NO TÍTULO DAS PÁGINAS DE CAMPANHA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO no HTML construído (`.next/server/app/pt/casamentos/alentejo.html`),
 * antes da correcção:
 *
 *   <title>Casamentos em Herdades do Alentejo | Líquen Events | Líquen Events</title>
 *
 * e o mesmo em `og:title`. Aconteceu nas 17 páginas deste ramo — 13 polos, 3
 * estilos e a de destination —, vezes dois idiomas: 34 endereços.
 *
 * PORQUÊ. O `metaTitle` do catálogo (src/lib/ads/polos.ts) já foi escrito COM
 * a marca lá dentro, porque é ele que se quer ver no resultado da pesquisa. Ao
 * ser entregue como `title` de texto simples, aplica-se-lhe por cima o modelo
 * do layout de raiz — `template: "%s | Líquen Events"` — e a marca sai
 * escrita duas vezes.
 *
 * NÃO É COSMÉTICO. A Google mostra ~580 px de título; "…| Líquen Events |
 * Líquen Events" gasta 17 caracteres a repetir o que já lá estava e empurra o
 * resto para fora do corte. E são precisamente as páginas que recebem tráfego
 * PAGO, onde o título é metade do que decide o clique.
 *
 * A correcção é `title: { absolute: … }`, que é o que o Next tem para dizer
 * "este título já está pronto, não lhe apliques o modelo" — e o `ogTitle`
 * explícito, pela mesma razão, no cartão social.
 */

/** O modelo declarado em src/app/[lang]/layout.tsx (guardado abaixo). */
const MODELO = " | Líquen Events";
/**
 * Conta-se "Líquen" e não "Líquen Events": metade destes títulos abrevia a
 * marca para caber ("… | Líquen"), e aí a repetição saía como
 * "… | Líquen | Líquen Events" — que a contar o nome completo passaria
 * despercebida.
 */
const MARCA = "Líquen";

/** O que o browser acabaria por mostrar, depois de o Next aplicar o modelo. */
function tituloFinal(meta: Metadata): string {
  const t = meta.title;
  if (typeof t === "string") return t + MODELO;
  if (t && typeof t === "object" && "absolute" in t && typeof t.absolute === "string") {
    return t.absolute;
  }
  throw new Error(`título em formato inesperado: ${JSON.stringify(t)}`);
}

function vezes(texto: string, agulha: string): number {
  return texto.split(agulha).length - 1;
}

describe("títulos das páginas de campanha", () => {
  it("o layout de raiz continua a acrescentar a marca a todos os títulos simples", () => {
    // Se este modelo desaparecer, o resto deste ficheiro deixa de medir o que
    // pensa que mede — daí lê-lo do ficheiro em vez de o assumir.
    const layout = readFileSync(join(process.cwd(), "src/app/[lang]/layout.tsx"), "utf8");
    expect(layout).toContain('template: "%s | Líquen Events"');
  });

  const casos: Array<{ nome: string; meta: () => Promise<Metadata> }> = [];
  for (const lang of LOCALES) {
    for (const p of POLOS) {
      casos.push({
        nome: `/${lang}/casamentos/${p.slug}`,
        meta: () => metaPolo({ params: Promise.resolve({ lang, polo: p.slug }) }),
      });
    }
    for (const e of ESTILOS) {
      casos.push({
        nome: `/${lang}/casamentos/estilo/${e.slug}`,
        meta: () => metaEstilo({ params: Promise.resolve({ lang, estilo: e.slug }) }),
      });
    }
    casos.push({
      nome: `/${lang}/casamentos/destination`,
      meta: () => metaDestination({ params: Promise.resolve({ lang }) }),
    });
  }

  it.each(casos)("$nome escreve a marca uma só vez no <title>", async ({ meta }) => {
    const m = await meta();
    const titulo = tituloFinal(m);
    expect(vezes(titulo, MARCA), `<title> saiu "${titulo}"`).toBe(1);
  });

  it.each(casos)("$nome escreve a marca uma só vez no og:title", async ({ meta }) => {
    const m = await meta();
    const og = (m.openGraph as { title?: string } | undefined)?.title ?? "";
    expect(vezes(og, MARCA), `og:title saiu "${og}"`).toBe(1);
  });
});
