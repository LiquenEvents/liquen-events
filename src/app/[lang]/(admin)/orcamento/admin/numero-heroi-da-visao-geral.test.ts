import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM NÚMERO MANDA — A HIERARQUIA DA VISÃO GERAL
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O padrão 08 da análise dos dois sites de referência: no ecrã de entrada, UM
 * número herói, e os restantes numa fila secundária. O que cá estava eram seis
 * números com o mesmo peso — três de dinheiro a `clamp(24px, 3vw, 34px)` e três
 * contadores a `clamp(18px, 2.2vw, 26px)`. Entre 34 e 26 não há hierarquia: há
 * seis coisas a pedir a mesma atenção, que é o mesmo que nenhuma pedir.
 *
 * ── PORQUE É QUE ESTE TESTE OLHA PARA A FONTE E NÃO PARA O ECRÃ ────────────
 *
 * Estes tamanhos são `style` em linha com `clamp()`, e o `clamp()` só tem
 * valor depois de haver uma janela com largura. Num jsdom, o
 * `getComputedStyle` devolve a cadeia `clamp(...)` tal e qual — medir lá não
 * mede nada. Medir num browser a sério mediria UMA largura de cada vez; o que
 * esta regra guarda é a RAZÃO entre os números, em toda a gama. Ler os três
 * degraus da fonte e compará-los é o que responde à pergunta certa.
 *
 * ── E PORQUE É QUE OLHA PARA A RAZÃO E NÃO PARA OS PÍXEIS ─────────────────
 *
 * Os valores exactos vão mudar — é o trabalho de quem desenha. O que não pode
 * mudar sem alguém decidir é a ORDEM e a DISTÂNCIA: abaixo de 1,5× o olho lê
 * «dois tamanhos parecidos» em vez de «este primeiro». Um teste que fixasse
 * 48 px partia-se em cada afinação e não guardava nada.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Overview.tsx", "utf8");

/**
 * Comentários fora, com as linhas de pé.
 *
 * Esta lição já custou seis testes que passavam a olhar para a minha própria
 * prosa. Aqui era garantido: o bloco de comentário que explica esta mudança
 * ESCREVE os quatro `clamp(...)` numa tabela. Sem isto, o teste lia a tabela.
 */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

const CODIGO = semComentarios(FONTE);

/** O `<div role="group">` do dinheiro, até ao grupo dos contadores. */
function grupoDoDinheiro(): string {
  const i = CODIGO.indexOf('aria-label="Dinheiro — ganho, à espera e recebido"');
  expect(i, "não encontrei o grupo dos três números de dinheiro").toBeGreaterThan(-1);
  const fim = CODIGO.indexOf("aria-label={`${k.l}: ${k.v} — ${k.hint}. Abrir.`}", i);
  const seguinte = CODIGO.indexOf("Pedidos ativos", i);
  expect(fim).toBeGreaterThan(-1);
  expect(seguinte).toBeGreaterThan(fim);
  return CODIGO.slice(i, seguinte);
}

/** Os contadores — do «Pedidos ativos» até ao fim do bloco. */
function grupoDosContadores(): string {
  const i = CODIGO.indexOf("Pedidos ativos");
  expect(i, "não encontrei o grupo dos contadores").toBeGreaterThan(-1);
  const fim = CODIGO.indexOf("<AEsperaDeResposta", i);
  expect(fim).toBeGreaterThan(i);
  return CODIGO.slice(i, fim);
}

/** Os três números de um `clamp(mín, preferido, máx)` em píxeis. */
function degraus(clamp: string): { min: number; max: number } {
  const m = clamp.match(/clamp\(\s*(\d+(?:\.\d+)?)px\s*,[^,]+,\s*(\d+(?:\.\d+)?)px\s*\)/);
  expect(m, `não consigo ler o clamp \`${clamp}\``).not.toBeNull();
  return { min: Number(m![1]), max: Number(m![2]) };
}

/** Mapa rótulo → tamanho, lido da lista de dados dos três de dinheiro. */
function tamanhosDoDinheiro(): Map<string, { min: number; max: number }> {
  const grupo = grupoDoDinheiro();
  const mapa = new Map<string, { min: number; max: number }>();
  // Cada item da lista tem `l: "…"` e, algures a seguir, `tamanho: "clamp(…)"`.
  const itens = grupo.matchAll(/l:\s*"([^"]+)",[\s\S]*?tamanho:\s*"(clamp\([^"]+\))"/g);
  for (const it of itens) mapa.set(it[1], degraus(it[2]));
  return mapa;
}

describe("a hierarquia dos números da visão geral", () => {
  it("dá a cada um dos três de dinheiro um tamanho próprio, e não um comum", () => {
    // A falha que este caso apanha é a de origem: `fontSize` escrito uma só vez
    // no JSX, igual para os três. Se voltar a ser assim, não há aqui `tamanho`
    // nenhum para ler.
    const t = tamanhosDoDinheiro();
    expect([...t.keys()].sort()).toEqual(["Ganho", "Recebido", "À espera"].sort());
  });

  it("põe o «Ganho» pelo menos meia vez maior do que os dois ao lado", () => {
    const t = tamanhosDoDinheiro();
    const heroi = t.get("Ganho")!;
    for (const rotulo of ["À espera", "Recebido"]) {
      const outro = t.get(rotulo)!;
      expect(
        heroi.max / outro.max,
        `no ecrã largo, «Ganho» (${heroi.max}px) mal se distingue de «${rotulo}» (${outro.max}px)`,
      ).toBeGreaterThanOrEqual(1.5);
      expect(
        heroi.min / outro.min,
        `no telemóvel, «Ganho» (${heroi.min}px) mal se distingue de «${rotulo}» (${outro.min}px)`,
      ).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("mantém os dois secundários iguais entre si — é uma fila, não um pódio", () => {
    const t = tamanhosDoDinheiro();
    expect(t.get("À espera")).toEqual(t.get("Recebido"));
  });

  it("não deixa os contadores empatarem com os números de dinheiro", () => {
    const grupo = grupoDosContadores();
    const m = grupo.match(/fontSize:\s*"(clamp\([^"]+\))"/);
    expect(m, "não encontrei o tamanho dos contadores").not.toBeNull();
    const contadores = degraus(m![1]);
    const secundario = tamanhosDoDinheiro().get("À espera")!;
    expect(
      contadores.max,
      `os contadores (${contadores.max}px) não são menores do que o dinheiro secundário (${secundario.max}px)`,
    ).toBeLessThan(secundario.max);
  });

  it("dá ao herói uma coluna mais larga do que as outras duas, a partir de 640", () => {
    // A 48 px, «13.257,85 €» ocupa mais largura do que «0 €». Três colunas
    // iguais partem o número em duas linhas — e um número herói partido ao meio
    // deixa de ser herói.
    const grupo = grupoDoDinheiro();
    const m = grupo.match(/sm:grid-cols-\[([^\]]+)\]/);
    expect(m, "o grupo do dinheiro voltou a três colunas iguais (`sm:grid-cols-3`)").not.toBeNull();
    const colunas = m![1].split("_").map((c) => Number(c.replace("fr", "")));
    expect(colunas).toHaveLength(3);
    expect(colunas[0]).toBeGreaterThan(colunas[1]);
    expect(colunas[1]).toEqual(colunas[2]);
  });
});
