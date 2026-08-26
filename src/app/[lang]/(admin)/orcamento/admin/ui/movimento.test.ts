import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { DUR_MICRO_MS, DUR_ELEMENTO_MS } from "@/lib/motion/tokens";
import { ESTADO, PRESSAO, PROGRESSO, TOQUE_MS, ESTADO_MS, PROGRESSO_MS } from "./movimento";

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
  it("o toque são 20 ms — o valor da análise, verbatim", () => {
    // «É imperceptível como animação e perfeitamente perceptível como
    // suavidade.» Abaixo disto não há transição nenhuma; acima começa a ser
    // uma animação, e uma animação no carregar é latência.
    expect(TOQUE_MS).toBe(20);
  });

  it("o estado é o degrau `micro` da casa, e não um número novo", () => {
    // ESTE é o teste que impede as duas pontas de se afastarem: se alguém
    // afinar o `--duration-micro` do `globals.css` (e com ele a ficha de JS),
    // esta pasta não fica calada a correr no valor antigo.
    expect(ESTADO_MS).toBe(DUR_MICRO_MS);
    expect(ESTADO_MS).toBe(120);
  });

  it("a barra de progresso é o degrau `elemento`, que não é uma velocidade de interacção", () => {
    // Uma barra a encher não é um estado a mudar: é uma coisa a mover-se. Está
    // separada de propósito, para não passar por um terceiro degrau de toque.
    expect(PROGRESSO_MS).toBe(DUR_ELEMENTO_MS);
  });

  it("as duas velocidades estão escritas nas classes com o mesmo número da ficha", () => {
    // O Tailwind lê literais de texto, não constantes — por isso o número está
    // escrito por extenso na classe. Aqui prende-se o literal à ficha.
    expect(ESTADO).toContain(`duration-[${ESTADO_MS}ms]`);
    expect(PRESSAO).toContain(`duration-[${TOQUE_MS}ms]`);
    expect(PROGRESSO).toContain(`duration-[${PROGRESSO_MS}ms]`);
  });

  it("o toque é mais rápido do que o estado, e o estado do que o progresso", () => {
    expect(TOQUE_MS).toBeLessThan(ESTADO_MS);
    expect(ESTADO_MS).toBeLessThan(PROGRESSO_MS);
  });

  it("nenhuma das velocidades atrasa uma tarefa (a regra da casa: nada acima de 400 ms)", () => {
    for (const ms of [TOQUE_MS, ESTADO_MS, PROGRESSO_MS]) expect(ms).toBeLessThanOrEqual(400);
  });
});

describe("a lista de propriedades — o que se transiciona, e o que nunca", () => {
  it("`scale` está na lista, senão o carregar não transiciona de todo", () => {
    // A avaria que ninguém via: no Tailwind v4 a classe `scale-[0.98]` emite a
    // propriedade AUTÓNOMA `scale`, não `transform`. O `Button` pedia
    // `transition-[…,transform]` e por isso o seu `active:scale` era um corte
    // seco de 0 ms — com uns `duration-150` ao lado que não lhe tocavam.
    expect(PRESSAO).toContain("scale-[0.98]");
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
