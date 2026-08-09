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
const H = 595.28;
/** O corpo vive entre o chão da mancha e o topo depois do cabeçalho. */
const CHAO = M + 6;
const TECTO = H - M - 64;

interface Escrita {
  pagina: number;
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
