import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A BARRA DE BAIXO E O ESPAÇO QUE LHE É GUARDADO — UM NÚMERO SÓ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A barra é `fixed`: não empurra nada. Tudo o que não lhe pode ficar por baixo
 * — a última linha da lista, o aviso de erro, a barra do total do estúdio —
 * tem de saber a altura dela. Estava escrita à mão em QUATRO sítios.
 *
 * Números iguais em sítios diferentes afastam-se sempre, e estes afastaram-se
 * todos ao mesmo tempo: ao levantar os rótulos da barra de 8 px para o chão de
 * 12 px (ver `escala-movel.test.ts`), «Fazer proposta» passou a partir em duas
 * linhas e a barra cresceu de 56 px para 71 — medido a 390×844. O resto
 * continuou a guardar 56. Quinze píxeis de lista debaixo da barra, e o aviso de
 * erro a pousar-lhe em cima, que é o pior momento para tapar a saída.
 *
 * A partir daqui é um token só: `--bo-barra-inferior`. Não podem discordar
 * porque são o mesmo sítio.
 */

const RAIZ = join(process.cwd(), "src/app/[lang]/(site)/orcamento/admin");
const ADMIN = readFileSync(join(RAIZ, "AdminClient.tsx"), "utf8");
const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");

/**
 * Todos os `.tsx` do back office, para procurar cópias do número em QUALQUER
 * ficheiro — e não só nos dois que eu por acaso me lembrei de abrir.
 *
 * Este teste começou a olhar só para o `AdminClient.tsx`, e passou. A terceira
 * cópia do «56px» estava no `Toast.tsx`, a posicionar o aviso de erro: quando a
 * barra cresceu para 72, o aviso passou a pousar-lhe em cima — e ainda por cima
 * num ficheiro cujo comentário explicava, com medições, porque é que isso não
 * podia acontecer. Quem o apanhou foi o `admin-mobile.spec.ts`.
 *
 * A lição não é «o `Toast.tsx` também conta». É que uma constante duplicada não
 * se guarda com uma lista de sítios conhecidos: guarda-se procurando em todos.
 */
function ficheirosDoBackOffice(dir = RAIZ, acc: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) ficheirosDoBackOffice(p, acc);
    else if (e.name.endsWith(".tsx") && !e.name.includes(".test.")) acc.push(p);
  }
  return acc;
}

describe("a barra de destinos do telemóvel", () => {
  it("declara a sua altura num token, e não num número solto", () => {
    expect(CSS).toMatch(/--bo-barra-inferior:\s*\d+px/);
  });

  it("guarda ao conteúdo exactamente a altura que ocupa", () => {
    // O conteúdo reserva o token — não «56px» copiado à mão.
    expect(ADMIN).toMatch(
      /pb-\[calc\(var\(--bo-barra-inferior\)\+env\(safe-area-inset-bottom\)\)\]/,
    );
  });

  it("nenhum ficheiro do back office volta a cravar a altura à mão", () => {
    // Qualquer `calc(...)` que combine um número em px com o entalhe está a
    // remontar a altura da barra por fora do token — foi assim que o aviso de
    // erro se descolou dela. A busca é em TODOS os ficheiros de propósito: a
    // cópia que fez falha estava justamente naquele em que ninguém olhou.
    const reincidentes: string[] = [];
    for (const f of ficheirosDoBackOffice()) {
      const src = readFileSync(f, "utf8");
      // Só o CÓDIGO: os comentários contam a história e mencionam o «56px».
      const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      if (/calc\(\s*\d+px\s*\+\s*env\(safe-area-inset-bottom\)/.test(semComentarios)) {
        reincidentes.push(f.slice(RAIZ.length + 1));
      }
    }
    expect(reincidentes, `altura da barra remontada à mão em: ${reincidentes.join(", ")}`).toEqual(
      [],
    );
  });

  /**
   * A SEGUNDA BARRA — a acção principal do estúdio — e quem lhe flutua por cima.
   *
   * O aviso do `Toast.tsx` põe-se a uma distância fixa do fundo: a altura da
   * navegação do telemóvel mais um respiro de 12 px. Só que no estúdio de
   * propostas há uma SEGUNDA barra pousada nessa navegação, com uns 64 px — e o
   * aviso nascia lá dentro, em cima do botão «Pré-visualizar», a comer-lhe o
   * toque durante os quatro segundos em que fica no ecrã. Medido a 375 px.
   *
   * A altura dessa segunda barra não é um número que se possa escrever aqui:
   * ela quebra em duas linhas conforme o passo. Por isso é MEDIDA de um lado e
   * lida do outro, através de `--bo-barra-accao`. Este teste guarda as duas
   * pontas — se uma desaparecer, a outra fica a apontar para o vazio.
   */
  it("o aviso afasta-se também da barra de acção do estúdio", () => {
    const TOAST = readFileSync(join(RAIZ, "Toast.tsx"), "utf8");
    const ESTUDIO = readFileSync(join(RAIZ, "ProposalStudio.tsx"), "utf8");

    // Quem lê: as duas posições do aviso (telemóvel e `lg`) somam a variável.
    expect(TOAST).toMatch(/bottom-\[calc\(var\(--bo-barra-inferior\)\+var\(--bo-barra-accao,0px\)/);
    expect(TOAST).toMatch(/lg:bottom-\[calc\(var\(--bo-barra-accao,0px\)/);

    // Quem escreve: o estúdio publica a altura medida, e limpa-a ao sair.
    expect(ESTUDIO).toContain('setProperty("--bo-barra-accao"');
    expect(ESTUDIO).toContain('removeProperty("--bo-barra-accao")');
  });

  it("a própria barra usa o token como altura mínima", () => {
    const i = ADMIN.indexOf('aria-label="Destinos principais"');
    expect(i).toBeGreaterThan(-1);
    // Os botões da barra ficam na janela dos ~3.5 kB a seguir à `<nav>`.
    const bloco = ADMIN.slice(i, i + 3500);
    expect(bloco).toMatch(/min-h-\[var\(--bo-barra-inferior\)\]/);
  });
});
