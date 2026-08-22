import { describe, it, expect } from "vitest";
import type { ProposalDoc } from "./proposal-doc";
import { paginasDaProposta, resumoDaPagina } from "./proposal-paginas";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PALAVRAS DA MINIATURA SÃO AS PALAVRAS DA FOLHA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Palavras dela: «uma pré-visualização parcial dá falsa confiança».
 *
 * O que a vista de conjunto mostrava eram os mood boards — desenhados à escala,
 * com as fotografias lá dentro. As outras seis folhas não se viam, e foi nelas
 * que estiveram os erros que chegaram a clientes: uma secção vazia, um
 * `{{marcador}}` por substituir, texto português numa proposta inglesa.
 *
 * Nenhum desses é um erro de paginação. São todos erros de PALAVRAS — e é isso
 * que se prende aqui: que as palavras que a miniatura mostra sejam, uma a uma,
 * as que o gerador vai escrever na folha.
 */

const BASE = {
  template: "decoracao",
  ref: "PO",
  clientNames: "Maria & Zé",
  eventType: "Casamento",
  eventDate: "3 de julho de 2027",
  location: "Monte da Oliveirinha",
  guests: "150 pax",
  serviceGroups: [
    { title: "Decoração Floral", items: [{ label: "Cerimónia" }, { label: "Copo de água" }] },
  ],
  moodBoards: [],
  budgetItems: ["Decor Cerimónia", "Decor Jantar"],
  totalLabel: "Valor Total Decoração",
  totalText: "3.000,00 € + IVA",
  coverImages: [],
  notasImportantes: [],
  incluido: [],
  naoIncluido: [],
  condicoesGerais: ["O valor não inclui IVA."],
  observacoesGerais: ["A montagem é feita na véspera."],
  faseamento: [],
  cancelamento: [],
  cronograma: [],
} as unknown as ProposalDoc;

const pagina = (doc: ProposalDoc, especie: string) => {
  const p = paginasDaProposta(doc).find((x) => x.especie === especie);
  if (!p) throw new Error(`sem página «${especie}»`);
  return p;
};
const resumo = (doc: ProposalDoc, especie: string, idioma: "pt" | "en" = "pt") =>
  resumoDaPagina(doc, pagina(doc, especie), idioma);

describe("o que está escrito em cada folha", () => {
  it("a apresentação leva os campos do evento e os serviços por baixo", () => {
    const r = resumo(BASE, "apresentacao");
    expect(r.titulo).toBe("Apresentação");
    expect(r.linhas).toContain("Noivos: Maria & Zé");
    expect(r.linhas).toContain("Data do Evento: 3 de julho de 2027");
    expect(r.linhas).toContain("Decoração Floral");
    expect(r.linhas).toContain("Copo de água");
  });

  it("um campo sem valor não desenha um rótulo seguido de nada", () => {
    // «Hora:» sozinho não é um campo por preencher: é um erro impresso numa
    // folha que vai para o cliente — e o gerador salta-o pela mesma razão.
    const r = resumo({ ...BASE, time: "" } as ProposalDoc, "apresentacao");
    expect(r.linhas.some((l) => l.startsWith("Hora"))).toBe(false);
  });

  it("o orçamento leva as linhas e o total com o rótulo dela", () => {
    const r = resumo(BASE, "orcamento");
    expect(r.linhas).toContain("Decor Cerimónia");
    expect(r.linhas).toContain("Valor Total Decoração: 3.000,00 € + IVA");
  });

  it("sem valor, o total sai com um travessão — e vê-se antes de ir", () => {
    const r = resumo({ ...BASE, totalText: "" } as ProposalDoc, "orcamento");
    expect(r.linhas).toContain("Valor Total Decoração: —");
  });

  /**
   * O DEFEITO QUE ISTO APANHA, DITO EM UMA LINHA.
   *
   * Um `{{marcador}}` por substituir chega ao papel. O P0 já trava o envio; a
   * miniatura tem de o MOSTRAR, senão ela não sabe onde ele está.
   */
  it("um marcador por substituir aparece tal e qual", () => {
    const r = resumo({ ...BASE, location: "{{local}}" } as ProposalDoc, "apresentacao");
    expect(r.linhas).toContain("Local: {{local}}");
  });

  it("uma folha sem nada escrito diz que está vazia", () => {
    const r = resumo({ ...BASE, condicoesGerais: [] } as ProposalDoc, "condicoes");
    expect(r.vazia).toBe(true);
    expect(r.linhas).toEqual([]);
  });

  it("uma folha com texto não está vazia", () => {
    expect(resumo(BASE, "condicoes").vazia).toBe(false);
  });

  /**
   * A LÍNGUA É A DA FOLHA, E NÃO A DO ESTÚDIO.
   *
   * Uma proposta inglesa com uma secção em português é o erro que mais vezes
   * chegou a um cliente. Se a miniatura mostrasse sempre o português, era o
   * único sítio onde ele NÃO se via.
   */
  it("em inglês, os rótulos e os títulos saem em inglês", () => {
    const r = resumo(BASE, "apresentacao", "en");
    expect(r.titulo).toBe("Event Overview");
    expect(r.linhas).toContain("Couple: Maria & Zé");
    expect(r.linhas.some((l) => l.startsWith("Noivos"))).toBe(false);
  });

  it("a capa diz o que está escrito no painel escuro", () => {
    const r = resumo(BASE, "capa");
    expect(r.titulo).toBe("Maria & Zé");
    expect(r.linhas[0]).toContain("Casamento");
    expect(r.linhas[0]).toContain("3 de julho de 2027");
    expect(r.linhas).toContain("Monte da Oliveirinha");
  });

  it("todas as páginas do documento sabem responder", () => {
    const doc = {
      ...BASE,
      moodBoards: [{ title: "Bouquets", images: ["f.jpg"] }],
      cronograma: [{ title: "6-12 meses antes", items: ["Escolher a quinta"] }],
    } as unknown as ProposalDoc;
    for (const p of paginasDaProposta(doc)) {
      const r = resumoDaPagina(doc, p);
      expect(r, `${p.especie} sem resumo`).toBeTruthy();
      expect(typeof r.titulo).toBe("string");
    }
  });
});
