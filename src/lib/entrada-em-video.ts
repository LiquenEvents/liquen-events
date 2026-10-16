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
 *   · que versão se pede (1080p para todos; 720p só a quem poupa dados);
 *   · que formato este browser toca (H.264, ou VP9 como rede).
 *
 * Os ficheiros estão em `public/videos/entrada/v2/`. Foram preparados a partir
 * dos originais dela (1080p, com som) assim: sem som, H.264 (que todos os
 * telemóveis descodificam no chip, por isso não pesa no processador), um
 * fotograma-chave por segundo e `+faststart` (começa a tocar antes de acabar de
 * descarregar).
 *
 * ── PORQUE É QUE É `v2` ────────────────────────────────────────────────────
 * A `v1` saiu leve demais (1080p a ~3 Mbit/s, e 720p nos telemóveis), e ela
 * viu-a: «estão com muito pouca qualidade» (16/10). A `v2` é 1080p a CRF 18
 * (perto do original) para TODOS, telemóvel incluído — num telemóvel ao alto o
 * vídeo é recortado e ampliado, e era aí que os 720p se viam piores. A pasta
 * tem versão porque os vídeos são servidos com cache de um ano: quem viu a
 * `v1` na pré-visualização nunca mais receberia a nova com o mesmo nome.
 */

export const PASTA_DOS_VIDEOS = "/videos/entrada/v2";

/** Quantos vídeos há. Os ficheiros são `entrada-<1..N>-<altura>.mp4`. */
export const NUMERO_DE_VIDEOS = 3;

export type Altura = 720 | 1080;

/** Quanto dura a passagem de um vídeo para o seguinte (só opacidade). */
export const PASSAGEM_MS = 800;

export type Formato = "mp4" | "webm";

/**
 * O formato que este browser toca. **H.264 primeiro**: é o que todos os
 * browsers correntes têm, e é descodificado pelo chip — é por isso que corre
 * sem travar. O WebM (VP9, em 1080p) é a rede para os poucos que não têm
 * H.264: o Chromium de código aberto (o dos testes) e alguns Linux. Sem
 * nenhum dos dois, não há vídeo e fica a fotografia.
 */
export function formatoQueToca(podeTocar: (tipo: string) => string): Formato | null {
  if (podeTocar('video/mp4; codecs="avc1.640028"')) return "mp4";
  if (podeTocar('video/webm; codecs="vp9"')) return "webm";
  return null;
}

/** O endereço de um vídeo (`i` começa em 0). O WebM só existe em 1080p. */
export function enderecoDoVideo(i: number, altura: Altura, formato: Formato = "mp4"): string {
  const a = formato === "webm" ? 1080 : altura;
  return `${PASTA_DOS_VIDEOS}/entrada-${(i % NUMERO_DE_VIDEOS) + 1}-${a}.${formato}`;
}

/** O vídeo que vem a seguir: 1 → 2 → 3 → 1. */
export function proximoVideo(i: number): number {
  return (i + 1) % NUMERO_DE_VIDEOS;
}

/**
 * 1080p para todos — o telemóvel incluído (ver «porque é que é v2»). Só quem
 * pediu «Poupar dados» ou está numa ligação lenta recebe os 720p.
 */
export function alturaParaOEcra(ligacaoLenta = false): Altura {
  return ligacaoLenta ? 720 : 1080;
}

/**
 * A ligação é lenta (ou a pessoa pediu «Poupar dados») o bastante para pedir
 * só os 720p. NÃO desliga o vídeo: decisão dela (16/10) — «quero que mesmo
 * para telemóveis ou PCs que tenham estas coisas, e também poupanças de
 * energia, os vídeos continuem a correr». Nestes casos vai a versão mais leve.
 */
export function ligacaoLenta(tipoDeLigacao?: string, pouparDados = false): boolean {
  if (pouparDados) return true;
  return tipoDeLigacao === "3g" || tipoDeLigacao === "2g" || tipoDeLigacao === "slow-2g";
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
