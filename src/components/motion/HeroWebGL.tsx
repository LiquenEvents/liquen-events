"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";
import { onIdle } from "@/lib/onIdle";

// The WebGL layer is client-only (ssr: false) and split into its own chunk, so
// the OGL runtime never ships in the initial payload and never blocks the LCP
// (which is the static <Image> beneath it). Users with reduced motion get
// nothing here — just the elegant still hero.
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

// Only mount the WebGL layer where it actually earns its cost: a pointer-fine
// desktop viewport with enough memory, and not on a metered / slow connection
// (Save-Data, or 2g/3g). On phones, low-memory devices and constrained networks
// the static hero <Image> stands alone — no wasted GPU, battery or bytes.
function heavyEffectsWelcome(): boolean {
  // WebGL hero layer disabled on all devices for maximum scroll fluidity — the
  // static hero <Image> beneath (which was always the LCP) stands alone, so the
  // desktop no longer pays the continuous GPU/render cost. Restore the
  // capability checks (viewport ≥1024 + pointer:fine + memory + connection) to
  // re-enable the effect on capable desktops.
  return false;
}

export default function HeroWebGL({ src, className }: { src: string; className?: string }) {
  const reduced = useReducedMotion();
  // Decided after mount (navigator/matchMedia are client-only); the still hero
  // shows meanwhile, so a first-paint of `null` here is the intended state.
  const [welcome, setWelcome] = useState(false);
  // Defer the capability check to browser idle, so the dynamic OGL import and
  // HeroCanvas's shader/context init don't land as one big main-thread task
  // during the post-navigation hydration burst (measured ~1.2s on desktop
  // /servicos). The static hero is already the LCP and shows meanwhile.
  useEffect(() => onIdle(() => setWelcome(heavyEffectsWelcome())), []);
  if (reduced || !welcome) return null;
  return <HeroCanvas src={src} className={className} />;
}
