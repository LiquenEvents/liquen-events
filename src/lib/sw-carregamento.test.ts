import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A EXCEÇÃO DO SERVICE WORKER TEM DE CONTINUAR A SER UMA SÓ.
 *
 * O `sw.js` exclui todo o `/orcamento` do cache de propósito: é back office
 * autenticado, e servir HTML velho ali seria mostrar dados de outra pessoa ou
 * de outro dia. Abriu-se UMA exceção — a vista de carregamento de material,
 * que tem de funcionar numa quinta sem rede.
 *
 * Este teste existe porque essa exceção é fácil de alargar sem querer: basta
 * alguém mexer no `isBypassed` a pensar noutra coisa. Lê o ficheiro real e
 * corre as funções, em vez de confiar em quem o leu por último.
 */

const fonte = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");

/** O corpo de uma função do `sw.js`, tal como está escrita no ficheiro. */
function corpo(nome: string): string {
  const at = fonte.indexOf(`function ${nome}(`);
  if (at < 0) throw new Error(`${nome} desapareceu do sw.js`);
  // Até à chaveta que fecha, contando as que abrem pelo caminho.
  let profundidade = 0;
  let fim = at;
  for (let i = fonte.indexOf("{", at); i < fonte.length; i++) {
    if (fonte[i] === "{") profundidade++;
    else if (fonte[i] === "}") {
      profundidade--;
      if (profundidade === 0) {
        fim = i + 1;
        break;
      }
    }
  }
  return fonte.slice(at, fim);
}

// As duas juntas: o `isBypassed` delega no `isCarregamento`, e extrair só uma
// dava um erro de referência que não diz nada sobre o que se quer testar.
const isBypassed = new Function(
  `${corpo("isCarregamento")}\n${corpo("isBypassed")}\nreturn isBypassed;`,
)() as (url: URL) => boolean;
const u = (p: string) => new URL(`https://liquen-events.com${p}`);

describe("o service worker e o /orcamento", () => {
  it("a vista de carregamento PODE ser cacheada — é a exceção aprovada", () => {
    expect(isBypassed(u("/orcamento/admin/carregamento/abc123"))).toBe(false);
    expect(isBypassed(u("/en/orcamento/admin/carregamento/abc123"))).toBe(false);
  });

  it("o resto do back office continua fora do cache", () => {
    // Se isto passar a `false`, o back office inteiro começou a ser servido de
    // uma cache — que é exactamente o que a exceção não pode arrastar.
    expect(isBypassed(u("/orcamento/admin"))).toBe(true);
    expect(isBypassed(u("/orcamento/admin/qualquer-outra"))).toBe(true);
    expect(isBypassed(u("/orcamento"))).toBe(true);
    expect(isBypassed(u("/en/orcamento/admin"))).toBe(true);
  });

  it("a API nunca, nem debaixo do caminho do carregamento", () => {
    expect(isBypassed(u("/api/orcamento/LQ-1/material"))).toBe(true);
    expect(isBypassed(u("/api/orcamento/LQ-1/material/marcar"))).toBe(true);
  });

  it("as páginas privadas do cliente continuam de fora", () => {
    expect(isBypassed(u("/portal/abc"))).toBe(true);
    expect(isBypassed(u("/proposta/abc"))).toBe(true);
  });

  it("um caminho que só PARECE o do carregamento continua de fora", () => {
    // A barra final no padrão é o que impede uma rota vizinha de herdar a
    // exceção só por o nome começar igual.
    expect(isBypassed(u("/orcamento/admin/carregamentos"))).toBe(true);
    expect(isBypassed(u("/orcamento/admin/carregamento-falso/abc"))).toBe(true);
    // E sem id nenhum não há vista para abrir.
    expect(isBypassed(u("/orcamento/admin/carregamento"))).toBe(true);
  });
});
