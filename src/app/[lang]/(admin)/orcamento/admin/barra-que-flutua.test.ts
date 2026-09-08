import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { achatar, racioDeContraste } from "./contraste-do-texto.test";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A CÁPSULA QUE FLUTUA — O QUE ELA PROMETE, MEDIDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A barra de destinos do telemóvel passou a ser uma superfície do MATERIAL: a
 * mesma família translúcida dos menus, com a mesma sombra e os mesmos cantos.
 *
 * Isso traz-lhe a mesma armadilha, e é essa que este ficheiro guarda. Um menu
 * abre-se por cima do que estiver por baixo e volta a fechar; esta barra está
 * SEMPRE lá, por cima de qualquer ecrã que ela role — incluindo as grelhas de
 * fotografias dos temas e do material. A tinta que assenta nela não pode ser
 * medida contra o branco do painel: mede-se contra o pior fundo possível, que
 * é preto, exactamente como o `material-do-que-aparece-por-cima.test.ts` mede
 * a família dos menus.
 *
 * ── PORQUE É QUE NÃO ENTROU NAQUELE FICHEIRO ──────────────────────────────
 *
 * Porque aquele varre SETE ficheiros inteiros, e o `AdminClient.tsx` é o
 * container do back office todo — a gaveta, o cabeçalho, a coluna, os avisos.
 * Metê-lo lá dentro punha uma varredura de superfície translúcida a correr
 * sobre ~5000 linhas de superfícies opacas, e uma varredura que falha em cem
 * sítios no dia em que nasce é uma varredura que alguém desliga. Aqui mede-se
 * só o bloco da `<nav>`, que é o que é material.
 *
 * O ESPAÇO que a barra ocupa é outra pergunta e vive noutro sítio:
 * `barra-inferior.test.tsx` guarda a soma (cápsula + folga ≤ o que o conteúdo
 * reserva) e o entalhe do iPhone.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

const AA = 4.5;
type RGB = [number, number, number];
const BRANCO: RGB = [255, 255, 255];
const PRETO: RGB = [0, 0, 0];
const TINTA: RGB = [13, 13, 13];

const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";
function blocoAdmin(): string {
  const inicio = CSS.indexOf(`${SELECTOR_ADMIN} {`);
  expect(inicio, `desapareceu o bloco \`${SELECTOR_ADMIN}\``).toBeGreaterThan(-1);
  return CSS.slice(inicio, CSS.indexOf("\n}", inicio));
}

function token(nome: string): string {
  const m = blocoAdmin().match(new RegExp(`${nome}\\s*:\\s*([^;]+);`));
  expect(m, `o token ${nome} desapareceu`).not.toBeNull();
  return m![1].trim();
}

const hexParaRgb = (h: string): RGB => {
  const s = h.replace("#", "");
  const largo =
    s.length === 3
      ? s
          .split("")
          .map((c) => c + c)
          .join("")
      : s;
  return [0, 2, 4].map((i) => parseInt(largo.slice(i, i + 2), 16)) as RGB;
};

function corComAlpha(valor: string): { cor: RGB; alpha: number } {
  const rgba = valor.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const p = rgba[1].split(",").map((x) => parseFloat(x.trim()));
    return { cor: [p[0], p[1], p[2]], alpha: p[3] ?? 1 };
  }
  const hex = valor.match(/#[0-9a-fA-F]{3,8}/);
  if (!hex) throw new Error(`valor de cor que não sei ler: ${valor}`);
  return { cor: hexParaRgb(hex[0]), alpha: 1 };
}

/** O material assente num fundo — o que o olho vê depois do alpha compor. */
function material(fundo: RGB): RGB {
  const { cor, alpha } = corComAlpha(token("--bo-material"));
  return achatar(cor, alpha, fundo);
}
const tintaSobre = (alpha: number, fundo: RGB) => achatar(TINTA, alpha, fundo);

/** Tira comentários guardando as quebras — a prosa desta casa cita classes. */
function semComentarios(fonte: string): string {
  const guarda = (t: string) => t.replace(/[^\n]/g, " ");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, guarda)
    .replace(/\/\*[\s\S]*?\*\//g, guarda)
    .replace(/^[^\S\n]*\/\/.*$/gm, guarda);
}

/** Só o bloco da `<nav>` da barra, sem a prosa. */
function barra(): string {
  const fonte = semComentarios(readFileSync(join(RAIZ, "AdminClient.tsx"), "utf8"));
  // O nome trocou de peça quando a coluna acabou: a barra passou a ser a
  // navegação do back office nas duas larguras. Ver `a-barra-e-o-menu.test.tsx`.
  const i = fonte.indexOf('aria-label="Navegação do back office"');
  expect(i, "a barra de destinos desapareceu").toBeGreaterThan(-1);
  const f = fonte.indexOf("</nav>", i);
  expect(f, "a `<nav>` da barra não fecha").toBeGreaterThan(-1);
  return fonte.slice(i, f);
}

describe("a cápsula é do material da casa, e não um vidro inventado", () => {
  it("leva a superfície, o desfoque e o raio de pílula — pelas classes, não à mão", () => {
    const b = barra();
    for (const classe of ["bo-material", "bo-material-desfoque", "bo-material-pilula"]) {
      expect(b, `a cápsula perdeu a \`${classe}\``).toContain(classe);
    }
  });

  it("não escreve a sua própria intensidade de desfoque", () => {
    // A mesma promessa dos sete: baixar o desfoque tem de ser mudar UM valor no
    // `globals.css`, e não caçar ficheiros. A barra é a oitava superfície e
    // entra na mesma regra.
    expect(
      barra().match(/\bbackdrop-blur(?:-\[[^\]]*\]|-[a-z0-9]+)?\b/g) ?? [],
      "desfoque escrito à mão na barra: usa a `.bo-material-desfoque`",
    ).toEqual([]);
  });

  it("usa a sombra do que flutua, e não uma escrita à mão", () => {
    expect(barra()).toContain("shadow-[var(--bo-sombra-suspensa)]");
  });

  /**
   * O `--bo-raio-pilula` nos dois sítios: a moldura e a pastilha. Numa cápsula
   * os cantos concêntricos resolvem-se sozinhos (a pílula é o ponto fixo da
   * regra), e é por isso que a pastilha pede a pílula e não `raio − folga`.
   */
  it("a pastilha do activo é concêntrica com a cápsula", () => {
    expect(barra()).toContain("rounded-[var(--bo-raio-pilula)]");
    expect(barra(), "a cápsula perdeu a folga da moldura").toContain(
      "p-[var(--bo-material-folga)]",
    );
  });
});

describe("o que se lê em cima do vidro, medido contra o pior fundo", () => {
  /**
   * O chão de tinta do material, contado a partir dos tokens — o mesmo método
   * do `material-do-que-aparece-por-cima.test.ts`. Mexer na opacidade move o
   * chão sozinho.
   */
  const chao = () => {
    const fundo = material(PRETO);
    for (let a = 40; a <= 100; a++) {
      if (racioDeContraste(tintaSobre(a / 100, fundo), fundo) >= AA) return a / 100;
    }
    throw new Error("nenhum degrau de tinta passa AA sobre este material");
  };

  it("o rótulo do destino em repouso passa AA sobre uma fotografia preta", () => {
    const fundo = material(PRETO);
    const muted = corComAlpha(token("--bo-tinta-64")).alpha;
    const racio = racioDeContraste(tintaSobre(muted, fundo), fundo);
    expect(
      racio,
      `o --bo-text-muted mede ${racio.toFixed(2)}:1 sobre a cápsula assente em preto`,
    ).toBeGreaterThanOrEqual(AA);
  });

  it("a barra não pinta tinta abaixo do chão que este material impõe", () => {
    const limite = chao();
    const faltas: string[] = [];
    barra()
      .split("\n")
      .forEach((linha, i) => {
        for (const m of linha.matchAll(/\btext-(?:foreground|black|white)\/(\d{1,3})\b/g)) {
          if (Number(m[1]) / 100 < limite) faltas.push(`${m[0]} (linha relativa ${i + 1})`);
        }
        for (const morto of ["--bo-text-faint", "--bo-tinta-58", "--bo-tinta-50"]) {
          if (linha.includes(morto)) faltas.push(`${morto} (linha relativa ${i + 1})`);
        }
      });
    expect(
      faltas,
      "tinta abaixo do chão numa superfície translúcida. O `--bo-text-faint` era o " +
        "que a barra usava quando era opaca, e não sobrevive ao vidro:\n" +
        faltas.join("\n"),
    ).toEqual([]);
  });

  /**
   * ── A PASTILHA DO DESTINO ACTIVO É OPACA, E É POR ISSO QUE SE PODE MEDIR ─
   *
   * A lavagem de acento da coluna da esquerda (`--bo-accent-ring`) é
   * translúcida, e ali isso está certo: assenta no branco do painel. Aqui por
   * baixo está vidro, e através dele pode passar uma fotografia escura — a
   * lavagem escurecia com ela e o acento por cima perdia os 4,5:1 sem ninguém
   * dar por isso.
   *
   * Por isso a barra usa a lavagem já ACHATADA sobre branco, opaca. Este caso
   * prova as duas metades: que ela é mesmo opaca, e que o acento por cima dela
   * passa AA.
   */
  it("o acento sobre a pastilha do activo passa AA, e não depende do que está por baixo", () => {
    const lavagem = corComAlpha(token("--bo-accent-lavagem"));
    expect(lavagem.alpha, "a lavagem da barra deixou de ser opaca").toBe(1);

    const acento = hexParaRgb(token("--bo-accent"));
    const racio = racioDeContraste(acento, lavagem.cor);
    expect(
      racio,
      `o acento mede ${racio.toFixed(2)}:1 sobre a pastilha do destino activo`,
    ).toBeGreaterThanOrEqual(AA);

    // E a barra tem mesmo de a usar — senão o número acima não descreve nada.
    expect(barra(), "a pastilha do activo deixou de usar a lavagem opaca").toContain(
      "bg-[var(--bo-accent-lavagem)]",
    );
    expect(
      barra(),
      "a pastilha do activo voltou à lavagem translúcida da coluna, que sobre vidro " +
        "não tem fundo conhecido",
    ).not.toContain("bg-[var(--bo-accent-ring)]");
  });

  /**
   * A lavagem opaca É a translúcida composta sobre branco. Se alguém mexer numa
   * e não na outra, as duas navegações da casa passam a marcar a escolha com
   * dois verdes diferentes — que é o defeito que a coluna já corrigiu uma vez.
   */
  it("a lavagem opaca é a mesma cor que a coluna usa, já achatada sobre branco", () => {
    const anel = corComAlpha(token("--bo-accent-ring"));
    const esperada = achatar(anel.cor, anel.alpha, BRANCO).map(Math.round);
    const escrita = corComAlpha(token("--bo-accent-lavagem")).cor;
    for (let i = 0; i < 3; i++) {
      expect(
        Math.abs(escrita[i] - esperada[i]),
        `a lavagem opaca (${escrita}) descolou-se da lavagem da coluna (${esperada})`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it("não entrou azul nenhum na barra", () => {
    const azuis: string[] = [];
    for (const m of barra().matchAll(/#([0-9a-fA-F]{6})\b/g)) {
      const [r, g, b] = hexParaRgb(m[0]).map((c) => c / 255);
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      if (max - min < 0.08) continue;
      let h: number;
      if (max === r) h = ((g - b) / (max - min)) % 6;
      else if (max === g) h = (b - r) / (max - min) + 2;
      else h = (r - g) / (max - min) + 4;
      h = (h * 60 + 360) % 360;
      if (h >= 190 && h <= 260) azuis.push(`${m[0]} (matiz ${h.toFixed(0)}°)`);
    }
    expect(azuis, `o acento desta casa é o \`--bo-accent\`:\n${azuis.join("\n")}`).toEqual([]);
  });
});
