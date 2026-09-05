import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NINGUÉM ROLA A PÁGINA À FORÇA A QUEM PEDIU PARA NÃO ANIMAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── O DEFEITO QUE ISTO FECHA ──────────────────────────────────────────────
 *
 * O `globals.css` declara `html { scroll-behavior: smooth }` e desliga-o dentro
 * de `@media (prefers-reduced-motion: reduce)` — está certo, e é assim que as
 * âncoras e as chamadas sem argumento obedecem à preferência sem ninguém pensar
 * nisso.
 *
 * `scrollIntoView({ behavior: "smooth" })` escrito em JavaScript passa POR CIMA
 * dessa regra: pela especificação, o `behavior` do argumento só cede ao
 * `scroll-behavior` do CSS quando vale `"auto"`. Havia SETE chamadas assim no
 * back office (mais um `window.scrollBy`), e todas arrastavam o ecrã de quem
 * tem enjoo de movimento — de toda a gramática de movimento da casa, o gesto
 * que pior lhe cai.
 *
 * ── PORQUE É QUE ISTO É UMA VARREDURA E NÃO OITO TESTES ───────────────────
 *
 * Porque o defeito não é nenhuma daquelas oito linhas: é não haver nada a
 * impedir a nona. Oito testes pontuais provam oito correcções e não dizem uma
 * palavra sobre o `scrollIntoView` que alguém escreve amanhã — e a prova de que
 * este risco é real está no próprio ficheiro que a correcção criou: quando isto
 * se escreveu já havia DUAS leituras da preferência no back office, com dois
 * nomes e dois corpos diferentes (a partilhada, no `DossierClient`, e uma cópia
 * local dentro do `ThemePicker`). Divergiram sozinhas, sem ninguém reparar.
 *
 * Em JavaScript não há `motion-safe:` — essa variante é do Tailwind e vive no
 * CSS. A preferência LÊ-SE, e lê-se num sítio só: `lib/motion/rolar.ts`.
 *
 * ── O QUE ESTA REGRA NÃO PROÍBE ───────────────────────────────────────────
 *
 * `scrollIntoView({ block: "nearest" })`, sem `behavior` nenhum. Essa herda o
 * `scroll-behavior` da folha de estilos, ou seja JÁ obedece à preferência —
 * escrever-lhe um `behavior` à força seria mudar o comportamento de quem não
 * pediu nada. A regra é sobre quem DECIDE em JavaScript: quem decide, decide
 * pela porta partilhada.
 */

const RAIZ = new URL("../../../../../../", import.meta.url).pathname;
const BACK_OFFICE = join(RAIZ, "src/app/[lang]/(admin)");
const PORTA = join(RAIZ, "src/lib/motion/rolar.ts");

/** Todo o `.ts`/`.tsx` do back office que não é um teste. */
async function fontes(dir: string): Promise<string[]> {
  const encontrados: string[] = [];
  for (const entrada of await readdir(dir, { withFileTypes: true })) {
    const caminho = join(dir, entrada.name);
    if (entrada.isDirectory()) {
      encontrados.push(...(await fontes(caminho)));
      continue;
    }
    if (!/\.tsx?$/.test(entrada.name)) continue;
    if (/\.test\.tsx?$/.test(entrada.name)) continue;
    encontrados.push(caminho);
  }
  return encontrados;
}

/**
 * `behavior` seguido de `"smooth"` LITERAL. Não apanha (nem quer apanhar)
 * `behavior: comportamentoDoRolo()` nem um ternário que pergunte a preferência
 * — apanha quem decidiu por toda a gente sem perguntar.
 */
const A_FORCA = /behavior\s*:\s*(["'])smooth\1/;

describe("o rolo do back office pergunta antes de animar", () => {
  it('nenhuma fonte do back office escreve `behavior: "smooth"` à mão', async () => {
    const ficheiros = await fontes(BACK_OFFICE);
    // CONTROLO POSITIVO: a varredura está mesmo a ler ficheiros. Sem isto, um
    // caminho errado dava uma lista vazia e um verde que não queria dizer nada.
    expect(ficheiros.length).toBeGreaterThan(50);

    const culpados: string[] = [];
    for (const ficheiro of ficheiros) {
      const texto = await readFile(ficheiro, "utf8");
      texto.split("\n").forEach((linha, i) => {
        if (A_FORCA.test(linha)) culpados.push(`${relative(RAIZ, ficheiro)}:${i + 1}`);
      });
    }

    expect(
      culpados,
      'Um `behavior: "smooth"` escrito à mão anima para quem pediu para não ' +
        "animar — o `behavior` do argumento ganha ao `scroll-behavior` que o " +
        "globals.css já desliga em `prefers-reduced-motion`. Usa " +
        "`rolarAteVer`/`rolarAJanela` de `@/lib/motion/rolar`.\n" +
        culpados.join("\n"),
    ).toEqual([]);
  });

  it("e a porta partilhada existe mesmo, e é ela que lê a preferência", async () => {
    // O contrário do teste de cima: proibir a cadeia em todo o lado seria
    // fácil de satisfazer apagando o rolo suave a TODA A GENTE — verde, e com
    // o produto pior. O que se quer é que ele continue a existir para quem não
    // pediu nada, e que a decisão viva num sítio só. Que ela esteja CERTA
    // prova-se a correr, em `src/lib/motion/rolar.test.ts`.
    const porta = await readFile(PORTA, "utf8");
    expect(porta).toMatch(/prefersReducedMotion\(\)/);
    expect(porta).toMatch(/export function rolarAteVer/);
    expect(porta).toMatch(/export function rolarAJanela/);
  });
});
