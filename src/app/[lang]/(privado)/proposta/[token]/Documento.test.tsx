// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Documento from "./Documento";
import type { ProposalDoc } from "@/lib/proposal-doc";
import type { FotoDaProposta } from "@/lib/proposta-fotos";

/**
 * O documento inteiro desenhado para ecrã. O que se prende aqui é o que o
 * casal LÊ: as secções, a ordem, a língua e o dinheiro.
 */

afterEach(cleanup);

const FOTOS: FotoDaProposta[] = [
  { id: "c0", miniatura: "mini/capa", original: "orig/capa", largura: 1600, altura: 1067 },
  { id: "b0f0", miniatura: "mini/0-0", original: "orig/0-0", largura: 1200, altura: 800 },
  { id: "b0f1", miniatura: "mini/0-1", original: "orig/0-1" },
  // b0f2 NÃO resolveu: nem miniatura nem original. Não pode virar buraco.
  { id: "b0f2" },
];

const DOC: ProposalDoc = {
  ref: "PO Decoração",
  clientNames: "Ana & Rui",
  eventType: "Casamento",
  eventDate: "3 de julho de 2027",
  location: "Monte da Oliveirinha",
  guests: "150 pax",
  serviceGroups: [
    {
      letter: "A",
      title: "Decoração Cerimónia",
      titleEn: "Ceremony Decoration",
      items: [{ label: "Arco floral", labelEn: "Floral arch", desc: "Com lisianthus" }],
    },
  ],
  moodBoards: [
    {
      title: "Cerimónia",
      titleEn: "Ceremony",
      subtitulo: "Tons quentes",
      annotation: "A escolher com a noiva",
      images: ["ped/0.jpg", "ped/1.jpg", "ped/2.jpg"],
      principal: 1,
    },
  ],
  budgetItems: ["Decor Cerimónia", "Decor Jantar"],
  budgetOpcional: [false, true],
  coverImages: ["ped/capa.jpg"],
  totalAmount: 24600,
  totalVatMode: "incluido",
  vatRate: 0.23,
  totalLabel: "Valor Total Decoração",
  totalText: "24.600,00 €",
  notasImportantes: [],
  incluido: [],
  naoIncluido: [],
  condicoesGerais: ["Esta proposta só é válida para o evento a realizar no dia {DATA}."],
  observacoesGerais: [],
  faseamento: [],
  cancelamento: [],
} as unknown as ProposalDoc;

const desenhar = (over: Partial<ProposalDoc> = {}, idioma: "pt" | "en" = "pt") =>
  render(
    <Documento doc={{ ...DOC, ...over } as ProposalDoc} idioma={idioma} fotos={FOTOS} token="tk" />,
  );

describe("as secções e a ordem", () => {
  it("sai pela ordem do documento — apresentação, serviços, inspiração, orçamento, condições", () => {
    desenhar();
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(titulos).toEqual([
      "Apresentação",
      "Serviços",
      "Inspiração",
      "Orçamento Proposto",
      "Condições Gerais",
    ]);
  });

  it("o índice do topo salta para as fotografias sem sair da página", () => {
    desenhar();
    const indice = screen.getByRole("navigation", { name: /nesta página/i });
    const salto = within(indice).getByRole("link", { name: "Inspiração" });
    expect(salto).toHaveAttribute("href", "#inspiracao");
    // O destino existe mesmo — um índice que aponta para nada é pior do que
    // não haver índice.
    expect(document.getElementById("inspiracao")).not.toBeNull();
  });

  it("a apresentação não imprime um rótulo seguido de nada", () => {
    // CONTROLO POSITIVO primeiro: com local escrito, o rótulo E o valor estão lá.
    desenhar();
    expect(screen.getByText("Local")).toBeTruthy();
    expect(screen.getByText("Monte da Oliveirinha")).toBeTruthy();
    cleanup();
    // E sem local, some o par inteiro — não fica um «Local:» seguido de nada.
    desenhar({ location: "" });
    expect(screen.queryByText("Local")).toBeNull();
    expect(screen.queryByText("Monte da Oliveirinha")).toBeNull();
  });
});

describe("a língua é a do DOCUMENTO", () => {
  it("em inglês, a moldura e a prosa dela saem as duas em inglês", () => {
    desenhar({}, "en");
    const titulos = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(titulos).toContain("Services");
    // A prosa dela vem do `titleEn` que ELA escreveu — não de uma tradução.
    expect(screen.getByText("Ceremony Decoration")).toBeTruthy();
    expect(screen.getByText("Floral arch")).toBeTruthy();
  });

  it("um campo sem versão inglesa cai para o português, calado", () => {
    desenhar({}, "en");
    // `desc` não tem `descEn` escrito: sai como está, sem marca nenhuma.
    expect(screen.getByText("Com lisianthus")).toBeTruthy();
  });
});

describe("o dinheiro fica em pt-PT nas duas línguas", () => {
  const total = () => screen.getByText(/24[.,]600/);

  it("em português", () => {
    desenhar();
    expect(total().textContent).toContain("24.600,00");
  });

  it("EM INGLÊS TAMBÉM — e é deliberado", () => {
    desenhar({}, "en");
    const texto = total().textContent ?? "";
    expect(texto).toContain("24.600,00");
    // CONTROLO POSITIVO da afirmação inversa: se alguém localizar isto para
    // en-GB, o mesmo número passa a ler-se «24,600.00» e este teste apanha-o.
    expect(texto).not.toContain("24,600.00");
  });

  it("a marca «extra» viaja com a linha que ela marcou", () => {
    desenhar();
    const linhas = screen.getAllByText(/Decor /);
    // A segunda rubrica é a opcional; a primeira não.
    expect(linhas[0].parentElement?.textContent).not.toContain("extra");
    expect(linhas[1].parentElement?.textContent).toContain("extra");
  });
});

describe("as condições gerais", () => {
  it("os marcadores são preenchidos — o casal nunca lê um «{DATA}»", () => {
    desenhar();
    const texto = document.body.textContent ?? "";
    expect(texto).not.toContain("{DATA}");
    expect(texto).toContain("3 de julho de 2027");
  });
});

describe("as fotografias", () => {
  it("a grelha pede a MINIATURA, nunca o original", () => {
    desenhar();
    const fontes = [...document.querySelectorAll("img")].map((i) => i.getAttribute("src"));
    expect(fontes).toContain("mini/0-0");
    expect(fontes).not.toContain("orig/0-0");
  });

  it("uma foto que não resolveu não deixa buraco nenhum", () => {
    desenhar();
    // Três fotos no board, duas resolvidas: desenham-se duas células e não
    // três. `b0f2` não tem endereço nenhum — uma célula vazia numa proposta de
    // vinte mil euros lê-se como descuido.
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    expect(botoes).toHaveLength(2);
  });

  it("a foto marcada como principal sai sozinha, antes da grelha", () => {
    desenhar();
    const botoes = screen.getAllByRole("button", { name: /Ampliar/ });
    // `principal: 1` é a segunda foto do documento (`b0f1`, sem forma
    // guardada). Sai em PRIMEIRO no ecrã, com a largura toda.
    expect(botoes[0].querySelector("img")?.getAttribute("src")).toBe("mini/0-1");
  });

  it("um board sem uma única foto resolvida não chega a aparecer", () => {
    render(
      <Documento doc={DOC} idioma="pt" fotos={[{ id: "c0", miniatura: "mini/capa" }]} token="tk" />,
    );
    expect(screen.queryByRole("heading", { name: "Inspiração" })).toBeNull();
    // E o índice também não promete o que não existe.
    expect(screen.queryByRole("link", { name: "Inspiração" })).toBeNull();
  });
});
