import { describe, expect, it } from "vitest";
import { readFileSync, existsSync, statSync } from "node:fs";
import { dirname, resolve, join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O `sharp` NÃO SE CARREGA PARA SERVIR UMA FOTOGRAFIA QUE JÁ EXISTE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela sobre a proposta que chega ao casal: «demora imenso tempo a
 * carregar (…) quero mesmo tudo super rápido».
 *
 * O `sharp` não é uma biblioteca de JavaScript: é um vínculo nativo que abre o
 * libvips com `dlopen` — uns oito megabytes de biblioteca partilhada. MEDIDO
 * neste contentor, com o disco quente, três vezes seguidas: 274, 177 e 223 ms
 * só para o `import` devolver. Num contentor acabado de nascer, com o disco
 * frio, é mais.
 *
 * Esse preço paga-se UMA vez por arranque a frio da função — e pagava-se
 * SEMPRE, mesmo quando ninguém ia usar o `sharp`. É o caso normal:
 *
 *   • A rota que serve uma fotografia (`/api/proposta/[token]/foto/[id]`) só
 *     precisa do `sharp` quando a derivada de 1200 px AINDA NÃO EXISTE. A
 *     partir da segunda visita — e é esse o estado de TODAS as propostas que
 *     ela já enviou — a derivada está no Storage e a rota limita-se a
 *     descarregá-la. O código já o diz por extenso: «é o caso normal a partir
 *     da segunda visita».
 *   • O `avaliarCabecalho` do `proposal-storage` é a confirmação de um
 *     carregamento no back office. Nunca corre no caminho do casal, e ainda
 *     assim arrastava o módulo para dentro de tudo o que importa aquele
 *     ficheiro.
 *
 * O `sharp` continua lá e continua a fazer o mesmo trabalho: o que muda é
 * QUANDO é carregado. Com `await import(…)`, o vínculo nativo só se abre na
 * primeira fotografia que precise mesmo de ser fabricada.
 *
 * ── E PORQUE É QUE ISTO SE GUARDA COM UM TESTE ────────────────────────────
 *
 * Porque a regressão é invisível. Alguém escreve `import sharp from "sharp"`
 * no topo — que é o que qualquer editor sugere — e nada falha, nada avisa, e
 * nenhum ecrã fica diferente. Só o primeiro casal a abrir a proposta naquele
 * contentor é que paga, e não há como ele nos dizer.
 *
 * Esta casa já foi mordida pelo `sharp` a ser carregado onde não era preciso:
 * está escrito no `next.config`, e custou a lista dos temas em produção —
 * `Could not load the "sharp" module`, a função inteira a rebentar antes de
 * chegar ao código da rota. Adiar o carregamento também encolhe essa
 * superfície.
 */

const RAIZ = process.cwd();

/**
 * As portas por onde o casal entra. São as que têm de arrancar sem o `sharp`.
 *
 * A página da proposta está aqui a fazer de controlo: hoje já não chega ao
 * `sharp` por caminho nenhum, e se um dia lá chegar é sinal de que o grafo
 * mudou de forma e alguém tem de olhar para isso.
 */
const PORTAS_DO_CASAL = [
  "src/app/api/proposta/[token]/foto/[id]/route.ts",
  "src/app/api/proposta/[token]/pdf/route.ts",
  "src/app/[lang]/(privado)/proposta/[token]/page.tsx",
];

function resolver(spec: string, de: string): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = join(RAIZ, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(de), spec);
  else return null; // pacote — não é nosso, não se percorre
  for (const ext of [".ts", ".tsx", "/index.ts", "/index.tsx"]) {
    const f = base + ext;
    if (existsSync(f) && statSync(f).isFile()) return f;
  }
  if (existsSync(base) && statSync(base).isFile()) return base;
  return null;
}

/**
 * Percorre o grafo de `import` ESTÁTICOS a partir de um ficheiro e devolve
 * quem, pelo caminho, carrega o `sharp` ao arrancar.
 *
 * `import(…)` fica DE FORA de propósito: é exactamente essa a diferença que
 * este teste guarda. Um `import()` é uma promessa que só se cumpre quando a
 * linha corre; um `import` de topo corre sempre que o módulo é carregado.
 *
 * O caminho até ao culpado vem junto, porque quem partir isto merece saber
 * qual foi o ficheiro do meio e não só que «algures há um sharp».
 */
function quemCarregaOSharpAoArrancar(entrada: string): string[][] {
  const vistos = new Set<string>();
  const culpados: string[][] = [];

  function anda(ficheiro: string, caminho: string[]): void {
    if (vistos.has(ficheiro)) return;
    vistos.add(ficheiro);
    let fonte: string;
    try {
      fonte = readFileSync(ficheiro, "utf8");
    } catch {
      return;
    }
    const meu = [...caminho, ficheiro.replace(`${RAIZ}/`, "")];

    // `import … from "sharp"` / `import "sharp"` no topo. Um `import type`
    // não conta: desaparece na compilação e não carrega módulo nenhum.
    const estaticoDoSharp =
      /(?:^|\n)\s*import\s+(?!type\b)[^\n;]*?from\s*"sharp"|(?:^|\n)\s*import\s*"sharp"/;
    if (estaticoDoSharp.test(fonte)) culpados.push(meu);

    const re = /(?:^|\n)\s*(?:import|export)\s+(?!type\b)[^\n;]*?from\s*"([^"]+)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(fonte))) {
      const alvo = resolver(m[1], ficheiro);
      if (alvo && !alvo.includes(".test.")) anda(alvo, meu);
    }
  }

  anda(resolve(RAIZ, entrada), []);
  return culpados;
}

describe("o `sharp` fica fora do arranque do que o casal abre", () => {
  it.each(PORTAS_DO_CASAL)("%s arranca sem abrir o vínculo nativo", (porta) => {
    const culpados = quemCarregaOSharpAoArrancar(porta);
    expect(
      culpados,
      culpados.length === 0
        ? ""
        : `o \`sharp\` volta a ser carregado ao arrancar, por este caminho:\n` +
            culpados.map((c) => `  ${c.join("\n    → ")}`).join("\n\n") +
            `\n\nUse \`const { default: sharp } = await import("sharp")\` dentro da função ` +
            `que dele precisa — o precedente está em \`src/lib/diagnostico-de-fotos.ts\`.`,
    ).toEqual([]);
  });

  /**
   * `typeof import("sharp")` fora.
   *
   * Isto nasceu de um controlo positivo ter passado quando não devia. Posto o
   * defeito de propósito — o `sharp` de volta ao topo e o `import()` dinâmico
   * apagado — o controlo continuou verde, porque a ANOTAÇÃO DE TIPO do
   * carregador ainda contém as letras `import("sharp")` e a expressão regular
   * não sabia distinguir uma da outra. Um `typeof import(…)` é uma posição de
   * tipo: desaparece na compilação e não carrega módulo nenhum.
   */
  const soOsQueCarregam = (fonte: string) => fonte.replace(/typeof import\("sharp"\)/g, "");

  it("o carregamento é adiado NUM sítio só, e a promessa é guardada", () => {
    /**
     * Porque é que isto é um módulo partilhado e não um `await import` em cada
     * sítio: a confirmação de um carregamento avalia oito cabeçalhos ao mesmo
     * tempo, e oito `import()` soltos são oito resoluções em corrida. MEDIDO,
     * com os `import()` soltos: na mesma execução umas chamadas receberam o
     * duplo do teste e outras o `sharp` verdadeiro — que rejeitou trinta
     * fotografias boas por «formato inválido».
     *
     * Uma promessa guardada faz um `import()` só, e todas as chamadas
     * seguintes recebem a mesma. Sem isso, isto volta a partir-se em silêncio.
     */
    const adiado = readFileSync("src/lib/sharp-adiado.ts", "utf8");
    expect(
      soOsQueCarregam(adiado),
      "o `sharp-adiado` deixou de ir buscar o `sharp` em tempo de execução",
    ).toMatch(/import\("sharp"\)/);
    expect(adiado, "a promessa deixou de ser guardada — voltam os `import()` em corrida").toMatch(
      /modulo \?\?=/,
    );
  });

  it("e o `sharp` continua a fabricar — senão isto não guarda nada", () => {
    // Os controlos positivos. Se um dia alguém apagar o `sharp` de todo o
    // lado, os casos de cima passam por não haver nada que eles possam
    // reprovar: um grafo sem `sharp` nenhum satisfá-los todos.
    const derivadas = readFileSync("src/lib/derivadas.ts", "utf8");
    expect(derivadas, "as derivadas deixaram de pedir o `sharp`").toMatch(/await oSharp\(\)/);
    expect(derivadas, "as derivadas deixaram de passar por um pipeline").toMatch(/\.resize\(/);
  });

  it("o caminho do back office continua a poder medir os pixéis", () => {
    // Adiar não é apagar. A confirmação de um carregamento precisa do `sharp`
    // de verdade — é ela que apanha uma bomba de descompressão antes de a foto
    // ficar no bucket à espera do gerador de PDF.
    const storage = readFileSync("src/lib/proposal-storage.ts", "utf8");
    expect(storage, "a confirmação de um carregamento deixou de medir os pixéis").toMatch(
      /await oSharp\(\)/,
    );
    expect(storage, "deixou de haver decisão sobre os pixéis").toMatch(/MAX_IMAGE_PIXELS/);
  });
});
