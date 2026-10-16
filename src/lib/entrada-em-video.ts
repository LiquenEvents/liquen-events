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
 *   · que formato este aparelho toca melhor sem travar (AV1, HEVC, H.264, VP9).
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
 *   · WebM/VP9 em `paisagem` e `retrato` para os poucos browsers sem H.264;
 *   · e, desde 16/10, as mesmas três versões em **HEVC** (`-hevc.mp4`, x265
 *     CRF 20) e em **AV1** (`-av1.mp4`, libaom): a mesma floresta com menos
 *     defeitos pelo mesmo peso. Só os recebe o aparelho que os descodifica no
 *     chip — ver `melhorFormato`.
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
/**
 * `mp4` é o H.264 (o de sempre); `hevc` e `av1` são MP4 com codecs mais novos
 * — a mesma imagem com menos defeitos pelo mesmo peso; `webm` é o VP9.
 */
export type Formato = "mp4" | "webm" | "hevc" | "av1";

/** Quanto dura a passagem de um vídeo para o seguinte (só opacidade). */
export const PASSAGEM_MS = 800;

/** A partir de quantos píxeis reais de largura vale a pena a versão grande. */
const LARGURA_DO_GRANDE = 2200;

/**
 * O `type` de cada formato e versão, para o `canPlayType`, as `<source>` e a
 * pergunta ao aparelho. O nível do codec é o dos ficheiros (lido no cabeçalho
 * de cada um): a versão grande pede um nível acima, e um aparelho que só
 * descodifica até ao nível da paisagem não deve perder a paisagem por isso.
 */
export function tipoDoFormato(formato: Formato, variante: Variante = "paisagem"): string {
  const grande = variante === "grande";
  switch (formato) {
    case "hevc": // Main, nível 4 (paisagem e retrato) ou 5 (grande)
      return `video/mp4; codecs="hvc1.1.6.L${grande ? 150 : 120}.90"`;
    case "av1": // Main, 8 bits, nível 4.0 ou 5.0
      return `video/mp4; codecs="av01.0.${grande ? 12 : "08"}M.08"`;
    case "mp4":
      return 'video/mp4; codecs="avc1.640028"';
    case "webm":
      return 'video/webm; codecs="vp9"';
  }
}

/**
 * O formato que este browser toca, só pelo `canPlayType`. **H.264 primeiro**:
 * é o que todos os browsers correntes têm, e é descodificado pelo chip — é por
 * isso que corre sem travar. O WebM (VP9) é a rede para os poucos que não têm
 * H.264: o Chromium de código aberto (o dos testes) e alguns Linux.
 *
 * O HEVC e o AV1 NÃO se escolhem por aqui: o `canPlayType` diz «sim» a um
 * formato que o aparelho descodifica no processador (o AV1 no Chrome, em
 * qualquer telemóvel), e aí o vídeo travava. Esses só entram pelo
 * {@link melhorFormato}, que pergunta se o chip os descodifica.
 */
export function formatoQueToca(podeTocar: (tipo: string) => string): Formato | null {
  if (podeTocar(tipoDoFormato("mp4"))) return "mp4";
  if (podeTocar(tipoDoFormato("webm"))) return "webm";
  return null;
}

/** As medidas de cada versão, para perguntar ao aparelho se as toca bem. */
export const MEDIDAS: Record<Variante, { largura: number; altura: number; debito: number }> = {
  paisagem: { largura: 1920, altura: 960, debito: 6_000_000 },
  retrato: { largura: 1080, altura: 1920, debito: 6_000_000 },
  grande: { largura: 2560, altura: 1280, debito: 8_000_000 },
};
export const FOTOGRAMAS_POR_SEGUNDO = 25;

/** A resposta do `navigator.mediaCapabilities.decodingInfo`, só o que conta. */
export interface Capacidade {
  supported: boolean;
  smooth: boolean;
  powerEfficient: boolean;
}
export type PerguntarAoAparelho = (formato: Formato, variante: Variante) => Promise<Capacidade>;

/**
 * ── O MELHOR FORMATO PARA ESTE APARELHO ─────────────────────────────────────
 * Ela (16/10): «qualidade extraordinária em qualquer dispositivo, com qualquer
 * modo», e sempre fluido. Medido com a mesma floresta, ao mesmo peso
 * (~6 Mbit/s), em SSIM: H.264 0,9832 · HEVC 0,9861 · AV1 0,9882 — o AV1 tem
 * ~30 % menos defeitos que o H.264, o HEVC ~17 %.
 *
 * Mas a qualidade só vale se o vídeo correr sem travar. Por isso pergunta-se
 * ao próprio aparelho (`mediaCapabilities.decodingInfo`) se toca cada um
 * **no chip** (`powerEfficient`) e **sem perder fotogramas** (`smooth`):
 *   1. AV1, se o chip o descodifica e corre liso (iPhone 15 Pro e seguintes,
 *      Macs M3, telemóveis Android recentes, placas gráficas recentes);
 *   2. HEVC, se o chip o descodifica (todos os iPhones, iPads e Macs dos
 *      últimos anos; Windows e Android com o chip para isso);
 *   3. H.264 — o de sempre, que todos descodificam no chip;
 *   4. VP9 — a rede para os browsers sem H.264.
 * Sem a pergunta (browsers antigos), fica o `formatoQueToca`.
 */
export async function melhorFormato(
  podeTocar: (tipo: string) => string,
  perguntar: PerguntarAoAparelho | null,
  variante: Variante,
): Promise<Formato | null> {
  const base = formatoQueToca(podeTocar);
  if (!perguntar) return base;
  for (const f of ["av1", "hevc"] as const) {
    if (!podeTocar(tipoDoFormato(f, variante))) continue;
    try {
      const c = await perguntar(f, variante);
      if (c.supported && c.smooth && c.powerEfficient) return f;
    } catch {
      // O aparelho não soube responder: não se arrisca.
    }
  }
  return base;
}

/** A pergunta ao aparelho, feita com o `navigator.mediaCapabilities`. */
export function perguntaDoNavegador(): PerguntarAoAparelho | null {
  const mc = typeof navigator !== "undefined" ? navigator.mediaCapabilities : undefined;
  if (!mc?.decodingInfo) return null;
  return (formato, variante) => {
    const m = MEDIDAS[variante];
    return mc.decodingInfo({
      type: "file",
      video: {
        contentType: tipoDoFormato(formato, variante),
        width: m.largura,
        height: m.altura,
        bitrate: m.debito,
        framerate: FOTOGRAMAS_POR_SEGUNDO,
      },
    });
  };
}

/** De que formato é o ficheiro que o browser escolheu (o `currentSrc`). */
export function formatoDoEndereco(endereco: string): Formato | null {
  if (/-hevc\.mp4$/.test(endereco)) return "hevc";
  if (/-av1\.mp4$/.test(endereco)) return "av1";
  if (/\.webm$/.test(endereco)) return "webm";
  if (/\.mp4$/.test(endereco)) return "mp4";
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

/**
 * O endereço de um vídeo (`i` começa em 0). O WebM não tem versão grande.
 * O HEVC e o AV1 são MP4 com o codec no nome: `entrada-1-paisagem-hevc.mp4`.
 */
export function enderecoDoVideo(i: number, variante: Variante, formato: Formato = "mp4"): string {
  const n = i % NUMERO_DE_VIDEOS;
  let v = variante;
  if (v === "grande" && (formato === "webm" || !TEM_GRANDE[n])) v = "paisagem";
  const fim = formato === "hevc" || formato === "av1" ? `-${formato}.mp4` : `.${formato}`;
  return `${PASTA_DOS_VIDEOS}/entrada-${n + 1}-${v}${fim}`;
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
 * ordem». A primeira volta começa no take de entrada (`TAKE_DE_ENTRADA`, a floresta),
 * e os outros vêm por uma ordem sorteada. As voltas seguintes são sorteadas
 * inteiras, com uma regra: nunca o mesmo vídeo duas vezes seguidas na passagem
 * de uma volta para a outra.
 */
export function primeiraVolta(primeiro = 0, sorteio: () => number = Math.random): number[] {
  const resto = Array.from({ length: NUMERO_DE_VIDEOS }, (_, k) => k).filter((k) => k !== primeiro);
  return [primeiro, ...baralhar(resto, sorteio)];
}

/**
 * ── A ENTRADA É SEMPRE NA FLORESTA ─────────────────────────────────────────
 * Decisão dela (16/10, depois de entrar pelo Instagram e cair no castelo):
 * «quero que a primeira vez que a pessoa entra no site seja sempre o vídeo da
 * floresta com o carro» — e, perguntada, «sempre a floresta», em TODAS as
 * entradas. Substitui a alternância de visita para visita (que guardava no
 * browser o take da entrada anterior). A variedade fica na ordem dos outros
 * dois, sorteada a cada volta (`primeiraVolta`/`novaVolta`). A fotografia da
 * capa é o primeiro fotograma deste take: a passagem da foto para o vídeo não
 * se nota.
 */
export const TAKE_DE_ENTRADA = 0;

/**
 * Quantos segundos antes do fim do take à vista se prepara o seguinte para
 * tocar (descodificar o 1.º fotograma). Já descarregado, é local e leva uma
 * fracção de segundo; fazê-lo cedo de mais punha dois vídeos a descodificar
 * ao mesmo tempo durante o take inteiro.
 */
export const AQUECER_ANTES_S = 3;

/** O máximo que a cortina espera pelo vídeo, além do seu próprio tempo. */
export const CORTINA_ESPERA_MAX_MS = 2500;

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
 * Quanto tempo ANTES da passagem o seguinte recebe ordem de tocar.
 *
 * Ela (16/10): «às vezes pára e não tem que parar» — no telemóvel com dados,
 * com Wi-Fi, e no computador. MEDIDO com um medidor de fotogramas (90 s, CPU
 * ÷4, redes de 4 a 20 Mbit/s, ao alto e no computador): TODAS as paragens
 * eram na passagem. O seguinte recebia `play()` a 0,8 s do fim e só começava
 * a subir quando o descodificador lhe dava o 1.º fotograma — 0,1 a 0,3 s
 * depois (mais, no iPhone, a acordar o descodificador de HEVC). O que saía
 * chegava ao fim antes de a subida acabar, e ficava 200 a 300 ms parado no
 * último fotograma, à vista por baixo do que entrava.
 *
 * Com esta folga, o seguinte arranca 1,5 s antes do fim: quando começa a
 * subir já está a andar, e acaba de subir antes de o outro acabar.
 */
export const ARRANQUE_S = 0.7;

/**
 * Se já é altura de começar a passagem para o vídeo seguinte: quando faltar
 * o tempo da passagem, mais a folga do arranque (`ARRANQUE_S`), para o fim.
 * Assim o seguinte já está inteiro à vista no instante em que este acaba, e
 * nunca se vê o último fotograma parado nem preto.
 */
export function eHoraDePassar(tempo: number, duracao: number): boolean {
  if (!Number.isFinite(duracao) || duracao <= 0) return false;
  return tempo >= duracao - PASSAGEM_MS / 1000 - ARRANQUE_S;
}

/**
 * Quanto dura a subida do seguinte quando ele arrancou tarde: o que falta ao
 * que sai, com um pouco de margem, e nunca menos de 200 ms. Uma subida mais
 * curta não se nota; um fotograma parado por baixo, nota-se.
 */
export function duracaoDaSubida(faltaAoQueSaiS: number): number {
  if (!Number.isFinite(faltaAoQueSaiS)) return PASSAGEM_MS;
  return Math.round(Math.min(PASSAGEM_MS, Math.max(200, faltaAoQueSaiS * 1000 * 0.9)));
}

/**
 * Quanto tempo o vídeo à vista pode ficar sem avançar antes de o vigia agir.
 * Eram 2,5 s: uma paragem inteira à vista antes de alguém fazer alguma coisa.
 */
export const ENCRAVADO_MS = 1200;

/**
 * Quanto tempo o vídeo à vista pode ficar SEM DADOS (o evento `waiting`, a
 * rede não chegou) antes de se passar a um take que já está na memória do
 * aparelho. Esperar pela rede era ficar parado o tempo que ela levasse.
 */
export const SALTAR_SEM_DADOS_MS = 400;

/**
 * ── A VERSÃO LEVE, SÓ PARA ARRANCAR NUMA REDE FRACA ───────────────────────
 * O take de entrada é o único que toca da rede (os seguintes tocam da memória
 * do aparelho). Ao alto, a versão normal pede 4 a 6 Mbit/s; um 4G a perder
 * sinal desce abaixo disso e o vídeo esgota o que tem. A versão leve
 * (`retrato-leve`, ~2 Mbit/s, ~40 % do peso) foi MEDIDA contra o 4K de origem:
 * SSIM 0,983 (HEVC) e 0,981 (H.264), contra 0,989 da normal — num ecrã de
 * telemóvel não se distingue. Só se usa para ARRANCAR quando a rede é fraca;
 * a volta seguinte toca a normal, da memória.
 */
export function enderecoLeve(i: number, formato: "hevc" | "mp4"): string {
  const n = i % NUMERO_DE_VIDEOS;
  return `${PASTA_DOS_VIDEOS}/entrada-${n + 1}-retrato-leve${formato === "hevc" ? "-hevc" : ""}.mp4`;
}

/** O que o `navigator.connection` diz (só existe em alguns browsers). */
export interface Ligacao {
  effectiveType?: string;
  downlink?: number;
  saveData?: boolean;
}

/**
 * A ligação diz-se lenta para a versão normal? (Android/Chrome; o iPhone não
 * tem `navigator.connection` — aí conta a medição do `eRedeLenta`.)
 */
export function ligacaoLenta(l: Ligacao | null | undefined): boolean {
  if (!l) return false;
  if (l.saveData) return true;
  if (l.effectiveType && /(^|-)(2g|3g)$/.test(l.effectiveType)) return true;
  return typeof l.downlink === "number" && l.downlink > 0 && l.downlink < 5;
}

/**
 * Medido no arranque: a rede está a trazer o vídeo mais devagar do que ele se
 * vê? `segundosChegados` é o fim do que já chegou (`buffered`), `ms` o tempo
 * desde que se pediu. Só se decide depois de 1,2 s (antes disso a latência
 * engana), e com menos de 1,3 s de vídeo por cada segundo de espera a versão
 * normal não aguentaria sem parar.
 */
export const MEDIR_REDE_MS = 1200;
export function eRedeLenta(segundosChegados: number, ms: number): boolean {
  if (!(ms >= MEDIR_REDE_MS)) return false;
  return segundosChegados < (ms / 1000) * 1.3;
}
