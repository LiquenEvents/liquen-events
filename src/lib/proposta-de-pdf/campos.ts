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
  eRotulo,
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

  const ctx: Contexto = {
    paginas: [...paginas],
    linhas: doCorpo,
    seccoes: [],
    margem,
    largura,
    negra: null,
  };
  ctx.seccoes = seccoesDo(ctx);
  ctx.negra = fonteNegra(ctx);

  // ── O que se lê fora de qualquer secção ──
  lerRef(ctx, linhas, campos, porLer);
  const template = lerTemplate(ctx, campos);

  // ── Secção a secção ──
  lerApresentacao(ctx, campos, porLer);
  lerServicos(ctx, campos, porLer);
  lerCronograma(ctx, campos);
  lerMoodboards(ctx, campos, porLer, paginasDeMoodboard);
  lerOrcamento(ctx, campos, porLer, template === "organizacao");
  lerListaDeSeccao(ctx, "condicoes", "condicoesGerais", campos, porLer, { duasColunas: true });
  lerListaDeSeccao(ctx, "observacoes", "observacoesGerais", campos, porLer, {});
  lerListaDeSeccao(ctx, "faseamento", "faseamento", campos, porLer, {});
  lerListaDeSeccao(ctx, "cancelamento", "cancelamento", campos, porLer, {});
  lerValidade(ctx, campos, porLer);

  return { campos, porLer, paginasDeMoodboard, template };
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
      texto: dentro.map((c) => c.texto).join(" "),
      x: dentro[0].x,
      x2: Math.max(...dentro.map((c) => c.x2)),
      tamanho: dentro.reduce((a, b) => (b.x2 - b.x > a.x2 - a.x ? b : a)).tamanho,
    });
  }
  return out;
}

/** Divide o documento em secções pelos seus cabeçalhos. */
function seccoesDo(ctx: Contexto): Seccao[] {
  const perto = (x: number) => Math.abs(x - ctx.margem) <= 4;
  const cabecalhos: { nome: string; linha: Linha }[] = [];
  for (const l of ctx.linhas) {
    if (!perto(l.x)) continue;
    const chave = chaveDeRotulo(l.texto);
    if (l.tamanho >= 16) {
      const nome = Object.entries(SECCOES_GRANDES).find(([t]) => chaveDeRotulo(t) === chave)?.[1];
      if (nome) cabecalhos.push({ nome, linha: l });
    } else if (l.tamanho >= 11 && l.tamanho < 16) {
      // O corpo 13 também é o dos títulos de grupo dos serviços e o das duas
      // rubricas da coluna da direita do orçamento: só entra o que estiver no
      // vocabulário, e só à margem.
      const nome = Object.entries(SECCOES_PEQUENAS).find(([t]) => chaveDeRotulo(t) === chave)?.[1];
      if (nome) cabecalhos.push({ nome, linha: l });
    } else if (chave === "INSPIRACAO") {
      // A página de mood board não tem cabeçalho grande — tem a legenda
      // «Inspiração» e, por baixo dela, o título do board em corpo 24.
      cabecalhos.push({ nome: "moodboard", linha: l });
    }
  }
  cabecalhos.sort((a, b) => a.linha.pagina - b.linha.pagina || b.linha.y - a.linha.y);

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
      if (!eRotulo(c.texto, rotulo)) continue;

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
      const primeira = abaixo.find((v) => v.tamanho > c.tamanho + 1);
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
      if (aoLado && aoLado.x > c.x2) {
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

  const itens: { linhas: Linha[]; confianca: Confianca }[] = [];
  for (const [i, l] of linhas.entries()) {
    const mesmoFluxo = i > 0 && linhas[i - 1].pagina === l.pagina && linhas[i - 1].y > l.y;
    const salto = i === 0 ? Infinity : arred(linhas[i - 1].y - l.y);
    let continua = false;
    if (mesmoFluxo) {
      if (bimodal) continua = salto < limiar;
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
      if (!bimodal) anterior.confianca = "media";
    } else {
      itens.push({ linhas: [l], confianca: "alta" });
    }
  }
  return itens;
}

/* ═══════════════════════════════════════════════════════════════════════════
   OS CAMPOS, UM A UM
   ═══════════════════════════════════════════════════════════════════════════ */

/** A referência que corre no topo de todas as páginas de conteúdo. */
function lerRef(
  ctx: Contexto,
  todas: readonly Linha[],
  campos: CampoProposto[],
  porLer: CampoPorLer[],
): void {
  const altura = ctx.paginas[0]?.altura || 595.28;
  const noTopo = todas.filter((l) => l.y >= altura - 80 && l.tamanho <= 10);
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
    return;
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

  const faixa: [string, string][] = [
    ["Evento", "eventType"],
    ["Data", "eventDate"],
    ["Local", "location"],
    ["Convidados", "guests"],
    ["Cerimónia", "ceremony"],
    ["Hora", "time"],
    ["Wedding Planners", "weddingPlanners"],
  ];
  for (const [rotulo, campo] of faixa) {
    const bruto = valorDoRotulo(onde, rotulo, { passoMaximo: 20, maxLinhas: 2 });
    const a = bruto ? grau(bruto) : null;
    if (a) campos.push(novoCampo(campo, a.texto, a.confianca, a.porque, a.linhas));
    else porLer.push({ campo, porque: `Não há nenhum rótulo «${rotulo}» nesta proposta.` });
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
  const titulos = s.linhas.filter(
    (l) => perto(l.x, ctx.margem) && l.tamanho >= 11 && l.tamanho < 16,
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
    const doItem = candidatas.filter((l) => perto(l.x, avanco));

    // O limite da mancha: as descrições correm até à margem direita da página.
    const itens = lerLista(doItem, { limiteDeQuebra: ctx.largura - ctx.margem });
    itens.forEach((it, ii) => {
      const texto = juntarParagrafo(it.linhas);
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
  const boards = ctx.seccoes.filter((s) => s.nome === "moodboard");
  if (!boards.length) {
    porLer.push({
      campo: "moodBoards",
      porque:
        "Não há nenhuma página de inspiração neste documento — ou não tem, ou as suas páginas de fotografias não trazem a legenda que as identifica.",
    });
  }
  boards.forEach((s, bi) => {
    paginas.push(s.cabecalho.pagina);
    const naPagina = s.linhas.filter((l) => l.pagina === s.cabecalho.pagina);
    // O título é o primeiro corpo grande por baixo da legenda «Inspiração».
    const titulo = naPagina.find((l) => l.tamanho >= 18);
    if (titulo) {
      campos.push(
        novoCampo(
          `moodBoards[${bi}].title`,
          titulo.texto,
          "alta",
          "Título da página de inspiração.",
          [titulo],
        ),
      );
      const sub = naPagina.find(
        (l) => l.y < titulo.y && l.y > titulo.y - 30 && l.tamanho >= 11 && l.tamanho < 18,
      );
      if (sub) {
        campos.push(
          novoCampo(
            `moodBoards[${bi}].subtitulo`,
            sub.texto,
            "alta",
            "Subtítulo, logo por baixo do título da página.",
            [sub],
          ),
        );
      }
    }
    // A descrição vive no fundo da página, por baixo das fotos.
    const rodape = naPagina.filter((l) => l.y < 200 && (!titulo || l.y < titulo.y - 60));
    if (rodape.length) {
      campos.push(
        novoCampo(
          `moodBoards[${bi}].annotation`,
          juntarParagrafo(rodape),
          rodape.length > 1 ? "media" : "alta",
          "Texto no fundo da página de inspiração, por baixo das fotografias.",
          rodape,
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
  } else {
    porLer.push({
      campo: "totalText",
      porque: "Não há nenhum valor em destaque na folha do orçamento.",
    });
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

  const candidatas = esquerda.filter(
    (l) => acimaDoTotal(l) && abaixoDoCabecalho(l) && l.tamanho > 9 && l.tamanho < 12,
  );
  // As linhas do quadro estão avançadas (levam marca); os valores adicionais e
  // o subtotal encostam à margem.
  const avancadas = candidatas.filter((l) => l.x > ctx.margem + 6);
  const aMargem = candidatas.filter((l) => l.x <= ctx.margem + 6);

  // O SUBTOTAL parte a folha em duas: o que está acima dele são as linhas do
  // quadro, o que está abaixo são os valores adicionais. É a estrutura da
  // proposta feita à mão, e é a mesma nos dois modelos.
  const subtotal = aMargem.find((l) =>
    l.corridas.some(
      (c) => eRotulo(c.texto, "Valor Total") || eRotulo(c.texto, "Valor Total Estimado"),
    ),
  );
  const antesDoSubtotal = (l: Linha) =>
    !subtotal || l.pagina < subtotal.pagina || (l.pagina === subtotal.pagina && l.y > subtotal.y);

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
  const quadro = organizacao ? aMargem.filter(antesDoSubtotal) : avancadas;

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
  const linhasDoQuadro = lerLista(quadro);
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

  // ── As três listas da coluna da direita ──
  lerListaComRubrica(direita, "Notas importantes", "notasImportantes", campos, porLer);
  lerListaComRubrica(direita, "Incluído na proposta", "incluido", campos, porLer);
  lerListaComRubrica(direita, "Não incluído", "naoIncluido", campos, porLer);
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
  const ROTULOS = [
    "Valor Total",
    "Total",
    "Total Geral",
    "Valor Total Decoração",
    "Investimento Total",
  ];
  for (const l of ctx.linhas) {
    for (const [i, c] of l.corridas.entries()) {
      if (!ROTULOS.some((r) => eRotulo(c.texto, r))) continue;
      const valor = l.corridas[i + 1];
      if (!valor || valor.x <= c.x2) continue;
      const montante = parseMoneyText(valor.texto);
      if (montante <= 0) continue;
      const origem = [comoLinha(l.pagina, valor)];
      campos.push(
        novoCampo(
          "totalText",
          valor.texto,
          "media",
          `Estava à direita de «${c.texto}», na mesma linha.`,
          origem,
        ),
      );
      campos.push(
        novoCampo("totalLabel", c.texto, "media", "Rótulo à esquerda do valor.", [
          comoLinha(l.pagina, c),
        ]),
      );
      campos.push(
        novoCampo("totalAmount", montante, "media", "Tirado do número impresso.", origem),
      );
      campos.push(
        novoCampo(
          "totalVatMode",
          detectVatMode(valor.texto),
          "media",
          detectVatMode(valor.texto) === "acrescer"
            ? "O número diz «+ IVA», portanto o IVA acresce."
            : "O número não diz «+ IVA», portanto assume-se que já o inclui.",
          origem,
        ),
      );
      return;
    }
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
        juntarParagrafo(it.linhas),
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
  const s = seccao(ctx, nome);
  if (!s) {
    porLer.push({ campo, porque: `Não se encontrou a secção correspondente no documento.` });
    return;
  }
  // As linhas da lista estão avançadas em relação à margem (a marca fica no
  // espaço do avanço).
  const uteis = s.linhas.filter((l) => l.tamanho < s.cabecalho.tamanho - 1);

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
        juntarParagrafo(it.linhas),
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
  porLer.push({
    campo: "validUntil",
    porque: "Não se encontrou nenhuma frase a dizer até quando a proposta é válida.",
  });
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
