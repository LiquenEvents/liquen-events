// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import Documento from "./Documento";
import { textosDaProposta } from "@/lib/proposal-doc-textos";
import { totaisDaProposta } from "@/lib/proposal-budget";
import {
  DEFAULT_CANCELAMENTO,
  DEFAULT_FASEAMENTO,
  DEFAULT_CONDICOES_GERAIS,
  DEFAULT_OBSERVACOES_GERAIS,
  preencherMarcadores,
  type ProposalDoc,
} from "@/lib/proposal-doc";
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
    // Numeradas, e a Inspiração NÃO — é a numeração do PDF, espelhada, para
    // que «na parte 3» queira dizer o mesmo nas duas formas.
    expect(titulos).toEqual([
      "1. Apresentação",
      "2. Serviços",
      "Inspiração",
      "3. Orçamento Proposto",
      "4. Condições Gerais",
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
    expect(titulos).toContain("2. Services");
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
    // A primeira que NÃO é o borrão: o `lqip` desenha-se por baixo, e é uma
    // imagem também. Ver «A CAPA NÃO NASCE EM BRANCO».
    const img = [...document.querySelectorAll("img")].find((i) => !i.hasAttribute("aria-hidden"));
    if (!img) throw new Error("a capa não se desenhou");
    return img;
  };

  it("a capa oferece a derivada intermédia, e não só a miniatura", () => {
    desenhar();
    const srcset = capa().getAttribute("srcset") ?? "";
    expect(srcset).toContain("mini/capa 400w");
    expect(srcset).toContain("/api/proposta/tk/foto/c0 1200w");
  });

  /**
   * ── E VEM DIRECTA DO STORAGE QUANDO JÁ EXISTE ─────────────────────────────
   *
   * Palavras dela: «esta foto demora imenso tempo a carregar, e eu quero que
   * seja super rápida e fluida a aparecer».
   *
   * A derivada de 1200 px era servida SEMPRE pela nossa rota — que abre o
   * token, descarrega os bytes para dentro da função e só então os reencaminha.
   * Os mesmos bytes a atravessar-nos a caminho de um sítio onde já estavam.
   */
  it("com a derivada assinada, a capa não passa pela nossa rota", () => {
    render(
      <Documento
        doc={DOC}
        idioma="pt"
        fotos={[{ id: "c0", miniatura: "mini/capa", media: "https://cdn/media-capa" }]}
        token="tk"
      />,
    );
    const srcset = capa().getAttribute("srcset") ?? "";
    expect(srcset).toContain("https://cdn/media-capa 1200w");
    expect(srcset).not.toContain("/api/proposta/");
  });

  /**
   * A CAPA NÃO NASCE EM BRANCO.
   *
   * O `lqip` são poucas centenas de bytes que vêm no HTML: está pintado no
   * primeiro fotograma, antes de qualquer ida à rede.
   */
  it("com placeholder, há um borrão por baixo desde o primeiro fotograma", () => {
    render(
      <Documento
        doc={DOC}
        idioma="pt"
        fotos={[{ id: "c0", miniatura: "mini/capa", lqip: "data:image/jpeg;base64,AAAA" }]}
        token="tk"
      />,
    );
    const borrao = document.querySelector('img[aria-hidden="true"]');
    expect(borrao?.getAttribute("src")).toBe("data:image/jpeg;base64,AAAA");
    // E é decorativo: quem ouve a página não pode encontrar a mesma fotografia
    // duas vezes.
    expect(borrao?.getAttribute("alt")).toBe("");
  });

  it("a forma reserva-se na caixa, e não na imagem", () => {
    // Sem isto, o texto por baixo salta quando a fotografia chega — e um salto
    // lê-se como lentidão mesmo quando não é.
    desenhar();
    const caixa = capa().parentElement;
    expect(caixa?.getAttribute("style")).toContain("aspect-ratio");
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
    expect(screen.getByRole("heading", { name: /Cronograma de Organização/ })).toBeTruthy();
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
    expect(screen.queryByRole("heading", { name: /Orçamento Proposto/ })).toBeNull();
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
    expect(screen.getByRole("heading", { name: /Orçamento Proposto/ })).toBeTruthy();
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
    // O que ela escreveu vai ao lado do nome, agrupado — ver a secção
    // «a coluna dos adicionais soma» abaixo para saber porque é que é ao lado
    // do nome e não na coluna do dinheiro.
    expect(screen.getByText(/Deslocação equipa \(1\.550,00 €\)/)).toBeTruthy();
    expect(screen.getByText("2.400,00 €")).toBeTruthy();
    // Controlo positivo: a forma antiga, sem separador, deixou de aparecer.
    expect(screen.queryByText(/1550,00 €/)).toBeNull();
  });

  it("na folha inglesa passa a inglês, como tudo o resto", () => {
    desenhar(COM_EXTRAS, "en");
    expect(screen.getByText(/Deslocação equipa \(€1,550\.00\)/)).toBeTruthy();
    expect(screen.getByText("€2,400.00")).toBeTruthy();
    // O que estava lá antes — português no meio de números ingleses.
    expect(screen.queryByText(/1550,00 €/)).toBeNull();
  });

  it("um texto que já vem agrupado passa incólume", () => {
    // Um número que não existe em mais lado nenhum do documento base: um teste
    // que rebenta por excesso de acertos não prova nada sobre o que se quer.
    desenhar({
      totalText: "",
      budgetExtras: [{ label: "Extra", valueText: "9.876,00 €" }],
    } as unknown as Partial<ProposalDoc>);
    expect(screen.getByText(/9\.876,00 €/)).toBeTruthy();
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS CONDIÇÕES DOBRADAS: FECHADAS, MAS NÃO ESCONDIDAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * As condições, as observações, o faseamento e o cancelamento somam mais de
 * duas dezenas de cláusulas. Abertas, empurram para baixo tudo aquilo por que
 * a proposta se vende.
 *
 * A afirmação que aqui se prende não é «estão fechadas» — é que **fechada não
 * é escondida**: o título continua a ser um título, o texto continua no HTML
 * (a procura da página encontra-o), e por baixo do título há uma linha que diz
 * o que lá está dentro. Sem essa linha, dobrar é o mesmo que omitir.
 */
describe("as secções de condições", () => {
  /**
   * O texto DA CASA, preenchido como o documento o guarda.
   *
   * Tinha de ser este e não um de fantasia: o resumo por baixo do título só se
   * mostra enquanto o bloco for, palavra por palavra, o da casa — é essa a
   * regra que impede a página de resumir um texto que já lá não está.
   */
  const COM_TUDO = {
    condicoesGerais: DEFAULT_CONDICOES_GERAIS.map((l) =>
      preencherMarcadores(l, DOC as unknown as ProposalDoc),
    ),
    observacoesGerais: [...DEFAULT_OBSERVACOES_GERAIS],
    faseamento: [...DEFAULT_CANCELAMENTO.slice(0, 1)],
    cancelamento: [...DEFAULT_CANCELAMENTO],
  };

  const dobra = (nome: RegExp) =>
    screen.getByRole("heading", { name: nome }).closest("details") as HTMLDetailsElement;

  it("saem fechadas — é essa a razão de existirem", () => {
    desenhar(COM_TUDO);
    for (const nome of [/Condições Gerais/i, /Observações/i, /Faseamento/i, /Cancelamento/i]) {
      expect(dobra(nome).open).toBe(false);
    }
  });

  it("o título continua a ser um título, e não um parágrafo dentro de um botão", () => {
    // O índice da página e o leitor de ecrã leem-se pelos cabeçalhos. Trocar o
    // `h2` por um `span` dobrava a secção e apagava-a da estrutura.
    desenhar(COM_TUDO);
    const t = screen.getByRole("heading", { name: /Condições Gerais/i });
    expect(t.tagName).toBe("H2");
  });

  it("o texto continua no HTML mesmo fechado — a procura da página encontra-o", () => {
    desenhar(COM_TUDO);
    expect(screen.getByText(/Aos valores acresce o IVA/i)).toBeInTheDocument();
  });

  it("diz numa linha o que está lá dentro", () => {
    // Sem isto, «Condições Gerais» tanto pode ser uma cláusula como catorze, e
    // quem não sabe o que está a abrir não abre.
    desenhar(COM_TUDO);
    expect(screen.getByText(/confirmação do número de convidados/i)).toBeInTheDocument();
    expect(screen.getByText(/O que acontece se o evento for cancelado/i)).toBeInTheDocument();
    expect(screen.getByText(/uso do material/i)).toBeInTheDocument();
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   *
   * Os resumos foram escritos a olhar para o texto DA CASA. Sobre um texto que
   * ela reescreveu, o mesmo resumo passa a ser uma frase falsa dita por cima
   * de uma secção fechada — que é o pior sítio para a dizer, porque ninguém a
   * vai lá dentro desmentir.
   */
  it("com o texto reescrito por ela, conta os pontos em vez de os resumir", () => {
    desenhar({
      ...COM_TUDO,
      cancelamento: ["Uma cláusula dela.", "E outra.", "E outra ainda."],
    });
    expect(screen.getByText("3 pontos")).toBeInTheDocument();
    expect(screen.queryByText(/O que acontece se o evento for cancelado/i)).toBeNull();
  });

  it("um só ponto não se lê «1 pontos»", () => {
    desenhar({ ...COM_TUDO, cancelamento: ["Uma cláusula dela."] });
    expect(screen.getAllByText("1 ponto").length).toBeGreaterThan(0);
  });

  it("em inglês, o resumo é inglês", () => {
    desenhar(COM_TUDO, "en");
    expect(screen.getByText(/confirming the final guest count/i)).toBeInTheDocument();
  });

  it("uma secção vazia não deixa uma dobra vazia para trás", () => {
    desenhar({ ...COM_TUDO, cancelamento: [] });
    expect(screen.queryByRole("heading", { name: /Cancelamento/i })).toBeNull();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PÁGINA MUDOU DE VOZ; O PDF FICA COMO ESTÁ
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Decisão dela, dita com todas as letras: as mudanças de linguagem são para a
 * página web, e no PDF fica tudo igual.
 *
 * O que isto prende é o mecanismo que o permite. O PDF e a página bebem do
 * MESMO dicionário — mudar lá uma palavra mudava-a nos dois de uma vez. Por
 * isso a página tem os seus sobretítulos num dicionário só dela, e o teste que
 * interessa é o segundo: **o dicionário do documento continua a dizer o que
 * dizia**. Sem ele, alguém «arruma» os dois num sítio só daqui a um mês e a
 * mudança escorrega para o papel sem ninguém dar por isso.
 */
const COM_CONDICOES = {
  condicoesGerais: ["Aos valores acresce o IVA à taxa legal em vigor como descrito."],
};

describe("a voz da página não escorrega para o documento", () => {
  it("o orçamento deixou de ser «O investimento» — na página", () => {
    desenhar();
    expect(screen.getByText("O que custa")).toBeInTheDocument();
    expect(screen.queryByText(/O investimento/i)).toBeNull();
  });

  it("as condições são «para vossa tranquilidade» — na página", () => {
    desenhar(COM_CONDICOES);
    expect(screen.getByText(/Para vossa tranquilidade/i)).toBeInTheDocument();
  });

  it("em inglês, a página também", () => {
    desenhar({}, "en");
    expect(screen.getByText("What it costs")).toBeInTheDocument();
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("e o dicionário DO DOCUMENTO continua intocado — é ele que o PDF lê", () => {
    expect(textosDaProposta("pt").sobretituloOrcamento).toBe("O investimento");
    expect(textosDaProposta("pt").sobretituloCondicoes).toBe("Para sua tranquilidade");
    expect(textosDaProposta("en").sobretituloOrcamento).toBe("The investment");
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O ORÇAMENTO: O NÚMERO QUE MAIS IMPORTA, E A PERGUNTA QUE VEM A SEGUIR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «Total a pagar» estava na mesma escada dos subtotais. E a pergunta que um
 * casal faz a seguir a ver um total é sempre a mesma — quanto pagamos agora —
 * com a resposta três secções abaixo.
 *
 * A afirmação que mais vale aqui é a última: a linha curta do faseamento SÓ
 * aparece enquanto o faseamento for o da casa. Se ela o reescreveu, as
 * percentagens desta linha podiam já não ser as de lá, e duas percentagens
 * diferentes na mesma proposta são a única coisa pior do que a pergunta sem
 * resposta.
 */
describe("o orçamento", () => {
  const COM_TOTAL = {
    budgetItems: ["Decor Cerimónia"],
    totalAmount: 10000,
    totalVatMode: "acrescer" as const,
    vatRate: 0.23,
    faseamento: [...DEFAULT_FASEAMENTO],
  };

  /** O rótulo pequeno por cima do número, e não a frase do faseamento. */
  const rotuloDoTotal = () =>
    screen.getAllByText(/Total a pagar/i).find((e) => e.className.includes("uppercase"))!;

  it("diz o que se paga agora, ao lado do total", () => {
    desenhar(COM_TOTAL);
    // Dois pontos e não ponto e vírgula: a linha curta escreve
    // «30% na adjudicação: 3.075,00 €»; a cláusula lá em baixo escreve
    // «30% na adjudicação;». É a pontuação que as distingue.
    expect(screen.getByText(/30% na adjudicação:/i)).toBeInTheDocument();
    expect(screen.getByText(/restantes 70% um mês antes/i)).toBeInTheDocument();
  });

  it("o total é o maior número do bloco", () => {
    // A hierarquia é a mensagem: quem percorre a coluna com o polegar tem de
    // distinguir o que paga do que somou para lá chegar.
    desenhar(COM_TOTAL);
    /*
     * A medida exacta não se pode afirmar aqui: o jsdom não conhece `clamp()`
     * e deita a declaração fora inteira, o que faria um teste sobre os «52px»
     * passar por não ver nada — que é a pior espécie de teste verde.
     *
     * O que se afirma é a HIERARQUIA, que é a decisão: o total saiu da escada
     * dos subtotais. Está noutra tipografia (a serifada do documento) e não
     * partilha a classe de tamanho com que os subtotais são desenhados.
     */
    const numero = rotuloDoTotal().parentElement?.querySelectorAll("p")[1] as HTMLElement;
    expect(numero.getAttribute("style")).toContain("--font-playfair");
    expect(numero.className).not.toContain("text-sm");

    // O controlo positivo: um subtotal É `text-sm` e não tem tipografia própria.
    const subtotal = screen.getByText(/TOTAL \(sem IVA\)/i).parentElement
      ?.lastElementChild as HTMLElement;
    expect(subtotal.className).toContain("text-sm");
    expect(subtotal.getAttribute("style")).toBeNull();
  });

  it("liga o incluído ao que o casal acabou de ver", () => {
    desenhar({ ...COM_TOTAL, incluido: ["Serviço de decoração conforme descrito;"] });
    const linha = screen.getByText(/Tudo o que viram atrás/i).parentElement as HTMLElement;
    // Os nomes saem do documento, não de uma lista escrita à mão.
    expect(linha.textContent).toContain("Decoração Cerimónia");
  });

  it("não repete o mesmo momento duas vezes", () => {
    // Um board «Cerimónia» ao lado de um grupo «Cerimónia» é a mesma palavra
    // duas vezes numa linha de quatro.
    desenhar({
      ...COM_TOTAL,
      incluido: ["Serviço de decoração;"],
      serviceGroups: [{ letter: "A", title: "Cerimónia", items: [] }],
      moodBoards: [{ title: "Cerimónia", images: ["ped/0.jpg"] }],
    } as unknown as Partial<ProposalDoc>);
    const linha = screen.getByText(/Tudo o que viram atrás/i).parentElement as HTMLElement;
    expect(linha.textContent?.match(/Cerimónia/g)).toHaveLength(1);
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("com o faseamento reescrito por ela, a linha curta CALA-SE", () => {
    desenhar({ ...COM_TOTAL, faseamento: ["50% na assinatura;", "50% na véspera;"] });
    expect(screen.queryByText(/30% na adjudicação/i)).toBeNull();
    // E o faseamento dela continua lá, por extenso, na secção dele.
    expect(screen.getByText(/50% na assinatura/i)).toBeInTheDocument();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A ÚLTIMA COISA QUE SE VÊ NÃO PODE SER O CANCELAMENTO
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A proposta acabava na cláusula do Centro de Arbitragem de Conflitos de
 * Consumo de Lisboa. É a frase certa e é o sítio errado para uma proposta de
 * casamento acabar.
 *
 * A afirmação que vale por todas é a última: com uma capa só, NÃO há fecho.
 * Repetir a fotografia de abertura no fim não é um fecho — é a mesma proposta
 * a dizer duas vezes a mesma coisa, e nota-se.
 */
describe("o fecho", () => {
  const DUAS_CAPAS: FotoDaProposta[] = [
    { id: "c0", miniatura: "mini/capa0", original: "orig/capa0", largura: 1600, altura: 1067 },
    { id: "c1", miniatura: "mini/capa1", original: "orig/capa1", largura: 1600, altura: 1067 },
  ];

  const comCapas = (fotos: FotoDaProposta[], coverImages: string[]) =>
    render(
      <Documento
        doc={{ ...DOC, coverImages } as ProposalDoc}
        idioma="pt"
        fotos={fotos}
        token="tk"
      />,
    );

  it("fecha com a segunda capa, que a página ainda não tinha usado", () => {
    comCapas(DUAS_CAPAS, ["ped/capa0.jpg", "ped/capa1.jpg"]);
    const imagens = Array.from(document.querySelectorAll("img"));
    expect(imagens[0].getAttribute("src")).toBe("mini/capa0");
    expect(imagens[imagens.length - 1].getAttribute("src")).toBe("mini/capa1");
  });

  it("a fotografia do fecho entra preguiçosa", () => {
    // Está no fim de uma página com quarenta e seis fotografias; quem lá chega
    // já esperou o que tinha a esperar.
    comCapas(DUAS_CAPAS, ["ped/capa0.jpg", "ped/capa1.jpg"]);
    const imagens = Array.from(document.querySelectorAll("img"));
    expect(imagens[imagens.length - 1].getAttribute("loading")).toBe("lazy");
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("com uma capa só, não se repete a de abertura no fim", () => {
    comCapas([DUAS_CAPAS[0]], ["ped/capa0.jpg"]);
    const capas = Array.from(document.querySelectorAll("img")).filter(
      (i) => i.getAttribute("src") === "mini/capa0",
    );
    expect(capas).toHaveLength(1);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A NUMERAÇÃO TEM DE SER A MESMA DO PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * «Numeração de secções, para o casal poder dizer ao telefone na parte 3.»
 *
 * O casal ao telefone tem uma das duas formas à frente e ela tem a outra. Uma
 * página que numerasse à sua maneira transformava a numeração no oposto do que
 * ela serve para: duas pessoas a falar de partes diferentes com o mesmo número.
 */
describe("a numeração das secções", () => {
  it("o índice leva os MESMOS números dos títulos", () => {
    // Duas numerações na mesma página — uma no índice, outra nos títulos — era
    // o defeito que a numeração vem resolver.
    desenhar();
    const indice = screen.getByRole("navigation");
    expect(within(indice).getByText("2. Serviços")).toBeTruthy();
    expect(within(indice).getByText("3. Orçamento Proposto")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "2. Serviços" })).toBeTruthy();
  });

  it("a Inspiração não leva número, porque o PDF também não lhe dá", () => {
    desenhar();
    const indice = screen.getByRole("navigation");
    expect(within(indice).getByText("Inspiração")).toBeTruthy();
  });

  /**
   * ── A AFIRMAÇÃO QUE VALE POR TODAS ────────────────────────────────────
   */
  it("uma secção que não existe não gasta um número", () => {
    // Sem serviços, o Orçamento é a 2 — e no PDF também, porque a folha dos
    // serviços também lá não é desenhada. Um número saltado seria «a parte 3»
    // a não existir em lado nenhum.
    desenhar({ serviceGroups: [] });
    expect(screen.getByRole("heading", { name: "2. Orçamento Proposto" })).toBeTruthy();
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * A PÁGINA NÃO FAZ CONTAS — LÊ AS QUE JÁ ESTÃO FEITAS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Da caça a bugs: A3-003 e A3-004. Esta página era a ÚNICA das quatro
 * superfícies (PDF, estúdio, portal, página) que ainda recalculava dinheiro por
 * sua conta — e divergia das outras três de duas maneiras diferentes.
 *
 * O comentário da escada, no componente, promete que «aqui não se faz uma única
 * conta». Estes dois testes são o que torna a promessa verificável.
 */
describe("a página do casal e a folha dizem o mesmo número", () => {
  /**
   * A3-003 — O SINAL, ARREDONDADO PARA O MESMO LADO.
   *
   * A pagar 12.000,15 € a 30%: o `totais.sinal` empurra o meio-cêntimo para
   * cima e dá 3.600,05 €, que é o número do PDF e o número sobre que a factura
   * é emitida. A conta que aqui se fazia (`aPagar * pct / 100`) entregava
   * 3.600,045 ao `Intl`, que arredonda para baixo: 3.600,04 €.
   *
   * Acontecia em 2,5% de todos os totais entre mil e cinco mil euros, e SÓ à
   * percentagem da casa — a 40% e a 50% nunca acontece. Um cêntimo é pouco;
   * duas folhas do mesmo documento a discordar não é.
   */
  it("o sinal é o do PDF, ao cêntimo — não um recalculado à parte", () => {
    desenhar({
      totalAmount: 12000.15,
      totalVatMode: "incluido",
      vatRate: 0,
      depositPercent: 30,
      faseamento: DEFAULT_FASEAMENTO,
    } as unknown as Partial<ProposalDoc>);
    const totais = totaisDaProposta(
      { ...DOC, totalAmount: 12000.15, totalVatMode: "incluido", vatRate: 0 } as ProposalDoc,
      30,
    );
    expect(totais.aPagar).toBe(12000.15);
    expect(totais.sinal).toBe(3600.05);
    expect(screen.getByText(/3\.600,05 €/)).toBeTruthy();
    // Controlo positivo: o número da conta antiga deixou de estar na página.
    expect(screen.queryByText(/3\.600,04 €/)).toBeNull();
  });

  /**
   * A3-004 — A COLUNA SOMA COM O SUBTOTAL QUE TEM POR CIMA.
   *
   * O caso da proposta real: bruto 3.025,80 lido COM IVA e uma deslocação de
   * «75,00 €» calada. Imprimir 75,00 ao lado de um subtotal de 2.399,02 € dava
   * 2.474,02 contra os 2.460,00 escritos à frente — catorze euros que a folha
   * não explica, na página onde o casal decide dizer que sim.
   */
  it("a coluna dos adicionais fecha o total, e o texto dela vai ao lado do nome", () => {
    desenhar({
      totalAmount: 3025.8,
      totalVatMode: "incluido",
      vatRate: 0.23,
      budgetExtrasSomam: true,
      budgetExtras: [{ label: "Deslocação da Equipa Líquen", valueText: "75,00 €" }],
    } as unknown as Partial<ProposalDoc>);
    // O que a coluna imprime é a BASE, com o «+» à frente.
    expect(screen.getByText("+ 60,98 €")).toBeTruthy();
    // O que ela escreveu não se perde: fica ao lado do nome.
    expect(screen.getByText(/Deslocação da Equipa Líquen \(75,00 €\)/)).toBeTruthy();
    // Controlo positivo: a parcela que não somava com as outras saiu da coluna.
    expect(screen.queryByText("75,00 €")).toBeNull();
  });

  it("um valor que não se consegue ler fica com o texto dela, nunca com um número inventado", () => {
    desenhar({
      totalAmount: 10000,
      totalVatMode: "acrescer",
      budgetExtrasSomam: true,
      budgetExtras: [{ label: "Transporte", valueText: "de 800 a 1.200 €" }],
    } as unknown as Partial<ProposalDoc>);
    // Fica o que ela escreveu: um intervalo lê-se como intervalo, e ninguém o
    // confunde com uma parcela que soma.
    expect(screen.getByText(/de 800 a 1\.200 €/)).toBeTruthy();
    // Controlo positivo: os oito milhões que a leitura antiga inventava.
    expect(screen.queryByText(/8\.001\.200/)).toBeNull();
  });
});
