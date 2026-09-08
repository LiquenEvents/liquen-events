import { describe, expect, it } from "vitest";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM CABEÇALHO DE SECÇÃO NÃO SE ESCREVE EM CAIXA ALTA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Do sistema de design que ela aprovou: «Cabeçalhos de secção em capitalização
 * normal, não em caixa alta» — e, na lista de proibições, «caixa alta em
 * cabeçalhos de secção». O exemplo que o próprio documento dá muda só a CAIXA:
 * `PEDIDOS RECENTES` → `Pedidos recentes`.
 *
 * ── PORQUE É QUE ISTO NÃO VARRE AS 199 SOBRANCELHAS ──────────────────────
 *
 * Porque a regra é sobre cabeçalhos, e a varredura mediu a diferença antes de
 * mexer em nada:
 *
 *     cabeçalhos `<h1>`–`<h3>` em caixa alta ......   4
 *     usos de `uppercase` a 9–12 px .............. 199
 *     usos de `uppercase` a 13 px ou mais ........  19
 *
 * Os 199 são a SOBRANCELHA — a linha pequena, muito espaçada, que rotula um
 * bloco sem competir com ele. A casa tem-na nomeada (`.bo-eyebrow`, 11 px,
 * `letter-spacing: 0.14em`, peso 600) e o próprio material de referência que
 * ela mandou usa-a nos seus. Não é o mesmo objecto que um cabeçalho, e
 * converter os 199 seria trocar uma decisão de desenho por uma leitura
 * literal de uma regra que não lhes diz respeito.
 *
 * Os 4 eram cabeçalhos a sério — `<h3>` de cartão e `<h2>` de grupo de lista —
 * pintados como sobrancelhas. Esses passaram à escala: `text-title3` nos de
 * cartão, `text-footnote` no cabeçalho sticky da lista de carregamento (ali o
 * tamanho decide a altura da faixa colada ao topo, e 17 px partia-a).
 *
 * O `tracking` largo saiu com a caixa alta: existe para separar maiúsculas, e
 * em minúsculas lê-se como texto esticado.
 */

/** Os `.tsx` do back office, sem os testes. */
function ficheiros(): string[] {
  return execSync("grep -rl --include=*.tsx -e '<h' src/app/'[lang]'/'(admin)' || true", {
    encoding: "utf8",
  })
    .trim()
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.includes(".test."));
}

describe("os cabeçalhos do back office", () => {
  const achados = ficheiros().flatMap((f) =>
    readFileSync(f, "utf8")
      .split("\n")
      .map((linha, i) => ({ f: f.split("/").pop()!, n: i + 1, linha }))
      .filter(({ linha }) => /<h[1-6][^>]*\buppercase\b/.test(linha)),
  );

  it("nenhum se escreve em caixa alta", () => {
    expect(
      achados.map((a) => `${a.f}:${a.n}`),
      "um cabeçalho de secção voltou à caixa alta — ver a regra no topo deste ficheiro",
    ).toEqual([]);
  });

  /**
   * O seguro da varredura. Se um dia os cabeçalhos deixarem de se escrever com
   * `<h…>` — porque alguém trocou por `<div role="heading">`, ou porque a busca
   * de ficheiros deixou de acertar —, isto cai antes de a regra passar a valer
   * para zero linhas e a ficar verde por não estar a olhar para nada.
   */
  it("a varredura encontrou mesmo cabeçalhos", () => {
    const comCabecalho = ficheiros().length;
    expect(comCabecalho, "nenhum ficheiro com `<h…>` — a varredura cegou").toBeGreaterThan(20);
  });
});
