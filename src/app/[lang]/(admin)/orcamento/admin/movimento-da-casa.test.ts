import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A ESCADA DE ENTRADA: DEGRAUS DE 20 ms, SEIS, E PÁRA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Da análise medida da Apple: uma escada de atrasos escrita no CSS — 0,20 /
 * 0,22 / 0,24 / 0,26 / 0,28 / 0,30 s. Seis degraus de vinte milissegundos, e
 * pára. O desfasamento existe para o olho ler ORDEM DE LEITURA; ao sexto item
 * essa informação já foi dada, e continuar só acrescenta espera.
 *
 * O que este teste guarda é o TECTO, que é a parte que se perde primeiro. Sem
 * ele, uma lista de trinta linhas põe a última a entrar seis décimos de
 * segundo depois da primeira — e o desfasamento passa a ler-se como lentidão.
 *
 * ── E A CURVA, QUE NÃO É NOVA ─────────────────────────────────────────────
 *
 * A análise pede «uma curva para o sítio inteiro, sem ease-in». Esta casa já
 * tem uma, e o segundo teste guarda que a cascata a usa em vez de trazer a
 * sua: a `--ease-out`, que é também a curva por omissão de todos os
 * utilitários `transition-*` do sítio. Uma cascata com curva própria seria uma
 * segunda linguagem de movimento na mesma página — o mesmo defeito que os
 * quarenta e sete cinzentos eram na cor.
 */

const CSS = fs.readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");

describe("a escada de entrada do back office", () => {
  it("tem degraus de 20 ms — e PÁRA ao sexto", () => {
    expect(CSS).toContain("--bo-degrau: 20ms");
    expect(CSS).toContain("--bo-degraus-max: 5");

    // O tecto tem de estar na CONTA do atraso, e não só declarado num token
    // que ninguém lê. Medido num browser antes de escrever isto:
    // `--cena: 0 → 0s`, `3 → 0,06s`, `5 → 0,1s`, `30 → 0,1s`.
    const bloco = CSS.slice(CSS.indexOf(".bo-cena {"));
    const regra = bloco.slice(0, bloco.indexOf("}"));
    expect(
      regra,
      "o atraso da cascata deixou de ter tecto — uma lista longa volta a entrar em câmara lenta",
    ).toMatch(/min\(var\(--cena, ?0\), ?var\(--bo-degraus-max\)\)/);
    expect(regra).toContain("var(--bo-degrau)");
  });

  it("e usa a curva da casa, em vez de trazer uma sua", () => {
    const bloco = CSS.slice(CSS.indexOf(".bo-cena {"));
    const regra = bloco.slice(0, bloco.indexOf("}"));
    expect(
      regra,
      "a cascata voltou a ter curva própria — a casa tem uma só, `--ease-out`, e é a omissão " +
        "de todos os `transition-*`. Duas curvas na mesma página são duas linguagens de movimento.",
    ).toContain("var(--ease-out)");
    expect(regra, "curva escrita à mão dentro da cascata").not.toMatch(/cubic-bezier/);
  });

  it("e a casa continua a ter UMA curva, a que foi escolhida — não a da análise", () => {
    // A análise propõe `cubic-bezier(.4,0,.2,1)`. É, letra por letra, a curva
    // que esta casa recusou por escrito: ~300 transições estavam nela por
    // omissão e foram convergidas para a assinatura. Cheguei a acrescentá-la
    // como token novo; era uma segunda curva a competir com a primeira.
    expect(CSS).toContain("--ease-out: cubic-bezier(0.16, 1, 0.3, 1)");
    expect(
      CSS,
      "voltou a existir um token de curva próprio do back office — a casa tem `--ease-out`",
    ).not.toContain("--bo-curva");
  });
});
