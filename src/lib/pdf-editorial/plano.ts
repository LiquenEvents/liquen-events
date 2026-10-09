import { depositPercentOf, type MoodBoard, type ProposalDoc } from "@/lib/proposal-doc";
import { blocosFixosNaLingua, textosDaProposta } from "@/lib/proposal-doc-textos";
import { totaisDaProposta } from "@/lib/proposal-budget";
import { chaveDeRubrica, ordemDeSaida } from "@/lib/proposal-ordem";
import { agrupar, grupoDoTema, type Grupo } from "./grupos";
import { MAXIMO_POR_PAGINA, repartir as repartirFotos } from "./mosaico";
import { textosEditoriais } from "./textos";

export { MAXIMO_POR_PAGINA };

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AS PÁGINAS DO PDF NOVO, SEM DESENHAR O PDF
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A mesma sequência de `montar.ts` — capa, índice, a proposta, o que propomos,
 * paleta e ambiente, os capítulos de inspiração com os seus temas, a citação,
 * o investimento, as condições e a contracapa —, calculada só a partir do
 * documento, sem fotografias e sem letras. É o que o estúdio usa para contar
 * as páginas («PDF com cerca de N»), para a «Vista de conjunto» e para o
 * painel «O que vai sair»: as três passam a mostrar as páginas do desenho
 * NOVO, e não as do antigo.
 *
 * Puro de propósito: corre no navegador, sem `pdf-lib` e sem `sharp`.
 *
 * ── O QUE É EXACTO E O QUE É ESTIMADO ─────────────────────────────────────
 * Exacto: que páginas existem, por que ordem, os capítulos, quantas páginas
 * leva cada tema e que fotografias vão em cada uma. São as MESMAS funções do
 * gerador (`ordemDeSaida`, `agrupar`, `grupoDoTema`, `repartir`,
 * `ordemDoDesenho`), e um teste prende a paridade contra o PDF desenhado.
 *
 * Estimado: as páginas que se partem pelo comprimento do TEXTO — o quadro do
 * orçamento e as condições. Partir texto pede as larguras das letras, que só o
 * servidor tem; aqui conta-se por caracteres, com as medidas das colunas do
 * gerador. Uma condição reescrita muito comprida pode dar uma página a mais
 * do que o plano diz. É o «cerca de» da frase.
 *
 * Uma diferença de entrada, e só uma: o gerador conta as fotografias que
 * CHEGARAM (uma que falhe no armazenamento sai da conta); o plano conta as que
 * estão no documento.
 */

/** Uma página do PDF novo. */
export type PaginaDoPlano =
  | { tipo: "capa" }
  | { tipo: "indice" }
  | { tipo: "proposta" }
  | { tipo: "servicos"; servicos: readonly string[]; primeiro: number; continuacao: boolean }
  | { tipo: "ambiente" }
  | { tipo: "cronograma"; continuacao: boolean }
  /** O separador de um capítulo de inspiração, ou o do investimento. */
  | { tipo: "separador"; titulo: string; grupo: Grupo | null; numero: number }
  | {
      tipo: "tema";
      /** O índice REAL em `doc.moodBoards`. */
      bi: number;
      /** A vez do tema na proposta (1.º, 2.º…): decide o lado do mosaico. */
      vez: number;
      grupo: Grupo;
      titulo: string;
      /** Que página deste tema é (0 = a primeira), e quantas leva. */
      parte: number;
      partes: number;
      /** As fotografias desta página, pela ordem de desenho (índices de `images`). */
      fotos: readonly number[];
    }
  | { tipo: "citacao" }
  | { tipo: "orcamento"; linhas: number; continuacao: boolean }
  | { tipo: "total" }
  | { tipo: "condicoes"; qual: "notas" | "gerais" | "pagamento"; continuacao: boolean }
  | { tipo: "contracapa" };

/** A página, com o que o estúdio precisa para a mostrar. */
export type EntradaDoPlano = PaginaDoPlano & {
  /** Como se chama no índice e por baixo da miniatura. */
  nome: string;
  /** A secção do formulário que a produz (os ids de `estadoDasSeccoes`). */
  seccao: string;
};

const temTexto = (v: unknown) => typeof v === "string" && v.trim() !== "";

/**
 * A ordem por que as fotografias de um tema são DESENHADAS no PDF novo: a
 * «principal» à frente, sempre. É a foto do cartão em «O que propomos» e a
 * primeira do mosaico — ela escolheu-o («Passa a ser a foto do cartão»).
 *
 * No desenho antigo a principal só ia à frente nas disposições com lugar de
 * destaque (`ordemDasFotos`); no novo não há disposição a escolher.
 */
export function ordemDoDesenho(board: Pick<MoodBoard, "images" | "principal">): number[] {
  const n = board.images?.length ?? 0;
  const comoEstao = Array.from({ length: n }, (_, i) => i);
  const p = board.principal;
  if (typeof p !== "number" || !Number.isInteger(p) || p <= 0 || p >= n) return comoEstao;
  return [p, ...comoEstao.filter((i) => i !== p)];
}

/**
 * Os serviços do documento, para os cartões de «O que propomos».
 *
 * São os ITENS dos grupos de serviços. Um grupo sem itens conta pelo seu
 * título. A chave (em português, que é o que ela escreveu) serve para casar o
 * serviço com o seu tema de inspiração.
 */
export function servicosDoDocumento(original: ProposalDoc, doc: ProposalDoc = original) {
  const lista: { nome: string; descricao: string; chave: string }[] = [];
  (original.serviceGroups ?? []).forEach((g, gi) => {
    const gl = doc.serviceGroups?.[gi] ?? g;
    const itens = (g.items ?? []).map((it, ii) => ({ pt: it, naLingua: gl.items?.[ii] ?? it }));
    const comNome = itens.filter((x) => (x.pt.label ?? "").trim());
    if (comNome.length) {
      for (const x of comNome) {
        lista.push({
          nome: x.naLingua.label.trim(),
          descricao: (x.naLingua.desc ?? "").trim(),
          chave: chaveDeRubrica(x.pt.label),
        });
      }
    } else if ((g.title ?? "").trim()) {
      lista.push({ nome: gl.title.trim(), descricao: "", chave: chaveDeRubrica(g.title) });
    }
  });
  return lista;
}

/** Quantos cartões de serviço cabem numa página (`CARTOES_POR_PAGINA`). */
const CARTOES_POR_PAGINA = 6;

/** As fotografias de um tema que contam: as que têm referência. */
const fotosDoTema = (b: MoodBoard) => ordemDoDesenho(b).filter((i) => temTexto(b.images[i]));

/**
 * Os temas que têm página: com fotografias, ou só com texto. Um tema sem
 * fotografias E sem texto não tem nada para mostrar.
 */
export function temasComPagina(doc: ProposalDoc): number[] {
  const boards = doc.moodBoards ?? [];
  return ordemDeSaida(doc, boards, (b) => b.title ?? "").filter((bi) => {
    const b = boards[bi];
    return (
      !!b &&
      (fotosDoTema(b).length > 0 ||
        temTexto(b.title) ||
        temTexto(b.subtitulo) ||
        temTexto(b.annotation))
    );
  });
}

/* ── As estimativas do texto ─────────────────────────────────────────────── */

/**
 * As medidas das colunas do gerador (`paginas/condicoes.ts`, `colunas.ts`), em
 * píxeis do exemplo. A largura média de um carácter de Inter a 12,5 px mede
 * ~6,2 px no texto das condições; arredonda-se para cima, porque a quebra de
 * linha por palavras gasta mais do que a conta por letras.
 */
const COLUNAS = {
  /** `FUNDO_DO_CONTEUDO` − o cabeçalho com o título numa linha − o ar. */
  altura: 716 - (48 + 11.5 * 1.21 + 10 + 40 * 1.06) - 20,
  /** `LARGURA_DO_TEXTO` = 1123 − (230 + 56) − 98. */
  largura: 739,
  carater: 6.6,
  item: { tam: 12.5, entrelinha: 1.5, enchimento: 7 },
  h3: { tam: 15.5, entrelinha: 1.3, antes: 20, depois: 10, carater: 8.4 },
};

const linhasDe = (texto: string, larguraPx: number, carater: number) =>
  Math.max(1, Math.ceil(texto.length / Math.max(1, Math.floor(larguraPx / carater))));

type PecaDeTexto = { h3: true; texto: string } | { h3: false; texto: string };

function alturaDaPeca(p: PecaDeTexto, larguraPx: number, primeira: boolean): number {
  if (p.h3) {
    const H = COLUNAS.h3;
    return (
      (primeira ? 0 : H.antes) +
      linhasDe(p.texto, larguraPx, H.carater) * H.tam * H.entrelinha +
      H.depois
    );
  }
  const I = COLUNAS.item;
  return (
    2 * I.enchimento + linhasDe(p.texto, larguraPx, COLUNAS.carater) * I.tam * I.entrelinha + 1
  );
}

/** Quantos pedaços de `altura` leva uma coluna de peças (como `colunas.repartir`). */
function pedacosDaColuna(pecas: readonly PecaDeTexto[], larguraPx: number): number {
  let pedacos = 0;
  let usado = 0;
  let noPedaco = 0;
  for (const p of pecas) {
    const h = alturaDaPeca(p, larguraPx, noPedaco === 0);
    if (noPedaco && usado + h > COLUNAS.altura) {
      pedacos++;
      usado = 0;
      noPedaco = 0;
    }
    usado += alturaDaPeca(p, larguraPx, noPedaco === 0);
    noPedaco++;
  }
  return pedacos + (noPedaco ? 1 : 0);
}

const larguraDaColuna = (n: number, vao: number) => (COLUNAS.largura - vao * (n - 1)) / n;

/** Colunas fixas: cada uma continua na mesma coluna da página seguinte. */
function paginasDeColunasFixas(colunas: readonly (readonly PecaDeTexto[])[], vao: number): number {
  const cols = colunas.filter((c) => c.length);
  if (!cols.length) return 0;
  const largura = larguraDaColuna(cols.length, vao);
  return Math.max(...cols.map((c) => pedacosDaColuna(c, largura)));
}

/** Uma lista corrida em duas colunas. */
function paginasDeColunasCorridas(pecas: readonly PecaDeTexto[]): number {
  if (!pecas.length) return 0;
  return Math.max(1, Math.ceil(pedacosDaColuna(pecas, larguraDaColuna(2, 50)) / 2));
}

const lista = (titulo: string, itens: readonly string[]): PecaDeTexto[] =>
  itens.length
    ? [{ h3: true, texto: titulo }, ...itens.map((texto) => ({ h3: false as const, texto }))]
    : [];

/**
 * As linhas do quadro do orçamento numa página: ~11 de uma linha só, menos
 * quando o nome parte (`paginas/orcamento.ts`, ~55 caracteres por linha).
 */
function paginasDoOrcamento(nomes: readonly string[]): number[] {
  const cabe = 716 - 48 - (11.5 * 1.21 + 10 + 40 * 1.06 + 4 + 17 * 1.25 + 26);
  const paginas: number[] = [];
  let usado = 0;
  let nestaPagina = 0;
  for (const nome of nomes) {
    const h = 30 + linhasDe(nome, 425, 7.8) * 16 * 1.21 + 1;
    if (nestaPagina && usado + h > cabe) {
      paginas.push(nestaPagina);
      usado = 0;
      nestaPagina = 0;
    }
    usado += h;
    nestaPagina++;
  }
  if (nestaPagina) paginas.push(nestaPagina);
  return paginas;
}

/* ── O plano ─────────────────────────────────────────────────────────────── */

/**
 * As páginas do PDF novo, pela ordem em que saem.
 *
 * Recebe o documento como o estúdio o tem (em português). As contas são as do
 * gerador; o texto que transborda é estimado (ver o cabeçalho).
 */
export function planoDaProposta(doc: ProposalDoc): EntradaDoPlano[] {
  const t = textosDaProposta("pt");
  const te = textosEditoriais("pt");
  const org = doc.template === "organizacao";
  const fixos = blocosFixosNaLingua(doc, "pt");
  const paginas: EntradaDoPlano[] = [];
  const boards = doc.moodBoards ?? [];

  paginas.push({ tipo: "capa", nome: "Capa", seccao: "capas" });
  paginas.push({ tipo: "indice", nome: te.indice, seccao: "evento" });
  paginas.push({ tipo: "proposta", nome: te.aProposta, seccao: "evento" });

  // ── O que propomos ──
  const servicos = servicosDoDocumento(doc);
  for (let i = 0; i < servicos.length; i += CARTOES_POR_PAGINA) {
    paginas.push({
      tipo: "servicos",
      servicos: servicos.slice(i, i + CARTOES_POR_PAGINA).map((s) => s.nome),
      primeiro: i + 1,
      continuacao: i > 0,
      nome: i ? `${t.sobretituloServicos} ${te.continuacao}` : t.sobretituloServicos,
      seccao: "servicos",
    });
  }

  // ── Paleta e ambiente: só com fotografias de inspiração ──
  const comPagina = temasComPagina(doc);
  const haFotos = comPagina.some((bi) => fotosDoTema(boards[bi]).length > 0);
  if (haFotos) paginas.push({ tipo: "ambiente", nome: "Paleta e ambiente", seccao: "moodboards" });

  // ── Cronograma (modelo Organização) ──
  if (org) {
    const pecas: PecaDeTexto[] = (doc.cronograma ?? [])
      .filter((f) => temTexto(f.title) || f.items?.some((i) => temTexto(i)))
      .flatMap((f) => [
        { h3: true as const, texto: f.title.trim() },
        ...f.items.filter((i) => temTexto(i)).map((i) => ({ h3: false as const, texto: i })),
      ]);
    const n = paginasDeColunasCorridas(pecas);
    for (let k = 0; k < n; k++) {
      paginas.push({
        tipo: "cronograma",
        continuacao: k > 0,
        nome: k ? `${t.tituloCronograma} ${te.continuacao}` : t.tituloCronograma,
        seccao: "cronograma",
      });
    }
  }

  // ── Os capítulos de inspiração ──
  const capitulos = agrupar(comPagina, (bi) =>
    grupoDoTema(boards[bi].title ?? "", boards[bi].subtitulo ?? ""),
  );
  const meio = Math.ceil(capitulos.length / 2);
  let vez = 0;
  let separadores = 0;
  capitulos.forEach((c, ci) => {
    const nome = te.grupos[c.grupo];
    separadores++;
    paginas.push({
      tipo: "separador",
      titulo: nome,
      grupo: c.grupo,
      numero: separadores,
      nome: `${te.inspiracao} · ${nome}`,
      seccao: "moodboards",
    });
    for (const bi of c.itens) {
      vez++;
      const b = boards[bi];
      const fotos = fotosDoTema(b);
      const porPagina = fotos.length ? repartirFotos(fotos.length) : [0];
      let feitas = 0;
      porPagina.forEach((quantas, parte) => {
        paginas.push({
          tipo: "tema",
          bi,
          vez,
          grupo: c.grupo,
          titulo: (b.title ?? "").trim(),
          parte,
          partes: porPagina.length,
          fotos: fotos.slice(feitas, feitas + quantas),
          nome: parte
            ? `${(b.title ?? "").trim() || `Tema ${vez}`} · ${te.maisIdeias}`
            : (b.title ?? "").trim() || `Tema ${vez}`,
          seccao: "moodboards",
        });
        feitas += quantas;
      });
    }
    if (ci + 1 === meio && haFotos) {
      paginas.push({ tipo: "citacao", nome: "Citação", seccao: "moodboards" });
    }
  });

  // ── Investimento ──
  const totais = totaisDaProposta(doc, depositPercentOf(doc));
  const semMarcador = (v: string) => (/^\[[^\]]*\]$/.test(v.trim()) ? "" : v);
  const totalStr = semMarcador(org ? (doc.totalEstimatedText ?? "") : (doc.totalText ?? ""));
  const nomes = org
    ? (doc.budgetRows ?? []).filter((r) => temTexto(r.item)).map((r) => r.item)
    : ordemDeSaida(doc, doc.budgetItems ?? [], (s) => s)
        .map((i) => doc.budgetItems[i] ?? "")
        .filter((s) => s.trim());
  if (nomes.length > 0 || totais.aPagar > 0 || totalStr.trim()) {
    separadores++;
    paginas.push({
      tipo: "separador",
      titulo: te.investimento,
      grupo: null,
      numero: separadores,
      nome: te.investimento,
      seccao: "orcamento",
    });
    paginasDoOrcamento(nomes).forEach((linhas, k) => {
      paginas.push({
        tipo: "orcamento",
        linhas,
        continuacao: k > 0,
        nome: k ? `${te.tituloOrcamento} ${te.continuacao}` : te.tituloOrcamento,
        seccao: "orcamento",
      });
    });
    paginas.push({ tipo: "total", nome: "Total", seccao: "total" });
  }

  // ── Condições — sempre ──
  const notas = paginasDeColunasFixas(
    [
      [
        ...lista(t.notasImportantes, fixos.notasImportantes ?? []),
        ...lista(t.proximosPassos, [t.passoAceitar, t.passoSinal, t.passoValidade("31/12/2099")]),
      ],
      [
        ...lista(t.incluidoNaProposta, fixos.incluido ?? []),
        ...lista(t.naoIncluidoNoOrcamento, fixos.naoIncluido ?? []),
      ],
      lista(t.observacoesGerais, fixos.observacoesGerais ?? []),
    ],
    28,
  );
  const gerais = paginasDeColunasCorridas(
    (fixos.condicoesGerais ?? []).map((texto) => ({ h3: false as const, texto })),
  );
  const pagamento = Math.max(
    1,
    paginasDeColunasFixas(
      [
        [
          ...lista(t.faseamentoDoPagamento, fixos.faseamento ?? []),
          ...(totais.aPagar > 0
            ? [
                { h3: false as const, texto: `${t.sinal(30)} · 0,00 € ${t.quandoSinal}` },
                { h3: false as const, texto: `${t.saldo(70)} · 0,00 € ${t.quandoSaldo}` },
                { h3: false as const, texto: t.baseDoCalculo("0,00 €") },
              ]
            : []),
          { h3: true as const, texto: t.contactos },
          { h3: false as const, texto: "email" },
          { h3: false as const, texto: "telefone" },
        ],
        lista(t.cancelamento, fixos.cancelamento ?? []),
      ],
      50,
    ),
  );
  const condicoes: [PaginaDoPlano & { tipo: "condicoes" }, number, string][] = [
    [{ tipo: "condicoes", qual: "notas", continuacao: false }, notas, te.tituloNotas],
    [{ tipo: "condicoes", qual: "gerais", continuacao: false }, gerais, te.tituloCondicoesGerais],
    [{ tipo: "condicoes", qual: "pagamento", continuacao: false }, pagamento, te.tituloPagamento],
  ];
  for (const [p, n, titulo] of condicoes) {
    for (let k = 0; k < n; k++) {
      paginas.push({
        ...p,
        continuacao: k > 0,
        nome: k ? `${titulo} ${te.continuacao}` : titulo,
        seccao: "total",
      });
    }
  }

  paginas.push({ tipo: "contracapa", nome: "Contracapa", seccao: "capas" });
  return paginas;
}

/**
 * As listas fixas que NÃO saem no PDF novo por estarem vazias.
 *
 * O desenho antigo imprimia a folha das condições gerais e a das observações
 * mesmo vazias — com o cabeçalho e nada por baixo, e foi assim que uma proposta
 * seguiu com duas folhas em branco (achado F-13). O novo não imprime uma secção
 * sem conteúdo: a folha não sai. O que pode faltar é o TEXTO, e é isso que a
 * conferência passa a dizer.
 */
export function listasQueNaoSaem(doc: ProposalDoc): { nome: string; seccao: string }[] {
  const fixos = blocosFixosNaLingua(doc, "pt");
  const t = textosDaProposta("pt");
  const faltam: { nome: string; seccao: string }[] = [];
  if (!(fixos.condicoesGerais ?? []).some((l) => temTexto(l)))
    faltam.push({ nome: t.tituloCondicoes, seccao: "total" });
  if (!(fixos.observacoesGerais ?? []).some((l) => temTexto(l)))
    faltam.push({ nome: t.observacoesGerais, seccao: "total" });
  return faltam;
}

/** Quantas páginas, pelo plano. */
export const paginasDoPlano = (doc: ProposalDoc) => planoDaProposta(doc).length;

/**
 * A composição que o PDF dá a um tema com `n` fotografias, por palavras — o
 * quadro de `mosaico.ts`. No desenho novo a disposição não se escolhe: sai do
 * número de fotografias, e o estúdio di-lo em vez de oferecer um selector.
 */
export function composicaoEmPalavras(n: number): string {
  if (n <= 0) return "Só texto, com uma fotografia de outro tema ao lado";
  if (n === 1) return "Uma fotografia a página inteira";
  if (n <= 3) return "Uma fila a toda a altura, com o texto ao lado";
  if (n === 4) return "Duas filas em tijolo";
  if (n === 5) return "Cinco ao alto, desalinhadas";
  const paginas = repartirFotos(n).length;
  return paginas > 1
    ? `Mosaico de ponta a ponta, em ${paginas} páginas`
    : "Mosaico de ponta a ponta";
}

/** O capítulo de inspiração de um tema («Jantar»), pelo nome — `grupos.ts`. */
export function capituloDoTema(b: Pick<MoodBoard, "title" | "subtitulo">): string {
  return textosEditoriais("pt").grupos[grupoDoTema(b.title ?? "", b.subtitulo ?? "")];
}

/** Quantas páginas um tema ocupa no PDF (0 fotos é uma página de texto). */
export const paginasDoTema = (n: number) => (n > 0 ? repartirFotos(n).length : 1);
