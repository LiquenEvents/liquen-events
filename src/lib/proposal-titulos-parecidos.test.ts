import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "./proposal-doc";
import {
  avisoDeTituloParecido,
  essenciaDoTitulo,
  titulosParecidos,
} from "./proposal-titulos-parecidos";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DUAS PÁGINAS COM O MESMO NOME, UMA A SEGUIR À OUTRA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «páginas 6 e 7 dos mood boards: "Complementos Dos Noivos" e
 * "Complementos Noivos". Uma é bouquet, outra lapelas — mas na proposta
 * aparecem dois títulos praticamente idênticos seguidos».
 *
 * Os dois títulos são escritos com dias de intervalo, em cartões dobrados,
 * longe um do outro. Cada um, sozinho, está certo — o que está errado só existe
 * quando os dois se põem lado a lado, e o sítio onde isso acontece pela
 * primeira vez é o PDF, com o casal a lê-lo.
 *
 * O que se prende aqui são as duas metades do problema: apanhar o caso dela, e
 * NÃO apanhar as escolhas legítimas. Um aviso que trava uma decisão legítima
 * ensina-se a ignorar, e o próximo — o que interessa — ignora-se com ele.
 */

const BASE = {
  template: "decoracao",
  ref: "PO",
  clientNames: "Maria & Zé",
  serviceGroups: [{ title: "Decoração", items: [{ label: "Cerimónia" }] }],
  budgetItems: [],
  coverImages: [],
  cronograma: [],
} as unknown as ProposalDoc;

const com = (...titulos: (string | { titulo: string; fotos: number })[]) =>
  ({
    ...BASE,
    moodBoards: titulos.map((t) => {
      const { titulo, fotos } = typeof t === "string" ? { titulo: t, fotos: 1 } : t;
      return { title: titulo, images: Array.from({ length: fotos }, (_, i) => `f${i}.jpg`) };
    }),
  }) as unknown as ProposalDoc;

describe("a essência de um título", () => {
  it("tira os acentos, as maiúsculas e a pontuação", () => {
    expect(essenciaDoTitulo("Cerimónia!")).toBe(essenciaDoTitulo("cerimonia"));
  });

  it("tira as palavras que não distinguem nada", () => {
    // «Dos» é o que uma pessoa salta ao ler um índice.
    expect(essenciaDoTitulo("Complementos Dos Noivos")).toBe(
      essenciaDoTitulo("Complementos Noivos"),
    );
  });

  it("a ordem das palavras não faz um nome diferente", () => {
    expect(essenciaDoTitulo("Noivos Complementos")).toBe(essenciaDoTitulo("Complementos Noivos"));
  });

  it("mas os números distinguem", () => {
    // «Mesa 1» e «Mesa 2» é uma decisão, não um descuido.
    expect(essenciaDoTitulo("Mesa 1")).not.toBe(essenciaDoTitulo("Mesa 2"));
  });

  it("e a pontuação não cola os números às palavras", () => {
    expect(essenciaDoTitulo("Mesas—1")).toBe("1 mesas");
  });
});

describe("as páginas com títulos que se lêem como o mesmo nome", () => {
  /** O CASO DELA, ao pé da letra. */
  it("apanha «Complementos Dos Noivos» e «Complementos Noivos»", () => {
    const doc = com("Cerimónia", "Complementos Dos Noivos", "Complementos Noivos");
    const grupos = titulosParecidos(doc);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].bis).toEqual([1, 2]);
    expect(grupos[0].titulos).toEqual(["Complementos Dos Noivos", "Complementos Noivos"]);
  });

  it("«Mesa 1» e «Mesa 2» não são um problema", () => {
    expect(titulosParecidos(com("Mesa 1", "Mesa 2"))).toEqual([]);
  });

  it("títulos diferentes ficam em paz", () => {
    expect(titulosParecidos(com("Cerimónia", "Jantar", "Copo de água"))).toEqual([]);
  });

  it("três páginas com o mesmo nome saem num grupo só", () => {
    const grupos = titulosParecidos(com("Mesas", "As Mesas", "mesas"));
    expect(grupos).toHaveLength(1);
    expect(grupos[0].bis).toEqual([0, 1, 2]);
  });

  /**
   * SÓ AS PÁGINAS QUE CHEGAM A SAIR.
   *
   * Uma página sem fotografias não é impressa. Acusar um choque com uma folha
   * que não existe é mandar corrigir o que ninguém vai ler.
   */
  it("uma página sem fotografias não choca com nada", () => {
    const doc = com({ titulo: "Mesas", fotos: 1 }, { titulo: "As Mesas", fotos: 0 });
    expect(titulosParecidos(doc)).toEqual([]);
  });

  /**
   * TÍTULOS VAZIOS TÊM O SEU PRÓPRIO AVISO.
   *
   * Juntá-los aqui dava «estas três páginas têm o mesmo nome» sobre três
   * páginas que não têm nome nenhum.
   */
  it("páginas sem título não contam como parecidas", () => {
    expect(titulosParecidos(com("", "   ", ""))).toEqual([]);
  });

  it("um título feito só de palavras vazias não acusa ninguém", () => {
    expect(titulosParecidos(com("de", "dos"))).toEqual([]);
  });
});

describe("o aviso que uma página vê sobre si própria", () => {
  it("cita o OUTRO título, e não a si própria", () => {
    // Dizer só «há títulos parecidos» obrigava a procurar qual.
    const doc = com("Complementos Dos Noivos", "Complementos Noivos");
    expect(avisoDeTituloParecido(doc, 0)).toContain("«Complementos Noivos»");
    expect(avisoDeTituloParecido(doc, 0)).not.toContain("«Complementos Dos Noivos»");
    expect(avisoDeTituloParecido(doc, 1)).toContain("«Complementos Dos Noivos»");
  });

  it("com três, nomeia as outras duas", () => {
    const doc = com("Mesas", "As Mesas", "mesas");
    const aviso = avisoDeTituloParecido(doc, 0) ?? "";
    expect(aviso).toContain("«As Mesas»");
    expect(aviso).toContain("«mesas»");
    expect(aviso).toContain("lêem-se");
  });

  it("uma palavra a mais é outro nome — «As mesas todas» não entra", () => {
    // O limite tem de estar em algum sítio, e está aqui: o que sobra depois de
    // tirar o que não distingue. «Todas» distingue.
    expect(avisoDeTituloParecido(com("Mesas", "As mesas todas"), 0)).toBeNull();
  });

  it("uma página sem par não diz nada", () => {
    expect(avisoDeTituloParecido(com("Cerimónia", "Jantar"), 0)).toBeNull();
  });
});
