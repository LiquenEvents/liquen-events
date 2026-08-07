"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ════════════════════════════════════════════════════════════════════════════
 * QUANTO É QUE SE CARREGA À FRENTE DO DEDO
 * ════════════════════════════════════════════════════════════════════════════
 *
 * ── O problema, medido ────────────────────────────────────────────────────
 * A antecipação real da galeria estava presa em ~1100 px. Não porque a margem
 * do lazy-loading fosse pequena, mas porque **uma foto não pode ser pedida
 * antes de o mosaico dela existir**, e os mosaicos entravam no DOM com uma
 * margem fixa de 800 px. Na secretária isso deixava **35 fotografias pedidas
 * quando já estavam à vista** — sem margem nenhuma, ou seja, o buraco cinzento.
 *
 * ── Porque é que uma margem FIXA não pode servir ──────────────────────────
 * Uma margem em píxeis vale tempos diferentes conforme a velocidade:
 *
 *     1100 px a 1668 px/s (scroll contínuo) ....... 660 ms
 *     1100 px a 4000 px/s (um flick a sério) ...... 275 ms
 *
 * e uma fotografia precisa de ~300 ms mesmo depois de emagrecida. Ou seja: a
 * mesma margem que chega para quem lê chega tarde para quem procura. O que tem
 * de ser constante não é a distância — é o **tempo de aviso**.
 *
 * ── O que isto faz ────────────────────────────────────────────────────────
 * Mede a velocidade do scroll e devolve a margem em píxeis que dá sempre o
 * mesmo tempo de aviso, com dois limites:
 *
 *   • um PISO de 2 ecrãs, para quem está parado ou a ler devagar não ficar sem
 *     nada carregado à frente;
 *   • um TECTO de 6 ecrãs, porque a partir daí já não se está a antecipar —
 *     está-se a descarregar a galeria inteira, que é o oposto do objectivo.
 *
 * O valor sai em DEGRAUS (múltiplos inteiros da altura do ecrã), de propósito:
 * quem o consome usa-o num `rootMargin`, que obriga a criar um
 * `IntersectionObserver` novo a cada mudança. Um número contínuo criaria um
 * observador por frame de scroll.
 */

/** Tempo de aviso que se quer garantir, em segundos. */
const AVISO_S = 1.2;
/** Piso e tecto, em ecrãs. */
const MIN_ECRAS = 2;
const MAX_ECRAS = 6;

/**
 * Suavização exponencial da velocidade. Sem isto, um único frame lento (ou o
 * fim de um flick) fazia a margem saltar de 6 ecrãs para 2 e voltar, e cada
 * salto é um observador novo.
 */
const SUAVIZACAO = 0.25;

export interface Antecipacao {
  /** Margem a usar num `rootMargin`, em píxeis. Múltiplo da altura do ecrã. */
  margemPx: number;
  /** Quantos ecrãs são, para quem quiser mostrar ou testar. */
  ecras: number;
}

export function useAntecipacao(): Antecipacao {
  const [ecras, setEcras] = useState(MIN_ECRAS);
  const [altura, setAltura] = useState(0);
  const velocidadeRef = useRef(0);
  const anteriorRef = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setAltura(window.innerHeight);

    let pendente = false;
    const medir = () => {
      pendente = false;
      const agora = performance.now();
      const y = window.scrollY;
      const anterior = anteriorRef.current;
      anteriorRef.current = { y, t: agora };
      if (!anterior) return;
      const dt = (agora - anterior.t) / 1000;
      // Um intervalo demasiado curto divide por quase zero e produz
      // velocidades absurdas; um demasiado longo é uma pausa, não um scroll.
      if (dt < 0.016 || dt > 0.5) return;
      const instantanea = Math.abs(y - anterior.y) / dt;
      velocidadeRef.current = velocidadeRef.current * (1 - SUAVIZACAO) + instantanea * SUAVIZACAO;

      const h = window.innerHeight || 1;
      const querido = (velocidadeRef.current * AVISO_S) / h;
      const degrau = Math.min(MAX_ECRAS, Math.max(MIN_ECRAS, Math.ceil(querido)));
      setEcras((actual) => (actual === degrau ? actual : degrau));
    };

    const aoScroll = () => {
      if (pendente) return;
      pendente = true;
      requestAnimationFrame(medir);
    };
    const aoRedimensionar = () => setAltura(window.innerHeight);

    window.addEventListener("scroll", aoScroll, { passive: true });
    window.addEventListener("resize", aoRedimensionar);
    return () => {
      window.removeEventListener("scroll", aoScroll);
      window.removeEventListener("resize", aoRedimensionar);
    };
  }, []);

  return { margemPx: Math.round((altura || 800) * ecras), ecras };
}
