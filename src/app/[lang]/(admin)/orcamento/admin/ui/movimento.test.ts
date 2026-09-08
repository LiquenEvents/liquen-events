import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ESTADO,
  PRESSAO,
  PROGRESSO,
  MARCA,
  TOQUE_MS,
  ESTADO_MS,
  REGRESSO_MS,
  PROGRESSO_MS,
  MARCA_MS,
} from "./movimento";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ESCALA DE MOVIMENTO DOS PRIMITIVOS, COM DENTES
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * O jsdom não faz *layout* nem avalia media queries, portanto não há aqui
 * nenhuma tentativa de medir uma animação a correr: o padrão da casa (ver
 * `barra-inferior.test.tsx`) é guardar a DECISÃO onde ela está escrita, que é
 * no código-fonte. É isso que estes testes fazem.
 *
 * Guardam quatro coisas, e cada uma delas é uma avaria que já aconteceu:
 *
 *  1. que a escala continua a ser DUAS velocidades de interacção e não seis;
 *  2. que o número do estado continua a ser o mesmo da ficha da casa
 *     (`lib/motion/tokens.ts`) — os dois lados não podem afinar-se sozinhos;
 *  3. que todo o primitivo em que se toca tem resposta ao toque, e que todo o
 *     que transiciona o faz por trás de `motion-safe:`;
 *  4. que ninguém volta a escrever uma classe `duration-*` que o Tailwind não
 *     gera — a avaria mais cara de todas, porque é invisível.
 */

const AQUI = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/ui");

/** Tira comentários: a prosa desta pasta cita classes e números de propósito. */
const semComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Os primitivos — os `.tsx` desta pasta que não são testes. */
function primitivos(): { nome: string; src: string }[] {
  return readdirSync(AQUI)
    .filter((f) => f.endsWith(".tsx") && !f.includes(".test."))
    .sort()
    .map((nome) => ({ nome, src: semComentarios(readFileSync(join(AQUI, nome), "utf8")) }));
}

/** Os primitivos em que se TOCA — os que desenham um `<button>` seu. */
const tocaveis = () => primitivos().filter((p) => p.src.includes("<button"));

describe("a escala: duas velocidades de interacção, e só duas", () => {
  /**
   * ── A ESCALA MUDOU DE DONO, E ISTO CONTA A MUDANÇA ────────────────────
   *
   * Estes números eram do censo desta pasta: 20 ms no toque, 120 no estado
   * (emprestado ao degrau `micro` do SÍTIO), 250 no progresso. Passam a ser os
   * do `docs/DESIGN-SYSTEM.md`, que manda no back office por decisão escrita
   * no `CLAUDE.md`.
   *
   * E o empréstimo ao sítio acabou sem lhe custar nada: MEDIDO, o
   * `DUR_MICRO_MS` tinha um consumidor em todo o repositório — este ficheiro.
   */
  it("a ida do toque são 80 ms — «a ida é seca; só o regresso é mola»", () => {
    // Eram 20. Vinte é imperceptível — e era essa a intenção. O documento
    // escolhe outra coisa, e a diferença tem nome: aos 20 ms o dedo não sente
    // que a peça cedeu, sente que ela piscou. 80 ainda está abaixo dos 100 do
    // limiar de «não houve espera», e já é matéria a afundar.
    expect(TOQUE_MS).toBe(80);
  });

  it("o estado são 150 ms — o degrau `interactive` do documento", () => {
    expect(ESTADO_MS).toBe(150);
  });

  /**
   * O REGRESSO é a mudança que se sente, e por isso tem constante própria.
   * 260 ms contra os 120 de antes: o botão carrega instantâneo e assenta com
   * peso, que é a assimetria que este ficheiro já procurava e só conseguia
   * exprimir com 20 contra 120.
   */
  it("o regresso do toque são 260 ms, e é mais lento do que o estado", () => {
    expect(REGRESSO_MS).toBe(260);
    expect(REGRESSO_MS).toBeGreaterThan(ESTADO_MS);
  });

  it("a barra de progresso é o degrau `elemento`, que não é uma velocidade de interacção", () => {
    // Uma barra a encher não é um estado a mudar: é uma coisa a mover-se. Está
    // separada de propósito, para não passar por um terceiro degrau de toque.
    expect(PROGRESSO_MS).toBe(250);
  });

  /**
   * ── OS NÚMEROS NAS CLASSES SÃO OS TOKENS, E NÃO LITERAIS ──────────────
   *
   * Antes, o Tailwind lia um literal (`duration-[120ms]`) e este teste
   * prendia-o à ficha. Agora as classes apontam para os tokens do `@theme`, o
   * que é melhor — mas abre uma armadilha nova: um token que não exista
   * compila para `var(--nome)` sem valor e a transição corre à duração de
   * omissão, sem erro nenhum.
   *
   * Por isso prendem-se as duas pontas: a classe pede o token certo, e o
   * `tema.css` declara-o com o número desta ficha.
   */
  it("as classes pedem os tokens do documento, e o tema declara-os com estes números", () => {
    expect(ESTADO).toContain("var(--transition-duration-interactive)");
    expect(ESTADO).toContain("var(--transition-duration-press)");
    expect(ESTADO).toContain("var(--ease-interactive)");
    expect(ESTADO).toContain("var(--ease-press)");
    expect(PRESSAO).toContain(`transition-duration:${TOQUE_MS}ms`);
    expect(PROGRESSO).toContain("duration-elemento");
    expect(MARCA).toContain("duration-quick");

    const tema = readFileSync(join(process.cwd(), "src/app/tema.css"), "utf8");
    const declarado = (nome: string) => {
      const m = tema.match(new RegExp(`--transition-duration-${nome}:\\s*(\\d+)ms`));
      expect(m, `o token \`${nome}\` não está declarado no tema`).not.toBeNull();
      return Number(m![1]);
    };
    expect(declarado("interactive"), "o degrau do estado divergiu do tema").toBe(ESTADO_MS);
    expect(declarado("press"), "o degrau do regresso divergiu do tema").toBe(REGRESSO_MS);
    expect(declarado("elemento"), "o degrau do progresso divergiu do tema").toBe(PROGRESSO_MS);
    expect(declarado("quick"), "o degrau da marca divergiu do tema").toBe(MARCA_MS);
  });

  it("a ida do toque é mais rápida do que o estado, e o estado do que o progresso", () => {
    expect(TOQUE_MS).toBeLessThan(ESTADO_MS);
    expect(ESTADO_MS).toBeLessThan(PROGRESSO_MS);
  });

  it("nenhuma das velocidades atrasa uma tarefa (a regra da casa: nada acima de 400 ms)", () => {
    for (const ms of [TOQUE_MS, ESTADO_MS, REGRESSO_MS, PROGRESSO_MS, MARCA_MS])
      expect(ms).toBeLessThanOrEqual(400);
  });

  /**
   * ── E AS SEIS PROPRIEDADES CASAM COM AS SEIS DURAÇÕES ─────────────────
   *
   * A lista por propriedade é o preço de ter duas velocidades no mesmo
   * elemento, e tem uma armadilha própria: se a `transition-property` ganhar
   * ou perder um item e a lista de durações não acompanhar, o CSS repete a
   * lista curta pela longa em SILÊNCIO — e o regresso do toque passa a correr
   * à velocidade de uma cor.
   */
  it("há tantas durações e tantas curvas quantas as propriedades", () => {
    const props = /transition-\[([^\]]+)\]/.exec(ESTADO)![1].split(",");
    const duracoes = /transition-duration:([^\]]+)\]/.exec(ESTADO)![1].split(",");
    const curvas = /transition-timing-function:([^\]]+)\]/.exec(ESTADO)![1].split(",");
    expect(duracoes, "as durações deixaram de casar com as propriedades").toHaveLength(
      props.length,
    );
    expect(curvas, "as curvas deixaram de casar com as propriedades").toHaveLength(props.length);
    // E a ÚLTIMA é a do toque — é `scale` que fecha a lista das propriedades.
    expect(props.at(-1)).toBe("scale");
    expect(duracoes.at(-1)).toContain("press");
    expect(curvas.at(-1)).toContain("press");
  });
});

describe("a lista de propriedades — o que se transiciona, e o que nunca", () => {
  it("`scale` está na lista, senão o carregar não transiciona de todo", () => {
    // A avaria que ninguém via: no Tailwind v4 a classe `scale-[0.98]` emite a
    // propriedade AUTÓNOMA `scale`, não `transform`. O `Button` pedia
    // `transition-[…,transform]` e por isso o seu `active:scale` era um corte
    // seco de 0 ms — com uns `duration-150` ao lado que não lhe tocavam.
    // 0,97 e não 0,98: é o valor do documento (Partes 2.8 e 9.1).
    expect(PRESSAO).toContain("scale-[0.97]");
    const lista = /transition-\[([^\]]+)\]/.exec(ESTADO)?.[1].split(",");
    expect(lista, "o ESTADO deixou de declarar a sua lista de propriedades").toBeTruthy();
    expect(lista).toContain("scale");
  });

  it("nenhum primitivo declara uma lista que use `scale` sem a transicionar", () => {
    // ESTE é o teste que cai sobre a avaria real, e não sobre a constante nova.
    // Lê os PRIMITIVOS: se algum voltar a escrever a sua própria lista de
    // propriedades e a puser `transform` a fingir que cobre um `scale-…`, fica
    // vermelho. Era exactamente o estado do `Button` antes disto —
    // `transition-[background-color,color,box-shadow,transform]` ao lado de um
    // `active:scale-[0.98]` que, compilado, emite a propriedade `scale`.
    const maus: string[] = [];
    for (const p of primitivos()) {
      if (!/\bscale-\[/.test(p.src)) continue;
      for (const m of p.src.matchAll(/transition-\[([^\]]+)\]/g)) {
        const props = m[1].split(",").map((x) => x.trim());
        if (!props.includes("scale")) maus.push(`${p.nome}: transition-[${m[1]}]`);
      }
    }
    expect(maus, `usa \`scale-…\` mas não o transiciona: ${maus.join(" · ")}`).toEqual([]);
  });

  it("nada do que se transiciona força *layout* (60 fps num telemóvel em 4G)", () => {
    // A regra da dona do produto. `scale` e `opacity` compõem-se na GPU; as
    // cores e a sombra repintam. O que NÃO pode entrar é largura, altura,
    // margem, topo, esquerda — qualquer coisa que obrigue a remedir a página.
    const proibidas = [
      "width",
      "height",
      "margin",
      "padding",
      "top",
      "left",
      "right",
      "bottom",
      "inset",
      "all",
    ];
    const lista = /transition-\[([^\]]+)\]/.exec(ESTADO)![1].split(",");
    expect(lista.filter((p) => proibidas.includes(p.trim()))).toEqual([]);
  });

  it("`transform` NÃO está na lista — o arrasto da folha segue o dedo", () => {
    // A `FolhaOuDialogo` escreve `transform: translateY(...)` enquanto o dedo
    // arrasta. Uma transição por baixo disso lê-se sempre como atraso.
    const lista = /transition-\[([^\]]+)\]/.exec(ESTADO)![1].split(",");
    expect(lista).not.toContain("transform");
  });
});

describe("todo o primitivo em que se toca responde ao toque", () => {
  it("há primitivos tocáveis para testar (a rede não passa por estar vazia)", () => {
    expect(tocaveis().length).toBeGreaterThanOrEqual(8);
  });

  it.each(tocaveis().map((p) => p.nome))("%s dá feedback ao carregar", (nome) => {
    // Antes disto era UM em nove: só o `Button` tinha `active:`, e mesmo esse
    // sem transição a cobri-lo. Os outros oito não tinham nada — carregar não
    // se distinguia de não carregar até a acção acontecer.
    const src = tocaveis().find((p) => p.nome === nome)!.src;
    expect(src).toMatch(/PRESSAO/);
  });

  it.each(tocaveis().map((p) => p.nome))("%s importa a escala em vez de a copiar", (nome) => {
    const src = tocaveis().find((p) => p.nome === nome)!.src;
    expect(src).toMatch(/from "\.\/movimento"/);
  });
});

describe("`prefers-reduced-motion` é respeitado sem excepção", () => {
  // O `globals.css` só desliga transições dentro de `prefers-reduced-motion`
  // em três sítios muito concretos (`:focus-visible`, o `scroll-behavior` e o
  // `.link-line::after`). Não há rede global: quem escreve `transition-*` à
  // seca está mesmo a animar para quem pediu para não animar. Eram cinco.
  it.each(primitivos().map((p) => p.nome))("%s não transiciona à seca", (nome) => {
    const src = primitivos().find((p) => p.nome === nome)!.src;
    const soltas = [...src.matchAll(/(^|[\s"'`{])(transition-[\w[\],-]+)/g)]
      .filter((m) => !/motion-safe:$/.test(src.slice(0, m.index! + m[1].length)))
      .map((m) => m[2]);
    expect(soltas, `${nome}: ${soltas.join(", ")}`).toEqual([]);
  });
});

describe("nenhuma classe de duração aponta para um token que o Tailwind não gera", () => {
  /**
   * A AVARIA MAIS CARA, porque é a única que não se vê.
   *
   * O `@theme` do `globals.css` declara `--duration-micro/elemento/vista`. Só
   * que o espaço de nomes que o Tailwind v4 lê para os utilitários `duration-*`
   * é `--transition-duration-*`. Compilado o `globals.css` a sério: as três
   * variáveis chegam ao `:root` com os valores certos, e as regras
   * `.duration-micro/-elemento/-vista` são zero. A classe não dá erro, não dá
   * aviso do lint, e o elemento cai nos 150 ms por omissão do Tailwind.
   *
   * Estavam assim treze classes no back office; uma delas nesta pasta (a barra
   * do `EmCurso`, a correr a 150 ms em vez dos 250 pretendidos). As outras doze
   * ficam relatadas para quem é dono dos ficheiros delas.
   */
  const MORTOS = /duration-(micro|elemento|vista)\b/;

  it.each(primitivos().map((p) => p.nome))("%s não usa uma duração inexistente", (nome) => {
    const src = primitivos().find((p) => p.nome === nome)!.src;
    expect(MORTOS.test(src), `${nome} usa uma classe duration-* que não gera CSS`).toBe(false);
  });

  it("as durações vivem só no `movimento.ts` — nenhum primitivo escreve a sua", () => {
    // Números iguais em ficheiros diferentes afastam-se sempre. Era assim que
    // oito primitivos tinham a mesma duração sem nenhum a ter escolhido.
    const reincidentes = primitivos()
      .filter((p) => /\bmotion-safe:duration-|\bduration-\[/.test(p.src))
      .map((p) => p.nome);
    expect(reincidentes, `duração escrita à mão em: ${reincidentes.join(", ")}`).toEqual([]);
  });
});

describe("as curvas: duas, e nenhuma com `bounce`", () => {
  it("nenhum primitivo escreve uma curva à mão", () => {
    // A casa tem duas (`--ease-out` e `--ease-in`), e a de entrada é já o
    // `--default-transition-timing-function` do `@theme` — ou seja, toda a
    // classe `transition-*` desta casa sai com ela sem a pedir. Uma
    // `cubic-bezier(...)` escrita aqui seria uma terceira, em silêncio.
    for (const p of primitivos()) {
      expect(p.src, p.nome).not.toMatch(/cubic-bezier\(/);
    }
    expect(semComentarios(readFileSync(join(AQUI, "movimento.ts"), "utf8"))).not.toMatch(
      /cubic-bezier\(/,
    );
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O TAILWIND NÃO EXECUTA O CÓDIGO — LÊ O TEXTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A avaria que este bloco existe para apanhar já aconteceu, e passou por todos
 * os testes que este ficheiro tinha. O `ESTADO` esteve assim:
 *
 *     const PROPRIEDADES = "background-color,…,scale";
 *     const CINCO = Array(5).fill("var(--transition-duration-interactive)")…
 *     export const ESTADO = `motion-safe:transition-[${PROPRIEDADES}] …`;
 *
 * O valor da constante em tempo de execução estava CERTO — e por isso todos os
 * testes que comparam `ESTADO` com o que quer que seja passavam. O que estava
 * errado era o TEXTO do ficheiro, e é o texto que o Tailwind v4 varre à procura
 * de candidatos: `transition-[${PROPRIEDADES}]` não é classe nenhuma.
 *
 * Compilado o `admin.css` desta casa com o próprio `@tailwindcss/postcss`: a
 * lista de seis propriedades não saía, e `transition-duration-interactive`,
 * `transition-duration-press` e `ease-press` apareciam ZERO vezes no CSS. No
 * browser: `transition-property: all`, `transition-duration: 0s`. Ou seja, os
 * botões todos sem transição — a avaria exacta que esta pasta existe para não
 * ter, escondida atrás de uma refacção que só queria tirar uma repetição feia.
 *
 * Só o `ESTADO` e a `PRESSAO` tinham interpolação e foram só esses dois que
 * desapareceram. O `PROGRESSO` e a `MARCA`, escritos por extenso, compilaram.
 *
 * A guarda é a mais literal possível: cada classe que este ficheiro exporta
 * tem de aparecer no seu código-fonte LETRA POR LETRA. É a única propriedade
 * que distingue uma classe que o Tailwind vê de uma que ele não vê, e nenhum
 * teste que olhe para o VALOR das constantes a consegue ver.
 */
describe("as classes exportadas existem no texto do ficheiro, e não só em memória", () => {
  const FONTE = readFileSync(join(AQUI, "movimento.ts"), "utf8");

  const EXPORTADAS: ReadonlyArray<readonly [string, string]> = [
    ["ESTADO", ESTADO],
    ["PRESSAO", PRESSAO],
    ["PROGRESSO", PROGRESSO],
    ["MARCA", MARCA],
  ];

  it.each(EXPORTADAS)("%s está escrita por extenso", (nome, valor) => {
    for (const classe of valor.split(/\s+/).filter(Boolean)) {
      expect(
        FONTE.includes(classe),
        `\`${classe}\` (de ${nome}) não aparece no texto do movimento.ts — ` +
          `o Tailwind varre o ficheiro, não corre o código, e uma classe montada ` +
          `com \`\${…}\` não gera regra nenhuma`,
      ).toBe(true);
    }
  });

  it("e nenhuma delas é montada com interpolação", () => {
    // O teste de cima já chumbaria, mas com uma mensagem sobre a classe que
    // falta. Este diz o PORQUÊ directamente, que é o que poupa a meia hora.
    const declaracoes = FONTE.split(/\n(?=export const )/).filter((b) =>
      EXPORTADAS.some(([nome]) => b.startsWith(`export const ${nome} =`)),
    );
    expect(declaracoes).toHaveLength(EXPORTADAS.length);
    for (const bloco of declaracoes) {
      const corpo = bloco.slice(0, bloco.indexOf(";"));
      expect(corpo, "uma classe do Tailwind montada com `${…}` não chega ao CSS").not.toMatch(
        /\$\{/,
      );
    }
  });
});
