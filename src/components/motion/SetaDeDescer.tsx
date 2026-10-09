"use client";

import { useEffect, useRef } from "react";
import { prefersReducedMotion } from "@/lib/motion/useReducedMotion";

/**
 * A seta «descer» dos capítulos da página inicial (`.scroll-chevron`, um ciclo
 * infinito de 5 s).
 *
 * Pára quando sai do ecrã (auditoria externa, A5): a animação continuava a
 * correr em todos os capítulos, vistos ou não. A mesma regra que a faixa de
 * logótipos (`ClientMarquee`) e a parede de fotografias (`PhotoWall`) já
 * seguem — um `IntersectionObserver` e `animation-play-state: paused`
 * (`.seta-parada`, no globals.css). Sem JavaScript a seta anima como sempre;
 * com movimento reduzido não há animação nenhuma, e nem se observa.
 */
export default function SetaDeDescer({ className = "" }: { className?: string }) {
  const ref = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) =>
      el.classList.toggle("seta-parada", !e.isIntersecting),
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <svg
      ref={ref}
      aria-hidden
      width="28"
      height="18"
      viewBox="0 0 28 22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`scroll-chevron ${className}`}
    >
      <path d="M2 5 L14 17 L26 5" />
    </svg>
  );
}
