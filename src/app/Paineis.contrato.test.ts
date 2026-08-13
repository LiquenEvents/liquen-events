import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CONTRATO DOS PAINÉIS QUE SALTAM RENDERIZAÇÃO (`content-visibility: auto`)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. `content-visibility: auto` diz ao browser para não desenhar
 * uma secção enquanto ela está fora do ecrã. Em troca, ELE precisa de saber que
 * espaço lhe há-de guardar — o `contain-intrinsic-size`. Se esse espaço não for
 * igual à altura real, a página muda de tamanho no instante em que a secção é
 * finalmente desenhada, e o conteúdo salta debaixo do dedo de quem está a
 * descer.
 *
 * Não é hipotético. Foi medido, num Pixel 7 emulado:
 *
 *   · `/servicos` encolhia 576 px na primeira descida. A banda de serviço mede
 *     `46svh` (≈386 px) no telemóvel e reservava `clamp(480px,60vh,680px)`
 *     (≈503 px) — o valor de computador, escrito à parte do da altura. 117 px a
 *     mais, oito bandas.
 *   · `/` encolhia 224 px. O painel de fecho levava `py-28` E o
 *     `contain-intrinsic-size` igual ao `min-height` — mas o
 *     `contain-intrinsic-size` é o tamanho da caixa de CONTEÚDO, portanto o
 *     painel saltado media `560+224` e o desenhado `560`.
 *
 * O comentário que lá estava dizia que o `auto` do `contain-intrinsic-size` se
 * auto-corrigia "so no scroll-jump". Corrige — mas só DEPOIS de renderizar a
 * secção uma vez, ou seja a correcção inteira é paga exactamente na primeira
 * descida, que é a única que interessa.
 *
 * PORQUE NÃO APARECEU ANTES. O Chromium tem âncora de scroll: absorve uma
 * mudança de altura acima do ecrã ajustando o `scrollY` no mesmo instante. O
 * Safari do iPhone não a implementa — é lá que isto se vê, e é de lá que veio a
 * queixa.
 *
 * O QUE ESTE FICHEIRO GARANTE. Que a altura e o espaço reservado continuam a
 * ser O MESMO SÍTIO. `.cv-panel` (globals.css) deriva ambos de `--cv-h`, e este
 * teste obriga a que:
 *
 *   1. ninguém volte a escrever `content-visibility` à mão numa página (era
 *      assim que os dois valores se separavam);
 *   2. todo o `.cv-panel` defina `--cv-h`;
 *   3. nenhum `.cv-panel` leve padding vertical NELE PRÓPRIO (o padding vai num
 *      filho — foi essa a origem dos 224 px).
 *
 * NOTA sobre bordas: `border-t` acrescenta 1 px à caixa desenhada que a reserva
 * não conta. É real e é 1 px; não vale restruturar marcação por isso, por isso
 * a regra 3 fala só de padding, que é o que produz erros de centenas de pixels.
 */

const RAIZ = join(process.cwd(), "src/app");

function ficheirosTsx(dir: string, fora: string[] = []): string[] {
  for (const nome of readdirSync(dir)) {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) ficheirosTsx(caminho, fora);
    else if (/\.tsx$/.test(nome) && !/\.test\.tsx$/.test(nome)) fora.push(caminho);
  }
  return fora;
}

const paginas = ficheirosTsx(RAIZ).map((f) => ({ f, src: readFileSync(f, "utf8") }));
const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** Todas as `className` do ficheiro que contêm `cv-panel`. */
function classesCvPanel(src: string): string[] {
  const fora: string[] = [];
  for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
    const valor = m[1] ?? m[2] ?? "";
    if (/\bcv-panel\b/.test(valor)) fora.push(valor);
  }
  return fora;
}

describe("painéis com content-visibility: o espaço reservado tem de bater com a altura real", () => {
  it("`.cv-panel` tira a altura, a altura mínima e a reserva da MESMA variável", () => {
    const bloco = /\.cv-panel\s*\{([^}]*)\}/.exec(css)?.[1];
    expect(bloco, "a regra .cv-panel desapareceu de globals.css").toBeTruthy();

    const min = /min-height:\s*([^;]+);/.exec(bloco!)?.[1]?.trim();
    const reserva = /contain-intrinsic-size:\s*auto\s+([^;]+);/.exec(bloco!)?.[1]?.trim();

    expect(bloco).toMatch(/content-visibility:\s*auto/);
    // O ponto todo do exercício: se estas duas expressões alguma vez deixarem
    // de ser LITERALMENTE a mesma, os dois valores voltam a poder divergir.
    expect(min).toBeTruthy();
    expect(reserva).toBe(min);
    // E têm de ler a variável — um valor fixo aqui não acompanharia o `--cv-h`
    // que cada painel define.
    expect(min).toMatch(/var\(--cv-h/);
  });

  it("`.cv-panel` pinta um fundo próprio — senão a caixa saltada mostra o branco do corpo", () => {
    // A QUEIXA QUE ISTO PRENDE: «quando faço scroll e depois volto para cima, as
    // imagens começam a piscar brancas». O `content-visibility: auto` salta o
    // CONTEÚDO, não o elemento: enquanto a fotografia não volta a desenhar, o
    // que se vê é o fundo do painel — e sem fundo nenhum vê-se o corpo do
    // sítio, que é #ffffff. A subida é onde isso aparece, porque a secção entra
    // no ecrã já quase inteira. Medido com `e2e/piscar-subida.mjs`.
    const bloco = /\.cv-panel\s*\{([^}]*)\}/.exec(css)?.[1];
    const fundo = /background-color:\s*([^;]+);/.exec(bloco!)?.[1]?.trim();
    expect(fundo, "sem `background-color`, o painel saltado volta a piscar branco").toBeTruthy();
    // Sobreponível por painel, como o `--cv-h`: um painel de fundo claro tem de
    // poder dizê-lo sem deixar de ter fundo.
    expect(fundo).toMatch(/var\(--cv-bg/);
  });

  it("nenhuma página escreve content-visibility à mão — passa toda pelo .cv-panel", () => {
    const infractores = paginas
      .filter(({ src }) => /contentVisibility|content-visibility:\s*auto/.test(src))
      // Comentários que só FALAM do assunto não contam; procura-se a
      // propriedade a ser de facto escrita num estilo.
      .filter(({ src }) => /contentVisibility\s*:/.test(src))
      .map(({ f }) => f);

    expect(
      infractores,
      "escrever content-visibility à mão separa outra vez a altura da reserva; usa a classe .cv-panel e define --cv-h",
    ).toEqual([]);
  });

  it("todo o .cv-panel define --cv-h", () => {
    const semVariavel: string[] = [];
    for (const { f, src } of paginas) {
      for (const cls of classesCvPanel(src)) {
        if (!/\[--cv-h:/.test(cls)) semVariavel.push(`${f} :: ${cls}`);
      }
    }
    expect(
      semVariavel,
      "sem --cv-h o painel cai na altura de recurso da classe, que não é a dele",
    ).toEqual([]);
  });

  it("nenhum .cv-panel leva padding vertical em si próprio", () => {
    // `py-*`, `pt-*` e `pb-*` — com ou sem prefixo de ecrã (`lg:py-40`).
    const PADDING_VERTICAL = /(?:^|\s)(?:[a-z0-9-]+:)*p[ytb]-/;
    const comPadding: string[] = [];
    for (const { f, src } of paginas) {
      for (const cls of classesCvPanel(src)) {
        if (PADDING_VERTICAL.test(cls)) comPadding.push(`${f} :: ${cls}`);
      }
    }
    expect(
      comPadding,
      "o contain-intrinsic-size é a caixa de CONTEÚDO: padding aqui soma-se à altura desenhada e não à reservada. Põe o padding num filho.",
    ).toEqual([]);
  });

  it("as páginas que tinham o defeito medido usam mesmo a classe", () => {
    // Uma rede contra o modo de falha mais estúpido deste ficheiro: alguém
    // apagar os painéis todos e os testes acima passarem por vacuidade.
    const usam = paginas.filter(({ src }) => /\bcv-panel\b/.test(src)).map(({ f }) => f);
    expect(usam.some((f) => f.endsWith(join("servicos", "page.tsx")))).toBe(true);
    // A página inicial vive em `[lang]/(site)/page.tsx` desde que o cromado do
    // sítio passou a ser um grupo de rotas — `(site)` não aparece no URL, mas
    // aparece no caminho do ficheiro.
    expect(usam.some((f) => f.endsWith(join("(site)", "page.tsx")))).toBe(true);
    expect(usam.length).toBeGreaterThanOrEqual(4);
  });
});
