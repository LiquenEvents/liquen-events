import "server-only";
import type { PaginaLida, PedacoDeTexto } from "./linhas";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * ABRIR O PDF — a única parte do motor que sabe o que é o pdf.js
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tudo o que está a jusante (linhas, colunas, campos) trabalha sobre pedaços de
 * texto com coordenadas e não faz ideia de onde eles vieram. É deliberado: se um
 * dia esta biblioteca for substituída, é este ficheiro que se reescreve, e os
 * testes do resto continuam a valer sem tocar em nada.
 *
 * ── PORQUÊ O pdf.js ───────────────────────────────────────────────────────
 *
 * O projecto tinha o `pdf-lib`, que ESCREVE PDFs e praticamente não os lê: sabe
 * a estrutura do ficheiro, mas não descodifica fontes nem devolve texto. Para
 * ler era preciso uma dependência nova, e as candidatas eram três:
 *
 * · `pdf-parse` — devolve o texto todo numa string, SEM posições. Era o mesmo
 *   que não ter posições: «7890 € + IVA» perdido no meio de mil palavras não se
 *   distingue de nenhum outro número da folha. Recusada por aí.
 *
 * · `pdf2json` — dá posições, mas é uma bifurcação antiga do próprio pdf.js,
 *   devolve o texto codificado em URI e está muito atrás no que sabe ler.
 *   Recusada: mais frágil do que o original, sem nada em troca.
 *
 * · `mupdf`/wasm — excelente a ler, e AGPL. Não entra num produto fechado.
 *
 * Fica o `pdfjs-dist`: é o motor que abre PDFs no Firefox e no Chrome, o que
 * quer dizer que o que ele não lê, ninguém lê. Apache-2.0. JavaScript puro —
 * corre em Node no Vercel sem binário nenhum obrigatório (traz o
 * `@napi-rs/canvas` como dependência OPCIONAL, carregada por um `require` dentro
 * de um `try` e só para DESENHAR páginas; nada do que aqui se faz lhe toca). E
 * dá a POSIÇÃO de cada pedaço de texto — a matriz de transformação —, que é a
 * única razão de este motor conseguir ler em vez de adivinhar.
 *
 * A entrada é a `legacy`, e não a moderna, porque é a compilada para o
 * JavaScript que o Node 20 do Vercel garante.
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * Tecto de tamanho de um PDF que entra.
 *
 * O mesmo número que uma imagem de tema pode ter (`MAX_BYTES`, 12 MB, na rota
 * das imagens): uma proposta antiga exportada do Canva com fotografias anda
 * pelos 3 a 8 MB, e 12 MB é folga suficiente para a maior sem abrir a porta a
 * alguém a empurrar um ficheiro de meio giga para dentro de uma função
 * serverless. Quem chamar do lado de uma rota deve recusar ANTES de ler o
 * corpo, com o `content-length`; isto é o cinto.
 */
export const MAX_PDF_BYTES = 12 * 1024 * 1024;

/**
 * Tecto de páginas.
 *
 * A proposta mais comprida que o gerador produz tem doze páginas; uma feita à
 * mão em Word raramente passa das vinte. Sessenta é generoso e continua a ser
 * uma trava: um PDF de 900 páginas gerado à pressa por alguém não pode
 * transformar uma leitura de dois segundos numa função a arder até ao
 * `maxDuration`.
 */
export const MAX_PAGINAS = 60;

/**
 * Orçamento de tempo, em milissegundos.
 *
 * Escolhido para caber dentro do `maxDuration = 60` das rotas pesadas deste
 * projecto com margem para o que vem DEPOIS da leitura (converter as fotos com
 * o sharp, gravar o rascunho). O motor verifica o relógio ENTRE páginas: uma
 * página que demore o triplo do previsto pára o trabalho e o que já se leu é
 * devolvido com um aviso, em vez de a rota inteira morrer sem resultado nenhum.
 *
 * Devolver metade é útil — ela corrige o resto à mão. Devolver um 504 não é.
 */
export const ORCAMENTO_MS = 25_000;

export interface ImagemDesenhada {
  /** Identificador dentro do PDF — serve para ir buscar os pixéis. */
  id: string;
  pagina: number;
  /** A caixa onde foi desenhada, em pontos, com a origem em baixo à esquerda. */
  x: number;
  y: number;
  largura: number;
  altura: number;
  /** Pixéis do original embutido (não os da caixa onde foi desenhado). */
  larguraPx: number;
  alturaPx: number;
}

export interface LeituraDePdf {
  paginas: PaginaLida[];
  imagens: ImagemDesenhada[];
  /** Quando o orçamento de tempo ou o tecto de páginas cortou a leitura. */
  cortada: null | { porque: string; pagina: number };
  /** O documento aberto, para quem precise de ir buscar os pixéis das imagens.
   *  Quem o receber TEM de o fechar (`destroy`) — ver {@link lerPdf}. */
  documento: PdfAberto;
}

/** O pouco que o resto do motor precisa de saber de um documento aberto do
 *  pdf.js. Um tipo mínimo em vez do tipo da biblioteca, para a fronteira ser
 *  mesmo uma fronteira. */
export interface PdfAberto {
  numPages: number;
  getPage(n: number): Promise<PaginaDoPdf>;
  destroy(): Promise<void>;
}

/**
 * O pouco que se usa de uma página do pdf.js.
 *
 * Escrito à mão em vez de importado: a entrada `legacy` da biblioteca não traz
 * tipos, e um `any` aqui espalhava-se por todo o motor. Assim a fronteira é uma
 * fronteira — se um dia a biblioteca mudar, o que deixa de bater certo aparece
 * neste ficheiro e em mais nenhum.
 */
export interface PaginaDoPdf {
  /** `[x0, y0, x1, y1]` — a caixa da página, em pontos. */
  view: number[];
  getTextContent(): Promise<{ items: unknown[] }>;
  getOperatorList(): Promise<{ fnArray: number[]; argsArray: unknown[] }>;
  /** Onde vivem os objectos desta página (as imagens que só ela usa). */
  objs: LojaDeObjectos;
  /** Onde vivem os objectos do DOCUMENTO (os que mais do que uma página usa). */
  commonObjs: LojaDeObjectos;
}

export interface LojaDeObjectos {
  get(id: string, callback: (obj: unknown) => void): void;
}

/**
 * Lê um PDF: texto com posição, página a página, e onde estava cada imagem.
 *
 * NÃO extrai os pixéis das imagens — isso é caro e vive em `imagens.ts`, que
 * decide quais valem a pena. Aqui só se descobre que existem e onde estavam.
 *
 * Nunca lança por causa do CONTEÚDO: um PDF cifrado, truncado ou que não é um
 * PDF sai como um erro tipado, porque é um ficheiro que vem de fora e o
 * caminho normal de um ficheiro estranho é dizer-lhe que não serve, não é
 * rebentar a rota.
 */
export async function lerPdf(
  bytes: Uint8Array,
  opcoes: { orcamentoMs?: number; agora?: () => number } = {},
): Promise<{ ok: true; leitura: LeituraDePdf } | { ok: false; porque: string }> {
  if (bytes.byteLength === 0) return { ok: false, porque: "O ficheiro está vazio." };
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return {
      ok: false,
      porque: `O ficheiro tem ${(bytes.byteLength / 1024 / 1024).toFixed(1)} MB e o limite é ${MAX_PDF_BYTES / 1024 / 1024} MB.`,
    };
  }
  const relogio = opcoes.agora ?? Date.now;
  const limite = relogio() + (opcoes.orcamentoMs ?? ORCAMENTO_MS);

  let documento: PdfAberto;
  try {
    // A TAREFA e o DOCUMENTO são duas coisas diferentes no pdf.js, e quem
    // liberta a memória é a tarefa: o `destroy()` vive nela, não no documento.
    // Guardá-los juntos aqui é o que faz `fechar()` fechar mesmo — sem isto,
    // os pixéis descodificados de cada proposta lida ficavam presos até ao fim
    // do processo.
    const tarefa = pdfjs.getDocument({
      // `data` é consumido (fica destacado) pelo pdf.js — uma cópia evita que
      // quem chamou fique com um buffer vazio na mão sem perceber porquê.
      data: new Uint8Array(bytes),
      // Sem ir buscar fontes ao sistema nem à rede: dentro de uma função
      // serverless não há nem uma coisa nem outra, e o pdf.js só precisa delas
      // para DESENHAR. Para ler texto basta-lhe o que está embutido.
      useSystemFonts: false,
      useWorkerFetch: false,
      // Sem canvas: obriga o pdf.js a devolver as imagens como pixéis crus em
      // vez de um `ImageBitmap` que em Node não existe.
      isOffscreenCanvasSupported: false,
      /**
       * Só ERROS no registo.
       *
       * Por omissão o pdf.js escreve avisos para a consola, e há um que sai em
       * TODOS os PDF com fontes-padrão: «Ensure that the standardFontDataUrl
       * API parameter is provided». É um aviso de quem vai DESENHAR a página —
       * as fontes-padrão só fazem falta para pintar glifos — e aqui não se
       * desenha nada; o texto sai inteiro na mesma. Deixá-lo passar era encher
       * o registo da função com uma linha por proposta lida, e um registo cheio
       * de ruído é um registo onde já não se vê o aviso que interessa.
       *
       * Os ERROS continuam a passar: o que se cala é o barulho, não a avaria. E
       * o que este motor tem a dizer sobre o que não conseguiu ler não vai
       * pelo registo — vai em `porLer` e em `avisos`, que é onde ela os vê.
       */
      verbosity: 1,
    });
    const proxy = (await tarefa.promise) as unknown as {
      numPages: number;
      getPage(n: number): Promise<PaginaDoPdf>;
    };
    documento = {
      numPages: proxy.numPages,
      getPage: (n) => proxy.getPage(n),
      destroy: () => tarefa.destroy(),
    };
  } catch (e) {
    return { ok: false, porque: motivoDeAbertura(e) };
  }

  const paginas: PaginaLida[] = [];
  const imagens: ImagemDesenhada[] = [];
  let cortada: LeituraDePdf["cortada"] = null;
  const total = Math.min(documento.numPages, MAX_PAGINAS);
  if (documento.numPages > MAX_PAGINAS) {
    cortada = {
      porque: `O documento tem ${documento.numPages} páginas e só se leram as primeiras ${MAX_PAGINAS}.`,
      pagina: MAX_PAGINAS,
    };
  }

  for (let n = 1; n <= total; n++) {
    if (relogio() > limite) {
      cortada = {
        porque: `A leitura passou do tempo previsto e parou na página ${n - 1}. O que já se tinha lido vai aqui.`,
        pagina: n - 1,
      };
      break;
    }
    try {
      const pagina = await documento.getPage(n);
      const [x0, y0, x1, y1] = pagina.view;
      const conteudo = await pagina.getTextContent();
      const pedacos: PedacoDeTexto[] = [];
      for (const item of conteudo.items as unknown[]) {
        const it = item as {
          str?: string;
          width?: number;
          transform?: number[];
          fontName?: string;
        };
        if (typeof it.str !== "string" || !it.transform) continue;
        const t = it.transform;
        // A matriz é [a b c d e f]: (e,f) é onde a linha de base começa e `a`
        // é o corpo da letra quando não há rotação nem inclinação. Um texto
        // rodado tem `b`/`c` diferentes de zero — usa-se o comprimento do
        // vector vertical, que continua a ser a altura da letra.
        const tamanho = Math.hypot(t[2], t[3]) || Math.hypot(t[0], t[1]) || 0;
        pedacos.push({
          texto: it.str,
          x: t[4],
          y: t[5],
          largura: it.width ?? 0,
          tamanho,
          fonte: it.fontName ?? "",
        });
      }
      paginas.push({
        numero: n,
        largura: Math.abs(x1 - x0),
        altura: Math.abs(y1 - y0),
        pedacos,
      });
      imagens.push(...(await imagensDaPagina(pagina, n)));
    } catch {
      // Uma página avariada não deita abaixo a leitura das outras: entra vazia
      // e o motor conta-a como página sem texto. Um PDF com uma página
      // estragada a meio é coisa que acontece a ficheiros que viajaram por
      // email durante anos, e é precisamente o acervo que isto veio ler.
      paginas.push({ numero: n, largura: 0, altura: 0, pedacos: [] });
    }
  }

  return { ok: true, leitura: { paginas, imagens, cortada, documento } };
}

/** Traduz a avaria do pdf.js para uma frase que se possa mostrar a alguém. */
function motivoDeAbertura(e: unknown): string {
  const nome = (e as { name?: string })?.name ?? "";
  if (nome === "PasswordException") {
    return "O PDF está protegido por palavra-passe. Guarde uma cópia sem protecção e volte a tentar.";
  }
  if (nome === "InvalidPDFException") {
    return "O ficheiro não é um PDF válido (ou chegou incompleto).";
  }
  return "Não foi possível abrir o PDF.";
}

/**
 * Onde é que esta página desenha imagens.
 *
 * Percorre a lista de operadores da página a manter a matriz corrente (o `q`/`Q`
 * e o `cm` do PDF, que no pdf.js são `save`/`restore`/`transform`). Uma imagem
 * é sempre desenhada dentro do quadrado unitário, portanto a matriz no momento
 * do desenho É a caixa onde a imagem foi parar — e é isso que permite dizer
 * «esta fotografia estava a meia página, à direita, na página 4» em vez de
 * «havia lá uma fotografia».
 *
 * Uma matriz com rotação devolve a caixa que ENVOLVE o desenho. Perde-se o
 * ângulo, que a nenhum dos leitores deste resultado faz falta.
 */
async function imagensDaPagina(pagina: PaginaDoPdf, numero: number): Promise<ImagemDesenhada[]> {
  const ops = pdfjs.OPS as unknown as Record<string, number>;
  const lista = await pagina.getOperatorList();
  const fn = lista.fnArray;
  const args = lista.argsArray;

  type Matriz = [number, number, number, number, number, number];
  let ctm: Matriz = [1, 0, 0, 1, 0, 0];
  const pilha: Matriz[] = [];
  const out: ImagemDesenhada[] = [];

  const multiplicar = (m: Matriz, n: Matriz): Matriz => [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5],
  ];

  for (let i = 0; i < fn.length; i++) {
    const op = fn[i];
    if (op === ops.save) {
      pilha.push([...ctm] as Matriz);
    } else if (op === ops.restore) {
      ctm = pilha.pop() ?? ([1, 0, 0, 1, 0, 0] as Matriz);
    } else if (op === ops.transform) {
      const a = args[i] as number[];
      if (a?.length === 6) ctm = multiplicar(ctm, a as Matriz);
    } else if (
      op === ops.paintImageXObject ||
      op === ops.paintJpegXObject ||
      op === ops.paintImageXObjectRepeat
    ) {
      const a = args[i] as [string, number, number] | undefined;
      if (!a || typeof a[0] !== "string") continue;
      // Os quatro cantos do quadrado unitário, levados pela matriz.
      const cantos: [number, number][] = [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ].map(([u, v]) => [ctm[0] * u + ctm[2] * v + ctm[4], ctm[1] * u + ctm[3] * v + ctm[5]]);
      const xs = cantos.map((c) => c[0]);
      const ys = cantos.map((c) => c[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      out.push({
        id: a[0],
        pagina: numero,
        x,
        y,
        largura: Math.max(...xs) - x,
        altura: Math.max(...ys) - y,
        larguraPx: typeof a[1] === "number" ? a[1] : 0,
        alturaPx: typeof a[2] === "number" ? a[2] : 0,
      });
    }
  }
  return out;
}
