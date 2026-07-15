"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

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
  if (typeof window === "undefined") return false;
  if (!window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches) return false;
  const nav = navigator as Navigator & {
    connection?: { saveData?: boolean; effectiveType?: string };
    deviceMemory?: number;
  };
  const c = nav.connection;
  if (c?.saveData) return false;
  if (c?.effectiveType && /2g|3g/.test(c.effectiveType)) return false;
  if (typeof nav.deviceMemory === "number" && nav.deviceMemory < 4) return false;
  return true;
}

export default function HeroWebGL({ src, className }: { src: string; className?: string }) {
  const reduced = useReducedMotion();
  // Decided after mount (navigator/matchMedia are client-only); the still hero
  // shows meanwhile, so a first-paint of `null` here is the intended state.
  const [welcome, setWelcome] = useState(false);
  useEffect(() => setWelcome(heavyEffectsWelcome()), []);
  if (reduced || !welcome) return null;
  return <HeroCanvas src={src} className={className} />;
}
