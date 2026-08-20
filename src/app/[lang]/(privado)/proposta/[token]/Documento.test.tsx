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

  /**
   * A DECISÃO MUDOU, E ESTE TESTE MUDOU COM ELA.
   *
   * Aqui exigia-se o contrário — «24.600,00» também em inglês — com um
   * controlo positivo a apanhar quem localizasse. Foi esse controlo que fez o
   * trabalho: acendeu-se assim que o dinheiro passou a seguir a língua, que é
   * exactamente para o que ele lá estava.
   *
   * A decisão nova é dela, 20-08-2026: «se é em pt o dinheiro tem que estar em
   * português, mas se é em eng o dinheiro tem que estar em inglês». Resolve um
   * desacordo a sério — o PDF já localizava (`proposal-doc-pdf.ts:858`), e o
   * casal inglês recebia o mesmo número escrito de duas maneiras nos dois
   * documentos que abre ao mesmo tempo.
   */
  it("e em inglês escreve-se à inglesa — como o PDF já fazia", () => {
    desenhar({}, "en");
    const texto = total().textContent ?? "";
    expect(texto).toContain("24,600.00");
    // Controlo positivo da afirmação inversa: se alguém voltar a fixar o
    // português nas duas línguas, o número volta a «24.600,00» e isto apanha-o.
    expect(texto).not.toContain("24.600,00");
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
  /**
   * ── A CAPA É A MAIOR IMAGEM DA PÁGINA ───────────────────────────────────
   *
   * Desenha-se com a largura toda do documento — até 1024 px numa janela
   * larga, ~1170 pixéis num iPhone. Se pedir só a miniatura de 400, é a mesma
   * imagem esticada da galeria, na primeira coisa que o casal vê ao abrir.
   */
  const capa = () => {
    const img = document.querySelector("img");
    if (!img) throw new Error("a capa não se desenhou");
    return img;
  };

  it("a capa oferece a derivada intermédia, e não só a miniatura", () => {
    desenhar();
    const srcset = capa().getAttribute("srcset") ?? "";
    expect(srcset).toContain("mini/capa 400w");
    expect(srcset).toContain("/api/proposta/tk/foto/c0 1200w");
  });

  it("e diz que largura ocupa — senão pede sempre a maior", () => {
    desenhar();
    expect(capa().getAttribute("sizes")).toBe("(min-width: 1024px) 1024px, 100vw");
  });

  it("uma capa sem miniatura fica com o original e sem `srcset` a mentir", () => {
    // Sem miniatura não há candidato de 400 px: um `srcset` com uma medida só
    // dizia ao navegador que o original tem 1200, e ele tem 2200.
    render(
      <Documento doc={DOC} idioma="pt" fotos={[{ id: "c0", original: "orig/capa" }]} token="tk" />,
    );
    expect(capa().getAttribute("src")).toBe("orig/capa");
    expect(capa().getAttribute("srcset")).toBeNull();
  });

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

describe("o modelo Organização", () => {
  const ORG = {
    template: "organizacao",
    budgetItems: [],
    budgetRows: [
      { item: "Coordenação do dia", price: "2.500,00 €" },
      { item: "Reuniões de preparação", price: "[Valor]" },
      { item: "Cronograma e fornecedores", price: "" },
    ],
    cronograma: [{ title: "Fase 1 · Conceito", items: ["Reunião inicial", "Moodboard"] }],
    totalAmount: 0,
    // O documento base traz um total de Decoração: aqui não há nenhum que se
    // consiga somar, que é o caso desta folha.
    totalText: "",
    // O modo tem de acompanhar o texto: «+ IVA» é «acresce». O documento base
    // é «incluído», e herdá-lo aqui punha o quadro a discordar da frase.
    totalVatMode: "acrescer",
    totalEstimatedText: "12.500,00 € + IVA",
    totalLabel: "Valor Total",
  } as unknown as Partial<ProposalDoc>;

  it("desenha o quadro estimado, com o preço que ela escreveu", () => {
    desenhar(ORG);
    expect(screen.getByText("Coordenação do dia")).toBeTruthy();
    expect(screen.getByText("2.500,00 €")).toBeTruthy();
  });

  it("uma linha por orçamentar fica EM BRANCO — nunca «[Valor]», nunca um traço", () => {
    desenhar(ORG);
    const texto = document.body.textContent ?? "";
    expect(texto).toContain("Reuniões de preparação");
    expect(texto).not.toContain("[Valor]");
    // CONTROLO POSITIVO da ausência: a linha existe mesmo, e a que tem preço
    // continua a mostrá-lo. Sem esta metade, um quadro que não desenhasse nada
    // passava as duas afirmações de cima.
    const linha = screen.getByText("Reuniões de preparação").parentElement;
    expect(linha?.textContent).toBe("Reuniões de preparação");
  });

  it("o cronograma entra", () => {
    desenhar(ORG);
    expect(screen.getByRole("heading", { name: "Cronograma de Organização" })).toBeTruthy();
    expect(screen.getByText("Fase 1 · Conceito")).toBeTruthy();
    expect(screen.getByText("Reunião inicial")).toBeTruthy();
  });

  it("um total estimado que se consegue ler vira escada, como no papel", () => {
    // «12.500,00 € + IVA» é um número: `totaisDaProposta` lê-o, e o casal
    // recebe a conta feita em vez de ter de fazer 23% de cabeça. É o mesmo que
    // o gerador faz com o mesmo documento.
    desenhar(ORG);
    expect(screen.getByText("12.500,00 €")).toBeTruthy();
    expect(screen.getByText("15.375,00 €")).toBeTruthy();
    expect(screen.getByText("IVA (23%)")).toBeTruthy();
  });

  it("um total que NÃO é um número sai como ela o escreveu, com o «+ IVA» garantido", () => {
    desenhar({ ...ORG, totalEstimatedText: "A definir após a visita" });
    expect(screen.getByText(/A definir após a visita/)).toBeTruthy();
    // Sem escada: não há euros nenhuns para somar, e não se inventa uma de zeros.
    expect(screen.queryByText("IVA (23%)")).toBeNull();
  });

  it("um total vazio não imprime rótulo nenhum a apontar para nada", () => {
    desenhar({ ...ORG, totalEstimatedText: "" });
    expect(screen.queryByText("Valor Total")).toBeNull();
  });
});

describe("um documento a meio não desenha cabeçalhos vazios", () => {
  /**
   * As propostas antigas guardadas com pouco mais do que a referência. É o
   * mesmo defeito que o quadro de linhas desta página já tinha corrigido: um
   * cabeçalho «Orçamento Proposto» com ar por baixo, na página mais cara do
   * produto.
   */
  const MAGRO = {
    ref: "PO Decoração",
    clientNames: "Ana & Rui",
    serviceGroups: [],
    moodBoards: [],
    budgetItems: [],
    coverImages: [],
    totalAmount: 0,
    totalText: "",
    notasImportantes: [],
    incluido: [],
    naoIncluido: [],
    condicoesGerais: [],
    observacoesGerais: [],
    faseamento: [],
    cancelamento: [],
  } as unknown as ProposalDoc;

  it("sem orçamento nenhum, a secção não existe", () => {
    render(<Documento doc={MAGRO} idioma="pt" fotos={[]} token="tk" />);
    expect(screen.queryByRole("heading", { name: "Orçamento Proposto" })).toBeNull();
    // CONTROLO POSITIVO: com uma rubrica, a mesma secção aparece. Sem isto, um
    // renderizador que nunca desenhasse orçamento nenhum passava por correcto.
    cleanup();
    render(
      <Documento
        doc={{ ...MAGRO, budgetItems: ["Decor Cerimónia"] } as ProposalDoc}
        idioma="pt"
        fotos={[]}
        token="tk"
      />,
    );
    expect(screen.getByRole("heading", { name: "Orçamento Proposto" })).toBeTruthy();
  });

  it("e o casal continua a ler a apresentação, sem a página partir", () => {
    render(<Documento doc={MAGRO} idioma="pt" fotos={[]} token="tk" />);
    expect(screen.getByText("Ana & Rui")).toBeTruthy();
  });
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DINHEIRO QUE ELA ESCREVEU À MÃO SEGUE A MESMA LÍNGUA DO RESTO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cabeçalho do `Documento.tsx` já dizia que «metade dos montantes é TEXTO
 * LIVRE escrito por ela à portuguesa» e que a conversão os trata da mesma
 * maneira. Dizia — e não tratava. MEDIDO, mesma linha, mesmo documento:
 *
 *          PDF                 esta página
 *   pt   + 1.550,00 €          1550,00 €
 *   en   + €1,550.00           1550,00 € + IVA
 *
 * Na folha inglesa a coluna ficava «€10,950.00 · 1550,00 € + IVA ·
 * €12,500.00», e «1550,00» lido à inglesa é um euro e cinquenta e cinco —
 * factor mil, na linha que ela acrescentou para cobrar a deslocação.
 */
describe("o dinheiro escrito à mão", () => {
  const COM_EXTRAS = {
    budgetExtras: [{ label: "Deslocação equipa", valueText: "1550,00 €" }],
    budgetRows: [{ item: "Arco floral", price: "2400,00 €" }],
    totalText: "15375,00 €",
  } as unknown as Partial<ProposalDoc>;

  it("agrupa os milhares como o PDF, em português", () => {
    desenhar(COM_EXTRAS);
    expect(screen.getByText("1.550,00 €")).toBeTruthy();
    expect(screen.getByText("2.400,00 €")).toBeTruthy();
    // Controlo positivo: a forma antiga, sem separador, deixou de aparecer.
    expect(screen.queryByText("1550,00 €")).toBeNull();
  });

  it("na folha inglesa passa a inglês, como tudo o resto", () => {
    desenhar(COM_EXTRAS, "en");
    expect(screen.getByText("€1,550.00")).toBeTruthy();
    expect(screen.getByText("€2,400.00")).toBeTruthy();
    // O que estava lá antes — português no meio de números ingleses.
    expect(screen.queryByText("1550,00 €")).toBeNull();
  });

  it("um texto que já vem agrupado passa incólume", () => {
    // Um número que não existe em mais lado nenhum do documento base: um teste
    // que rebenta por excesso de acertos não prova nada sobre o que se quer.
    desenhar({
      totalText: "",
      budgetExtras: [{ label: "Extra", valueText: "9.876,00 €" }],
    } as unknown as Partial<ProposalDoc>);
    expect(screen.getByText("9.876,00 €")).toBeTruthy();
  });

  it("uma linha sem preço continua sem preço — não vira «0,00 €»", () => {
    desenhar({
      totalText: "",
      budgetRows: [{ item: "A combinar", price: "" }],
    } as unknown as Partial<ProposalDoc>);
    expect(screen.getByText("A combinar")).toBeTruthy();
    expect(screen.queryByText("0,00 €")).toBeNull();
  });
});
