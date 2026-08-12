import { describe, it, expect, afterEach } from "vitest";
import { PDFDocument, PDFPage } from "pdf-lib";
import { renderProposalDocPdf } from "./proposal-doc-pdf";
import { withProposalDefaults } from "./proposal-doc";

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
 * Três serviços com descrições reais, do comprimento das que ela escreve.
 *
 * O `clientNames` longo não é decoração: é o gatilho. Empurra o parágrafo de
 * boas-vindas de três para quatro linhas, e é isso que faz o cabeçalho
 * «Serviços» cair no fundo da página — o caso que ela fotografou.
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
    // Vários comprimentos de nome: o que empurra o cabeçalho para o fundo é o
    // número de linhas do parágrafo de boas-vindas, e isso varia com o nome.
    for (const nomes of [
      "Ana & Zé",
      "Maria Margarida & José Francisco",
      "Maria Margarida Nogueira de Almeida & José Francisco Teixeira de Vasconcelos",
    ]) {
      const paginas = porPagina(await desenhar(propostaDeTresServicos(nomes)));
      for (const [i, pagina] of paginas.entries()) {
        const idx = pagina.findIndex((e) => e.texto === "Serviços");
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
  it("no caso da casa, o quadro e as duas rubricas ficam na mesma folha", async () => {
    const escritas = corpo(await desenhar(propostaDeOrcamento()));
    const quadro = onde(escritas, "Bouquet da Noiva")!;
    const notas = onde(escritas, "Notas importantes")!;
    const reserva = onde(escritas, "Condições de reserva")!;
    const gerais = onde(escritas, "Condições Gerais")!;

    expect(notas.pagina, "as «Notas importantes» saíram da folha do quadro").toBe(quadro.pagina);
    expect(reserva.pagina, "as «Condições de reserva» saíram da folha do quadro").toBe(
      quadro.pagina,
    );
    // E o orçamento ocupa UMA folha: a secção seguinte começa logo a seguir.
    expect(gerais.pagina, "o orçamento gastou mais do que uma folha").toBe(quadro.pagina + 1);

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
      const daPrimeira = onde(escritas, "Orçamento Proposto")!.pagina;
      const daSeguinte = onde(escritas, "Condições Gerais")!.pagina;
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
      mostrarTotalAPagar: true,
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
