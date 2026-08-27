import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM NÚMERO MANDA NO ECRÃ DAS PROPOSTAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Eram quatro cartões com o MESMO peso — `clamp(20px, 2.2vw, 28px)` nos quatro
 * — e dois deles pintados de verde sem que a cor distinguisse coisa nenhuma:
 * caía no «Pedidos com proposta» e no «Valor já ganho», que não são da mesma
 * família. É o mesmo defeito que a Visão Geral tinha, e que o padrão 08 já lá
 * corrigiu.
 *
 * O herói deste ecrã é o VALOR JÁ GANHO: a pergunta a que ele responde é «as
 * propostas que enviei estão a dar dinheiro?». Não a contagem de pedidos, que é
 * arrumação, nem a percentagem, que é a mesma resposta dita de uma maneira em
 * que ela já disse não confiar.
 *
 * ── PORQUE É QUE ISTO LÊ A FONTE E NÃO O ECRÃ ────────────────────────────
 *
 * Escrevi-o primeiro em jsdom e não funcionava: o `style.fontSize` vinha VAZIO.
 * A razão é que o jsdom recusa `clamp()` como valor de `font-size` e não guarda
 * nada — o mesmo motivo que já está escrito no
 * `numero-heroi-da-visao-geral.test.ts`, que mede a Visão Geral pela fonte
 * exactamente por isto. Um teste que lesse o DOM aqui não media a hierarquia:
 * media a tolerância do jsdom a uma função de CSS.
 */

const FONTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/Propostas.tsx", "utf8");

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

const CODIGO = semComentarios(FONTE);

/** O bloco dos quatro números, do rótulo da secção até ao aviso a seguir. */
function bloco(): string {
  const i = CODIGO.indexOf("Por pedido · conta-se a proposta mais recente");
  expect(i, "não encontrei o bloco dos números das Propostas").toBeGreaterThan(-1);
  const fim = CODIGO.indexOf("porEnviar > 0", i);
  expect(fim, "o vizinho a seguir mudou — actualiza este localizador").toBeGreaterThan(i);
  return CODIGO.slice(i, fim);
}

/** Os `clamp(min, …, max)` do bloco, pela ordem em que aparecem. */
function degraus(): { min: number; max: number }[] {
  return [...bloco().matchAll(/clamp\(\s*(\d+)px\s*,[^,]+,\s*(\d+)px\s*\)/g)].map((m) => ({
    min: Number(m[1]),
    max: Number(m[2]),
  }));
}

describe("os números do ecrã das Propostas", () => {
  it("deixaram de ser todos do mesmo tamanho", () => {
    const d = degraus();
    expect(d.length, "não encontrei tamanhos no bloco dos números").toBeGreaterThanOrEqual(2);
    expect(new Set(d.map((x) => x.max)).size, "voltaram todos ao mesmo peso").toBeGreaterThan(1);
  });

  it("o herói tem meia vez de folga sobre os de apoio", () => {
    const d = degraus();
    const maior = d.reduce((a, b) => (b.max > a.max ? b : a));
    for (const outro of d.filter((x) => x !== maior)) {
      expect(
        maior.max / outro.max,
        `o herói (${maior.max}px) mal se distingue de um de apoio (${outro.max}px)`,
      ).toBeGreaterThanOrEqual(1.5);
      expect(maior.min / outro.min).toBeGreaterThanOrEqual(1.5);
    }
  });

  it("o herói é o «Valor já ganho», e não outro qualquer", () => {
    // A ordem no ficheiro é: primeiro o herói, depois a fila. Se alguém trocar
    // o número que manda, isto diz-lhe que trocou.
    const b = bloco();
    const primeiroClamp = b.search(/clamp\(/);
    const rotuloDoHeroi = b.indexOf("Valor já ganho");
    expect(rotuloDoHeroi, "o «Valor já ganho» saiu do bloco").toBeGreaterThan(-1);
    expect(
      rotuloDoHeroi - primeiroClamp,
      "o primeiro número do bloco deixou de ser o «Valor já ganho»",
    ).toBeGreaterThan(0);
    expect(rotuloDoHeroi - primeiroClamp).toBeLessThan(400);
  });

  it("a cor saiu dos cartões de apoio", () => {
    // Dois dos quatro estavam pintados de verde, e o verde não separava nada.
    // A hierarquia passa a ser de TAMANHO; a cor volta a ser só do herói.
    const b = bloco();
    const verdes = [...b.matchAll(/#4d6350/g)].length;
    expect(verdes, `o verde voltou a espalhar-se pelo bloco (${verdes} usos)`).toBeLessThanOrEqual(
      1,
    );
    expect(b, "os cartões de apoio voltaram a ter anel").not.toMatch(/ring-1/);
  });
});
