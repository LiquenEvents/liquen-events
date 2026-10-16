/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DA ENTRADA — as regras, sem browser
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pedido dela (15/10): «quero colocar estes três vídeos na capa inicial como
 * vídeos de fundo quando se entra no site… coloca-os de forma a que fiquem
 * super fluidos, sem travar». E a 16/10: alta qualidade «para qualquer
 * dispositivo em todos os modos», sem tiras pretas, e a tocar sempre.
 *
 * O componente (`EntradaEmVideo.tsx`) faz o trabalho com os `<video>`; aqui
 * ficam só as decisões, para se poderem provar num teste sem browser:
 *   · que ficheiro vem a seguir (1 → 2 → 3 → 1…);
 *   · que versão se pede para este ecrã;
 *   · que formato este browser toca (H.264, ou VP9 como rede).
 *
 * ── OS FICHEIROS (`public/videos/entrada/v4/`) ──────────────────────────────
 *   · SEM AS TIRAS PRETAS. Os vídeos vêm gravados em formato de cinema (2:1),
 *     com 60 px pretos em cima e em baixo (120 px no 4K). Cortam-se, e o
 *     `object-cover` faz o resto: o vídeo enche a entrada sem nada à volta;
 *   · SEM OS RESTOS DE OUTRAS CENAS que vinham nas pontas dos cortes dela: o
 *     vídeo 1 começava com 0,56 s do carro com os convidados (ela: «quero que
 *     comece na floresta com a vista de cima»), o 2 com 0,72 s de outra vista
 *     aérea, e o 3 acabava com 0,36 s do casal de costas;
 *   · TRÊS VERSÕES por vídeo, cada uma para o seu ecrã:
 *       – `paisagem` 1920×960 — computador, tablet, telemóvel deitado;
 *       – `retrato` — o centro do vídeo na vertical, para o telemóvel ao alto
 *         (1080×1920 quando a fonte é 4K; 540×960 quando é 1080p). Sem isto o
 *         telemóvel ampliava o centro de um vídeo largo e via-se mal;
 *       – `grande` 2560×1280 — ecrãs grandes ou de alta densidade, e só quando
 *         a fonte é 4K (ampliar um 1080p não acrescenta nada);
 *   · H.264, sem som, `+faststart` (começa antes de acabar de descarregar), um
 *     fotograma-chave por segundo, CRF 19 com tecto de 6 Mbit/s (10 no grande):
 *     perto do original, e um débito que o 4G aguenta sem parar a carregar;
 *   · WebM/VP9 em `paisagem` e `retrato` para os poucos browsers sem H.264.
 *
 * A pasta tem versão (`v4`) porque os vídeos são servidos com cache de um ano:
 * um vídeo novo vai para `v5`, nunca por cima.
 */

export const PASTA_DOS_VIDEOS = "/videos/entrada/v4";

/** Quantos vídeos há. */
export const NUMERO_DE_VIDEOS = 3;

/** Que vídeos têm versão `grande` (as fontes em 4K). Desde 16/10: os três. */
export const TEM_GRANDE: readonly boolean[] = [true, true, true];

export type Variante = "paisagem" | "retrato" | "grande";
export type Formato = "mp4" | "webm";

/** Quanto dura a passagem de um vídeo para o seguinte (só opacidade). */
export const PASSAGEM_MS = 800;

/** A partir de quantos píxeis reais de largura vale a pena a versão grande. */
const LARGURA_DO_GRANDE = 2200;

/**
 * O formato que este browser toca. **H.264 primeiro**: é o que todos os
 * browsers correntes têm, e é descodificado pelo chip — é por isso que corre
 * sem travar. O WebM (VP9) é a rede para os poucos que não têm H.264: o
 * Chromium de código aberto (o dos testes) e alguns Linux.
 */
export function formatoQueToca(podeTocar: (tipo: string) => string): Formato | null {
  if (podeTocar('video/mp4; codecs="avc1.640028"')) return "mp4";
  if (podeTocar('video/webm; codecs="vp9"')) return "webm";
  return null;
}

export interface Ecra {
  largura: number;
  altura: number;
  /** `devicePixelRatio`. */
  densidade: number;
}

/**
 * A versão para este ecrã: ao alto → `retrato`; deitado e com muitos píxeis
 * reais → `grande` (se este vídeo a tiver); o resto → `paisagem`.
 */
export function varianteParaOEcra(e: Ecra, i: number): Variante {
  if (e.altura > e.largura) return "retrato";
  const temGrande = TEM_GRANDE[i % NUMERO_DE_VIDEOS] ?? false;
  if (temGrande && e.largura * (e.densidade || 1) >= LARGURA_DO_GRANDE) return "grande";
  return "paisagem";
}

/** O endereço de um vídeo (`i` começa em 0). O WebM não tem versão grande. */
export function enderecoDoVideo(i: number, variante: Variante, formato: Formato = "mp4"): string {
  const n = i % NUMERO_DE_VIDEOS;
  let v = variante;
  if (v === "grande" && (formato === "webm" || !TEM_GRANDE[n])) v = "paisagem";
  return `${PASTA_DOS_VIDEOS}/entrada-${n + 1}-${v}.${formato}`;
}

/** O vídeo que vem a seguir pela ordem dos ficheiros: 1 → 2 → 3 → 1. */
export function proximoVideo(i: number): number {
  return (i + 1) % NUMERO_DE_VIDEOS;
}

/** Baralha `lista` (Fisher–Yates) com o `sorteio` dado (0 ≤ x < 1). */
function baralhar(lista: number[], sorteio: () => number): number[] {
  const l = [...lista];
  for (let k = l.length - 1; k > 0; k--) {
    const j = Math.floor(sorteio() * (k + 1));
    [l[k], l[j]] = [l[j], l[k]];
  }
  return l;
}

/**
 * ── A ORDEM VAI MUDANDO ────────────────────────────────────────────────────
 * Ela (16/10): «vai alterando os vídeos para não estarem sempre com a mesma
 * ordem». A primeira volta começa SEMPRE na floresta (o vídeo 1: «quero que
 * comece na floresta com a vista de cima»), e os outros dois vêm por uma ordem
 * sorteada. As voltas seguintes são sorteadas inteiras, com uma regra: nunca o
 * mesmo vídeo duas vezes seguidas na passagem de uma volta para a outra.
 */
export function primeiraVolta(sorteio: () => number = Math.random): number[] {
  const resto = Array.from({ length: NUMERO_DE_VIDEOS - 1 }, (_, k) => k + 1);
  return [0, ...baralhar(resto, sorteio)];
}

/** Uma volta nova, que não começa pelo `ultimo` que tocou. */
export function novaVolta(ultimo: number, sorteio: () => number = Math.random): number[] {
  const ordem = baralhar(
    Array.from({ length: NUMERO_DE_VIDEOS }, (_, k) => k),
    sorteio,
  );
  if (ordem[0] === ultimo && ordem.length > 1) {
    const j = 1 + Math.floor(sorteio() * (ordem.length - 1));
    [ordem[0], ordem[j]] = [ordem[j], ordem[0]];
  }
  return ordem;
}

/**
 * Se já é altura de começar a passagem para o vídeo seguinte: quando faltar
 * o tempo da passagem para o fim. Assim o seguinte já está inteiro à vista no
 * instante em que este acaba, e nunca se vê o último fotograma parado nem preto.
 */
export function eHoraDePassar(tempo: number, duracao: number): boolean {
  if (!Number.isFinite(duracao) || duracao <= 0) return false;
  return tempo >= duracao - PASSAGEM_MS / 1000;
}

/** Quanto tempo o vídeo à vista pode ficar sem avançar antes de o vigia agir. */
export const ENCRAVADO_MS = 2500;
