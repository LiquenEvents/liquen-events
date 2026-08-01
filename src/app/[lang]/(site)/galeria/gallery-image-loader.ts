/**
 * Loader do next/image para as MINIATURAS da galeria (grelha, satélites,
 * mosaico-herói e a tira do lightbox).
 *
 * PORQUÊ. A queixa da dona — "nem todas as fotos carregam", com mosaicos a
 * mostrar "Foto indisponível" sempre nos mesmos sítios — vinha toda do mesmo
 * sítio: cada miniatura da grelha era uma transformação on-demand no
 * `/_next/image`. Uma travessia completa da galeria media 431 a 442 URLs
 * distintos de `/_next/image`; a união de 8 classes de dispositivo dava 2 637.
 * Isso deixa a galeria dependente, foto a foto, de um serviço de terceiros que
 * tem quota mensal (esgotada, devolve 402 às transformações NOVAS enquanto as
 * já em cache continuam a servir — exactamente "umas sim, outras não, sempre
 * as mesmas") e que, medido, passa de 219 ms por transformação a frio isolada
 * para 2 900 ms numa rajada de 30 em simultâneo.
 *
 * O QUE ISTO FAZ. Cada candidato do srcset passa a apontar para um WebP
 * estático produzido no build por `scripts/pregen-gallery.mjs`:
 * `/_img/g/<chave>-<largura>.webp`. Um ficheiro estático servido pelo CDN não
 * tem quota, não tem encode, não tem arranque a frio e não pode "esgotar o
 * tempo". Medido: pedidos ao `/_next/image` numa travessia completa passam de
 * 442 para 4 (secretária) e de 433 para 4 (telemóvel), com PARIDADE de bytes
 * (47,49 -> 47,33 MB), porque é o mesmo sharp com a mesma qualidade.
 *
 * É o mesmo padrão já em produção para os seis heróis de página
 * (src/lib/hero-image-loader.ts + scripts/pregen-heroes.mjs), alargado das 6
 * fotos dos heróis às 427 da galeria.
 *
 * Sem manifesto de propósito: TODAS as fotos de photos-data.ts são
 * pré-geradas, por isso não vale a pena embarcar 427 chaves no bundle do
 * cliente. Se ainda assim um ficheiro faltar, o `<GalleryImage>` re-tenta e
 * acaba por servir o original de `/imagens/x.jpg` — a rede de segurança
 * mantém-se intacta.
 *
 * Manter GALLERY_WIDTHS / GALLERY_QUALITY / a chave em sincronia com
 * scripts/pregen-gallery.mjs (esse ficheiro é .mjs e não pode importar TS).
 * Há um teste que falha se saírem de sincronia.
 */
import type { ImageLoaderProps } from "next/image";

/**
 * As larguras que `scripts/pregen-gallery.mjs` emite.
 *
 * A ESCADA TEM DE SER UM SUBCONJUNTO DAS LARGURAS QUE O next/image PEDE
 * (deviceSizes + imageSizes do next.config.ts). O loader arredonda cada
 * candidato do srcset PARA CIMA até à largura pré-gerada mais próxima; se a
 * escada tiver um valor que não existe no srcset, paga-se um degrau a mais.
 * Medido com a escada [384,640,960,1280] em 1440x900 DPR2: o mosaico mede 479
 * CSS px, o browser escolhe (correctamente) o candidato de 1024w e, como
 * 1024 > 960, o loader subia para o ficheiro de 1280 — 48 de 48 mosaicos
 * servidos a 175 KB em vez de ~107 KB (+63%). Com 1024 na escada o degrau
 * desaparece e os bytes ficam iguais aos do optimizador.
 */
export const GALLERY_WIDTHS = [384, 640, 768, 1024, 1280] as const;

/** A qualidade WebP com que os ficheiros são gerados (fica cozida no ficheiro). */
export const GALLERY_QUALITY = 65;

/** Basename sem extensão, tudo fora de [A-Za-z0-9_-] colapsado em "_". */
export function galleryKey(src: string): string {
  const base = (src.split("/").pop() ?? src).replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]/g, "_");
}

/** Arredonda para cima até à largura pré-gerada mais próxima (satura no topo). */
export function snapGalleryWidth(width: number): number {
  return GALLERY_WIDTHS.find((w) => w >= width) ?? GALLERY_WIDTHS[GALLERY_WIDTHS.length - 1];
}

/** O ficheiro estático a que uma foto + largura corresponde. */
export function galleryImageUrl(src: string, width: number): string {
  return `/_img/g/${galleryKey(src)}-${snapGalleryWidth(width)}.webp`;
}

/**
 * Só as fotos que vivem em /imagens/ têm ficheiros pré-gerados. Qualquer outra
 * origem recebe o ficheiro original tal e qual.
 *
 * Este ramo mandava a origem inesperada para o `/_next/image`, com o comentário
 * de que assim o carregador "não podia devolver silenciosamente um 404". Passou
 * a garantir exactamente o 404 que queria evitar: desde que `next.config.ts`
 * declara um `loaderFile`, o optimizador responde 404 a TUDO — é o próprio
 * Next (`next-server.js` faz `render404` mal veja `images.loader !== 'default'`)
 * e não uma opção nossa. Medido: 200 com o carregador por omissão, 404 com o
 * nosso.
 *
 * O original é maior, mas existe. É a mesma escolha que o `<GalleryImage>` já
 * faz quando uma miniatura falha.
 */
export function galleryImageLoader({ src, width }: ImageLoaderProps): string {
  if (src.startsWith("/imagens/")) return galleryImageUrl(src, width);
  return src;
}
