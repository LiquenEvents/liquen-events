import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { POLOS, ESTILOS } from "./polos";
import { HERO_SOURCES } from "@/lib/hero-image-loader";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS HERÓIS DAS LANDING PAGES TÊM DE ESTAR REGISTADOS COMO HERÓIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ESTA É A LACUNA QUE O PRÓPRIO REPOSITÓRIO JÁ TINHA DECLARADA. Em
 * `hero-image-loader.ts` está escrito, por quem a criou: "acrescentar uma
 * fotografia de largura total nova sem a pôr aqui fá-la funcionar, mas suave.
 * A rede de segurança das imagens apanha uma imagem que NÃO APARECE, não uma
 * que apareça menos nítida do que devia."
 *
 * Era uma lista mantida à mão sem nada que a ligasse ao código que a consome.
 * Nas páginas de campanha isso custa dinheiro directo — o herói é o candidato
 * a LCP de uma página que recebe tráfego PAGO, e o Índice de Qualidade da
 * Google depende da velocidade da página de destino: uma landing page lenta
 * faz subir o custo por clique de TODA a campanha, não só o daquele anúncio.
 *
 * Este teste fecha a lacuna para o catálogo de polos: acrescentar um polo com
 * um herói por registar passa a falhar o CI, com a instrução do que fazer.
 * Não fecha para o resto do site (as ~30 fotografias de largura total
 * continuam à mão) — fecha para as páginas onde o custo é medido em euros.
 */

const LOADER = "src/lib/hero-image-loader.ts";
const PREGEN = "scripts/pregen-heroes.mjs";

/** Todos os heróis do catálogo, com o dono à frente para a mensagem de erro. */
const HEROIS = [
  ...POLOS.map((p) => ({ dono: `polo "${p.slug}"`, src: p.hero })),
  ...ESTILOS.map((e) => ({ dono: `estilo "${e.slug}"`, src: e.hero })),
];

describe("heróis das landing pages", () => {
  it("não passa por vacuidade", () => {
    expect(HEROIS.length).toBeGreaterThanOrEqual(11);
  });

  it.each(HEROIS)("$dono: $src está em HERO_SOURCES", ({ src }) => {
    expect(
      HERO_SOURCES.has(src),
      `${src} é desenhado a sizes="100vw" numa landing page paga, mas não está ` +
        `em HERO_SOURCES (${LOADER}). Sem isso o herói é servido pela escada das ` +
        "fotos comuns e fica suave no ecrã grande — a página funciona, e ninguém " +
        "repara. Acrescenta o caminho às DUAS listas: a deste módulo e a de " +
        `${PREGEN}.`,
    ).toBe(true);
  });

  // O gerador é um .mjs e não consegue importar o TS, por isso as duas listas
  // são independentes. Já existe um teste que as compara uma à outra; este
  // verifica o lado que interessa a esta funcionalidade — que os heróis do
  // catálogo têm mesmo ficheiros gerados — para o erro apontar directamente à
  // causa em vez de aparecer como uma divergência genérica entre listas.
  it.each(HEROIS)("$dono: $src está na lista do gerador", ({ src }) => {
    const script = readFileSync(join(process.cwd(), PREGEN), "utf8");
    const bloco = /const HERO_SOURCES = \[([\s\S]*?)\];/.exec(script)?.[1];
    expect(bloco, `não encontrei HERO_SOURCES em ${PREGEN}`).toBeTruthy();
    expect(
      bloco!.includes(`"${src}"`),
      `${src} não está em ${PREGEN}, por isso os WebP dele nunca são gerados e ` +
        "o loader aponta para ficheiros que não existem.",
    ).toBe(true);
  });
});
