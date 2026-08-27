import { describe, it, expect } from "vitest";
import { corDeTexto, UNKNOWN_STATUS_COLOR } from "./status-meta";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS RÓTULOS DA PALETA DE ESTADOS LEEM-SE — A CONTA, FEITA AQUI
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A varredura de contraste (`e2e/contraste-do-back-office.spec.ts`) encontrou-os
 * no browser, nos onze destinos do painel. Aqui faz-se a ARITMÉTICA da norma,
 * que é o que impede a correcção de se desfazer sem ninguém dar por isso: um
 * passeio depende de a vista ter dados, e uma conta não depende de nada.
 *
 * A fórmula é a do `contraste-do-texto.test.ts` — luminância relativa da WCAG,
 * com o alfa achatado ANTES de medir, que é onde toda a gente se engana.
 */

const canal = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const lum = (p: number[]) =>
  0.2126 * canal(p[0] / 255) + 0.7152 * canal(p[1] / 255) + 0.0722 * canal(p[2] / 255);
const ler = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const achatar = (frente: number[], alfa: number, fundo: number[]) =>
  frente.map((c, i) => c * alfa + fundo[i] * (1 - alfa));
const racio = (a: number[], b: number[]) => {
  const [alto, baixo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (alto + 0.05) / (baixo + 0.05);
};

const BRANCO = [255, 255, 255];
const MINIMO = 4.5;

/**
 * Cada rótulo desta paleta, com o FUNDO em que ele é mesmo desenhado.
 *
 * Os crachás pintam o fundo com a própria cor a um alfa baixo — `${cor}22` nas
 * tarefas, `${cor}18` na Visão Geral —, portanto medir contra branco daria um
 * número melhor do que o verdadeiro. É por isso que o fundo vai escrito aqui
 * caso a caso, e não assumido.
 */
const ROTULOS: { onde: string; cor: string; fundo: number[] }[] = [
  {
    onde: "Tarefas · prioridade «Normal»",
    cor: "#9aa36a",
    fundo: achatar(ler("#9aa36a"), 0x22 / 255, BRANCO),
  },
  {
    onde: "Visão Geral · estado «Novo»",
    cor: "#8a8a82",
    fundo: achatar(ler("#8a8a82"), 0x18 / 255, BRANCO),
  },
  {
    onde: "Visão Geral · estado «Aguardar resposta»",
    cor: "#9aa36a",
    fundo: achatar(ler("#9aa36a"), 0x18 / 255, BRANCO),
  },
  { onde: "Estatísticas · taxa de conversão", cor: "#8a8a82", fundo: BRANCO },
  { onde: "Material · tipo «Consumível»", cor: "#8a6d2f", fundo: ler("#f6efe1") },
];

describe("os rótulos da paleta de estados", () => {
  for (const { onde, cor, fundo } of ROTULOS) {
    it(`${onde} passa a norma quando escrito`, () => {
      const medido = racio(ler(corDeTexto(cor)), fundo);
      expect(
        Math.round(medido * 100) / 100,
        `${onde}: ${cor} → ${corDeTexto(cor)} mede ${medido.toFixed(2)}:1 sobre o seu fundo`,
      ).toBeGreaterThanOrEqual(MINIMO);
    });
  }

  /**
   * E ao contrário: sem o degrau de texto, estes MESMOS rótulos chumbam. É o que
   * impede o teste de passar por acaso — se alguém apagar o `corDeTexto` e o
   * deixar a devolver a cor como veio, esta afirmação cai.
   */
  it("sem o degrau de texto, os mesmos rótulos chumbavam", () => {
    const chumbavam = ROTULOS.filter(({ cor, fundo }) => racio(ler(cor), fundo) < MINIMO);
    expect(
      chumbavam.map((r) => r.onde),
      "nenhum rótulo chumbava com a cor crua — este teste deixou de provar alguma coisa",
    ).toHaveLength(ROTULOS.length);
  });

  /** Uma cor de fora da tabela volta como veio — nunca desaparece. */
  it("uma cor desconhecida volta intacta", () => {
    expect(corDeTexto("#123456")).toBe("#123456");
    expect(corDeTexto(UNKNOWN_STATUS_COLOR)).toBe(corDeTexto("#8a8a82"));
  });
});
