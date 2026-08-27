// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import AdminLayout from "./layout";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O BACK OFFICE TEM DE TER UM `<main>` — E NÃO PODE TER O CANCELAMENTO DELE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO, e como ele nasceu. Enquanto o back office viveu dentro do grupo
 * `(site)`, herdava o `CromadoDoSitio`, e de lá vinha
 *
 *     <main id="conteudo" tabIndex={-1} className="flex-1 pt-24 outline-none">
 *
 * Tirar o cromado do back office (achado D-01 — o menu do sítio de marketing
 * estava MESMO montado lá dentro) levou o cromado E o `<main>` que ele trazia
 * ao ombro. Ninguém reparou, porque o `<main>` não é uma coisa que se veja.
 *
 * Só que TODAS as raízes do back office traziam um `-mt-24` cujo único trabalho
 * era cancelar o `pt-24` daquele `<main>` — e isso via-se. MEDIDO no browser,
 * a 375×667 e a 1280×900, entre a mudança e a correcção:
 *
 *     document.querySelector("main")        →  null
 *     raiz do back office, topo no ecrã     →  −96 px
 *
 * Ou seja: cancelado o cancelamento, sobrou a subtracção. Os primeiros 96 px do
 * back office — a barra de cima, com o logótipo e o «Novo» — estavam FORA do
 * ecrã, em todas as entradas. E quem usa leitor de ecrã ficou sem marco nenhum
 * para onde saltar.
 *
 * Quem o apanhou foi a suite de telemóvel, com três testes a dizer a mesma
 * coisa: `main li button` deixou de encontrar seja o que for. Levou doze
 * minutos de E2E. Isto leva milissegundos, e diz porquê.
 */

const RAIZES = [
  "src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/loading.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/EntradaComFotografia.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/evento/[id]/DossierClient.tsx",
  "src/app/[lang]/(admin)/orcamento/admin/recuperar/DefinirPalavraPasse.tsx",
];

describe("o marco do conteúdo do back office", () => {
  afterEach(cleanup);

  it("embrulha o back office num <main>, e não num <div>", () => {
    render(
      <AdminLayout>
        <p>o back office</p>
      </AdminLayout>,
    );
    const marco = screen.getByRole("main");
    expect(marco.tagName).toBe("MAIN");
    expect(marco).toHaveAttribute("id", "conteudo");
    // O marcador que põe as cores do back office no PRIMEIRO pixel continua
    // aqui: foi para isto que este layout nasceu.
    expect(marco).toHaveAttribute("data-admin-mode");
  });

  it("não traz o `pt-24` do cromado do sítio — aqui não há barra por cima", () => {
    render(
      <AdminLayout>
        <p>o back office</p>
      </AdminLayout>,
    );
    expect(screen.getByRole("main").className).not.toMatch(/\bpt-24\b/);
  });

  it("e por isso nenhuma raiz do back office tenta cancelá-lo", () => {
    // A margem negativa e o `pt-24` são um par: um sem o outro é sempre um
    // defeito, e foi o lado de cá do par que ficou cá dentro sozinho.
    const culpadas = RAIZES.filter((r) =>
      /\B-mt-24\b/.test(semComentarios(readFileSync(r, "utf8"))),
    );
    expect(culpadas).toEqual([]);
  });

  it("e não voltou a entrar um `-mt-24` noutra raiz qualquer", () => {
    // Uma raiz nova é sempre possível; o que não pode é nascer com a cura de
    // uma doença que já não existe.
    const ficheiros = execSync(
      "grep -rl --include=*.tsx -e '-mt-24' src/app/'[lang]'/'(admin)' || true",
      { encoding: "utf8" },
    )
      .trim()
      .split("\n")
      .filter(Boolean)
      .filter((f) => !f.includes(".test."))
      .filter((f) => /\B-mt-24\b/.test(semComentarios(readFileSync(f, "utf8"))));
    expect(ficheiros).toEqual([]);
  });
});

/** A lição já custou três testes que passavam a olhar para a minha prosa. */
function semComentarios(fonte: string): string {
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}
