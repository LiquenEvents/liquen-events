/**
 * ════════════════════════════════════════════════════════════════════════════
 * DAS LINHAS PARA OS CAMPOS — a parte que decide o que se sabe e o que não
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aqui não se abre nenhum ficheiro: entra uma lista de linhas com coordenadas e
 * sai uma lista de campos com origem e confiança. Puro, e por isso testável sem
 * gerar um PDF — mas os testes que valem mesmo alguma coisa são os de IDA E
 * VOLTA, que geram um documento verdadeiro, imprimem-no e vêem quanto é que
 * volta (ver `ida-e-volta.test.ts`).
 *
 * ── AS DUAS ÚNICAS MANEIRAS DE LER UM CAMPO ───────────────────────────────
 *
 * Tudo o que sai daqui está preso a um RÓTULO que estava impresso no papel.
 * Nunca a uma forma. «Aquilo parece uma data, deve ser a data do casamento» é
 * exactamente o erro que este motor não pode cometer: um PDF de proposta tem
 * meia dúzia de datas (a do evento, a da validade, a da assinatura, a do
 * rodapé) e escolher uma pela cara é escolher ao acaso com ar de certeza.
 *
 *   1. O VALOR POR BAIXO DO RÓTULO. É como este documento é composto: um
 *      rótulo pequeno em maiúsculas e, dezasseis pontos abaixo, na mesma
 *      coluna, o valor. Confiança alta.
 *
 *   2. O VALOR AO LADO DO RÓTULO, na mesma linha, separado por um vão grande.
 *      É como as folhas de Word e de Canva costumam ser feitas («Data:
 *      5 de junho de 2027»). Confiança média — o rótulo é o mesmo, mas a forma
 *      da página é uma que não conhecemos.
 *
 * O que não cai numa destas duas não é devolvido. Fica em `porLer`, com a razão.
 */

import { parseMoneyText, detectVatMode } from "@/lib/proposal-doc";
import {
  caixaDe,
  chaveDeRotulo,
  comecaPorMarca,
  eRotulo,
  juntarItem,
  juntarParagrafo,
  linhasDaPagina,
  seguimentoAbaixo,
  type Corrida,
  type Linha,
  type PaginaLida,
} from "./linhas";
import type { CampoPorLer, CampoProposto, Confianca } from "./tipos";

/** Meses como o gerador os escreve na data de validade («10 de out. de 2026»).
 *  A mesma lista de `proposal-doc-pdf`, aqui na forma reduzida com que se
 *  comparam rótulos, para o ponto da abreviatura não estragar a comparação. */
const MESES_CURTOS = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
];

/** Cabeçalhos das secções, na forma exacta em que o gerador os desenha. Um
 *  vocabulário fechado: é ele que distingue «ler» de «adivinhar». */
const SECCOES_GRANDES: Record<string, string> = {
  Apresentação: "apresentacao",
  Serviços: "servicos",
  "Cronograma de Organização": "cronograma",
  "Orçamento Proposto": "orcamento",
  "Condições Gerais": "condicoes",
};

/** Sub-cabeçalhos das páginas de fecho — corpo 13, encostados à margem. */
const SECCOES_PEQUENAS: Record<string, string> = {
  "Próximos Passos": "proximos",
  "Observações Gerais": "observacoes",
  "Faseamento do Pagamento": "faseamento",
  Cancelamento: "cancelamento",
  Contactos: "contactos",
};

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS MESMAS SECÇÕES, COMO UMA FOLHA DE WORD AS ESCREVE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * As duas propostas verdadeiras feitas à mão não têm um único cabeçalho em
 * corpo 20: têm «1. Apresentação» e «3. Orçamento Proposto» em corpo 10,
 * «Notas Importantes» em 11, e «INCLUÍDO NA PROPOSTA:», «CONDIÇÕES GERAIS:»,
 * «FASEAMENTO DO PAGAMENTO:» e «CANCELAMENTO:» em capitulares de corpo 8 — o
 * mesmo corpo do texto que lhes fica por baixo. Procurar cabeçalhos pelo
 * TAMANHO devolvia zero em dez, e com eles iam-se as listas todas.
 *
 * O que estas folhas têm, e o texto à volta não tem, é uma MARCA: o número de
 * ordem à cabeça, os dois pontos no fim, ou um corpo maior do que o da página.
 * É essa marca que separa um cabeçalho de uma frase que por acaso diz o mesmo —
 * ver {@link nomeDeSeccaoAMao}.
 *
 * Alguns destes nomes não têm campo nenhum («Condições de Reserva»,
 * «CONTACTOS:»): entram na mesma, porque uma secção que não se lê continua a
 * ser a FRONTEIRA da que vem antes. Sem a de contactos, a lista de cancelamento
 * da Mariana acabava com o email e o telefone da Líquen lá dentro.
 */
const SECCOES_A_MAO: Record<string, string> = {
  Apresentação: "apresentacao",
  Serviços: "servicos",
  "Cronograma de Organização": "cronograma",
  "Orçamento Proposto": "orcamento",
  "Notas Importantes": "notas",
  "Condições de Reserva": "reserva",
  "Incluído na Proposta": "incluido",
  "Não Incluído": "naoIncluido",
  "Não Incluído no Orçamento": "naoIncluido",
  "Condições Gerais": "condicoes",
  "Observações Gerais": "observacoes",
  "Faseamento do Pagamento": "faseamento",
  Cancelamento: "cancelamento",
  Contactos: "contactos",
  "Próximos Passos": "proximos",
};

/** O número de ordem à cabeça de um cabeçalho («1.», «2)», e o ponto solto que
 *  o Word deixa antes dele). */
const ORDINAL_A_CABECA = /^[\s.·]*(?:\d{1,2}\s*[.)])?\s*/;

/**
 * O nome da secção que este texto é — ou `null`.
 *
 * Tira o número de ordem e os dois pontos finais ANTES de comparar, porque é
 * disso que a folha à mão está cheia: «2. Serviços» e «CONDIÇÕES GERAIS:» são
 * a mesma secção que «Serviços» e «Condições Gerais», escritas à maneira de
 * quem numera capítulos no Word.
 */
function nomeDeSeccaoAMao(texto: string): string | null {
  const limpo = texto.replace(ORDINAL_A_CABECA, "").replace(/\s*:\s*$/, "");
  if (!limpo) return null;
  const chave = chaveDeRotulo(limpo);
  return Object.entries(SECCOES_A_MAO).find(([t]) => chaveDeRotulo(t) === chave)?.[1] ?? null;
}

/** Este texto traz a marca de um cabeçalho escrito à mão — um número de ordem
 *  à cabeça ou dois pontos no fim? */
function temMarcaDeCabecalho(texto: string): boolean {
  return /^[\s.·]*\d{1,2}\s*[.)]\s+\S/.test(texto) || /\S\s*:\s*$/.test(texto);
}

interface Seccao {
  nome: string;
  /** A linha do cabeçalho. */
  cabecalho: Linha;
  /** Tudo o que vem a seguir, até ao cabeçalho seguinte. */
  linhas: Linha[];
}

interface Contexto {
  paginas: PaginaLida[];
  linhas: Linha[];
  seccoes: Seccao[];
  /** As páginas de inspiração de uma folha feita à mão, com o texto que lá
   *  está — fora de `linhas`, para não entrarem na secção onde calharam. */
  moodboardsAMao: { pagina: number; linhas: Linha[] }[];
  margem: number;
  /** Largura da página, para saber onde a mancha de texto acaba. */
  largura: number;
  /** Id da fonte NEGRA deste PDF, descoberto pelos cabeçalhos das secções.
   *  `null` quando não se descobriu — e aí não se separa rótulo de descrição. */
  negra: string | null;
}

/** O resultado desta camada. */
export interface Colheita {
  campos: CampoProposto[];
  porLer: CampoPorLer[];
  /** Em que página está cada mood board, para as fotos poderem ser atribuídas. */
  paginasDeMoodboard: number[];
  /** Qual dos dois modelos do estúdio, quando se conseguiu saber. */
  template: "decoracao" | "organizacao" | null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   O TRABALHO
   ═══════════════════════════════════════════════════════════════════════════ */

export function camposDoDocumento(paginas: readonly PaginaLida[]): Colheita {
  const linhas = paginas.flatMap((p) => linhasDaPagina(p));
  const campos: CampoProposto[] = [];
  const porLer: CampoPorLer[] = [];
  const paginasDeMoodboard: number[] = [];

  const largura = paginas[0]?.largura || 841.89;
  const margem = linhas.length ? Math.min(...linhas.map((l) => l.x)) : 68;

  const alturaPagina = paginas[0]?.altura || 595.28;
  const doCorpo = linhas.filter((l) => l.y > 60 && !ehCabecalhoCorrente(l, linhas, alturaPagina));

  // As páginas de inspiração de uma folha à mão saem do corpo ANTES de haver
  // secções: o título manuscrito de um mood board no meio da secção dos
  // serviços seria lido como mais um serviço, e as quatro linhas de descrição
  // de uma delas como quatro.
  const paginasAMao = paginasDeInspiracaoAMao(doCorpo);
  const ctx: Contexto = {
    paginas: [...paginas],
    linhas: doCorpo.filter((l) => !paginasAMao.has(l.pagina)),
    seccoes: [],
    moodboardsAMao: [...paginasAMao]
      .sort((a, b) => a - b)
      .map((p) => ({ pagina: p, linhas: doCorpo.filter((l) => l.pagina === p) })),
    margem: 68,
    largura,
    negra: null,
  };
  // A margem mede-se no que SOBRA: numa proposta feita à mão as páginas de
  // inspiração são em paisagem e têm títulos a começar em x=7, e com elas na
  // conta a margem do documento dava 7 — nenhum cabeçalho ficava «encostado à
  // margem» e não se encontrava secção nenhuma.
  ctx.margem = ctx.linhas.length ? Math.min(...ctx.linhas.map((l) => l.x)) : margem;
  ctx.seccoes = seccoesDo(ctx);
  ctx.negra = fonteNegra(ctx);

  // ── O que se lê fora de qualquer secção ──
  const ref = lerRef(ctx, linhas, campos, porLer);
  const template = lerTemplate(ctx, campos) ?? lerTemplateDaRef(ref, campos);

  // ── Secção a secção ──
  lerApresentacao(ctx, campos, porLer);
  lerDaRef(ref, campos, porLer);
  lerServicos(ctx, campos, porLer);
  lerCronograma(ctx, campos);
  lerMoodboards(ctx, campos, porLer, paginasDeMoodboard);
  lerOrcamento(ctx, campos, porLer, template === "organizacao");
  lerListaDeSeccao(ctx, "condicoes", "condicoesGerais", campos, porLer, { duasColunas: true });
  lerListaDeSeccao(ctx, "observacoes", "observacoesGerais", campos, porLer, {});
  lerListaDeSeccao(ctx, "faseamento", "faseamento", campos, porLer, {});
  lerListaDeSeccao(ctx, "cancelamento", "cancelamento", campos, porLer, {});
  lerValidade(ctx, campos, porLer);
  lerSinalDoFaseamento(ctx, campos);

  /**
   * ── NUMA FOLHA QUE NÃO É NOSSA, NADA É LEITURA DIRECTA ───────────────────
   *
   * As regras deste ficheiro descobrem muito numa proposta feita em Word — as
   * secções pela numeração, os itens pelo pontinho impresso, o quadro pelo
   * cabeçalho «Item | Preço (€)». Descobrem, e continuam a ser regras nossas
   * sobre uma folha que ninguém aqui compôs: nunca se sabe se o que ela chama
   * «CONDIÇÕES GERAIS:» é o que o estúdio chama condições gerais (na proposta
   * da Mariana, a segunda lista com esse nome é o que aqui se chama
   * observações). Isso não é «alta» nenhuma — é uma proposta de leitura para
   * ela conferir.
   *
   * A referência é a excepção, e por uma razão: não é interpretada. É a MESMA
   * linha, no mesmo sítio, em oito páginas, devolvida tal e qual.
   */
  const nossa = ctx.seccoes.some((s) => s.cabecalho.tamanho >= 16);
  const finais = nossa
    ? campos
    : campos.map((c) =>
        c.confianca === "alta" && c.campo !== "ref"
          ? {
              ...c,
              confianca: "media" as Confianca,
              porque: `${c.porque} Esta folha não é a que o estúdio gera — foi lida por regras que valem para uma proposta escrita à mão, e nenhuma delas dá certeza.`,
            }
          : c,
      );

  return { campos: finais, porLer, paginasDeMoodboard, template };
}

/* ═══════════════════════════════════════════════════════════════════════════
   ANDAIMES
   ═══════════════════════════════════════════════════════════════════════════ */

function novoCampo(
  campo: string,
  valor: string | number | boolean,
  confianca: Confianca,
  porque: string,
  origem: readonly Linha[],
  textoDaOrigem?: string,
): CampoProposto {
  const c = caixaDe(origem);
  return {
    campo,
    valor,
    confianca,
    porque,
    origem: {
      pagina: origem[0]?.pagina ?? 0,
      texto: textoDaOrigem ?? origem.map((l) => l.texto).join(" "),
      x: arred(c.x),
      y: arred(c.y),
      largura: arred(c.largura),
      altura: arred(c.altura),
    },
  };
}

function arred(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MOBÍLIA DA PÁGINA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O cabeçalho corrente («PO Casamento Decoração Mariana e João · 5.06.2027», no
 * canto superior direito) e o rodapé («LÍQUEN EVENTS», o email, o número da
 * página) repetem-se em todas as páginas. Não são conteúdo — são a folha.
 *
 * O rodapé sai por altura: vive abaixo da mancha e nenhum texto de conteúdo
 * chega lá. O cabeçalho não sai assim: está a 525 pontos e o corpo começa a
 * 463, mas há páginas em que a folga entre os dois é de doze pontos e uma
 * regra por altura ou apanha o cabeçalho ou apanha o primeiro título.
 *
 * O que o denuncia é o que já o identificou como referência do documento: é a
 * MESMA linha, no MESMO sítio, em páginas diferentes. Nenhum parágrafo de uma
 * proposta se repete assim.
 *
 * ── O que isto evitou ────────────────────────────────────────────────────
 * Numa proposta em que as condições gerais passavam para uma segunda página, a
 * referência do documento aparecia no fim da lista como se fosse uma condição:
 * o casal recebia uma proposta com uma décima primeira condição geral que dizia
 * «PO Casamento Decoração Mariana e João · 5.06.2027».
 */
function ehCabecalhoCorrente(linha: Linha, todas: readonly Linha[], alturaPagina: number): boolean {
  const banda = alturaPagina - 90;
  if (linha.y < banda) return false;
  const texto = linha.texto.trim();
  if (!texto) return true;
  const paginas = new Set(
    todas.filter((l) => l.y >= banda && l.texto.trim() === texto).map((l) => l.pagina),
  );
  return paginas.size >= 2;
}

/** Uma linha com uma só corrida — para quando é preciso tratar uma corrida
 *  (um rótulo no meio de uma fila deles) como se fosse uma linha inteira. */
function comoLinha(pagina: number, c: Corrida): Linha {
  return {
    pagina,
    y: c.y,
    tamanho: c.tamanho,
    corridas: [c],
    texto: c.texto,
    x: c.x,
    x2: c.x2,
  };
}

/** As linhas reconstruídas apenas com as corridas dentro de `[min, max[` de x.
 *  É como se lê UMA coluna de uma página composta em duas — na página das
 *  condições gerais, as duas colunas partilham a linha de base, e sem isto o
 *  primeiro parágrafo da esquerda saía colado ao primeiro da direita. */
function coluna(linhas: readonly Linha[], min: number, max: number): Linha[] {
  const out: Linha[] = [];
  for (const l of linhas) {
    const dentro = l.corridas.filter((c) => c.x >= min && c.x < max);
    if (!dentro.length) continue;
    out.push({
      ...l,
      corridas: dentro,
      /**
       * A base é a DESTA coluna, não a da linha inteira.
       *
       * Duas colunas partilham a linha só à tolerância de meio ponto com que se
       * juntam pedaços, e a base que fica na linha é a do primeiro pedaço a ser
       * lido — que pode ser o da outra coluna. Herdá-la desalinhava os saltos
       * verticais em até dois pontos, e é com eles que {@link lerLista} decide
       * onde acaba um item: era isso que partia a lista do «não incluído» do
       * nosso próprio orçamento em «…palamenta de» e «catering;».
       */
      y: dentro[0].y,
      texto: dentro.map((c) => c.texto).join(" "),
      x: dentro[0].x,
      x2: Math.max(...dentro.map((c) => c.x2)),
      tamanho: dentro.reduce((a, b) => (b.x2 - b.x > a.x2 - a.x ? b : a)).tamanho,
    });
  }
  return out;
}

/**
 * Os cabeçalhos de secção do documento, por ordem de leitura.
 *
 * Duas leituras somadas, e não uma:
 *
 *   · a NOSSA folha, pelo TAMANHO — corpo 20 encostado à margem para as
 *     secções grandes, corpo 13 para as pequenas, sempre num vocabulário
 *     fechado;
 *   · a folha FEITA À MÃO, pela MARCA — o número de ordem, os dois pontos
 *     finais, ou um corpo maior do que o do resto da página. Ver
 *     {@link SECCOES_A_MAO}.
 *
 * A segunda leitura mede-se contra a margem DA PÁGINA e não contra a do
 * documento: a Mariana tem a apresentação a começar em 71 e as condições de
 * reserva, três páginas à frente, em 107. Sessenta pontos de folga chegam para
 * essa diferença e continuam a deixar de fora a coluna da direita do NOSSO
 * orçamento, que está a 490 da margem — sem isso, a rubrica «N Ã O
 * I N C L U Í D O» partia a secção do orçamento ao meio e levava com ela o
 * sinal e as três listas de reserva.
 */
function cabecalhosDe(linhas: readonly Linha[], margem: number): { nome: string; linha: Linha }[] {
  const perto = (x: number) => Math.abs(x - margem) <= 4;
  const cabecalhos: { nome: string; linha: Linha }[] = [];
  const jaTem = (l: Linha) =>
    cabecalhos.some((c) => c.linha.pagina === l.pagina && c.linha.y === l.y);

  for (const l of linhas) {
    const chave = chaveDeRotulo(l.texto);
    if (perto(l.x) && l.tamanho >= 16) {
      const nome = Object.entries(SECCOES_GRANDES).find(([t]) => chaveDeRotulo(t) === chave)?.[1];
      if (nome) cabecalhos.push({ nome, linha: l });
    } else if (perto(l.x) && l.tamanho >= 11 && l.tamanho < 16) {
      // O corpo 13 também é o dos títulos de grupo dos serviços e o das duas
      // rubricas da coluna da direita do orçamento: só entra o que estiver no
      // vocabulário, e só à margem.
      const nome = Object.entries(SECCOES_PEQUENAS).find(([t]) => chaveDeRotulo(t) === chave)?.[1];
      if (nome) cabecalhos.push({ nome, linha: l });
    } else if (perto(l.x) && chave === "INSPIRACAO") {
      // A página de mood board não tem cabeçalho grande — tem a legenda
      // «Inspiração» e, por baixo dela, o título do board em corpo 24.
      cabecalhos.push({ nome: "moodboard", linha: l });
    }
    if (jaTem(l)) continue;
    const nome = nomeDeSeccaoAMao(l.texto);
    if (!nome) continue;
    if (l.x > margemDaPagina(linhas, l.pagina) + 60) continue;
    // A MARCA é o que separa um cabeçalho de uma linha que diz o mesmo. Sem
    // ela, a legenda «F A S E A M E N T O D O P A G A M E N T O» que o nosso
    // orçamento desenha por cima do sinal passava a cabeçalho de secção.
    if (!temMarcaDeCabecalho(l.texto) && l.tamanho < corpoDaPagina(linhas, l.pagina) + 1.5)
      continue;
    cabecalhos.push({ nome, linha: l });
  }
  return cabecalhos.sort((a, b) => a.linha.pagina - b.linha.pagina || b.linha.y - a.linha.y);
}

/** Onde começa o texto desta página — a referência contra a qual se mede se um
 *  cabeçalho está «encostado», numa folha em que cada página tem a sua margem. */
function margemDaPagina(linhas: readonly Linha[], pagina: number): number {
  const xs = linhas.filter((l) => l.pagina === pagina).map((l) => l.x);
  return xs.length ? Math.min(...xs) : 0;
}

/** O corpo de letra do texto corrente desta página — o mais repetido. */
function corpoDaPagina(linhas: readonly Linha[], pagina: number): number {
  return maisComum(linhas.filter((l) => l.pagina === pagina).map((l) => arred(l.tamanho)));
}

/** Divide o documento em secções pelos seus cabeçalhos. */
function seccoesDo(ctx: Contexto): Seccao[] {
  const cabecalhos = cabecalhosDe(ctx.linhas, ctx.margem);

  /**
   * ── UMA SECÇÃO COMEÇA NA LEGENDA, NÃO NO TÍTULO ─────────────────────────
   *
   * Cada secção deste documento abre com uma legenda pequena («O
   * INVESTIMENTO») e, vinte e quatro pontos abaixo, com o título («Orçamento
   * Proposto»). Se a fronteira for o TÍTULO, tudo o que está entre a legenda e
   * ele fica a pertencer à secção ANTERIOR — e ali não está só a legenda: está
   * também o topo da coluna da direita, que o gerador ancora à altura da
   * legenda.
   *
   * Foi assim que uma proposta de Organização devolveu uma terceira fase de
   * cronograma chamada «O I N V E S T I M E N T O Notas importantes», com uma
   * tarefa que era a primeira nota de reserva.
   *
   * A legenda encontra-se pelo sítio: mesma coluna do título, um pouco acima,
   * em corpo pequeno.
   */
  const topoDe = (titulo: Linha): number => {
    /**
     * Só as secções GRANDES têm legenda por cima — são as únicas que o gerador
     * desenha assim. Aplicada a toda a gente, esta regra fazia estragos numa
     * folha à mão, onde tudo é do mesmo tamanho: a linha «Local: Évora», por
     * estar onze pontos acima do cabeçalho «2. Serviços» e ser pequena, passava
     * por legenda dele — e a apresentação da Catarina acabava aí, sem o local
     * nem o número de convidados. O mesmo tirava as duas linhas do «INCLUÍDO NA
     * PROPOSTA:» da Mariana, que é uma lista de duas linhas e ficava vazia.
     */
    if (titulo.tamanho < 16) return titulo.y;
    const legenda = ctx.linhas.find((l) => {
      // Pela PRIMEIRA corrida, e não pela linha: a legenda partilha a linha de
      // base com o topo da coluna da direita, que é maior do que ela e ficaria
      // a dar o corpo à linha inteira. Era exactamente esse o caso a corrigir.
      const primeira = l.corridas[0];
      return (
        !!primeira &&
        l.pagina === titulo.pagina &&
        l.y > titulo.y &&
        l.y <= titulo.y + 34 &&
        Math.abs(primeira.x - titulo.x) <= 4 &&
        primeira.tamanho < 9
      );
    });
    return legenda?.y ?? titulo.y;
  };

  return cabecalhos.map((c, i) => {
    const seguinte = cabecalhos[i + 1]?.linha;
    const limite = seguinte ? topoDe(seguinte) : 0;
    const linhas = ctx.linhas.filter((l) => {
      const depoisDeste =
        l.pagina > c.linha.pagina || (l.pagina === c.linha.pagina && l.y < c.linha.y);
      if (!depoisDeste) return false;
      if (!seguinte) return true;
      return l.pagina < seguinte.pagina || (l.pagina === seguinte.pagina && l.y > limite);
    });
    return { nome: c.nome, cabecalho: c.linha, linhas };
  });
}

/** A fonte com que os cabeçalhos das secções são desenhados — a negra do
 *  documento. Serve para separar o RÓTULO de um serviço da sua descrição, que
 *  são desenhados na mesma linha com fontes diferentes. */
function fonteNegra(ctx: Contexto): string | null {
  const grande = ctx.seccoes.find((s) => s.cabecalho.tamanho >= 16);
  return grande?.cabecalho.corridas[0]?.fonte ?? null;
}

function seccao(ctx: Contexto, nome: string): Seccao | undefined {
  return ctx.seccoes.find((s) => s.nome === nome);
}

/**
 * TODAS as secções com este nome, por ordem de leitura.
 *
 * A folha da Mariana tem duas rubricas «CONDIÇÕES GERAIS:» na mesma página —
 * a segunda é o que o nosso documento chama observações gerais, mas no papel
 * dela as duas têm o mesmo nome. Ler só a primeira deitava fora cinco
 * condições; ler as duas devolve o que está escrito, que é o que ela vai rever.
 */
function seccoesComNome(ctx: Contexto, nome: string): Seccao[] {
  return ctx.seccoes.filter((s) => s.nome === nome);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DE INSPIRAÇÃO DE UMA FOLHA QUE NÃO É NOSSA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * A nossa folha diz-o: as páginas de mood board trazem a legenda «INSPIRAÇÃO».
 * As dela não trazem nada — são páginas em paisagem, cheias de fotografias, com
 * um título escrito numa manuscrita e mais nada. Quatro páginas na proposta da
 * Mariana, seis na da Catarina; sem as reconhecer, 31 das 32 fotografias ficam
 * sem destino e o título de cada uma perde-se.
 *
 * O que as denuncia não é a forma, é a LETRA. O texto de uma proposta é escrito
 * com duas ou três fontes, as mesmas de uma ponta à outra; o título de um mood
 * board é escrito com uma fonte que não aparece em mais nenhum sítio do
 * documento — foi escolhida para ser diferente. A regra é essa, e é medível:
 *
 *   · uma página cujas linhas usam TODAS fontes que nunca aparecem numa página
 *     com cabeçalho de secção — ou seja, fontes que não são as do corpo;
 *   · com texto (uma página em branco não é um mood board);
 *   · e com uma linha grande, que é o título.
 *
 * Só se aplica a documentos onde SE ENCONTROU pelo menos uma secção: sem saber
 * qual é a letra do corpo, isto não distinguiria nada de nada, e uma folha de
 * Word de uma página só passaria inteira por mood board.
 */
function paginasDeInspiracaoAMao(linhas: readonly Linha[]): Set<number> {
  const out = new Set<number>();
  const cabecalhos = cabecalhosDe(linhas, linhas.length ? Math.min(...linhas.map((l) => l.x)) : 0);
  const comCabecalho = new Set(cabecalhos.map((c) => c.linha.pagina));
  if (!comCabecalho.size) return out;

  const doCorpo = new Set<string>();
  for (const l of linhas) {
    if (!comCabecalho.has(l.pagina)) continue;
    for (const c of l.corridas) doCorpo.add(c.fonte);
  }

  for (const pagina of new Set(linhas.map((l) => l.pagina))) {
    if (comCabecalho.has(pagina)) continue;
    const daPagina = linhas.filter((l) => l.pagina === pagina);
    if (!daPagina.length) continue;
    if (daPagina.some((l) => l.corridas.some((c) => doCorpo.has(c.fonte)))) continue;
    if (!daPagina.some((l) => l.tamanho >= 12)) continue;
    out.add(pagina);
  }
  return out;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RÓTULO → VALOR
   ═══════════════════════════════════════════════════════════════════════════ */

interface Achado {
  linhas: Linha[];
  texto: string;
  confianca: Confianca;
  porque: string;
}

/**
 * O valor que pertence ao rótulo `rotulo`, procurado nas duas maneiras que o
 * cabeçalho deste ficheiro descreve: primeiro por baixo, depois ao lado.
 *
 * A busca é sobre as linhas que quem chama LHE DÁ, e é assim de propósito:
 * limitando-a à secção certa, um rótulo que apareça noutro sítio do documento
 * (a palavra «Data» dentro de um parágrafo das condições, por exemplo) nunca
 * chega a ser considerado. Quando não há secção nenhuma — uma folha de Word —
 * quem chama passa o documento inteiro e desce a confiança.
 */
function valorDoRotulo(
  linhas: readonly Linha[],
  rotulo: string,
  opcoes: { passoMaximo?: number; maxLinhas?: number } = {},
): Achado | null {
  const passoMaximo = opcoes.passoMaximo ?? 30;
  const maxLinhas = opcoes.maxLinhas ?? 3;

  for (const l of linhas) {
    for (const [i, c] of l.corridas.entries()) {
      const naMesma = rotuloEValorNaMesmaCorrida(c.texto, rotulo);
      if (!naMesma) continue;

      /**
       * 0 — o valor a seguir aos dois pontos, DENTRO da mesma corrida.
       *
       * É como o Word compõe metade destas linhas, e era o buraco maior: das
       * oito linhas da apresentação da Mariana, cinco vinham numa corrida só
       * («Noivos : Mariana e João», «Data do Evento: 5 de junho de 2027») e
       * nenhuma dessas se lia. As outras três liam-se — não porque fossem
       * diferentes, mas porque a composição as tinha partido por acaso.
       */
      if (naMesma.valor && !pareceCabecalhoDeSeccao(naMesma.valor)) {
        return {
          linhas: [comoLinha(l.pagina, c)],
          texto: naMesma.valor,
          confianca: "media",
          porque: `Estava a seguir a «${rotulo}:», na mesma linha e na mesma corrida de texto — é como as folhas feitas à mão costumam ser, não como esta é gerada.`,
        };
      }

      // 1 — o valor por baixo, na mesma coluna.
      const rotuloComoLinha = comoLinha(l.pagina, c);
      const abaixo = seguimentoAbaixo(linhasDaColuna(linhas, c.x), rotuloComoLinha, {
        passoMaximo,
        toleranciaX: 3,
      });
      // O valor é a PRIMEIRA linha por baixo do rótulo, e as que a seguem no
      // MESMO corpo de letra — um local com nome comprido ocupa duas.
      //
      // Sem a segunda metade desta regra, o nome do casal (corpo 20, debaixo de
      // «Noivos») arrastava atrás de si o parágrafo de boas-vindas que vem 28
      // pontos abaixo, em corpo 11,5: o campo saía «Mariana & João Caros
      // Mariana & João, foi com muito gosto que preparámos…», impresso na capa
      // de uma proposta.
      /**
       * ── O VALOR É A LINHA A SEGUIR, E SÓ ESSA ────────────────────────────
       *
       * Procurar «a primeira linha maior por baixo» sem exigir que seja a
       * PRIMEIRA linha era o que fazia o pior campo que este motor já
       * devolveu: na proposta da Catarina, «Noivos:» tem o nome truncado ao
       * lado e, quatro linhas mais abaixo, o cabeçalho «2. Serviços» — que é
       * maior. O campo `clientNames` saía «2. Serviços», com ar de lido.
       *
       * Uma leitura que salta por cima de quatro linhas não é uma leitura. E o
       * que estiver por baixo e for um cabeçalho de secção é recusado também,
       * mesmo estando encostado: um cabeçalho nunca é o valor de nada.
       */
      const primeira =
        abaixo[0] && abaixo[0].tamanho > c.tamanho + 1 && !pareceCabecalhoDeSeccao(abaixo[0].texto)
          ? abaixo[0]
          : undefined;
      const abaixoUteis = primeira
        ? abaixo
            .filter((v) => v.y <= primeira.y && Math.abs(v.tamanho - primeira.tamanho) <= 0.6)
            .slice(0, maxLinhas)
        : [];
      if (abaixoUteis.length) {
        return {
          linhas: abaixoUteis,
          texto: juntarParagrafo(abaixoUteis),
          confianca: "alta",
          porque: `Estava por baixo do rótulo «${rotulo}», na mesma coluna.`,
        };
      }

      // 2 — o valor ao lado, na mesma linha.
      const aoLado = l.corridas[i + 1];
      if (aoLado && aoLado.x > c.x2 && !pareceCabecalhoDeSeccao(aoLado.texto)) {
        return {
          linhas: [comoLinha(l.pagina, aoLado)],
          texto: aoLado.texto,
          confianca: "media",
          porque: `Estava ao lado do rótulo «${rotulo}», na mesma linha — é como as folhas feitas à mão costumam ser, não como esta é gerada.`,
        };
      }
    }
  }
  return null;
}

/** As linhas com apenas as corridas que começam à volta de `x` — a coluna a
 *  que um rótulo pertence. */
function linhasDaColuna(linhas: readonly Linha[], x: number): Linha[] {
  return coluna(linhas, x - 3, x + 3);
}

/**
 * Esta corrida é o rótulo `rotulo` — e, se for, o que é que lhe vem a seguir
 * dentro da própria corrida?
 *
 * Devolve `null` quando não é o rótulo, `{ valor: "" }` quando é o rótulo
 * sozinho (e o valor há-de estar por baixo ou ao lado), e o valor quando os
 * dois vieram no mesmo pedaço de texto.
 *
 * O espaço ANTES dos dois pontos não estorva — «Noivos : Mariana e João» e
 * «Cerimónia : a saber» estão as duas assim no papel, e a comparação é feita na
 * forma reduzida, que não vê espaços.
 */
function rotuloEValorNaMesmaCorrida(texto: string, rotulo: string): { valor: string } | null {
  if (eRotulo(texto, rotulo)) return { valor: "" };
  const dp = texto.indexOf(":");
  if (dp <= 0) return null;
  if (!eRotulo(texto.slice(0, dp), rotulo)) return null;
  return { valor: texto.slice(dp + 1).trim() };
}

/** Este texto é um cabeçalho de secção? Nunca pode ser o valor de um campo —
 *  ver o que aconteceu ao nome do casal da Catarina em {@link valorDoRotulo}. */
function pareceCabecalhoDeSeccao(texto: string): boolean {
  return nomeDeSeccaoAMao(texto) !== null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   LISTAS: ONDE ACABA UM ITEM E COMEÇA O SEGUINTE
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Junta linhas numa lista de itens, descobrindo sozinha onde é que cada item
 * acaba.
 *
 * ── O PROBLEMA ────────────────────────────────────────────────────────────
 * Uma lista impressa não diz onde acaba cada item: diz onde acaba cada LINHA. A
 * marca (o pontinho) é um desenho, não é texto, e não chega cá. Um item de duas
 * linhas e dois itens de uma linha são, no papel lido, três linhas iguais.
 *
 * ── A REGRA QUE RESOLVE QUASE TUDO ────────────────────────────────────────
 * Uma lista composta deixa MAIS espaço entre dois itens do que entre duas
 * linhas do mesmo item — é o que faz a lista ler-se como lista. Portanto os
 * saltos verticais desta lista têm dois valores, e o maior é o que separa itens.
 * Não é preciso saber quais: descobrem-se aqui, nesta lista, medindo-a. É por
 * isso que a mesma função lê as notas importantes (11,5 e 14,5), as condições
 * gerais (12 e 20) e as linhas do orçamento (15 e 20) sem lhe dizer nada.
 *
 * ── E QUANDO OS DOIS SALTOS SÃO IGUAIS ────────────────────────────────────
 * Nos serviços e no cronograma são: 15 pontos entre linhas do mesmo item e 15
 * entre itens. Aí a medida não decide, e a que decide é outra — uma linha só
 * pode ser a continuação de outra se a de cima estiver CHEIA, porque foi por
 * estar cheia que a composição a partiu. Uma linha que acaba a meio da mancha
 * não pode ter sobrado nada para transbordar. `limiteDeQuebra` é onde a mancha
 * acaba; quem chama sabe-o, esta função não.
 *
 * Sem nenhuma das duas, cada linha é um item. É a leitura mais conservadora:
 * parte um item a mais, e o que ela vê no ecrã é uma linha partida em duas —
 * que se corrige num segundo — em vez de dois serviços colados num só, que se
 * lê como se fosse de propósito.
 */
export function lerLista(
  linhas: readonly Linha[],
  opcoes: { limiteDeQuebra?: number } = {},
): { linhas: Linha[]; confianca: Confianca }[] {
  if (linhas.length <= 1) {
    return linhas.map((l) => ({ linhas: [l], confianca: "alta" as const }));
  }
  /**
   * Só contam os saltos que são mesmo saltos: DESCER dentro da mesma página.
   *
   * A página das condições gerais é composta em duas colunas, e a lista é lida
   * coluna a coluna — do fundo da esquerda salta-se para o topo da direita, e
   * essa passagem tem um «salto» de 236 pontos NEGATIVOS. Com ele lá dentro, o
   * mínimo passava a ser −236, o limiar caía para longe de tudo, e nenhuma
   * linha era continuação de nenhuma: as dez condições gerais saíam partidas em
   * vinte e três frases a meio.
   *
   * Uma passagem destas é sempre um item novo, e é assim que entra na conta.
   */
  const saltos: number[] = [];
  for (let i = 1; i < linhas.length; i++) {
    const salto = arred(linhas[i - 1].y - linhas[i].y);
    if (linhas[i - 1].pagina === linhas[i].pagina && salto > 0) saltos.push(salto);
  }
  const min = saltos.length ? Math.min(...saltos) : 0;
  const max = saltos.length ? Math.max(...saltos) : 0;
  const bimodal = saltos.length > 0 && max - min > 2;
  const limiar = (min + max) / 2;

  /**
   * ── QUANDO A MARCA VEM ESCRITA, É ELA QUE MANDA ──────────────────────────
   *
   * Nas folhas feitas em Word o pontinho é texto, e diz sem margem para dúvida
   * onde começa cada item: as condições gerais da Mariana são seis itens em
   * doze linhas, todas à mesma distância umas das outras (10,7 pontos). Sem
   * isto, a medida não tinha nada por onde decidir e devolvia doze condições,
   * seis delas a começar a meio de uma frase.
   *
   * Só vale quando a lista COMEÇA por uma marca — se a primeira linha não a
   * tem, o que quer que se siga não é a continuação de nada.
   */
  const porMarca = linhas.length > 0 && comecaPorMarca(linhas[0].texto);

  const itens: { linhas: Linha[]; confianca: Confianca }[] = [];
  for (const [i, l] of linhas.entries()) {
    const mesmoFluxo = i > 0 && linhas[i - 1].pagina === l.pagina && linhas[i - 1].y > l.y;
    const salto = i === 0 ? Infinity : arred(linhas[i - 1].y - l.y);
    let continua = false;
    if (mesmoFluxo) {
      if (porMarca) continua = !comecaPorMarca(l.texto);
      else if (bimodal) continua = salto < limiar;
      else if (opcoes.limiteDeQuebra !== undefined) {
        // Folga de uma palavra larga: a última palavra que coube numa linha
        // cheia acaba antes do limite, nunca em cima dele.
        continua = linhas[i - 1].x2 > opcoes.limiteDeQuebra - 70;
      }
    }
    if (continua && itens.length) {
      const anterior = itens[itens.length - 1];
      anterior.linhas.push(l);
      // Um item que teve de ser remontado a partir de linhas partidas leva um
      // grau a menos: a junção é uma regra a mais sobre o que estava escrito.
      if (!bimodal || porMarca) anterior.confianca = "media";
    } else {
      itens.push({ linhas: [l], confianca: "alta" });
    }
  }
  return itens;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS CAMPOS, UM A UM
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * A referência que corre no topo de todas as páginas de conteúdo.
 *
 * ── PORQUE É QUE ISTO NÃO VIA O CABEÇALHO DELA ────────────────────────────
 *
 * A banda era de 80 pontos e o corpo tinha de ser 10 ou menos. As duas
 * propostas verdadeiras têm o cabeçalho a 544 numas páginas e a 558 noutras
 * (num A4 ao baixo de 596 de altura) e em corpo 11 — ficava de fora pelo
 * corpo, por um ponto. Mede-se agora com a MESMA banda com que o cabeçalho
 * corrente é excluído do corpo do documento (ver {@link ehCabecalhoCorrente}):
 * uma linha ou é mobília da folha nos dois sítios, ou não é em nenhum.
 *
 * O x não entra na conta de propósito — a referência é encostada à direita e
 * começa onde o comprimento dela mandar (553 numas páginas, 577 noutras).
 */
function lerRef(
  ctx: Contexto,
  todas: readonly Linha[],
  campos: CampoProposto[],
  porLer: CampoPorLer[],
): string | null {
  const altura = ctx.paginas[0]?.altura || 595.28;
  const noTopo = todas.filter((l) => l.y >= altura - 90 && l.tamanho <= 14);
  const contagem = new Map<string, Linha[]>();
  for (const l of noTopo) {
    const t = l.texto.trim();
    if (t.length < 4) continue;
    contagem.set(t, [...(contagem.get(t) ?? []), l]);
  }
  const repetida = [...contagem.entries()]
    .filter(([, ls]) => new Set(ls.map((l) => l.pagina)).size >= 2)
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (!repetida) {
    porLer.push({
      campo: "ref",
      porque:
        "Não há nenhuma linha repetida no topo das páginas que sirva de referência do documento.",
    });
    return null;
  }
  campos.push(
    novoCampo(
      "ref",
      repetida[0],
      "alta",
      `Estava no topo de ${new Set(repetida[1].map((l) => l.pagina)).size} páginas, sempre igual.`,
      [repetida[1][0]],
    ),
  );
  return repetida[0];
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE O CABEÇALHO CORRENTE DIZ, QUANDO MAIS NADA DIZ
 * ════════════════════════════════════════════════════════════════════════════
 *
 * «PO Casamento Decoração Mariana e João 5.06.2027» corre no topo de todas as
 * páginas das duas propostas verdadeiras, e é uma convenção da casa: PO, o tipo
 * de evento, o modelo, o nome do casal, a data. Dali saem quatro campos sem
 * custo nenhum — e a proposta da Catarina é a razão de valer a pena: o papel
 * diz «Noivos: Catarina &» e o resto do nome nunca chegou a ser impresso.
 *
 * Isto é a ÚLTIMA tentativa, nunca a primeira: só corre para campos que nenhum
 * rótulo impresso preencheu, e sai sempre com confiança média. Um nome que
 * sobra depois de tirar as palavras conhecidas não é um nome LIDO — é o que
 * ficou, e é ela que confirma.
 */
const TIPOS_DE_EVENTO = ["Casamento", "Baptizado", "Batizado", "Aniversário", "Festa"];
const PALAVRAS_DA_REF = [...TIPOS_DE_EVENTO, "Decoração", "Organização", "Proposta", "PO"];

/** `PO … 5.06.2027` — o miolo e a data, quando a referência é da casa. */
function partesDaRef(ref: string | null): { miolo: string; data: string } | null {
  if (!ref) return null;
  const m = /^\s*PO\b(.*?)(\d{1,2}[./-]\d{1,2}[./-]\d{2,4})[\s.·-]*$/i.exec(ref);
  if (!m) return null;
  return { miolo: m[1], data: m[2] };
}

/** Decoração ou Organização, quando está escrito na referência e não na capa. */
function lerTemplateDaRef(
  ref: string | null,
  campos: CampoProposto[],
): "decoracao" | "organizacao" | null {
  const chave = chaveDeRotulo(ref ?? "");
  const qual = chave.includes("ORGANIZACAO")
    ? "organizacao"
    : chave.includes("DECORACAO")
      ? "decoracao"
      : null;
  if (!qual || !campos.length) return null;
  const origem = campos.find((c) => c.campo === "ref");
  if (!origem) return null;
  campos.push({
    campo: "template",
    valor: qual,
    confianca: "media",
    porque:
      "A palavra estava na referência que corre no topo das páginas, não na capa — esta folha não tem a capa que o estúdio desenha.",
    origem: origem.origem,
  });
  return qual;
}

/** O nome do casal, o tipo de evento e a data, tirados da referência — só para
 *  os campos que ficaram por preencher. */
function lerDaRef(ref: string | null, campos: CampoProposto[], porLer: CampoPorLer[]): void {
  const partes = partesDaRef(ref);
  const origem = campos.find((c) => c.campo === "ref")?.origem;
  if (!partes || !origem) return;
  const jaTem = (campo: string) => campos.some((c) => c.campo === campo);
  const acrescentar = (campo: string, valor: string, porque: string) => {
    if (jaTem(campo)) return;
    campos.push({ campo, valor, confianca: "media", porque, origem });
    const i = porLer.findIndex((p) => p.campo === campo);
    if (i >= 0) porLer.splice(i, 1);
  };

  const tipo = TIPOS_DE_EVENTO.find((t) => chaveDeRotulo(partes.miolo).includes(chaveDeRotulo(t)));
  if (tipo) {
    acrescentar("eventType", tipo, `A referência do documento diz «${tipo}».`);
  }

  // O que sobra do miolo depois de tirar as palavras da convenção é o nome. Um
  // resto vazio, com um número, ou com meia dúzia de palavras não é um nome de
  // casal e não é devolvido — a referência de outra proposta pode ser escrita
  // de outra maneira qualquer.
  const resto = PALAVRAS_DA_REF.reduce(
    (t, p) => t.replace(new RegExp(`\\b${p}\\b`, "gi"), " "),
    partes.miolo,
  )
    .replace(/[·–—-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const palavras = resto ? resto.split(" ") : [];
  if (resto.length >= 3 && palavras.length <= 6 && !/\d/.test(resto)) {
    acrescentar(
      "clientNames",
      resto,
      "Sobrou da referência do topo das páginas depois de tirar o tipo de evento, o modelo e a data — não estava preso a nenhum rótulo, por isso é para confirmar.",
    );
  }
  acrescentar(
    "eventDate",
    partes.data,
    "Era a data escrita na referência do topo das páginas, tal e qual — não há nenhum rótulo «Data» nesta folha.",
  );
}

/** Decoração ou Organização — está escrito na capa, por cima do nome do casal. */
function lerTemplate(ctx: Contexto, campos: CampoProposto[]): "decoracao" | "organizacao" | null {
  const primeira = ctx.paginas[0];
  if (!primeira) return null;
  for (const l of linhasDaPagina(primeira)) {
    for (const c of l.corridas) {
      const chave = chaveDeRotulo(c.texto);
      const qual =
        chave === "PROPOSTADECORACAO"
          ? "decoracao"
          : chave === "PROPOSTAORGANIZACAO"
            ? "organizacao"
            : null;
      if (!qual) continue;
      campos.push(
        novoCampo("template", qual, "alta", "Estava escrito na capa, por cima do nome.", [
          comoLinha(1, c),
        ]),
      );
      return qual;
    }
  }
  return null;
}

/**
 * Nomes, tipo de evento, data, local, convidados, cerimónia, hora, planners.
 *
 * ── QUANDO A FOLHA NÃO É NOSSA ────────────────────────────────────────────
 *
 * Sem a página de «Apresentação» — o que acontece a QUALQUER proposta feita em
 * Word ou no Canva — procuram-se os mesmos rótulos no documento INTEIRO, e
 * tudo o que se encontrar assim desce um grau de confiança. Continua a não
 * haver adivinha nenhuma: o rótulo tem de estar impresso: «Data:», «Local:»,
 * «Convidados:». O que muda é que já não se sabe em que parte do documento se
 * está, e o mesmo rótulo pode aparecer noutro contexto — daí o grau a menos e
 * daí a origem, que ela vê ao lado do campo antes de aceitar.
 */
function lerApresentacao(ctx: Contexto, campos: CampoProposto[], porLer: CampoPorLer[]): void {
  const s = seccao(ctx, "apresentacao");
  const onde = s ? s.linhas : ctx.linhas;
  const folhaDesconhecida = !s;
  /** Fora da página de apresentação, nada é leitura directa. */
  const grau = (a: Achado): Achado =>
    folhaDesconhecida
      ? {
          ...a,
          confianca: "media",
          porque: `${a.porque} Esta folha não tem a página de apresentação que o estúdio gera, por isso o rótulo foi procurado no documento todo.`,
        }
      : a;

  // O nome vem debaixo de «Noivos» (Decoração) ou «Cliente» (Organização).
  const nome0 =
    valorDoRotulo(onde, "Noivos") ??
    valorDoRotulo(onde, "Cliente") ??
    (folhaDesconhecida ? valorDoRotulo(onde, "Noivo e Noiva") : null);
  const nome = nome0 ? grau(nome0) : null;
  if (nome) {
    campos.push(novoCampo("clientNames", nome.texto, nome.confianca, nome.porque, nome.linhas));
  } else {
    porLer.push({
      campo: "clientNames",
      porque: folhaDesconhecida
        ? "Não há nenhum rótulo «Noivos» nem «Cliente» em lado nenhum deste documento."
        : "Não se encontrou o rótulo «Noivos» nem «Cliente» na página de apresentação.",
    });
  }

  /**
   * ── O MESMO CAMPO, ESCRITO DE MANEIRAS DIFERENTES ────────────────────────
   *
   * A nossa folha escreve «DATA» e «CONVIDADOS» porque a faixa da apresentação
   * é estreita e as legendas são curtas. Quem escreve a proposta no Word não
   * tem essa pressa: escreve «Data do Evento», «Data do Casamento», «Número de
   * Convidados». São o mesmo rótulo, e são procurados por esta ordem — do mais
   * específico para o mais curto, para que «Data do Evento» nunca chegue a ser
   * comparado com «Data» e a comparação continue a ser por texto INTEIRO.
   */
  const faixa: [string[], string][] = [
    [["Evento", "Tipo de Evento"], "eventType"],
    [["Data do Evento", "Data do Casamento", "Data"], "eventDate"],
    [["Local", "Local do Evento"], "location"],
    [["Número de Convidados", "N.º de Convidados", "Nº de Convidados", "Convidados"], "guests"],
    [["Cerimónia", "Cerimonia"], "ceremony"],
    [["Hora", "Horário"], "time"],
    [["Wedding Planners", "Wedding Planner"], "weddingPlanners"],
  ];
  for (const [rotulos, campo] of faixa) {
    let bruto: Achado | null = null;
    for (const rotulo of rotulos) {
      bruto = valorDoRotulo(onde, rotulo, { passoMaximo: 20, maxLinhas: 2 });
      if (bruto) break;
    }
    const a = bruto ? grau(bruto) : null;
    if (a) campos.push(novoCampo(campo, a.texto, a.confianca, a.porque, a.linhas));
    else porLer.push({ campo, porque: `Não há nenhum rótulo «${rotulos[0]}» nesta proposta.` });
  }
}

/** Grupos de serviços e os seus itens. */
function lerServicos(ctx: Contexto, campos: CampoProposto[], porLer: CampoPorLer[]): void {
  const s = seccao(ctx, "servicos");
  if (!s) {
    porLer.push({ campo: "serviceGroups", porque: "Não se encontrou o cabeçalho «Serviços»." });
    return;
  }
  const perto = (x: number, alvo: number) => Math.abs(x - alvo) <= 4;
  /**
   * Um título de grupo é uma linha encostada à margem que ou está em corpo
   * maior (a nossa folha) ou traz o MARCADOR ORDINAL impresso (a dela: «a)
   * Decoração de Casamento», «b) Wedding Coordination», em corpo 8, o mesmo dos
   * serviços que lhe ficam por baixo). O marcador é o que o estúdio já guarda
   * em `serviceGroups[].letter` — é um rótulo impresso, não uma forma.
   */
  const titulos = s.linhas.filter(
    (l) =>
      perto(l.x, ctx.margem) &&
      ((l.tamanho >= 11 && l.tamanho < 16) || /^[a-z]\)\s+\S/i.test(l.texto)),
  );
  if (!titulos.length) {
    porLer.push({
      campo: "serviceGroups",
      porque: "A secção de serviços não tem nenhum título de grupo reconhecível.",
    });
    return;
  }

  const depoisDe = (l: Linha, alvo: Linha) =>
    l.pagina > alvo.pagina || (l.pagina === alvo.pagina && l.y < alvo.y);

  titulos.forEach((titulo, gi) => {
    const seguinte = titulos[gi + 1];
    const doGrupo = s.linhas.filter(
      (l) => depoisDe(l, titulo) && (!seguinte || !depoisDe(l, seguinte)) && l !== seguinte,
    );

    // «a) Decoração Floral de Casamento» — o marcador ordinal é opcional e sai
    // para o seu campo, porque no estúdio é uma caixa à parte.
    const m = /^([a-z]\)|\d+[.)])\s+(.*)$/i.exec(titulo.texto);
    if (m) {
      campos.push(
        novoCampo(`serviceGroups[${gi}].letter`, m[1], "alta", "Marcador ordinal do grupo.", [
          titulo,
        ]),
      );
    }
    campos.push(
      novoCampo(
        `serviceGroups[${gi}].title`,
        m ? m[2] : titulo.texto,
        "alta",
        "Título de grupo, em corpo maior e encostado à margem.",
        [titulo],
      ),
    );

    // Os itens estão avançados em relação ao título. O avanço mede-se aqui, no
    // documento: é o x mais comum das linhas do grupo que não são o título.
    const candidatas = doGrupo.filter((l) => l.x > titulo.x + 6 && l.tamanho < 12);
    if (!candidatas.length) return;
    const avanco = maisComum(candidatas.map((l) => arred(l.x)));
    /**
     * Quando os itens trazem a marca escrita, é ela que diz quais são — e não
     * o avanço. Na proposta da Catarina o primeiro serviço de um grupo («•
     * Igreja») está oito pontos mais à direita do que os outros quatro, e
     * medir o avanço pelo x mais comum deitava-o fora sem uma palavra.
     */
    const doItem = candidatas.some((l) => comecaPorMarca(l.texto))
      ? candidatas
      : candidatas.filter((l) => perto(l.x, avanco));

    // O limite da mancha: as descrições correm até à margem direita da página.
    const itens = lerLista(doItem, { limiteDeQuebra: ctx.largura - ctx.margem });
    itens.forEach((it, ii) => {
      const texto = juntarItem(it.linhas);
      const partido = separarRotuloEDescricao(texto, it.linhas[0], ctx.negra);
      campos.push(
        novoCampo(
          `serviceGroups[${gi}].items[${ii}].label`,
          partido.label,
          it.confianca,
          partido.porque,
          it.linhas,
        ),
      );
      if (partido.desc) {
        campos.push(
          novoCampo(
            `serviceGroups[${gi}].items[${ii}].desc`,
            partido.desc,
            it.confianca,
            partido.porque,
            it.linhas,
          ),
        );
      }
    });
  });
}

/**
 * «Decoração Cerimónia: Arco floral e passadeira.» são DOIS campos, e no papel
 * são uma linha só.
 *
 * O que os separa não é o dois-pontos — um item sem descrição pode ter um
 * dois-pontos no meio da frase. É a FONTE: o rótulo é desenhado a negro e a
 * descrição não. Só se separa quando a linha começa mesmo na negra do
 * documento; nos outros casos, o item inteiro fica no rótulo, que é onde o
 * estúdio o mostra por omissão e onde ela o pode partir com o cursor.
 */
function separarRotuloEDescricao(
  texto: string,
  primeira: Linha,
  negra: string | null,
): { label: string; desc?: string; porque: string } {
  const comecaNaNegra = !!negra && primeira.corridas[0]?.fonte === negra;
  const dp = texto.indexOf(": ");
  if (comecaNaNegra && dp > 0) {
    return {
      label: texto.slice(0, dp),
      desc: texto.slice(dp + 2).trim(),
      porque: "O rótulo estava a negro e a descrição a seguir, na mesma linha.",
    };
  }
  return { label: texto, porque: "Item de serviço, avançado por baixo do título do grupo." };
}

/**
 * O cronograma do modelo Organização: fases, cada uma com as suas tarefas.
 *
 * Tem a mesma forma dos serviços — um título encostado à margem e uma lista
 * avançada por baixo — e o mesmo problema: entre duas tarefas e entre duas
 * linhas da mesma tarefa a composição deixa o MESMO espaço, quinze pontos.
 * Quem decide é a regra da linha cheia (ver {@link lerLista}).
 *
 * Não vai para `porLer` quando não existe: a maior parte das propostas é do
 * modelo Decoração, que não tem cronograma nenhum, e dizer «não se leu o
 * cronograma» em todas elas era ensinar-lhe a ignorar a lista dos campos por
 * ler — que é a lista que ela tem mesmo de ler.
 */
function lerCronograma(ctx: Contexto, campos: CampoProposto[]): void {
  const s = seccao(ctx, "cronograma");
  if (!s) return;
  const perto = (x: number, alvo: number) => Math.abs(x - alvo) <= 4;
  const titulos = s.linhas.filter(
    (l) => perto(l.x, ctx.margem) && l.tamanho >= 11 && l.tamanho < 16,
  );
  const depoisDe = (l: Linha, alvo: Linha) =>
    l.pagina > alvo.pagina || (l.pagina === alvo.pagina && l.y < alvo.y);

  titulos.forEach((titulo, fi) => {
    const seguinte = titulos[fi + 1];
    campos.push(
      novoCampo(
        `cronograma[${fi}].title`,
        titulo.texto,
        "alta",
        "Título de uma fase do cronograma.",
        [titulo],
      ),
    );
    const tarefas = s.linhas.filter(
      (l) =>
        depoisDe(l, titulo) &&
        (!seguinte || !depoisDe(l, seguinte)) &&
        l !== seguinte &&
        l.x > titulo.x + 6 &&
        l.tamanho < 12,
    );
    lerLista(tarefas, { limiteDeQuebra: ctx.largura - ctx.margem }).forEach((it, ii) => {
      campos.push(
        novoCampo(
          `cronograma[${fi}].items[${ii}]`,
          juntarParagrafo(it.linhas),
          it.confianca,
          "Tarefa de uma fase do cronograma.",
          it.linhas,
        ),
      );
    });
  });
}

/** Título, subtítulo e descrição de cada página de inspiração. */
function lerMoodboards(
  ctx: Contexto,
  campos: CampoProposto[],
  porLer: CampoPorLer[],
  paginas: number[],
): void {
  const comLegenda = ctx.seccoes
    .filter((s) => s.nome === "moodboard")
    .map((s) => ({
      pagina: s.cabecalho.pagina,
      linhas: s.linhas.filter((l) => l.pagina === s.cabecalho.pagina),
      legenda: true,
    }));
  const boards = [...comLegenda, ...ctx.moodboardsAMao.map((m) => ({ ...m, legenda: false }))].sort(
    (a, b) => a.pagina - b.pagina,
  );

  if (!boards.length) {
    porLer.push({
      campo: "moodBoards",
      porque:
        "Não há nenhuma página de inspiração neste documento — ou não tem, ou as suas páginas de fotografias não trazem a legenda que as identifica.",
    });
  }
  boards.forEach((b, bi) => {
    paginas.push(b.pagina);
    const naPagina = b.linhas;
    /**
     * ── ONDE ESTÁ O TÍTULO, NUMA FOLHA E NA OUTRA ─────────────────────────
     *
     * Na nossa, por baixo da legenda «Inspiração», em corpo 24: é o primeiro
     * corpo grande da página. Na dela não há legenda nenhuma e o título é
     * simplesmente a MAIOR linha da página — e nem sequer é a primeira: numa
     * das páginas da Mariana o parágrafo de descrição está impresso ACIMA do
     * título, no meio das fotografias.
     */
    const titulo = b.legenda
      ? naPagina.find((l) => l.tamanho >= 18)
      : [...naPagina].sort((x, y) => y.tamanho - x.tamanho || y.y - x.y)[0];
    const confianca: Confianca = b.legenda ? "alta" : "media";
    let sub: Linha | undefined;
    if (titulo) {
      campos.push(
        novoCampo(
          `moodBoards[${bi}].title`,
          titulo.texto,
          confianca,
          b.legenda
            ? "Título da página de inspiração."
            : "Era a maior linha de uma página só com fotografias e uma letra que não aparece em mais nenhum sítio do documento.",
          [titulo],
        ),
      );
      // O subtítulo vem logo por baixo do título. Na folha à mão a folga é
      // maior (47 pontos na página do cocktail da Catarina) porque a
      // composição é feita à vista, não por uma grelha.
      const folga = b.legenda ? 30 : 50;
      sub = naPagina.find(
        (l) =>
          l.y < titulo.y &&
          l.y > titulo.y - folga &&
          l.tamanho >= 11 &&
          (b.legenda ? l.tamanho < 18 : l.tamanho <= titulo.tamanho),
      );
      if (sub) {
        campos.push(
          novoCampo(
            `moodBoards[${bi}].subtitulo`,
            sub.texto,
            confianca,
            "Subtítulo, logo por baixo do título da página.",
            [sub],
          ),
        );
      }
    }
    // O resto do texto da página. Na nossa folha é a descrição, no fundo, por
    // baixo das fotos; na dela pode ser isso ou as legendas soltas que ela
    // escreve ao lado de uma fotografia — que se juntam por ordem de leitura,
    // porque não há maneira de as distinguir umas das outras, e é preferível
    // dar-lhe o texto para apagar do que perdê-lo.
    const resto = b.legenda
      ? naPagina.filter((l) => l.y < 200 && (!titulo || l.y < titulo.y - 60))
      : naPagina.filter((l) => l !== titulo && l !== sub);
    if (resto.length) {
      campos.push(
        novoCampo(
          `moodBoards[${bi}].annotation`,
          juntarParagrafo(resto),
          resto.length > 1 || !b.legenda ? "media" : "alta",
          b.legenda
            ? "Texto no fundo da página de inspiração, por baixo das fotografias."
            : "O resto do texto escrito nesta página de fotografias, por ordem de leitura.",
          resto,
        ),
      );
    }
  });
}

/** Linhas do orçamento, valores adicionais, total, faseamento e as três listas
 *  da coluna da direita. */
function lerOrcamento(
  ctx: Contexto,
  campos: CampoProposto[],
  porLer: CampoPorLer[],
  organizacao: boolean,
): void {
  const s = seccao(ctx, "orcamento");
  if (!s) {
    porLer.push({
      campo: "budgetItems",
      porque:
        "Não se encontrou o quadro do orçamento. Numa folha que não foi gerada por nós, uma lista sem rótulo não se distingue de um parágrafo.",
    });
    for (const [campo, lista] of [
      ["notasImportantes", "Notas importantes"],
      ["incluido", "Incluído na proposta"],
      ["naoIncluido", "Não incluído"],
    ] as const) {
      porLer.push({
        campo,
        porque: `Não se encontrou a rubrica «${lista}» — esta folha não tem a coluna de condições de reserva que o estúdio desenha.`,
      });
    }
    lerTotalDeFolhaDesconhecida(ctx, campos, porLer);
    return;
  }
  // A folha do orçamento tem duas colunas: o quadro à esquerda e as notas de
  // reserva à direita. O quadro tem 430 pontos de largura a partir da margem —
  // tudo o que começa depois disso é a coluna da direita.
  const CORTE = ctx.margem + 460;
  const esquerda = coluna(s.linhas, -Infinity, CORTE);
  // A coluna da direita é ANCORADA NA PRIMEIRA PÁGINA do orçamento — o gerador
  // desenha-a lá, e no topo, independentemente de o quadro da esquerda ter
  // paginado ou não. E começa ACIMA do título «Orçamento Proposto», à altura da
  // legenda: procurá-la dentro da secção (que começa no título) devolvia-a
  // vazia, e as três listas de condições de reserva desapareciam sem uma
  // palavra.
  const direita = coluna(
    ctx.linhas.filter((l) => l.pagina === s.cabecalho.pagina),
    CORTE,
    Infinity,
  );

  // ── O total: o único corpo 22 do documento inteiro ──
  const grande = esquerda
    .flatMap((l) => l.corridas.map((c) => ({ l, c })))
    .find(({ c }) => c.tamanho >= 18);
  let totalTexto: string | null = null;
  if (grande) {
    totalTexto = grande.c.texto;
    campos.push(
      novoCampo(
        organizacao ? "totalEstimatedText" : "totalText",
        totalTexto,
        "alta",
        "É o número grande do orçamento.",
        [comoLinha(grande.l.pagina, grande.c)],
      ),
    );
    /**
     * O rótulo do total NÃO está na mesma linha de base do número.
     *
     * A composição alinha os dois pelo olho e não pela base: o rótulo é corpo
     * 13 e o número corpo 22, e o número é desenhado seis pontos mais abaixo
     * para os dois ficarem a meia altura um do outro. Seis pontos são mais do
     * que a tolerância com que se juntam linhas, portanto são duas linhas — e
     * procurar o rótulo entre as corridas da linha do número devolvia sempre
     * nada, com o `totalLabel` dela a desaparecer em todas as propostas sem
     * valores adicionais.
     */
    const rotulo =
      grande.l.corridas.find((c) => c !== grande.c && c.x < grande.c.x) ??
      esquerda.find(
        (l) =>
          l.pagina === grande.l.pagina &&
          l.y > grande.c.y &&
          l.y <= grande.c.y + 14 &&
          Math.abs(l.x - ctx.margem) <= 4 &&
          l.tamanho >= 11 &&
          l.tamanho < 16,
      )?.corridas[0];
    if (rotulo) {
      // «Total a pagar» é um rótulo NOSSO, que o gerador escreve quando há
      // valores adicionais — nesse caso o `totalLabel` dela não chega a ser
      // impresso e não há nada a recuperar.
      if (chaveDeRotulo(rotulo.texto) === "TOTALAPAGAR") {
        porLer.push({
          campo: "totalLabel",
          porque:
            "Esta proposta tem valores adicionais, e nessas o documento imprime «Total a pagar» em vez do rótulo escrito no estúdio.",
        });
      } else {
        campos.push(
          novoCampo("totalLabel", rotulo.texto, "alta", "Rótulo ao lado do número grande.", [
            comoLinha(grande.l.pagina, rotulo),
          ]),
        );
      }
    }
    const valor = parseMoneyText(totalTexto);
    if (valor > 0) {
      campos.push(
        novoCampo(
          "totalAmount",
          valor,
          "media",
          "Tirado do número impresso — o documento não traz o valor em separado.",
          [comoLinha(grande.l.pagina, grande.c)],
        ),
      );
      campos.push(
        novoCampo(
          "totalVatMode",
          detectVatMode(totalTexto),
          "media",
          detectVatMode(totalTexto) === "acrescer"
            ? "O número diz «+ IVA», portanto o IVA acresce."
            : "O número não diz «+ IVA», portanto assume-se que já o inclui.",
          [comoLinha(grande.l.pagina, grande.c)],
        ),
      );
    }
  }

  // ── As linhas do quadro ──
  // São as linhas avançadas em relação à margem, acima do total, com um corpo
  // de texto corrido.
  const acimaDoTotal = (l: Linha) =>
    !grande || l.pagina < grande.l.pagina || (l.pagina === grande.l.pagina && l.y > grande.c.y);
  const cabecalhoDoQuadro = esquerda.find((l) => l.corridas.some((c) => eRotulo(c.texto, "Item")));
  const abaixoDoCabecalho = (l: Linha) =>
    !cabecalhoDoQuadro ||
    l.pagina > cabecalhoDoQuadro.pagina ||
    (l.pagina === cabecalhoDoQuadro.pagina && l.y < cabecalhoDoQuadro.y);

  /**
   * ── O CORPO DAS LINHAS DO QUADRO ─────────────────────────────────────────
   *
   * Na nossa folha é entre 9 e 12: o número grande é 22 e as rubricas da
   * direita são 13, e a banda serve para os deixar de fora. Numa folha feita à
   * mão o quadro inteiro está no mesmo corpo 8 do resto do documento, e a banda
   * deitava fora as três linhas do orçamento da Mariana e as cinco da Catarina
   * — o quadro todo. Aí a referência é o cabeçalho da secção: o que é do quadro
   * é o que não é maior do que ele.
   */
  const corpoDoQuadro = (l: Linha) =>
    grande ? l.tamanho > 9 && l.tamanho < 12 : l.tamanho <= s.cabecalho.tamanho + 0.6;
  const candidatas = esquerda.filter(
    (l) => acimaDoTotal(l) && abaixoDoCabecalho(l) && corpoDoQuadro(l),
  );
  // As linhas do quadro estão avançadas (levam marca); os valores adicionais e
  // o subtotal encostam à margem.
  const avancadas = candidatas.filter((l) => l.x > ctx.margem + 6);
  const aMargem = candidatas.filter((l) => l.x <= ctx.margem + 6);

  // O SUBTOTAL parte a folha em duas: o que está acima dele são as linhas do
  // quadro, o que está abaixo são os valores adicionais. É a estrutura da
  // proposta feita à mão, e é a mesma nos dois modelos.
  const subtotal = aMargem.find((l) =>
    l.corridas.some((c) => ROTULOS_DE_TOTAL.some((r) => eRotulo(c.texto, r))),
  );
  const antesDoSubtotal = (l: Linha) =>
    !subtotal || l.pagina < subtotal.pagina || (l.pagina === subtotal.pagina && l.y > subtotal.y);

  /**
   * ── O TOTAL DE UM QUADRO FEITO À MÃO ─────────────────────────────────────
   *
   * Sem número em corpo 22 não há «o número grande»: o total é a linha que diz
   * «Valor Total» com «7890 € + Iva» à direita, exactamente como se escreve um
   * total desde que há folhas de orçamento. É o mesmo caminho que já se usava
   * quando não havia folha de orçamento nenhuma — aqui está dentro da secção,
   * o que é uma garantia a mais, mas a confiança fica na mesma em média: o
   * rótulo bate certo, a folha é que não é a nossa.
   */
  const aMao = !grande ? (subtotal ? totalDaLinha(subtotal) : null) : null;
  if (!grande) {
    if (aMao && subtotal) {
      guardarTotal(
        subtotal,
        aMao,
        campos,
        organizacao,
        "Estava à direita de «%s», na mesma linha.",
      );
    } else {
      porLer.push({
        campo: "totalText",
        porque: "Não há nenhum valor em destaque na folha do orçamento.",
      });
    }
  }

  /**
   * ── ONDE ESTÃO AS LINHAS DO QUADRO, NUM MODELO E NO OUTRO ────────────────
   *
   * No modelo Decoração cada linha leva uma marca e está AVANÇADA em relação à
   * margem. No modelo Organização não há marca — há um nome à esquerda e um
   * preço à direita —, e as linhas encostam à margem, exactamente como os
   * valores adicionais. O que as separa desses é a posição na folha: as do
   * quadro estão acima do subtotal, os adicionais abaixo.
   *
   * Procurar as linhas avançadas nos dois modelos devolvia zero linhas numa
   * proposta de Organização inteira — o quadro do orçamento desaparecia sem uma
   * palavra, e era o único sítio do documento onde estavam os preços.
   */
  /**
   * ── E O QUADRO DA DECORAÇÃO TAMBÉM DEIXOU DE TER MARCA ───────────────────
   *
   * O parágrafo acima descreve o que era verdade até a folha do orçamento ser
   * refeita à imagem da proposta feita à mão: no modelo Decoração cada linha
   * levava um pontinho e estava avançada. Deixou de levar — na folha dela as
   * rubricas do quadro são nomes encostados à margem, debaixo do cabeçalho
   * «Item / Preço (€)», exactamente como no modelo Organização.
   *
   * Um PDF gerado antes dessa mudança continua a ter as linhas avançadas, e
   * continua a ter de se ler: por isso as marcadas ficam como RECURSO, e não
   * como alternativa. Primeiro procura-se à margem — que é onde elas estão
   * hoje, nos dois modelos e nas folhas à mão —, e só um quadro vazio faz
   * voltar atrás.
   */
  const aMargemDoQuadro = aMargem.filter(antesDoSubtotal);
  const quadro = organizacao || !grande || aMargemDoQuadro.length ? aMargemDoQuadro : avancadas;

  /**
   * O `budgetOpcional` é um array PARALELO ao `budgetItems`: o índice `i` de um
   * é o índice `i` do outro. Um array paralelo não pode ter buracos — e teria,
   * se só se anotassem as linhas marcadas: uma proposta com a terceira linha
   * assinalada devolvia `budgetOpcional` com o índice 2 preenchido e mais nada,
   * e a montagem do documento, que fecha os buracos das listas (ver
   * `documentoDeCampos`), compactava-o para `[true]` — a marca a saltar da
   * terceira linha para a primeira.
   *
   * Ou se anotam todas, ou nenhuma. Numa proposta sem marca nenhuma não se
   * escreve o campo, que é exactamente o que uma proposta sem extras é.
   */
  /**
   * ── NUM QUADRO, UMA LINHA É UMA LINHA ────────────────────────────────────
   *
   * O quadro do nosso orçamento parte os nomes compridos e deixa cinco pontos
   * a mais entre linhas — daí a medida saber onde acaba cada uma. O quadro
   * dela não parte nada: são cinco nomes curtos, um por linha, e o espaço
   * entre eles é o que a mão dela deu (17, 17, 17 e 13 pontos na proposta da
   * Catarina). Com a medida a mandar, os últimos dois colavam-se num só —
   * «Design Floral e Decoração Mesas Complementos dos Noivos», uma linha de
   * orçamento a menos, com ar de lida.
   *
   * Num quadro com «Item» e «Preço (€)» impressos por cima, uma linha é uma
   * linha. Se alguma vier partida, ela junta-a com o cursor; ao contrário,
   * perdia-se uma rubrica inteira sem dar por isso.
   */
  const linhasDoQuadro = grande
    ? lerLista(quadro)
    : quadro.map((l) => ({ linhas: [l], confianca: "alta" as Confianca }));
  const haMarcas = linhasDoQuadro.some((it) =>
    it.linhas[0].corridas.some((c) => chaveDeRotulo(c.texto) === "EXTRA"),
  );
  linhasDoQuadro.forEach((it, i) => {
    // A marca «extra», quando existe, está encostada à direita do quadro e não
    // faz parte do nome da linha.
    const marca = it.linhas[0].corridas.find((c) => chaveDeRotulo(c.texto) === "EXTRA");
    // O preço fica na mesma linha, encostado à direita do quadro — e não faz
    // parte do NOME da linha. Sem o tirar, o modelo Organização devolvia
    // «Coordenação no dia 1.500,00 €» como nome do serviço.
    const preco =
      organizacao && it.linhas[0].corridas.length > 1
        ? it.linhas[0].corridas[it.linhas[0].corridas.length - 1]
        : undefined;
    const corridasDoNome = it.linhas.flatMap((l) =>
      l.corridas.filter((c) => c !== marca && c !== preco),
    );
    const nome = corridasDoNome
      .map((c) => c.texto)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!nome) return;
    if (organizacao) {
      campos.push(
        novoCampo(
          `budgetRows[${i}].item`,
          nome,
          it.confianca,
          "Linha do quadro do orçamento.",
          it.linhas,
        ),
      );
      if (preco) {
        campos.push(
          novoCampo(`budgetRows[${i}].price`, preco.texto, "alta", "Valor à direita da linha.", [
            comoLinha(it.linhas[0].pagina, preco),
          ]),
        );
      }
    } else {
      campos.push(
        novoCampo(
          `budgetItems[${i}]`,
          nome,
          it.confianca,
          "Linha do quadro do orçamento.",
          it.linhas,
        ),
      );
      if (haMarcas) {
        campos.push(
          novoCampo(
            `budgetOpcional[${i}]`,
            !!marca,
            "alta",
            marca
              ? "A linha estava assinalada com «extra»."
              : "A linha NÃO estava assinalada com «extra», e nesta proposta há linhas que estão.",
            marca ? [comoLinha(it.linhas[0].pagina, marca)] : it.linhas,
          ),
        );
      }
    }
  });

  // ── Os valores adicionais ──
  // Ficam entre a linha do subtotal («Valor Total») e o número grande, encostados
  // à margem, cada um com o seu valor à direita — e com o «+ IVA» de cada um,
  // que é dela para dizer e não uma conta nossa.
  const extras = subtotal ? aMargem.filter((l) => !antesDoSubtotal(l) && l !== subtotal) : [];
  lerLista(extras).forEach((it, i) => {
    const valor = it.linhas[0].corridas[it.linhas[0].corridas.length - 1];
    const rotuloCorridas = it.linhas.flatMap((l) =>
      l.corridas.filter((c) => c !== valor || l.corridas.length === 1),
    );
    const rotulo = rotuloCorridas
      .map((c) => c.texto)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!rotulo || it.linhas[0].corridas.length < 2) return;
    campos.push(
      novoCampo(
        `budgetExtras[${i}].label`,
        rotulo,
        it.confianca,
        "Valor adicional, por baixo do subtotal.",
        it.linhas,
      ),
    );
    campos.push(
      novoCampo(
        `budgetExtras[${i}].valueText`,
        valor.texto,
        "alta",
        // O «+ Iva» de cada linha vai TAL E QUAL dentro do texto do valor, e é
        // de propósito: é dali que `modoDeIvaDaLinha` (proposal-budget.ts) lê o
        // regime de cada adicional. Na proposta da Mariana a coordenação diz
        // «950,50€ +Iva» e a deslocação diz «250,00 €» — duas linhas seguidas,
        // dois regimes diferentes, e é ela que os escreveu assim.
        "Valor tal como estava escrito, com o «+ IVA» ou sem ele.",
        [comoLinha(it.linhas[0].pagina, valor)],
      ),
    );
  });

  // ── A percentagem do sinal ──
  const sinal = esquerda
    .map((l) => ({ l, m: /^Sinal\s+(\d{1,2})\s*%/.exec(l.texto) }))
    .find((x) => x.m);
  if (sinal?.m) {
    campos.push(
      novoCampo(
        "depositPercent",
        Number(sinal.m[1]),
        "alta",
        "Estava na linha do sinal, no faseamento do pagamento.",
        [sinal.l],
      ),
    );
  }

  // ── A nota do orçamento ──
  const nota = esquerda.find((l) => /^Nota:\s/.test(l.texto));
  if (nota) {
    const corpo = [
      nota,
      ...seguimentoAbaixo(esquerda, nota, { passoMaximo: 16, tamanho: nota.tamanho }),
    ];
    campos.push(
      novoCampo(
        "budgetNote",
        juntarParagrafo(corpo).replace(/^Nota:\s*/, ""),
        corpo.length > 1 ? "media" : "alta",
        "Estava depois de «Nota:», no fim do orçamento.",
        corpo,
      ),
    );
  }

  /**
   * ── AS TRÊS LISTAS DE RESERVA, NUM SÍTIO OU NO OUTRO ─────────────────────
   *
   * Na nossa folha são rubricas da coluna da direita do orçamento. Na dela são
   * secções com o seu próprio cabeçalho («INCLUÍDO NA PROPOSTA:», «NÃO
   * INCLUÍDO NO ORÇAMENTO:»), às vezes numa página a seguir. Quando a secção
   * existe é ela que manda: procurar a rubrica numa coluna da direita que não
   * existe devolvia sempre «não se encontrou».
   */
  for (const [rubrica, campo, nome] of [
    ["Notas importantes", "notasImportantes", "notas"],
    ["Incluído na proposta", "incluido", "incluido"],
    ["Não incluído", "naoIncluido", "naoIncluido"],
  ] as const) {
    if (seccao(ctx, nome)) lerListaDeSeccao(ctx, nome, campo, campos, porLer, {});
    else lerListaComRubrica(direita, rubrica, campo, campos, porLer);
  }
}

/** Os rótulos com que um total se escreve numa folha de orçamento. */
const ROTULOS_DE_TOTAL = [
  "Valor Total",
  "Total",
  "Total Geral",
  "Valor Total Decoração",
  "Valor Total Estimado",
  "Investimento Total",
];

/** Um total escrito numa linha só: o rótulo à esquerda, o valor à direita. */
function totalDaLinha(l: Linha): { rotulo: Corrida; valor: Corrida; montante: number } | null {
  for (const [i, c] of l.corridas.entries()) {
    if (!ROTULOS_DE_TOTAL.some((r) => eRotulo(c.texto, r))) continue;
    const valor = l.corridas[i + 1];
    if (!valor || valor.x <= c.x2) continue;
    const montante = parseMoneyText(valor.texto);
    if (montante <= 0) continue;
    return { rotulo: c, valor, montante };
  }
  return null;
}

/** Guarda os quatro campos de um total lido numa linha de rótulo e valor.
 *  `porque` leva um `%s` no sítio do rótulo que estava impresso. */
function guardarTotal(
  l: Linha,
  achado: { rotulo: Corrida; valor: Corrida; montante: number },
  campos: CampoProposto[],
  organizacao: boolean,
  porque: string,
): void {
  const origem = [comoLinha(l.pagina, achado.valor)];
  const modo = detectVatMode(achado.valor.texto);
  campos.push(
    novoCampo(
      organizacao ? "totalEstimatedText" : "totalText",
      achado.valor.texto,
      "media",
      porque.replace("%s", achado.rotulo.texto),
      origem,
    ),
  );
  campos.push(
    novoCampo("totalLabel", achado.rotulo.texto, "media", "Rótulo à esquerda do valor.", [
      comoLinha(l.pagina, achado.rotulo),
    ]),
  );
  campos.push(
    novoCampo("totalAmount", achado.montante, "media", "Tirado do número impresso.", origem),
  );
  campos.push(
    novoCampo(
      "totalVatMode",
      modo,
      "media",
      modo === "acrescer"
        ? "O número diz «+ IVA», portanto o IVA acresce."
        : "O número não diz «+ IVA», portanto assume-se que já o inclui.",
      origem,
    ),
  );
}

/**
 * O total de uma folha que não foi gerada por nós.
 *
 * Num Word ou num Canva não há cabeçalho «Orçamento Proposto» nem número em
 * corpo 22 — há uma linha com um rótulo à esquerda e um valor à direita, que é
 * como se escreve um total desde que há folhas de orçamento. Procura-se por
 * RÓTULO, e o rótulo tem de estar impresso: nunca «o maior número da folha»,
 * que numa proposta é quase sempre o número de telefone ou um NIF.
 *
 * Confiança média, sempre: o rótulo bate certo, o sítio não se conhece.
 */
function lerTotalDeFolhaDesconhecida(
  ctx: Contexto,
  campos: CampoProposto[],
  porLer: CampoPorLer[],
): void {
  for (const l of ctx.linhas) {
    const achado = totalDaLinha(l);
    if (!achado) continue;
    guardarTotal(l, achado, campos, false, "Estava à direita de «%s», na mesma linha.");
    return;
  }
  porLer.push({
    campo: "totalText",
    porque: "Não há nenhuma linha com um rótulo de total e um valor ao lado.",
  });
}

/** Uma lista com uma rubrica por cima, na coluna da direita do orçamento. */
function lerListaComRubrica(
  linhas: readonly Linha[],
  rubrica: string,
  campo: string,
  campos: CampoProposto[],
  porLer: CampoPorLer[],
): void {
  // Pelo TEXTO INTEIRO da linha, e não «uma corrida só que seja o rótulo»: uma
  // legenda desenhada letra a letra pode chegar partida em duas corridas, e a
  // linha inteira continua a dizer exactamente o rótulo. Uma linha com o rótulo
  // MAIS outra coisa qualquer não bate certo, que é a garantia que interessa.
  const iRubrica = linhas.findIndex((l) => eRotulo(l.texto, rubrica));
  if (iRubrica < 0) {
    porLer.push({ campo, porque: `Não se encontrou a rubrica «${rubrica}».` });
    return;
  }
  const rubricaLinha = linhas[iRubrica];
  const seguintes: Linha[] = [];
  for (const l of linhas.slice(iRubrica + 1)) {
    if (l.pagina !== rubricaLinha.pagina) break;
    // ── O QUE FECHA UMA RUBRICA É O RECUO, NÃO O TAMANHO ──────────────────
    // Tentou-se pelo corpo da letra e não funciona: «Notas importantes» é
    // corpo 13 com itens de 8,5 por baixo, mas «Incluído na proposta» é uma
    // legenda de 7,5 com itens MAIORES do que ela. O que as três têm em comum
    // é o alinhamento: a rubrica encosta à coluna e os seus itens estão
    // avançados, para caber a marca. A rubrica seguinte volta a encostar.
    if (l.x <= rubricaLinha.x + 4) break;
    seguintes.push(l);
  }
  const itens = lerLista(seguintes);
  if (!itens.length) {
    porLer.push({ campo, porque: `A rubrica «${rubrica}» não tem nenhuma linha por baixo.` });
    return;
  }
  itens.forEach((it, i) => {
    campos.push(
      novoCampo(
        `${campo}[${i}]`,
        juntarItem(it.linhas),
        it.confianca,
        `Item da lista «${rubrica}».`,
        it.linhas,
      ),
    );
  });
}

/** Uma lista que ocupa uma secção inteira (condições, observações, faseamento,
 *  cancelamento). */
function lerListaDeSeccao(
  ctx: Contexto,
  nome: string,
  campo: string,
  campos: CampoProposto[],
  porLer: CampoPorLer[],
  opcoes: { duasColunas?: boolean },
): void {
  const todas = seccoesComNome(ctx, nome);
  const s = todas[0];
  if (!s) {
    porLer.push({ campo, porque: `Não se encontrou a secção correspondente no documento.` });
    return;
  }
  /**
   * ── O QUE É LISTA E O QUE É CABEÇALHO ────────────────────────────────────
   *
   * Na nossa folha o cabeçalho é corpo 13 ou 20 e a lista é 9: exigir um corpo
   * MENOR do que o do cabeçalho tirava do caminho tudo o que não era lista.
   * Numa folha à mão o cabeçalho está no mesmo corpo 8 da lista — «CONDIÇÕES
   * GERAIS:» é uma linha em capitulares do tamanho do texto —, e a mesma
   * exigência deixava as seis condições da Mariana de fora, todas. O que fecha
   * a lista é o cabeçalho SEGUINTE, e disso já trata a divisão em secções.
   */
  const uteis = todas.flatMap((sec) =>
    sec.linhas.filter((l) => l.tamanho <= sec.cabecalho.tamanho + 0.6),
  );

  let ordenadas: Linha[];
  if (opcoes.duasColunas) {
    // ── DUAS COLUNAS PARTILHAM A LINHA DE BASE ────────────────────────────
    // Na página das condições, o primeiro parágrafo da esquerda e o primeiro da
    // direita são desenhados à mesma altura. Lidos como uma linha só, saía uma
    // condição com metade de duas. Lê-se cada coluna inteira, e por páginas: é
    // essa a ordem por que a página foi composta e é a ordem em que ela as
    // escreveu.
    const xs = uteis.flatMap((l) => l.corridas.map((c) => arred(c.x)));
    const esquerdaX = Math.min(...xs);
    const direitaX = maisComum(xs.filter((x) => x > esquerdaX + 100));
    const corte =
      Number.isFinite(direitaX) && direitaX > esquerdaX + 100 ? direitaX - 10 : Infinity;
    ordenadas = [];
    for (const pagina of [...new Set(uteis.map((l) => l.pagina))].sort((a, b) => a - b)) {
      const daPagina = uteis.filter((l) => l.pagina === pagina);
      ordenadas.push(...coluna(daPagina, -Infinity, corte), ...coluna(daPagina, corte, Infinity));
    }
  } else {
    ordenadas = uteis;
  }
  if (!ordenadas.length) {
    porLer.push({ campo, porque: "A secção existe mas está vazia." });
    return;
  }
  lerLista(ordenadas).forEach((it, i) => {
    campos.push(
      novoCampo(
        `${campo}[${i}]`,
        juntarItem(it.linhas),
        it.confianca,
        "Item da lista desta secção.",
        it.linhas,
      ),
    );
  });
}

/** «Esta proposta é válida até 10 de out. de 2026.» */
function lerValidade(ctx: Contexto, campos: CampoProposto[], porLer: CampoPorLer[]): void {
  const s = seccao(ctx, "proximos");
  const onde = s ? s.linhas : ctx.linhas;
  const re = /v[áa]lida at[ée]\s+(\d{1,2})\s+de\s+([a-zç]{3,10})\.?\s+de\s+(\d{4})/i;
  for (const l of onde) {
    const m = re.exec(l.texto);
    if (!m) continue;
    const mes = MESES_CURTOS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mes < 0) continue;
    const iso = `${m[3]}-${String(mes + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
    campos.push(
      novoCampo("validUntil", iso, "alta", "Estava escrito em «Esta proposta é válida até …».", [
        l,
      ]),
    );
    return;
  }
  /**
   * ── UMA VALIDADE EM DIAS NÃO É UMA DATA ──────────────────────────────────
   *
   * O nosso documento imprime a data («válida até 10 de out. de 2026») porque
   * a sabe: é a data do envio mais os dias. A folha à mão imprime o PRAZO —
   * «ESTA PROPOSTA É VÁLIDA POR 60 DIAS» — e transformá-lo numa data era
   * inventar um dia de envio que não está escrito em lado nenhum. O
   * `ProposalDoc` tem os dois campos, e este é o outro.
   */
  const porDias = /v[áa]lida\s+por\s+(\d{1,3})\s+dias?/i;
  for (const l of onde) {
    const m = porDias.exec(l.texto);
    if (!m) continue;
    campos.push(
      novoCampo(
        "validUntilDays",
        Number(m[1]),
        "media",
        "A folha diz por quantos DIAS a proposta é válida, não até que data — a data depende do dia em que for enviada.",
        [l],
      ),
    );
    return;
  }
  porLer.push({
    campo: "validUntil",
    porque: "Não se encontrou nenhuma frase a dizer até quando a proposta é válida.",
  });
}

/**
 * A percentagem do sinal, escrita no faseamento de uma folha feita à mão.
 *
 * O nosso orçamento imprime «Sinal 30% 2.911,41 €» e é lá que ela é lida. As
 * folhas à mão não têm essa linha: têm o faseamento em lista — «30% NA
 * ADJUDICAÇÃO;», «7O% 1 MÊS ANTES;». A adjudicação é o sinal, e essa
 * percentagem não é decorativa: é a mesma que as rotas de facturação usam para
 * emitir a factura do sinal.
 *
 * Só corre quando o orçamento não a deu, e nunca com confiança alta — quem
 * escreveu a lista podia ter escrito as duas percentagens por outra ordem.
 */
function lerSinalDoFaseamento(ctx: Contexto, campos: CampoProposto[]): void {
  if (campos.some((c) => c.campo === "depositPercent")) return;
  const s = seccao(ctx, "faseamento");
  if (!s) return;
  for (const l of s.linhas) {
    const m = /^[\s•▪◦‣●○]*(\d{1,2})\s*%\s+NA\s+ADJUDICA/i.exec(l.texto);
    if (!m) continue;
    campos.push(
      novoCampo(
        "depositPercent",
        Number(m[1]),
        "media",
        "Era a percentagem que a lista do faseamento diz pagar-se na adjudicação.",
        [l],
      ),
    );
    return;
  }
}

/** O valor que mais vezes aparece — usado para descobrir avanços e colunas a
 *  partir do próprio documento, em vez de os ter escritos aqui. */
function maisComum(valores: readonly number[]): number {
  const contagem = new Map<number, number>();
  for (const v of valores) contagem.set(v, (contagem.get(v) ?? 0) + 1);
  let melhor = Number.NaN;
  let quantas = 0;
  for (const [v, n] of contagem) {
    if (n > quantas || (n === quantas && v < melhor)) {
      melhor = v;
      quantas = n;
    }
  }
  return melhor;
}
