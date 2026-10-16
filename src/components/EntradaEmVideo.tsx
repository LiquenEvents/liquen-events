"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { onIdle } from "@/lib/onIdle";
import {
  PASSAGEM_MS,
  alturaParaOEcra,
  deveHaverVideo,
  eHoraDePassar,
  enderecoDoVideo,
  formatoQueToca,
  type Formato,
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
 * ── A FOTOGRAFIA PRIMEIRO, O VÍDEO POR CIMA ─────────────────────────────────
 * A fotografia da capa (o `HeroImage` por baixo) é o primeiro fotograma do
 * vídeo 1. É ela o elemento de LCP, em AVIF e pré-carregada, como antes: o
 * vídeo não lhe rouba largura de banda. Quando o vídeo já está A TOCAR (o
 * evento `playing`, não o `canplay`), entra por cima num esbatimento — e, como
 * começa na mesma imagem, a passagem não se vê. Nunca aparece um quadro preto.
 *
 * ── DOIS `<video>` EMPILHADOS ───────────────────────────────────────────────
 * Enquanto um toca, o outro já carrega o seguinte. Quando faltam `PASSAGEM_MS`
 * para o fim, o seguinte começa e sobe por cima só com opacidade (o que a
 * placa gráfica faz sozinha). Se o seguinte ainda não estiver pronto, o actual
 * fica no último fotograma até ele chegar — nunca preto. 1 → 2 → 3 → 1…
 *
 * ── SÓ ARRANCA QUANDO NÃO ATRAPALHA ─────────────────────────────────────────
 * Depois do `load` da página, depois de a cortina da primeira visita subir e
 * de o zoom da fotografia (`.hero-settle`) assentar — o vídeo tem a mesma
 * escala de repouso, 1,06, e entrar a meio do zoom via-se como um salto — e
 * com o processador livre (`onIdle`).
 *
 * ── E SÓ GASTA QUANDO SE VÊ ─────────────────────────────────────────────────
 * Pára quando a entrada sai do ecrã ou o separador fica escondido, e retoma ao
 * voltar: a rolagem fica fluida e o telemóvel não gasta bateria a tocar o que
 * ninguém vê.
 *
 * ── QUANDO NÃO HÁ VÍDEO ────────────────────────────────────────────────────
 * Movimento reduzido, «Poupar dados», ligação 2G, ou o browser a recusar o
 * `play()` (o iPhone em poupança de bateria faz isso): fica a fotografia, como
 * antes. Um erro de rede num ficheiro faz o mesmo.
 *
 * `aria-hidden`, sem controlos e fora do Tab: é fundo, mudo, sem nada que o
 * texto à volta não diga.
 */

/** A mesma escala de repouso da fotografia (`.hero-settle`, em globals.css). */
const ESCALA = "scale(1.06)";

/** Espera, sem ficar pendurado: o que não chegar em `ms` deixa de contar. */
function comTecto<T>(p: Promise<T>, ms: number): Promise<unknown> {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

function depoisDoLoad(): Promise<void> {
  if (document.readyState === "complete") return Promise.resolve();
  return new Promise((r) => window.addEventListener("load", () => r(), { once: true }));
}

function depoisDaCortina(): Promise<void> {
  const raiz = document.documentElement;
  const subiu = () =>
    !document.querySelector(".cortina") || raiz.getAttribute("data-cortina") === "fora";
  if (subiu()) return Promise.resolve();
  return new Promise((r) => {
    const mo = new MutationObserver(() => {
      if (subiu()) {
        mo.disconnect();
        r();
      }
    });
    mo.observe(raiz, { attributes: true, attributeFilter: ["data-cortina"] });
  });
}

function depoisDoZoom(caixa: HTMLElement | null): Promise<unknown> {
  const foto = caixa?.parentElement?.querySelector<HTMLElement>(".hero-settle");
  const anims = foto?.getAnimations?.() ?? [];
  return Promise.all(anims.map((a) => a.finished.catch(() => undefined)));
}

type Ligacao = { saveData?: boolean; effectiveType?: string };

function ligacao(): Ligacao {
  return (navigator as Navigator & { connection?: Ligacao }).connection ?? {};
}

export default function EntradaEmVideo() {
  const reduzido = useReducedMotion();
  const [ligado, setLigado] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const v0 = useRef<HTMLVideoElement>(null);
  const v1 = useRef<HTMLVideoElement>(null);
  const formatoRef = useRef<Formato>("mp4");

  // 1) Decidir se há vídeo e esperar pelo momento certo.
  useEffect(() => {
    // Com movimento reduzido nem se espera: o `ativo` lá em baixo já é falso.
    if (reduzido) return;
    const c = ligacao();
    if (
      !deveHaverVideo({
        movimentoReduzido: false,
        pouparDados: c.saveData,
        tipoDeLigacao: c.effectiveType,
      })
    ) {
      return;
    }
    const sonda = document.createElement("video");
    const formato = formatoQueToca((tipo) => sonda.canPlayType(tipo));
    if (!formato) return;
    formatoRef.current = formato;
    let vivo = true;
    (async () => {
      await comTecto(depoisDoLoad(), 8000);
      await comTecto(depoisDaCortina(), 4000);
      if (!vivo) return;
      setLigado(true);
    })();
    return () => {
      vivo = false;
    };
  }, [reduzido]);

  // Ligar o movimento reduzido a meio também tira os vídeos.
  const ativo = ligado && !reduzido;

  // 2) Tocar.
  useEffect(() => {
    if (!ativo) return;
    const els = [v0.current, v1.current];
    const raiz = caixa.current;
    if (!els[0] || !els[1] || !raiz) return;
    const videos = els as HTMLVideoElement[];
    const c = ligacao();
    const formato = formatoRef.current;
    const altura = alturaParaOEcra(
      window.innerWidth,
      Boolean(c.saveData) || ligacaoLenta(c.effectiveType),
    );

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
      // O `muted` tem de ser a propriedade E o atributo para o iPhone deixar
      // arrancar sem gesto; o React só põe a propriedade.
      el.muted = true;
      el.defaultMuted = true;
      el.setAttribute("muted", "");
      el.setAttribute("playsinline", "");
    }

    const desistir = () => {
      if (!vivo) return;
      vivo = false;
      for (const el of videos) {
        el.pause();
        el.style.opacity = "0";
      }
      // Fica a fotografia. Desmonta-se depois do esbatimento.
      setTimeout(() => setLigado(false), PASSAGEM_MS);
    };

    const carregar = (el: HTMLVideoElement, i: number) => {
      el.preload = "auto";
      el.src = enderecoDoVideo(i, altura, formato);
      el.load();
    };

    const podeTocar = () => naTela && separadorVisivel;

    const tocar = (el: HTMLVideoElement) => {
      aTocar.add(el);
      if (!podeTocar()) return;
      const p = el.play();
      p?.catch((e: unknown) => {
        // Um `pause()` a meio do arranque dá AbortError: não é recusa.
        if ((e as { name?: string })?.name === "AbortError") return;
        desistir();
      });
    };

    const pararTudo = () => {
      for (const el of aTocar) el.pause();
    };
    const retomar = () => {
      if (!podeTocar()) return;
      for (const el of aTocar) tocar(el);
    };

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
      ouvir(el, "error", desistir);
      ouvir(el, "timeupdate", () => {
        if (el !== videos[atual] || aPassar) return;
        if (eHoraDePassar(el.currentTime, el.duration)) passar();
      });
    }

    // O primeiro: entra por cima da fotografia quando JÁ está a tocar.
    const primeiro = videos[0];
    ouvir(
      primeiro,
      "playing",
      () => {
        primeiro.style.zIndex = "2";
        primeiro.style.opacity = "1";
        if (!seguintePedido) {
          carregar(videos[1], proximoVideo(0));
          seguintePedido = true;
        }
      },
      true,
    );

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

    let cancelarIdle = () => {};
    comTecto(depoisDoZoom(raiz), 4000).then(() => {
      if (!vivo) return;
      cancelarIdle = onIdle(() => {
        if (!vivo) return;
        carregar(primeiro, 0);
        tocar(primeiro);
      });
    });

    return () => {
      vivo = false;
      cancelarIdle();
      io.disconnect();
      document.removeEventListener("visibilitychange", aoMudarSeparador);
      for (const f of limpar) f();
      for (const el of videos) {
        el.pause();
        el.removeAttribute("src");
        el.load();
      }
    };
  }, [ativo]);

  if (!ativo) return null;

  return (
    <div
      ref={caixa}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <video ref={v0} data-entrada-video={0} {...CAMADA} />
      <video ref={v1} data-entrada-video={1} {...CAMADA} />
    </div>
  );
}

/** O que os dois `<video>` têm em comum. */
const CAMADA = {
  muted: true,
  playsInline: true,
  disablePictureInPicture: true,
  disableRemotePlayback: true,
  preload: "none",
  tabIndex: -1,
  "aria-hidden": true,
  className: "absolute inset-0 h-full w-full object-cover",
  style: { opacity: 0, transform: ESCALA, transition: `opacity ${PASSAGEM_MS}ms ease` },
} as const;
