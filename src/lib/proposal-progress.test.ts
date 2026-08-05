import { describe, it, expect } from "vitest";
import { estadoDasSeccoes, oQueFaltaParaEnviar, podeEnviar } from "./proposal-progress";
import type { ProposalDoc } from "./proposal-doc";

/** O documento tal como o estúdio o ABRE: a estrutura montada, nada escrito. */
const RECEM_ABERTO = {
  template: "decoracao",
  ref: "",
  clientNames: "",
  eventType: "Casamento",
  eventDate: "",
  location: "",
  guests: "",
  serviceGroups: [{ letter: "a)", title: "", items: [{ label: "", desc: "" }] }],
  moodBoards: [],
  budgetItems: [],
  coverImages: ["", ""],
  totalLabel: "Valor Total Decoração",
  totalText: "",
} as unknown as ProposalDoc;

const COMPLETO = {
  ...RECEM_ABERTO,
  ref: "Decoração Casamento Irina e Hugo",
  clientNames: "Irina e Hugo",
  eventDate: "10 de junho de 2027",
  location: "Herdade da Maridona",
  serviceGroups: [{ letter: "a)", title: "Decoração Floral", items: [{ label: "Igreja" }] }],
  moodBoards: [{ title: "Cerimónia", images: ["a.jpg"] }],
  budgetItems: ["Decor Cerimónia", "Decor Jantar"],
  budgetAmounts: [900, 2350],
  coverImages: ["capa.jpg", ""],
  totalAmount: 3250,
} as unknown as ProposalDoc;

describe("estadoDasSeccoes", () => {
  /**
   * A ARMADILHA DESTE INDICADOR.
   *
   * O estúdio abre com um grupo de serviços já lá — com o título vazio e um
   * item vazio. Contar a estrutura em vez do conteúdo punha um visto verde
   * numa secção onde não há nada escrito, e um indicador que mente uma vez
   * deixa de ser lido.
   */
  it("um grupo vazio não conta como serviços preenchidos", () => {
    const s = estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "servicos");
    expect(s?.preenchida).toBe(false);
    expect(s?.resumo).toBe("por preencher");
  });

  it("um grupo com título conta", () => {
    const s = estadoDasSeccoes(COMPLETO).find((x) => x.id === "servicos");
    expect(s?.preenchida).toBe(true);
    expect(s?.resumo).toBe("1 grupo");
  });

  it("uma posição de capa vazia não conta como foto", () => {
    // O array das capas tem SEMPRE duas posições; uma vazia é `""`.
    expect(estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "capas")?.resumo).toBe("sem fotos");
    expect(estadoDasSeccoes(COMPLETO).find((x) => x.id === "capas")?.resumo).toBe("1 foto");
  });

  it("o evento só está feito com nome, data e local", () => {
    expect(estadoDasSeccoes(RECEM_ABERTO).find((x) => x.id === "evento")?.preenchida).toBe(false);
    const semLocal = { ...COMPLETO, location: "" } as unknown as ProposalDoc;
    expect(estadoDasSeccoes(semLocal).find((x) => x.id === "evento")?.preenchida).toBe(false);
    expect(estadoDasSeccoes(COMPLETO).find((x) => x.id === "evento")?.preenchida).toBe(true);
  });

  it("o singular e o plural estão certos", () => {
    // Um indicador que diz "1 linhas" faz duvidar de tudo o resto que diz.
    const uma = { ...COMPLETO, budgetItems: ["Só uma"] } as unknown as ProposalDoc;
    expect(estadoDasSeccoes(uma).find((x) => x.id === "orcamento")?.resumo).toBe("1 linha");
    expect(estadoDasSeccoes(COMPLETO).find((x) => x.id === "orcamento")?.resumo).toBe("2 linhas");
  });

  it("no modelo de Organização mostra o cronograma, não os mood boards", () => {
    const org = { ...COMPLETO, template: "organizacao" } as unknown as ProposalDoc;
    const ids = estadoDasSeccoes(org).map((s) => s.id);
    expect(ids).toContain("cronograma");
    expect(ids).not.toContain("moodboards");
    expect(ids).not.toContain("capas");
  });
});

describe("oQueFaltaParaEnviar", () => {
  it("numa proposta vazia, o que trava é o nome, o título e o valor", () => {
    const travam = oQueFaltaParaEnviar(RECEM_ABERTO, 0)
      .filter((f) => f.trava)
      .map((f) => f.texto);
    expect(travam).toEqual([
      "Falta o nome dos clientes",
      "Falta o título interno",
      "Falta o valor",
    ]);
  });

  it("numa proposta completa não trava nada", () => {
    expect(oQueFaltaParaEnviar(COMPLETO, 3997.5).filter((f) => f.trava)).toEqual([]);
  });

  it("cada falta sabe a que secção pertence, para o link lá saltar", () => {
    for (const f of oQueFaltaParaEnviar(RECEM_ABERTO, 0)) {
      expect(f.seccao).toBeTruthy();
      expect(estadoDasSeccoes(RECEM_ABERTO).map((s) => s.id)).toContain(f.seccao);
    }
  });

  it("os conselhos não travam", () => {
    // Uma proposta sem mood boards pode ser enviada. Provavelmente não devia,
    // e é isso que a diferença entre travar e aconselhar diz.
    const semBoards = { ...COMPLETO, moodBoards: [] } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(semBoards, 3997.5);
    expect(f.some((x) => x.texto === "Sem mood boards")).toBe(true);
    expect(f.every((x) => !x.trava)).toBe(true);
    expect(podeEnviar(semBoards, 3997.5)).toBe(true);
  });

  it("avisa quando o total não bate com a soma das linhas", () => {
    const torto = { ...COMPLETO, totalAmount: 4000 } as unknown as ProposalDoc;
    const f = oQueFaltaParaEnviar(torto, 4920);
    expect(f.some((x) => x.texto.includes("não bate"))).toBe(true);
  });

  /**
   * A RAZÃO DE ISTO SER UM MÓDULO.
   *
   * A mesma verdade é precisa na navegação, no aviso e no botão. Se
   * divergirem, o aviso diz que falta o valor e o botão deixa enviar na
   * mesma. `podeEnviar` lê a MESMA lista.
   */
  it("o botão e o aviso nunca podem discordar", () => {
    for (const [doc, total] of [
      [RECEM_ABERTO, 0],
      [COMPLETO, 3997.5],
      [{ ...COMPLETO, clientNames: "" }, 3997.5],
      [{ ...COMPLETO, ref: "" }, 3997.5],
      [COMPLETO, 0],
    ] as [ProposalDoc, number][]) {
      const travam = oQueFaltaParaEnviar(doc, total).some((f) => f.trava);
      expect(podeEnviar(doc, total)).toBe(!travam);
    }
  });
});
