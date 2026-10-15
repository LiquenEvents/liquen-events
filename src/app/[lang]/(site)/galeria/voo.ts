/**
 * ════════════════════════════════════════════════════════════════════════════
 * O VOO DA MINIATURA ATÉ AO VISUALIZADOR — AS CONTAS
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Abrir uma fotografia era um esbatimento no meio do ecrã: a miniatura em que
 * se tocou ficava onde estava e a foto aparecia noutro sítio, sem ligação
 * nenhuma entre as duas. Agora a miniatura VOA até ao sítio onde a foto vai
 * ficar, e ao fechar volta para a grelha pelo mesmo caminho (GAL-1, no
 * `docs/PLANO-SITE-E-GALERIA.md`).
 *
 * É a técnica a que se chama FLIP: mede-se onde a coisa está (a miniatura) e
 * onde vai ficar (a foto encaixada no visualizador), põe-se uma cópia no sítio
 * FINAL e anima-se só o `transform` dela a partir do sítio inicial. Nada mede
 * nem recalcula a página a meio do voo.
 *
 * A grelha corta as fotografias (o 2×2 e as satélites em *cover*, pelo ponto
 * de interesse), e o visualizador mostra-as inteiras (*contain*). Por isso o
 * voo anima também um `clip-path: inset()`: no início a cópia é a fotografia
 * inteira, ampliada como na miniatura e recortada pela caixa da miniatura; no
 * fim, a fotografia inteira sem recorte.
 *
 * Tudo aqui é aritmética pura, para se poder testar sem browser.
 */

/** Uma caixa no ecrã, em píxeis CSS (o que o `getBoundingClientRect` dá). */
export type Caixa = { x: number; y: number; w: number; h: number };

/** `"3/2"`, `"1200 / 1600"` ou um número → largura a dividir pela altura. */
export function proporcao(ar: string | number | undefined): number {
  if (typeof ar === "number") return ar > 0 ? ar : 1;
  if (!ar) return 1;
  const [a, b] = ar.split("/").map((v) => parseFloat(v));
  if (!(a > 0)) return 1;
  if (b === undefined || Number.isNaN(b)) return a;
  return b > 0 ? a / b : 1;
}

/**
 * Onde a fotografia fica pintada dentro da `area`, encaixada sem cortar
 * (`object-fit: contain`, centrada) — é o que o visualizador faz.
 */
export function caixaContida(area: Caixa, prop: number): Caixa {
  if (!(area.w > 0) || !(area.h > 0) || !(prop > 0)) return { x: area.x, y: area.y, w: 0, h: 0 };
  const w = Math.min(area.w, area.h * prop);
  const h = w / prop;
  return { x: area.x + (area.w - w) / 2, y: area.y + (area.h - h) / 2, w, h };
}

/** O ponto de interesse (`"30% 40%"`) em fracções; sem ele, o centro. */
export function focoEmFraccao(foco?: string): { fx: number; fy: number } {
  const m = /(-?[\d.]+)%\s+(-?[\d.]+)%/.exec(foco ?? "");
  if (!m) return { fx: 0.5, fy: 0.5 };
  const lim = (v: number) => Math.min(1, Math.max(0, v / 100));
  return { fx: lim(parseFloat(m[1])), fy: lim(parseFloat(m[2])) };
}

/** Uma pose do voo: o que se escreve no `transform` e no `clip-path` da cópia. */
export type Pose = { transform: string; clipPath: string };

/** A pose de chegada: a cópia exactamente no sítio da foto, inteira. */
export const POSE_FINAL: Pose = {
  transform: "translate(0px, 0px) scale(1)",
  clipPath: "inset(0px 0px 0px 0px)",
};

const px = (v: number) => `${Math.round(v * 100) / 100}px`;

/**
 * A pose de partida da cópia — que está posicionada no `destino` com
 * `transform-origin: 0 0` — para parecer a miniatura.
 *
 * @param destino onde a foto fica no visualizador (ver `caixaContida`).
 * @param recorte a caixa da miniatura (o botão, que corta).
 * @param imagem  a caixa do `<img>` da miniatura. É a mesma do recorte, menos
 *                quando o rato está por cima e o zoom de 1,03 a alarga.
 * @param foco    o `object-position` da miniatura, para cortar onde ela corta.
 */
export function poseDaMiniatura(
  destino: Caixa,
  recorte: Caixa,
  imagem: Caixa = recorte,
  foco?: string,
): Pose {
  if (!(destino.w > 0) || !(destino.h > 0)) return POSE_FINAL;
  const { fx, fy } = focoEmFraccao(foco);
  // A escala que faz a foto inteira COBRIR a imagem da miniatura (cover).
  const s = Math.max(imagem.w / destino.w, imagem.h / destino.h);
  const pw = destino.w * s;
  const ph = destino.h * s;
  const left = imagem.x + (imagem.w - pw) * fx;
  const top = imagem.y + (imagem.h - ph) * fy;
  // O recorte, nas coordenadas da cópia ANTES da escala (é assim que o
  // `inset()` se lê num elemento com `transform`).
  const x0 = (recorte.x - left) / s;
  const y0 = (recorte.y - top) / s;
  const x1 = x0 + recorte.w / s;
  const y1 = y0 + recorte.h / s;
  const dentro = (v: number) => Math.max(0, v);
  return {
    transform: `translate(${px(left - destino.x)}, ${px(top - destino.y)}) scale(${
      Math.round(s * 10000) / 10000
    })`,
    clipPath: `inset(${px(dentro(y0))} ${px(dentro(destino.w - x1))} ${px(
      dentro(destino.h - y1),
    )} ${px(dentro(x0))})`,
  };
}

/** O ponto (x, y) cai dentro da caixa? Usado para «qualquer preto fecha». */
export function dentroDe(c: Caixa, x: number, y: number): boolean {
  return c.w > 0 && c.h > 0 && x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
}

/** A caixa está, pelo menos em parte, à vista numa janela de `vw` × `vh`? */
export function aVista(c: Caixa, vw: number, vh: number): boolean {
  return c.w > 0 && c.h > 0 && c.x < vw && c.x + c.w > 0 && c.y < vh && c.y + c.h > 0;
}

/**
 * Quantas miniaturas cabem na tira de baixo, numa janela com esta largura.
 *
 * Eram sete fixas: 7 × 60 px + a activa de 72 + os intervalos dão ~500 px, e a
 * 390 px a tira ficava cortada dos dois lados. Cada miniatura ocupa 64 px (60
 * + 4 de intervalo), a activa mais 12, e há 16 px de margem de cada lado.
 * Ímpar sempre, para a fotografia aberta ficar ao meio; entre 3 e 7.
 */
export function miniaturasNaTira(largura: number): number {
  const cabem = Math.floor((largura - 32 - 12) / 64);
  const impar = cabem % 2 === 0 ? cabem - 1 : cabem;
  return Math.min(7, Math.max(3, impar));
}

/** Os índices da tira à volta da foto aberta, sem passar das pontas. */
export function janelaDaTira(index: number, total: number, n: number): number[] {
  const tamanho = Math.min(n, total);
  const inicio = Math.max(0, Math.min(index - Math.floor(n / 2), total - n));
  return Array.from({ length: tamanho }, (_, k) => inicio + k);
}

/**
 * ════════════════════════════════════════════════════════════════════════════
 * O DESLIZE ENTRE FOTOGRAFIAS (GAL-2)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O plano dela: «a foto acompanha o dedo com mola; muda com um gesto rápido,
 * mesmo curto, ou a passar de 20 % da largura; nas pontas, resistência elástica
 * em vez de saltar para a 917». Antes, a foto ficava parada debaixo do dedo e
 * só mudava aos 50 px soltos — um gesto rápido e curto era ignorado.
 */

/** A fracção da largura a partir da qual largar muda de foto. */
export const DESLIZE_FRACCAO = 0.2;
/**
 * Um gesto rápido (px/ms) muda de foto mesmo curto…
 *
 * Medido no browser, com toques simulados: 40 px em 120–150 ms dão 0,3–0,4
 * px/ms, que é o que um polegar faz num gesto curto e decidido. Com 0,5 esses
 * gestos eram ignorados — a mesma queixa de antes. Arrastar devagar (40 px em
 * 300 ms ≈ 0,13) continua a não mudar.
 */
export const DESLIZE_RAPIDO_PX_MS = 0.3;
/** …desde que tenha andado o suficiente para não ser um toque trémulo. */
export const DESLIZE_RAPIDO_MIN_PX = 12;
/** O intervalo entre duas fotografias na pista, em px. */
export const DESLIZE_INTERVALO_PX = 24;

/**
 * Ao largar: −1 (anterior), +1 (seguinte) ou 0 (volta ao sítio).
 *
 * `dx` é quanto o dedo andou (negativo = para a esquerda = a seguinte), e
 * `velocidade` é em px/ms, com o mesmo sinal. Um gesto rápido ao CONTRÁRIO do
 * que se arrastou desiste — é o «afinal não» do polegar —, e nunca se vai
 * para uma vizinha que não existe.
 */
export function decidirDeslize({
  dx,
  velocidade,
  largura,
  haAnterior,
  haSeguinte,
}: {
  dx: number;
  velocidade: number;
  largura: number;
  haAnterior: boolean;
  haSeguinte: boolean;
}): -1 | 0 | 1 {
  if (dx === 0 || largura <= 0) return 0;
  const sentido = dx < 0 ? 1 : -1;
  if (!(sentido === 1 ? haSeguinte : haAnterior)) return 0;
  const rapida = Math.abs(velocidade) >= DESLIZE_RAPIDO_PX_MS;
  if (rapida && Math.sign(velocidade) !== Math.sign(dx)) return 0;
  if (Math.abs(dx) > largura * DESLIZE_FRACCAO) return sentido;
  if (rapida && Math.abs(dx) >= DESLIZE_RAPIDO_MIN_PX) return sentido;
  return 0;
}

/**
 * A resistência nas pontas: o dedo anda, a foto anda cada vez menos, e nunca
 * passa de um terço da largura. É a curva das listas do iOS
 * (`(1 − 1/(x·c/d + 1))·d`), com o declive inicial `c` = 0,55 — no primeiro
 * píxel a foto ainda acompanha o dedo a meio gás, e por isso sente-se que há
 * qualquer coisa ali, e não que o ecrã encravou.
 */
export function elastico(dx: number, largura: number): number {
  if (dx === 0 || largura <= 0) return 0;
  const tecto = largura / 3;
  const c = 0.55;
  const y = (1 - 1 / ((Math.abs(dx) * c) / tecto + 1)) * tecto;
  return Math.sign(dx) * y;
}
