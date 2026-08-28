import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * SALTAR O QUE ESTÁ FORA DO ECRÃ — SÓ ONDE A ALTURA NÃO VEM DO CONTEÚDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela sobre a proposta no telemóvel: «trava ao deslizar».
 *
 * A galeria pública já saltava o desenho dos mosaicos fora do ecrã (`.g-tile`);
 * a proposta — que é quem tem 46 fotografias e uma página inteira para
 * percorrer — ficara de fora.
 *
 * ── A CONDIÇÃO QUE ESTE TESTE GUARDA ──────────────────────────────────────
 *
 * `content-visibility: auto` só é seguro se o espaço RESERVADO for igual ao
 * REAL. A casa já pagou essa lição por escrito: quando não é, a página encolhe
 * por baixo do dedo, e no Safari do iPhone não há âncora de scroll que o
 * disfarce.
 *
 * Na proposta a altura da célula vem do `aspect-ratio` que cada foto declara a
 * partir da forma guardada — e uma foto ANTERIOR às colunas de dimensão não
 * tem forma nenhuma: aí a altura vem mesmo da imagem. Pôr a classe nessas era
 * escolher o defeito que se está a corrigir.
 *
 * Por isso o que aqui se guarda não é «a classe existe»: é que ela continua
 * presa à condição.
 */

const CSS = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const FONTE = readFileSync(
  join(process.cwd(), "src/app/[lang]/(privado)/proposta/[token]/Inspiracao.tsx"),
  "utf8",
);

describe("as células que se podem adiar", () => {
  it("a regra existe e salta mesmo o desenho fora do ecrã", () => {
    const bloco = CSS.slice(CSS.indexOf(".foto-adiavel"));
    expect(CSS, "a classe desapareceu do globals.css").toContain(".foto-adiavel");
    expect(bloco.slice(0, 200)).toMatch(/content-visibility:\s*auto/);
  });

  /**
   * `auto` sozinho é gramática INVÁLIDA — a gramática é
   * `auto? [ none | <length{1,2}> ]`, em que `auto` é um modificador e não um
   * valor. Escrito assim, o parser deita a declaração inteira fora e a rede que
   * o comentário promete nunca existe. Já aconteceu no `.g-tile`, e só se
   * apanhou a perguntar ao browser.
   */
  it("reserva um tamanho com gramática válida — `auto` sozinho seria deitado fora", () => {
    const bloco = CSS.slice(CSS.indexOf(".foto-adiavel"), CSS.indexOf(".foto-adiavel") + 260);
    const m = bloco.match(/contain-intrinsic-size:\s*([^;]+);/);
    expect(m, "sem `contain-intrinsic-size` não há tamanho reservado nenhum").not.toBeNull();
    expect(m![1].trim(), "`auto` sozinho é inválido: precisa de um comprimento a seguir").toMatch(
      /^auto\s+\d+(px|rem|em|vh)$/,
    );
  });

  /**
   * A metade que interessa: a classe tem de continuar PRESA à forma conhecida.
   * Se alguém a puser sempre, este teste cai — e é isso que impede o regresso
   * do salto por baixo do dedo.
   */
  it("só é posta quando a forma da fotografia é conhecida", () => {
    expect(
      FONTE,
      "a classe deixou de estar presa ao `proporcao` — sem forma, a altura vem do " +
        "conteúdo e reservar um número inventado faz a página encolher a meio da leitura",
    ).toMatch(/proporcao\s*\?\s*" foto-adiavel"\s*:\s*""/);
  });
});
