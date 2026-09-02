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

/**
 * ── AS INCLUSÕES DEIXARAM DE VIVER TODAS NA MESMA CHAVE ────────────────────
 *
 * Havia uma chave só, `"/**"`, e por isso este ficheiro lia-a directamente. As
 * bibliotecas nativas de imagem passaram para `"/api/**"` — 135 rotas
 * carregavam 17,8 MB que 31 podiam usar, e o porquê está por extenso no
 * `next.config.ts`.
 *
 * O que este ficheiro guarda não muda com isso, porque nunca foi a chave: é
 * que uma exclusão não pode engolir o que uma inclusão garantiu. Junta-se
 * TODAS as inclusões, venham de que chave vierem — se um dia alguém acrescentar
 * uma chave nova, o alarme cobre-a sem ninguém se lembrar dele.
 */
const todos = (mapa: Record<string, string[]> | undefined) => Object.values(mapa ?? {}).flat();

const INCLUIDOS = todos(config.outputFileTracingIncludes as Record<string, string[]> | undefined);
const EXCLUIDOS = todos(config.outputFileTracingExcludes as Record<string, string[]> | undefined);

/** Que chave é que garante um dado padrão. */
function chaveDe(padrao: string): string | undefined {
  const mapa = (config.outputFileTracingIncludes ?? {}) as Record<string, string[]>;
  return Object.keys(mapa).find((k) => mapa[k].includes(padrao));
}

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

  it("e viaja com uma chave que apanha as rotas que dele precisam", () => {
    /**
     * As 31 rotas que usam o `sharp` estão TODAS debaixo de `/api` — foi
     * medido, e é o que autoriza a chave a ser estreita. Este caso guarda duas
     * coisas que se partem de maneiras diferentes:
     *
     *  1. `"/api/*"` NÃO casa com `/api/temas/[id]/imagens` — medido com o
     *     próprio picomatch do Next. Uma estrela a menos e a avaria dos temas
     *     volta, exactamente onde já esteve.
     *  2. Uma rota de PÁGINA que passasse a precisar do `sharp` ficaria de
     *     fora desta chave em silêncio. Quem apanha esse caso é o
     *     `scripts/peso-das-rotas.mjs`, que lê o rastreio do build — este
     *     ficheiro só lê a intenção, e não tem como saber o que o build fez.
     */
    for (const par of [
      "./node_modules/@img/sharp-linux-x64/**/*",
      "./node_modules/@img/sharp-libvips-linux-x64/**/*",
    ]) {
      const chave = chaveDe(par);
      expect(chave, `${par} deixou de estar em chave nenhuma`).toBeDefined();
      expect(
        chave,
        `a chave \`${chave}\` tem uma estrela a menos: não casa com uma rota aninhada ` +
          "como `/api/temas/[id]/imagens`, que é onde a avaria dos temas viveu",
      ).not.toMatch(/\/\*$/);
    }
  });

  it("as imagens do email ficam na chave larga — falham em silêncio", () => {
    // O `readFileSync` do `email-assinatura.ts` rebenta sem elas, a assinatura
    // sai sem banner, e ninguém dá por isso porque o ficheiro está no
    // repositório e o sítio mostra-o na mesma. São 19 KB: não valem o risco de
    // uma chave estreita.
    expect(chaveDe("public/email/**/*"), "as imagens do email ficaram numa chave estreita").toBe(
      "/**",
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
