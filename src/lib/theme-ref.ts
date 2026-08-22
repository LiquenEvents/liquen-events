/**
 * ════════════════════════════════════════════════════════════════════════════
 * UMA FOTO DA BIBLIOTECA DENTRO DE UMA PROPOSTA — A REFERÊNCIA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Até aqui, escolher uma foto da Biblioteca de Temas para um mood board COPIAVA
 * os bytes para a pasta da proposta. Isto substitui a cópia por uma referência:
 * o documento passa a guardar `tema:<pasta>/<ficheiro>.jpg` e a foto continua a
 * viver — uma só vez — no bucket da biblioteca.
 *
 * ── Porquê ────────────────────────────────────────────────────────────────
 * Não é o espaço em disco (esse é um bónus: ~576 KB por foto por proposta). É a
 * IDENTIDADE. Uma foto copiada para `proposal-assets/<pedido>/<uuid>.jpg` é,
 * para o navegador, um ficheiro que ele nunca viu — mesmo tendo acabado de
 * descarregar exactamente os mesmos bytes no seletor de temas, e mesmo estando
 * a miniatura já guardada pelo service worker. A cópia deita fora a cache.
 * Importar catorze fotos para um mood board fazia a grelha voltar a descarregar
 * catorze miniaturas que o telemóvel já tinha no disco.
 *
 * Com a referência, o URL que a grelha do estúdio pede é o MESMO
 * `theme-thumbs/<pasta>/<ficheiro>.jpg` que o seletor já pediu — e o
 * `public/sw.js`, que guarda por caminho sem token, responde do disco.
 *
 * ── O formato, e porque tem prefixo ───────────────────────────────────────
 * Um caminho de proposta é `<pedido>/<uuid>.jpg`; um caminho de tema é
 * `<pasta>/<ficheiro>.jpg`. São indistinguíveis pela forma. Sem prefixo, um
 * caminho de tema guardado num documento seria lido como uma foto da pasta de
 * um pedido chamado "italia" — e resolveria para nada, em silêncio.
 *
 * O prefixo `tema:` resolve isso e ainda tem duas propriedades que interessam:
 * `isProposalPath` recusa-o (não tem a forma de um caminho de pedido, e o `:`
 * não passa a validação), e quem abrir uma cópia de segurança do documento vê
 * de onde a foto vem sem ter de perguntar a ninguém.
 *
 * ── O que acontece se a foto for apagada da biblioteca ────────────────────
 * O motivo pelo qual a cópia existia era esse, e continua a ser válido: uma
 * proposta ENVIADA não pode perder fotos porque a biblioteca foi arrumada.
 * A resposta não é copiar sempre — é copiar no único momento em que faz falta.
 * Ver `materializarAntesDeApagar` em `theme-storage.ts`: apagar uma foto da
 * biblioteca copia-a primeiro para as propostas que a referenciam e reescreve
 * lá o caminho. A cópia deixa de ser o caso normal e passa a ser o caso raro.
 *
 * Este módulo não importa nada — nem de servidor, nem de outro módulo do
 * projecto — porque tem de ser legível dos dois lados da fronteira: o
 * `proposal-storage.ts` resolve estas referências e o `theme-storage.ts`
 * produ-las, e um já importa o outro.
 */

/** Bucket das fotos da Biblioteca de Temas, em tamanho de arquivo (2200 px). */
export const THEME_BUCKET = "theme-assets";

/**
 * A derivada INTERMÉDIA (1200 px) das fotos da Biblioteca.
 *
 * A razão está escrita ao lado da irmã das propostas
 * (`PROPOSAL_MID_BUCKET`, em `proposal-storage.ts`): a grelha da página do
 * casal esticava uma miniatura de 400 px para os ~1030 que um telemóvel
 * moderno pede, e via-se. Uma foto referida da Biblioteca dentro de um mood
 * board tem exactamente o mesmo problema, e por isso tem a mesma solução.
 */
export const THEME_MID_BUCKET = "theme-medias";

/** Miniaturas (400 px) — a mesma chave do original, noutro bucket. */
export const THEME_THUMB_BUCKET = "theme-thumbs";

/** Derivada mínima (96 px) para tiras e pré-visualizações. */
export const THEME_MICRO_BUCKET = "theme-micro";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * A MESMA MINIATURA, EM AVIF
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela: «tudo aquilo que seja carregamento de imagens, quero que
 * melhores mesmo o máximo possível».
 *
 * Um AVIF pesa mais 25 a 40% MENOS do que o WebP com a mesma qualidade
 * percebida — e contra o JPEG de onde isto partiu, metade. Numa lista de 25
 * temas é a diferença entre ~0,6 MB e ~0,4 MB; num tema aberto com 60
 * miniaturas, entre ~1,5 MB e ~0,9 MB.
 *
 * ── PORQUE É QUE VIVE NUM BUCKET SEPARADO ────────────────────────────────
 *
 * Porque o AVIF NÃO é universal: o Safari só o lê desde o iOS 16, e estas
 * fotografias são também as que um casal abre na página da proposta, no
 * telemóvel que tiver. Substituir o WebP por AVIF era arriscar uma proposta sem
 * imagens em troca de uns quilobytes.
 *
 * Em bucket próprio, o AVIF é uma OFERTA: o `<picture>` propõe-o primeiro e o
 * navegador que não o souber ler pede o WebP, que está no bucket de sempre e
 * existe sempre. Quem ganha ganha; quem não ganha fica exactamente como estava.
 *
 * O caminho dentro do bucket é o mesmo — é o que permite assinar os dois lados
 * com a mesma lista e alinhar as respostas sem um segundo mapa.
 */
export const THEME_AVIF_BUCKET = "theme-avif";
/** O irmão das micro (96 px) em AVIF. Ver `THEME_AVIF_BUCKET`. */
export const THEME_AVIF_MICRO_BUCKET = "theme-avif-micro";

/**
 * Validade dos URLs assinados da biblioteca: 6 horas.
 *
 * Está aqui, e não junto ao resto do `theme-storage.ts`, por causa da
 * referência: quando o `proposal-storage.ts` assina um `tema:…` tem de usar
 * ESTE prazo e não o das propostas (10 anos). São duas decisões diferentes
 * sobre dois riscos diferentes — a pasta de um pedido tem as fotos de um casal
 * e é pequena; a biblioteca tem milhares de ficheiros e é o activo do estúdio,
 * por isso cada URL que escapa dela custa mais.
 */
export const THEME_SIGNED_TTL = 60 * 60 * 6;

/** O que marca uma referência à biblioteca dentro de um documento de proposta. */
export const THEME_REF_PREFIX = "tema:";

/**
 * `true` se `ref` é um caminho bem formado do bucket de temas —
 * `<pasta>/<ficheiro>.<ext>`, sem travessias e sem query.
 *
 * É a MESMA validação que já filtrava o que entrava na importação, e continua a
 * ser o único sítio onde a forma de um caminho de tema é decidida.
 */
export function isThemePath(ref: unknown): ref is string {
  return typeof ref === "string" && /^[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\.(jpe?g|png|webp)$/i.test(ref);
}

/** A pasta (id do tema) a que um caminho pertence; "" se o caminho for inválido. */
export function themeIdOfPath(ref: string): string {
  return isThemePath(ref) ? ref.slice(0, ref.indexOf("/")) : "";
}

/** A referência que se guarda no documento, para um caminho da biblioteca. */
export function refDeTema(themePath: string): string {
  return `${THEME_REF_PREFIX}${themePath}`;
}

/**
 * `true` se `ref` é uma referência à biblioteca **e** o caminho lá dentro é
 * válido.
 *
 * As duas coisas na mesma pergunta de propósito: quem chama nunca fica com um
 * `tema:` cujo interior ainda tem de validar. `tema:../../etc/passwd` responde
 * `false` aqui e não chega a ver o Storage.
 */
export function ehRefDeTema(ref: unknown): ref is string {
  return (
    typeof ref === "string" &&
    ref.startsWith(THEME_REF_PREFIX) &&
    isThemePath(ref.slice(THEME_REF_PREFIX.length))
  );
}

/** O caminho do Storage dentro de uma referência; "" se não for uma. */
export function caminhoDoRefDeTema(ref: unknown): string {
  return ehRefDeTema(ref) ? ref.slice(THEME_REF_PREFIX.length) : "";
}

/**
 * Separa uma lista de referências de documento em "da biblioteca" e "da pasta
 * da proposta", preservando a ordem dentro de cada grupo.
 *
 * Existe porque quem assina em LOTE tem de fazer dois pedidos, um por bucket, e
 * depois voltar a juntá-los pela referência ORIGINAL — que é a chave que o
 * documento guarda e a única que quem desenha conhece.
 */
export function separarRefs(refs: readonly string[]): {
  daBiblioteca: string[];
  daProposta: string[];
} {
  const daBiblioteca: string[] = [];
  const daProposta: string[] = [];
  for (const r of refs) {
    if (ehRefDeTema(r)) daBiblioteca.push(r);
    else if (r) daProposta.push(r);
  }
  return { daBiblioteca, daProposta };
}
