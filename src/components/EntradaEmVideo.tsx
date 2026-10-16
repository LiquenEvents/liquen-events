"use client";

import { useEffect, useRef } from "react";
import {
  AQUECER_ANTES_S,
  CHAVE_DO_ULTIMO,
  CORTINA_ESPERA_MAX_MS,
  ENCRAVADO_MS,
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  eHoraDePassar,
  enderecoDoVideo,
  formatoDoEndereco,
  formatoQueToca,
  type Formato,
  melhorFormato,
  novaVolta,
  perguntaDoNavegador,
  primeiraVolta,
  tipoDoFormato,
  varianteParaOEcra,
} from "@/lib/entrada-em-video";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DE FUNDO DA ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/10): os três vídeos na capa, «super fluidos, sem travar».
 * As regras puras (versões, formatos, sequência) estão em
 * `src/lib/entrada-em-video.ts`; aqui está só o que mexe nos `<video>`.
 *
 * ── COMEÇA LOGO QUE SE ENTRA, E NUM TAKE DIFERENTE DE CADA VEZ ─────────────
 * Ela (16/10): «eu quero que mal entremos no site o vídeo comece logo a
 * correr» e, no mesmo dia, «para as pessoas não se fartarem… vai alternando de
 * takes na entrada do site». Os três `<video>` vêm vazios no HTML, e um guião
 * pequeno ESCRITO NO PRÓPRIO HTML (`arrancarEntrada`) corre enquanto o browser
 * lê a página: escolhe o take de entrada (a 1.ª visita na floresta; depois,
 * nunca o da entrada anterior — `escolherPrimeiro`), põe-lhe as `<source>` e
 * manda-o tocar. Não espera pelo JavaScript da página. (É HTML e não JSX
 * porque o React não põe o atributo `muted` no HTML do servidor — e, sem ele,
 * nenhum browser arranca um vídeo antes do JavaScript.)
 *
 * Numa navegação dentro do sítio o React não corre guiões escritos em HTML; aí
 * é o componente que chama a mesma função, já com a página montada.
 *
 * ── A CORTINA SOBE COM O VÍDEO ──────────────────────────────────────────────
 * Ela (16/10): «quero que a coloques sincronizada com o vídeo… para não ficar
 * nada travado». Enquanto a frase está no ecrã, o take de entrada descarrega e
 * arranca ESCONDIDO até o descodificador ter imagem (`playing` com dados para
 * seguir), e pára no 1.º fotograma. No instante em que o pano começa a subir,
 * o vídeo arranca: o take começa do princípio à vista dela, já sem nada para
 * carregar. Se no instante da subida o vídeo ainda não está pronto (rede
 * lenta), o pano e a frase ficam parados no sítio — até o vídeo estar pronto,
 * ou no máximo `CORTINA_ESPERA_MAX_MS` — e sobem juntos. Sem JavaScript, ou
 * sem cortina (movimento reduzido, navegação dentro do sítio), o vídeo arranca
 * logo, como antes.
 *
 * ── A FOTOGRAFIA POR BAIXO, O VÍDEO POR CIMA ────────────────────────────────
 * A fotografia da capa (o `HeroImage` por baixo) é o primeiro fotograma da
 * floresta, e continua a ser o elemento de LCP. O vídeo entra por cima quando
 * JÁ está a tocar, só com opacidade. Nunca aparece um quadro preto. (Quando o
 * take de entrada é outro, a fotografia dissolve-se nele em 0,8 s — e na
 * primeira entrada isso acontece debaixo da cortina.)
 *
 * ── CADA TAKE DESCARREGADO INTEIRO ANTES DA SUA VEZ ─────────────────────────
 * Ela (16/10), num iPhone em 4G pelo Instagram: «o vídeo está a travar aqui».
 * Os takes seguintes eram tocados directamente da rede: em 4G com pouco sinal
 * a imagem podia ficar sem dados a meio e parar. Agora cada take seguinte é
 * DESCARREGADO INTEIRO (um de cada vez, a começar quando o de entrada já tem
 * dados para seguir) e só depois tocado — da memória do telemóvel, onde a
 * rede já não o pode fazer parar. Quando falta `AQUECER_ANTES_S` para o fim
 * do take à vista, o seguinte descodifica o 1.º fotograma escondido (é o
 * único jeito de o iPhone o preparar), e na passagem só falta arrancar.
 * Fazê-lo só então, e não logo, poupa ter dois vídeos a descodificar durante
 * o take inteiro. Se o browser não deixar descarregar assim, cai no caminho
 * antigo: toca da rede, preparado logo.
 *
 * Quando faltam `PASSAGEM_MS` para o fim, o seguinte arranca e, quando JÁ está
 * a tocar, sobe por cima só com opacidade. Se ainda não estiver pronto (uma
 * rede muito lenta), o actual REPETE-SE em vez de parar, e a passagem faz-se
 * na volta seguinte.
 *
 * ── NUNCA FICA PARADO (o vigia) ─────────────────────────────────────────────
 * Ela (16/10): «quando volta ao vídeo, ele continua sempre de forma super
 * fluida, sem travar, e não pára». Fora do ecrã (ou com o separador
 * escondido) os vídeos param, para a rolagem ficar leve e o telemóvel não
 * gastar bateria. Ao voltar, retomam onde estavam. E, enquanto a entrada se
 * vê, um vigia confirma uma vez por segundo que o vídeo está mesmo a andar:
 *   · se o browser o parou sozinho → volta a tocá-lo;
 *   · se ficou `ENCRAVADO_MS` sem avançar (rede, descodificador) → salta para
 *     o vídeo seguinte se já estiver pronto, ou recarrega este no mesmo ponto.
 *
 * ── UMA NOTIFICAÇÃO, O AVISO DA BATERIA: VOLTA SOZINHO ─────────────────────
 * Ela (16/10): «apareceu-me uma notificação no telemóvel enquanto estava a ver
 * o vídeo… ou a notificação da bateria fraca, e o vídeo parou; quando voltei,
 * não quero que isso aconteça». O sistema do telemóvel pára o vídeo por cima
 * da página (uma janela do sistema, uma chamada, o aviso da bateria) sem dizer
 * porquê. Por isso cada `pause()` NOSSO fica marcado; uma paragem que não é
 * nossa é do sistema, e o vídeo volta a tocar logo, e outra vez aos 0,3 s e
 * a 1 s (o sistema às vezes recusa o primeiro pedido enquanto o aviso ainda
 * está a fechar). Ao regressar (separador, janela, `pageshow`, `resume`),
 * confirma-se meio segundo depois que a imagem anda mesmo; se o descodificador
 * ficou preso (acontece no iPhone depois de um aviso), um salto para o mesmo
 * instante solta-o — sem esperar pelo vigia.
 *
 * Se a pessoa ligar a «Poupança de bateria» no próprio aviso, o iPhone deixa
 * de deixar o vídeo arrancar sozinho: aí volta ao primeiro toque (ver abaixo).
 *
 * ── TOCA SEMPRE, MESMO COM «REDUZIR MOVIMENTO» E POUPANÇA DE ENERGIA ───────
 * Decisão dela (16/10), depois de ver o sítio da Festa Aluga a tocar o vídeo
 * no computador dela com as animações reduzidas: «quero que mesmo para
 * telemóveis ou PCs que tenham estas coisas, e também poupanças de energia, os
 * vídeos continuem a correr». Por isso `prefers-reduced-motion` e «Poupar
 * dados» NÃO desligam os vídeos (o resto do sítio continua a respeitá-los).
 * Quando o próprio aparelho recusa arrancar sozinho (o iPhone em poupança de
 * bateria recusa o `play()` sem gesto — `NotAllowedError`), fica a fotografia
 * e o vídeo arranca ao PRIMEIRO toque, clique ou tecla da pessoa em qualquer
 * sítio da página. Nenhum código consegue contornar a recusa sem um gesto.
 *
 * `aria-hidden`, sem controlos e fora do Tab: é fundo, mudo, sem nada que o
 * texto à volta não diga.
 */

/** A mesma escala de repouso da fotografia (`.hero-settle`, em globals.css). */
const ESTILO = `opacity:0;transform:scale(1.06);transition:opacity ${PASSAGEM_MS}ms ease`;

const COMUNS =
  'muted playsinline disablepictureinpicture disableremoteplayback tabindex="-1" ' +
  'aria-hidden="true" class="absolute inset-0 h-full w-full object-cover"';

const AO_ALTO = `media="(orientation: portrait)"`;

/**
 * As `<source>` do take `i` quando é o de entrada: ao alto a versão vertical,
 * deitado a larga; em cada uma HEVC, H.264, VP9 — o browser fica com a
 * primeira que sabe tocar. O HEVC vem primeiro porque só o dizem tocar os
 * aparelhos que o descodificam no chip (todos os da Apple, e Windows e Android
 * com o chip para isso); os outros passam ao H.264. O AV1 não entra aqui: o
 * Chrome di-lo tocar mesmo sem chip, e num telemóvel travava. Esse escolhe-o o
 * JavaScript para os takes seguintes, depois de perguntar ao aparelho.
 */
export function fontesDeEntrada(i: number): string {
  const de = (variante: "retrato" | "paisagem", media: string) =>
    (["hevc", "mp4", "webm"] as const)
      .map(
        (f) =>
          `<source ${media}src="${enderecoDoVideo(i, variante, f)}" type='${tipoDoFormato(f, variante)}'>`,
      )
      .join("");
  return de("retrato", `${AO_ALTO} `) + de("paisagem", "");
}

type ComPrerender = Document & { prerendering?: boolean };

/**
 * O GUIÃO DE ARRANQUE. Corre ESCRITO NO HTML, enquanto o browser lê a página
 * (antes de qualquer JavaScript do sítio), e por isso é uma função fechada em
 * si mesma: tudo o que precisa entra pelos argumentos, e é passada ao HTML
 * como texto (`.toString()`). Sem sintaxe que precise de ajudas do compilador.
 *
 *   1. escolhe o take de entrada (a mesma conta do `escolherPrimeiro`) e
 *      guarda-o no browser, para a próxima entrada ser outro;
 *   2. põe-lhe as `<source>` e manda-o tocar;
 *   3. se a cortina estiver no ecrã, sincroniza-se com ela (ver o cabeçalho).
 */
export function arrancarEntrada(fontes: string[], chave: string, esperaMax: number): void {
  const doc = document as ComPrerender;
  const guiao = doc.currentScript;
  const raiz = (guiao && guiao.parentElement) || doc.querySelector("[data-entrada]");
  if (!raiz || raiz.querySelector("[data-primeiro]")) return;
  const vs = raiz.querySelectorAll("video");
  let n = 0;
  try {
    const u = localStorage.getItem(chave);
    if (u !== null) {
      const ultimo = Number(u);
      if (ultimo >= 0 && ultimo < fontes.length && Math.floor(ultimo) === ultimo) {
        n = Math.floor(Math.random() * (fontes.length - 1));
        if (n >= ultimo) n++;
        if (n > fontes.length - 1) n = fontes.length - 1;
      }
    }
    localStorage.setItem(chave, String(n));
  } catch {
    // Janela privada ou armazenamento bloqueado: entra na floresta.
  }
  const v = vs[n] as HTMLVideoElement | undefined;
  if (!v) return;
  v.setAttribute("data-primeiro", "");
  v.muted = true;
  v.autoplay = true;
  v.preload = "auto";
  v.insertAdjacentHTML("beforeend", fontes[n]);
  // Um browser que não sabe tocar nenhuma das fontes fica com a fotografia.
  const fs = v.querySelectorAll("source");
  let tocavel = false;
  for (let i = 0; i < fs.length; i++) {
    if (v.canPlayType(fs[i].getAttribute("type") || "")) tocavel = true;
  }
  if (!tocavel) return;

  const c = doc.querySelector(".cortina") as HTMLElement | null;
  const cortinaNoEcra = () =>
    !!c &&
    c.isConnected &&
    !c.classList.contains("cortina--fora") &&
    typeof c.getAnimations === "function" &&
    getComputedStyle(c).display !== "none";

  const sincronizar = () => {
    if (!c || !cortinaNoEcra()) return;
    const pano = c.getAnimations()[0];
    if (!pano) return;
    // O browser devolve o tempo como o normalizou («1.98s», não «1980ms»).
    const tempo = getComputedStyle(doc.documentElement).getPropertyValue("--cortina-sobe").trim();
    const sobe =
      (parseFloat(tempo) || 0) * (/ms$/.test(tempo) ? 1 : /s$/.test(tempo) ? 1000 : 0) || 1980;
    const decorrido = typeof pano.currentTime === "number" ? pano.currentTime : 0;
    const animacoes = () => {
      let a = c.getAnimations({ subtree: true });
      const fotos = doc.querySelectorAll(".hero-settle");
      for (let i = 0; i < fotos.length; i++) a = a.concat(fotos[i].getAnimations());
      return a;
    };
    let pronto = false;
    let largou = false;
    let segurou = false;
    // Enquanto este atributo existir, o componente não toca neste vídeo.
    v.setAttribute("data-a-espera", "");
    const largar = () => {
      if (largou) return;
      largou = true;
      v.removeAttribute("data-a-espera");
      const p = v.play();
      if (p) p.catch(() => undefined);
      if (segurou) {
        const a = animacoes();
        for (let i = 0; i < a.length; i++) a[i].play();
      }
    };
    const ficaPronto = () => {
      if (pronto || largou) return;
      pronto = true;
      // O pano já está à espera dele: sobem juntos, sem voltar ao início (um
      // salto agora era uma espera a mais à vista).
      if (segurou) {
        largar();
        return;
      }
      v.pause();
      try {
        v.currentTime = 0;
      } catch {
        // ainda sem dados para saltar: fica onde está
      }
    };
    v.addEventListener(
      "playing",
      () => {
        if (v.readyState >= 4) ficaPronto();
        else v.addEventListener("canplaythrough", ficaPronto, { once: true });
      },
      { once: true },
    );
    const p = v.play();
    if (p) {
      p.catch(() => {
        // O aparelho recusou (poupança de bateria): não se segura nada, e o
        // componente arranca-o ao primeiro toque.
        pronto = true;
        largar();
      });
    }
    setTimeout(
      () => {
        if (largou) return;
        if (pronto) {
          largar();
          return;
        }
        segurou = true;
        const a = animacoes();
        for (let i = 0; i < a.length; i++) a[i].pause();
        setTimeout(largar, esperaMax);
      },
      // Um pouco ANTES da subida: o pano anda na placa gráfica, sozinho, mas
      // este relógio corre no processador, que nesse segundo está ocupado a
      // montar a página — MEDIDO, chegava 0,1 a 0,4 s atrasado ao pano.
      // Arrancado 0,35 s antes, o vídeo já anda quando o pano o destapa.
      Math.max(0, sobe - decorrido - 350),
    );
  };

  // Sem cortina, arranca já (o `autoplay` também o faz; isto é para não
  // depender só dele).
  if (!cortinaNoEcra() && !doc.prerendering) {
    const p = v.play();
    if (p) p.catch(() => undefined);
  }

  // Uma página pré-desenhada (o sítio prepara a seguinte quando o dedo se
  // aproxima de uma ligação) ainda não é página: a cortina está parada à
  // espera, e a sincronização também.
  if (doc.prerendering) {
    doc.addEventListener("prerenderingchange", sincronizar, { once: true });
  } else {
    sincronizar();
  }
}

/** As `<source>` de entrada de cada take, pela ordem dos `<video>`. */
const FONTES = Array.from({ length: NUMERO_DE_VIDEOS }, (_, i) => fontesDeEntrada(i));

/** O guião como texto, para ir no HTML (ver `arrancarEntrada`). */
export const GUIAO_DA_ENTRADA = `(${arrancarEntrada.toString()})(${JSON.stringify(FONTES)},${JSON.stringify(
  CHAVE_DO_ULTIMO,
)},${CORTINA_ESPERA_MAX_MS});`;

/**
 * O HTML dos três vídeos, igual no servidor e no browser: os três vazios, e o
 * guião que escolhe o take de entrada e o põe a tocar.
 */
export const HTML_DOS_VIDEOS =
  Array.from(
    { length: NUMERO_DE_VIDEOS },
    (_, k) =>
      `<video data-entrada-video="${k}" preload="none" ${COMUNS} style="${ESTILO}"></video>`,
  ).join("") + `<script>${GUIAO_DA_ENTRADA}</script>`;

export default function EntradaEmVideo() {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = caixa.current;
    const videos = raiz ? [...raiz.querySelectorAll<HTMLVideoElement>("video")] : [];
    if (!raiz || videos.length < NUMERO_DE_VIDEOS) return;
    // Numa navegação dentro do sítio o guião do HTML não correu: corre-se aqui.
    if (!raiz.querySelector("[data-primeiro]")) {
      arrancarEntrada(FONTES, CHAVE_DO_ULTIMO, CORTINA_ESPERA_MAX_MS);
    }
    let atual = Math.max(
      0,
      videos.findIndex((v) => v.hasAttribute("data-primeiro")),
    ); // o clip (= o <video>) que está à vista
    const primeiro = videos[atual];
    // Um browser que não toca nenhum dos formatos fica com a fotografia.
    const podeTocarTipo = (tipo: string) => primeiro.canPlayType(tipo);
    const talvez = formatoDoEndereco(primeiro.currentSrc) ?? formatoQueToca(podeTocarTipo);
    if (!talvez) return;
    // O formato dos vídeos seguintes: para já o que o browser escolheu para o
    // de entrada; o aparelho é perguntado a seguir (ver `melhorFormato`), e a
    // preparação dos seguintes espera pela resposta (no máximo 1 s).
    let formato: Formato = talvez;
    let decidido = false;

    let vivo = true;
    // A fila do que vem a seguir: a 1.ª volta começa no take de entrada e os
    // outros vêm sorteados; as voltas seguintes são sorteadas inteiras (ver
    // `primeiraVolta`/`novaVolta`). Mantém-se sempre com pelo menos dois à
    // frente, para a preparação em cadeia saber o que vem depois do próximo.
    const fila: number[] = primeiraVolta(atual).slice(1);
    const encherFila = () => {
      while (fila.length < 2) fila.push(...novaVolta(fila[fila.length - 1] ?? atual));
    };
    encherFila();
    const proximo = () => fila[0];
    let aPassar = false;
    let ultimoTempo = -1; // para o vigia: o último tempo visto do vídeo à vista
    let paradoDesde = 0;
    let naTela = true;
    let separadorVisivel = document.visibilityState !== "hidden";
    const aTocar = new Set<HTMLVideoElement>();
    /** Pronto a arrancar: com o 1.º fotograma descodificado. */
    const pronto = videos.map(() => false);
    /** Já se pediu a fonte (o download, ou o endereço da rede). */
    const pedido = videos.map((_, i) => i === atual);
    /** De onde toca: o ficheiro já na memória (`blob:`), ou o endereço da rede. */
    const fonte: Array<string | null> = videos.map(() => null);
    const daMemoria = videos.map(() => false);
    const aquecido = videos.map((_, i) => i === atual);
    const aAquecer = new Set<HTMLVideoElement>();
    const naMemoria: string[] = [];
    // Os `pause()` feitos por nós. Uma paragem que não esteja aqui foi o
    // sistema (uma notificação, o aviso da bateria) — e o vídeo volta logo.
    const pausadoPorNos = new WeakSet<HTMLVideoElement>();
    const limpar: Array<() => void> = [];
    const depois = (ms: number, fn: () => void) => {
      const t = window.setTimeout(() => {
        if (vivo) fn();
      }, ms);
      limpar.push(() => window.clearTimeout(t));
    };
    const podeDescarregar =
      typeof fetch === "function" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function";

    const ouvir = <K extends keyof HTMLVideoElementEventMap>(
      el: HTMLVideoElement,
      ev: K,
      fn: (e: HTMLVideoElementEventMap[K]) => void,
      once = false,
    ) => {
      el.addEventListener(ev, fn, { once });
      limpar.push(() => el.removeEventListener(ev, fn));
    };

    for (const el of videos) {
      // Propriedade e atributo: o iPhone olha para os dois.
      el.muted = true;
      el.defaultMuted = true;
    }

    const ecraDeAgora = () => ({
      largura: window.innerWidth,
      altura: window.innerHeight,
      densidade: window.devicePixelRatio || 1,
    });

    const podeTocar = () => naTela && separadorVisivel;
    /** O take de entrada à espera da cortina: é o guião do HTML que o larga. */
    const aEsperaDaCortina = (el: HTMLVideoElement) => el.hasAttribute("data-a-espera");

    // O aparelho recusou arrancar sozinho (poupança de bateria): espera-se pelo
    // primeiro gesto da pessoa, em qualquer sítio, e tenta-se outra vez.
    const GESTOS = ["pointerdown", "touchstart", "keydown", "click"] as const;
    let aEsperarGesto = false;
    const largarGestos = () => {
      for (const g of GESTOS) window.removeEventListener(g, aoGesto, true);
    };
    function aoGesto() {
      if (!vivo) return;
      aEsperarGesto = false;
      largarGestos();
      retomar();
    }
    const esperarPorGesto = () => {
      if (aEsperarGesto) return;
      aEsperarGesto = true;
      for (const g of GESTOS) window.addEventListener(g, aoGesto, { capture: true, passive: true });
    };
    limpar.push(largarGestos);

    function pausar(el: HTMLVideoElement) {
      if (!el.paused) pausadoPorNos.add(el);
      el.pause();
    }

    function tocar(el: HTMLVideoElement) {
      pausadoPorNos.delete(el);
      aAquecer.delete(el);
      aTocar.add(el);
      if (!podeTocar() || aEsperaDaCortina(el)) return;
      const p = el.play();
      p?.catch((e: unknown) => {
        const nome = (e as { name?: string })?.name;
        if (nome === "NotAllowedError") esperarPorGesto();
        // AbortError (um `pause()` a meio do arranque) e erros de rede: o vigia
        // volta a tentar no segundo seguinte.
      });
    }

    function pararTudo() {
      for (const el of aTocar) pausar(el);
    }
    function retomar() {
      if (!vivo || !podeTocar()) return;
      for (const el of aTocar) tocar(el);
    }

    /**
     * Ao regressar (de outra aplicação, de um aviso do sistema): retoma, e
     * meio segundo depois confirma que a imagem anda. Se não anda e o vídeo
     * tem dados, o descodificador ficou preso — um salto para o mesmo
     * instante solta-o.
     */
    function retomarEConfirmar() {
      retomar();
      const el = videos[atual];
      const antes = el.currentTime;
      depois(500, () => {
        if (!podeTocar() || aEsperarGesto || el !== videos[atual] || aPassar) return;
        if (aEsperaDaCortina(el)) return;
        if (el.paused) tocar(el);
        else if (el.currentTime === antes && el.readyState >= 2) {
          el.currentTime = antes;
          tocar(el);
        }
      });
    }

    /** Falta pouco para o fim do take à vista: é hora de aquecer o seguinte. */
    const pertoDoFim = () => {
      const el = videos[atual];
      const d = el.duration;
      return !Number.isFinite(d) || d <= 0 || d - el.currentTime <= AQUECER_ANTES_S;
    };

    /**
     * Aquece o clip `i`: põe-lhe a fonte e toca-o escondido até ter o 1.º
     * fotograma pronto, e pára-o no início. É o único jeito de o iPhone o
     * preparar — ignora o `preload` de um vídeo que ninguém mandou tocar.
     */
    function aquecer(i: number) {
      const src = fonte[i];
      if (aquecido[i] || !src) return;
      aquecido[i] = true;
      const el = videos[i];
      el.preload = "auto";
      el.src = src;
      el.load();
      const ficaPronto = () => {
        if (!vivo || pronto[i]) return;
        pronto[i] = true;
        if (aAquecer.has(el)) {
          aAquecer.delete(el);
          pausar(el);
          el.currentTime = 0;
        }
        prepararOQueVem();
      };
      ouvir(el, "canplaythrough", ficaPronto, true);
      aAquecer.add(el);
      el.play()?.catch(() => undefined);
    }

    /** Aquece o próximo da fila se já tiver fonte e for a altura. */
    function aquecerSeForHora() {
      const i = proximo();
      if (aquecido[i] || !fonte[i]) return;
      // Da rede: aquece-se logo (precisa de tempo para descarregar o início).
      // Da memória: só perto do fim do take à vista (ver o cabeçalho).
      if (!daMemoria[i] || pertoDoFim()) aquecer(i);
    }

    /**
     * Prepara o clip `i`: descarrega-o INTEIRO para a memória e, quando chega,
     * passa ao seguinte da fila. Se o browser não deixar descarregar assim,
     * fica com o endereço da rede e aquece-se logo (o caminho antigo).
     */
    function preparar(i: number) {
      if (i >= NUMERO_DE_VIDEOS || pedido[i]) return;
      pedido[i] = true;
      const endereco = enderecoDoVideo(i, varianteParaOEcra(ecraDeAgora(), i), formato);
      const daRede = () => {
        if (!vivo) return;
        fonte[i] = endereco;
        daMemoria[i] = false;
        aquecer(i);
      };
      if (!podeDescarregar) {
        daRede();
        return;
      }
      const corte = new AbortController();
      limpar.push(() => corte.abort());
      fetch(endereco, { signal: corte.signal })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          return r.blob();
        })
        .then((b) => {
          if (!vivo) return;
          const u = URL.createObjectURL(b);
          naMemoria.push(u);
          fonte[i] = u;
          daMemoria[i] = true;
          aquecerSeForHora();
          prepararOQueVem();
        })
        .catch(() => {
          if (!vivo) return;
          daRede();
          prepararOQueVem();
        });
    }

    /** Prepara o primeiro da fila que ainda não foi pedido (um de cada vez). */
    function prepararOQueVem() {
      if (!decidido || !inicioAssente) return;
      for (const i of fila) {
        if (!pedido[i]) {
          preparar(i);
          return;
        }
        // Ainda a chegar: o seguinte espera (um de cada vez, para não dividir
        // a rede). Da rede, espera-se que esteja pronto a tocar.
        if (!fonte[i]) return;
        if (!daMemoria[i] && !pronto[i] && videos[i].readyState < 4) return;
      }
    }

    /** Pôr o vídeo `el` à vista, por cima dos outros. */
    const mostrar = (el: HTMLVideoElement) => {
      el.style.zIndex = "2";
      el.style.opacity = "1";
    };

    const passar = () => {
      if (aPassar) return;
      const velho = videos[atual];
      const seguinte = proximo();
      const novo = videos[seguinte];
      // Ainda não chegou (rede lenta)? Este repete-se em vez de parar, e a
      // passagem tenta-se outra vez na próxima volta.
      if (!pronto[seguinte] && novo.readyState < 3) {
        velho.loop = true;
        if (fonte[seguinte]) aquecer(seguinte);
        else preparar(seguinte);
        return;
      }
      aPassar = true;
      velho.loop = false;
      ouvir(
        novo,
        "playing",
        () => {
          if (!vivo) return;
          velho.style.zIndex = "1";
          mostrar(novo);
          const t = setTimeout(() => {
            if (!vivo) return;
            pausar(velho);
            aTocar.delete(velho);
            velho.style.opacity = "0";
            velho.style.zIndex = "0";
            velho.currentTime = 0;
            atual = seguinte;
            fila.shift();
            encherFila();
            aPassar = false;
            ultimoTempo = -1;
            prepararOQueVem();
            aquecerSeForHora();
          }, PASSAGEM_MS + 50);
          limpar.push(() => clearTimeout(t));
        },
        true,
      );
      novo.currentTime = 0;
      tocar(novo);
    };

    for (const el of videos) {
      ouvir(el, "timeupdate", () => {
        if (el !== videos[atual] || aPassar) return;
        if (eHoraDePassar(el.currentTime, el.duration)) passar();
        else aquecerSeForHora();
      });
      // Parado sem ter sido por nós: foi o sistema (uma notificação, o aviso
      // da bateria, uma chamada). Volta logo, e insiste aos 0,3 s e a 1 s.
      ouvir(el, "pause", () => {
        if (pausadoPorNos.has(el)) {
          pausadoPorNos.delete(el);
          return;
        }
        if (!vivo || el.ended || !podeTocar() || aEsperarGesto || aEsperaDaCortina(el)) return;
        if (aAquecer.has(el)) {
          el.play()?.catch(() => undefined);
          return;
        }
        if (!aTocar.has(el)) return;
        tocar(el);
        for (const ms of [300, 1000]) {
          depois(ms, () => {
            if (el.paused && !el.ended && aTocar.has(el) && podeTocar() && !aEsperarGesto) {
              tocar(el);
            }
          });
        }
      });
      // Rede de segurança: se o `timeupdate` da recta final se perder.
      ouvir(el, "ended", () => {
        if (el !== videos[atual]) return;
        passar();
        if (!aPassar) {
          el.currentTime = 0;
          tocar(el);
        }
      });
    }

    // O take de entrada sobe por cima da fotografia quando JÁ está a tocar —
    // pode já estar, se começou antes de o JavaScript chegar.
    let mostrado = false;
    // A preparação dos seguintes só começa quando o de entrada já tem dados
    // para seguir (ou 4 s depois de aparecer): em 4G, descarregar o seguinte
    // ao mesmo tempo dividia a rede e fazia parar o que se está a ver.
    let inicioAssente = false;
    const assentar = () => {
      if (!vivo || inicioAssente) return;
      inicioAssente = true;
      prepararOQueVem();
    };
    const mostrarPrimeiro = () => {
      if (!vivo || mostrado) return;
      mostrado = true;
      mostrar(primeiro);
      if (pronto[atual] || primeiro.readyState >= 4) assentar();
      else depois(4000, assentar);
    };
    ouvir(primeiro, "canplaythrough", () => {
      pronto[atual] = true;
      if (mostrado) assentar();
    });
    if (!primeiro.paused && primeiro.readyState >= 3) mostrarPrimeiro();
    else ouvir(primeiro, "playing", mostrarPrimeiro, true);
    tocar(primeiro);

    // O aparelho é perguntado que formato descodifica no chip, para os vídeos
    // seguintes (o de entrada já vai no que o browser escolheu das `<source>`).
    const decidir = (f: Formato | null) => {
      if (!vivo || decidido) return;
      if (f) formato = f;
      decidido = true;
      prepararOQueVem();
    };
    melhorFormato(podeTocarTipo, perguntaDoNavegador(), varianteParaOEcra(ecraDeAgora(), 1))
      .then(decidir)
      .catch(() => decidir(null));
    depois(1000, () => decidir(null));

    // ── O vigia ─────────────────────────────────────────────────────────────
    const vigiar = () => {
      if (!vivo || !podeTocar() || aEsperarGesto) {
        paradoDesde = 0;
        return;
      }
      const el = videos[atual];
      if (aEsperaDaCortina(el)) {
        paradoDesde = 0;
        return;
      }
      // Parado pelo browser (não por nós): volta a tocar.
      if (el.paused && !el.ended) tocar(el);
      // A meio de uma passagem, quem tem de andar é o seguinte.
      if (aPassar) {
        const novo = videos[proximo()];
        if (novo.paused) tocar(novo);
        return;
      }
      const t = el.currentTime;
      if (t !== ultimoTempo) {
        ultimoTempo = t;
        paradoDesde = 0;
        return;
      }
      const agora = performance.now();
      if (!paradoDesde) {
        paradoDesde = agora;
        return;
      }
      if (agora - paradoDesde < ENCRAVADO_MS) return;
      paradoDesde = 0;
      // Ainda a descarregar numa rede lenta: recarregar deitava fora o que já
      // chegou. Espera-se.
      if (el.networkState === el.NETWORK_LOADING && el.readyState < 3) return;
      const seguinte = proximo();
      if (mostrado && (pronto[seguinte] || videos[seguinte].readyState >= 3)) {
        passar(); // o seguinte está pronto: segue-se para ele
      } else {
        // Recarrega este no mesmo ponto (o de entrada volta a tentar as suas
        // fontes; os outros a sua, da memória ou da rede).
        if (el === primeiro) el.load();
        else {
          el.src =
            fonte[atual] ??
            enderecoDoVideo(atual, varianteParaOEcra(ecraDeAgora(), atual), formato);
          el.load();
        }
        ouvir(el, "loadedmetadata", () => void (el.currentTime = t), true);
        tocar(el);
      }
    };
    const relogio = window.setInterval(vigiar, 1000);

    const io = new IntersectionObserver(
      ([e]) => {
        naTela = e.isIntersecting;
        if (naTela) retomar();
        else pararTudo();
      },
      { threshold: 0 },
    );
    io.observe(raiz);
    const aoMudarSeparador = () => {
      separadorVisivel = document.visibilityState !== "hidden";
      if (separadorVisivel) retomarEConfirmar();
      else pararTudo();
    };
    const aoRegressar = () => retomarEConfirmar();
    document.addEventListener("visibilitychange", aoMudarSeparador);
    // `resume`: o Chrome do Android «congela» a página por trás de outra
    // aplicação e avisa assim quando a descongela.
    document.addEventListener("resume", aoRegressar);
    window.addEventListener("pageshow", aoRegressar);
    window.addEventListener("focus", aoRegressar);

    return () => {
      vivo = false;
      window.clearInterval(relogio);
      io.disconnect();
      document.removeEventListener("visibilitychange", aoMudarSeparador);
      document.removeEventListener("resume", aoRegressar);
      window.removeEventListener("pageshow", aoRegressar);
      window.removeEventListener("focus", aoRegressar);
      for (const f of limpar) f();
      for (const el of videos) el.pause();
      for (const el of videos) {
        if (el === primeiro) continue;
        el.removeAttribute("src");
        el.load();
      }
      for (const u of naMemoria) URL.revokeObjectURL(u);
    };
  }, []);

  return (
    <div
      ref={caixa}
      data-entrada=""
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      // O guião do HTML põe as `<source>` e marca o take de entrada antes de
      // o React chegar: o HTML deixa de ser igual ao que o servidor escreveu, de
      // propósito. Vale só para este elemento.
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: HTML_DOS_VIDEOS }}
    />
  );
}
