import "server-only";
import { createHash } from "node:crypto";
import sharp, { type JpegOptions } from "sharp";
import type { MotivoDeRecusa } from "./recusa-de-imagem";

/**
 * Preparação das fotos que entram no PDF da proposta.
 *
 * Uma foto da biblioteca é guardada com o preset de CAPA (3000 px de lado maior,
 * q0.92 — 2,5 a 3,5 MB), porque pode acabar impressa em página inteira. Mas o
 * mesmo ficheiro pode ser desenhado numa célula de mood board com ~150 pt de
 * largura. Embutir os 3000 px nessa célula é desperdício puro: o leitor de PDF
 * tem de descodificar megapixéis que nunca chega a mostrar — é isso que torna o
 * documento pesado a fazer scroll.
 *
 * Este módulo responde a uma só pergunta: dada a CAIXA (em pontos PDF) onde a
 * foto vai mesmo ser desenhada, quantos pixéis valem a pena e com que encode.
 */

/**
 * O `sharp` em ambiente serverless: uma operação de cada vez, sem cache.
 *
 * ── Porquê ────────────────────────────────────────────────────────────────
 * Por omissão o libvips abre tantas linhas de trabalho quantos os núcleos e
 * guarda bitmaps descomprimidos em cache. Numa função serverless isso é a
 * receita para bater no tecto de memória: uma foto de 2200×1475 ocupa ~10 MB
 * já descodificada, e uma proposta traz catorze. Com várias em paralelo mais a
 * cache, sobe depressa acima do que a função tem.
 *
 * E quando o `sharp` fica sem memória, ATIRA — e o gerador de PDF apanha, usa o
 * ORIGINAL, e o documento sai com as fotos em tamanho de armazenamento. Foi
 * exactamente o que aconteceu a um PDF verdadeiro: 3,31 MB com fotos a
 * 266–576 DPI quando o código manda 130–160 (ver PDF-BEFORE.md).
 *
 * Uma de cada vez é mais lento em teoria e não na prática: a função tem 1 ou 2
 * núcleos, portanto o paralelismo do libvips estava sobretudo a multiplicar
 * memória, não a poupar tempo.
 *
 * Corre uma vez por processo, no carregamento do módulo. Se a plataforma não
 * expuser estes controlos, segue sem eles em vez de rebentar.
 */
try {
  sharp.concurrency(1);
  sharp.cache(false);
} catch {
  /* sem controlo de concorrência nesta plataforma — segue com o que houver */
}

/** Onde a foto é desenhada — cada sítio tem o seu orçamento de resolução. */
export type ImagePlacement = "cover" | "collage";

/**
 * Orçamento de resolução, em DPI à dimensão IMPRESSA.
 *
 * Uma caixa PDF mede-se em pontos = 1/72 de polegada, portanto uma caixa de
 * `w` pt a `d` DPI precisa de `w × d / 72` pixéis. O raciocínio por sítio:
 *
 * · capa (160 DPI) — as duas tiras da capa correm de topo a fundo da A4
 *   paisagem (≈ 98 × 210 mm cada). É a única foto impressa em grande e a
 *   primeira coisa que o cliente vê, por isso leva o orçamento maior. A 160 DPI
 *   uma tira dá ≈ 617 × 1323 px: numa prova impressa à distância normal de
 *   leitura é indistinguível de 300 DPI (o olho resolve ~150 DPI a 30 cm), e
 *   custa 3,5× menos pixéis do que os 300 DPI de artes gráficas.
 *
 * · mood board (130 DPI) — as células do collage têm no máximo ~2 polegadas de
 *   largura e há até 6 por página. A 130 DPI uma célula pequena dá ≈ 265 px:
 *   mais do que isso não é visível àquele tamanho e multiplica-se por seis em
 *   cada página de inspiração, que é onde o scroll mais sofre.
 *
 * Não subir estes valores sem medir: o peso do PDF é ~95% streams de imagem e
 * cresce com o QUADRADO do DPI.
 */
const PLACEMENT_DPI: Record<ImagePlacement, number> = {
  cover: 160,
  collage: 130,
};

/** Nunca ampliar acima disto — protege contra uma caixa absurda pedir uma
 *  imagem gigante (e o original raramente tem mais do que isto de lado maior). */
export const MAX_IMAGE_EDGE_PX = 2200;

/**
 * Encode dos JPEG que entram no PDF.
 *
 * `mozjpeg: true` (o que aqui estava) liga `optimiseScans`, que FORÇA JPEG
 * progressivo — e um JPEG progressivo dentro de um PDF é má ideia: o filtro
 * DCTDecode do PDF foi especificado à volta do JPEG baseline (o Acrobat nunca
 * suportou progressivo em DCTDecode) e, nos leitores que o aceitam, descodificar
 * exige várias passagens sobre um buffer de coeficientes da imagem inteira em
 * vez de um descodificador linha-a-linha. É exatamente o custo que se paga de
 * cada vez que uma página entra no ecrã durante o scroll.
 *
 * Ficamos com o resto do mozjpeg (trellis, overshoot deringing, tabela de
 * quantização 3), que dá praticamente os mesmos bytes SEM progressivo:
 * medido numa tira de capa, 101 KB baseline vs 99 KB progressivo.
 */
export const PDF_JPEG_OPTIONS: JpegOptions = {
  quality: 84,
  // Explícito e inegociável: baseline, nunca progressivo.
  progressive: false,
  optimiseScans: false,
  trellisQuantisation: true,
  overshootDeringing: true,
  quantisationTable: 3,
  // 4:2:0 é o padrão de fotografia web — invisível numa foto, ~metade dos bytes.
  chromaSubsampling: "4:2:0",
};

export interface TargetPixels {
  width: number;
  height: number;
}

/**
 * Pixéis que vale a pena embutir para uma caixa de `widthPt × heightPt` pontos.
 * Ambas as dimensões escalam pelo mesmo fator, portanto o aspeto da CAIXA é
 * preservado — desenhar o resultado às medidas da caixa nunca pode esticar.
 */
export function pixelsForBox(
  widthPt: number,
  heightPt: number,
  placement: ImagePlacement,
): TargetPixels {
  const perPoint = PLACEMENT_DPI[placement] / 72;
  let width = Math.max(1, Math.round(widthPt * perPoint));
  let height = Math.max(1, Math.round(heightPt * perPoint));
  const over = Math.max(width, height) / MAX_IMAGE_EDGE_PX;
  if (over > 1) {
    width = Math.max(1, Math.round(width / over));
    height = Math.max(1, Math.round(height / over));
  }
  return { width, height };
}

/**
 * Identidade do CONTEÚDO dos bytes, para o gerador não voltar a redimensionar
 * nem a embutir a mesma foto duas vezes (a capa é desenhada na página 1 E na
 * contracapa, e a mesma foto pode ser escolhida para os dois lados). Não é uso
 * criptográfico — é só uma chave de cache.
 */
export function imageContentKey(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("base64url").slice(0, 22);
}

/**
 * A cor contra a qual a TRANSPARÊNCIA é achatada antes de virar JPEG.
 *
 * ── Porque é que isto tem de existir ──────────────────────────────────────
 *
 * O JPEG não tem canal alfa. Quando o `sharp` escreve um JPEG a partir de uma
 * imagem com transparência, a banda alfa é DEITADA FORA — e o que fica é a cor
 * que estava guardada por baixo. Nos PNG que o Photoshop, o Canva e o browser
 * exportam, essa cor é preto. Resultado: um PNG com fundo transparente — um
 * recorte, um logótipo, um desenho — que no back office aparece bem (o ecrã é
 * branco por trás) saía no PDF como uma MANCHA PRETA.
 *
 * Foi assim que uma imagem carregada na biblioteca de temas chegou ao cliente:
 * a foto estava lá, tinha sido guardada, tinha sido descarregada, tinha sido
 * desenhada — e era um rectângulo preto.
 *
 * Achatar contra branco dá exactamente o que a pessoa via no ecrã, porque o
 * ecrã por trás é branco. E o achatamento é feito ANTES do redimensionamento,
 * pela mesma razão que já está explicada em `achatarLogotipo`: encolher
 * primeiro deixaria os pixéis das bordas meio-transparentes a misturarem-se
 * entre si antes de saberem contra que cor vão assentar, e ficaria um halo.
 */
const FUNDO_BRANCO = { r: 255, g: 255, b: 255 };

/**
 * As dimensões que a imagem tem DEPOIS de aplicada a orientação EXIF.
 *
 * `metadata()` devolve as dimensões como estão guardadas; uma foto de telemóvel
 * com orientação 5 a 8 é mostrada com a largura e a altura TROCADAS, e é sobre
 * essas que o recorte trabalha (porque `resizeToBox` faz `.rotate()` primeiro).
 * Devolve `null` quando nem o sharp lê os bytes — quem chama segue sem limite,
 * que é o comportamento de sempre.
 */
async function dimensoesReais(bytes: Buffer): Promise<{ w: number; h: number } | null> {
  try {
    const m = await sharp(bytes, { failOn: "none" }).metadata();
    if (!m.width || !m.height) return null;
    const deitada = typeof m.orientation === "number" && m.orientation >= 5;
    return deitada ? { w: m.height, h: m.width } : { w: m.width, h: m.height };
  } catch {
    return null;
  }
}

/**
 * Recorta `bytes` ao aspeto exato da caixa e reencoda em JPEG baseline.
 *
 * Duas tentativas antes de desistir: a estrita e, se essa falhar, uma tolerante
 * (`failOn: "none"`), que aceita ficheiros truncados ou com avisos. Só se as
 * duas falharem devolve `null`, e aí quem chama tem de decidir o que fazer com
 * o original. Nunca lança.
 *
 * ── O RECORTE É AO CENTRO, E É DE PROPÓSITO ───────────────────────────────
 *
 * Era `attention` — o recorte "inteligente" do sharp, que escolhe a zona com
 * mais interesse visual. Duas razões para sair:
 *
 * 1. O estúdio mostra-lhe a foto com `object-cover`, que corta AO CENTRO. Com
 *    `attention`, o que ela escolhia no ecrã e o que saía no PDF eram recortes
 *    diferentes da mesma fotografia — e numa caixa de capa, que é altíssima e
 *    estreita, sobra tão pouca largura que os dois recortes podem não ter nada
 *    em comum. É a definição de «desconfigurada»: ela reconhece a foto, mas não
 *    reconhece o que lá está.
 *
 * 2. `attention` persegue saturação e contornos, não pessoas. Numa fotografia
 *    de casamento escolhe as flores e as luzes e corta as caras.
 *
 * E as DUAS tentativas usam agora o mesmo recorte. Antes, a tentativa tolerante
 * usava `centre` e a primeira `attention`: a mesma foto na mesma caixa saía
 * enquadrada de uma maneira ou de outra consoante os bytes estivessem limpos —
 * um resultado que mudava sem nada ter mudado.
 */
export async function resizeToBox(
  bytes: Buffer,
  widthPt: number,
  heightPt: number,
  placement: ImagePlacement,
): Promise<Buffer | null> {
  if (bytes.length < 32) return null;
  let { width, height } = pixelsForBox(widthPt, heightPt, placement);

  /**
   * NÃO INVENTAR PIXÉIS.
   *
   * `pixelsForBox` diz quantos pixéis a caixa MERECE, sem olhar para o que a
   * foto tem. Uma foto pequena — e o carregamento deixa passar intacto qualquer
   * JPEG abaixo de 1,5 MB, que pode ter 800 px de largura — era ampliada pelo
   * lanczos até aos 617×1323 da capa e só depois recortada. Ampliar não
   * acrescenta detalhe nenhum: acrescenta peso e desfoque.
   *
   * Aqui as duas medidas descem pelo MESMO fator, portanto o aspeto da caixa
   * mantém-se exacto e o desenho continua a não poder esticar nada. A foto sai
   * com menos pixéis do que a caixa gostaria — que é a verdade do ficheiro que
   * ela carregou, e é melhor mostrá-la do que fingir o contrário.
   */
  const origem = await dimensoesReais(bytes);
  if (origem) {
    const ampliacao = Math.max(width / origem.w, height / origem.h);
    if (ampliacao > 1) {
      width = Math.max(1, Math.round(width / ampliacao));
      height = Math.max(1, Math.round(height / ampliacao));
    }
  }

  const crop = async (failOn: "warning" | "none") =>
    sharp(bytes, { failOn })
      .rotate() // aplica a orientação EXIF, senão as fotos de telemóvel saem deitadas
      .flatten({ background: FUNDO_BRANCO }) // transparência → branco, nunca preto
      .resize(width, height, { fit: "cover", position: "centre", kernel: "lanczos3" })
      .jpeg(PDF_JPEG_OPTIONS)
      .toBuffer();
  try {
    return await crop("warning");
  } catch {
    /* segue para a tentativa tolerante */
  }
  try {
    return await crop("none");
  } catch {
    return null;
  }
}

/**
 * Os únicos formatos que o PDF sabe embutir DIRECTAMENTE: o `pdf-lib` só tem
 * `embedJpg` e `embedPng`. Tudo o resto (WebP, AVIF…) tem de passar primeiro
 * pelo sharp — ver `transcodificarParaJpeg`.
 */
export function embutivelNoPdf(contentType: string): boolean {
  return /^image\/(jpe?g|png)$/i.test(contentType);
}

/**
 * Reencoda quaisquer bytes que o sharp saiba ler em JPEG baseline.
 *
 * Existe por causa de uma proposta real que seguiu para um cliente com quatro
 * molduras vazias: as fotos vinham do Pinterest, que serve WebP, e o `pdf-lib`
 * não sabe embutir WebP. O caminho normal (`resizeToBox`) já reencodava tudo
 * para JPEG, mas quando ESSE falha o gerador cai no original — e aí um WebP não
 * era desenhado de todo.
 *
 * Corta no `MAX_IMAGE_EDGE_PX` pela mesma razão que o resto do módulo: nada
 * entra no documento com mais pixéis do que os que chegam a ser vistos. `fit:
 * "inside"` preserva o aspeto, portanto o desenho por recorte de quem chama
 * continua a não poder esticar nada.
 *
 * Duas tentativas, como em `resizeToBox`: a estrita e a tolerante a ficheiros
 * truncados. Nunca lança; `null` = nem o sharp consegue ler estes bytes.
 */
export async function transcodificarParaJpeg(bytes: Buffer): Promise<Buffer | null> {
  if (bytes.length < 32) return null;
  const converter = (failOn: "warning" | "none") =>
    sharp(bytes, { failOn })
      .rotate() // orientação EXIF, como no resto do módulo
      .flatten({ background: FUNDO_BRANCO }) // ver `FUNDO_BRANCO`: sem isto, um PNG
      // com transparência sai preto
      .resize({
        width: MAX_IMAGE_EDGE_PX,
        height: MAX_IMAGE_EDGE_PX,
        fit: "inside",
        withoutEnlargement: true,
        kernel: "lanczos3",
      })
      .jpeg(PDF_JPEG_OPTIONS)
      .toBuffer();
  try {
    return await converter("warning");
  } catch {
    /* segue para a tentativa tolerante */
  }
  try {
    return await converter("none");
  } catch {
    return null;
  }
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * UM FICHEIRO QUE CHEGOU A MEIO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Uma fotografia cujo carregamento se interrompeu a meio continua a ser uma
 * imagem válida do ponto de vista do descodificador: tem cabeçalho, tem
 * dimensões, e o `sharp` desenha-a — até onde os dados chegam. O resto sai
 * CINZENTO. Era guardada, era desenhada, e contava como boa: a proposta seguia
 * para o casal com meia fotografia e uma faixa cinzenta por baixo.
 *
 * Detectar isto não precisa de descodificar nada: os três formatos que aqui
 * entram dizem onde acabam.
 *
 *   · o JPEG acaba no marcador EOI (FF D9);
 *   · o PNG acaba no bloco IEND;
 *   · o WebP traz o tamanho declarado no cabeçalho RIFF.
 *
 * Procura-se numa JANELA GENEROSA no fim do ficheiro (e não exactamente nos
 * últimos dois bytes) porque há máquinas que deixam lixo, miniaturas ou XMP
 * depois do fim. O erro que não se pode cometer é recusar uma foto boa; deixar
 * passar uma partida é o comportamento que já havia.
 */
export function ficheiroIncompleto(bytes: Buffer, contentType: string): boolean {
  const ehJpeg = bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8;
  const ehPng = bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e;
  const ehWebp =
    bytes.length > 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP";

  if (ehJpeg) {
    const janela = bytes.subarray(Math.max(0, bytes.length - 2048));
    return janela.indexOf(Buffer.from([0xff, 0xd9])) === -1;
  }
  if (ehPng) {
    const janela = bytes.subarray(Math.max(0, bytes.length - 64));
    return janela.indexOf("IEND", 0, "ascii") === -1;
  }
  if (ehWebp) {
    // O RIFF diz quantos bytes vêm DEPOIS dos oito primeiros.
    const declarado = bytes.readUInt32LE(4) + 8;
    return bytes.length < declarado;
  }
  // Formato que não sabemos ler ao fim: não se inventa um diagnóstico.
  const _ = contentType;
  return false;
}

/**
 * Isto é um HEIC do iPhone?
 *
 * A caixa `ftyp` está no princípio do ficheiro e traz a MARCA. As do HEIC são
 * as da família HEVC; o AVIF usa a mesma caixa com a marca `avif`, e esse o
 * `sharp` lê — por isso a lista é explícita em vez de «tudo o que tem ftyp».
 */
export function pareceHeic(bytes: Buffer): boolean {
  if (bytes.length < 12 || bytes.toString("ascii", 4, 8) !== "ftyp") return false;
  const marca = bytes.toString("ascii", 8, 12);
  return ["heic", "heix", "hevc", "hevx", "heim", "heis", "hevm", "hevs", "mif1", "msf1"].includes(
    marca,
  );
}

/** Porque é que estes bytes não servem — para se poder DIZER, em vez de dar o
 *  mesmo «não foi possível processar a imagem» a três avarias diferentes. O
 *  tipo e as frases vivem em `recusa-de-imagem`, que o navegador também lê. */
export function motivoDaRecusa(bytes: Buffer, contentType: string): MotivoDeRecusa {
  if (ficheiroIncompleto(bytes, contentType)) return "incompleta";
  if (pareceHeic(bytes)) return "heic";
  return "ilegivel";
}

/**
 * Garante que os bytes que vão ser GUARDADOS estão num formato que o PDF sabe
 * imprimir: o que já é JPEG/PNG passa intacto, o resto é convertido para JPEG.
 *
 * É a porta de entrada. O estúdio continua a poder carregar WebP — é o formato
 * em que o Pinterest, a principal fonte de inspiração, serve as imagens — mas o
 * que fica no armazenamento (e portanto o que um dia entra no PDF) é sempre um
 * formato imprimível. Recusar o WebP à porta fecharia o fluxo de trabalho; o
 * problema nunca foi aceitar o formato, foi guardá-lo.
 *
 * Um ficheiro que chegou a meio é recusado AQUI, e é a mudança que interessa:
 * era guardado (é legível!) e só se via meses depois, cinzento, na proposta de
 * alguém. À porta ainda se pode dizer «volte a carregar»; no PDF já não.
 *
 * `null` = estes bytes não podem ser guardados. Quem chama pergunta a
 * {@link motivoDaRecusa} o que dizer à pessoa.
 */
export async function garantirFormatoImprimivel(
  bytes: Buffer,
  contentType: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
  if (ficheiroIncompleto(bytes, contentType)) return null;
  if (embutivelNoPdf(contentType)) return { bytes, contentType };
  const jpeg = await transcodificarParaJpeg(bytes);
  return jpeg ? { bytes: jpeg, contentType: "image/jpeg" } : null;
}

/**
 * DPI a que o logótipo é embutido no PDF.
 *
 * Medido no ficheiro que saía antes disto: o logótipo ia a 720×430 px para ser
 * desenhado com 72 pt de largura — **720 DPI**, quatro vezes e meia acima dos
 * 160 a que as FOTOGRAFIAS são tratadas. Era a única coisa em resolução absurda
 * no documento inteiro, e não era sequer uma foto.
 *
 * 300 é o padrão de impressão, e é o que esta marca precisa: tem ramos de traço
 * fino e a palavra "EVENTS" em corpo pequeno. Experimentei 200 e, comparado
 * lado a lado com o original, o traço perdia definição — o mesmo que já se
 * aprendeu com o favicon, onde os ramos exteriores desapareciam ao encolher.
 *
 * O ganho desta função não era poupar bytes num objecto de 12 KB: era tirar a
 * TRANSPARÊNCIA de todas as páginas. A 300 DPI continuam a sair 2,4× menos
 * pixéis do que os 720 que lá estavam, e a máscara alfa desaparece à mesma.
 */
const LOGO_DPI = 300;

/**
 * Prepara o logótipo para ir ao PDF: **sem canal alfa** e à resolução a que vai
 * ser desenhado.
 *
 * ── Porque é que a transparência sai ──────────────────────────────────────
 * O logótipo era um PNG com máscara alfa (SMask) composto em TODAS as páginas —
 * a única transparência do documento. Num visualizador de PDF, compor
 * transparência é das operações mais caras que há, e estava a ser paga uma vez
 * por página para desenhar uma marca que assenta sempre sobre uma cor CHAPADA e
 * conhecida: branco nas páginas de conteúdo, o verde-escuro da marca nas capas.
 *
 * Achatar contra essa cor dá exactamente o mesmo resultado visual — o olho não
 * distingue um pixel composto na hora de um pixel já composto — e deixa um JPEG
 * simples, que o visualizador desenha sem tocar no motor de transparência.
 *
 * `flatten` ANTES de `resize`, e não depois: reduzir primeiro deixaria os
 * pixéis das bordas meio-transparentes a misturar-se entre si antes de saberem
 * contra que cor vão assentar, e o contorno da marca ficaria com um halo.
 *
 * ── PNG, e não JPEG ───────────────────────────────────────────────────────
 * A regra das FOTOGRAFIAS é JPEG, e está certa. Para uma marca de cor chapada é
 * ao contrário: o JPEG inventa artefactos à volta do traço e desvia a cor dos
 * tons quase pretos, o que na capa desenhava um RECTÂNGULO visível à volta do
 * logótipo — o fundo achatado deixava de bater certo com o painel escuro por
 * baixo. Medido a olho na primeira tentativa, e é por isso que sai PNG: sem
 * perdas, cor exacta, e ainda assim uns poucos KB por ser cor chapada.
 *
 * @param fundo cor sobre a qual o logótipo assenta, em 0–255.
 * @param larguraPt largura em pontos a que vai ser desenhado no PDF.
 * @returns PNG SEM canal alfa, ou `null` se o `sharp` falhar (quem chama decide).
 */
export async function achatarLogotipo(
  png: Buffer,
  fundo: { r: number; g: number; b: number },
  larguraPt: number,
): Promise<Buffer | null> {
  try {
    const largura = Math.max(1, Math.round((larguraPt * LOGO_DPI) / 72));
    return await sharp(png)
      .flatten({ background: fundo })
      .resize({ width: largura, kernel: "lanczos3", withoutEnlargement: true })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    return null;
  }
}
