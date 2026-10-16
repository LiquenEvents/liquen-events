/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DA ENTRADA — as regras, sem browser
 * ════════════════════════════════════════════════════════════════════════════
 *
 * O pedido dela (15/10): «quero colocar estes três vídeos na capa inicial como
 * vídeos de fundo quando se entra no site… coloca-os de forma a que fiquem
 * super fluidos, sem travar».
 *
 * O componente (`EntradaEmVideo.tsx`) faz o trabalho com os `<video>`; aqui
 * ficam só as decisões, para se poderem provar num teste sem browser:
 *   · que ficheiro vem a seguir (1 → 2 → 3 → 1…);
 *   · que versão se pede (720p no telemóvel, 1080p no resto);
 *   · quando é que NÃO se toca vídeo nenhum, e fica a fotografia.
 *
 * Os ficheiros estão em `public/videos/entrada/v1/`. Foram preparados a partir
 * dos originais dela (35 MB com som) assim: sem som, H.264 (que todos os
 * telemóveis descodificam no chip, por isso não pesa no processador), um
 * fotograma-chave por segundo e `+faststart` (começa a tocar antes de acabar de
 * descarregar). O `v1` na pasta deixa servir com cache de um ano: um vídeo novo
 * vai para `v2`, nunca por cima.
 */

export const PASTA_DOS_VIDEOS = "/videos/entrada/v1";

/** Quantos vídeos há. Os ficheiros são `entrada-<1..N>-<altura>.mp4`. */
export const NUMERO_DE_VIDEOS = 3;

export type Altura = 720 | 1080;

/** Quanto dura a passagem de um vídeo para o seguinte (só opacidade). */
export const PASSAGEM_MS = 800;

export type Formato = "mp4" | "webm";

/**
 * O formato que este browser toca. **H.264 primeiro**: é o que todos os
 * browsers correntes têm, e é descodificado pelo chip — é por isso que corre
 * sem travar. O WebM (VP9, só em 720p) é a rede para os poucos que não têm
 * H.264: o Chromium de código aberto (o dos testes) e alguns Linux. Sem
 * nenhum dos dois, não há vídeo e fica a fotografia.
 */
export function formatoQueToca(podeTocar: (tipo: string) => string): Formato | null {
  if (podeTocar('video/mp4; codecs="avc1.640028"')) return "mp4";
  if (podeTocar('video/webm; codecs="vp9"')) return "webm";
  return null;
}

/** O endereço de um vídeo (`i` começa em 0). O WebM só existe em 720p. */
export function enderecoDoVideo(i: number, altura: Altura, formato: Formato = "mp4"): string {
  const a = formato === "webm" ? 720 : altura;
  return `${PASTA_DOS_VIDEOS}/entrada-${(i % NUMERO_DE_VIDEOS) + 1}-${a}.${formato}`;
}

/** O vídeo que vem a seguir: 1 → 2 → 3 → 1. */
export function proximoVideo(i: number): number {
  return (i + 1) % NUMERO_DE_VIDEOS;
}

/**
 * 720p até 900 px de largura (telemóveis e tablets pequenos, onde os 720p
 * pesam metade e a diferença não se vê debaixo do véu), 1080p no resto.
 * Com «Poupar dados» ou numa ligação 3G pede-se sempre o mais leve.
 */
export function alturaParaOEcra(larguraCss: number, ligacaoLenta = false): Altura {
  if (ligacaoLenta) return 720;
  return larguraCss <= 900 ? 720 : 1080;
}

export interface Condicoes {
  /** `prefers-reduced-motion: reduce`. */
  movimentoReduzido: boolean;
  /** `navigator.connection.saveData`. */
  pouparDados?: boolean;
  /** `navigator.connection.effectiveType` («slow-2g», «2g», «3g», «4g»). */
  tipoDeLigacao?: string;
}

/**
 * Se deve haver vídeo. Não há com movimento reduzido (é exactamente o que essa
 * preferência pede), com «Poupar dados», nem numa ligação 2G — nesses casos
 * fica a fotografia, que é o primeiro fotograma do vídeo 1 e, por isso, a
 * mesma imagem com que o vídeo começaria.
 */
export function deveHaverVideo(c: Condicoes): boolean {
  if (c.movimentoReduzido) return false;
  if (c.pouparDados) return false;
  if (c.tipoDeLigacao === "slow-2g" || c.tipoDeLigacao === "2g") return false;
  return true;
}

/** A ligação é lenta o bastante para pedir só os 720p. */
export function ligacaoLenta(tipoDeLigacao?: string): boolean {
  return tipoDeLigacao === "3g";
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
