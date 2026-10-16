"use client";

import { useEffect, useRef } from "react";
import {
  PASSAGEM_MS,
  alturaParaOEcra,
  eHoraDePassar,
  enderecoDoVideo,
  formatoQueToca,
  ligacaoLenta,
  proximoVideo,
} from "@/lib/entrada-em-video";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * OS TRÊS VÍDEOS DE FUNDO DA ENTRADA
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Pedido dela (15/10): os três vídeos na capa, «super fluidos, sem travar».
 * As regras puras estão em `src/lib/entrada-em-video.ts`; aqui está só o que
 * mexe nos `<video>`.
 *
 * ── COMEÇA LOGO QUE SE ENTRA ────────────────────────────────────────────────
 * Ela (16/10): «eu quero que mal entremos no site o vídeo comece logo a
 * correr». Por isso o vídeo 1 vem JÁ no HTML da página, com `autoplay muted
 * playsinline` escritos como atributos: o browser começa a descarregá-lo e a
 * tocá-lo enquanto lê a página, sem esperar pelo JavaScript. (Escreve-se como
 * HTML e não como JSX porque o React não põe o atributo `muted` no HTML do
 * servidor — e, sem ele, nenhum browser arranca o vídeo antes do JavaScript.)
 * O JavaScript só chega depois para a sequência, a pausa fora do ecrã e a
 * poupança de bateria.
 *
 * ── A FOTOGRAFIA POR BAIXO, O VÍDEO POR CIMA ────────────────────────────────
 * A fotografia da capa (o `HeroImage` por baixo) é o primeiro fotograma do
 * vídeo 1, e continua a ser o elemento de LCP (AVIF, pré-carregada). O vídeo
 * entra por cima dela num esbatimento quando JÁ está a tocar (o evento
 * `playing`); como começa na mesma imagem, a passagem não se vê. Nunca aparece
 * um quadro preto.
 *
 * ── DOIS `<video>` EMPILHADOS ───────────────────────────────────────────────
 * Enquanto um toca, o outro já carrega o seguinte. Quando faltam `PASSAGEM_MS`
 * para o fim, o seguinte começa e sobe por cima só com opacidade (o que a
 * placa gráfica faz sozinha). Se o seguinte ainda não estiver pronto, o actual
 * fica no último fotograma até ele chegar — nunca preto. 1 → 2 → 3 → 1…
 *
 * ── E SÓ GASTA QUANDO SE VÊ ─────────────────────────────────────────────────
 * Pára quando a entrada sai do ecrã ou o separador fica escondido, e retoma ao
 * voltar: a rolagem fica fluida e o telemóvel não gasta bateria a tocar o que
 * ninguém vê.
 *
 * ── TOCA SEMPRE, MESMO COM «REDUZIR MOVIMENTO» E POUPANÇA DE ENERGIA ───────
 * Decisão dela (16/10), depois de ver o sítio da Festa Aluga a tocar o vídeo
 * no computador dela com as animações reduzidas: «quero que mesmo para
 * telemóveis ou PCs que tenham estas coisas, e também poupanças de energia, os
 * vídeos continuem a correr». Por isso:
 *   · `prefers-reduced-motion` NÃO desliga os vídeos (o resto do sítio
 *     continua a respeitá-lo; isto é só o fundo da entrada);
 *   · «Poupar dados» e ligações lentas recebem a versão leve (720p) a partir
 *     do vídeo 2 — o vídeo 1 já vem no HTML, antes de se saber a ligação;
 *   · quando o próprio aparelho recusa arrancar sozinho (o iPhone em poupança
 *     de bateria recusa o `play()` sem gesto — `NotAllowedError`), fica a
 *     fotografia e o vídeo arranca ao PRIMEIRO toque, clique ou tecla da
 *     pessoa em qualquer sítio da página. Nenhum código consegue contornar a
 *     recusa sem um gesto; é o mais perto que o browser deixa chegar.
 *
 * `aria-hidden`, sem controlos e fora do Tab: é fundo, mudo, sem nada que o
 * texto à volta não diga.
 */

/** A mesma escala de repouso da fotografia (`.hero-settle`, em globals.css). */
const ESTILO = `opacity:0;transform:scale(1.06);transition:opacity ${PASSAGEM_MS}ms ease`;

const COMUNS =
  'muted playsinline disablepictureinpicture disableremoteplayback tabindex="-1" ' +
  'aria-hidden="true" class="absolute inset-0 h-full w-full object-cover"';

/**
 * O HTML dos dois vídeos, igual no servidor e no browser. O 1.º arranca
 * sozinho (H.264 primeiro; VP9 para quem não tem H.264); o 2.º fica vazio até
 * o JavaScript lhe dar o vídeo seguinte.
 */
export const HTML_DOS_VIDEOS =
  `<video data-entrada-video="0" autoplay preload="auto" ${COMUNS} style="${ESTILO}">` +
  `<source src="${enderecoDoVideo(0, 1080, "mp4")}" type='video/mp4; codecs="avc1.640028"'>` +
  `<source src="${enderecoDoVideo(0, 1080, "webm")}" type='video/webm; codecs="vp9"'>` +
  `</video>` +
  `<video data-entrada-video="1" preload="none" ${COMUNS} style="${ESTILO}"></video>`;

type Ligacao = { saveData?: boolean; effectiveType?: string };

function ligacao(): Ligacao {
  return (navigator as Navigator & { connection?: Ligacao }).connection ?? {};
}

export default function EntradaEmVideo() {
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const raiz = caixa.current;
    const videos = raiz ? [...raiz.querySelectorAll<HTMLVideoElement>("video")] : [];
    if (!raiz || videos.length < 2) return;
    const [primeiro, segundo] = videos;
    // Um browser que não toca nenhum dos dois formatos fica com a fotografia.
    const formato = formatoQueToca((tipo) => primeiro.canPlayType(tipo));
    if (!formato) return;
    const c = ligacao();
    const altura = alturaParaOEcra(ligacaoLenta(c.effectiveType, c.saveData));

    let vivo = true;
    let atual = 0; // o <video> que está à vista
    let clip = 0; // o vídeo (0..2) que ele toca
    let aPassar = false;
    let seguintePedido = false;
    let naTela = true;
    let separadorVisivel = document.visibilityState !== "hidden";
    const aTocar = new Set<HTMLVideoElement>();
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

    const desistir = () => {
      if (!vivo) return;
      vivo = false;
      // Fica a fotografia, que está por baixo.
      for (const el of videos) {
        el.pause();
        el.style.opacity = "0";
      }
    };

    const carregar = (el: HTMLVideoElement, i: number) => {
      el.preload = "auto";
      el.src = enderecoDoVideo(i, altura, formato);
      el.load();
    };

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
      aTocar.add(el);
      if (!podeTocar()) return;
      const p = el.play();
      p?.catch((e: unknown) => {
        const nome = (e as { name?: string })?.name;
        // Um `pause()` a meio do arranque dá AbortError: não é recusa.
        if (nome === "AbortError") return;
        if (nome === "NotAllowedError") {
          esperarPorGesto();
          return;
        }
        desistir();
      });
    }

    function pararTudo() {
      for (const el of aTocar) el.pause();
    }
    function retomar() {
      if (!podeTocar()) return;
      for (const el of aTocar) tocar(el);
    }

    const passar = () => {
      aPassar = true;
      const velho = videos[atual];
      const novo = videos[1 - atual];
      const comecar = () => {
        if (!vivo) return;
        ouvir(
          novo,
          "playing",
          () => {
            novo.style.zIndex = "2";
            velho.style.zIndex = "1";
            novo.style.opacity = "1";
            const t = setTimeout(() => {
              if (!vivo) return;
              velho.pause();
              aTocar.delete(velho);
              velho.style.opacity = "0";
              atual = 1 - atual;
              clip = proximoVideo(clip);
              aPassar = false;
              // O que saiu de cena já vai buscando o que vem depois.
              carregar(velho, proximoVideo(clip));
              seguintePedido = true;
            }, PASSAGEM_MS + 50);
            limpar.push(() => clearTimeout(t));
          },
          true,
        );
        tocar(novo);
      };
      // HAVE_FUTURE_DATA: tem o bastante para tocar sem engasgar já.
      if (novo.readyState >= 3) comecar();
      else ouvir(novo, "canplay", comecar, true);
    };

    for (const el of videos) {
      ouvir(el, "timeupdate", () => {
        if (el !== videos[atual] || aPassar) return;
        if (eHoraDePassar(el.currentTime, el.duration)) passar();
      });
    }
    // Um erro no ficheiro do 2.º (o 1.º tem as `<source>`, que caem uma na
    // outra sozinhas) deixa a fotografia e o vídeo que já estava.
    ouvir(segundo, "error", desistir);

    // O 1.º entra por cima da fotografia quando JÁ está a tocar — pode já estar,
    // se começou antes de o JavaScript chegar.
    const mostrarPrimeiro = () => {
      if (!vivo) return;
      primeiro.style.zIndex = "2";
      primeiro.style.opacity = "1";
      if (!seguintePedido) {
        carregar(segundo, proximoVideo(0));
        seguintePedido = true;
      }
    };
    if (!primeiro.paused && primeiro.readyState >= 3) mostrarPrimeiro();
    else ouvir(primeiro, "playing", mostrarPrimeiro, true);
    tocar(primeiro);

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
    document.addEventListener("visibilitychange", aoMudarSeparador);

    return () => {
      vivo = false;
      io.disconnect();
      document.removeEventListener("visibilitychange", aoMudarSeparador);
      for (const f of limpar) f();
      for (const el of videos) el.pause();
      segundo.removeAttribute("src");
      segundo.load();
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
