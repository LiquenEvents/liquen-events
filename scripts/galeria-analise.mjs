/**
 * ════════════════════════════════════════════════════════════════════════════
 * A GALERIA «VÊ» CADA FOTOGRAFIA — o que o build calcula para a ordenar
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela, a 10/10: «quero que melhores a galeria de forma a ela ficar
 * espetacularmente inteligente com as fotografias». E, para as quase iguais:
 * «Mostra todas, afastadas».
 *
 * Até aqui a galeria só sabia o que vem no NOME do ficheiro (a categoria, o
 * casal). Isto olha para dentro da fotografia, uma vez por foto, no build
 * (`scripts/pregen-gallery.mjs`, com a mesma cache por conteúdo), e deixa o
 * resultado em `src/app/[lang]/(site)/galeria/gallery-meta.json`:
 *
 *  · `h` — a impressão visual (dHash de 64 bits, em hexadecimal). Duas fotos
 *          com impressões a poucos bits de distância são o mesmo disparo, ou
 *          quase: é assim que se encontram as «cenas»;
 *  · `pb` — a fotografia é a preto e branco (saturação média muito baixa);
 *  · `n` — a nitidez (variância do Laplaciano numa miniatura): baixa = tremida
 *          ou desfocada;
 *  · `f` — o ponto de interesse, em percentagem (`"x,y"`), pela estratégia
 *          `attention` do sharp: é para onde se recorta.
 *
 * Funções puras e o cálculo com o sharp vivem aqui, num ficheiro só: o build e
 * os testes (`galeria/analise.test.ts`) usam ESTE código — não há uma segunda
 * cópia a divergir.
 */

/** Sobe quando o que se calcula muda: a cache do build refaz a análise. */
export const VERSAO_ANALISE = 1;

/** Abaixo disto (0..1) a fotografia é a preto e branco. Calibrado nas 918. */
export const LIMIAR_PB = 0.06;

/**
 * Quando duas fotos são a mesma cena. Calibrado a 11/10 nas 918, com os 29
 * pares a ≤ 13 bits vistos a olho, lado a lado:
 *
 *  · até 8 bits é sempre o mesmo disparo (ou quase) — incluindo a mesma foto
 *    a cores e a preto e branco, e o par conhecido `galeria-outubro-26/55`;
 *  · de 9 a 11 ainda são o mesmo momento quando a cor média é parecida E as
 *    duas são do mesmo tipo (ambas a cores ou ambas P&B). O único falso par a
 *    11 bits era uma P&B contra uma a cores, de casamentos diferentes;
 *  · a partir de 12 só há coincidências: outra foto, outro casamento.
 */
export const LIMIAR_CENA = 8;
export const LIMIAR_CENA_LARGO = 11;
export const COR_MAX = 40;
export const COR_MAX_LARGO = 25;

/**
 * @param {{h: string, cor?: string, pb?: boolean}} a
 * @param {{h: string, cor?: string, pb?: boolean}} b
 */
export function mesmaCena(a, b) {
  const d = hamming(a.h, b.h);
  if (d > LIMIAR_CENA_LARGO) return false;
  const cor = distanciaDeCor(a.cor, b.cor);
  if (d <= LIMIAR_CENA) return cor <= COR_MAX;
  return cor <= COR_MAX_LARGO && Boolean(a.pb) === Boolean(b.pb);
}

/**
 * Calcula o que se guarda de uma fotografia. `buf` é a miniatura mais pequena
 * que o build já gerou (384 px): é um decode barato, não o do original.
 *
 * @param {typeof import("sharp")} sharp
 * @param {Buffer} buf
 * @returns {Promise<{h: string, pb: boolean, n: number, f: string, r: number}>}
 */
export async function analisarFoto(sharp, buf) {
  // ── dHash: 9×8 em cinzentos; cada bit diz se um píxel é mais claro do que o
  //    vizinho da direita. Resiste a mudanças de tamanho, de compressão e a
  //    pequenos acertos de cor — é o que faz duas versões da MESMA fotografia
  //    darem a mesma impressão.
  const cinza = await sharp(buf).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
  let h = "";
  for (let r = 0; r < 8; r++) {
    let nibble = 0;
    for (let c = 0; c < 8; c++) {
      const bit = cinza[r * 9 + c] > cinza[r * 9 + c + 1] ? 1 : 0;
      nibble = (nibble << 1) | bit;
      if (c === 3 || c === 7) {
        h += nibble.toString(16);
        nibble = 0;
      }
    }
  }

  // ── Preto e branco: a saturação média (max-min)/max, numa miniatura de 64.
  const { data: rgb, info } = await sharp(buf)
    .removeAlpha()
    .resize(64, 64, { fit: "inside" })
    .raw()
    .toBuffer({ resolveWithObject: true });
  let soma = 0;
  const n = info.width * info.height;
  for (let i = 0; i < n; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    soma += max === 0 ? 0 : (max - min) / max;
  }
  const pb = soma / n < LIMIAR_PB;

  // ── Nitidez: variância do Laplaciano, numa miniatura de 256 px. O `offset`
  //    de 128 guarda os valores negativos (o raw é de 8 bits).
  const lap = await sharp(buf)
    .greyscale()
    .resize(256, 256, { fit: "inside" })
    .convolve({ width: 3, height: 3, kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0], offset: 128 })
    .raw()
    .toBuffer();
  let media = 0;
  for (const v of lap) media += v;
  media /= lap.length;
  let variancia = 0;
  for (const v of lap) variancia += (v - media) ** 2;
  variancia /= lap.length;

  // ── Ponto de interesse: o recorte quadrado que o `attention` escolheria, e
  //    o centro dele, em percentagem da foto.
  const meta = await sharp(buf).metadata();
  const lado = Math.min(meta.width ?? 1, meta.height ?? 1);
  const { info: corte } = await sharp(buf)
    .resize(lado, lado, { fit: "cover", position: sharp.strategy.attention })
    .toBuffer({ resolveWithObject: true });
  const ax = typeof corte.attentionX === "number" ? corte.attentionX : (meta.width ?? 1) / 2;
  const ay = typeof corte.attentionY === "number" ? corte.attentionY : (meta.height ?? 1) / 2;
  const fx = Math.round((ax / (meta.width ?? 1)) * 100);
  const fy = Math.round((ay / (meta.height ?? 1)) * 100);

  return {
    h,
    pb,
    n: Math.round(variancia),
    f: `${clamp(fx)},${clamp(fy)}`,
    // Largura / altura — para saber se serve o mosaico grande (deitado).
    r: Math.round(((meta.width ?? 1) / (meta.height ?? 1)) * 1000) / 1000,
  };
}

const clamp = (v) => Math.max(0, Math.min(100, v));

/** Quantos bits diferem entre duas impressões (hexadecimais de 16 dígitos). */
export function hamming(a, b) {
  let d = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      d += x & 1;
      x >>= 1;
    }
  }
  return d;
}

/** Distância entre duas cores `#rrggbb` (euclidiana, 0..441). */
export function distanciaDeCor(a, b) {
  if (!a || !b) return Infinity;
  const p = (s, i) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
  return Math.hypot(p(a, 0) - p(b, 0), p(a, 1) - p(b, 1), p(a, 2) - p(b, 2));
}

/**
 * Junta as fotos quase iguais em cenas (união-procura sobre os pares perto o
 * suficiente na impressão E na cor). Devolve `src → id de cena` só para as
 * fotos que têm pelo menos um par; as sozinhas não aparecem.
 *
 * Os ids são curtos e estáveis: `c1`, `c2`… pela ordem do primeiro `src` de
 * cada cena, para o ficheiro gerado não mudar de um build para o outro.
 *
 * @param {{src: string, h: string, cor?: string, pb?: boolean}[]} fotos
 * @returns {Map<string, string>}
 */
export function agruparCenas(fotos) {
  const pai = fotos.map((_, i) => i);
  const raiz = (i) => {
    while (pai[i] !== i) {
      pai[i] = pai[pai[i]];
      i = pai[i];
    }
    return i;
  };
  for (let i = 0; i < fotos.length; i++) {
    for (let j = i + 1; j < fotos.length; j++) {
      if (mesmaCena(fotos[i], fotos[j])) pai[raiz(i)] = raiz(j);
    }
  }
  const grupos = new Map();
  fotos.forEach((f, i) => {
    const r = raiz(i);
    if (!grupos.has(r)) grupos.set(r, []);
    grupos.get(r).push(f.src);
  });
  const cenas = [...grupos.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.sort())
    .sort((a, b) => (a[0] < b[0] ? -1 : 1));
  const out = new Map();
  cenas.forEach((g, k) => {
    for (const src of g) out.set(src, `c${k + 1}`);
  });
  return out;
}

/**
 * Pode ir para o mosaico grande do topo? Deitada (o 2×2 é mais largo do que
 * alto), a cores, e nítida — acima do quartil de baixo da nitidez de todas.
 *
 * @param {{pb?: boolean, n: number}} m
 * @param {number} razao largura / altura
 * @param {number} nitidezMinima
 */
export function serveParaDestaque(m, razao, nitidezMinima) {
  return razao >= 1.2 && !m.pb && m.n >= nitidezMinima;
}

/** O valor no quantil `q` (0..1) de uma lista de números. */
export function quantil(valores, q) {
  if (valores.length === 0) return 0;
  const s = [...valores].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}
