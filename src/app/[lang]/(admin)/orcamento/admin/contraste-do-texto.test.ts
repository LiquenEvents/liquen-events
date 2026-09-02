import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O SELECTOR COM QUE O BACK OFFICE SE PINTA.
 *
 * Deixou de ser só `body.admin-mode`: a classe entra num efeito e chegava
 * tarde de mais para o primeiro pixel. Agora é
 * `body:is(.admin-mode, :has([data-admin-mode]))`, com o atributo servido pelo
 * `layout.tsx` do grupo `(admin)`. A razão por extenso está no `globals.css`.
 */
const SELECTOR_ADMIN = "body:is(.admin-mode, :has([data-admin-mode]))";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O CONTRASTE DO TEXTO DO BACK OFFICE — a conta, e não a impressão
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * PORQUE EXISTE. Os três tokens de texto do back office viviam com os rácios
 * ESCRITOS À MÃO no comentário ao lado deles, em `globals.css`. Estavam os três
 * errados, e não um pouco:
 *
 *     token              dizia      media DE VERDADE (sobre branco)
 *     --bo-text          ~6,4:1     11,63:1   — muito mais escuro do que se julgava
 *     --bo-text-muted    ~5,6:1      5,91:1   — perto, e passa
 *     --bo-text-faint    ~4,1:1      3,41:1   — FALHA os 4,5:1 exigidos
 *
 * O `--bo-text-faint` era o que interessava: estava anunciado como «≥3:1,
 * decorativo, nunca o único portador de informação» e media 3,41:1 — mas a
 * varredura dos `.tsx` mostrou 25 usos, e entre eles o EMAIL DO CLIENTE
 * (`ClientMessenger.tsx`), a REFERÊNCIA DO PEDIDO (`AdminClient.tsx`) e os
 * rótulos dos destinos da barra de navegação. Nenhum deles é decoração: são
 * exactamente «o único portador de informação» que o comentário jurava evitar.
 * A premissa que dispensava o token de cumprir 4,5:1 não se confirmava no
 * código, e portanto o token tinha de subir.
 *
 * ── PORQUE É QUE UM NÚMERO À MÃO NUM COMENTÁRIO SE ESTRAGA SEMPRE ─────────
 *
 * Porque ninguém o recalcula ao mexer no token. Um comentário que diz «~4,1:1»
 * por cima de um valor que mede 3,41:1 é PIOR do que não ter comentário
 * nenhum: dá permissão a quem lê para não voltar a medir. Foi o que aconteceu
 * — e uma auditoria a correr em produção chegou a atribuir o defeito a cores
 * (`#ABABAB`, `#9B9B9B`) e a um token (`--texto-secundario`) que não existem em
 * lado nenhum deste repositório.
 *
 * Daí este ficheiro: a conta passa a correr na CI, a partir do CSS verdadeiro.
 * O comentário do `globals.css` continua a ter os números escritos — mas agora
 * há quem os desminta.
 *
 * ── A ARMADILHA QUE APANHA QUASE TODA A GENTE: O ALPHA ────────────────────
 *
 * Os tokens não são cores opacas, são `rgba(13, 13, 13, α)`. O rácio NÃO se
 * calcula sobre `#0d0d0d` — calcula-se sobre a cor COMPOSTA, o que o olho vê
 * depois de o alpha assentar no fundo. Medir `#0d0d0d` sobre branco dá 19,4:1
 * e é uma resposta bonita e completamente falsa: `--bo-text-faint` a 0,48 sobre
 * branco é `#8b8b8b`, e são 3,41:1.
 *
 * E o fundo também pode ser composto: `--bo-surface-hover` é
 * `rgba(13,13,13,0.045)` sobre branco, e `--bo-tint-accent` é
 * `rgba(76,99,80,0.10)` sobre branco. Ambos são achatados aqui antes de
 * entrarem na conta, porque um fundo mais escuro BAIXA o rácio de texto escuro
 * — é o pior caso, e é o que tem de passar.
 *
 * ── PORQUÊ 4,5:1 ─────────────────────────────────────────────────────────
 *
 * WCAG 2.1, critério 1.4.3 (Contrast Minimum), nível AA, texto normal. O texto
 * grande (≥18,66 px a negrito ou ≥24 px) podia ficar-se por 3:1, mas estes três
 * tokens vestem sobretudo texto PEQUENO — a escala da casa começa nos 12 px —,
 * portanto o limiar que se lhes aplica é o dos 4,5:1, sem excepção a inventar.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/** WCAG 2.1 §1.4.3 — texto normal. */
const AA_TEXTO_NORMAL = 4.5;

type RGB = [number, number, number];

/**
 * ── A FÓRMULA, escrita por extenso ────────────────────────────────────────
 *
 * Está aqui em vez de numa dependência nova de propósito: são doze linhas, a
 * norma não muda, e o que se ganha é poder LER a conta que decide a cor do
 * texto que ela vê todos os dias.
 */

/** Canal sRGB 0–255 → linear. (WCAG: `C/12.92` abaixo do joelho, gama 2.4 acima.) */
function linearizar(canal: number): number {
  const s = canal / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** Luminância relativa: `L = 0.2126·R + 0.7152·G + 0.0722·B`, em linear. */
export function luminanciaRelativa([r, g, b]: RGB): number {
  return 0.2126 * linearizar(r) + 0.7152 * linearizar(g) + 0.0722 * linearizar(b);
}

/** Rácio de contraste: `(L_claro + 0.05) / (L_escuro + 0.05)`. Entre 1 e 21. */
export function racioDeContraste(a: RGB, b: RGB): number {
  const la = luminanciaRelativa(a);
  const lb = luminanciaRelativa(b);
  const [claro, escuro] = la > lb ? [la, lb] : [lb, la];
  return (claro + 0.05) / (escuro + 0.05);
}

/**
 * Achata `cor` com opacidade `alpha` sobre `fundo` — a composição «source-over»
 * que o browser faz. É este passo que quase toda a gente salta.
 */
export function achatar(cor: RGB, alpha: number, fundo: RGB): RGB {
  return cor.map((c, i) => alpha * c + (1 - alpha) * fundo[i]) as RGB;
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

/** `rgba(13, 13, 13, 0.58)` → `{ cor, alpha }`; `#ffffff` → alpha 1. */
function lerCor(valor: string): { cor: RGB; alpha: number } {
  const rgba = valor.match(/rgba?\(([^)]+)\)/);
  if (rgba) {
    const partes = rgba[1].split(",").map((p) => parseFloat(p.trim()));
    return { cor: [partes[0], partes[1], partes[2]], alpha: partes[3] ?? 1 };
  }
  const hex = valor.match(/#[0-9a-fA-F]{3,8}/);
  if (!hex) throw new Error(`valor de cor que não sei ler: ${valor}`);
  return { cor: hexParaRgb(hex[0]), alpha: 1 };
}

/**
 * O bloco `body.admin-mode { … }` do `globals.css`, que é onde os tokens de COR
 * do back office vivem — e não no `@theme`, nem no `:root`.
 *
 * (Isto não é arrumação, tem consequência: a classe `admin-mode` só entra num
 * `useEffect`, portanto o que é servido pelo servidor sem JS — um `loading.tsx`
 * — nunca vê estes tokens. Foi por isso que a escala de ESPAÇO, de que os
 * esqueletos dependem, foi deliberadamente posta no `:root` vinte linhas
 * abaixo, com o porquê escrito lá. Confirmei que nenhum `loading.tsx`,
 * `page.tsx` ou `layout.tsx` do back office usa os `--bo-text-*`, portanto
 * mexer-lhes aqui não deixa nada por pintar.)
 */
function blocoAdminMode(): string {
  const inicio = CSS.indexOf(`${SELECTOR_ADMIN} {`);
  expect(inicio, `desapareceu o bloco \`${SELECTOR_ADMIN}\` do globals.css`).toBeGreaterThan(-1);
  const fim = CSS.indexOf("\n}", inicio);
  return CSS.slice(inicio, fim);
}

/** Um token declarado no bloco do back office. */
function token(nome: string): { cor: RGB; alpha: number } {
  const m = blocoAdminMode().match(new RegExp(`${nome}\\s*:\\s*([^;]+);`));
  expect(m, `o token ${nome} desapareceu de ${SELECTOR_ADMIN}`).not.toBeNull();
  return lerCor(m![1]);
}

const BRANCO: RGB = [255, 255, 255];

/**
 * As superfícies em que o texto do back office assenta, já achatadas.
 *
 * Um fundo mais escuro baixa o rácio de texto escuro, portanto o que interessa
 * é que o token passe no PIOR destes — não no branco, que é o mais generoso.
 */
function superficies(): { nome: string; cor: RGB }[] {
  const sunken = token("--bo-surface-sunken");
  const hover = token("--bo-surface-hover");
  const tint = token("--bo-tint-accent");
  return [
    { nome: "--bo-surface (branco)", cor: BRANCO },
    { nome: "--bo-surface-sunken", cor: achatar(sunken.cor, sunken.alpha, BRANCO) },
    { nome: "--bo-surface-hover (sobre branco)", cor: achatar(hover.cor, hover.alpha, BRANCO) },
    { nome: "--bo-tint-accent (sobre branco)", cor: achatar(tint.cor, tint.alpha, BRANCO) },
  ];
}

/** Os tokens que vestem TEXTO. (Os de contorno e sombra têm outro critério.) */
const TOKENS_DE_TEXTO = ["--bo-text", "--bo-text-muted", "--bo-text-faint"];

describe("o texto do back office cumpre o contraste mínimo AA", () => {
  /**
   * Sem isto, um erro na fórmula que devolvesse sempre um número grande fazia
   * a suite inteira passar sem medir nada. Os três valores são verificáveis à
   * mão contra a norma.
   */
  it("a fórmula está certa (os casos que a norma fixa)", () => {
    const preto: RGB = [0, 0, 0];
    // Os extremos: o rácio máximo possível é 21:1, e uma cor consigo é 1:1.
    expect(racioDeContraste(preto, BRANCO)).toBeCloseTo(21, 5);
    expect(racioDeContraste(BRANCO, BRANCO)).toBeCloseTo(1, 5);
    // O cinzento #767676 é o exemplo clássico da norma: o mais claro que ainda
    // passa 4,5:1 sobre branco.
    expect(racioDeContraste(hexParaRgb("#767676"), BRANCO)).toBeGreaterThanOrEqual(4.5);
    expect(racioDeContraste(hexParaRgb("#777777"), BRANCO)).toBeLessThan(4.5);
    // E a luminância relativa do branco é 1, a do preto 0.
    expect(luminanciaRelativa(BRANCO)).toBeCloseTo(1, 5);
    expect(luminanciaRelativa(preto)).toBeCloseTo(0, 5);
  });

  /**
   * O passo que dá os enganos todos. Se `achatar` fosse ignorado,
   * `--bo-text-faint` mediria 19,4:1 (a cor opaca) em vez dos 3,41:1 que o olho
   * via — e esta rede daria luz verde ao defeito que existe para apanhar.
   */
  it("achata o alpha antes de medir, que é onde o erro costuma estar", () => {
    const meio = achatar([13, 13, 13], 0.5, BRANCO);
    expect(meio[0]).toBeCloseTo(134, 0);
    // A prova pelo absurdo: medir sem achatar dá uma resposta muito diferente.
    expect(racioDeContraste([13, 13, 13], BRANCO)).toBeGreaterThan(19);
    expect(racioDeContraste(meio, BRANCO)).toBeLessThan(4.5);
  });

  it("a rede está mesmo armada (lê tokens a sério, não uma lista vazia)", () => {
    expect(TOKENS_DE_TEXTO.length).toBe(3);
    expect(superficies().length).toBe(4);
    for (const nome of TOKENS_DE_TEXTO) {
      const { cor, alpha } = token(nome);
      expect(alpha, `${nome} sem alpha legível`).toBeGreaterThan(0);
      expect(cor.every((c) => c >= 0 && c <= 255)).toBe(true);
    }
  });

  /**
   * ── A REDE ────────────────────────────────────────────────────────────────
   * Cada token de texto, contra cada superfície em que assenta. Um token que
   * volte a descer abaixo de 4,5:1 põe isto vermelho com o nome, o fundo e o
   * número medido — que é a diferença entre uma correcção de uma vez e uma
   * garantia.
   */
  it("nenhum token de texto desce abaixo de 4,5:1 em fundo nenhum", () => {
    const falhas: string[] = [];
    for (const nome of TOKENS_DE_TEXTO) {
      const { cor, alpha } = token(nome);
      for (const fundo of superficies()) {
        const racio = racioDeContraste(achatar(cor, alpha, fundo.cor), fundo.cor);
        if (racio < AA_TEXTO_NORMAL) {
          falhas.push(`${nome} sobre ${fundo.nome}: ${racio.toFixed(2)}:1 (mínimo 4,5:1)`);
        }
      }
    }
    expect(falhas, falhas.join("\n")).toEqual([]);
  });

  /**
   * A outra metade da promessa, e a que impede a correcção de se transformar em
   * excesso de zelo: isto é uma marca sóbria, e o texto secundário É PARA SER
   * suave. Cada token foi posto no valor MAIS CLARO que ainda passa — o degrau
   * seguinte para cima (0,57 no `faint`) mede 4,42:1 sobre o tint e chumba.
   *
   * Este teste guarda o outro lado: se alguém «resolver» um problema de
   * contraste empurrando os cinzentos para preto, cai aqui. Um token de texto
   * secundário acima de ~9:1 deixou de ser secundário.
   */
  it("e não se transformou em preto — os cinzentos continuam suaves", () => {
    const excessivos: string[] = [];
    for (const nome of ["--bo-text-muted", "--bo-text-faint"]) {
      const { cor, alpha } = token(nome);
      const racio = racioDeContraste(achatar(cor, alpha, BRANCO), BRANCO);
      if (racio > 9) excessivos.push(`${nome}: ${racio.toFixed(2)}:1 — é secundário, não é corpo`);
    }
    expect(excessivos, excessivos.join("\n")).toEqual([]);
  });
});
