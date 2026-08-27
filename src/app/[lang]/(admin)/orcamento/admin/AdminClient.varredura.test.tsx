// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A VARREDURA NÃO ARRANCA ONDE NÃO PODE FAZER NADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO, e foi meu. A varredura das versões leves arrancava sempre, quatro
 * segundos depois de o back office abrir. Num ambiente sem Supabase — o CI, e
 * qualquer instalação por configurar — a primeira chamada leva 503
 * («Armazenamento indisponível»), e o browser escreve na consola:
 *
 *     console.error: Failed to load resource: the server responded with a
 *     status of 503 (Service Unavailable)
 *
 * Em TODAS as entradas no back office. O passeio `admin-mobile.spec.ts:347`
 * exige a consola limpa e chumbou nas TRÊS tentativas — não era intermitente,
 * era todas as vezes.
 *
 * E tinha razão: uma consola com um erro fixo é uma consola onde o erro
 * seguinte, o verdadeiro, passa despercebido.
 *
 * ── PORQUE É QUE A RESPOSTA NÃO VEM DE UM PEDIDO ─────────────────────────
 *
 * Porque a rota que conta o que falta devolve 503 pela mesma razão. Perguntar
 * «há armazenamento?» por HTTP era trocar um erro de consola por outro. Quem
 * sabe é quem desenha a página: o `page.tsx` chama `isDatabaseConfigured()` no
 * servidor e desce a resposta.
 */

const CLIENTE = readFileSync("src/app/[lang]/(admin)/orcamento/admin/AdminClient.tsx", "utf8");
const PAGINA = readFileSync("src/app/[lang]/(admin)/orcamento/admin/page.tsx", "utf8");

function semComentarios(fonte: string): string {
  const vazio = (m: string) => m.replace(/[^\n]/g, "");
  return fonte
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, vazio)
    .replace(/\/\*[\s\S]*?\*\//g, vazio)
    .replace(/^[^\S\n]*\/\/.*$/gm, "");
}

describe("a varredura das versões leves, do lado de quem a manda arrancar", () => {
  it("o servidor é que diz se há armazenamento", () => {
    const pagina = semComentarios(PAGINA);
    expect(pagina).toContain("isDatabaseConfigured");
    expect(pagina).toContain("armazenamentoLigado={isDatabaseConfigured()}");
  });

  it("e sem isso a varredura não chega a ser chamada", () => {
    const cliente = semComentarios(CLIENTE);
    // A CHAMADA, não o `import` — o `indexOf` cru apanhava a linha de importação
    // no topo do ficheiro e olhava para 260 caracteres de outros imports. O caso
    // passava a olhar para o sítio errado, que é a maneira mais silenciosa de um
    // teste deixar de guardar o que diz que guarda.
    const chamada = cliente.indexOf("return varrerDerivadasEmFundo()");
    expect(chamada, "ninguém chama a varredura").toBeGreaterThan(-1);
    const bloco = cliente.slice(Math.max(0, chamada - 200), chamada);
    expect(bloco, "o efeito chama a varredura sem verificar o armazenamento").toMatch(
      /if \(!armazenamentoLigado\) return;/,
    );
  });

  it("por omissão é FALSO — quem não passa a prop não arranca varredura nenhuma", () => {
    // Um ecrã novo que monte o `AdminClient` sem esta prop não pode herdar um
    // arranque silencioso: o valor seguro é não fazer nada.
    expect(semComentarios(CLIENTE)).toContain("armazenamentoLigado = false");
  });
});
