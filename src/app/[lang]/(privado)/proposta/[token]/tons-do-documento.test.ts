import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TONS DA PROPOSTA LEEM-SE — E A DISCRIÇÃO VEM DO TAMANHO, NÃO DO ALFA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * MEDIDO num browser a sério, a 390×844, com uma proposta a sério aberta. O
 * documento pintava OITO forças diferentes do mesmo cinzento e três do mesmo
 * verde, e quatro delas ficavam por baixo da norma:
 *
 *     `text-foreground/55`   3,53:1   ×4   «Nesta página», as pré-visualizações
 *     `text-foreground/60`   4,11:1   ×6   as sobrancelhas de todas as secções
 *     `text-moss/70`         2,70:1   ×3   a letra do grupo (A, B, C), os ▸
 *     `text-moss/60`         2,30:1   ×1   o ponto de cada alínea
 *
 * A sobrancelha é a primeira palavra de cada secção e a letra do grupo é a
 * CHAVE que liga «A — Cerimónia» à linha do orçamento com o mesmo A. Não são
 * enfeites: são o mapa do documento, e estavam a 2,7:1 num telemóvel que ela
 * abre ao sol, numa quinta.
 *
 * ── PORQUE É QUE O VERDE DEIXOU DE SER DILUÍDO ────────────────────────────
 *
 * `--color-moss` a 100% dá 4,69:1 sobre branco — passa, mas por uma unha. Toda
 * a diluição a partir daí cai: /70 dá 2,70. Ou seja, não havia margem nenhuma
 * para gastar em alfa, e gastava-se em quatro sítios.
 *
 * Passa a `--color-moss-dark` (6,70:1), inteiro. Quando uma marca verde tiver
 * de ser discreta, a discrição vem do TAMANHO — um `·` de 15 px e um `▸` de
 * 11 px já são discretos por serem pequenos —, não de lavar a tinta. É a mesma
 * decisão que o `globals.css` já tomou para a barra de navegação da página
 * creme, e pela mesma razão.
 *
 * ── E OS OITO CINZENTOS SÃO SEIS ──────────────────────────────────────────
 *
 * O /55 e o /60 eram o mesmo papel escrito com dois números — 3,53 e 4,11, uma
 * diferença que ninguém vê e que falha nas duas. Ficam num só degrau: /70,
 * 5,65:1. É a forma dos 47 cinzentos do back office, no documento que os
 * clientes dela lêem.
 *
 * ── PORQUE É QUE ISTO É UMA CONTA E NÃO UM PASSEIO ────────────────────────
 *
 * O varrimento no browser foi o que os ENCONTROU. Mas um passeio depende de a
 * página ter dados, e este documento só se desenha com uma proposta assinada e
 * por prazo. Uma conta não depende de nada — e é ela que impede a correcção de
 * se desfazer sem ninguém dar por isso.
 */

const RAIZ = process.cwd();
const AQUI = "src/app/[lang]/(privado)/proposta/[token]";

/** Os dois ficheiros que desenham o documento sobre o papel branco da página.
 *  A `Inspiracao.tsx` fica DE FORA de propósito: a lightbox dela pinta o seu
 *  próprio fundo preto, e medir o texto dela contra branco daria um número que
 *  não é o verdadeiro — a armadilha que o `contraste-dos-rotulos.test.ts` já
 *  descreve por extenso. */
const FICHEIROS = [`${AQUI}/Documento.tsx`, `${AQUI}/page.tsx`];

const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (p: number[]) =>
  0.2126 * canal(p[0] / 255) + 0.7152 * canal(p[1] / 255) + 0.0722 * canal(p[2] / 255);
const ler = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** O alfa achatado ANTES de medir, que é onde toda a gente se engana. */
const achatar = (frente: number[], alfa: number, fundo: number[]) =>
  frente.map((c, i) => c * alfa + fundo[i] * (1 - alfa));
const racio = (a: number[], b: number[]) => {
  const [alto, baixo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
};

const BRANCO = [255, 255, 255];
const MINIMO = 4.5;

/**
 * A paleta vem do `@theme` do `globals.css`, e não escrita aqui à mão.
 *
 * Se ficasse aqui à mão, mudar a paleta deixava esta conta a medir uma cor que
 * já não existe — e a passar. O teste a seguir prende os valores que a conta
 * assume, para que uma mudança de paleta apareça como uma falha com nome, e
 * não como um silêncio.
 */
function paleta(): Record<string, string> {
  /**
   * As duas folhas, porque o `@theme` mudou de casa: vive agora no `tema.css`,
   * para o `admin.css` o poder referir sem herdar o `@source not` do
   * `globals.css` (a exclusão é absoluta e punha o back office sem estilos).
   * Lêem-se as duas juntas para esta conta não voltar a partir se ele mudar
   * outra vez de sítio.
   */
  const css =
    readFileSync(join(RAIZ, "src/app/globals.css"), "utf8") +
    readFileSync(join(RAIZ, "src/app/tema.css"), "utf8");
  const tema = css.slice(css.indexOf("@theme {"), css.indexOf("@theme {") + 2000);
  const fora: Record<string, string> = {};
  for (const [, nome, hex] of tema.matchAll(/--color-([a-z-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    fora[nome] = hex;
  }
  return fora;
}

/** Cada `text-<token>` ou `text-<token>/<alfa>` escrito nos ficheiros. */
function tonsEscritos(): { onde: string; token: string; alfa: number; linha: number }[] {
  const fora: { onde: string; token: string; alfa: number; linha: number }[] = [];
  for (const f of FICHEIROS) {
    const linhas = readFileSync(join(RAIZ, f), "utf8").split("\n");
    linhas.forEach((l, i) => {
      for (const [, token, alfa] of l.matchAll(
        /\btext-(foreground|moss|moss-dark|moss-light|gold|gold-dark)(?:\/(\d{1,3}))?\b/g,
      )) {
        fora.push({
          onde: `${f.split("/").pop()}:${i + 1}`,
          token,
          alfa: alfa === undefined ? 100 : Number(alfa),
          linha: i + 1,
        });
      }
    });
  }
  return fora;
}

describe("os tons com que a proposta é escrita", () => {
  const cores = paleta();

  it("CONTROLO POSITIVO: a paleta foi mesmo lida, e é a que esta conta assume", () => {
    // Sem isto, um `@theme` movido de sítio dava um objecto vazio e todos os
    // tons a seguir mediam `undefined` — que não falha, desaparece.
    expect(cores["foreground"], "--color-foreground mudou; refaz as contas deste ficheiro").toBe(
      "#2a2620",
    );
    expect(cores["moss"]).toBe("#637a5f");
    expect(cores["moss-dark"]).toBe("#4c6150");
  });

  it("CONTROLO POSITIVO: a conta reprova mesmo os tons que estavam lá", () => {
    // Os quatro que o browser encontrou. Se algum destes passasse a «passar», a
    // aritmética estaria errada e o teste a seguir não guardava nada.
    const antes: [string, number, number][] = [
      ["foreground", 55, 3.53],
      ["foreground", 60, 4.11],
      ["moss", 70, 2.7],
      ["moss", 60, 2.3],
    ];
    for (const [token, alfa, esperado] of antes) {
      const medido = racio(achatar(ler(cores[token]), alfa / 100, BRANCO), BRANCO);
      expect(medido, `${token}/${alfa}`).toBeCloseTo(esperado, 1);
      expect(medido, `${token}/${alfa} devia falhar a norma`).toBeLessThan(MINIMO);
    }
  });

  it("CONTROLO POSITIVO: o varrimento encontra mesmo tons nos ficheiros", () => {
    // Um caminho errado daria uma lista vazia, e uma lista vazia passa tudo.
    const tons = tonsEscritos();
    expect(tons.length).toBeGreaterThan(20);
    expect(tons.some((t) => t.token === "foreground")).toBe(true);
    expect(tons.some((t) => t.token.startsWith("moss"))).toBe(true);
  });

  it("nenhum tom escrito no documento fica por baixo de 4,5:1 sobre o papel branco", () => {
    const falhas: string[] = [];
    for (const { onde, token, alfa } of tonsEscritos()) {
      const hex = cores[token];
      if (!hex) {
        falhas.push(`${onde}: token «${token}» não existe na paleta`);
        continue;
      }
      const medido = racio(achatar(ler(hex), alfa / 100, BRANCO), BRANCO);
      if (medido < MINIMO) {
        falhas.push(`${onde}: text-${token}/${alfa} mede ${medido.toFixed(2)}:1`);
      }
    }
    expect(falhas, `tons por baixo da norma:\n  ${falhas.join("\n  ")}`).toEqual([]);
  });

  it("o verde do documento não é diluído — a discrição vem do tamanho", () => {
    // `--color-moss` a 100% já só dá 4,69:1: não há margem nenhuma para gastar
    // em alfa, e era exactamente isso que se fazia em quatro sítios.
    //
    // Esta regra é mais apertada do que a conta acima, de propósito. Um
    // `text-moss-dark/90` PASSA a norma (5,23:1) e mesmo assim está proibido
    // aqui: é por degraus que passam que um princípio se esboroa, e o degrau
    // seguinte — /80, 4,14 — já não passa. Discrição faz-se com tamanho.
    const diluidos = tonsEscritos().filter((t) => t.token.startsWith("moss") && t.alfa < 100);
    expect(
      diluidos.map((t) => `${t.onde}: text-${t.token}/${t.alfa}`),
      "verde diluído: usa `text-moss-dark` inteiro e deixa o tamanho fazer a discrição",
    ).toEqual([]);
  });
});
