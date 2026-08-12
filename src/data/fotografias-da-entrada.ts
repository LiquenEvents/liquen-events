/**
 * ════════════════════════════════════════════════════════════════════════════
 * AS FOTOGRAFIAS DA PÁGINA DE ENTRADA DO BACK OFFICE
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── COMO SE TROCA UMA FOTOGRAFIA ──────────────────────────────────────────
 * Muda o `ficheiro` para outro nome que já exista em `public/imagens/`. Mais
 * nada. Não é preciso correr script nenhum: TODA a fotografia dessa pasta já
 * tem as versões pequenas geradas no build (`scripts/pregen-gallery.mjs`), e é
 * dessas que esta página vive.
 *
 * A lista pode ter mais ou menos do que quatro entradas: a rotação conta-as
 * sozinha.
 *
 * ── PORQUE É QUE CADA UMA TEM UM `enquadramento` ──────────────────────────
 * O painel da entrada é ALTO e a fotografia é DEITADA, portanto o que se vê é
 * uma fatia estreita do meio dela: num painel de 720x900 sobra 53% da largura
 * original. Sem escolher o recorte, duas destas fotografias (o ramo e a mesa
 * posta, que são planos aproximados) ficavam cortadas ao lado do assunto. O
 * `enquadramento` é o `object-position` do CSS: primeiro número horizontal,
 * segundo vertical, 50% 50% é o centro. Se trocares a foto e o recorte ficar
 * mal, mexe só nesse par de números.
 *
 * ── E O `desfocado` ───────────────────────────────────────────────────────
 * É a fotografia reduzida a 16 px, em WebP, escrita dentro do próprio código
 * (~200 caracteres). Serve para o painel nascer com a COR e a forma da
 * fotografia em vez de um buraco branco enquanto ela não chega. Sai de
 * `src/lib/blur-map.json`, gerado por `npm run gen:blur`, e é COPIADO e não
 * importado de propósito: esse mapa tem 557 entradas e 106 KB, e este ficheiro
 * é lido pelo browser. É o mesmo que o `SafeImage.tsx` já faz, pela mesma
 * razão.
 *
 * É OPCIONAL. Se trocares a foto e deixares o `desfocado` da anterior (ou o
 * apagares), a página funciona na mesma: o painel nasce com um cinza neutro em
 * vez da cor da fotografia. `fotografias-da-entrada.test.ts` avisa se algum
 * `desfocado` deixar de corresponder à sua fotografia.
 */

export interface FotografiaDaEntrada {
  /** Caminho a partir de `public/`. Tem de existir em `public/imagens/`. */
  ficheiro: string;
  /** `object-position` do recorte. Ver o cabeçalho. */
  enquadramento: string;
  /** Miniatura de 16 px em base64. Opcional: ver o cabeçalho. */
  desfocado?: string;
  /**
   * Onde foi, e quando: «Convento do Espinheiro · 2025».
   *
   * Aparece em pequeno por baixo do mote, e é o que transforma a entrada num
   * portefólio interno em vez de um fundo bonito. OPCIONAL: uma fotografia sem
   * legenda mostra-se na mesma, só sem a linha.
   *
   * Escreve o espaço e o ano, não o nome do casal — esta página é vista por
   * quem entra ao lado de quem passa, e o nome de um cliente não tem de estar
   * projectado num ecrã de escritório.
   */
  legenda?: string;
}

/**
 * As escolhidas pela Catarina. A ordem não tem significado nenhum: a rotação
 * percorre-as por dia (ver `EntradaComFotografia.tsx`).
 *
 * ── PORQUE É QUE ESTA LISTA TEM TRÊS E NÃO QUATRO ─────────────────────────
 * Saiu daqui o `DaniGui_JantarFesta_39.jpg`, o jantar a preto e branco.
 *
 * A queixa era «a imagem está a preto e branco, e a Líquen é uma empresa de
 * cor», e a primeira suspeita — um filtro CSS a dessaturar — estava errada:
 * não há filtro nenhum nesta página, e nunca houve. O que havia era uma
 * fotografia MONOCROMÁTICA no conjunto. Medido nos píxeis do ficheiro:
 *
 *   20_10_2025_0244.jpg          saturação média 0,479
 *   DaniGui_JantarFesta_39.jpg   saturação média 0,000   ← o ficheiro é p&b
 *   hd-edited.jpg                saturação média 0,291
 *   ines-goncalo-282.jpg         saturação média 0,300
 *
 * Como a rotação é POR DIA, um dia em cada quatro a equipa entrava num painel
 * a preto e branco. Não era um erro de renderização: era esta escolha.
 *
 * `fotografias-da-entrada.test.ts` volta a medir a saturação de cada ficheiro e
 * falha se alguma entrar abaixo do limiar — para uma fotografia sem cor não
 * poder voltar a entrar em silêncio.
 *
 * Ficaram três. Se quiseres voltar a quatro, acrescenta a entrada com a foto
 * que escolheres (e, se puderes, uma `legenda`).
 */
export const FOTOGRAFIAS_DA_ENTRADA: readonly FotografiaDaEntrada[] = [
  {
    // Ramo de noiva sobre renda. Plano aproximado: o ramo vive a meio, um pouco
    // abaixo do centro, e o canto esquerdo é sombra. O recorte desce para o
    // ramo ficar no painel e a sombra ficar de fora.
    ficheiro: "/imagens/20_10_2025_0244.jpg",
    enquadramento: "52% 58%",
    desfocado:
      "data:image/webp;base64,UklGRmQAAABXRUJQVlA4IFgAAABQAgCdASoQAAsAA4BaJYgCdAYtzy0pIyVSBAAA/veBsWGSb5DFLjv7z8MRX+esPDCuuUMk7mIfqdxt2xxys5Sb33pZodqaSSdX9xluvCO3biCclR1poAAA",
  },
  {
    // Jantar ao anoitecer com fios de luzes. É a mais escura das quatro e a que
    // melhor aguenta texto por cima: o recorte central mantém as luzes na
    // metade de cima e o chão iluminado por lanternas em baixo.
    ficheiro: "/imagens/hd-edited.jpg",
    enquadramento: "48% 50%",
    desfocado:
      "data:image/webp;base64,UklGRlYAAABXRUJQVlA4IEoAAAAQAgCdASoQAAsAA4BaJZQCdAEO9CvKIKwgAP7Q/vb9ufpH5iIvfv/FMrrLtlhxMwll2IJrV1fjko7f+11fO7Y2a8p7FlPiJSAAAA==",
  },
  {
    // Mesa posta vista de cima, com velas. Plano aproximado outra vez: vale
    // pela textura e pela cor. O recorte anda para a direita, onde estão a vela
    // acesa, o prato e o copo vermelho.
    ficheiro: "/imagens/ines-goncalo-282.jpg",
    enquadramento: "58% 50%",
    desfocado:
      "data:image/webp;base64,UklGRngAAABXRUJQVlA4IGwAAABQAgCdASoQAAsAA4BaJQBOgMWWtsuT42XJJAAA/vM0GZuPQwJu2XfrSs2Wvb2Ivh2mHXw7JVhS+WDT7YSwNUhk7WgmtAxDIYEmemPCs80vrjCxgeyKIPa84hidbaLe9HiTn+u2/7RNHy0YAAA=",
  },
];

/**
 * Superfície neutra para quando uma entrada não traz `desfocado`. O mesmo WebP
 * escuro que `src/lib/blur.ts` usa como omissão, copiado pela razão explicada
 * no cabeçalho.
 */
export const DESFOCADO_NEUTRO =
  "data:image/webp;base64,UklGRiQAAABXRUJQVlA4IBgAAAAwAQCdASoQAAwAA4BaJaQAA3AA/vOdgAA=";
