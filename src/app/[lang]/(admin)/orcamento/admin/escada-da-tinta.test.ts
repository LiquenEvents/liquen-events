import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA TINTA, CINCO DEGRAUS — E NENHUM VALOR SOLTO A VOLTAR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A análise da Pixelmatters trouxe o achado que arruma os cinzentos do back
 * office: eles não têm paleta nenhuma. Têm uma cor e uma escala de opacidades
 * com o número no nome. Com paleta, cada componente novo obriga a decidir uma
 * cor; com escala, a pergunta passa a ser em que degrau isto está.
 *
 * Antes desta rede havia QUARENTA E SETE grafias de cinzento nos riscos e nos
 * fundos do back office, em 588 chamadas — `[0.015]`, `[0.018]`, `[0.02]`,
 * `[0.025]`, `[0.03]`, `[0.035]`, `[0.04]`… Meio por cento de diferença não é
 * hierarquia; é a mesma decisão tomada outra vez por não haver onde a ir
 * buscar.
 *
 * Este teste é o «onde a ir buscar». Falha quando alguém escreve um cinzento
 * novo à mão, e a mensagem diz qual é o degrau que lhe serve.
 *
 * ── O QUE FICA DE FORA, E PORQUÊ ──────────────────────────────────────────
 *
 * Riscos acima de 18% e fundos acima de 12% não são desta escala: são
 * molduras e enchimentos que se querem VER (o contorno de um campo, uma faixa
 * de aviso). Esses continuam a escolher-se um a um, e este teste não lhes
 * toca. A escala que aqui se guarda é a da tinta quase invisível, que é onde
 * a inconsistência vivia.
 *
 * O TEXTO também fica de fora, e não por esquecimento: num fundo branco os
 * degraus baixos da escala não podem carregar letra nenhuma — 48% de preto
 * sobre branco dá ~3,5:1 e chumba a norma. A escada do texto tem os seus três
 * degraus medidos e o seu próprio teste (`contraste-do-texto.test.ts`).
 */

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
const RAIZ = path.join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");

/** Os cinco degraus, e o valor exacto de cada um. */
const ESCADA: Record<string, string> = {
  // Riscos e fundos.
  "--bo-tinta-3": "rgba(13, 13, 13, 0.03)",
  "--bo-tinta-6": "rgba(13, 13, 13, 0.06)",
  "--bo-tinta-8": "rgba(13, 13, 13, 0.08)",
  "--bo-tinta-10": "rgba(13, 13, 13, 0.1)",
  "--bo-tinta-13": "rgba(13, 13, 13, 0.13)",
  // Texto. São QUATRO e não os seis da análise, e a norma é que decide: sobre
  // branco, 48% de preto dá ~3,5:1 e chumba. O último que passa é o 58.
  "--bo-tinta-58": "rgba(13, 13, 13, 0.58)",
  "--bo-tinta-64": "rgba(13, 13, 13, 0.64)",
  "--bo-tinta-72": "rgba(13, 13, 13, 0.72)",
  "--bo-tinta-82": "rgba(13, 13, 13, 0.82)",
};

function ficheirosDeEcra(dir: string, saco: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) ficheirosDeEcra(p, saco);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) saco.push(p);
  }
  return saco;
}

describe("a escada da tinta do back office", () => {
  it("tem os cinco degraus, com o número do degrau no nome", () => {
    for (const [nome, valor] of Object.entries(ESCADA)) {
      expect(CSS, `falta o degrau \`${nome}\` no globals.css`).toContain(`${nome}: ${valor}`);
    }
  });

  it("e os dois nomes de papel são apelidos de degraus, não valores à parte", () => {
    // `--bo-hairline` e `--bo-hairline-strong` estão em centenas de chamadas e
    // dizem o que a coisa É. Ficam — mas apontados à escada, senão são dois
    // valores a viver por sua conta outra vez.
    expect(CSS).toContain("--bo-hairline: var(--bo-tinta-8)");
    expect(CSS).toContain("--bo-hairline-strong: var(--bo-tinta-13)");
    expect(CSS).toContain("--bo-text: var(--bo-tinta-82)");
    expect(CSS).toContain("--bo-text-muted: var(--bo-tinta-64)");
    expect(CSS).toContain("--bo-text-faint: var(--bo-tinta-58)");
  });

  it("e nenhum ecrã inventa um cinzento quase invisível fora dela", () => {
    const padrao = /\b(border|bg|divide|ring)-foreground\/(\[[0-9.]+\]|[0-9]+)/g;
    const soltos: string[] = [];

    for (const f of ficheirosDeEcra(RAIZ)) {
      const texto = fs.readFileSync(f, "utf8");
      for (const m of texto.matchAll(padrao)) {
        const [tudo, utilitario, valor] = m;
        const alfa = valor.startsWith("[") ? Number(valor.slice(1, -1)) : Number(valor) / 100;
        const dentroDaEscada = utilitario === "bg" ? alfa <= 0.12 : alfa <= 0.18;
        if (!dentroDaEscada) continue;
        const degrau =
          utilitario === "bg"
            ? alfa <= 0.035
              ? "--bo-tinta-3"
              : alfa <= 0.07
                ? "--bo-tinta-6"
                : "--bo-tinta-10"
            : alfa <= 0.09
              ? "--bo-hairline"
              : "--bo-hairline-strong";
        soltos.push(
          `  ${path.relative(RAIZ, f)}: \`${tudo}\` → \`${utilitario}-[var(${degrau})]\``,
        );
      }
    }

    expect(
      soltos,
      `${soltos.length} cinzento(s) escritos à mão em vez de um degrau da escada.\n` +
        `Cada um destes tem um degrau que lhe serve — a troca é directa:\n` +
        soltos.slice(0, 20).join("\n"),
    ).toEqual([]);
  });

  /**
   * ── E A FAIXA DO TEXTO QUE PASSA A NORMA ──────────────────────────────────
   *
   * Só de 55% para cima, e a fronteira não é arbitrária: abaixo de 58% de preto
   * sobre branco nenhum texto normal passa os 4,5:1 da WCAG 1.4.3. Portanto a
   * faixa acima é a que se pode arrumar mecanicamente — todos os valores lá
   * dentro passam antes e depois, e nenhum perde mais do que três por cento de
   * contraste.
   *
   * A faixa ABAIXO — 592 chamadas quando isto se escreveu — fica de fora de
   * propósito, e é a parte honesta deste teste. Ali estão três coisas
   * misturadas: texto GRANDE (que só precisa de 3:1), ÍCONES e traços (que não
   * são texto e têm a sua própria escada), e falhas verdadeiras. Um degrau
   * escolhido por um script ou escurecia trezentos ícones ou tapava as falhas.
   * Essa faixa quer olhos, e o passeio de contraste é que lhe há-de chegar.
   */
  it("e nenhum ecrã inventa um cinzento de TEXTO acima do chão da norma", () => {
    const padrao = /\btext-foreground\/(\[[0-9.]+\]|[0-9]+)/g;
    const soltos: string[] = [];

    for (const f of ficheirosDeEcra(RAIZ)) {
      const texto = fs.readFileSync(f, "utf8");
      for (const m of texto.matchAll(padrao)) {
        const [tudo, valor] = m;
        const alfa = valor.startsWith("[") ? Number(valor.slice(1, -1)) : Number(valor) / 100;
        if (alfa < 0.55) continue;
        const degrau =
          alfa >= 0.78
            ? "--bo-text"
            : alfa >= 0.7
              ? "--bo-tinta-72"
              : alfa >= 0.6
                ? "--bo-text-muted"
                : "--bo-text-faint";
        soltos.push(`  ${path.relative(RAIZ, f)}: \`${tudo}\` → \`text-[var(${degrau})]\``);
      }
    }

    expect(
      soltos,
      `${soltos.length} cinzento(s) de texto escritos à mão em vez de um degrau da escada.\n` +
        soltos.slice(0, 20).join("\n"),
    ).toEqual([]);
  });
});
