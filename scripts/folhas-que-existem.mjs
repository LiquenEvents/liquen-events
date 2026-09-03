/**
 * ════════════════════════════════════════════════════════════════════════════
 * NENHUMA FOLHA DE ESTILOS PODE SAIR VAZIA DA COMPILAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela, depois de abrir uma pré-visualização e encontrar o painel
 * desmanchado: «retira esse back office assim, para que isso nunca caia nesse
 * aspeto».
 *
 * ── O QUE ACONTECEU, PARA NINGUÉM TER DE ADIVINHAR ────────────────────────
 *
 * O `admin.css` ia buscar o tema com `@reference "./globals.css"`. Um
 * `@reference` traz TUDO o que o ficheiro referido tem — incluindo o
 * `@source not "./[lang]/(admin)"` —, e essa exclusão é absoluta: vence o
 * `source()` do próprio import. A folha do back office saiu com um
 * `@layer utilities` VAZIO. 1 771 bytes, dos quais quase tudo eram fontes.
 *
 * E não deu erro em lado nenhum. O `next build` compilou. Os 9 511 testes
 * passaram. O CI ficou verde nos oito checks. O Vercel publicou. Só o painel
 * é que abriu desmanchado — e ela é a única pessoa que o abre.
 *
 * ── PORQUE É QUE ISTO É UM GUIÃO DA COMPILAÇÃO E NÃO UM TESTE ─────────────
 *
 * Porque o Vercel NÃO CORRE TESTES. Corre o `npm run build`. Um teste de
 * unidade, por melhor que seja, protege o merge — não protege a
 * pré-visualização que ela abre no telemóvel a meio da noite. Esta rede tem
 * de estar dentro da própria compilação, e é por isso que está pendurada no
 * `build` do `package.json`.
 *
 * Há um teste também (`o-back-office-nao-viaja-na-proposta.test.ts`), e ele
 * gera o CSS com o mesmo motor. Mas quem trava a publicação é este.
 *
 * ── O QUE VERIFICA ────────────────────────────────────────────────────────
 *
 * Lê as folhas que a compilação REALMENTE escreveu — não os ficheiros-fonte,
 * não a configuração — e exige que nenhuma delas seja um invólucro vazio.
 * Uma folha que só tenha `@layer` e `@font-face` não é uma folha: é o sintoma.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A pasta é argumento para haver como CORRER o controlo negativo: aponta-se
 * para uma cópia com uma folha esvaziada e confirma-se que ele morde. Uma
 * rede que nunca se viu falhar não é uma rede.
 */
const PASTA = process.argv[2] ?? join(".next", "static", "chunks");

/**
 * Quantas REGRAS de estilo tem uma folha, sem contar com o que não pinta
 * nada: as declarações de camada, as fontes e as propriedades registadas.
 * É esta a pergunta certa — a folha avariada tinha 1 771 bytes e zero regras.
 */
function regrasQuePintam(css) {
  const semAtRegras = css
    .replace(/@font-face\s*\{[^}]*\}/g, "")
    .replace(/@layer[^;{]*;/g, "")
    .replace(/@property[^{]*\{[^}]*\}/g, "")
    .replace(/@charset[^;]*;/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  return (semAtRegras.match(/\{/g) ?? []).length;
}

const folhas = readdirSync(PASTA)
  .filter((f) => f.endsWith(".css"))
  .map((f) => {
    const css = readFileSync(join(PASTA, f), "utf8");
    return { nome: f, bytes: css.length, regras: regrasQuePintam(css) };
  });

if (folhas.length === 0) {
  console.error("✗ a compilação não escreveu folha de estilos nenhuma.");
  process.exit(1);
}

/**
 * O chão é 1 e não um número redondo de propósito: o que se está a apanhar é
 * o VAZIO, e qualquer número maior seria uma opinião sobre o tamanho que uma
 * folha deve ter — opinião que envelhece e que um dia falha por nada.
 */
const vazias = folhas.filter((f) => f.regras === 0);

for (const f of folhas) {
  const marca = f.regras === 0 ? "✗" : "·";
  console.log(
    `  ${marca} ${f.nome.padEnd(26)} ${String(f.bytes).padStart(8)} bytes  ${String(f.regras).padStart(5)} regras`,
  );
}

if (vazias.length > 0) {
  console.error(
    `\n✗ ${vazias.length} folha(s) de estilos saíram VAZIAS: ${vazias.map((f) => f.nome).join(", ")}`,
  );
  console.error(
    "  Uma folha só com @layer e @font-face não pinta nada. A página que a\n" +
      "  carregar abre desmanchada, e nada mais no sistema se queixa.\n" +
      "  Causa conhecida: um `@reference` para uma folha que tem `@source not`\n" +
      "  — a exclusão é absoluta e vence o `source()` do próprio import.",
  );
  process.exit(1);
}

console.log(`✓ ${folhas.length} folhas de estilos, todas com regras.`);
