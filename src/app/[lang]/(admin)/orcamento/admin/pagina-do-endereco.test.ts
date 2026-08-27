import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { VIEWS, vistaValida } from "./nav";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O ENDEREÇO GANHA À MEMÓRIA — E GANHA NO SERVIDOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cookie é a MEMÓRIA («onde é que eu ia»); o `?v=` é a INTENÇÃO («leva-me
 * aqui»). Um favorito, um link mandado a alguém, um segundo separador — nos
 * três há uma intenção escrita no endereço, e ela tem de ganhar à memória de
 * ontem. Sem isto, abrir um favorito das Propostas levava à última secção usada
 * e o favorito não servia para nada.
 *
 * ── PORQUE É QUE ESTE FICHEIRO LÊ O CÓDIGO EM VEZ DE O CORRER ─────────────
 *
 * `page.tsx` é um componente de servidor `async` que abre a sessão, lê os
 * cookies e vai à base de dados buscar a lista de pedidos. Montá-lo pedia
 * quatro duplos que não provavam nada sobre a decisão que aqui interessa — e a
 * decisão é UMA LINHA: `doEndereco ?? doCookie`.
 *
 * Um teste que lê o ficheiro é uma rede grosseira e assume-se como tal: prende
 * a PRECEDÊNCIA e prende quem valida o quê. O comportamento a sério — que a
 * secção assim decidida chega ao ecrã sem salto — está guardado no
 * `AdminClient.vista-inicial.test.tsx`, esse com a aplicação montada.
 */

const FONTE = readFileSync(
  join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin/page.tsx"),
  "utf8",
);

/**
 * O ficheiro SEM comentários.
 *
 * As afirmações pela negativa («já não valida contra o menu») têm de correr
 * sobre código e não sobre prosa: a primeira versão deste teste chumbou porque
 * o comentário que EXPLICA a mudança cita o `NAV.some(...)` que ela tirou. Um
 * teste que lê um ficheiro tem de saber onde acaba o código.
 */
const CODIGO = FONTE.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

describe("a secção com que a página abre", () => {
  it("lê o `?v=` do endereço", () => {
    expect(CODIGO).toMatch(/searchParams/);
    expect(CODIGO).toMatch(/const \{ v \} = await searchParams/);
  });

  /** A precedência, que é a decisão inteira. */
  it("o endereço ganha ao cookie, e não o contrário", () => {
    expect(CODIGO).toMatch(/doEndereco \?\? doCookie/);
    expect(CODIGO).not.toMatch(/doCookie \?\? doEndereco/);
  });

  /**
   * Isto dizia `NAV.some((n) => n.id === doCookie)`, e o `NAV` NÃO tem as
   * vistas todas — o próprio `nav.tsx` explica que várias ficam de fora de
   * propósito. Uma delas no cookie era recusada e ela ia parar à Visão Geral.
   */
  it("valida contra as vistas todas e não contra o menu", () => {
    expect(CODIGO).toMatch(/vistaValida\(/);
    expect(CODIGO).not.toMatch(/NAV\.some/);
  });

  /** Nem o endereço nem o cookie entram sem passar pela porta. */
  it("nenhum dos dois é usado tal e qual", () => {
    expect(CODIGO).toMatch(/const doEndereco = vistaValida\(/);
    expect(CODIGO).toMatch(/const doCookie = vistaValida\(/);
  });
});

/**
 * E a porta em si, com a lista que o menu não tem. Vive aqui também porque é o
 * servidor quem a usa primeiro — antes de haver um browser para a testar.
 */
describe("a porta por onde um texto de fora se torna uma vista", () => {
  it("aceita uma vista escondida do menu", () => {
    expect(VIEWS).toContain("modelos-email");
    expect(vistaValida("modelos-email")).toBe("modelos-email");
  });

  it("não deixa passar o que herdou do protótipo", () => {
    expect(vistaValida("toString")).toBeUndefined();
    expect(vistaValida("constructor")).toBeUndefined();
    expect(vistaValida("hasOwnProperty")).toBeUndefined();
  });
});
