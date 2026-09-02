"use client";

import Image from "next/image";
import { useState, useEffect, useRef } from "react";
import { useImageErrorRef } from "./SafeImage";
import { clientLogos } from "@/data";
import { logoHeight, logoDimsFor, logoSizes } from "@/lib/logo";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";
import { useTranslations } from "./LocaleProvider";

/**
 * Scrolling band of client logos on the homepage. Logos are balanced optically
 * by area (see logoHeight) and width-capped so no wordmark runs away. Rendered
 * white over the dark band; a missing logo falls back to the client name.
 *
 * The list is duplicated for a seamless loop — the second copy is `aria-hidden`
 * so a screen reader reads each client once, not twice.
 */
function Mark({
  name,
  logo,
  duplicate = false,
}: {
  name: string;
  logo: string;
  duplicate?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const refErro = useImageErrorRef(() => setFailed(true));
  const hidden = duplicate ? { "aria-hidden": true as const } : {};

  if (failed || !logo) {
    return (
      <div className="flex-shrink-0 flex items-center h-8 sm:h-10" {...hidden}>
        <span className="text-foreground/68 text-[10px] sm:text-xs font-medium tracking-[0.2em] uppercase whitespace-nowrap">
          {name}
        </span>
      </div>
    );
  }

  const h = logoHeight(logo);
  const d = logoDimsFor(logo);

  return (
    <div className="flex-shrink-0 flex items-center justify-center h-8 sm:h-10" {...hidden}>
      <Image
        src={logo}
        alt={duplicate ? "" : name}
        width={d[0]}
        height={d[1]}
        // O `sizes` é POR LOGÓTIPO, não um valor único para a fita toda: a
        // altura é dada por área (logoHeight), portanto um logótipo alto e
        // estreito é desenhado a 28px e um wordmark fino a 170px. Declarar 170
        // para os dois fazia o browser ir buscar a mesma variante de 256px para
        // ambos — 27,8 KB para pintar 28px no caso do convento. Ver a nota
        // longa em src/lib/logo.ts; é a MESMA função que a parede usa, para os
        // três `<img>` do mesmo cliente em /clientes caírem no mesmo URL.
        sizes={logoSizes(logo)}
        // Rendered as flat black silhouettes (brightness-0), so encoder quality
        // is imperceptible — 50 just trims the bytes of every logo in the strip.
        quality={50}
        style={{ height: `${h}px` }}
        // Slimmer strip on every breakpoint: cap the logo height (max-h) so the
        // whole band reads as a fine line — 22px on a phone, 34px from sm+ (was
        // uncapped, which let the band grow much taller on desktop).
        className="w-auto max-h-[22px] sm:max-h-[34px] max-w-[120px] sm:max-w-[170px] object-contain opacity-100 transition-opacity duration-300 brightness-0"
        // O erro é ouvido pela `ref` e NÃO pelo `onError` do next/image.
        // Passar `onError` faz o next/image reatribuir `img.src = img.src` na
        // montagem (image-component.js:140) para ressuscitar um erro anterior à
        // hidratação; quando a hidratação apanha a imagem ainda a descarregar,
        // isso ABORTA o pedido em voo e manda outro. Medido em /clientes: os 18
        // logótipos pedidos duas vezes em 3 de 8 corridas, +163 KB. O
        // `useImageErrorRef` cobre o mesmo caso lendo o estado do elemento.
        ref={refErro}
      />
    </div>
  );
}

export default function ClientMarquee() {
  const { t } = useTranslations();
  const trackRef = useRef<HTMLDivElement>(null);
  // Persistent user control (WCAG 2.2.2 Pause, Stop, Hide): the band scrolls for
  // more than 5s, so a visitor must be able to stop it. Orthogonal to the
  // off-screen IntersectionObserver pause below — user pause is applied via an
  // inline animation-play-state, which wins over the observer's class either way.
  const [userPaused, setUserPaused] = useState(false);

  // Shuffle the logo order once per visit so a DIFFERENT set of clients leads
  // each time — otherwise the same first few always hold the prime, first-
  // visible slot and the rest are rarely seen before the visitor scrolls on.
  // Starts as the server order (SSR-safe: initial client render matches), then
  // reshuffles after mount; the marquee still cycles the full set within a view.
  const [order, setOrder] = useState(clientLogos);
  useEffect(() => {
    const a = [...clientLogos];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrder(a);
  }, []);

  // Pause the infinite scroll while the band is off-screen — no point
  // compositing a wide moving strip the user can't see (battery / GPU).
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    // Under prefers-reduced-motion the marquee animation is already `none`
    // (globals.css), so there's nothing to pause — skip the observer entirely
    // rather than run it to toggle a class that does nothing.
    if (prefersReducedMotion()) return;
    const io = new IntersectionObserver(
      ([e]) => el.classList.toggle("marquee-paused", !e.isIntersecting),
      { rootMargin: "150px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div className="relative py-3.5 sm:py-4 border-y border-foreground/8 overflow-hidden">
      {/* sr-only heading so heading-navigation users find the client band. */}
      <h2 className="sr-only">{t.nav.clientes}</h2>
      <div className="absolute inset-y-0 left-0 w-16 sm:w-24 bg-gradient-to-r from-surface to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-16 sm:w-24 bg-gradient-to-l from-surface to-transparent z-10 pointer-events-none" />
      <div
        ref={trackRef}
        className="flex items-center gap-12 sm:gap-16 animate-marquee whitespace-nowrap"
        style={userPaused ? { animationPlayState: "paused" } : undefined}
      >
        {/*
          A CHAVE É O CLIENTE, NÃO A POSIÇÃO — e isso vale bytes, não é estilo.
          A ordem é sorteada DEPOIS de montar (o efeito acima). Com `key={i}` o
          React não move nada: mantém os mesmos 38 `<img>` e limita-se a trocar
          o `src` de cada um. Cada troca ABORTA o pedido em voo daquele
          elemento e lança outro — os mesmos 19 logótipos, pedidos duas vezes.
          Medido em /clientes, 1440x900, cache fria, 8 corridas: 17 a 18 URLs
          repetidos em 3 delas, 1237 KB contra 1074 KB nas corridas limpas.
          Com a chave no nome do cliente, o React REORDENA os nós que já
          existem e nenhum `src` muda: 0 repetidos em 8 corridas.
          O sufixo distingue a segunda passagem da fita (a cópia `aria-hidden`
          que fecha o ciclo), senão haveria chaves iguais.
        */}
        {[...order, ...order].map((c, i) => (
          <Mark
            key={`${c.name}-${i >= order.length ? "eco" : "1"}`}
            name={c.name}
            logo={c.logo}
            duplicate={i >= order.length}
          />
        ))}
      </div>
      {/* Pause/resume control. Hidden from the reduced-motion path — there the
          band doesn't animate (globals.css), so there's nothing to pause. */}
      {/* MEDIDO a 375 px com toque emulado: 28×28 px. É o único comando desta
          banda e o que a WCAG 2.2.2 exige que exista para poder parar um
          movimento automático — um comando de pausa que não se acerta com o
          dedo é um comando que não existe.

          O `alvo-toque` fica no BOTÃO e o círculo desenhado passa para um
          `<span>` por dentro. Posto no próprio botão, o `min-width/height` de
          44 px inchava a bolinha para 44 px numa banda de 60 px de altura — o
          comando passava a ser a coisa maior de uma faixa que é para se ver de
          relance. Assim o alvo tem 44 e o desenho continua a ter 28. */}
      <button
        type="button"
        onClick={() => setUserPaused((p) => !p)}
        aria-pressed={userPaused}
        aria-label={userPaused ? t.common.retomarLogos : t.common.pausarLogos}
        // `pointer-coarse:bottom-0` porque a caixa de 44 px cresce à volta do
        // círculo: mantida em `bottom-1`, empurrava-o 8 px para dentro da
        // banda. A zero, o círculo fica a 8 px do fundo em vez de 4 — e o
        // botão inteiro fica DENTRO da banda (60 px de altura), que é o que
        // importa: esta banda é `overflow-hidden`, e o que saísse dela era
        // cortado, alvo incluído.
        className="alvo-toque group motion-reduce:hidden absolute bottom-1 right-2 z-20 flex items-center justify-center pointer-coarse:right-0 pointer-coarse:bottom-0"
      >
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full border border-foreground/15 bg-surface/80 text-foreground/60 backdrop-blur-sm transition-colors group-hover:border-foreground/30 group-hover:text-foreground/90"
          aria-hidden
        >
          <span className="text-[11px] leading-none">{userPaused ? "▶" : "❚❚"}</span>
        </span>
      </button>
    </div>
  );
}
