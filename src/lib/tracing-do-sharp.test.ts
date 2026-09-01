import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import config from "../../next.config";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA EXCLUSÃO LARGA DE MAIS APAGA O `sharp` QUE A INCLUSÃO GARANTIU
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Esta casa já teve o back office a não conseguir listar os TEMAS em produção.
 * O que os registos diziam não era um erro de base de dados nenhum:
 *
 *   Error: Could not load the "sharp" module using the linux-x64 runtime
 *   ERR_DLOPEN_FAILED: libvips-cpp.so.8.18.3: cannot open shared object file
 *
 * A função rebentava INTEIRA, antes de chegar ao código da rota, e por isso o
 * ecrã nem conseguia dizer o que se passava: a lista aparecia vazia, como se
 * os temas dela tivessem desaparecido. Não tinham. Faltava o binário dentro do
 * pacote da função, e a correcção está escrita por extenso no `next.config`.
 *
 * Agora há uma lista de EXCLUSÕES ao lado da de inclusões — os `sharp` de
 * outras plataformas, 27 MB por função que nunca correm aqui. E as exclusões
 * são aplicadas DEPOIS das inclusões: um padrão escrito largo de mais engole o
 * que a linha de cima acabou de garantir, e traz de volta exactamente aquela
 * avaria. Sem erro de compilação, sem teste vermelho, sem nada — só em
 * produção, e só quando alguém tocar numa fotografia.
 *
 * Isto é o alarme: as duas listas não se podem tocar.
 */

const tracing = (mapa: Record<string, string[]> | undefined) => mapa?.["/**"] ?? [];

const INCLUIDOS = tracing(config.outputFileTracingIncludes as Record<string, string[]> | undefined);
const EXCLUIDOS = tracing(config.outputFileTracingExcludes as Record<string, string[]> | undefined);

/** O padrão sem o `/**\/*` do fim — a pasta que ele apanha. */
const pasta = (padrao: string) => padrao.replace(/\/\*\*\/\*$/, "").replace(/^\.\//, "");

describe("o que o `sharp` leva para dentro da função", () => {
  it("nenhuma exclusão apaga o que uma inclusão garantiu", () => {
    /**
     * A comparação é por PASTA e por prefixo de caminho, e não por texto.
     *
     * `sharp-linux-x64` e `sharp-linuxmusl-x64` são nomes diferentes e nenhum
     * é prefixo do outro NO CAMINHO — mas `sharp-linux` seria prefixo dos
     * dois, e é assim que alguém partiria isto a tentar simplificar a lista.
     * Por isso a conta é feita com a barra: `a/` contra `b/`.
     */
    const colisoes: string[] = [];
    for (const inc of INCLUIDOS) {
      for (const exc of EXCLUIDOS) {
        const a = `${pasta(inc)}/`;
        const b = `${pasta(exc)}/`;
        if (a.startsWith(b) || b.startsWith(a)) colisoes.push(`${exc}  engole  ${inc}`);
      }
    }
    expect(
      colisoes,
      `uma exclusão apaga o que a inclusão garante — é a avaria dos temas de volta:\n  ${colisoes.join("\n  ")}`,
    ).toEqual([]);
  });

  it("o par que a função precisa continua garantido", () => {
    // O controlo positivo: sem estas duas linhas, o caso de cima passa por não
    // haver nada que ele possa reprovar.
    expect(INCLUIDOS, "o vínculo do `sharp` deixou de viajar com a função").toContain(
      "./node_modules/@img/sharp-linux-x64/**/*",
    );
    expect(INCLUIDOS, "o libvips deixou de viajar com a função").toContain(
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    );
  });

  it("e o que se deita fora existe mesmo, e não é o que corre aqui", () => {
    /**
     * Uma exclusão que não aponta para nada é uma linha morta a dar a
     * impressão de estar a poupar 27 MB. E uma que apontasse para o pacote de
     * glibc seria a avaria.
     *
     * O alvo do Vercel é Linux x64 com glibc: `linuxmusl` é para Alpine e
     * `wasm32` é o recurso para quando não há binário nativo nenhum.
     */
    expect(EXCLUIDOS.length, "deixou de se excluir seja o que for").toBeGreaterThan(0);
    for (const exc of EXCLUIDOS) {
      expect(exc, "excluiu-se o `sharp` de glibc, que é o que corre aqui").not.toMatch(
        /sharp-(libvips-)?linux-x64/,
      );
      expect(
        existsSync(pasta(exc)),
        `a exclusão \`${exc}\` não aponta para nada — ou o pacote mudou de nome, ou a linha é morta`,
      ).toBe(true);
    }
  });
});
