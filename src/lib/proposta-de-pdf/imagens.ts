import "server-only";
import sharp from "sharp";
import {
  garantirFormatoImprimivel,
  imageContentKey,
  transcodificarParaJpeg,
} from "@/lib/proposal-image";
import type { Aviso, FotoDoPdf } from "./tipos";
import type { ImagemDesenhada, PdfAberto } from "./leitura";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS QUE ESTÃO LÁ DENTRO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Metade do valor de ler uma proposta antiga são as fotos: os mood boards e as
 * capas. Sem elas, o rascunho é uma folha de texto e ela tem de ir procurar as
 * imagens a uma pasta de 2023.
 *
 * ── COMO É QUE SE TIRA UMA FOTO DE DENTRO DE UM PDF ───────────────────────
 *
 * Há duas maneiras. A primeira é ir buscar o fluxo de bytes tal e qual está
 * guardado: quando o filtro é DCTDecode, esses bytes JÁ SÃO um ficheiro JPEG e
 * saem sem perder um pixel. É tentador, e não é o que se faz aqui, por uma
 * razão concreta: só funciona para os JPEG. Um PDF exportado do Word traz as
 * imagens em Flate (PNG por dentro), às vezes em CCITT (fax), às vezes com uma
 * máscara de transparência guardada num objecto à parte; e o acervo que isto
 * veio ler é feito de Word e de Canva, não de ficheiros nossos.
 *
 * A segunda é pedir ao leitor os PIXÉIS já descodificados — e é essa. O pdf.js
 * trata de todos os formatos, junta a máscara de transparência à imagem, e
 * devolve um rectângulo de pixéis. O preço é uma recodificação: uma foto que
 * era JPEG volta a ser JPEG, com uma geração de perda. Paga-se de bom grado,
 * porque o destino destas fotos é o gerador de propostas, que as recodifica
 * na mesma para JPEG baseline antes de as desenhar (ver `proposal-image.ts`).
 *
 * ── A PORTA ───────────────────────────────────────────────────────────────
 *
 * Um PDF é um ficheiro que vem de fora e pode trazer lá dentro o que quiser.
 * Nada do que sai daqui passa ao lado do {@link garantirFormatoImprimivel}, que
 * é a mesma porta por onde entram as fotos que ela carrega à mão no estúdio.
 */

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O TECTO É EM BYTES, NÃO EM FOTOGRAFIAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Aqui esteve um tecto de 40 fotografias, e cortava uma proposta verdadeira: a
 * de onze páginas do acervo tem 66 imagens desenhadas — 56 fotografias — e
 * voltava com 40 e um aviso. Foram medidas as três propostas que temos à mão,
 * com o relógio e a memória à volta de cada passo:
 *
 *   ficheiro          imagens  fotos  megapixéis  ler o PDF  converter as fotos
 *   ────────────────  ───────  ─────  ──────────  ─────────  ──────────────────
 *   11 páginas             66     56         8,3      652 ms               940 ms
 *   10 páginas             41     32         6,6      800 ms               748 ms
 *   nossa, 10 páginas      26     14        19,0    1 379 ms             2 124 ms
 *
 * A proposta com 66 imagens é a MAIS BARATA das três, e a nossa, com 26, é a
 * que custa quase o triplo. O número de fotografias não diz nada: o que se
 * paga são os PIXÉIS. Medido em várias corridas, entre 110 e 160 ms por
 * megapixel de origem — o custo por fotografia, à parte disso, não chega a ser
 * mensurável.
 *
 * Daí o tecto ser este: bytes de imagem DESCODIFICADA (pixéis × 3, que é o que
 * uma fotografia RGB ocupa em cru). 192 MB são ~64 megapixéis, ou sete a dez
 * segundos de sharp — sete vezes e meia a proposta verdadeira mais pesada que
 * lemos (8,3 megapixéis, 25 MB) e três vezes e meia a nossa (19 megapixéis,
 * 57 MB). Continua a ser uma trava: uma proposta com as 80 imagens que o
 * gerador admite, todas no máximo de 2200 px de lado, seriam 384 megapixéis e
 * um minuto de função a arder.
 *
 * E o corte é pela ORDEM IMPRESSA (ver {@link ordemDeLeitura}), portanto o que
 * fica de fora são as últimas páginas de inspiração e não fotografias
 * salteadas pelo meio das que ficaram.
 */
export const MAX_BYTES_DE_FOTOS = 192 * 1024 * 1024;

/**
 * Quanto ocupa um pixel descodificado de uma fotografia.
 *
 * Três, e não quatro, de propósito: as 102 fotografias das três propostas
 * medidas chegam TODAS como RGB (`kind === 2`). As de quatro canais que
 * aparecem são o logótipo e os traços, e essas nem chegam a ser convertidas
 * — ver {@link temTransparencia}. Prever o gasto pelos pixéis (que se sabem
 * antes de descodificar, vêm na lista de operadores) e não pelos bytes que
 * voltaram é o que torna o corte previsível: sabe-se o que ficou de fora
 * ANTES de o ler, e o aviso pode dizê-lo.
 */
const BYTES_POR_PIXEL_DESCODIFICADO = 3;

/**
 * Área mínima DESENHADA, em pontos quadrados, para uma imagem ser candidata a
 * fotografia.
 *
 * O que se quer excluir tem nome: o logótipo da Líquen, que o gerador desenha
 * com 72 pt de largura por 43 de altura no canto de todas as páginas — 3.096
 * pontos quadrados. A célula mais pequena que um mood board chega a desenhar,
 * no arranjo de dez fotos, anda pelos 140 × 95 = 13.300. Seis mil fica no meio,
 * bem longe dos dois.
 *
 * É uma regra sobre o TAMANHO IMPRESSO e não sobre os pixéis de propósito: num
 * PDF de fora, o cabeçalho de uma folha timbrada pode ser uma imagem de 2.000
 * pixéis desenhada com dois centímetros de largura. O que a distingue de uma
 * fotografia não é o ficheiro — é o espaço que ocupa na página.
 */
const AREA_MINIMA_PT2 = 6000;

/** Lado mais curto mínimo, em pontos. Corta as réguas e os filetes decorativos,
 *  que são imagens compridas e finas com área a fingir de fotografia. */
const LADO_MINIMO_PT = 40;

/** Pixéis mínimos no lado maior. Abaixo disto não é uma fotografia que valha a
 *  pena reaproveitar — é um ícone, uma marca de água ou um separador. */
const PIXEIS_MINIMOS = 120;

/**
 * A partir de quantas páginas uma mesma imagem passa a ser MOBÍLIA.
 *
 * Um logótipo, um rodapé, uma marca de água: repetem-se página após página,
 * sempre no mesmo sítio. Uma fotografia de proposta aparece uma vez — ou duas,
 * quando é a foto da capa, que este documento repete na contracapa de
 * propósito. Três é o primeiro número que separa as duas coisas sem apanhar a
 * capa.
 */
const PAGINAS_PARA_SER_MOBILIA = 3;

/**
 * Tecto de pixéis descodificados por imagem.
 *
 * Uma imagem chega aqui como pixéis crus: 3 ou 4 bytes por pixel, sem
 * compressão nenhuma. Uma fotografia de 6.000 × 4.000 são 72 MB de memória num
 * único buffer — dentro de uma função serverless com 1 GB, é meia dúzia delas
 * até bater no tecto e a função morrer sem dizer porquê. Vinte megapixéis é
 * mais do que qualquer máquina que produza fotos para uma proposta, e é o sítio
 * onde se prefere um aviso a um processo morto.
 */
const MAX_MEGAPIXEIS = 20;

/**
 * As fotografias de um PDF, já validadas e em JPEG.
 *
 * Recebe as imagens DESENHADAS (que `leitura.ts` descobriu a percorrer os
 * operadores) e devolve só as que parecem fotografias, sem repetições, pela
 * ordem em que estão IMPRESSAS — ver {@link ordemDeLeitura}.
 */
export async function fotosDoPdf(
  documento: PdfAberto,
  desenhadas: readonly ImagemDesenhada[],
  // Como o orçamento de tempo do `lerPdf`, e pela mesma razão: para haver um
  // teste que faça o tecto morder sem ter de fabricar 192 MB de fotografias.
  opcoes: { orcamentoDeBytes?: number } = {},
): Promise<{ fotos: FotoDoPdf[]; avisos: Aviso[] }> {
  const avisos: Aviso[] = [];
  const tecto = opcoes.orcamentoDeBytes ?? MAX_BYTES_DE_FOTOS;

  // Quantas páginas DIFERENTES desenham cada imagem — é o que separa uma
  // fotografia da mobília do documento.
  const paginasPorId = new Map<string, Set<number>>();
  for (const d of desenhadas) {
    const s = paginasPorId.get(d.id) ?? new Set<number>();
    s.add(d.pagina);
    paginasPorId.set(d.id, s);
  }

  /**
   * O que se deitou fora, contado — porque uma proposta que traz 32 de 41
   * imagens não devia obrigar ninguém a adivinhar o que eram as outras nove.
   * Nas duas propostas verdadeiras que temos, `mobilia` dá 8 e 9: é o logótipo
   * que o Word carimba em todas as páginas.
   */
  const descartadas = { mobilia: 0, pequena: 0, grafico: 0 };

  const candidatas = ordemDeLeitura(
    desenhadas.filter((d) => {
      // A mobília primeiro: é a que se sabe NOMEAR no aviso («a mesma imagem em
      // oito páginas»), e a maioria dela também é pequena, pelo que a ordem das
      // duas perguntas decide o que se diz.
      if ((paginasPorId.get(d.id)?.size ?? 1) >= PAGINAS_PARA_SER_MOBILIA) {
        descartadas.mobilia += 1;
        return false;
      }
      const lados = [d.largura, d.altura];
      if (
        d.largura * d.altura < AREA_MINIMA_PT2 ||
        Math.min(...lados) < LADO_MINIMO_PT ||
        Math.max(d.larguraPx, d.alturaPx) < PIXEIS_MINIMOS
      ) {
        descartadas.pequena += 1;
        return false;
      }
      return true;
    }),
  );

  const fotos: FotoDoPdf[] = [];
  const porChave = new Map<string, FotoDoPdf>();
  let bytesGastos = 0;

  for (const [i, d] of candidatas.entries()) {
    const custo = d.larguraPx * d.alturaPx * BYTES_POR_PIXEL_DESCODIFICADO;
    if (bytesGastos > 0 && bytesGastos + custo > tecto) {
      const ficaram = candidatas.length - i;
      const primeiraDeFora = candidatas[i].pagina;
      const ultimaDeFora = candidatas[candidatas.length - 1].pagina;
      avisos.push({
        tipo: "fotos-de-mais",
        mensagem:
          `As ${fotos.length} primeiras fotografias já pesam ${megabytes(bytesGastos)} MB de imagem descodificada, ` +
          `que é o tecto (${megabytes(tecto)} MB). Ficaram de fora ${ficaram} imagens, ` +
          `da página ${primeiraDeFora}` +
          (ultimaDeFora > primeiraDeFora ? ` à ${ultimaDeFora}` : "") +
          `. O tecto é de MEMÓRIA e de tempo, não de contagem: cortou-se pelo fim do documento.`,
        pagina: primeiraDeFora,
      });
      break;
    }
    if (d.larguraPx * d.alturaPx > MAX_MEGAPIXEIS * 1_000_000) {
      avisos.push({
        tipo: "imagem-grande-demais",
        mensagem: `Uma fotografia da página ${d.pagina} tem ${((d.larguraPx * d.alturaPx) / 1_000_000).toFixed(0)} megapixéis e não foi trazida.`,
        pagina: d.pagina,
      });
      // Sem custo: esta nem chega a ser descodificada.
      continue;
    }
    // Daqui para baixo os pixéis são lidos, e é isso que se paga — mesmo que a
    // imagem acabe por se revelar um desenho ou por não passar na validação.
    bytesGastos += custo;

    const lida = await bytesDaImagem(documento, d, avisos);
    if (lida.tipo === "grafico") descartadas.grafico += 1;
    if (lida.tipo !== "foto") continue;
    const jpeg = lida.bytes;

    // A MESMA porta das fotos que ela carrega à mão. Ver o cabeçalho.
    const validada = await garantirFormatoImprimivel(jpeg, "image/jpeg");
    if (!validada) {
      avisos.push({
        tipo: "imagem-ilegivel",
        mensagem: `Uma fotografia da página ${d.pagina} não passou na validação de imagens e foi deixada de fora.`,
        pagina: d.pagina,
      });
      continue;
    }

    // Pelo CONTEÚDO: a foto da capa é desenhada outra vez na contracapa, e são
    // a mesma foto. Sem isto, ela via a mesma imagem duas vezes na lista e não
    // saberia qual escolher.
    const chave = imageContentKey(validada.bytes);
    const ja = porChave.get(chave);
    if (ja) {
      ja.vezes += 1;
      continue;
    }
    const foto: FotoDoPdf = {
      chave,
      bytes: validada.bytes.toString("base64"),
      origem: {
        pagina: d.pagina,
        x: arredondar(d.x),
        y: arredondar(d.y),
        largura: arredondar(d.largura),
        altura: arredondar(d.altura),
      },
      vezes: 1,
      // Quem sabe onde é que uma foto pertence é quem viu o documento inteiro —
      // ver `arrumarFotos`, em `index.ts`. Aqui só se sabe onde ela estava.
      destino: null,
      larguraPx: d.larguraPx,
      alturaPx: d.alturaPx,
    };
    porChave.set(chave, foto);
    fotos.push(foto);
  }

  const aviso = avisoDoQueNaoEraFoto(descartadas, desenhadas.length);
  if (aviso) avisos.push(aviso);

  return { fotos, avisos };
}

/**
 * O que se deitou fora e porquê, numa frase.
 *
 * Sem isto, uma proposta com 41 imagens desenhadas devolvia 32 fotografias e
 * nove desaparecidas em silêncio — e é o silêncio que faz alguém abrir o PDF
 * ao lado para conferir se lhe faltou uma fotografia. Nas duas propostas
 * verdadeiras que temos, o que falta são carimbos do Word: o logótipo em oito
 * e em nove páginas, mais um desenho grande de mais para a regra da área e
 * pequeno de mais para ser uma fotografia.
 */
function avisoDoQueNaoEraFoto(
  descartadas: { mobilia: number; pequena: number; grafico: number },
  desenhadas: number,
): Aviso | null {
  const total = descartadas.mobilia + descartadas.pequena + descartadas.grafico;
  if (!total) return null;
  const partes: string[] = [];
  if (descartadas.mobilia)
    partes.push(
      `${descartadas.mobilia} ${descartadas.mobilia === 1 ? "é uma imagem que se repete" : "são imagens que se repetem"} por três ou mais páginas (logótipo, rodapé ou marca de água)`,
    );
  if (descartadas.pequena)
    partes.push(
      `${descartadas.pequena} ${descartadas.pequena === 1 ? "está impressa pequena" : "estão impressas pequenas"} de mais para ser fotografia`,
    );
  if (descartadas.grafico)
    partes.push(
      `${descartadas.grafico} ${descartadas.grafico === 1 ? "tem" : "têm"} transparência, que é coisa de desenho e não de fotografia`,
    );
  return {
    tipo: "imagens-que-nao-sao-fotos",
    mensagem: `Das ${desenhadas} imagens desenhadas neste documento, ${total} não vieram: ${partes.join("; ")}.`,
  };
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * PELA ORDEM EM QUE ESTÃO IMPRESSAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Um PDF guarda as imagens pela ordem que lhe deu jeito, e num exportado do
 * Word essa ordem não tem nada que ver com a página. Medido na proposta de dez
 * páginas: a primeira fila de cinco fotografias está guardada pelos x
 * 18, 367, 524, 685, 182 — a última da fila é a segunda da esquerda. Devolvê-las
 * assim era entregar o mood board baralhado, e a composição volta a desenhá-las
 * exactamente por esta ordem.
 *
 * O que se faz é o que os olhos fazem: agrupar por FILAS e ler cada fila da
 * esquerda para a direita. Uma fila é um grupo de imagens cujos topos estão
 * próximos — e «próximo» mede-se em metade da altura mediana das imagens
 * daquela página, porque uma fila de fotografias pequenas tolera menos
 * desalinhamento do que uma de fotografias grandes.
 *
 * ── PORQUÊ PELO TOPO E NÃO PELA SOBREPOSIÇÃO ──────────────────────────────
 *
 * A tentação é dizer que duas imagens estão na mesma fila quando as suas
 * alturas se sobrepõem. Não serve: nas NOSSAS páginas de inspiração há uma
 * fotografia alta à esquerda que ocupa a página toda ao lado de uma grelha de
 * duas por duas, e a alta sobrepõe-se a todas as quatro — a página inteira
 * virava uma fila só e saía por colunas. Pelo topo, a alta fica na fila de
 * cima com as duas de cima, que é onde o olho a lê.
 *
 * Conferido nas cinco manchas das duas propostas verdadeiras (duas filas de
 * cinco, uma fila de cinco com uma foto solta acima, um mosaico de cinco, uma
 * fila de seis com outra de quatro) e nas nossas: dá a ordem impressa em todas.
 */
function ordemDeLeitura(desenhadas: readonly ImagemDesenhada[]): ImagemDesenhada[] {
  const porPagina = new Map<number, ImagemDesenhada[]>();
  for (const d of desenhadas) {
    const lista = porPagina.get(d.pagina);
    if (lista) lista.push(d);
    else porPagina.set(d.pagina, [d]);
  }

  const out: ImagemDesenhada[] = [];
  for (const pagina of [...porPagina.keys()].sort((a, b) => a - b)) {
    const naPagina = porPagina.get(pagina)!;
    // Um chão de 12 pt para o caso de uma página só com fitas finas: sem ele,
    // uma altura mediana de zero punha tudo em filas de uma imagem cada.
    const banda = Math.max(12, mediana(naPagina.map((d) => d.altura)) / 2);
    // A origem do PDF é em baixo à esquerda: o topo é `y + altura` e a fila de
    // cima é a do topo MAIOR.
    const porTopo = [...naPagina].sort((a, b) => b.y + b.altura - (a.y + a.altura));

    let fila: ImagemDesenhada[] = [];
    let topoAnterior = Infinity;
    const fecharFila = () => {
      // Empate no x (uma coluna) resolve-se pelo topo, de cima para baixo.
      fila.sort((a, b) => a.x - b.x || b.y + b.altura - (a.y + a.altura));
      out.push(...fila);
      fila = [];
    };
    for (const d of porTopo) {
      const topo = d.y + d.altura;
      if (fila.length && topoAnterior - topo > banda) fecharFila();
      fila.push(d);
      topoAnterior = topo;
    }
    fecharFila();
  }
  return out;
}

function mediana(valores: number[]): number {
  if (!valores.length) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  const meio = ordenados.length >> 1;
  return ordenados.length % 2 ? ordenados[meio] : (ordenados[meio - 1] + ordenados[meio]) / 2;
}

function megabytes(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(0);
}

function arredondar(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Os pixéis de uma imagem, recodificados em JPEG.
 *
 * O pdf.js entrega a imagem já descodificada e já composta com a máscara de
 * transparência, num de três formatos. Dois deles são fotografias e trata-se
 * deles; o terceiro (um bit por pixel) nunca é uma fotografia — é um estêncil,
 * uma máscara ou um traço — e recusa-se em vez de se arriscar a devolvê-lo com
 * o preto e o branco trocados, que é o género de erro que passa despercebido
 * até estar impresso.
 */
type ImagemLida =
  | { tipo: "foto"; bytes: Buffer }
  /** Tem transparência a sério: é um logótipo, um selo, um traço. Ver
   *  {@link temTransparencia}. */
  | { tipo: "grafico" }
  | { tipo: "erro" };

async function bytesDaImagem(
  documento: PdfAberto,
  desenhada: ImagemDesenhada,
  avisos: Aviso[],
): Promise<ImagemLida> {
  let crua: {
    width?: number;
    height?: number;
    kind?: number;
    data?: Uint8Array | Uint8ClampedArray;
  } | null = null;
  try {
    const pagina = await documento.getPage(desenhada.pagina);
    // Um id com o prefixo `g_` está na loja GLOBAL do documento (o pdf.js
    // guarda lá as imagens que mais do que uma página usa); os outros estão na
    // loja da página. E pede-se SEMPRE com callback: a versão síncrona atira
    // «Requesting object that isn't resolved yet» porque os pixéis chegam do
    // descodificador depois da lista de operadores.
    const loja = desenhada.id.startsWith("g_") ? pagina.commonObjs : pagina.objs;
    crua = await new Promise((resolve) => {
      let respondeu = false;
      loja.get(desenhada.id, (obj: unknown) => {
        respondeu = true;
        resolve(obj as typeof crua);
      });
      // Cinto: se o descodificador nunca responder, não se fica à espera para
      // sempre dentro de uma função com tempo contado.
      setTimeout(() => {
        if (!respondeu) resolve(null);
      }, 5000).unref?.();
    });
  } catch {
    crua = null;
  }

  const canais = crua?.kind === 3 ? 4 : crua?.kind === 2 ? 3 : 0;
  if (!crua?.data || !crua.width || !crua.height || !canais) {
    avisos.push({
      tipo: crua && !canais ? "formato-desconhecido" : "imagem-ilegivel",
      mensagem:
        crua && !canais
          ? `Uma imagem da página ${desenhada.pagina} está a preto e branco de um bit — não é uma fotografia e não foi trazida.`
          : `Não foi possível descodificar uma imagem da página ${desenhada.pagina}.`,
      pagina: desenhada.pagina,
    });
    return { tipo: "erro" };
  }

  const esperado = crua.width * crua.height * canais;
  if (crua.data.length < esperado) {
    avisos.push({
      tipo: "imagem-ilegivel",
      mensagem: `Uma imagem da página ${desenhada.pagina} chegou incompleta do descodificador.`,
      pagina: desenhada.pagina,
    });
    return { tipo: "erro" };
  }

  if (canais === 4 && temTransparencia(crua.data, esperado)) return { tipo: "grafico" };

  try {
    // Dos pixéis crus para um PNG sem compressão — é a forma mais barata de os
    // pôr num formato que o caminho das fotos de proposta já sabe ler. O
    // trabalho a sério (limitar o lado maior, achatar a transparência contra
    // branco, encodar JPEG baseline) fica onde já está, no
    // `transcodificarParaJpeg`, para não haver duas regras de encode neste
    // projecto a poderem discordar uma da outra.
    const png = await sharp(Buffer.from(crua.data.buffer, crua.data.byteOffset, esperado), {
      raw: { width: crua.width, height: crua.height, channels: canais as 3 | 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer();
    const jpeg = await transcodificarParaJpeg(png);
    return jpeg ? { tipo: "foto", bytes: jpeg } : { tipo: "erro" };
  } catch {
    avisos.push({
      tipo: "imagem-ilegivel",
      mensagem: `Não foi possível converter uma imagem da página ${desenhada.pagina}.`,
      pagina: desenhada.pagina,
    });
    return { tipo: "erro" };
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTOGRAFIA NÃO TEM TRANSPARÊNCIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O logótipo da Líquen aparece PEQUENO no canto de todas as páginas de conteúdo
 * — e aí a regra da área já o deixa de fora — mas aparece GRANDE nas duas
 * capas, com 148 e 168 pontos de largura. Aí a área não chega, e a repetição
 * também não: está em duas páginas, exactamente como a fotografia da capa, que
 * o documento repete na contracapa de propósito. Uma proposta sem uma única
 * fotografia voltava com uma «fotografia»: a marca da casa.
 *
 * O que separa mesmo as duas coisas é o canal alfa. Uma fotografia é um
 * rectângulo cheio; um logótipo, um selo ou um traço têm buracos, e é por
 * causa deles que foram guardados com transparência. Basta um pixel que não
 * seja opaco.
 *
 * O limiar é 250 e não 255: uma máscara de transparência guardada com perdas
 * (ou reamostrada pelo descodificador) chega com 254 nos cantos de uma imagem
 * que é opaca. Sai à primeira que encontra — num logótipo, é logo o canto
 * superior esquerdo; numa fotografia opaca percorre-se o canal todo, que são
 * uns milissegundos.
 */
function temTransparencia(dados: Uint8Array | Uint8ClampedArray, esperado: number): boolean {
  for (let i = 3; i < esperado; i += 4) {
    if (dados[i] < 250) return true;
  }
  return false;
}
