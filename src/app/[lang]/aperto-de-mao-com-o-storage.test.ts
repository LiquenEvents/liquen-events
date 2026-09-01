import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O APERTO DE MÃO TEM DE SER COM A LIGAÇÃO QUE AS FOTOGRAFIAS USAM
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, a olhar para a proposta a abrir no telemóvel: «demora imenso
 * tempo (…) quero que seja logo instantâneo».
 *
 * Todas as fotografias desta casa vêm de outra origem — o Storage do Supabase.
 * A primeira paga DNS + TCP + TLS antes do primeiro byte: num 4G fraco, numa
 * quinta, são 200 a 400 ms em que não acontece nada. O `preconnect` existe
 * para fazer esse aperto de mão enquanto o HTML ainda vai a ser lido.
 *
 * ── O DEFEITO QUE ISTO GUARDA, E QUE JÁ CÁ ESTAVA ─────────────────────────
 *
 * Havia um `preconnect` só, com `crossOrigin`. Um `<img src="…">` sem atributo
 * `crossorigin` — que é o caso de TODAS as fotografias — é um pedido NÃO-CORS
 * e usa um conjunto de ligações diferente do anónimo. Um `preconnect` com
 * `crossorigin` abre o anónimo. Aquecia-se a ligação errada, e a primeira
 * fotografia abria a sua do zero na mesma.
 *
 * O mais perigoso é que isto não se vê: não há erro, não há aviso, a página
 * funciona, e o comentário ao lado afirmava com todas as letras o contrário do
 * que acontecia. Só se apanha a olhar para uma cascata de rede — ou aqui.
 */

const LAYOUT = readFileSync("src/app/[lang]/layout.tsx", "utf8");

/** Comentários fora: a explicação fala das duas formas, o código é que decide. */
function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

/** As linhas de `preconnect` para o Storage, tal como são servidas. */
function preconnectsDoStorage(): string[] {
  return semComentarios(LAYOUT)
    .split("\n")
    .filter((l) => l.includes('rel="preconnect"') && l.includes("storageOrigin"));
}

describe("o aperto de mão com o Storage", () => {
  it("aquece a ligação SEM `crossOrigin` — a que as fotografias usam", () => {
    const linhas = preconnectsDoStorage();
    expect(linhas.length, "desapareceu o `preconnect` para o Storage").toBeGreaterThan(0);
    expect(
      linhas.some((l) => !l.includes("crossOrigin")),
      "o único `preconnect` para o Storage é o anónimo (`crossOrigin`) — e as " +
        "fotografias, que são pedidos NÃO-CORS, continuam a abrir ligação do zero.\n" +
        `Linhas encontradas:\n  ${linhas.map((l) => l.trim()).join("\n  ")}`,
    ).toBe(true);
  });

  it("e mantém também a anónima, que é a do service worker", () => {
    // O `fetch` do `public/sw.js` é `mode: "cors"`. Tirar esta linha trocava
    // uma avaria por outra, no sítio público em vez de na proposta.
    const linhas = preconnectsDoStorage();
    expect(
      linhas.some((l) => l.includes("crossOrigin")),
      "deixou de se aquecer a ligação anónima — a que o service worker usa",
    ).toBe(true);
  });

  it("e o DNS continua a ser pedido cedo", () => {
    // O controlo positivo: se o bloco todo desaparecer, os casos de cima ainda
    // reprovam, mas este diz porquê em duas palavras.
    expect(semComentarios(LAYOUT), "caiu o `dns-prefetch` do Storage").toMatch(
      /rel="dns-prefetch"[^>]*storageOrigin|storageOrigin[^>]*rel="dns-prefetch"/,
    );
  });
});
