import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";

import { generateMetadata as metaProposta } from "../(privado)/proposta/[token]/page";
import { generateMetadata as metaPortal } from "./portal/[token]/page";
import { LOCALES } from "@/lib/i18n";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MARCA APARECIA DUAS VEZES NO SEPARADOR DAS DUAS PÁGINAS DO CLIENTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO com o sítio a correr, num Chromium a abrir os endereços com um token
 * que não resolve (o caminho por onde a página cai na língua do visitante):
 *
 *   /proposta/<token>     <title>A sua proposta | Líquen Events | Líquen Events</title>
 *   /en/proposta/<token>  <title>Your proposal | Líquen Events | Líquen Events</title>
 *   /portal/<token>       <title>Portal do Cliente da Líquen Events | Líquen Events</title>
 *   /en/portal/<token>    <title>Líquen Events Client Portal | Líquen Events</title>
 *
 * PORQUÊ. É o mesmo mecanismo que `casamentos/titulos.test.ts` já documenta e
 * prende para as 34 páginas de campanha: os quatro textos foram escritos COM a
 * marca lá dentro (é o nome próprio do documento — «A sua proposta | Líquen
 * Events»), e entregá-los como `title` de texto simples faz o layout de raiz
 * aplicar-lhes por cima o seu `template: "%s | Líquen Events"`.
 *
 * PORQUE É QUE AQUI CUSTA OUTRA COISA. Estas duas páginas são `noindex`,
 * portanto não há SERP nenhuma para cortar o título. O que há é um casal que
 * abre um link vindo de um email para ler uma proposta de vários milhares de
 * euros, e um cliente que VOLTA ao portal para ver se o pagamento já entrou —
 * duas páginas cujo separador é o que se reconhece entre dez abertos e o que
 * fica escrito no marcador de quem as guarda.
 *
 * A correcção é `title: { absolute: … }`, que é o que o Next tem para dizer
 * «este título já está pronto, não lhe apliques o modelo».
 */

/** O modelo declarado em src/app/[lang]/layout.tsx (lido, não assumido). */
const MODELO = " | Líquen Events";
/** Conta-se «Líquen» e não o nome completo — ver a razão em casamentos/titulos.test.ts. */
const MARCA = "Líquen";

/** O que o browser acaba por mostrar, depois de o Next aplicar (ou não) o modelo. */
function tituloFinal(meta: Metadata): string {
  const t = meta.title;
  if (typeof t === "string") return t + MODELO;
  if (t && typeof t === "object" && "absolute" in t && typeof t.absolute === "string") {
    return t.absolute;
  }
  throw new Error(`título em formato inesperado: ${JSON.stringify(t)}`);
}

const vezes = (texto: string, agulha: string) => texto.split(agulha).length - 1;

describe("títulos das páginas que o cliente abre por link", () => {
  it("o layout de raiz continua a acrescentar a marca a todos os títulos simples", () => {
    // Sem este modelo, o resto do ficheiro deixa de medir o que pensa que mede.
    const layout = readFileSync(join(process.cwd(), "src/app/[lang]/layout.tsx"), "utf8");
    expect(layout).toContain('template: "%s | Líquen Events"');
  });

  // Um token que não resolve: é o ramo que devolve a língua do VISITANTE, e é o
  // único que se pode exercitar sem um armazenamento montado. O título não
  // depende de a proposta existir — depende só da língua com que se sai daqui —,
  // por isso este caminho mede as quatro combinações que interessam.
  const casos = LOCALES.flatMap((lang) => [
    {
      nome: `/${lang}/proposta/[token]`,
      meta: () => metaProposta({ params: Promise.resolve({ lang, token: "nao-resolve" }) }),
    },
    {
      nome: `/${lang}/portal/[token]`,
      meta: () => metaPortal({ params: Promise.resolve({ lang, token: "nao-resolve" }) }),
    },
  ]);

  it.each(casos)("$nome escreve a marca uma só vez no <title>", async ({ meta }) => {
    const titulo = tituloFinal(await meta());
    expect(vezes(titulo, MARCA), `<title> saiu "${titulo}"`).toBe(1);
  });

  it.each(casos)("$nome não se deixa indexar", async ({ meta }) => {
    const robots = (await meta()).robots as { index?: boolean } | undefined;
    expect(robots?.index).toBe(false);
  });
});
