import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextConfig from "../next.config";

/**
 * CONTRATO DA CSP — a invariante que impede o estrago silencioso.
 *
 * Um teste que confirme a STRING da política não vale quase nada: a política
 * pode estar escrita na perfeição e a página continuar partida. Foi medido:
 * com `script-src 'self' 'nonce-…' 'strict-dynamic'` emitido no proxy, a
 * /galeria servida da cache de prerender traz 43 <script> e ZERO com nonce, o
 * browser recusa 42 deles, a hidratação nunca corre e o
 * `history.scrollRestoration` fica em "auto". A página desenha-se toda à mesma
 * (o HTML estático está lá), nenhum teste de unidade acusa nada, e o restauro
 * da posição na galeria — que é o que aquele <script> existe para garantir —
 * deixa de funcionar sem uma única mensagem de erro.
 *
 * Por isso o que se prende aqui é a LIGAÇÃO entre as duas pontas:
 *
 *   se a `script-src` alguma vez trouxer um nonce,
 *   então o <script> embutido de src/app/[lang]/galeria/page.tsx
 *   TEM de o estar a receber.
 *
 * Enquanto a política não tiver nonce (o estado actual e deliberado — ver a
 * nota longa em next.config.ts), o teste passa sem exigir nada. No dia em que
 * alguém acrescentar o nonce sem tratar da galeria, falha aqui em vez de falhar
 * em produção.
 */

const GALERIA_PAGE = fileURLToPath(new URL("./app/[lang]/galeria/page.tsx", import.meta.url));

async function scriptSrc(): Promise<string> {
  const groups = await nextConfig.headers!();
  const all = groups.flatMap((g) => g.headers);
  const csp = all.find((h) => h.key === "Content-Security-Policy");
  expect(csp, "next.config.ts tem de emitir uma Content-Security-Policy").toBeTruthy();
  const directive = csp!.value
    .split(";")
    .map((d) => d.trim())
    .find((d) => d.startsWith("script-src"));
  expect(directive, "a CSP tem de ter uma directiva script-src explícita").toBeTruthy();
  return directive!;
}

describe("contrato CSP × script embutido da galeria", () => {
  it("se a script-src usar nonce, o script da galeria tem de receber o nonce", async () => {
    const directive = await scriptSrc();
    const usaNonce = /'nonce-/.test(directive) || /'strict-dynamic'/.test(directive);
    if (!usaNonce) return; // estado actual: nada a exigir.

    const page = readFileSync(GALERIA_PAGE, "utf8");
    // O <script> que põe scrollRestoration='manual'. Se a política passou a
    // exigir nonce, esta tag tem de o levar — o React NÃO o injecta sozinho num
    // dangerouslySetInnerHTML escrito pela aplicação (medido).
    const tag = page.match(/<script\b[\s\S]*?scrollRestoration[\s\S]*?\/>/);
    expect(
      tag,
      "não encontrei o <script> do scrollRestoration em galeria/page.tsx — se foi movido, este contrato tem de o acompanhar",
    ).toBeTruthy();
    expect(
      /\bnonce=/.test(tag![0]),
      "a CSP passou a exigir nonce mas o <script> do scrollRestoration não o recebe: " +
        "o restauro da posição da galeria vai falhar EM SILÊNCIO (medido: scrollRestoration fica 'auto')",
    ).toBe(true);
  });

  it("uma política com nonce obriga a galeria a sair da renderização estática", async () => {
    const directive = await scriptSrc();
    if (!/'nonce-/.test(directive) && !/'strict-dynamic'/.test(directive)) return;

    // O nonce só é aplicado durante a renderização; uma página pré-renderizada
    // no build é servida da cache (`x-nextjs-cache: HIT`) com o HTML de sempre,
    // sem nonce nenhum. Sem `connection()`/`force-dynamic` a galeria continua
    // estática e a política nova bloqueia-lhe todos os scripts.
    const page = readFileSync(GALERIA_PAGE, "utf8");
    expect(
      /\bconnection\(\)|force-dynamic|dynamic\s*=\s*["']force-dynamic["']/.test(page),
      "a CSP passou a exigir nonce mas /galeria continua pré-renderizada — o HTML da cache não tem nonce e o browser recusa os 43 <script> da página",
    ).toBe(true);
  });

  it("script-src não traz 'unsafe-eval' em produção", async () => {
    // 'unsafe-eval' é só do modo de desenvolvimento (React refresh). Os testes
    // correm com NODE_ENV=test, que o next.config trata como não-produção, por
    // isso confirma-se o ramo de produção pela própria expressão.
    const cfg = readFileSync(fileURLToPath(new URL("../next.config.ts", import.meta.url)), "utf8");
    expect(cfg).toMatch(/isDev \? " 'unsafe-eval'" : ""/);
  });
});

describe("Permissions-Policy", () => {
  it("desliga a Topics API, não só o FLoC que já morreu", async () => {
    const groups = await nextConfig.headers!();
    const pp = groups.flatMap((g) => g.headers).find((h) => h.key === "Permissions-Policy");
    expect(pp).toBeTruthy();
    // `interest-cohort` é um nome morto desde que o FLoC saiu do Chrome: o
    // analisador aceita-o, portanto NÃO dá erro na consola e parece estar a
    // fazer alguma coisa. Quem lhe sucedeu é `browsing-topics`, e é essa que
    // tem de estar fechada — medido no Chromium: antes desta correcção,
    // document.featurePolicy.allowsFeature("browsing-topics") === true.
    expect(pp!.value).toMatch(/(^|,\s*)browsing-topics=\(\)/);
    for (const f of ["camera", "microphone", "geolocation", "payment", "usb", "serial", "hid"]) {
      expect(pp!.value, `${f} devia estar desligada`).toMatch(new RegExp(`(^|,\\s*)${f}=\\(\\)`));
    }
  });
});
