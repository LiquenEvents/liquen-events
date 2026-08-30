import { describe, it, expect, afterEach, vi } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults } from "./proposal-doc";

/**
 * Cada teste deste ficheiro DESENHA um documento inteiro — fontes embutidas,
 * oito a dez páginas —, e alguns desenham três. Com a rede toda a correr em
 * paralelo isso passa dos 5 segundos por omissão do vitest e o teste falha por
 * relógio, não por composição: um falso vermelho que só aparece na máquina
 * carregada e nunca quando se corre o ficheiro sozinho. Trinta segundos é folga
 * que chega para a máquina mais lenta e continua a apanhar uma composição que
 * entre em ciclo.
 */
vi.setConfig({ testTimeout: 30_000 });

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ONDE A PÁGINA PARTE — E ONDE NÃO PODE PARTIR
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Ela abriu uma proposta com três serviços e encontrou isto: «fica uma parte
 * dos serviços numa página e depois outra frase, noutra que só tinha aquela
 * frase». E, noutra: um título de secção sozinho no fundo de uma página, sem
 * nada por baixo.
 *
 * A causa não era uma: eram três, todas da mesma família — o desenho decidia
 * mudar de página com uma medida MENOR do que aquilo que ia desenhar a seguir.
 *
 *   · o cabeçalho «Serviços» era desenhado sem verificação nenhuma;
 *   · o título do grupo reservava 30 pt, que dá para o título e uma linha;
 *   · a descrição partia LINHA A LINHA, portanto podia deixar uma para trás.
 *
 * E, no cronograma, uma variante pior: não havia verificação nenhuma dentro do
 * ciclo dos itens, e as tarefas continuavam a ser desenhadas para BAIXO do
 * rodapé — fora da página, invisíveis no PDF entregue, sem ninguém dar por isso.
 *
 * ── COMO É QUE ISTO SE MEDE ──────────────────────────────────────────────
 *
 * Não se lêem os bytes do PDF: as fontes vão embutidas em subconjunto e os
 * códigos dos glifos deixam de ser legíveis. Grava-se antes o que o desenho
 * PEDE — cada `drawText` com a sua página e o seu `y` — que é exactamente a
 * informação que decide se uma frase fica sozinha ou não.
 */

/** A geometria da página, igual à do desenho (proposal-doc-pdf.ts). */
const M = 68;
const W = 841.89;
const H = 595.28;
/** O corpo vive entre o chão da mancha e o topo depois do cabeçalho. */
const CHAO = M + 6;
const TECTO = H - M - 64;

interface Escrita {
  pagina: number;
  /** Onde começa. Sem ele não se sabe em que COLUNA da folha o texto caiu — e
   *  era numa coluna estreita à direita que as notas do orçamento estavam. */
  x: number;
  y: number;
  texto: string;
}

/**
 * Grava todos os `drawText` do desenho, com a página onde caíram.
 *
 * O `addPage` é envolvido para saber a ORDEM das páginas — `drawText` sabe em
 * que objecto está, não em que número de página.
 */
function instrumentar() {
  const paginas: PDFPage[] = [];
  const escritas: Escrita[] = [];
  const addPageOriginal = PDFDocument.prototype.addPage;
  const drawTextOriginal = PDFPage.prototype.drawText;

  PDFDocument.prototype.addPage = function (...args: Parameters<typeof addPageOriginal>) {
    const p = addPageOriginal.apply(this, args) as PDFPage;
    paginas.push(p);
    return p;
  };
  PDFPage.prototype.drawText = function (
    texto: string,
    opts?: Parameters<typeof drawTextOriginal>[1],
  ) {
    escritas.push({
      pagina: paginas.indexOf(this),
      x: opts?.x ?? 0,
      y: opts?.y ?? 0,
      texto: String(texto),
    });
    return drawTextOriginal.call(this, texto, opts);
  };

  return {
    escritas,
    restaurar() {
      PDFDocument.prototype.addPage = addPageOriginal;
      PDFPage.prototype.drawText = drawTextOriginal;
    },
  };
}

/** Só o CORPO: fora o cabeçalho (topo) e o rodapé (fundo), que são desenhados
 *  em toda a página e não contam para saber se uma frase ficou sozinha. */
const corpo = (e: Escrita[]) => e.filter((x) => x.y >= CHAO - 40 && x.y <= TECTO + 20);

/** As páginas do corpo, por ordem, cada uma com o que lhe foi desenhado. */
function porPagina(escritas: Escrita[]): Escrita[][] {
  const max = Math.max(...escritas.map((e) => e.pagina));
  return Array.from({ length: max + 1 }, (_, i) => corpo(escritas).filter((e) => e.pagina === i));
}

/**
 * Os cabeçalhos de secção passaram a ser NUMERADOS («1. Apresentação»,
 * «2. Serviços», …), como na folha que ela envia há anos.
 *
 * Estes testes procuram-nos pelo NOME e não pelo número: o número depende das
 * secções que o modelo tem — a proposta de Organização traz um cronograma pelo
 * meio — e não é isso que aqui se está a medir. O número em si, esse, tem o seu
 * próprio teste («as secções são numeradas…»), que é onde ele deve partir se
 * alguém lhe mexer.
 */
const CABECALHO = (titulo: string) => new RegExp(`^\\d+\\.\\s+${titulo}$`);
const ehCabecalho = (e: Escrita, titulo: string) => CABECALHO(titulo).test(e.texto);

/**
 * Três serviços com descrições reais, do comprimento das que ela escreve.
 *
 * O `clientNames` longo era o gatilho original: empurrava o parágrafo de
 * boas-vindas de três para quatro linhas, e era isso que fazia o cabeçalho
 * «Serviços» cair no fundo da página — o caso que ela fotografou. O parágrafo
 * saiu (a folha dela não o tem), mas o nome comprido fica: agora é a linha
 * «Noivos:» da lista da apresentação que ele estica, e a garantia a medir é a
 * mesma.
 */
function propostaDeTresServicos(nomes = "Maria Margarida & José Francisco") {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento",
    clientNames: nomes,
    eventType: "Casamento",
    eventDate: "12 de setembro de 2026",
    location: "Herdade da Cortesia, Reguengos de Monsaraz",
    guests: "120 pax",
    ceremony: "Civil e religiosa",
    time: "16h00",
    // Sem fotografias: o que se mede aqui é onde o TEXTO parte.
    moodBoards: [],
    coverImages: [],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração Floral da Cerimónia",
        items: [
          {
            label: "Arco cerimonial",
            desc: "Estrutura em madeira vestida com folhagem de eucalipto, rosas em tom champanhe e verde, montada no local da cerimónia e desmontada no final do evento pela equipa Líquen.",
          },
          {
            label: "Passadeira e corredor",
            desc: "Apontamentos florais laterais ao longo do corredor central, com pétalas naturais e recipientes em vidro fosco alugados para o dia.",
          },
        ],
      },
      {
        letter: "b)",
        title: "Decoração do Copo de Água",
        items: [
          {
            label: "Mesas de apoio",
            desc: "Composições baixas em tons neutros sobre as mesas altas de cocktail, com velas em suportes de vidro e têxteis em linho natural fornecidos pela Líquen.",
          },
          {
            label: "Bar",
            desc: "Apontamento floral no balcão do bar, pensado para ser visto de todos os ângulos e para não interferir com o serviço.",
          },
        ],
      },
      {
        letter: "c)",
        title: "Decoração do Jantar",
        items: [
          {
            label: "Mesas do jantar",
            desc: "Design floral das mesas de convidados com composições baixas alternadas com velas de diferentes alturas, marcadores de lugar em papel de algodão e caminhos de mesa em linho.",
          },
          {
            label: "Seating plan",
            desc: "Painel de plano de mesas em estrutura própria, com decoração floral na base e lettering à mão, montado à entrada do espaço de jantar.",
          },
        ],
      },
    ],
    budgetItems: [
      "Decoração Cerimónia",
      "Decoração Copo de Água",
      "Design Floral e Decoração Mesas",
    ],
    totalLabel: "Valor Total Decoração",
    totalText: "6875,00 € + IVA",
  });
}

let sonda: ReturnType<typeof instrumentar> | null = null;
afterEach(() => {
  sonda?.restaurar();
  sonda = null;
});

async function desenhar(doc: Parameters<typeof renderProposalDocPdf>[0]) {
  sonda = instrumentar();
  await renderProposalDocPdf(doc);
  return sonda.escritas;
}

describe("os serviços não partem a meio de uma frase", () => {
  /**
   * A avaria original, na forma em que ela a viu: o cabeçalho «O QUE PROPOMOS /
   * Serviços» impresso no fundo de uma página e o primeiro serviço já na
   * seguinte. Um título sozinho não é conteúdo — é uma página desperdiçada com
   * ar de erro.
   */
  it("o cabeçalho «Serviços» nunca fica sozinho no fundo da página", async () => {
    // Vários comprimentos de nome: um nome que peça duas linhas na lista da
    // apresentação empurra tudo o que vem a seguir folha abaixo.
    for (const nomes of [
      "Ana & Zé",
      "Maria Margarida & José Francisco",
      "Maria Margarida Nogueira de Almeida & José Francisco Teixeira de Vasconcelos",
    ]) {
      const paginas = porPagina(await desenhar(propostaDeTresServicos(nomes)));
      for (const [i, pagina] of paginas.entries()) {
        const idx = pagina.findIndex((e) => ehCabecalho(e, "Serviços"));
        if (idx === -1) continue;
        // Depois do cabeçalho tem de vir conteúdo NA MESMA página: o título do
        // primeiro grupo e, pelo menos, o começo do primeiro serviço.
        const depois = pagina.slice(idx + 1);
        expect(
          depois.length,
          `página ${i + 1}: o cabeçalho «Serviços» ficou sem nada por baixo (nomes: ${nomes})`,
        ).toBeGreaterThanOrEqual(3);
      }
    }
  });

  /**
   * «Fica uma parte dos serviços numa página e depois outra frase, noutra que só
   * tinha aquela frase.» Uma página do corpo com um punhado de linhas soltas é
   * exactamente isso.
   */
  it("nenhuma página fica com uma frase solta e mais nada", async () => {
    const paginas = porPagina(await desenhar(propostaDeTresServicos()));
    for (const [i, pagina] of paginas.entries()) {
      if (pagina.length === 0) continue;
      expect(
        pagina.length,
        `página ${i + 1} do corpo tem só ${pagina.length} linha(s): ${pagina
          .map((e) => e.texto)
          .join(" | ")}`,
      ).toBeGreaterThan(1);
    }
  });

  /**
   * O título de um grupo («a) Decoração Floral da Cerimónia») pertence ao
   * primeiro serviço que o segue. Separá-los é a mesma avaria do cabeçalho, um
   * nível abaixo.
   */
  it("o título de um grupo viaja com o primeiro serviço", async () => {
    const paginas = porPagina(await desenhar(propostaDeTresServicos()));
    const titulos = [
      "Decoração Floral da Cerimónia",
      "Decoração do Copo de Água",
      "Decoração do Jantar",
    ];
    for (const [i, pagina] of paginas.entries()) {
      for (const t of titulos) {
        const idx = pagina.findIndex((e) => e.texto === t);
        if (idx === -1) continue;
        expect(
          pagina.slice(idx + 1).length,
          `página ${i + 1}: «${t}» ficou sem o primeiro serviço por baixo`,
        ).toBeGreaterThanOrEqual(2);
      }
    }
  });
});

describe("nada é desenhado fora da página", () => {
  /**
   * O cronograma não tinha verificação nenhuma dentro do ciclo dos itens: com
   * uma fase comprida, as tarefas continuavam a ser desenhadas para baixo, para
   * fora da folha. Não saíam cortadas nem davam erro — desapareciam, e a
   * contagem de truncagens (que existe precisamente para isto) não as via.
   */
  it("uma fase do cronograma com muitas tarefas não escreve por baixo do rodapé", async () => {
    const doc = withProposalDefaults({
      template: "organizacao",
      ref: "PO Organização",
      clientNames: "Cliente",
      eventType: "Casamento",
      eventDate: "12 de setembro de 2026",
      location: "Évora",
      guests: "120 pax",
      serviceGroups: [],
      moodBoards: [],
      coverImages: [],
      budgetItems: [],
      totalLabel: "Valor Total",
      totalText: "0,00 €",
      cronograma: [
        {
          title: "Fase 1 — Conceito e fornecedores",
          items: Array.from(
            { length: 40 },
            (_, i) =>
              `Tarefa ${i + 1} — reunião de acompanhamento, revisão de orçamento e articulação com os fornecedores envolvidos nesta fase do processo.`,
          ),
        },
      ],
    });
    const escritas = await desenhar(doc);
    const minimo = Math.min(...escritas.map((e) => e.y));
    // O elemento mais baixo de uma página é o rodapé, em `M - 26`.
    expect(minimo, "há texto desenhado para fora da página").toBeGreaterThanOrEqual(M - 27);
  });

  it("os serviços também não escrevem por baixo do rodapé", async () => {
    const escritas = await desenhar(propostaDeTresServicos());
    expect(Math.min(...escritas.map((e) => e.y))).toBeGreaterThanOrEqual(M - 27);
  });
});

/* ═══════════════════════════════════════════════════════════════════════════
   A FOLHA DO ORÇAMENTO É UMA COLUNA, COMO A PROPOSTA FEITA À MÃO
   ═══════════════════════════════════════════════════════════════════════════

   «Aparece assim e não está igual à proposta da Mariana e do João.» A folha que
   ela envia aos clientes há anos é uma coluna de cima para baixo — o quadro do
   orçamento e, POR BAIXO dele, «Notas Importantes» e «Condições de Reserva»,
   por esta ordem (página 7 da proposta de referência: as duas rubricas em x71,
   encostadas à margem, uma a y312 e a outra a y197).

   O gerador punha-as numa coluna de 216 pontos à direita do quadro, ancorada no
   topo da página e desenhada por uma função que desce o `y` sem conhecer o chão
   da folha. Medido, com as listas da casa mais seis notas: o «NÃO INCLUÍDO»
   desenhado POR CIMA do rodapé e o resto a sair pela folha fora, sem erro e sem
   aviso — a mesma avaria do cronograma, noutro sítio.

   Estes testes fixam as quatro coisas que a mudança tem de garantir: a ORDEM, a
   COLUNA (nada à direita da mancha), o CHÃO (nada por baixo do rodapé, nem
   sequer nas listas mais compridas) e A FOLHA ÚNICA — que o caso da casa caiba
   todo na página do orçamento, como na folha dela. */

/** Uma proposta de decoração com o texto fixo da casa e três linhas de quadro. */
function propostaDeOrcamento(over: Record<string, unknown> = {}) {
  return withProposalDefaults({
    template: "decoracao",
    ref: "PO Decoração Casamento",
    clientNames: "Amélia & Duarte",
    eventType: "Casamento",
    eventDate: "5 de junho de 2027",
    location: "Herdade da Cortesia",
    guests: "150 pax",
    serviceGroups: [],
    moodBoards: [],
    coverImages: [],
    budgetItems: ["Design Floral e Decor Jantar", "Decor Mesa Buffet", "Bouquet da Noiva"],
    totalLabel: "Valor Total Decoração",
    totalText: "7.890,00 € + IVA",
    totalAmount: 7890,
    totalVatMode: "acrescer" as const,
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** Onde é que este texto foi desenhado — na ordem em que o desenho o pediu. */
function onde(escritas: Escrita[], texto: string): Escrita | undefined {
  return escritas.find((e) => e.texto === texto);
}

/** O mesmo, para um cabeçalho de secção — que hoje vai numerado. */
function ondeCabecalho(escritas: Escrita[], titulo: string): Escrita | undefined {
  return escritas.find((e) => ehCabecalho(e, titulo));
}

/** `a` vem depois de `b` na folha: numa página seguinte, ou mais abaixo na
 *  mesma. É a ordem de leitura de uma coluna. */
function vemDepoisDe(a: Escrita, b: Escrita): boolean {
  return a.pagina > b.pagina || (a.pagina === b.pagina && a.y < b.y);
}

describe("a folha do orçamento é uma coluna", () => {
  it("as notas e as condições vêm por baixo do quadro, e por esta ordem", async () => {
    const escritas = corpo(await desenhar(propostaDeOrcamento()));

    const ultimaLinhaDoQuadro = onde(escritas, "Bouquet da Noiva");
    const notas = onde(escritas, "Notas importantes");
    const reserva = onde(escritas, "Condições de reserva");
    expect(ultimaLinhaDoQuadro, "não se encontrou a última linha do quadro").toBeDefined();
    expect(notas, "não se encontrou «Notas importantes»").toBeDefined();
    expect(reserva, "não se encontrou «Condições de reserva»").toBeDefined();

    expect(
      vemDepoisDe(notas!, ultimaLinhaDoQuadro!),
      "«Notas importantes» não está por baixo do quadro",
    ).toBe(true);
    expect(
      vemDepoisDe(reserva!, notas!),
      "«Condições de reserva» não está por baixo das notas",
    ).toBe(true);
  });

  /**
   * ── O CASO DA CASA CABE NUMA FOLHA SÓ ─────────────────────────────────────
   *
   * A folha dela mete o quadro, as «Notas Importantes» e as «Condições de
   * Reserva» na MESMA página — e é A4 ao baixo, 842 × 595, exactamente a nossa.
   * É essa a folha com que ela vai comparar.
   *
   * Chegou a partir-se em duas por doze pontos de ar a mais entre blocos, com
   * 220 pontos vazios por baixo do quadro numa página e uma cauda de 207 na
   * outra — duas folhas com menos de metade cheia. O conteúdo por omissão é o
   * dela (3 notas, 2 incluídos, 2 não incluídos): se voltar a partir-se, é aqui
   * que se sabe.
   */
  it("no caso da casa, a cauda passa INTEIRA — e o bloco de totais não se parte", async () => {
    /**
     * ── O QUE MUDOU, E PORQUÊ ────────────────────────────────────────────────
     *
     * Este teste exigia as três coisas na MESMA folha. Deixou de ser possível, e
     * a razão é uma decisão dela: o bloco do orçamento passou a mostrar sempre a
     * escada — TOTAL (sem IVA), IVA, Total a pagar — mesmo nas propostas sem
     * valores adicionais, que antes fechavam num número grande sozinho («quero
     * sempre que nas propostas apareça assim na parte do orçamento», com a
     * proposta da Mariana e do João à frente).
     *
     * São duas linhas a mais: 24 pontos, contra 1,3 pontos de folga que esta
     * folha tinha. Não há aqui nada a apertar que não seja apertar a conta — e
     * um orçamento em que as contas não se vêem é precisamente o defeito que
     * esta escada veio corrigir. Já se tinha aceitado o mesmo custo nas
     * propostas COM adicionais; agora as duas comportam-se igual, que é o ponto.
     *
     * O que continua a ser garantido — e é o que este teste passa a prender:
     *  · o bloco de totais NÃO se parte do quadro (o número grande nunca fica
     *    órfão numa folha sem as linhas que o explicam);
     *  · a cauda passa INTEIRA: as notas e as condições de reserva vão juntas,
     *    nunca uma em cada folha;
     *  · e nada é escrito abaixo do chão da mancha para caber à força.
     */
    const escritas = corpo(await desenhar(propostaDeOrcamento()));
    const quadro = onde(escritas, "Bouquet da Noiva")!;
    const totalAPagar = onde(escritas, "Total a pagar")!;
    const notas = onde(escritas, "Notas importantes")!;
    const reserva = onde(escritas, "Condições de reserva")!;
    const gerais = ondeCabecalho(escritas, "Condições Gerais")!;

    expect(totalAPagar.pagina, "o «Total a pagar» ficou órfão do quadro").toBe(quadro.pagina);
    expect(notas.pagina, "as notas e as condições de reserva partiram-se em duas folhas").toBe(
      reserva.pagina,
    );
    // A cauda passa inteira para a folha seguinte, e a secção seguinte começa
    // logo a seguir a ela: o orçamento não gasta uma terceira folha.
    expect(notas.pagina, "a cauda não ficou na folha logo a seguir ao quadro").toBe(
      quadro.pagina + 1,
    );
    // E não gasta mais nenhuma: as «Condições Gerais» começam na folha logo a
    // seguir à cauda, como começavam antes na folha logo a seguir ao quadro.
    expect(gerais.pagina, "o orçamento gastou uma folha a mais do que a cauda").toBe(
      notas.pagina + 1,
    );

    // Tudo isto sem descer abaixo do chão da mancha.
    const daFolha = escritas.filter((e) => e.pagina === quadro.pagina && e.y >= M);
    expect(
      Math.min(...daFolha.map((e) => e.y)),
      "a cauda coube na folha à custa de escrever abaixo do chão",
    ).toBeGreaterThanOrEqual(CHAO);
  });

  it("as rubricas encostam à margem, e não a uma coluna à direita", async () => {
    const escritas = corpo(await desenhar(propostaDeOrcamento()));
    for (const rubrica of ["Notas importantes", "Condições de reserva"]) {
      expect(onde(escritas, rubrica)!.x, `«${rubrica}» não está encostada à margem`).toBe(M);
    }
  });

  /**
   * O que ela vê no ecrã parece cortado a meio das palavras. O texto NÃO estava
   * cortado — a quebra media a coluna certa —, mas cabiam quarenta e cinco
   * caracteres por linha e uma nota de duas linhas passava a quatro. A garantia
   * que se fixa é a que se pode medir: nada do corpo é desenhado para lá da
   * mancha, nem à direita nem para fora da folha.
   */
  it("nada do corpo começa na metade direita da folha", async () => {
    // A folha é A4 ao baixo: entre margens são 706 pontos. Nenhuma linha do
    // corpo pode COMEÇAR para lá dos 430 da mancha do quadro (M+MEASURE=498) —
    // é aí que ficava a coluna estreita, a começar em 569. As linhas das notas
    // estendem-se até aos 618, mas todas começam à margem, que é o que faz
    // delas uma coluna e não duas.
    const LIMITE = M + 430;
    for (const doc of [propostaDeOrcamento(), propostaDeOrcamentoGorda()]) {
      const escritas = corpo(await desenhar(doc));
      // Só as folhas do orçamento: a capa tem texto centrado, e centrado a meio
      // de uma folha ao baixo é para lá dos 498 sem que nada esteja errado.
      const daPrimeira = ondeCabecalho(escritas, "Orçamento Proposto")!.pagina;
      const daSeguinte = ondeCabecalho(escritas, "Condições Gerais")!.pagina;
      const daFolha = escritas.filter(
        // Fora o rodapé (marca à esquerda, e-mail encostado à direita, em M-26),
        // que é desenhado em todas as páginas e não é conteúdo desta.
        (x) => x.pagina >= daPrimeira && x.pagina < daSeguinte && x.y >= M,
      );
      for (const e of daFolha) {
        expect(e.x, `«${e.texto}» começa na metade direita da folha`).toBeLessThanOrEqual(LIMITE);
        expect(e.x, `«${e.texto}» começa fora da folha`).toBeLessThanOrEqual(W - M);
      }
    }
  });

  it("nem as listas mais compridas escrevem por baixo do rodapé", async () => {
    const escritas = await desenhar(propostaDeOrcamentoGorda());
    // O elemento mais baixo de uma página é o rodapé, em `M - 26`.
    expect(
      Math.min(...escritas.map((e) => e.y)),
      "há texto desenhado por baixo do rodapé",
    ).toBeGreaterThanOrEqual(M - 27);
  });

  /**
   * «Uma página em branco no fim não pode acontecer» — é um dos defeitos da
   * folha antiga que ela mandou corrigir, e uma cauda que parte por rubricas
   * inteiras é precisamente o sítio onde ele voltaria a aparecer.
   */
  it("nenhuma página do documento fica vazia", async () => {
    for (const doc of [propostaDeOrcamento(), propostaDeOrcamentoGorda()]) {
      const paginas = porPagina(await desenhar(doc));
      for (const [i, pagina] of paginas.entries()) {
        expect(pagina.length, `a página ${i + 1} não tem nada desenhado`).toBeGreaterThan(0);
      }
    }
  });

  it("uma lista comprida parte por rubricas inteiras, nunca a meio", async () => {
    const escritas = corpo(await desenhar(propostaDeOrcamentoGorda()));
    // Cada rubrica leva consigo, na mesma página, a primeira linha da sua lista.
    for (const [rubrica, primeiroItem] of [
      ["Notas importantes", "O serviço de montagem e desmontagem está incluído na Proposta;"],
      ["Condições de reserva", "Serviço de decoração, material e flores conforme descrito;"],
    ] as const) {
      const r = onde(escritas, rubrica);
      const i = onde(escritas, primeiroItem);
      expect(r, `não se encontrou «${rubrica}»`).toBeDefined();
      expect(i, `não se encontrou o primeiro item de «${rubrica}»`).toBeDefined();
      expect(i!.pagina, `«${rubrica}» ficou sem a sua lista por baixo`).toBe(r!.pagina);
      expect(i!.y).toBeLessThan(r!.y);
    }
  });

  /**
   * O «Total a pagar» é um número que a folha antiga não tem. Continua a poder
   * ligar-se — o que mudou é o que sai sem ninguém escolher. (O texto impresso
   * está fixado em `proposal-doc-pdf.dinheiro.test.ts`; aqui garante-se que a
   * omissão não deixa um buraco no meio da coluna nem parte a página.)
   */
  it("com a soma ligada, a coluna continua na mesma ordem", async () => {
    const comExtras = {
      budgetExtras: [
        { label: "Serviço de coordenação", valueText: "950,50 € + IVA" },
        { label: "Deslocação da Equipa Líquen", valueText: "250,00 €" },
      ],
    };
    const escritas = corpo(await desenhar(propostaDeOrcamento(comExtras)));
    const total = onde(escritas, "Total a pagar");
    const notas = onde(escritas, "Notas importantes");
    expect(total, "o total ligado não foi desenhado").toBeDefined();
    expect(vemDepoisDe(notas!, total!), "as notas não vêm depois do total").toBe(true);
  });
});

/** A mesma proposta com as listas da casa engordadas — é com estas que a coluna
 *  da direita passava por cima do rodapé. */
function propostaDeOrcamentoGorda() {
  const base = propostaDeOrcamento();
  const mais = (n: number, s: string) => Array.from({ length: n }, (_, i) => `${s} ${i + 1}.`);
  return {
    ...base,
    budgetItems: mais(
      14,
      "Linha de orçamento com um nome comprido, do tamanho dos que ela escreve",
    ),
    notasImportantes: [
      ...base.notasImportantes,
      ...mais(6, "Nota importante com texto suficiente para ocupar mais do que uma linha"),
    ],
    incluido: [...base.incluido, ...mais(5, "Item incluído adicional na proposta")],
    naoIncluido: [...base.naoIncluido, ...mais(5, "Item não incluído adicional no orçamento")],
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
   A PRIMEIRA FOLHA É A DELA: APRESENTAÇÃO E SERVIÇOS, UMA POR CIMA DA OUTRA
   ═══════════════════════════════════════════════════════════════════════════

   Ela mandou a página 1 de uma proposta verdadeira («Proposta Decoração
   Casamento Inês & Gonçalo 7.08.2027») e disse: «eu quero esta parte assim na
   proposta do back office dos serviços igualzinha.»

   Nessa folha, de cima para baixo e TUDO na mesma página: «1. Apresentação»,
   sete linhas de «Rótulo: valor», e «2. Serviços» com o grupo e os seus cinco
   serviços. Aqui fixa-se o que isso quer dizer em medidas — a ordem dos
   campos, as duas secções na mesma folha, e o que acontece quando não cabe. */

/** A folha dela, campo a campo. */
function propostaComoADela(over: Record<string, unknown> = {}) {
  return withProposalDefaults({
    template: "decoracao",
    ref: "Proposta Decoração Casamento Inês & Gonçalo 7.08.2027",
    clientNames: "Inês e Gonçalo",
    eventType: "Casamento",
    eventDate: "7 de agosto de 2027",
    location: "Colina dos Piscos",
    guests: "190 pax",
    servico: "Decor e decoração Floral",
    ceremony: "Religiosa",
    moodBoards: [],
    coverImages: [],
    serviceGroups: [
      {
        letter: "a)",
        title: "Decoração do Casamento",
        items: [
          {
            label: "Tema e decoração",
            desc: "Desenvolvimento de um conceito visual e estético único que reflita a personalidade do casal.",
          },
          { label: "Cocktail", desc: "arranjos florais mesas bistro," },
          { label: "Almoço e Jantar", desc: "Decoração floral e decor das mesas do jantar" },
          { label: "Decor Mesas Buffet" },
          { label: "Complementos dos Noivos", desc: "Ramo da Noiva, raminhos de lapela" },
        ],
      },
    ],
    budgetItems: ["Decoração Floral Cocktail", "Decor Mesas Buffet"],
    totalLabel: "Valor Total",
    totalText: "4.750,00 € + IVA",
    totalAmount: 4750,
    totalVatMode: "acrescer" as const,
    ...over,
  } as Parameters<typeof withProposalDefaults>[0]);
}

/** Os rótulos da apresentação, na ordem em que foram desenhados. */
function rotulosDaApresentacao(escritas: Escrita[]): string[] {
  const cab = ondeCabecalho(escritas, "Apresentação")!;
  const seguinte = ondeCabecalho(escritas, "Serviços");
  return escritas
    .filter(
      (e) =>
        e.x === M &&
        e.texto.endsWith(":") &&
        vemDepoisDe(e, cab) &&
        (!seguinte || vemDepoisDe(seguinte, e)),
    )
    .map((e) => e.texto);
}

describe("a apresentação é a lista dela", () => {
  it("os campos saem pela ordem da folha dela, um por linha", async () => {
    const escritas = corpo(await desenhar(propostaComoADela()));
    expect(rotulosDaApresentacao(escritas)).toEqual([
      "Noivos:",
      "Evento:",
      "Data do Evento:",
      "Local:",
      "Número de Convidados:",
      "Serviço:",
      "Cerimónia:",
    ]);
  });

  /**
   * «Hora:» seguido de nada não é um campo por preencher — é um erro impresso
   * numa folha que vai para o cliente. Todos os campos desta secção são
   * opcionais na prática, e o que não está preenchido não existe na folha.
   */
  it("um campo vazio não desenha o rótulo", async () => {
    const escritas = corpo(
      await desenhar(propostaComoADela({ ceremony: "", servico: "", time: "" })),
    );
    const rotulos = rotulosDaApresentacao(escritas);
    expect(rotulos).not.toContain("Cerimónia:");
    expect(rotulos).not.toContain("Serviço:");
    expect(rotulos).not.toContain("Hora:");
    // E os que estão preenchidos continuam lá, pela mesma ordem.
    expect(rotulos).toEqual([
      "Noivos:",
      "Evento:",
      "Data do Evento:",
      "Local:",
      "Número de Convidados:",
    ]);
  });

  it("o valor sai na MESMA linha do rótulo, à direita dele", async () => {
    const escritas = corpo(await desenhar(propostaComoADela()));
    const rotulo = escritas.find((e) => e.texto === "Local:")!;
    // O local também está impresso na CAPA, que é outra página: o valor que
    // interessa é o da folha do rótulo.
    const valor = escritas.find(
      (e) => e.texto === "Colina dos Piscos" && e.pagina === rotulo.pagina,
    )!;
    expect(valor.y).toBe(rotulo.y);
    expect(valor.x).toBeGreaterThan(rotulo.x);
  });

  /** O caso dela, que é o normal: as duas secções na mesma folha, por esta
   *  ordem. Era isto que o parágrafo de boas-vindas e a grelha de quatro
   *  colunas impediam — a apresentação enchia uma folha inteira sozinha. */
  it("a apresentação e os serviços ficam na mesma folha, por esta ordem", async () => {
    const escritas = corpo(await desenhar(propostaComoADela()));
    const apresentacao = ondeCabecalho(escritas, "Apresentação")!;
    const servicos = ondeCabecalho(escritas, "Serviços")!;
    const ultimoServico = onde(escritas, "Complementos dos Noivos: ")!;

    expect(servicos.pagina, "os serviços saíram da folha da apresentação").toBe(
      apresentacao.pagina,
    );
    expect(vemDepoisDe(servicos, apresentacao), "os serviços não vêm por baixo").toBe(true);
    expect(ultimoServico.pagina, "o grupo não coube inteiro na folha").toBe(servicos.pagina);
  });

  /**
   * ── A NUMERAÇÃO ─────────────────────────────────────────────────────────
   * «1. Apresentação», «2. Serviços», «3. Orçamento Proposto», «4. Condições
   * Gerais». A folha antiga tem «2. Serviços» seguido de «2. Serviços
   * Disponibilizados» — dois capítulos com o mesmo número na mesma página. É
   * um erro dela, e é dos que não se copiam.
   */
  it("as secções são numeradas por ordem, sem repetir nenhum número", async () => {
    const escritas = corpo(await desenhar(propostaComoADela()));
    const cabecalhos = ["Apresentação", "Serviços", "Orçamento Proposto", "Condições Gerais"].map(
      (t) => ondeCabecalho(escritas, t)?.texto,
    );
    expect(cabecalhos).toEqual([
      "1. Apresentação",
      "2. Serviços",
      "3. Orçamento Proposto",
      "4. Condições Gerais",
    ]);
  });
});

/** Muitos grupos, todos do mesmo tamanho: obriga a secção a partir. */
function propostaDeMuitosGrupos() {
  return propostaComoADela({
    serviceGroups: Array.from({ length: 6 }, (_, g) => ({
      letter: `${String.fromCharCode(97 + g)})`,
      title: `Grupo de serviços número ${g + 1}`,
      items: Array.from({ length: 5 }, (_, i) => ({
        label: `Serviço ${g + 1}.${i + 1}`,
        desc: "Descrição do comprimento das que ela escreve, com material, montagem e desmontagem incluídos.",
      })),
    })),
  });
}

describe("os serviços partem por grupos inteiros", () => {
  it("nenhum grupo fica com metade dos serviços numa folha e metade noutra", async () => {
    const escritas = corpo(await desenhar(propostaDeMuitosGrupos()));
    for (let g = 0; g < 6; g++) {
      const titulo = onde(escritas, `Grupo de serviços número ${g + 1}`);
      expect(titulo, `não se encontrou o grupo ${g + 1}`).toBeDefined();
      for (let i = 0; i < 5; i++) {
        const item = onde(escritas, `Serviço ${g + 1}.${i + 1}: `);
        expect(item, `não se encontrou o serviço ${g + 1}.${i + 1}`).toBeDefined();
        expect(
          item!.pagina,
          `o grupo ${g + 1} partiu-se: o serviço ${i + 1} caiu noutra folha`,
        ).toBe(titulo!.pagina);
      }
    }
  });

  it("nenhuma página do documento fica vazia, nem com muitos grupos", async () => {
    for (const [i, pagina] of porPagina(await desenhar(propostaDeMuitosGrupos())).entries()) {
      expect(pagina.length, `a página ${i + 1} não tem nada desenhado`).toBeGreaterThan(0);
    }
  });
});
