import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A FITA DOS CLIENTES — AS TRÊS COISAS QUE ESTAVAM ERRADAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela mandou o site de um estúdio que gosta e disse que a fita deles é melhor
 * do que a nossa: mais rápida, e sem o botão de parar. A medir, o que se
 * encontrou foi pior — e melhor — do que «lenta».
 *
 * ── 1. O CICLO NUNCA FECHOU ──────────────────────────────────────────────
 *
 * Num `transform`, uma percentagem é da largura de CAIXA do elemento, não do
 * conteúdo. A fita vivia dentro de uma banda `overflow-hidden`, portanto a
 * caixa media a janela e o conteúdo transbordava. MEDIDO a 1440 px:
 *
 *     caixa 1440 px → o `-50%` deslocava 720 px
 *     uma cópia dos clientes: 2558 px
 *
 * Andava 720 e voltava ao princípio: um SALTO de 1838 px a cada volta.
 *
 * ── 2. A VELOCIDADE DEPENDIA DA JANELA ───────────────────────────────────
 *
 * `30s` é um tempo, não uma velocidade. A fita mede 3844 px num telemóvel e
 * 5053 num computador (o intervalo entre logótipos é maior a partir de `sm`),
 * portanto a mesma animação andava a ritmos diferentes — e juntar clientes
 * acelerava-a sem ninguém mexer em nada.
 *
 * ── 3. E A MINHA PRIMEIRA CORRECÇÃO TIROU-A DO COMPOSITOR ────────────────
 *
 * Pus a largura medida dentro dos fotogramas
 * (`translateX(calc(-1 * var(--fita-copia)))`). Fechava o ciclo e estragou o
 * resto: uma animação cujos VALORES dependem de uma variável CSS não pode ser
 * entregue ao compositor. MEDIDO com o relógio da animação contra o da parede:
 *
 *     1440 px   3000 ms de animação em 3000 ms reais   (100%)
 *      390 px   1900 ms de animação em 3000 ms reais    (63%)
 *
 * No telemóvel — que é onde ela vê o sítio — a fita passou a andar a dois
 * terços do que dizia. É esta a regressão que este ficheiro existe sobretudo
 * para impedir: é invisível a olho num computador e dá-se exactamente onde
 * mais dói.
 */

const RAIZ = process.cwd();
const css = () => readFileSync(join(RAIZ, "src/app/globals.css"), "utf8");
/**
 * O CÓDIGO do componente, sem os comentários.
 *
 * ── E isto não é higiene, é a razão de duas destas regras existirem ──────
 *
 * A primeira versão deste ficheiro procurava no texto todo. As duas regras
 * mais importantes — a caixa que cresce até ao conteúdo e o intervalo que vive
 * nas marcas — PASSAVAM com a correcção removida, porque as palavras `w-max` e
 * `gap-` aparecem nos comentários que explicam porque é que elas existem.
 *
 * Foi a verificação ao contrário que o apanhou: tirei o `w-max` do código e o
 * teste continuou verde. Um teste que não cai quando o defeito volta não é uma
 * rede — é uma decoração.
 */
const componente = () =>
  readFileSync(join(RAIZ, "src/components/ClientMarquee.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/** O corpo do `@keyframes marquee`, sem comentários. */
function fotogramas(): string {
  const limpo = css().replace(/\/\*[\s\S]*?\*\//g, "");
  const i = limpo.indexOf("@keyframes marquee");
  expect(i, "o `@keyframes marquee` desapareceu do globals.css").toBeGreaterThan(-1);
  const abre = limpo.indexOf("{", i);
  let profundidade = 0;
  for (let k = abre; k < limpo.length; k++) {
    if (limpo[k] === "{") profundidade++;
    else if (limpo[k] === "}" && --profundidade === 0) return limpo.slice(abre, k + 1);
  }
  throw new Error("o `@keyframes marquee` não fecha");
}

describe("a fita de clientes", () => {
  it("CONTROLO POSITIVO: o bloco dos fotogramas foi mesmo lido", () => {
    // Sem isto, um `@keyframes` renomeado dava uma cadeia vazia e as regras a
    // seguir passavam por não encontrarem nada que as violasse.
    const f = fotogramas();
    expect(f).toContain("transform");
    expect(f).toContain("translateX");
    expect(f.length).toBeGreaterThan(40);
  });

  it("OS FOTOGRAMAS NÃO PODEM DEPENDER DE UMA VARIÁVEL CSS", () => {
    /**
     * A regra mais importante deste ficheiro. Um valor de fotograma que venha
     * de um `var()` obriga o browser a recalcular a animação no fio principal
     * a cada quadro — e no telemóvel dela isso mediu-se: 63% do tempo real.
     *
     * A duração PODE vir de uma variável, e vem: o que trava o compositor são
     * os valores dos fotogramas, não quanto tempo eles levam.
     */
    expect(fotogramas(), "os fotogramas voltaram a depender de uma variável").not.toContain("var(");
  });

  it("o destino é uma percentagem — é ela que vale «uma cópia»", () => {
    expect(fotogramas()).toMatch(/translateX\(\s*-50%\s*\)/);
  });

  it("a caixa da fita cresce até ao conteúdo, senão a percentagem mente", () => {
    // `w-max`: sem isto a caixa media a janela e o `-50%` deslocava metade da
    // JANELA em vez de metade da fita. Era esse o salto de 1838 px.
    const m = componente().match(/className="([^"]*animate-marquee[^"]*)"/);
    expect(m, "não se encontrou a lista de classes da fita").not.toBeNull();
    expect(m![1], "a fita deixou de crescer até ao conteúdo").toMatch(/\bw-max\b/);
  });

  it("o intervalo entre logótipos vive nas MARCAS, não no contentor", () => {
    /**
     * Com `gap` no contentor, metade do conteúdo é uma cópia MAIS MEIO
     * intervalo — e o ciclo volta a não fechar, por pouco. Com o intervalo
     * dentro de cada marca, as duas cópias são exactamente iguais.
     */
    const src = componente();
    // A lista de classes da fita, e não o ficheiro: um `gap-` numa marca é
    // legítimo; o que não pode é estar no contentor.
    const m = src.match(/className="([^"]*animate-marquee[^"]*)"/);
    expect(m, "não se encontrou a lista de classes da fita").not.toBeNull();
    expect(m![1], "o `gap` voltou ao contentor da fita").not.toMatch(/\bgap-/);
    expect(m![1], "a fita deixou de crescer até ao conteúdo").toMatch(/\bw-max\b/);
    expect(src, "as marcas ficaram sem intervalo").toMatch(/\bme-\d+\b/);
  });

  it("passar o rato por cima já NÃO pára a fita", () => {
    // Palavras dela sobre o botão: «não quero isso». Uma fita que pára porque
    // o ponteiro lhe passou por cima lê-se como avaria, não como comando.
    const limpo = css().replace(/\/\*[\s\S]*?\*\//g, "");
    expect(limpo, "o `:hover` voltou a parar a fita").not.toMatch(
      /\.animate-marquee:hover[^{]*\{[^}]*animation-play-state:\s*paused/,
    );
  });

  it("a velocidade é declarada em píxeis por segundo, com nome", () => {
    // Para ela poder pedir mais ou menos numa palavra, e para a fita andar ao
    // mesmo ritmo em qualquer ecrã e com qualquer número de clientes.
    expect(componente()).toMatch(/const PIXEIS_POR_SEGUNDO = \d+/);
  });

  it("o movimento reduzido continua a parar tudo", () => {
    // É o que substitui o botão desenhado para quem pediu ao sistema para não
    // ver movimento.
    const limpo = css().replace(/\/\*[\s\S]*?\*\//g, "");
    /**
     * Há mais do que um bloco de movimento reduzido neste ficheiro, e o que
     * cala a fita não é o primeiro. Procura-se em TODOS — a primeira versão
     * deste teste olhava só para o primeiro e reprovava uma regra que estava
     * lá, dois blocos abaixo.
     */
    const blocos: string[] = [];
    const re = /@media[^{]*prefers-reduced-motion[^{]*\{/g;
    for (let m = re.exec(limpo); m; m = re.exec(limpo)) {
      let profundidade = 1;
      let k = m.index + m[0].length;
      for (; k < limpo.length && profundidade > 0; k++) {
        if (limpo[k] === "{") profundidade++;
        else if (limpo[k] === "}") profundidade--;
      }
      blocos.push(limpo.slice(m.index, k));
    }
    expect(blocos.length, "não há bloco de movimento reduzido nenhum").toBeGreaterThan(0);
    const cala = blocos.find((b) => /\.animate-marquee\b/.test(b) && /animation:\s*none/.test(b));
    expect(cala, "o movimento reduzido deixou de calar a fita").toBeTruthy();
  });
});
