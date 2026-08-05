import "server-only";
import { createHash } from "node:crypto";
import sharp, { type JpegOptions } from "sharp";

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
 * Recorta `bytes` ao aspeto exato da caixa e reencoda em JPEG baseline.
 *
 * Duas tentativas antes de desistir: o recorte inteligente (`attention`, que
 * escolhe a zona com mais interesse visual) e, se esse falhar, um recorte ao
 * centro com `failOn: "none"` — que aceita ficheiros truncados ou com avisos.
 * Só se as duas falharem devolve `null`, e aí quem chama tem de decidir o que
 * fazer com o original. Nunca lança.
 */
export async function resizeToBox(
  bytes: Buffer,
  widthPt: number,
  heightPt: number,
  placement: ImagePlacement,
): Promise<Buffer | null> {
  if (bytes.length < 32) return null;
  const { width, height } = pixelsForBox(widthPt, heightPt, placement);
  const crop = async (position: string, failOn: "warning" | "none") =>
    sharp(bytes, { failOn })
      .rotate() // aplica a orientação EXIF, senão as fotos de telemóvel saem deitadas
      .resize(width, height, { fit: "cover", position, kernel: "lanczos3" })
      .jpeg(PDF_JPEG_OPTIONS)
      .toBuffer();
  try {
    return await crop("attention", "warning");
  } catch {
    /* segue para a tentativa tolerante */
  }
  try {
    return await crop("centre", "none");
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
 * Garante que os bytes que vão ser GUARDADOS estão num formato que o PDF sabe
 * imprimir: o que já é JPEG/PNG passa intacto, o resto é convertido para JPEG.
 *
 * É a porta de entrada. O estúdio continua a poder carregar WebP — é o formato
 * em que o Pinterest, a principal fonte de inspiração, serve as imagens — mas o
 * que fica no armazenamento (e portanto o que um dia entra no PDF) é sempre um
 * formato imprimível. Recusar o WebP à porta fecharia o fluxo de trabalho; o
 * problema nunca foi aceitar o formato, foi guardá-lo.
 *
 * `null` = nem o sharp lê estes bytes; quem chama recusa o ficheiro (não é uma
 * imagem que se possa guardar, porque nunca chegaria a ser impressa).
 */
export async function garantirFormatoImprimivel(
  bytes: Buffer,
  contentType: string,
): Promise<{ bytes: Buffer; contentType: string } | null> {
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
