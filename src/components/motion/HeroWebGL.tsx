"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

// The WebGL layer is client-only (ssr: false) and split into its own chunk, so
// the OGL runtime never ships in the initial payload and never blocks the LCP
// (which is the static <Image> beneath it). Users with reduced motion get
// nothing here — just the elegant still hero.
const HeroCanvas = dynamic(() => import("./HeroCanvas"), { ssr: false });

export default function HeroWebGL({ src, className }: { src: string; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <HeroCanvas src={src} className={className} />;
}
