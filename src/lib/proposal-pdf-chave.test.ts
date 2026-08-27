import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O CAMINHO RÁPIDO DO PDF NÃO PODE CARREGAR O DESENHADOR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «quero que isto se torne ultra rápido».
 *
 * Abrir a proposta em PDF já não desenha nada no caso normal: o ficheiro fica
 * guardado no envio, e as duas rotas que o servem — a do link do casal e a do
 * portal — mandam o browser directamente ao armazenamento com um endereço
 * assinado. Três passos, e nenhum deles precisa de desenhar.
 *
 * Só que a `chaveDoPdf` vivia no `proposal-pdf-cache`, que importa o
 * `proposal-doc-render`, que importa o `pdf-lib` e o `sharp`. Um `import` no
 * topo do ficheiro é pago SEMPRE: cada clique carregava o desenhador inteiro
 * para depois não o usar. Medido nesta máquina, com o disco quente: `pdf-lib`
 * 135 ms, `sharp` 77 ms — 212 ms antes da primeira linha do handler.
 *
 * Esta rede guarda a separação. É um teste de IMPORTAÇÕES e não de
 * comportamento, de propósito: o custo que ela sente não se vê no resultado da
 * função — vê-se no que a função arrasta consigo para a memória antes de
 * começar. Nenhum teste de comportamento o apanharia.
 */

const ROTAS = [
  "src/app/api/proposta/[token]/pdf/route.ts",
  "src/app/api/portal/[token]/proposta-pdf/route.ts",
];

const ler = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("o caminho rápido do PDF", () => {
  it("não importa o `proposal-pdf-cache` no topo — só quando tem de desenhar", () => {
    for (const rota of ROTAS) {
      const src = ler(rota);
      const noTopo = /^import[^;]*from "@\/lib\/proposal-pdf-cache";/m.test(src);
      expect(
        noTopo,
        `${rota} voltou a importar o \`proposal-pdf-cache\` no topo — e com ele o \`pdf-lib\` e ` +
          `o \`sharp\`, em todos os pedidos, incluindo os que só reencaminham.`,
      ).toBe(false);

      expect(src, `${rota} deixou de carregar o desenhador onde precisa dele`).toContain(
        'await import("@/lib/proposal-pdf-cache")',
      );
    }
  });

  it("e a chave e o erro vêm de um módulo que não traz o desenhador", () => {
    const leve = ler("src/lib/proposal-pdf-chave.ts");
    // A prova é pela negativa e tem de o ser: o que importa é o que este
    // ficheiro NÃO arrasta.
    for (const pesado of ["proposal-doc-render", "pdf-lib", "sharp", "proposal-pdf-cache"]) {
      expect(
        leve.includes(`"${pesado}"`) || leve.includes(`/${pesado}"`),
        `o \`proposal-pdf-chave\` passou a importar \`${pesado}\` — deixou de ser leve, e o ` +
          `caminho rápido volta a pagar o desenhador`,
      ).toBe(false);
    }
    for (const rota of ROTAS) {
      expect(ler(rota)).toContain('from "@/lib/proposal-pdf-chave"');
    }
  });
});
