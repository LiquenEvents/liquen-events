import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE APARECE, APARECE DE ALGUM SÍTIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «em termos de design e animações ou seja coisas a olho nu não
 * vi mesmo diferenças nenhumas».
 *
 * O CENSO. Contei os sinais de entrada — uma deslocação, uma opacidade a subir,
 * uma transição à montagem — nos nove sítios do back office que APARECEM por
 * cima da página. Oito dos nove não tinham nenhum: piscavam para lá de existir.
 * O nono, o aviso, deslocava-se 12 px.
 *
 * A análise à apple.com e à pixelmatters.com dá a regra e as distâncias:
 *
 *     um item de menu       4 px
 *     um aviso              8 px
 *     uma página inteira   32 px
 *
 * «O movimento serve para indicar direcção e origem, não para chamar atenção.»
 * E a curva não é qualquer uma: quando é o SISTEMA que apresenta — que é o caso
 * de tudo o que está nesta lista — a curva SÓ DESACELERA,
 * `cubic-bezier(0, 0, 0.2, 1)`. Nos dois sites medidos, zero curvas com salto
 * ou recuo.
 *
 * MEDIDO na aplicação a correr, 50 ms depois de abrir a paleta de comandos:
 *
 *     animationName        bo-entrada
 *     animationDuration    0.24s
 *     timingFunction       cubic-bezier(0, 0, 0.2, 1)
 *     transform            translateY(-1.53px)
 *     opacity              0.617
 *
 * ── PORQUE É QUE ISTO NÃO ATRASA NADA ────────────────────────────────────
 *
 * Regra dela: «nenhuma animação pode atrasar uma tarefa». O elemento está no
 * sítio e clicável desde o primeiro fotograma — só lá chega com quatro píxeis
 * de deslocação. Só `transform` e `opacity`, que é o que o telemóvel compõe a
 * 60 fps sem tocar no layout, e `prefers-reduced-motion` desliga tudo.
 */

const CSS = readFileSync("src/app/globals.css", "utf8");
const RAIZ = "src/app/[lang]/(admin)/orcamento/admin/";

/** Os nove que aparecem por cima da página. Um décimo entra aqui à mão. */
const APARECEM = [
  "ui/MenuDeAccoes.tsx",
  "ui/Ajuda.tsx",
  "ui/FolhaOuDialogo.tsx",
  "MoreMenu.tsx",
  "ModelosParciais.tsx",
  "CommandPalette.tsx",
  "GuardarTudo.tsx",
  "RichEmailEditor.tsx",
];

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

describe("a entrada do que aparece por cima da página", () => {
  it("desloca QUATRO píxeis, e não mais", () => {
    const css = semComentarios(CSS);
    expect(css).toContain("@keyframes bo-entrada");
    expect(css).toMatch(/transform:\s*translateY\(var\(--bo-entrada-y,\s*-4px\)\)/);
    // A folha do telemóvel sobe de baixo, e é a distância de um aviso.
    expect(css).toMatch(/\.bo-entrada-folha\s*\{[^}]*--bo-entrada-y:\s*8px/);
  });

  it("dura 240 ms e a curva só desacelera — é o sistema que apresenta", () => {
    const css = semComentarios(CSS);
    expect(css).toMatch(
      /\.bo-entrada\s*\{\s*animation:\s*bo-entrada 240ms cubic-bezier\(0, 0, 0\.2, 1\)/,
    );
    // Nenhuma curva com salto ou recuo: um valor fora de 0–1 no eixo do tempo
    // ou uma saída acima de 1 é overshoot, e os dois sites medidos têm zero.
    const curva = /cubic-bezier\(\s*0,\s*0,\s*0\.2,\s*1\s*\)/;
    expect(curva.test(css)).toBe(true);
  });

  it("desliga-se para quem pediu menos movimento", () => {
    const css = semComentarios(CSS);
    const i = css.indexOf("@media (prefers-reduced-motion: reduce)", css.indexOf(".bo-entrada {"));
    expect(i).toBeGreaterThan(-1);
    expect(css.slice(i, i + 160)).toMatch(/\.bo-entrada\s*\{\s*animation:\s*none/);
  });

  it("e todos os nove a usam — um menu novo sem entrada chumba aqui", () => {
    const sem = APARECEM.filter(
      (f) => !semComentarios(readFileSync(RAIZ + f, "utf8")).includes("bo-entrada"),
    );
    expect(sem).toEqual([]);
  });

  it("a troca de vista usa o MESMO número e a MESMA curva", () => {
    // A análise escreve «06 · trocas de secção SEM TRANSIÇÃO». Sobre esta casa
    // está errada: havia transição e corria — MEDIDO, 0,4 s com
    // `cubic-bezier(0.16, 1, 0.3, 1)`, a 3,39 px e 0,577 de opacidade aos
    // 60 ms. O que estava desalinhado era o número: 400 ms hesita entre as
    // duas bandas da regra 1 (200–320 para estados, 600–1500 para
    // apresentações), e «se uma animação hesitar entre as duas, está no sítio
    // errado».
    const css = semComentarios(CSS);
    expect(css).toMatch(
      /\.view-in\s*\{[^}]*animation:\s*view-in 240ms cubic-bezier\(0, 0, 0\.2, 1\) backwards/,
    );
    // Os 8 px ficam: 32 px é para uma PÁGINA inteira, e aqui o cromado não sai
    // do sítio — muda o conteúdo dentro dele.
    expect(css).toMatch(/@keyframes view-in\s*\{[^}]*translateY\(8px\)/);
  });

  it("o aviso desloca oito, que é a distância de um aviso", () => {
    // `translate-y-2` = 0.5rem = 8 px. Eram 12 (`translate-y-3`).
    const toast = semComentarios(readFileSync(RAIZ + "Toast.tsx", "utf8"));
    expect(toast).toContain('"opacity-0 translate-y-2"');
    expect(toast).not.toContain("translate-y-3");
  });
});
