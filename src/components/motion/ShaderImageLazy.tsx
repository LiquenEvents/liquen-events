"use client";

import dynamic from "next/dynamic";
import { useReducedMotion } from "@/lib/motion/useReducedMotion";

// Client-only, code-split WebGL — never in the initial payload, never blocks the
// LCP (the static <Image> underneath is that), and absent under reduced motion.
const ShaderImage = dynamic(() => import("./ShaderImage"), { ssr: false });

export default function ShaderImageLazy({ src, className }: { src: string; className?: string }) {
  const reduced = useReducedMotion();
  if (reduced) return null;
  return <ShaderImage src={src} className={className} />;
}
