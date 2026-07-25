"use client";

import { useEffect } from "react";
import { usePublicPathname } from "@/lib/use-public-pathname";
import { onIdle } from "@/lib/onIdle";
import { heroImageUrl } from "@/lib/hero-image-loader";

/**
 * Warms the OTHER marketing pages' hero images in the background so navigating
 * to them shows the sharp photo immediately — no "blurred placeholder, then it
 * opens" gap.
 *
 * Why this works: the router prefetches a route's DATA, but not its hero image
 * binary, so on arrival the hero still had to fetch, and the blur placeholder
 * covered that gap. Here, once the current page is idle, we fetch each other
 * hero at the EXACT `/_img/<key>-<w>.webp` static URL that page's `<HeroImage>`
 * will request on THIS device — same src, same snapped width — so it lands in
 * the browser cache and the later request is an instant cache hit. These files
 * are pre-generated at build (scripts/pregen-heroes.mjs), so there's no encode
 * on the wire either.
 *
 * Deferred to idle (after the current page's LCP) and skipped on Save-Data /
 * 2g-3g so it never competes with the visitor's actual page.
 */

// Public route → its hero image source (kept in sync with each page's hero and
// with HERO_SOURCES in src/lib/hero-image-loader.ts).
const HERO_BY_ROUTE: Record<string, string> = {
  "/": "/imagens/JOAO_E_PEDRO_DJI_20250628213855_0002_D.jpg",
  "/sobre": "/imagens/hd-edited.jpg",
  "/servicos": "/imagens/EW1_1330.jpg",
  "/galeria": "/imagens/DaniGui_Preview20.jpg",
  "/contacto": "/imagens/DJI_20250913190635_0120_D.jpg",
  "/clientes": "/imagens/EW1_1393.jpg",
};

export default function HeroWarm() {
  const pathname = usePublicPathname();

  useEffect(() => {
    // Don't warm on the back office / quote flow, or the current page.
    if (pathname.startsWith("/orcamento")) return;
    // Respect data-saver / slow connections.
    const conn = (
      navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
    ).connection;
    if (conn?.saveData || (conn?.effectiveType && /(^|-)(2g|3g)$/.test(conn.effectiveType))) return;

    return onIdle(() => {
      const dpr = window.devicePixelRatio || 1;
      const target = window.innerWidth * dpr;
      for (const [route, src] of Object.entries(HERO_BY_ROUTE)) {
        if (route === pathname) continue; // this page's hero is already loading
        const img = new Image();
        img.decoding = "async";
        // Match the hero <HeroImage> loader output exactly (same snapped width).
        img.src = heroImageUrl(src, target);
      }
    });
  }, [pathname]);

  return null;
}
