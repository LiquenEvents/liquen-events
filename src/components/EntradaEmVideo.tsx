"use client";

import { useEffect, useRef } from "react";
import {
  ENCRAVADO_MS,
  NUMERO_DE_VIDEOS,
  PASSAGEM_MS,
  eHoraDePassar,
  enderecoDoVideo,
  formatoQueToca,
  type Formato,
  novaVolta,
  primeiraVolta,
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
 * ── COMEÇA LOGO QUE SE ENTRA ────────────────────────────────────────────────
 * Ela (16/10): «eu quero que mal entremos no site o vídeo comece logo a
 * correr». Por isso o vídeo 1 vem JÁ no HTML da página, com `autoplay muted
 * playsinline` escritos como atributos: o browser começa a descarregá-lo e a
 * tocá-lo enquanto lê a página, sem esperar pelo JavaScript. (Escreve-se como
 * HTML e não como JSX porque o React não põe o atributo `muted` no HTML do
 * servidor — e, sem ele, nenhum browser arranca o vídeo antes do JavaScript.)
 * As `<source>` com `media="(orientation: portrait)"` dão logo ao telemóvel ao
 * alto a versão vertical; os seguintes escolhe-os o JavaScript.
 *
 * ── A FOTOGRAFIA POR BAIXO, O VÍDEO POR CIMA ────────────────────────────────
 * A fotografia da capa (o `HeroImage` por baixo) é o primeiro fotograma do
 * vídeo 1 — a floresta, sem tiras — e continua a ser o elemento de LCP. O
 * vídeo entra por cima quando JÁ está a tocar; como começa na mesma imagem, a
 * passagem não se vê. Nunca aparece um quadro preto.
 *
 * ── UM `<video>` POR CLIP, PREPARADOS EM CADEIA ─────────────────────────────
 * Ela (16/10): «há uma parte em que o vídeo pára e depois começa». Era a
 * passagem do 2 para o 3: com dois `<video>` a revezar-se, o 3 só começava a
 * descarregar quando o 2 já estava à vista — e o 2 dura 4 s. O 3 não chegava
 * a tempo e a imagem ficava parada à espera dele.
 *
 * Agora há um `<video>` para cada clip, e cada um é PREPARADO muito antes da
 * sua vez: quando o 1 começa a tocar prepara-se o 2; quando o 2 tem o
 * suficiente, prepara-se o 3. Preparar quer dizer descarregar e tocar
 * escondido um instante — é o único jeito de o iPhone o descarregar, porque
 * ignora o `preload` de um vídeo que ninguém mandou tocar. Na volta seguinte
 * já estão todos carregados e não se descarrega nada outra vez.
 *
 * Quando faltam `PASSAGEM_MS` para o fim, o seguinte arranca e, quando JÁ está
 * a tocar, sobe por cima só com opacidade. Se ainda não estiver pronto (uma
 * rede muito lenta), o actual REPETE-SE em vez de parar, e a passagem faz-se
 * na volta seguinte. 1 → 2 → 3 → 1…, sem fim e sem paragens.
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
 * Também retoma ao regressar à página pelo «voltar» (`pageshow`) e ao voltar
 * a janela (`focus`).
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

const H264 = `type='video/mp4; codecs="avc1.640028"'`;
const VP9 = `type='video/webm; codecs="vp9"'`;
const AO_ALTO = `media="(orientation: portrait)"`;

/**
 * O HTML dos três vídeos, igual no servidor e no browser. O 1.º arranca
 * sozinho, na versão do ecrã (vertical ao alto, larga deitado), H.264 primeiro
 * e VP9 como rede; os outros ficam vazios até o JavaScript os preparar.
 */
export const HTML_DOS_VIDEOS =
  `<video data-entrada-video="0" autoplay preload="auto" ${COMUNS} style="${ESTILO}">` +
  `<source ${AO_ALTO} src="${enderecoDoVideo(0, "retrato", "mp4")}" ${H264}>` +
  `<source ${AO_ALTO} src="${enderecoDoVideo(0, "retrato", "webm")}" ${VP9}>` +
  `<source src="${enderecoDoVideo(0, "paisagem", "mp4")}" ${H264}>` +
  `<source src="${enderecoDoVideo(0, "paisagem", "webm")}" ${VP9}>` +
  `</video>` +
  Array.from(
    { length: NUMERO_DE_VIDEOS - 1 },
    (_, k) =>
      `<video data-entrada-video="${k + 1}" preload="none" ${COMUNS} style="${ESTILO}"></video>`,
  ).join("");

export default function EntradaEmVideo() {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = caixa.current;
    const videos = raiz ? [...raiz.querySelectorAll<HTMLVideoElement>("video")] : [];
    if (!raiz || videos.length < NUMERO_DE_VIDEOS) return;
    const primeiro = videos[0];
    // Um browser que não toca nenhum dos dois formatos fica com a fotografia.
    const talvez = formatoQueToca((tipo) => primeiro.canPlayType(tipo));
    if (!talvez) return;
    const formato: Formato = talvez;

    let vivo = true;
    let atual = 0; // o clip (= o <video>) que está à vista
    // A fila do que vem a seguir: a 1.ª volta começa na floresta e os outros
    // vêm sorteados; as voltas seguintes são sorteadas inteiras (ver
    // `primeiraVolta`/`novaVolta`). Mantém-se sempre com pelo menos dois à
    // frente, para a preparação em cadeia saber o que vem depois do próximo.
    const fila: number[] = primeiraVolta().slice(1);
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
    const pronto = videos.map(() => false);
    const pedido = videos.map((_, i) => i === 0);
    const aAquecer = new Set<HTMLVideoElement>();
    const limpar: Array<() => void> = [];

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

    function tocar(el: HTMLVideoElement) {
      aAquecer.delete(el);
      aTocar.add(el);
      if (!podeTocar()) return;
      const p = el.play();
      p?.catch((e: unknown) => {
        const nome = (e as { name?: string })?.name;
        if (nome === "NotAllowedError") esperarPorGesto();
        // AbortError (um `pause()` a meio do arranque) e erros de rede: o vigia
        // volta a tentar no segundo seguinte.
      });
    }

    function pararTudo() {
      for (const el of aTocar) el.pause();
    }
    function retomar() {
      if (!vivo || !podeTocar()) return;
      for (const el of aTocar) tocar(el);
    }

    /**
     * Prepara o clip `i`: descarrega-o e toca-o escondido até ter dados para
     * tocar sem engasgar, e pára-o no início. Quando está pronto, prepara o
     * seguinte — a cadeia que garante que ninguém espera por ninguém.
     */
    function preparar(i: number) {
      if (i >= NUMERO_DE_VIDEOS || pedido[i]) return;
      pedido[i] = true;
      const el = videos[i];
      el.preload = "auto";
      el.src = enderecoDoVideo(i, varianteParaOEcra(ecraDeAgora(), i), formato);
      el.load();
      const ficaPronto = () => {
        if (!vivo || pronto[i]) return;
        pronto[i] = true;
        if (aAquecer.has(el)) {
          aAquecer.delete(el);
          el.pause();
          el.currentTime = 0;
        }
        prepararOQueVem();
      };
      ouvir(el, "canplaythrough", ficaPronto, true);
      // O iPhone não descarrega um vídeo que ninguém mandou tocar: toca-se
      // escondido (opacidade 0, por baixo) até chegar o `canplaythrough`.
      aAquecer.add(el);
      el.play()?.catch(() => undefined);
    }

    /** Prepara o primeiro da fila que ainda não foi pedido (um de cada vez). */
    function prepararOQueVem() {
      for (const i of fila) {
        if (!pedido[i]) {
          preparar(i);
          return;
        }
        // Ainda a preparar este: o seguinte espera (um de cada vez, para não
        // dividir a rede). O 1.º pode ter ficado pronto antes do JavaScript.
        if (!pronto[i] && videos[i].readyState < 4) return;
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
        preparar(seguinte);
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
            velho.pause();
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

    // O 1.º entra por cima da fotografia quando JÁ está a tocar — pode já estar,
    // se começou antes de o JavaScript chegar.
    let mostrado = false;
    const mostrarPrimeiro = () => {
      if (!vivo || mostrado) return;
      mostrado = true;
      mostrar(primeiro);
      prepararOQueVem();
    };
    if (!primeiro.paused && primeiro.readyState >= 3) mostrarPrimeiro();
    else ouvir(primeiro, "playing", mostrarPrimeiro, true);
    ouvir(primeiro, "canplaythrough", () => void (pronto[0] = true), true);
    tocar(primeiro);

    // ── O vigia ─────────────────────────────────────────────────────────────
    const vigiar = () => {
      if (!vivo || !podeTocar() || aEsperarGesto) {
        paradoDesde = 0;
        return;
      }
      const el = videos[atual];
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
        // Recarrega este no mesmo ponto (o 1.º volta a tentar as suas fontes).
        if (el === primeiro) el.load();
        else {
          el.src = enderecoDoVideo(atual, varianteParaOEcra(ecraDeAgora(), atual), formato);
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
      if (separadorVisivel) retomar();
      else pararTudo();
    };
    const aoRegressar = () => retomar();
    document.addEventListener("visibilitychange", aoMudarSeparador);
    window.addEventListener("pageshow", aoRegressar);
    window.addEventListener("focus", aoRegressar);

    return () => {
      vivo = false;
      window.clearInterval(relogio);
      io.disconnect();
      document.removeEventListener("visibilitychange", aoMudarSeparador);
      window.removeEventListener("pageshow", aoRegressar);
      window.removeEventListener("focus", aoRegressar);
      for (const f of limpar) f();
      for (const el of videos) el.pause();
      for (const el of videos.slice(1)) {
        el.removeAttribute("src");
        el.load();
      }
    };
  }, []);

  return (
    <div
      ref={caixa}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      dangerouslySetInnerHTML={{ __html: HTML_DOS_VIDEOS }}
    />
  );
}
