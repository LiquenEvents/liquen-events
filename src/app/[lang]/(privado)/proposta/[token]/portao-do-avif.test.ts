import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O PORTÃO DO AVIF NÃO PODE DESCER ABAIXO DA CONTA QUE O JUSTIFICA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O AVIF pesa 19% menos do que o WebP com os mesmos pixéis: numa proposta de
 * quarenta e seis fotografias são 5,8 MB contra 4,7 MB. Só que a oferta em
 * AVIF tem UM candidato — o de 1200 — e um `<source>` que casa DESLIGA o
 * `srcset` do `<img>` ao lado.
 *
 * Portanto o portão não é uma preferência: é uma FRONTEIRA. Acima dela, o
 * navegador já escolhia a de 1200 e a troca é ganho puro. Abaixo dela, ele
 * escolheria a de 400 (22 KB) e nós passaríamos a impor-lhe 105 KB — cinco
 * vezes pior, no telemóvel de um casal, num 4G, numa quinta.
 *
 * O que este ficheiro guarda não é o número: é a CONTA. Refaz a fronteira a
 * partir das fatias que os componentes realmente servem, e reprova se o
 * portão passar a estar abaixo dela.
 *
 * ── PORQUE É QUE ISTO NÃO É UM `toBe("1.5dppx")` ─────────────────────────
 *
 * Porque um número pregado não sabe porque é que está certo. No dia em que
 * alguém alargar uma fatia — pôr a grelha a `100vw`, ou dar mais largura à
 * capa —, a fronteira MEXE-SE, e um teste que só confira o número deixa passar
 * um portão que era bom ontem e passou a ser mau hoje. Este refá-la.
 */

const RAIZ = "src/app/[lang]/(privado)/proposta/[token]/";
const INSPIRACAO = readFileSync(`${RAIZ}Inspiracao.tsx`, "utf8");
const DOCUMENTO = readFileSync(`${RAIZ}Documento.tsx`, "utf8");

/** Comentários fora: os números vivem lá dentro e não valem como código. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** O candidato pequeno da oferta. Se ele crescer, a fronteira desce. */
const LADO_PEQUENO = 400;

/**
 * Os ecrãs por onde uma proposta é aberta.
 *
 * Não é uma lista de aparelhos: é a lista das larguras em que a conta pode dar
 * pior. A pior de todas é a que decide o portão.
 */
const ECRAS = [320, 360, 390, 430, 640, 768, 1024, 1280];

/** Os portões escritos nos componentes, em `dppx`. */
function portoes(): { onde: string; valor: number }[] {
  const achados: { onde: string; valor: number }[] = [];
  for (const [onde, fonte] of [
    ["Inspiracao.tsx", INSPIRACAO],
    ["Documento.tsx", DOCUMENTO],
  ] as const) {
    for (const m of semComentarios(fonte).matchAll(/min-resolution:\s*([\d.]+)dppx/g)) {
      achados.push({ onde, valor: Number(m[1]) });
    }
  }
  return achados;
}

/**
 * Quanto é que a fatia mede, em pontos, num ecrã desta largura?
 *
 * Lê as `sizes` do código — que é o que o navegador lê — em vez de as repetir
 * aqui. Repeti-las era escrever a resposta ao lado da pergunta.
 */
function fatia(sizes: string, ecra: number): number {
  // `(min-width: 640px) 46vw, 92vw` → a primeira condição que casar.
  for (const parte of sizes.split(",").map((p) => p.trim())) {
    const comCondicao = parte.match(/^\(min-width:\s*(\d+)px\)\s*(.+)$/);
    const alvo = comCondicao ? comCondicao[2] : parte;
    if (comCondicao && ecra < Number(comCondicao[1])) continue;
    const vw = alvo.match(/^([\d.]+)vw$/);
    if (vw) return (Number(vw[1]) / 100) * ecra;
    const px = alvo.match(/^([\d.]+)px$/);
    if (px) return Math.min(Number(px[1]), ecra);
  }
  return ecra;
}

/**
 * Todas as `sizes` escritas nos dois componentes.
 *
 * ── E PORQUE É QUE ISTO NÃO PROCURA POR `sizes:` ─────────────────────────
 *
 * Porque procurava, e falhava em silêncio. A fatia da grelha está escrita
 * `sizes: larguraNoEcra ?? "(min-width: 640px) 46vw, 92vw"` — com um valor por
 * omissão a seguir a um `??`, e portanto SEM aspas logo depois dos dois
 * pontos. O `sizes:\s*"` não a apanhava, e a mais estreita de todas as fatias
 * — a que DECIDE a fronteira — ficava de fora da conta.
 *
 * O que isso fazia: a fronteira dava 1,25 em vez de 1,36, e um portão posto a
 * 1,25 passava neste teste. MEDIDO, ao repor o defeito de propósito.
 *
 * Agora procura-se pela FORMA do valor — uma cadeia que é uma descrição de
 * fatias — e não pelo nome da propriedade a que está agarrada. Uma cadeia
 * assim não aparece por acaso, e é imune à maneira como for escrita.
 */
function todasAsSizes(): string[] {
  const achadas = new Set<string>();
  const pareceSizes =
    /^(?:\(min-width:\s*\d+px\)\s*)?[\d.]+(?:vw|px)(?:\s*,\s*(?:\(min-width:\s*\d+px\)\s*)?[\d.]+(?:vw|px))*$/;
  for (const fonte of [INSPIRACAO, DOCUMENTO]) {
    for (const m of semComentarios(fonte).matchAll(/"([^"\n]+)"/g)) {
      if (pareceSizes.test(m[1].trim())) achadas.add(m[1].trim());
    }
  }
  return [...achadas];
}

describe("o portão do AVIF", () => {
  it("fica acima da densidade em que a de 1200 já era a escolhida", () => {
    const sizes = todasAsSizes();
    expect(
      sizes.length,
      "não se encontrou uma única `sizes` — a conta não tem base",
    ).toBeGreaterThan(0);

    /**
     * A fronteira: abaixo dela o navegador escolheria a de 400, e casar o
     * `<source>` do AVIF passaria a IMPOR a de 1200. É a pior de todas as
     * combinações de fatia e ecrã, porque basta um caso mau para o portão
     * estar errado.
     */
    let pior = 0;
    let ondePior = "";
    for (const s of sizes) {
      for (const ecra of ECRAS) {
        const pontos = fatia(s, ecra);
        if (pontos <= 0) continue;
        const fronteira = LADO_PEQUENO / pontos;
        if (fronteira > pior) {
          pior = fronteira;
          ondePior = `\`${s}\` a ${ecra}pt → fatia de ${Math.round(pontos)}pt`;
        }
      }
    }

    const encontrados = portoes();
    expect(encontrados.length, "desapareceu a oferta em AVIF").toBeGreaterThan(0);
    for (const { onde, valor } of encontrados) {
      expect(
        valor,
        `o portão de ${onde} (${valor}dppx) ficou ABAIXO da fronteira de ${pior.toFixed(2)}dppx ` +
          `(${ondePior}).\n\nAbaixo dela o navegador escolheria a de 400 (22 KB) e nós ` +
          `passamos a impor-lhe a de 1200 em AVIF (105 KB) — cinco vezes pior, no telemóvel ` +
          `de um casal.`,
      ).toBeGreaterThanOrEqual(pior);
    }
  });

  it("é o mesmo nos dois sítios", () => {
    // A capa, o fecho e a grelha são a mesma decisão. Dois números diferentes
    // querem dizer que alguém mexeu num e não deu pelo outro — e o que fica
    // para trás é o que ninguém volta a olhar.
    const valores = [...new Set(portoes().map((p) => p.valor))];
    expect(valores, `portões diferentes: ${JSON.stringify(portoes())}`).toHaveLength(1);
  });

  it("e não é «sempre» — um portão que casa em todo o lado é o defeito", () => {
    // `min-resolution: 1dppx` casa em TUDO, incluindo o ecrã de densidade 1
    // onde a troca é cinco vezes pior. Se alguém lá chegar a tentar «servir
    // sempre AVIF», isto tem de morder antes de chegar a um casal.
    for (const { onde, valor } of portoes()) {
      expect(valor, `o portão de ${onde} deixou de ser um portão`).toBeGreaterThan(1);
    }
  });
});
