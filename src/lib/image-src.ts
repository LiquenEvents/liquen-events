import { heroImageLoader } from "./hero-image-loader";

/**
 * O URL de uma cópia já optimizada e do tamanho certo de uma imagem — usado
 * pela camada WebGL do herói (HeroCanvas) para puxar uma textura para a GPU em
 * vez de carregar o original em tamanho inteiro.
 *
 * ISTO CONSTRUÍA UM URL DO `/_next/image` À MÃO, e passou a apontar para o
 * vazio. Desde que `next.config.ts` declara um `loaderFile`, o optimizador
 * responde 404 a tudo: `next-server.js` faz `render404` mal veja
 * `images.loader !== 'default'`, antes de olhar sequer para os parâmetros.
 * Medido nos dois sentidos, com um build de produção de cada lado — o mesmo
 * pedido dá 200 com o carregador por omissão e 404 com o nosso. A falha aqui
 * era silenciosa (a camada WebGL ficava sem textura e a página continuava
 * apresentável), que é a pior espécie: ninguém dava por ela.
 *
 * Agora delega no mesmo carregador que desenha os heróis, portanto a textura
 * vem do MESMO ficheiro estático que o `<img>` do herói já pediu — e o browser
 * serve-a da cache em vez de descarregar uma segunda cópia. Era essa a intenção
 * original do comentário que aqui estava; passou a ser verdade.
 *
 * `width` já não tem de coincidir com os `deviceSizes` configurados nem a
 * qualidade com a lista `images.qualities`: nada disto passa pelo optimizador,
 * a qualidade está cozida no ficheiro e a largura arredonda para a escada dos
 * heróis.
 */
export function sizedImageSrc(src: string, width: number): string {
  return heroImageLoader({ src, width, quality: 75 });
}
