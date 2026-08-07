import { describe, it, expect } from "vitest";
import { pt } from "./pt";
import { en } from "./en";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O FORMULÁRIO NÃO PRESUME QUEM SÃO OS DOIS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Os campos diziam "Nome do noivo" e "Nome da noiva". Para dois homens ou duas
 * mulheres, o formulário estava a dizer-lhes que não contava com eles — logo no
 * primeiro contacto, e num pedido de orçamento de casamento, que é o momento em
 * que menos se quer que isso aconteça.
 *
 * Isto não é um teste de tradução: é um teste de uma DECISÃO. O texto pode
 * mudar de forma à vontade — o que não pode é voltar a nomear um género num
 * campo que é preenchido por qualquer um dos dois. Um "Nome do noivo" escrito
 * por distracção daqui a seis meses passa despercebido a toda a gente menos ao
 * casal a quem não serve, e esse não avisa: desiste.
 *
 * Os dados sempre estiveram certos (`partnerA`/`partnerB`). Era só o texto.
 */

/** Palavras que nomeiam um género. Os campos de nome não as podem usar. */
const GENERADAS = [
  /\bnoivo\b/i,
  /\bnoiva\b/i,
  /\bgroom\b/i,
  /\bbride\b/i,
  /\bhusband\b/i,
  /\bwife\b/i,
  /\bmarido\b/i,
  /\besposa\b/i,
];

describe("os nomes do casal não presumem género", () => {
  for (const [lingua, d] of [
    ["pt", pt],
    ["en", en],
  ] as const) {
    const campos = {
      "placeholder A": d.orcamento.phNoivo,
      "placeholder B": d.orcamento.phNoiva,
      "rótulo acessível A": d.orcamento.ariaNoivoA,
      "rótulo acessível B": d.orcamento.ariaNoivoB,
      "título da secção": d.orcamento.labelNoivos,
    };

    for (const [onde, texto] of Object.entries(campos)) {
      it(`${lingua} · ${onde} não nomeia um género`, () => {
        const culpadas = GENERADAS.filter((re) => re.test(texto));
        expect(
          culpadas,
          `«${texto}» usa uma palavra que nomeia um género (${culpadas.join(", ")})`,
        ).toEqual([]);
      });
    }

    /**
     * Os dois campos visíveis são IGUAIS de propósito: é a única forma que não
     * tem de escolher uma ordem nem um género. Se alguém os diferenciar outra
     * vez pelo que se VÊ, está a reintroduzir a escolha pela porta do lado.
     */
    it(`${lingua} · os dois campos visíveis são iguais`, () => {
      expect(d.orcamento.phNoivo).toBe(d.orcamento.phNoiva);
    });

    /**
     * E os rótulos acessíveis TÊM de ser diferentes: dois campos "Nome"
     * seguidos são indistinguíveis para quem ouve o formulário em vez de o ver,
     * e é aí que a diferença faz falta.
     */
    it(`${lingua} · os rótulos acessíveis distinguem-nos`, () => {
      expect(d.orcamento.ariaNoivoA).not.toBe(d.orcamento.ariaNoivoB);
      expect(d.orcamento.ariaNoivoA.trim().length).toBeGreaterThan(0);
      expect(d.orcamento.ariaNoivoB.trim().length).toBeGreaterThan(0);
    });
  }
});
