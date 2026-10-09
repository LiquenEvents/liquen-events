import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * OS SALTOS DA PÁGINA MEDIDOS A 9 DE OUTUBRO
 *
 * Um PerformanceObserver de `layout-shift`, numa passagem por todos os ecrãs:
 *   · abrir uma proposta a partir das Propostas, a 390 → 0,157 (acima do 0,1
 *     que já é «mau»): o aviso «A abrir o pedido…» entrava NO FLUXO, por cima
 *     da lista, e saía logo a seguir;
 *   · Estatísticas → 0,098 a 390 no escuro e 0,047 a 1440: uma linha de 20 px
 *     («A ler as propostas…») dava lugar a uma grelha de quase cem, e tudo o
 *     que vinha a seguir descia;
 *   · Temas a 390 → 0,029: o campo de procura só aparecia depois de a lista
 *     chegar e empurrava a contagem para a linha de baixo — que, a ler, dizia
 *     «0 temas · 0 fotografias».
 *
 * O jsdom não faz disposição. O que se prende aqui é a CAUSA de cada um; quem
 * mede o salto a sério é um browser (`e2e/fluidity.spec.ts`).
 */
const RAIZ = join(process.cwd(), "src/app/[lang]/(admin)/orcamento/admin");
const ler = (f: string) => readFileSync(join(RAIZ, f), "utf8");

describe("o aviso de abrir um pedido não empurra a vista", () => {
  const fonte = ler("AdminClient.tsx");
  const i = fonte.indexOf("titulo={`A abrir o pedido de ${aAbrir.nome}`}");
  const antes = fonte.slice(Math.max(0, i - 600), i);

  it("vive numa âncora de altura zero, fora do fluxo", () => {
    expect(i).toBeGreaterThan(-1);
    expect(antes).toContain('className="relative z-10 h-0"');
    expect(antes).toContain("absolute inset-x-0 top-0");
  });

  it("tem fundo opaco, para a lista não se ler através dele", () => {
    expect(antes).toContain("bg-[var(--bo-surface)]");
  });
});

describe("a espera das Estatísticas tem a forma do que vem", () => {
  it("a análise das propostas guarda quatro mosaicos", () => {
    const fonte = ler("AnalisePropostas.tsx");
    expect(fonte).toContain('className="bo-skeleton h-21 rounded-2xl"');
    expect(fonte).toContain('<span className="sr-only">A ler as propostas…</span>');
  });

  it("o cartão da Meta espera com a altura de uma linha `text-sm`", () => {
    expect(ler("FechosMeta.tsx")).toContain('className="bo-skeleton h-5 w-2/3 rounded-md"');
  });
});

describe("os Temas, a ler", () => {
  const fonte = ler("Temas.tsx");

  it("não dizem «0 temas» antes de haver resposta", () => {
    expect(fonte).toContain('if (loading) return "A contar…";');
  });

  it("guardam o lugar do campo de procura", () => {
    expect(fonte).toContain("const searchable = loading || themes.length > 4;");
  });
});
