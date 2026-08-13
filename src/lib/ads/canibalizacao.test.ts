import { describe, it, expect } from "vitest";
import { POLOS, ESTILOS, conteudoPolo, caminhoPolo } from "./polos";
import { SERVICES, getService } from "@/lib/services-data";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS LANDING PAGES NÃO PODEM COMPETIR COM O SITE PELA MESMA PESQUISA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O DEFEITO QUE ISTO EXISTE PARA IMPEDIR, e que aconteceu mesmo:
 *
 * A página de serviço /servicos/casamentos tem, desde sempre, o título
 * "Decoração de Casamentos no Alentejo". Ao criar a landing page do Alentejo,
 * dei-lhe "Decoração de Casamentos no Alentejo | Líquen Events" — praticamente
 * o mesmo. Duas páginas do MESMO site a disputar a mesma pesquisa.
 *
 * A isto chama-se canibalização, e o prejuízo não é teórico: a Google escolhe
 * UMA das duas para mostrar, o sinal que devia estar concentrado numa página
 * fica repartido por duas, e a que ela escolhe pode não ser a que o dono quer.
 * A dona foi explícita — as páginas de campanha não podem aparecer à frente do
 * site.
 *
 * NÃO PROMETE ORDENAÇÃO. Nenhum teste consegue garantir que uma página aparece
 * à frente de outra na Google: quem decide é ela. O que este teste garante é
 * que não estamos a pedir o contrário do que queremos — que é a única parte
 * que nos compete.
 *
 * A separação pretendida:
 *   • páginas de SERVIÇO  → donas do termo genérico ("decoração de casamentos")
 *   • landing pages       → casamentos EM QUINTAS E HERDADES de cada zona
 */

/** Normaliza para comparar: minúsculas, sem acentos, sem a marca nem pontuação. */
function chave(titulo: string): string {
  return titulo
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\|.*$/, "")
    .replace(/liquen events?/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TITULOS_DE_SERVICO = (["pt", "en"] as const).flatMap((locale) =>
  SERVICES.map((s) => {
    const svc = getService(s.slug, locale)!;
    return { pagina: `/servicos/${s.slug} (${locale})`, titulo: svc.metaTitle };
  }),
);

const TITULOS_DE_CAMPANHA = [
  ...(["pt", "en"] as const).flatMap((locale) =>
    POLOS.map((p) => ({
      pagina: `${caminhoPolo(p.slug)} (${locale})`,
      titulo: conteudoPolo(p, locale).metaTitle,
    })),
  ),
  ...(["pt", "en"] as const).flatMap((locale) =>
    ESTILOS.map((e) => ({
      pagina: `/casamentos/estilo/${e.slug} (${locale})`,
      titulo: e[locale].metaTitle,
    })),
  ),
];

describe("canibalização entre as landing pages e o site", () => {
  it("não passa por vacuidade", () => {
    expect(TITULOS_DE_SERVICO.length).toBeGreaterThanOrEqual(10);
    expect(TITULOS_DE_CAMPANHA.length).toBeGreaterThanOrEqual(30);
  });

  it("nenhuma landing page repete o título de uma página de serviço", () => {
    const doServico = new Map(TITULOS_DE_SERVICO.map((s) => [chave(s.titulo), s.pagina]));
    const colisoes: string[] = [];
    for (const c of TITULOS_DE_CAMPANHA) {
      const dono = doServico.get(chave(c.titulo));
      if (dono) {
        colisoes.push(`${c.pagina} usa "${c.titulo}", que já é o título de ${dono}`);
      }
    }
    expect(
      colisoes,
      "duas páginas do mesmo site a disputar a mesma pesquisa:\n" + colisoes.join("\n"),
    ).toEqual([]);
  });

  it("nenhuma landing page repete o título de outra landing page", () => {
    const vistos = new Map<string, string>();
    const colisoes: string[] = [];
    for (const c of TITULOS_DE_CAMPANHA) {
      const k = chave(c.titulo);
      const anterior = vistos.get(k);
      if (anterior) colisoes.push(`${c.pagina} e ${anterior} partilham "${c.titulo}"`);
      else vistos.set(k, c.pagina);
    }
    expect(colisoes, "landing pages a competir entre si:\n" + colisoes.join("\n")).toEqual([]);
  });

  it("as descrições também não são repetidas entre landing pages", () => {
    // Duas descrições iguais dizem à Google que as páginas são a mesma coisa,
    // e é meio caminho para ela indexar só uma delas.
    const descricoes = (["pt", "en"] as const).flatMap((locale) =>
      POLOS.map((p) => ({ pagina: p.slug, d: conteudoPolo(p, locale).metaDescription })),
    );
    const vistos = new Map<string, string>();
    const colisoes: string[] = [];
    for (const x of descricoes) {
      const anterior = vistos.get(x.d);
      if (anterior) colisoes.push(`${x.pagina} e ${anterior}: "${x.d.slice(0, 60)}..."`);
      else vistos.set(x.d, x.pagina);
    }
    expect(colisoes, "descrições repetidas:\n" + colisoes.join("\n")).toEqual([]);
  });

  it("as introduções são genuinamente diferentes entre polos", () => {
    // A defesa contra "doorway pages": treze páginas com o mesmo texto e o
    // topónimo trocado. Compara-se o primeiro parágrafo de cada, ignorando os
    // nomes próprios, e exige-se que não haja dois quase iguais.
    const semNomes = (t: string) =>
      t
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/\b[A-Z][a-z]+\b/g, "")
        .toLowerCase()
        .replace(/[^a-z ]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3);

    const pares: string[] = [];
    for (let i = 0; i < POLOS.length; i++) {
      for (let j = i + 1; j < POLOS.length; j++) {
        const a = new Set(semNomes(POLOS[i].pt.intro[0]));
        const b = new Set(semNomes(POLOS[j].pt.intro[0]));
        const comuns = [...a].filter((w) => b.has(w)).length;
        const jaccard = comuns / (a.size + b.size - comuns);
        if (jaccard > 0.5) {
          pares.push(
            `${POLOS[i].slug} e ${POLOS[j].slug} têm introduções ${Math.round(jaccard * 100)}% iguais`,
          );
        }
      }
    }
    expect(
      pares,
      "introduções quase idênticas — é o padrão de doorway page que a Google penaliza:\n" +
        pares.join("\n"),
    ).toEqual([]);
  });
});
